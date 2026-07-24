"""LangGraph agent that answers a candidate's questions about a GitHub repo they've connected
(see app/services/github_service.py and app/api/v1/routers/github.py for the OAuth/repo-listing
side of this feature).

A repo's full source rarely fits in context, so unlike the other single-node agents in this
package, this one retrieves on demand: it lists the repo's files, asks the model which ones are
relevant to the latest question, fetches just those, then answers grounded in their contents.

Graph shape:
    START -> load_repo_tree -> select_files -> fetch_files -> repo_guide -> END
"""

import logging
from collections.abc import AsyncIterator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from app.agents.prompts import (
    GITHUB_FILE_SELECTION_PROMPT,
    GITHUB_REPO_GUIDE_SYSTEM_PROMPT,
    MEMORY_CONTEXT_HEADER,
    SUMMARY_CONTEXT_HEADER,
)
from app.core.config import GROQ_API_KEY, GROQ_MODEL
from app.services import github_service

logger = logging.getLogger(__name__)


class GithubRepoState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    memory: str
    summary: str
    repo_full_name: str
    access_token: str
    repo_tree: str
    selected_files: list[str]
    file_context: str


class _SelectedRepoFiles(BaseModel):
    paths: list[str] = Field(
        default_factory=list,
        description="Repo file paths, verbatim from REPO FILES, most relevant to the question.",
    )


_guide_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)
_selector_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0).with_structured_output(
    _SelectedRepoFiles
)


def _latest_human_content(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return message.content
    return ""


async def _load_repo_tree_node(state: GithubRepoState) -> dict:
    owner, repo = state["repo_full_name"].split("/", 1)
    try:
        paths = await github_service.get_repo_tree(state["access_token"], owner, repo)
    except Exception:
        logger.exception("Failed to fetch repo tree for %s", state["repo_full_name"])
        return {"repo_tree": ""}
    return {"repo_tree": "\n".join(paths)}


async def _select_files_node(state: GithubRepoState) -> dict:
    tree = state.get("repo_tree", "")
    if not tree:
        return {"selected_files": []}

    question = _latest_human_content(state["messages"])
    prompt = f"REPO FILES:\n{tree}\n\nQUESTION:\n{question}"
    result = await _selector_llm.ainvoke(
        [SystemMessage(content=GITHUB_FILE_SELECTION_PROMPT), HumanMessage(content=prompt)]
    )

    valid_paths = set(tree.splitlines())
    picked = [path for path in result.paths if path in valid_paths][: github_service.MAX_SELECTED_FILES]
    return {"selected_files": picked}


async def _fetch_files_node(state: GithubRepoState) -> dict:
    owner, repo = state["repo_full_name"].split("/", 1)
    sections = []
    for path in state.get("selected_files") or []:
        try:
            content = await github_service.get_file_content(state["access_token"], owner, repo, path)
        except Exception:
            logger.exception("Failed to fetch %s from %s", path, state["repo_full_name"])
            continue
        if content:
            sections.append(f"--- {path} ---\n{content}")
    return {"file_context": "\n\n".join(sections)}


async def _repo_guide_node(state: GithubRepoState) -> dict:
    system_prompt = GITHUB_REPO_GUIDE_SYSTEM_PROMPT.format(repo=state["repo_full_name"])

    if state.get("file_context"):
        system_prompt += f"\n\nRELEVANT FILES FROM THE REPO:\n{state['file_context']}"
    elif not state.get("repo_tree"):
        system_prompt += (
            "\n\n(Could not access the repository right now — say so plainly if the question needs its "
            "contents, and suggest trying again shortly.)"
        )
    else:
        system_prompt += (
            "\n\n(No file in the repo looked directly relevant to this question — answer from general "
            "knowledge of the repo's file listing if that's enough, otherwise ask the candidate to point "
            "you at a specific file or area.)"
        )

    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _guide_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


_graph_builder = StateGraph(GithubRepoState)
_graph_builder.add_node("load_repo_tree", _load_repo_tree_node)
_graph_builder.add_node("select_files", _select_files_node)
_graph_builder.add_node("fetch_files", _fetch_files_node)
_graph_builder.add_node("repo_guide", _repo_guide_node)
_graph_builder.add_edge(START, "load_repo_tree")
_graph_builder.add_edge("load_repo_tree", "select_files")
_graph_builder.add_edge("select_files", "fetch_files")
_graph_builder.add_edge("fetch_files", "repo_guide")
_graph_builder.add_edge("repo_guide", END)

github_repo_graph = _graph_builder.compile()


async def stream_github_repo_reply(
    history: list[BaseMessage],
    memory: str,
    summary: str,
    repo_full_name: str,
    access_token: str,
) -> AsyncIterator[str]:
    """Run the repo-chat graph over `history` and yield the guide's reply in chunks.

    Same contract as the other `stream_*_reply` functions (see code_explanation_agent.py) for
    `history`/`memory`/`summary`; `repo_full_name` ("owner/repo") and `access_token` (the
    candidate's decrypted GitHub token) scope the retrieval to their selected repo.
    """
    inputs = {
        "messages": history,
        "memory": memory,
        "summary": summary,
        "repo_full_name": repo_full_name,
        "access_token": access_token,
        "repo_tree": "",
        "selected_files": [],
        "file_context": "",
    }

    async for stream_mode, payload in github_repo_graph.astream(inputs, stream_mode=["messages"]):
        message_chunk, metadata = payload
        if metadata.get("langgraph_node") == "repo_guide" and message_chunk.content:
            yield message_chunk.content

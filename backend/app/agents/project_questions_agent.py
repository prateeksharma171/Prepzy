"""LangGraph agent that asks interview questions based specifically on a candidate's own
project code, never generic LeetCode-style DSA problems.

Graph shape:
    START -> project_coach -> END

Same as mock_interview_agent.py, there's no guard/refuse routing — a project-questions
conversation exists solely for this purpose, so every message in it is in-scope by
construction and a single node is enough.
"""

from collections.abc import AsyncIterator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents.prompts import MEMORY_CONTEXT_HEADER, PROJECT_QUESTIONS_SYSTEM_PROMPT, SUMMARY_CONTEXT_HEADER
from app.core.config import GROQ_API_KEY, GROQ_MODEL


class ProjectQuestionsState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Long-term memory: cross-conversation candidate profile (see app/services/memory_service.py).
    memory: str
    # Short-term memory: rolling summary of this conversation's older, trimmed-off messages.
    summary: str


_project_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)


async def _project_coach_node(state: ProjectQuestionsState) -> dict:
    system_prompt = PROJECT_QUESTIONS_SYSTEM_PROMPT
    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _project_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


_graph_builder = StateGraph(ProjectQuestionsState)
_graph_builder.add_node("project_coach", _project_coach_node)
_graph_builder.add_edge(START, "project_coach")
_graph_builder.add_edge("project_coach", END)

project_questions_graph = _graph_builder.compile()


async def stream_project_questions_reply(
    history: list[BaseMessage], memory: str = "", summary: str = ""
) -> AsyncIterator[str]:
    """Run the project-questions graph over `history` and yield the coach's reply in chunks.

    Same contract as `stream_interview_reply`/`stream_mock_interview_reply`: `history` must
    already end with the newest HumanMessage, trimmed to the recent window by the caller —
    `summary` covers whatever came before that, and `memory` is the candidate's long-term profile.
    """
    inputs = {"messages": history, "memory": memory, "summary": summary}

    async for stream_mode, payload in project_questions_graph.astream(inputs, stream_mode=["messages"]):
        message_chunk, metadata = payload
        if metadata.get("langgraph_node") == "project_coach" and message_chunk.content:
            yield message_chunk.content

"""LangGraph agent that explains a candidate's own code in plain, interview-ready language and
then checks their understanding of it with a follow-up question.

Graph shape:
    START -> code_explainer -> END

Same as mock_interview_agent.py, there's no guard/refuse routing — a code-explanation
conversation exists solely for this purpose, so every message in it is in-scope by
construction and a single node is enough.
"""

from collections.abc import AsyncIterator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents.prompts import CODE_EXPLANATION_SYSTEM_PROMPT, MEMORY_CONTEXT_HEADER, SUMMARY_CONTEXT_HEADER
from app.core.config import GROQ_API_KEY, GROQ_MODEL


class CodeExplanationState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Long-term memory: cross-conversation candidate profile (see app/services/memory_service.py).
    memory: str
    # Short-term memory: rolling summary of this conversation's older, trimmed-off messages.
    summary: str


_explainer_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)


async def _code_explainer_node(state: CodeExplanationState) -> dict:
    system_prompt = CODE_EXPLANATION_SYSTEM_PROMPT
    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _explainer_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


_graph_builder = StateGraph(CodeExplanationState)
_graph_builder.add_node("code_explainer", _code_explainer_node)
_graph_builder.add_edge(START, "code_explainer")
_graph_builder.add_edge("code_explainer", END)

code_explanation_graph = _graph_builder.compile()


async def stream_code_explanation_reply(
    history: list[BaseMessage], memory: str = "", summary: str = ""
) -> AsyncIterator[str]:
    """Run the code-explanation graph over `history` and yield the reply in chunks.

    Same contract as `stream_interview_reply`/`stream_mock_interview_reply`: `history` must
    already end with the newest HumanMessage, trimmed to the recent window by the caller —
    `summary` covers whatever came before that, and `memory` is the candidate's long-term profile.
    """
    inputs = {"messages": history, "memory": memory, "summary": summary}

    async for stream_mode, payload in code_explanation_graph.astream(inputs, stream_mode=["messages"]):
        message_chunk, metadata = payload
        if metadata.get("langgraph_node") == "code_explainer" and message_chunk.content:
            yield message_chunk.content

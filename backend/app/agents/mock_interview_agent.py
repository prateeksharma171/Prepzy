"""LangGraph agent that runs a live mock interview, playing the INTERVIEWER role.

Graph shape:
    START -> interviewer -> END

Unlike interview_agent.py's coach graph, there's no guard/refuse routing here — a
mock-interview conversation exists solely to run this simulation, so every message in it is
in-scope by construction and a single node is enough.
"""

from collections.abc import AsyncIterator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents.prompts import MEMORY_CONTEXT_HEADER, MOCK_INTERVIEW_SYSTEM_PROMPT, SUMMARY_CONTEXT_HEADER
from app.core.config import GROQ_API_KEY, GROQ_MODEL


class MockInterviewState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Long-term memory: cross-conversation candidate profile (see app/services/memory_service.py).
    memory: str
    # Short-term memory: rolling summary of this conversation's older, trimmed-off messages.
    summary: str


_interviewer_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)


async def _interviewer_node(state: MockInterviewState) -> dict:
    system_prompt = MOCK_INTERVIEW_SYSTEM_PROMPT
    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _interviewer_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


_graph_builder = StateGraph(MockInterviewState)
_graph_builder.add_node("interviewer", _interviewer_node)
_graph_builder.add_edge(START, "interviewer")
_graph_builder.add_edge("interviewer", END)

mock_interview_graph = _graph_builder.compile()


async def stream_mock_interview_reply(
    history: list[BaseMessage], memory: str = "", summary: str = ""
) -> AsyncIterator[str]:
    """Run the mock-interview graph over `history` and yield the interviewer's reply in chunks.

    Same contract as `stream_interview_reply` (interview_agent.py): `history` must already end
    with the newest HumanMessage, trimmed to the recent window by the caller — `summary` covers
    whatever came before that, and `memory` is the candidate's long-term profile.
    """
    inputs = {"messages": history, "memory": memory, "summary": summary}

    async for stream_mode, payload in mock_interview_graph.astream(inputs, stream_mode=["messages"]):
        message_chunk, metadata = payload
        if metadata.get("langgraph_node") == "interviewer" and message_chunk.content:
            yield message_chunk.content

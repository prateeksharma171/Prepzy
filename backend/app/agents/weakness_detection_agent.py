"""LangGraph agent that identifies the parts of a candidate's project they're most likely to
struggle explaining in an interview, then drills exactly those spots.

Graph shape:
    START -> weakness_coach -> END

Same as mock_interview_agent.py, there's no guard/refuse routing — a weakness-detection
conversation exists solely for this purpose, so every message in it is in-scope by
construction and a single node is enough.
"""

from collections.abc import AsyncIterator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents.prompts import MEMORY_CONTEXT_HEADER, SUMMARY_CONTEXT_HEADER, WEAKNESS_DETECTION_SYSTEM_PROMPT
from app.core.config import GROQ_API_KEY, GROQ_MODEL


class WeaknessDetectionState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Long-term memory: cross-conversation candidate profile (see app/services/memory_service.py).
    memory: str
    # Short-term memory: rolling summary of this conversation's older, trimmed-off messages.
    summary: str


_weakness_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)


async def _weakness_coach_node(state: WeaknessDetectionState) -> dict:
    system_prompt = WEAKNESS_DETECTION_SYSTEM_PROMPT
    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _weakness_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


_graph_builder = StateGraph(WeaknessDetectionState)
_graph_builder.add_node("weakness_coach", _weakness_coach_node)
_graph_builder.add_edge(START, "weakness_coach")
_graph_builder.add_edge("weakness_coach", END)

weakness_detection_graph = _graph_builder.compile()


async def stream_weakness_detection_reply(
    history: list[BaseMessage], memory: str = "", summary: str = ""
) -> AsyncIterator[str]:
    """Run the weakness-detection graph over `history` and yield the reply in chunks.

    Same contract as `stream_interview_reply`/`stream_mock_interview_reply`: `history` must
    already end with the newest HumanMessage, trimmed to the recent window by the caller —
    `summary` covers whatever came before that, and `memory` is the candidate's long-term profile.
    """
    inputs = {"messages": history, "memory": memory, "summary": summary}

    async for stream_mode, payload in weakness_detection_graph.astream(inputs, stream_mode=["messages"]):
        message_chunk, metadata = payload
        if metadata.get("langgraph_node") == "weakness_coach" and message_chunk.content:
            yield message_chunk.content

"""LangGraph agent that reviews a candidate's resume and, on request, rewrites it as ATS-safe
LaTeX, stating an estimated ATS compatibility score before and after.

Graph shape:
    START -> resume_coach -> END

Same as mock_interview_agent.py, there's no guard/refuse routing — a resume-review
conversation exists solely for this purpose, so every message in it is in-scope by
construction and a single node is enough.
"""

from collections.abc import AsyncIterator
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents.prompts import MEMORY_CONTEXT_HEADER, RESUME_REVIEW_SYSTEM_PROMPT, SUMMARY_CONTEXT_HEADER
from app.core.config import GROQ_API_KEY, GROQ_MODEL


class ResumeReviewState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    # Long-term memory: cross-conversation candidate profile (see app/services/memory_service.py).
    memory: str
    # Short-term memory: rolling summary of this conversation's older, trimmed-off messages.
    summary: str


_resume_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)


async def _resume_coach_node(state: ResumeReviewState) -> dict:
    system_prompt = RESUME_REVIEW_SYSTEM_PROMPT
    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _resume_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


_graph_builder = StateGraph(ResumeReviewState)
_graph_builder.add_node("resume_coach", _resume_coach_node)
_graph_builder.add_edge(START, "resume_coach")
_graph_builder.add_edge("resume_coach", END)

resume_review_graph = _graph_builder.compile()


async def stream_resume_review_reply(
    history: list[BaseMessage], memory: str = "", summary: str = ""
) -> AsyncIterator[str]:
    """Run the resume-review graph over `history` and yield the coach's reply in chunks.

    Same contract as `stream_interview_reply`/`stream_mock_interview_reply`: `history` must
    already end with the newest HumanMessage, trimmed to the recent window by the caller —
    `summary` covers whatever came before that, and `memory` is the candidate's long-term profile.
    """
    inputs = {"messages": history, "memory": memory, "summary": summary}

    async for stream_mode, payload in resume_review_graph.astream(inputs, stream_mode=["messages"]):
        message_chunk, metadata = payload
        if metadata.get("langgraph_node") == "resume_coach" and message_chunk.content:
            yield message_chunk.content

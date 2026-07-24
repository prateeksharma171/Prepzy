"""LangGraph agent that coaches users for job interviews and refuses anything else.

Graph shape:
    START -> guard -> (interview_coach | refuse) -> END

`guard` classifies whether the latest user message is about interview
preparation. In-scope messages are routed to `interview_coach`, which answers
with a fully-guided, detailed, markdown-formatted response (code always in
fenced blocks). Out-of-scope messages are routed to `refuse`, which returns a
fixed, on-brand refusal without spending an LLM call.
"""

from collections.abc import AsyncIterator
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

from app.agents.prompts import (
    COACH_SYSTEM_PROMPT,
    GUARD_SYSTEM_PROMPT,
    MEMORY_CONTEXT_HEADER,
    REFUSAL_MESSAGE,
    SUMMARY_CONTEXT_HEADER,
)
from app.core.config import GROQ_API_KEY, GROQ_GUARD_MODEL, GROQ_MODEL


class ScopeDecision(BaseModel):
    in_scope: bool = Field(description="Whether the latest user message is about interview preparation.")


class InterviewState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    in_scope: bool
    # Long-term memory: cross-conversation candidate profile (see app/services/memory_service.py).
    memory: str
    # Short-term memory: rolling summary of this conversation's older, trimmed-off messages.
    summary: str


_guard_llm = ChatGroq(model=GROQ_GUARD_MODEL, api_key=GROQ_API_KEY, temperature=0).with_structured_output(
    ScopeDecision
)
_coach_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.4)


async def _guard_node(state: InterviewState) -> dict:
    # Last few turns are enough context to classify the newest message; keeps the
    # guard call small and fast.
    context_messages = state["messages"][-8:]
    decision = await _guard_llm.ainvoke([SystemMessage(content=GUARD_SYSTEM_PROMPT), *context_messages])
    return {"in_scope": decision.in_scope}


def _route_after_guard(state: InterviewState) -> Literal["interview_coach", "refuse"]:
    return "interview_coach" if state["in_scope"] else "refuse"


async def _coach_node(state: InterviewState) -> dict:
    system_prompt = COACH_SYSTEM_PROMPT
    if state.get("memory"):
        system_prompt += f"\n\n{MEMORY_CONTEXT_HEADER}\n{state['memory']}"
    if state.get("summary"):
        system_prompt += f"\n\n{SUMMARY_CONTEXT_HEADER}\n{state['summary']}"

    response = await _coach_llm.ainvoke([SystemMessage(content=system_prompt), *state["messages"]])
    return {"messages": [response]}


async def _refuse_node(state: InterviewState) -> dict:
    return {"messages": [AIMessage(content=REFUSAL_MESSAGE)]}


_graph_builder = StateGraph(InterviewState)
_graph_builder.add_node("guard", _guard_node)
_graph_builder.add_node("interview_coach", _coach_node)
_graph_builder.add_node("refuse", _refuse_node)
_graph_builder.add_edge(START, "guard")
_graph_builder.add_conditional_edges(
    "guard", _route_after_guard, {"interview_coach": "interview_coach", "refuse": "refuse"}
)
_graph_builder.add_edge("interview_coach", END)
_graph_builder.add_edge("refuse", END)

interview_graph = _graph_builder.compile()


async def stream_interview_reply(
    history: list[BaseMessage], memory: str = "", summary: str = ""
) -> AsyncIterator[str]:
    """Run the interview-coach graph over `history` and yield the assistant's reply in chunks.

    `history` must end with the newest HumanMessage, and is expected to already be trimmed to the
    recent window by the caller — `summary` covers whatever came before that. `memory` is the
    candidate's long-term profile, shared across all of their conversations. Coach replies stream
    token by token straight from the LLM; refusals (no LLM call involved) are yielded once as a
    single chunk.
    """
    inputs = {"messages": history, "in_scope": True, "memory": memory, "summary": summary}
    refusal_sent = False

    async for stream_mode, payload in interview_graph.astream(inputs, stream_mode=["messages", "updates"]):
        if stream_mode == "messages":
            message_chunk, metadata = payload
            if metadata.get("langgraph_node") == "interview_coach" and message_chunk.content:
                yield message_chunk.content
        elif stream_mode == "updates" and isinstance(payload, dict) and "refuse" in payload and not refusal_sent:
            refusal_sent = True
            yield payload["refuse"]["messages"][-1].content

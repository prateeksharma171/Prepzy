"""LLM calls that maintain the two memory layers for the interview coach.

- `extract_user_memory`: folds one exchange into the candidate's cross-conversation profile
  (permanent details + rolling recent-context memory).
- `summarize_conversation`: folds aged-out messages into a single conversation's rolling summary.

Both run as best-effort background steps after a reply has already been streamed to the user (see
app/api/v1/routers/interview.py) — they never block or affect the coach's response itself.
"""

from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

from app.agents.prompts import CONVERSATION_SUMMARY_PROMPT, USER_MEMORY_EXTRACTION_PROMPT
from app.core.config import GROQ_API_KEY, GROQ_MODEL

# Low temperature: these calls should faithfully compress/merge text, not write creatively.
_memory_llm = ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY, temperature=0.2)


class PermanentDetailsUpdate(BaseModel):
    name: str | None = Field(default=None, description="Only if explicitly stated this turn.")
    age: str | None = Field(default=None, description="Only if explicitly stated this turn.")
    country: str | None = Field(default=None, description="Only if explicitly stated this turn.")
    profession: str | None = Field(default=None, description="Only if explicitly stated this turn.")
    long_term_goals: list[str] = Field(default_factory=list, description="New goals stated this turn only.")
    preferences: list[str] = Field(default_factory=list, description="New coaching preferences stated this turn only.")


class MemoryExtraction(BaseModel):
    permanent_updates: PermanentDetailsUpdate
    new_summary_item: str | None = Field(
        default=None, description="Short rolling-memory note, or null if nothing noteworthy happened."
    )


_extraction_llm = _memory_llm.with_structured_output(MemoryExtraction)


async def extract_user_memory(existing_memory: dict[str, Any], user_message: str, assistant_reply: str) -> MemoryExtraction:
    prompt = (
        f"EXISTING MEMORY:\n{existing_memory}\n\n"
        f"LATEST EXCHANGE:\nCandidate: {user_message}\nCoach: {assistant_reply}"
    )
    return await _extraction_llm.ainvoke(
        [SystemMessage(content=USER_MEMORY_EXTRACTION_PROMPT), HumanMessage(content=prompt)]
    )


async def summarize_conversation(existing_summary: str, new_messages: list[BaseMessage]) -> str:
    transcript = "\n".join(
        f"{'Candidate' if isinstance(m, HumanMessage) else 'Coach'}: {m.content}" for m in new_messages
    )
    prompt = f"EXISTING SUMMARY:\n{existing_summary or '(empty)'}\n\nNEW MESSAGES:\n{transcript}"
    response = await _memory_llm.ainvoke(
        [SystemMessage(content=CONVERSATION_SUMMARY_PROMPT), HumanMessage(content=prompt)]
    )
    return response.content.strip()

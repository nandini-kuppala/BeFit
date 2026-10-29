import asyncio
import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentProfile, CurrentUser, ai_quota, targets_on
from app.core.clock import local_today
from app.models.chat import ChatMessage, ChatThread
from app.models.logs import FoodLog
from app.services import gemini
from app.services.coach import SUGGESTED_PROMPTS, build_system_prompt

router = APIRouter(prefix="/chat", tags=["coach"])

# Threads are one document; bound them well under Mongo's 16 MB ceiling. Only
# the last dozen turns are ever sent to the model anyway.
MAX_STORED_MESSAGES = 200


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: PydanticObjectId | None = None


class MessageResponse(BaseModel):
    thread_id: str
    reply: str
    messages: list[ChatMessage]


class ThreadSummary(BaseModel):
    id: str
    title: str
    updated_at: dt.datetime
    message_count: int
    preview: str


@router.get("/suggestions", response_model=list[str])
async def suggestions(user: CurrentUser) -> list[str]:
    return SUGGESTED_PROMPTS


@router.get("/threads", response_model=list[ThreadSummary])
async def threads(
    user: CurrentUser, limit: int = Query(default=30, ge=1, le=100)
) -> list[ThreadSummary]:
    """Summaries only — the full transcripts are fetched one at a time."""
    rows = (
        await ChatThread.find(ChatThread.user_id == user.id)
        .sort(-ChatThread.updated_at)
        .limit(limit)
        .to_list()
    )
    return [
        ThreadSummary(
            id=str(row.id),
            title=row.title,
            updated_at=row.updated_at,
            message_count=len(row.messages),
            preview=(row.messages[-1].content[:120] if row.messages else ""),
        )
        for row in rows
    ]


async def _owned(user_id: PydanticObjectId, thread_id: PydanticObjectId) -> ChatThread:
    found = await ChatThread.get(thread_id)
    if found is None or found.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return found


@router.get("/threads/{thread_id}", response_model=ChatThread)
async def thread(user: CurrentUser, thread_id: PydanticObjectId) -> ChatThread:
    return await _owned(user.id, thread_id)


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(user: CurrentUser, thread_id: PydanticObjectId) -> None:
    await (await _owned(user.id, thread_id)).delete()


@router.post("", response_model=MessageResponse, dependencies=[ai_quota(15, 60)])
async def send(
    user: CurrentUser,
    profile: CurrentProfile,
    body: MessageRequest,
) -> MessageResponse:
    thread: ChatThread | None = None
    if body.thread_id:
        thread = await _owned(user.id, body.thread_id)

    today = local_today()
    # The coach answers against what she actually ate today, not in a vacuum.
    logs, targets = await asyncio.gather(
        FoodLog.find(FoodLog.user_id == user.id, FoodLog.date == today).to_list(),
        targets_on(user.id, today),
    )
    system_prompt = await build_system_prompt(profile, targets, logs)

    history = (
        [{"role": m.role, "content": m.content} for m in thread.messages] if thread else []
    )
    try:
        reply = await gemini.chat(system_prompt, history, body.message)
    except gemini.CoachUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The coach couldn't be reached just now. Try again in a moment.",
        ) from None

    if thread is None:
        # First question makes a serviceable title. Created only once there is
        # an answer, so a failed first message leaves no empty thread behind.
        thread = ChatThread(user_id=user.id, title=body.message[:60])
    thread.messages.append(ChatMessage(role="user", content=body.message))
    thread.messages.append(ChatMessage(role="assistant", content=reply or "…"))
    thread.messages = thread.messages[-MAX_STORED_MESSAGES:]
    thread.updated_at = dt.datetime.now(dt.UTC)
    await thread.save()

    return MessageResponse(thread_id=str(thread.id), reply=reply, messages=thread.messages)

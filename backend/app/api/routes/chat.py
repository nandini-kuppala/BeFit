import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import ActiveTargets, CurrentProfile, CurrentUser
from app.models.chat import ChatMessage, ChatThread
from app.models.logs import FoodLog
from app.services import gemini
from app.services.coach import SUGGESTED_PROMPTS, build_system_prompt

router = APIRouter(prefix="/chat", tags=["coach"])


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: PydanticObjectId | None = None


class MessageResponse(BaseModel):
    thread_id: str
    reply: str
    messages: list[ChatMessage]


@router.get("/suggestions", response_model=list[str])
async def suggestions(user: CurrentUser) -> list[str]:
    return SUGGESTED_PROMPTS


@router.get("/threads", response_model=list[ChatThread])
async def threads(user: CurrentUser, limit: int = 20) -> list[ChatThread]:
    return (
        await ChatThread.find(ChatThread.user_id == user.id)
        .sort(-ChatThread.updated_at)
        .limit(limit)
        .to_list()
    )


@router.get("/threads/{thread_id}", response_model=ChatThread)
async def thread(user: CurrentUser, thread_id: PydanticObjectId) -> ChatThread:
    found = await ChatThread.get(thread_id)
    if found is None or found.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return found


@router.post("", response_model=MessageResponse)
async def send(
    user: CurrentUser,
    profile: CurrentProfile,
    targets: ActiveTargets,
    body: MessageRequest,
) -> MessageResponse:
    thread: ChatThread | None = None
    if body.thread_id:
        thread = await ChatThread.get(body.thread_id)
        if thread is not None and thread.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    if thread is None:
        thread = ChatThread(
            user_id=user.id,
            # First question makes a serviceable title.
            title=body.message[:60],
        )
        await thread.insert()

    # The coach answers against what she actually ate today, not in a vacuum.
    today = await FoodLog.find(
        FoodLog.user_id == user.id, FoodLog.date == dt.date.today()
    ).to_list()
    system_prompt = await build_system_prompt(profile, targets, today)

    history = [{"role": m.role, "content": m.content} for m in thread.messages]
    reply = await gemini.chat(system_prompt, history, body.message)

    thread.messages.append(ChatMessage(role="user", content=body.message))
    thread.messages.append(ChatMessage(role="assistant", content=reply))
    thread.updated_at = dt.datetime.now(dt.UTC)
    await thread.save()

    return MessageResponse(
        thread_id=str(thread.id), reply=reply, messages=thread.messages
    )

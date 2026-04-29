from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.auth import users_router
from app.api.channels import router as channels_router
from app.api.instances import router as instances_router
from app.api.sync import router as sync_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(
    title="NewAPI Channel Sync",
    version="0.1.0",
    description="管理项目侧渠道，并通过 NewAPI 用户 MCP 单向同步到多个 NewAPI 实例。",
    lifespan=lifespan,
)

settings = get_settings()
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(instances_router)
app.include_router(channels_router)
app.include_router(sync_router)

from datetime import datetime

from pydantic import BaseModel


class GithubConnectionOut(BaseModel):
    connected: bool
    github_username: str | None = None
    connected_at: datetime | None = None


class GithubRepoOut(BaseModel):
    id: int
    full_name: str
    name: str
    private: bool
    description: str | None = None
    default_branch: str
    updated_at: datetime


class GithubRepoListOut(BaseModel):
    items: list[GithubRepoOut]
    has_more: bool

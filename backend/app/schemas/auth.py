import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


class SignupRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, max_length=255)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not USERNAME_PATTERN.match(value):
            raise ValueError("Username may only contain letters, digits, and underscores")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 bytes")
        if not any(c.islower() for c in value):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isupper() for c in value):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one digit")
        return value


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, description="Email or username")
    password: str = Field(min_length=1)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1, description="Google Identity Services ID token")


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    first_name: str | None
    last_name: str | None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}

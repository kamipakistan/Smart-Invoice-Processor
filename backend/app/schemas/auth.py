import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class UserOut(BaseModel):
    id: int
    username: str
    is_active: bool
    last_login_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)

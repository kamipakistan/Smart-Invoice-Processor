import jwt
import datetime
from typing import Dict, Any, Optional
from app.config import settings

def create_access_token(user_id: int, username: str) -> str:
    """
    Creates a short-lived access token (default 15 mins).
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    expire = now + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    payload = {
        "sub": str(user_id),
        "username": username,
        "type": "access",
        "iat": now,
        "exp": expire
    }
    encoded_jwt = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(user_id: int, username: str) -> str:
    """
    Creates a longer-lived refresh token (default 7 days).
    Intended to be stored as an httpOnly cookie.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    expire = now + datetime.timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    payload = {
        "sub": str(user_id),
        "username": username,
        "type": "refresh",
        "iat": now,
        "exp": expire
    }
    encoded_jwt = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_token(token: str, expected_type: Optional[str] = "access") -> Dict[str, Any]:
    """
    Decodes and validates a JWT token. Raises ValueError or PyJWTError if invalid or expired.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as e:
        raise ValueError(f"Invalid token signature or expiration: {str(e)}")
    
    if expected_type and payload.get("type") != expected_type:
        raise ValueError(f"Token type mismatch: expected {expected_type}, got {payload.get('type')}")
        
    return payload

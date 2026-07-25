import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_async_db
from app.config import settings, get_pkt_now
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services.auth_service import verify_password
from app.services.token_service import create_access_token, create_refresh_token, decode_token
from app.services.logger_service import logger_service
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)

@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.LOGIN_RATE_LIMIT)
async def login(
    request: Request,
    login_data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Login endpoint with rate limiting (slowapi) and 5-attempt account lockout.
    Returns access token in body and sets refresh token in httpOnly cookie.
    """
    result = await db.execute(select(User).where(User.username == login_data.username))
    user = result.scalars().first()

    now = get_pkt_now()

    # Check account lockout
    if user and user.locked_until and user.locked_until > now:
        remaining_mins = int((user.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Account temporarily locked due to too many failed login attempts. Try again in {remaining_mins} minutes."
        )

    # Verify password
    if not user or not verify_password(login_data.password, user.hashed_password):
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.LOGIN_LOCKOUT_ATTEMPTS:
                user.locked_until = now + datetime.timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
                await logger_service.log_async(
                    event="USER_LOCKOUT",
                    level="WARNING",
                    category="AUTH",
                    message=f"User '{user.username}' locked out for {settings.LOGIN_LOCKOUT_MINUTES} minutes after {settings.LOGIN_LOCKOUT_ATTEMPTS} failed attempts.",
                    db_session=db
                )
            else:
                await logger_service.log_async(
                    event="USER_LOGIN_FAILED",
                    level="WARNING",
                    category="AUTH",
                    message=f"Failed login attempt for user '{user.username}' (Attempt {user.failed_login_attempts}/{settings.LOGIN_LOCKOUT_ATTEMPTS}).",
                    db_session=db
                )
            await db.commit()
        else:
            await logger_service.log_async(
                event="USER_LOGIN_FAILED",
                level="WARNING",
                category="AUTH",
                message=f"Failed login attempt for non-existent username '{login_data.username}'.",
                db_session=db
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or disabled."
        )

    # Success: reset failed attempts and unlock if applicable
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    await db.commit()

    await logger_service.log_async(
        event="USER_LOGIN",
        level="INFO",
        category="AUTH",
        message=f"User '{user.username}' successfully logged in.",
        db_session=db
    )

    access_token = create_access_token(user.id, user.username)
    refresh_token = create_refresh_token(user.id, user.username)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/"
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Validates refresh token cookie and issues a new access token (and rotates refresh token).
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token found in cookies."
        )

    try:
        payload = decode_token(token, expected_type="refresh")
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise ValueError("Missing subject claim in token.")
        user_id = int(user_id_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token."
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with refresh token is invalid or inactive."
        )

    now = get_pkt_now()
    if user.locked_until and user.locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is currently locked."
        )

    # Issue new tokens (Token Rotation)
    new_access_token = create_access_token(user.id, user.username)
    new_refresh_token = create_refresh_token(user.id, user.username)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/"
    )

    await logger_service.log_async(
        event="USER_TOKEN_REFRESH",
        level="INFO",
        category="AUTH",
        message=f"Session token refreshed for user '{user.username}'.",
        db_session=db
    )

    return TokenResponse(
        access_token=new_access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Clears the refresh token cookie and logs the logout event.
    """
    token = request.cookies.get("refresh_token")
    username = "unknown"
    if token:
        try:
            payload = decode_token(token, expected_type="refresh")
            username = payload.get("username", "unknown")
        except Exception:
            pass

    response.delete_cookie(
        key="refresh_token",
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict"
    )

    await logger_service.log_async(
        event="USER_LOGOUT",
        level="INFO",
        category="AUTH",
        message=f"User '{username}' logged out.",
        db_session=db
    )

    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    """
    Returns current authenticated user information.
    """
    return current_user

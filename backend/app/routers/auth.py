"""Authentication router: registration, login, and current user profile."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db, utcnow
from ..models import User
from ..schemas import AuthResponse, UserLoginRequest, UserOut, UserRegisterRequest, UserUpdateRequest

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account with email, password, and display name."""
    clean_email = payload.email.lower().strip()
    clean_name = payload.display_name.strip()

    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address.",
        )

    # Check for existing email
    existing = db.scalar(select(User).where(User.email == clean_email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in.",
        )

    # Create new user
    hashed = hash_password(payload.password)
    user = User(
        email=clean_email,
        password_hash=hashed,
        display_name=clean_name,
        created_at=utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate token
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "name": user.display_name,
    })

    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email and password to receive a JWT access token."""
    clean_email = payload.email.lower().strip()
    user = db.scalar(select(User).where(User.email == clean_email))

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please verify your credentials.",
        )

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "name": user.display_name,
    })

    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    """Return the profile of the currently logged-in user."""
    return UserOut.model_validate(user)


@router.put("/profile", response_model=UserOut)
def update_profile(
    payload: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update profile attributes for the logged-in user."""
    if payload.display_name and payload.display_name.strip():
        user.display_name = payload.display_name.strip()
        db.commit()
        db.refresh(user)

    return UserOut.model_validate(user)

import asyncio
import argparse
import getpass
import sys
from pathlib import Path

# Add backend directory to path so app modules can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy.future import select
from app.database import AsyncSessionLocal, async_engine, Base
import app.models  # Register all models with Base
from app.models.user import User
from app.services.auth_service import hash_password

async def seed_user(username: str, password: str):
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username))
        existing_user = result.scalars().first()

        if existing_user:
            print(f"User '{username}' already exists. Updating password and activating account...")
            existing_user.hashed_password = hash_password(password)
            existing_user.is_active = True
            existing_user.failed_login_attempts = 0
            existing_user.locked_until = None
            await db.commit()
            print(f"User '{username}' successfully updated.")
        else:
            print(f"Creating new user '{username}'...")
            new_user = User(
                username=username,
                hashed_password=hash_password(password),
                is_active=True,
                failed_login_attempts=0,
                locked_until=None
            )
            db.add(new_user)
            await db.commit()
            print(f"User '{username}' successfully created.")

def main():
    parser = argparse.ArgumentParser(description="Seed or reset admin user for Smart Invoice Processor.")
    parser.add_argument("--username", "-u", default="admin", help="Username for the admin account (default: admin)")
    parser.add_argument("--password", "-p", default=None, help="Password for the account (if omitted, prompts securely)")

    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass(prompt=f"Enter password for user '{args.username}': ")
        if not password:
            print("Error: Password cannot be empty.", file=sys.stderr)
            sys.exit(1)
        confirm = getpass.getpass(prompt="Confirm password: ")
        if password != confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    asyncio.run(seed_user(args.username, password))

if __name__ == "__main__":
    main()

# Smart-Invoice-Processor

An AI-powered, human-in-the-loop invoice processing pipeline built with FastAPI, Celery, Redis, MinIO, PostgreSQL, and React + TypeScript.

## Authentication & Account Provisioning

Smart-Invoice-Processor uses a **login-only authentication system** with no public registration endpoints. All API routes and frontend views are protected.

### Seeding an Admin Account

To provision or reset the initial admin account, run the seed script from the project root:

```bash
python3 backend/create_admin.py --username admin
```

You will be prompted securely to enter and confirm a password. Alternatively, in automated deployment environments, you can pass `--password <your_password>`.

### Security Features
- **Bcrypt Password Hashing**: Passwords are securely hashed with bcrypt.
- **Token Security**: Short-lived access tokens (default 15 mins) are stored in React state/memory only (no localStorage/sessionStorage XSS vulnerability). Long-lived refresh tokens (default 7 days) are stored in httpOnly, Secure cookies.
- **Account Lockout & Rate Limiting**: The login endpoint is rate-limited (default 10 req/min/IP). 5 consecutive failed login attempts automatically lock the account for 15 minutes.

#!/usr/bin/env python3
"""
Setup and Diagnostics Script for Smart Invoice Processor (SIP)
Sets up PostgreSQL schema, MinIO storage buckets, Redis ping, and AI provider diagnostics.
"""

import os
import sys
import subprocess
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

def log(msg, level="*"):
    print(f"[{level}] {msg}")

def ensure_env():
    env_file = os.path.join(SCRIPT_DIR, ".env")
    env_example = os.path.join(SCRIPT_DIR, ".env.example")
    if not os.path.exists(env_file) and os.path.exists(env_example):
        log("Creating .env from .env.example...", "+")
        with open(env_example, "r") as src, open(env_file, "w") as dst:
            dst.write(src.read())

def run_phase2_diagnostics():
    sys.path.insert(0, os.path.join(SCRIPT_DIR, "backend"))
    from app.config import settings
    from app.services.minio_service import minio_service
    from app.database import sync_engine, Base
    import app.models.invoice
    import redis

    print("==================================================")
    print(" Phase 2: Service Setup & Production Diagnostics ")
    print("==================================================")

    # 1. PostgreSQL Database Tables Setup
    log("Setting up PostgreSQL Database...", "*")
    try:
        log(f"Connecting to: {settings.DATABASE_URL.split('@')[-1]}")
        Base.metadata.create_all(bind=sync_engine)
        log("Database tables successfully initialized.", "+")
    except Exception as e:
        log(f"Database initialization warning: {e}", "!")

    # 2. MinIO Storage Buckets Setup
    log("Setting up MinIO Object Storage...", "*")
    try:
        log(f"Connecting to MinIO at: {settings.MINIO_ENDPOINT}")
        minio_service._ensure_buckets()
        log(f"Buckets '{settings.MINIO_BUCKET_RAW}' and '{settings.MINIO_BUCKET_PROCESSED}' ready.", "+")
    except Exception as e:
        log(f"MinIO initialization warning: {e}", "!")

    # 3. Redis Connectivity Check
    log("Checking Redis Connection...", "*")
    try:
        log(f"Connecting to Redis at: {settings.REDIS_URL}")
        r = redis.Redis.from_url(settings.REDIS_URL)
        if r.ping():
            log("Redis connection successful. Ping received.", "+")
    except Exception as e:
        log(f"Redis ping warning: {e}", "!")

    # 4. AI Provider Verification
    log("Checking AI Provider Settings...", "*")
    log(f"Selected Provider: {settings.AI_PROVIDER.upper()}")
    if settings.AI_PROVIDER.lower() == "gemini":
        log(f"Gemini Model: {settings.GEMINI_MODEL}")
        if settings.GEMINI_API_KEY:
            log("Gemini API Key configured.", "+")
        else:
            log("WARNING: GEMINI_API_KEY is not set in environment.", "!")
    elif settings.AI_PROVIDER.lower() == "openai":
        log(f"OpenAI Model: {settings.OPENAI_MODEL}")
        if settings.OPENAI_API_KEY:
            log("OpenAI API Key configured.", "+")
    print("==================================================")

if __name__ == "__main__":
    ensure_env()
    run_phase2_diagnostics()

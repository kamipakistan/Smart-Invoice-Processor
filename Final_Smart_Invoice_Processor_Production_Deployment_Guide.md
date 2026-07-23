# Smart Invoice Processor (SIP) — Production Deployment Guide

**Single Repository (`kamipakistan/varietyidentification`) Multi-Tag Workflow · Isolated Storage (`/mnt/sip_storage`) · Ubuntu 22.04 · CPU-Only Server · Gemini 3.5 Flash · LiteLLM & Langfuse Observability**

> [!IMPORTANT]
> This guide covers the complete end-to-end production deployment workflow for the **Smart Invoice Processor (SIP)** system co-existing on the same production server as the **Moiz Steel Receipt Automation** system.
> Both systems share the single private Docker Hub repository **`kamipakistan/varietyidentification`** using distinct image tag prefixes:
> - **Receipt Automation Tags**: `api-latest`, `frontend-latest`
> - **Smart Invoice Processor Tags**: `smartinvoiceprocessor-api-latest`, `smartinvoiceprocessor-frontend-latest`
> 
> To prevent storage directory and network port conflicts with Receipt Automation (which occupies `/mnt/storage` and host ports `3000`, `8000`, `4000`, `5433`, `6379`, `9000`, `9001`), **Smart Invoice Processor** uses an isolated root storage directory (**`/mnt/sip_storage`**) and distinct host ports (`3001`, `8001`, `4001`, `5434`, `6380`, `9010`, `9011`).

---

## 1. Multi-App Production Port & Storage Comparison Matrix

When both applications are deployed on the **same Ubuntu production server**, each service requires dedicated, non-overlapping host ports and isolated storage root paths:

| Service Component | Receipt Automation | Smart Invoice Processor (SIP) | Internal Container Port | Description |
|---|---|---|---|---|
| **Host Storage Path** | **`/mnt/storage/`** | **`/mnt/sip_storage/`** | — | Dedicated Host Persistent Storage Root |
| **PostgreSQL DB Volume** | `/mnt/storage/postgres_data` | `/mnt/sip_storage/postgres_data` | `/var/lib/postgresql/data` | Database Data Mount |
| **Redis Data Volume** | `/mnt/storage/redis_data` | `/mnt/sip_storage/redis_data` | `/data` | Redis AOF Data Mount |
| **MinIO Data Volume** | `/mnt/storage/minio_data` | `/mnt/sip_storage/minio_data` | `/data` | Object Storage PDF Mount |
| **Shared Ingestion Volume** | `/mnt/storage/shared_ingestion` | `/mnt/sip_storage/shared_ingestion` | `/data/ingestion` | Shared Batch Upload Directory |
| **React Web Frontend Port** | `3000` | **`3001`** | `80` | Production React SPA served via Nginx |
| **FastAPI Backend API Port** | `8000` | **`8001`** | `8000` | REST API (Ingestion, HITL Review, Export) |
| **Langfuse Dashboard Port** | `4000` | **`4001`** | `3000` | LLM Tracing, Latency & Token Cost Dashboard |
| **PostgreSQL Database Port** | `5433` | **`5434`** | `5432` | Relational DB (`fbr_sip_db`) |
| **Redis Broker Port** | `6379` | **`6380`** | `6379` | Celery Async Task Broker |
| **MinIO S3 API Port** | `9000` | **`9010`** | `9000` | Object Storage API for Invoice PDFs |
| **MinIO Web Console Port** | `9001` | **`9011`** | `9001` | Object Storage Admin Console |

---

## 2. Deployment Model

```
┌────────────────────────────────┐        Docker Hub Repository       ┌────────────────────────────────┐
│   DEV MACHINE                  │   kamipakistan/varietyidentification│   PRODUCTION SERVER            │
│   (Ubuntu 22.04 / Dev PC)      │   ─── docker push ───────────────► │   (Ubuntu 22.04 / CPU Server)   │
│                                │                                    │                                │
│  1. Make code changes          │   Tags:                            │  1. docker login               │
│  2. docker build (backend)     │     smartinvoiceprocessor-api-1.0.0 │  2. docker compose pull        │
│  3. docker build (frontend)    │     smartinvoiceprocessor-api-latest│  3. docker compose up -d       │
│  4. docker push (both images)  │     smartinvoiceprocessor-fe-1.0.0 │  4. python setup_project.py    │
│                                │     smartinvoiceprocessor-fe-latest│                                │
└────────────────────────────────┘                                    └────────────────────────────────┘
```

### Image Inventory

| Image Tag | Source | Contents |
|---|---|---|
| `kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest` | `backend/Dockerfile` | FastAPI + Celery worker (Python 3.11-slim) |
| `kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-latest` | `frontend/Dockerfile` | React SPA (Node 20 build → Nginx) |

---

## 3. System Architecture

```mermaid
graph TD
    subgraph "Client"
        U["Browser / Client"]
    end

    subgraph "Frontend — Port 3001"
        F["React SPA<br>(Nginx · Port 3001:80)"]
    end

    subgraph "API & Queue Workers"
        API["FastAPI Backend<br>(Port 8001:8000)"]
        C["Celery Worker<br>(Concurrency = 4 to 8)"]
    end

    subgraph "Observability & Telemetry"
        LF["Langfuse Server<br>(Port 4001:3000)"]
    end

    subgraph "Infrastructure & Storage (/mnt/sip_storage)"
        PG["PostgreSQL 15<br>(Port 5434:5432 · /mnt/sip_storage/postgres_data)"]
        RD["Redis 7<br>(Port 6380:6379 · /mnt/sip_storage/redis_data)"]
        MN["MinIO Object Store<br>(Port 9010/9011 · /mnt/sip_storage/minio_data)"]
    end

    subgraph "Unified AI Layer (LiteLLM)"
        GM{{"Gemini 3.5 Flash<br>(Primary Cloud Vision Model)"}}
        OAI{{"OpenAI / Anthropic<br>(Backup / Fallback Providers)"}}
    end

    U --> F
    F -->|"/api/v1/* (Port 8001)"| API
    API -->|"Queue Single / Batch Tasks"| RD --> C
    C -->|"Upload / Fetch PDF Objects"| MN
    C -->|"LiteLLM Vision Extraction"| GM
    C -.->|"Failover (if Primary fails)"| OAI
    GM -->|"Structured 16-Field JSON Payload"| C
    C -->|"Log Traces & Token Metrics"| LF
    API -->|"Telemetry & Log Traces"| LF
    C -->|"Write Headers & Line Items"| PG
    API --> PG
    API -->|"Presigned PDF URLs (Port 9010)"| MN

    style GM fill:#E91E63,color:#fff
    style LF fill:#8B5CF6,color:#fff
    style F fill:#7C3AED,color:#fff
    style PG fill:#2196F3,color:#fff
    style API fill:#10b981,color:#fff
```

### Container Inventory (Production)

| Container | Image | Port(s) | Memory Limit | Purpose |
|---|---|---|---|---|
| `sip_postgres` | `postgres:15-alpine` | `5434 → 5432` | 1 GB | Relational database for FBR invoice records, line items & Langfuse |
| `sip_redis` | `redis:7-alpine` | `6380 → 6379` | 512 MB | Celery task broker with AOF persistence |
| `sip_minio` | `minio/minio:RELEASE.2024-*` | `9010 / 9011` | 1 GB | S3-compatible raw & processed PDF object store |
| `sip_langfuse` | `langfuse/langfuse:2` | `4001 → 3000` | 1 GB | Web dashboard for LLM tracing, latency & token cost tracking |
| `sip_backend` | `kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest` | `8001 → 8000` | 2 GB | FastAPI REST API (ingestion, review, export, health) |
| `sip_celery_worker` | `kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest` | — | 2 GB | Background PDF rendering & Vision LLM extraction worker |
| `sip_frontend` | `kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-latest` | `3001 → 80` | 256 MB | Production React SPA (multi-stage Dockerfile served by Nginx) |

---

## 4. PART A — Dev Machine Workflow (Build & Push)

```bash
cd /home/kamipakistan/Documents/ALMOIZ/Accounts-department/Smart-Invoice-Processor

# ── 1. Build Backend API & Celery Image ──
docker build \
  --label "project=Smart-Invoice-Processor" \
  --label "component=api" \
  --label "version=1.0.0" \
  -t kamipakistan/varietyidentification:smartinvoiceprocessor-api-1.0.0 \
  -t kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest \
  ./backend

# ── 2. Build React Frontend Image ──
docker build \
  --label "project=Smart-Invoice-Processor" \
  --label "component=frontend" \
  --label "version=1.0.0" \
  -t kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-1.0.0 \
  -t kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-latest \
  ./frontend

# ── 3. Push Images to Private Docker Hub Repository ──
docker push kamipakistan/varietyidentification:smartinvoiceprocessor-api-1.0.0
docker push kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest

docker push kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-1.0.0
docker push kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-latest
```

---

## 5. PART B — Production Server Setup (One-Time)

### B.1 Storage Layout

To guarantee complete separation from Receipt Automation's `/mnt/storage/` folder, SIP uses the dedicated root directory **`/mnt/sip_storage/`**:

```bash
# Create dedicated SIP root storage directory on the host
sudo mkdir -p /mnt/sip_storage/{postgres_data,redis_data,minio_data,shared_ingestion}
sudo chown -R $USER:$USER /mnt/sip_storage
```

#### Storage Directory Summary

| Host Directory | Container Mount Path | Service |
|---|---|---|
| `/mnt/sip_storage/postgres_data` | `/var/lib/postgresql/data` | PostgreSQL 15 |
| `/mnt/sip_storage/redis_data` | `/data` | Redis 7 |
| `/mnt/sip_storage/minio_data` | `/data` | MinIO Object Store |
| `/mnt/sip_storage/shared_ingestion` | `/data/ingestion` | FastAPI & Celery Worker |

### B.2 Clone Repository & Configure Environment

```bash
cd /home/almoiz
git clone https://github.com/kamipakistan/Smart-Invoice-Processor.git smart-invoice-processor
cd smart-invoice-processor

cp .env-prod .env
nano .env
```

Review the production environment file (`.env`):

```env
# ======================================================================
# DATABASE SETTINGS (Host Port 5434)
# ======================================================================
POSTGRES_DB=fbr_sip_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=ProductionSecretPassword2026!
DATABASE_URL=postgresql+asyncpg://admin:ProductionSecretPassword2026!@localhost:5434/fbr_sip_db

# ======================================================================
# REDIS SETTINGS (Host Port 6380)
# ======================================================================
REDIS_URL=redis://localhost:6380/0

# ======================================================================
# MINIO OBJECT STORAGE (Host Ports 9010 API / 9011 Console)
# ======================================================================
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=MinioProductionPassword2026!
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=MinioProductionPassword2026!
MINIO_ENDPOINT=localhost:9010
MINIO_EXTERNAL_ENDPOINT=http://<SERVER_IP>:9010
MINIO_BUCKET_RAW=raw-invoices
MINIO_BUCKET_PROCESSED=processed-invoices

# ======================================================================
# AI PROVIDER LAYER (LiteLLM Architecture)
# ======================================================================
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-3.5-flash
GEMINI_API_KEY=<YOUR-GEMINI-API-KEY>

# Optional Backup Providers
OPENAI_MODEL=gpt-4o
OPENAI_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_API_KEY=
OLLAMA_MODEL=qwen3-vl:8b
OLLAMA_HOST=http://localhost:11434

# ======================================================================
# CELERY WORKER & INGESTION LIMITS
# ======================================================================
CELERY_CONCURRENCY=4
MAX_UPLOAD_SIZE_MB=25
MAX_BATCH_FILES=200
BATCH_INGESTION_ROOT=/data/ingestion

# ======================================================================
# SINGLE PRIVATE REPOSITORY (kamipakistan/varietyidentification)
# ======================================================================
BACKEND_IMAGE=kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest
FRONTEND_IMAGE=kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-latest

# ======================================================================
# LANGFUSE OBSERVABILITY & TELEMETRY (Host Port 4001)
# ======================================================================
LANGFUSE_PUBLIC_KEY=pk-lf-1234567890
LANGFUSE_SECRET_KEY=sk-lf-1234567890
LANGFUSE_HOST=http://localhost:4001
LANGFUSE_PUBLIC_HOST=http://<SERVER_IP>:4001
```

---

## 6. PART C — Production Deployment & Service Initialization

### C.1 Pull Docker Images & Launch Containers

```bash
cd /home/almoiz/smart-invoice-processor
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### C.2 Verify Container Status

```bash
docker compose -f docker-compose.prod.yml ps
```

---

## 7. PART D — Verification & Access Points

| Service | Access URL | Purpose |
|---|---|---|
| **SIP Web Dashboard** | `http://<SERVER_IP>:3001` | Ingestion, HITL Review Queue & Excel Export |
| **SIP FastAPI OpenAPI Docs** | `http://<SERVER_IP>:8001/docs` | REST API Specification |
| **SIP Langfuse Dashboard** | `http://<SERVER_IP>:4001` | LLM Traces & Token Metrics |
| **SIP MinIO Console** | `http://<SERVER_IP>:9011` | Object Store Admin Console |

---

## 8. Appendix: Complete `docker-compose.prod.yml`

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: sip_postgres
    restart: always
    mem_limit: 1g
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-fbr_sip_db}
      POSTGRES_USER: ${POSTGRES_USER:-admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secretpassword}
      TZ: Asia/Karachi
    ports:
      - "5434:5432"
    volumes:
      - /mnt/sip_storage/postgres_data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-admin} -d ${POSTGRES_DB:-fbr_sip_db}" ]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: sip_redis
    restart: always
    mem_limit: 512m
    environment:
      TZ: Asia/Karachi
    ports:
      - "6380:6379"
    volumes:
      - /mnt/sip_storage/redis_data:/data
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:RELEASE.2024-01-28T22-35-53Z
    container_name: sip_minio
    restart: always
    mem_limit: 1g
    command: server /data --console-address ":9001"
    ports:
      - "9010:9000"
      - "9011:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadminpassword}
      TZ: Asia/Karachi
    volumes:
      - /mnt/sip_storage/minio_data:/data

  langfuse:
    image: langfuse/langfuse:2
    container_name: sip_langfuse
    restart: always
    mem_limit: 1g
    ports:
      - "4001:3000"
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER:-admin}:${POSTGRES_PASSWORD:-secretpassword}@postgres:5432/${POSTGRES_DB:-fbr_sip_db}
      - NEXTAUTH_SECRET=sip-smart-invoice-secret-2026
      - SALT=sip-smart-invoice-salt-2026
      - ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
      - NEXTAUTH_URL=http://localhost:4001
    depends_on:
      postgres:
        condition: service_healthy

  fastapi_app:
    image: ${BACKEND_IMAGE:-kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest}
    container_name: sip_backend
    restart: always
    mem_limit: 2g
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    ports:
      - "8001:8000"
    environment:
      - TZ=Asia/Karachi
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-admin}:${POSTGRES_PASSWORD:-secretpassword}@postgres:5432/${POSTGRES_DB:-fbr_sip_db}
      - REDIS_URL=redis://redis:6379/0
      - MINIO_ENDPOINT=minio:9000
      - MINIO_EXTERNAL_ENDPOINT=${MINIO_EXTERNAL_ENDPOINT:-http://localhost:9010}
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minioadmin}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minioadminpassword}
      - MINIO_BUCKET_RAW=${MINIO_BUCKET_RAW:-raw-invoices}
      - MINIO_BUCKET_PROCESSED=${MINIO_BUCKET_PROCESSED:-processed-invoices}
      - AI_PROVIDER=${AI_PROVIDER:-gemini}
      - GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-3-5-sonnet-20241022}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - OLLAMA_MODEL=${OLLAMA_MODEL:-qwen3-vl:8b}
      - OLLAMA_HOST=${OLLAMA_HOST:-http://localhost:11434}
      - MAX_UPLOAD_SIZE_MB=${MAX_UPLOAD_SIZE_MB:-25}
      - MAX_BATCH_FILES=${MAX_BATCH_FILES:-200}
      - BATCH_INGESTION_ROOT=${BATCH_INGESTION_ROOT:-/data/ingestion}
      - LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY:-}
      - LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY:-}
      - LANGFUSE_HOST=http://langfuse:3000
      - LANGFUSE_PUBLIC_HOST=${LANGFUSE_PUBLIC_HOST:-http://localhost:4001}
    dns:
      - 8.8.8.8
      - 1.1.1.1
    volumes:
      - /mnt/sip_storage/shared_ingestion:/data/ingestion
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_started

  celery_worker:
    image: ${BACKEND_IMAGE:-kamipakistan/varietyidentification:smartinvoiceprocessor-api-latest}
    container_name: sip_celery_worker
    restart: always
    mem_limit: 2g
    command: celery -A app.tasks.celery_worker worker --loglevel=info --concurrency=${CELERY_CONCURRENCY:-4}
    environment:
      - TZ=Asia/Karachi
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-admin}:${POSTGRES_PASSWORD:-secretpassword}@postgres:5432/${POSTGRES_DB:-fbr_sip_db}
      - REDIS_URL=redis://redis:6379/0
      - MINIO_ENDPOINT=minio:9000
      - MINIO_EXTERNAL_ENDPOINT=${MINIO_EXTERNAL_ENDPOINT:-http://localhost:9010}
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minioadmin}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minioadminpassword}
      - MINIO_BUCKET_RAW=${MINIO_BUCKET_RAW:-raw-invoices}
      - MINIO_BUCKET_PROCESSED=${MINIO_BUCKET_PROCESSED:-processed-invoices}
      - AI_PROVIDER=${AI_PROVIDER:-gemini}
      - GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-3-5-sonnet-20241022}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - OLLAMA_MODEL=${OLLAMA_MODEL:-qwen3-vl:8b}
      - OLLAMA_HOST=${OLLAMA_HOST:-http://localhost:11434}
      - BATCH_INGESTION_ROOT=${BATCH_INGESTION_ROOT:-/data/ingestion}
      - LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY:-}
      - LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY:-}
      - LANGFUSE_HOST=http://langfuse:3000
      - LANGFUSE_PUBLIC_HOST=${LANGFUSE_PUBLIC_HOST:-http://localhost:4001}
    dns:
      - 8.8.8.8
      - 1.1.1.1
    volumes:
      - /mnt/sip_storage/shared_ingestion:/data/ingestion
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_started

  react_frontend:
    image: ${FRONTEND_IMAGE:-kamipakistan/varietyidentification:smartinvoiceprocessor-frontend-latest}
    container_name: sip_frontend
    restart: always
    mem_limit: 256m
    ports:
      - "3001:80"
    environment:
      - TZ=Asia/Karachi
    depends_on:
      - fastapi_app
```

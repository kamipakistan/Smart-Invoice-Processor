# Smart Invoice Processor (SIP) — Production Deployment Guide

**Docker Hub Push/Pull Workflow · Ubuntu 22.04 · CPU-Only Server · Gemini 3.5 Flash · LiteLLM & Langfuse Observability**

> [!IMPORTANT]
> This guide covers the complete end-to-end production deployment workflow for the **Smart Invoice Processor (SIP)** system.
> The system utilizes a **React + Vite + TypeScript** frontend served via **Nginx**, a **FastAPI + Celery** backend with a unified **LiteLLM** multi-provider layer, **Langfuse** for LLM tracing and observability, **PostgreSQL 15**, **Redis 7**, and **MinIO** object storage. Primary AI vision inference is routed to **Google Gemini 3.5 Flash** over HTTPS — no GPU or local Ollama instance is required on the production server.

---

## 1. Deployment Model

```
┌────────────────────────────────┐        Docker Hub         ┌────────────────────────────────┐
│   DEV MACHINE                  │   ─── docker push ───►    │   PRODUCTION SERVER            │
│   (Ubuntu 22.04 / Dev PC)      │                           │   (Ubuntu 22.04 / CPU Server)   │
│                                │   kamipakistan/            │                                │
│  1. Make code changes          │   smartinvoiceprocessor:  │  1. docker login               │
│  2. docker build (backend)     │     api-1.0.0              │  2. docker compose pull        │
│  3. docker build (frontend)    │     api-latest             │  3. docker compose up -d       │
│  4. docker push (both images)  │     frontend-1.0.0         │  4. python setup_project.py    │
│                                │     frontend-latest        │     --phase2                   │
└────────────────────────────────┘                           └────────────────────────────────┘
```

### Image Inventory

| Image Tag | Source | Contents |
|---|---|---|
| `kamipakistan/smartinvoiceprocessor:api-latest` | `backend/Dockerfile` | FastAPI + Celery worker (Python 3.11-slim) |
| `kamipakistan/smartinvoiceprocessor:frontend-latest` | `frontend/Dockerfile` | React SPA (Node 20 build → Nginx) |

### Infrastructure Images (Pulled directly from Docker Hub)

| Image | Purpose |
|---|---|
| `postgres:15-alpine` | Relational database for FBR invoice records, line items, batches & Langfuse |
| `redis:7-alpine` | Celery task broker with AOF persistence |
| `minio/minio:RELEASE.2024-01-28T22-35-53Z` | S3-compatible raw and processed invoice PDF object store |
| `langfuse/langfuse:2` | LLM observability, prompt execution tracing, and cost/token tracking dashboard |

> [!NOTE]
> **Versioned Tags**: Each build is pushed with both a version tag (e.g., `api-1.0.0`, `frontend-1.0.0`) and a rolling `:latest` tag. The `docker-compose.prod.yml` references the `:latest` tags via `BACKEND_IMAGE` and `FRONTEND_IMAGE` environment variables.

---

## 2. System Architecture

```mermaid
graph TD
    subgraph "Client"
        U["Browser / Client"]
    end

    subgraph "Frontend — Port 3000"
        F["React SPA<br>(Nginx · Static Build)"]
    end

    subgraph "API & Queue Workers"
        API["FastAPI Backend<br>(Port 8000)"]
        C["Celery Worker<br>(Concurrency = 4 to 8)"]
    end

    subgraph "Observability & Telemetry"
        LF["Langfuse Server<br>(Port 4000:3000)"]
    end

    subgraph "Infrastructure & Storage"
        PG["PostgreSQL 15<br>(Port 5434 → 5432)"]
        RD["Redis 7<br>(Port 6380 → 6379)"]
        MN["MinIO Object Store<br>(Port 9010 / 9011)"]
    end

    subgraph "Unified AI Layer (LiteLLM)"
        GM{{"Gemini 3.5 Flash<br>(Primary Cloud Vision Model)"}}
        OAI{{"OpenAI / Anthropic<br>(Backup / Fallback Providers)"}}
    end

    U --> F
    F -->|"/api/v1/*"| API
    API -->|"Queue Single / Batch Tasks"| RD --> C
    C -->|"Upload / Fetch Raw & Processed PDFs"| MN
    C -->|"LiteLLM Vision Extraction"| GM
    C -.->|"Failover (if Primary fails)"| OAI
    GM -->|"Structured 16-Field JSON Payload"| C
    C -->|"Log Traces & Token Metrics"| LF
    API -->|"Telemetry & Log Traces"| LF
    C -->|"Write Headers & Line Items"| PG
    API --> PG
    API -->|"Presigned PDF URLs"| MN

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
| `sip_langfuse` | `langfuse/langfuse:2` | `4000 → 3000` | 1 GB | Web dashboard for LLM tracing, latency & token cost tracking |
| `sip_backend` | `kamipakistan/smartinvoiceprocessor:api-latest` | `8000` | 2 GB | FastAPI REST API (ingestion, review, export, health) |
| `sip_celery_worker` | `kamipakistan/smartinvoiceprocessor:api-latest` | — | 2 GB | Background PDF rendering & Vision LLM extraction worker |
| `sip_frontend` | `kamipakistan/smartinvoiceprocessor:frontend-latest` | `3000 → 80` | 256 MB | Production React SPA (multi-stage Dockerfile served by Nginx) |

> **No Ollama / No Local GPU Required**: The production stack uses Google Gemini 3.5 Flash (or configured cloud providers like OpenAI/Anthropic) over HTTPS. No local GPU or Ollama service is required on the production host.

### Dynamic Frontend → Backend API Resolution

The React app dynamically resolves the backend API endpoint at runtime:

```typescript
const getApiBase = () => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && envUrl !== 'http://localhost:8000') return envUrl;
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
};
const API_BASE = getApiBase();
```

If the client accesses the frontend at `http://192.168.10.50:3000`, API requests automatically direct to `http://192.168.10.50:8000`. **No hardcoded URLs need to be edited for deployment.**

---

## 3. PART A — Dev Machine Workflow (Build & Push)

These steps run on **your development PC** where the source code repository lives.

### A.1 Prerequisites

```bash
# Verify Docker and Git installations
docker --version     # 20.10+ required
docker compose version
git --version
```

### A.2 Log In to Docker Hub

```bash
docker login
# Username: kamipakistan
# Password: <your Docker Hub password or Personal Access Token>
```

### A.3 Build Docker Images

```bash
cd /home/kamipakistan/Documents/ALMOIZ/Accounts-department/Smart-Invoice-Processor

# ── Build Backend API & Celery Image ──
docker build \
  --label "project=Smart-Invoice-Processor" \
  --label "component=api" \
  --label "version=1.0.0" \
  -t kamipakistan/smartinvoiceprocessor:api-1.0.0 \
  -t kamipakistan/smartinvoiceprocessor:api-latest \
  ./backend

# ── Build React Frontend Image (Node 20 build → Nginx) ──
docker build \
  --label "project=Smart-Invoice-Processor" \
  --label "component=frontend" \
  --label "version=1.0.0" \
  -t kamipakistan/smartinvoiceprocessor:frontend-1.0.0 \
  -t kamipakistan/smartinvoiceprocessor:frontend-latest \
  ./frontend
```

> [!WARNING]
> If the frontend build fails with TypeScript compilation errors (e.g., `'X' is declared but its value is never read`), fix the TypeScript errors in `frontend/src/` before rebuilding. The multi-stage Dockerfile runs `npm run build` which enforces strict type checks.

### A.4 Push Images to Docker Hub

```bash
# Push Backend images
docker push kamipakistan/smartinvoiceprocessor:api-1.0.0
docker push kamipakistan/smartinvoiceprocessor:api-latest

# Push Frontend images
docker push kamipakistan/smartinvoiceprocessor:frontend-1.0.0
docker push kamipakistan/smartinvoiceprocessor:frontend-latest
```

### A.5 Push Repository Changes to GitHub

```bash
git add docker-compose.prod.yml schema.sql setup_project.py .env-prod frontend/nginx.conf
git commit -m "chore: production stack update with LiteLLM and Langfuse observability"
git push origin main
```

---

## 4. PART B — Production Server Setup (One-Time)

These steps are performed once on the **target production server** (Ubuntu 22.04 LTS).

### B.1 Recommended System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU / Cores | 4+ Cores |
| RAM | 4 GB | 8 GB |
| Storage | 50 GB SSD | 200 GB+ SSD |
| Network | Outbound Internet (HTTPS for Gemini API) | Broadband LAN / Dedicated IP |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### B.2 Install Docker Engine (Official Repository)

> [!IMPORTANT]
> Do **not** install Ubuntu's default `docker.io` snap package. Always use the official Docker repository.

```bash
#!/bin/bash
set -e

echo "=== Removing legacy Docker packages ==="
sudo apt-get remove -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || true
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

sudo rm -f /etc/apt/sources.list.d/docker.list
sudo rm -f /etc/apt/keyrings/docker.gpg
sudo apt-get update

echo "=== Installing official Docker Engine ==="
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Grant current user Docker privileges
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker functionality
docker --version
docker compose version
```

### B.3 Install Git, Python & Build Prerequisites

```bash
sudo apt-get update
sudo apt-get install -y git python3 python3-pip python3-venv curl fuser
```

### B.4 Persistent Storage Configuration

Persistent directories on host storage ensure data survives container updates and restarts.

```bash
# 1. Create storage directories on the host
sudo mkdir -p /mnt/storage/{sip_postgres_data,sip_redis_data,sip_minio_data,sip_shared_ingestion}
sudo chown -R $USER:$USER /mnt/storage
```

#### Directory Mapping Summary

| Host Directory | Container Mount Path | Service |
|---|---|---|
| `/mnt/storage/sip_postgres_data` | `/var/lib/postgresql/data` | PostgreSQL 15 |
| `/mnt/storage/sip_redis_data` | `/data` | Redis 7 |
| `/mnt/storage/sip_minio_data` | `/data` | MinIO Object Store |
| `/mnt/storage/sip_shared_ingestion` | `/data/ingestion` | FastAPI & Celery Worker |

### B.5 Clone the Application Repository

```bash
sudo mkdir -p /home/almoiz
sudo chown -R $USER:$USER /home/almoiz
cd /home/almoiz

git clone https://github.com/kamipakistan/Smart-Invoice-Processor.git smart-invoice-processor
cd smart-invoice-processor
```

### B.6 Create the Production Environment File (`.env`)

Create `.env` inside the project root (`/home/almoiz/smart-invoice-processor/.env`):

```bash
cp .env-prod .env
nano .env
```

Review the production environment configuration below (adjust secret keys and IP addresses accordingly):

```env
# ======================================================================
# DATABASE SETTINGS
# ======================================================================
POSTGRES_DB=fbr_sip_db
POSTGRES_USER=admin
POSTGRES_PASSWORD=ProductionSecretPassword2026!
DATABASE_URL=postgresql+asyncpg://admin:ProductionSecretPassword2026!@localhost:5434/fbr_sip_db

# ======================================================================
# REDIS SETTINGS
# ======================================================================
REDIS_URL=redis://localhost:6380/0

# ======================================================================
# MINIO OBJECT STORAGE
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

# Optional AI Providers (uncomment if using alternative/backup providers)
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
# DOCKER HUB IMAGE REPOSITORY
# ======================================================================
BACKEND_IMAGE=kamipakistan/smartinvoiceprocessor:api-latest
FRONTEND_IMAGE=kamipakistan/smartinvoiceprocessor:frontend-latest

# ======================================================================
# LANGFUSE OBSERVABILITY & TELEMETRY
# ======================================================================
LANGFUSE_PUBLIC_KEY=pk-lf-1234567890
LANGFUSE_SECRET_KEY=sk-lf-1234567890
LANGFUSE_HOST=http://localhost:4000
LANGFUSE_PUBLIC_HOST=http://<SERVER_IP>:4000
```

> [!CAUTION]
> **Mandatory Variable Substitutions:**
> - Set `<SERVER_IP>` to the production server's actual IP address (e.g., `192.168.10.50`).
> - Set `<YOUR-GEMINI-API-KEY>` to your live key from [Google AI Studio](https://aistudio.google.com/).
> - Update `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD` with secure passwords.

### B.7 Authenticate Docker Hub on the Production Host

```bash
docker login
# Credentials: kamipakistan / <password>
```

---

## 5. PART C — Production Deployment & Service Initialization

### C.1 Pull Docker Images

```bash
cd /home/almoiz/smart-invoice-processor
docker compose -f docker-compose.prod.yml pull
```

### C.2 Launch Containers

```bash
docker compose -f docker-compose.prod.yml up -d
```

### C.3 Verify Running Containers

```bash
docker compose -f docker-compose.prod.yml ps
```

**Expected Container Status Output:**

```
NAME                IMAGE                                                    STATUS          PORTS
sip_postgres        postgres:15-alpine                                       Up (healthy)    0.0.0.0:5434->5432/tcp
sip_redis           redis:7-alpine                                          Up (healthy)    0.0.0.0:6380->6379/tcp
sip_minio           minio/minio:RELEASE.2024-01-28T22-35-53Z                Up (healthy)    0.0.0.0:9010-9011->9000-9001/tcp
sip_langfuse        langfuse/langfuse:2                                      Up              0.0.0.0:4000->3000/tcp
sip_backend         kamipakistan/smartinvoiceprocessor:api-latest            Up              0.0.0.0:8000->8000/tcp
sip_celery_worker   kamipakistan/smartinvoiceprocessor:api-latest            Up
sip_frontend        kamipakistan/smartinvoiceprocessor:frontend-latest       Up              0.0.0.0:3000->80/tcp
```

### C.4 Run Database & MinIO Initialization Diagnostics (`setup_project.py`)

Execute the bootstrap diagnostic script to verify database tables, create the MinIO buckets (`raw-invoices`, `processed-invoices`), check Redis, and validate AI provider settings:

```bash
cd /home/almoiz/smart-invoice-processor

# Create host virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Execute Phase 2 database & storage setup
python setup_project.py
```

**Expected Diagnostic Output:**

```
==================================================
 Phase 2: Service Setup & Production Diagnostics 
==================================================
[*] Setting up PostgreSQL Database...
    Connecting to: localhost:5434/fbr_sip_db
[+] Database tables successfully initialized.

[*] Setting up MinIO Object Storage...
    Connecting to MinIO at: localhost:9010
[+] Buckets 'raw-invoices' and 'processed-invoices' ready.

[*] Checking Redis Connection...
    Connecting to Redis at: redis://localhost:6380/0
[+] Redis connection successful. Ping received.

[*] Checking AI Provider Settings...
    Selected Provider: GEMINI
    Gemini Model: gemini-3.5-flash
[+] Gemini API Key configured.
==================================================
```

---

## 6. PART D — Verification & End-to-End Testing

### D.1 Production Access Points

| Service | Access URL | Description |
|---|---|---|
| **React Web Dashboard** | `http://<SERVER_IP>:3000` | Human-in-the-Loop Review & Ingestion Dashboard |
| **FastAPI OpenAPI Swagger** | `http://<SERVER_IP>:8000/docs` | REST API Specification & Endpoint Testing |
| **Langfuse Observability** | `http://<SERVER_IP>:4000` | Real-time LLM Traces, Token Metrics & Costs |
| **MinIO Console** | `http://<SERVER_IP>:9011` | Object Storage Admin Console |

### D.2 Test Ingestion Endpoint via `curl`

Submit a sample FBR invoice PDF for classification, field extraction, and metacognition evaluation:

```bash
curl -X POST 'http://<SERVER_IP>:8000/api/v1/invoices/upload-single' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@/path/to/Invoice_template.pdf;type=application/pdf'
```

**Expected JSON Response:**

```json
{
  "status": "SUBMITTED",
  "batch_id": "SINGLE_20260723_111000",
  "invoice_id": 1,
  "message": "File uploaded and queued for Vision LLM extraction."
}
```

### D.3 Monitor Pipeline Execution Logs

Check real-time processing logs in Celery:

```bash
docker logs -f sip_celery_worker --tail 50
```

Verify that the logs document:
1. Invoice PDF download from MinIO `raw-invoices` bucket.
2. Rendering PDF pages to high-DPI images (`pdf2image`).
3. 16-field Vision extraction via LiteLLM Gemini integration (`gemini-3.5-flash`).
4. Metacognition Engine quality evaluation, regex check, & duplicate FBR Invoice No check.
5. Record persistence in PostgreSQL (`invoice_headers` and `invoice_line_items`).
6. PDF copy to `processed-invoices` bucket if fully complete.

---

## 7. PART E — Maintenance & System Updates

### E.1 Full Application Update Cycle

When updating code on the development machine:

#### Step 1: Build & Push on Dev Machine

```bash
cd /home/kamipakistan/Documents/ALMOIZ/Accounts-department/Smart-Invoice-Processor

# Commit changes
git add .
git commit -m "feat: updated extraction prompt and metacognition rules"
git push origin main

# Rebuild backend & frontend images
docker build -t kamipakistan/smartinvoiceprocessor:api-latest ./backend
docker build -t kamipakistan/smartinvoiceprocessor:frontend-latest ./frontend

# Push updated images
docker push kamipakistan/smartinvoiceprocessor:api-latest
docker push kamipakistan/smartinvoiceprocessor:frontend-latest
```

#### Step 2: Deploy Updates on Production Server

```bash
cd /home/almoiz/smart-invoice-processor

# Pull repository changes
git pull origin main

# Pull new Docker images
docker compose -f docker-compose.prod.yml pull

# Apply container updates (Zero downtime for unaffected services)
docker compose -f docker-compose.prod.yml up -d
```

### E.2 Partial Updates (Backend or Frontend Only)

#### Backend Only

```bash
docker compose -f docker-compose.prod.yml pull fastapi_app celery_worker
docker compose -f docker-compose.prod.yml up -d fastapi_app celery_worker
```

#### Frontend Only

```bash
docker compose -f docker-compose.prod.yml pull react_frontend
docker compose -f docker-compose.prod.yml up -d react_frontend
```

---

## 8. PART F — Network & Firewall Configuration

Configure host firewall (`ufw`) settings on Ubuntu 22.04:

```bash
# Allow web application traffic
sudo ufw allow 3000/tcp   # React Frontend
sudo ufw allow 8000/tcp   # FastAPI Backend API
sudo ufw allow 9010/tcp   # MinIO API (Required for image/pdf previews in UI)
sudo ufw allow 4000/tcp   # Langfuse Dashboard

# Optional Administrative Access
sudo ufw allow 9011/tcp   # MinIO Web Console
sudo ufw allow 5434/tcp   # PostgreSQL (External DB Tools)

sudo ufw enable
sudo ufw status
```

---

## 9. PART G — Comprehensive Troubleshooting

### Common Deployment Scenarios & Fixes

| Symptom / Error | Root Cause | Resolution |
|---|---|---|
| `WARN: variable is not set. Defaulting to blank string` | Missing `.env` file or undefined variable | Verify `.env` exists in root and contains all mandatory environment key-value pairs. |
| React UI displays "Services Status: OFFLINE" | Backend container `sip_backend` down or port 8000 blocked | Run `docker logs sip_backend --tail 50` and check network connectivity to port 8000. |
| Invoice PDF previews fail to load in browser | `MINIO_EXTERNAL_ENDPOINT` set to `localhost` | Update `.env` to `MINIO_EXTERNAL_ENDPOINT=http://<SERVER_IP>:9010` and restart API container. |
| `API Key not found / ProviderConfigError` | Invalid or missing `GEMINI_API_KEY` | Ensure `.env` contains a valid key for `GEMINI_API_KEY` and restart `sip_backend` and `sip_celery_worker`. |
| Celery tasks stuck in `PROCESSING` | Redis broker connectivity issue | Restart Redis and Celery worker: `docker compose -f docker-compose.prod.yml restart redis celery_worker`. |
| Port `8000` or `3000` already in use | Conflicting host process | Run `sudo fuser -k 8000/tcp` and `sudo fuser -k 3000/tcp` before starting stack. |

### Container Log Commands

```bash
# FastAPI API Logs
docker logs -f sip_backend --tail 100

# Celery Worker Logs
docker logs -f sip_celery_worker --tail 100

# React Frontend Logs
docker logs -f sip_frontend --tail 50

# Langfuse Observability Logs
docker logs -f sip_langfuse --tail 50

# PostgreSQL Logs
docker logs -f sip_postgres --tail 50

# MinIO Logs
docker logs -f sip_minio --tail 50
```

---

## 10. Appendix: Complete Configuration File Templates

### 10.1 `docker-compose.prod.yml`

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
      - /mnt/storage/sip_postgres_data:/var/lib/postgresql/data
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
      - /mnt/storage/sip_redis_data:/data
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
      - /mnt/storage/sip_minio_data:/data
    healthcheck:
      test: [ "CMD", "curl", "-f", "http://localhost:9000/minio/health/live" ]
      interval: 10s
      timeout: 5s
      retries: 5

  langfuse:
    image: langfuse/langfuse:2
    container_name: sip_langfuse
    restart: always
    mem_limit: 1g
    ports:
      - "4000:3000"
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER:-admin}:${POSTGRES_PASSWORD:-secretpassword}@postgres:5432/${POSTGRES_DB:-fbr_sip_db}
      - NEXTAUTH_SECRET=sip-smart-invoice-secret-2026
      - SALT=sip-smart-invoice-salt-2026
      - ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
      - NEXTAUTH_URL=http://localhost:4000
    depends_on:
      postgres:
        condition: service_healthy

  fastapi_app:
    image: ${BACKEND_IMAGE:-kamipakistan/smartinvoiceprocessor:api-latest}
    container_name: sip_backend
    restart: always
    mem_limit: 2g
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    ports:
      - "8000:8000"
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
      - LANGFUSE_PUBLIC_HOST=${LANGFUSE_PUBLIC_HOST:-http://localhost:4000}
    dns:
      - 8.8.8.8
      - 1.1.1.1
    volumes:
      - /mnt/storage/sip_shared_ingestion:/data/ingestion
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

  celery_worker:
    image: ${BACKEND_IMAGE:-kamipakistan/smartinvoiceprocessor:api-latest}
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
      - LANGFUSE_PUBLIC_HOST=${LANGFUSE_PUBLIC_HOST:-http://localhost:4000}
    dns:
      - 8.8.8.8
      - 1.1.1.1
    volumes:
      - /mnt/storage/sip_shared_ingestion:/data/ingestion
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

  react_frontend:
    image: ${FRONTEND_IMAGE:-kamipakistan/smartinvoiceprocessor:frontend-latest}
    container_name: sip_frontend
    restart: always
    mem_limit: 256m
    ports:
      - "3000:80"
    environment:
      - TZ=Asia/Karachi
    depends_on:
      - fastapi_app
```

### 10.2 `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA Fallback Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Custom Error Pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    client_max_body_size 50M;
}
```

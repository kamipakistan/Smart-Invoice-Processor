# Smart Invoice Processor (SIP) — Project Implementation Plan & Architecture

The **Smart-Invoice-Processor (SIP)** is a full-stack, enterprise-grade, batch/single PDF extraction pipeline that ingests FBR Digital Invoices, extracts 16 target financial fields using Vision LLMs, enforces completeness validation via Metacognition, routes incomplete extractions to an interactive **Human-In-The-Loop (HITL)** portal, persists data in PostgreSQL and MinIO, and outputs flat 16-column Excel reports.

---

## 1. Required Target Fields (16 Total)

1. **Header Fields (1–5)**:
   - `FBR Invoice No` (Unique invoice identifier)
   - `Registration No` (Buyer NTN / STRN)
   - `Business Name` (Customer registered business name)
   - `Invoice Date` (`YYYY-MM-DD`)
   - `Insertion Date` (`YYYY-MM-DD`)

2. **Line Item Fields (6–16)**:
   - `Sr. No` (Serial number)
   - `HS Code` (Tariff classification code)
   - `Product Description` (Product name/specification)
   - `Sales Type` (Standard, 3rd Schedule, Exempt)
   - `Quantity` (Numeric value)
   - `UoM` (Unit of Measure: MT, KG, PCS, BAGS)
   - `Sales Value` (Subtotal before tax)
   - `Retail Price` (Retail unit or item price)
   - `Sales Tax` (Tax charged)
   - `Further Tax` (Additional tax or 0.0)
   - `FED` (Federal Excise Duty or 0.0)

---

## 2. Infrastructure & Stack

- **Backend**: Python 3.11+, FastAPI (Async API layer), Pydantic v2
- **Queue**: Celery, Redis
- **Storage**: MinIO S3 Object Storage (`raw-invoices`, `processed-invoices`), PostgreSQL 15 (`fbr_sip_db`)
- **AI Extraction**: Vision LLMs via LiteLLM (OpenAI GPT-4o / Claude 3.5 Sonnet) or GPU Ollama (Qwen2-VL / Qwen3-VL)
- **Frontend**: React (Vite, TypeScript, Tailwind CSS, Lucide Icons, PDF Viewer)
- **Reporting**: OpenPyXL flat 16-column Excel export

---

## 3. Quickstart & Deployment Instructions

### Option A: Running with Docker Compose
```bash
docker compose up --build -d
```
Access points:
- **Frontend App**: `http://localhost:5173`
- **FastAPI API Documentation**: `http://localhost:8000/docs`
- **MinIO Console**: `http://localhost:9001` (User: `minioadmin`, Pass: `minioadminpassword`)

### Option B: Local Python Development Setup
1. Setup Python virtual environment & install requirements:
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. Start FastAPI Server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
3. Start Celery Async Worker:
   ```bash
   celery -A app.tasks.celery_worker worker --loglevel=info --concurrency=4
   ```
4. Start React Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

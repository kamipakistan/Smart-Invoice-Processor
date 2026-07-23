Here is the `.md` implementation plan designed for an AI Coding Agent (such as Cursor, Windsurf, Aider, or Claude Code).

You can save this file as **`PROJECT_PLAN.md`** in your project root and direct your agent to execute it step-by-step.

---

# `PROJECT_PLAN.md`

```markdown
# Implementation Plan: Batch FBR Invoice PDF Extraction System

## 1. Project Overview
Build a full-stack, enterprise-grade batch PDF extraction pipeline that processes 10 to 100 FBR Digital Invoices at a time[cite: 1]. The system extracts 15 target fields (Header fields 1–5 and repeated Line Item fields 6–15) using Vision LLMs[cite: 1], stores raw/processed PDFs in MinIO[cite: 1], persists extracted structured data in PostgreSQL[cite: 1], and provides flat Excel exports alongside a React status dashboard[cite: 1].

### Tech Stack
* **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (Async), Alembic
* **Task Queue & Async:** Celery, Redis
* **AI Extraction:** LiteLLM (or Instructor) with GPT-4o / Claude 3.5 Sonnet
* **Storage & DB:** MinIO (S3 compatible), PostgreSQL
* **Data & Export:** Pandas, OpenPyXL, Pydantic v2
* **Frontend:** React (Vite, TypeScript, Tailwind CSS, Lucide Icons)

---

## 2. Directory Structure Setup

Create the following folder structure:

```text
fbr-invoice-processor/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── invoice.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── extraction.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── minio_service.py
│   │   │   ├── llm_service.py
│   │   │   └── excel_service.py
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   └── celery_worker.py
│   │   └── api/
│   │       ├── __init__.py
│   │       └── routes.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUpload.tsx
│   │   │   ├── ProgressTracker.tsx
│   │   │   └── InvoiceTable.tsx
│   │   ├── App.tsx
│   │   └── main.tsx

```

---

## 3. Step-by-Step Task Execution

### Phase 1: Containerization & Infrastructure Configuration

#### Task 1.1: Create `docker-compose.yml`

Define services for:

* `postgres`: PostgreSQL database (Port `5432`).
* `redis`: Task broker and backend (Port `6379`).
* `minio`: Object storage server (Port `9000` & Console `9001`).
* `backend`: FastAPI app server (Port `8000`).
* `celery_worker`: Celery worker instance.
* `frontend`: React Vite development server (Port `5173`).

#### Task 1.2: Environment Configuration (`.env.example`)

Include variables for:

```env
DATABASE_URL=postgresql+asyncpg://admin:secret@postgres:5432/fbr_db
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_RAW=raw-invoices
MINIO_BUCKET_PROCESSED=processed-invoices
OPENAI_API_KEY=your-key-here

```

---

### Phase 2: Database Models & Extraction Schemas

#### Task 2.1: Define Pydantic Schema (`backend/app/schemas/extraction.py`)

Implement the 15 required fields:

```python
from pydantic import BaseModel, Field
from typing import List

class LineItemSchema(BaseModel):
    sr_no: int = Field(..., description="Serial Number (Sr. No.)")
    hs_code: str = Field(..., description="HS Code (e.g., 1701.9920)")
    product_description: str = Field(..., description="Product Description")
    sales_type: str = Field(..., description="Sales Type")
    quantity: float = Field(..., description="Quantity as numeric value")
    uom: str = Field(..., description="Unit of Measure (UoM)")
    sales_value: float = Field(..., description="Sales Value")
    retail_price: float = Field(..., description="Retail Price")
    sales_tax: float = Field(..., description="Sales Tax amount")
    further_tax: float = Field(..., description="Further Tax amount")
    fed: float = Field(..., description="FED amount")

class InvoiceExtractionSchema(BaseModel):
    fbr_invoice_no: str = Field(..., description="Unique FBR Invoice No")
    registration_no: str = Field(..., description="Buyer Registration No")
    business_name: str = Field(..., description="Buyer Business Name")
    invoice_date: str = Field(..., description="Invoice Date YYYY-MM-DD")
    insertion_date: str = Field(..., description="Insertion Date YYYY-MM-DD")
    line_items: List[LineItemSchema]

```

#### Task 2.2: Define SQLAlchemy ORM Models (`backend/app/models/invoice.py`)

Create relational tables:

* `InvoiceHeader`: Stores fields 1–5 (`fbr_invoice_no`, `registration_no`, `business_name`, `invoice_date`, `insertion_date`, `batch_id`, `minio_filename`).
* `InvoiceLineItem`: Belongs to `InvoiceHeader` via Foreign Key (`invoice_id`). Stores fields 6–15 (`sr_no`, `hs_code`, `product_description`, `sales_type`, `quantity`, `uom`, `sales_value`, `retail_price`, `sales_tax`, `further_tax`, `fed`).

---

### Phase 3: Services Implementation

#### Task 3.1: MinIO Client (`backend/app/services/minio_service.py`)

* Initialize MinIO bucket creation (`raw-invoices`, `processed-invoices`) on startup.
* Add helper function `upload_file(bucket_name, object_name, file_bytes)`.
* Add helper function `get_file_url(bucket_name, object_name)`.

#### Task 3.2: LLM Extraction Service (`backend/app/services/llm_service.py`)

* Implement LiteLLM / Instructor call to process PDF content (convert PDF pages to images using `pdf2image` if scanned).
* Enforce output via `InvoiceExtractionSchema`.
* Implement retries with exponential backoff for API rate limits.

#### Task 3.3: Excel Export Service (`backend/app/services/excel_service.py`)

* Query database for all records in a given `batch_id`.
* Flatten data: repeat fields 1–5 for every line item record (fields 6–15) of that invoice.
* Construct pandas DataFrame with exact column names:
1. `Sr. No`
2. `FBR Invoice No`
3. `Registration No`
4. `Business Name`
5. `Invoice Date`
6. `Insertion Date`
7. `HS Code`
8. `Product Description`
9. `Sales Type`
10. `Quantity`
11. `UoM`
12. `Sales Value`
13. `Retail Price`
14. `Sales Tax`
15. `Further Tax`
16. `FED`


* Export to Excel stream via `openpyxl`.

---

### Phase 4: Async Task Engine & API Endpoints

#### Task 4.1: Celery Task (`backend/app/tasks/celery_worker.py`)

* **Task: `process_single_pdf_task(file_bytes, batch_id, original_filename)**`:
1. Parse PDF using `llm_service`.
2. Extract unique `fbr_invoice_no`.
3. Store file in MinIO bucket `processed-invoices` using name format `{fbr_invoice_no}.pdf`.
4. Save header and line items into PostgreSQL.
5. Update Celery task state / Redis progress cache.



#### Task 4.2: FastAPI Routes (`backend/app/api/routes.py`)

* `POST /api/v1/invoices/upload`: Accepts up to 100 PDF files. Generates a `batch_id`, triggers background Celery tasks, and returns `batch_id`.
* `GET /api/v1/invoices/batch/{batch_id}/status`: Returns overall completion percentage and task statuses.
* `GET /api/v1/invoices/batch/{batch_id}/export`: Generates and downloads the consolidated Excel report.

---

### Phase 5: React Frontend Development

#### Task 5.1: File Upload Component (`frontend/src/components/FileUpload.tsx`)

* Drag-and-drop zone supporting multi-file selection (up to 100 PDFs).
* Submit button sending payload to `POST /api/v1/invoices/upload`.

#### Task 5.2: Progress Dashboard (`frontend/src/components/ProgressTracker.tsx`)

* Polls `GET /api/v1/invoices/batch/{batch_id}/status` every 2 seconds.
* Displays a progress bar, completed count vs total count, and individual task states (Pending, Processing, Completed, Failed).

#### Task 5.3: Results Table & Export (`frontend/src/components/InvoiceTable.tsx`)

* Displays preview of extracted records.
* Shows "Download Excel Report" button connected to `/export` endpoint.

---

## 4. Verification & Testing Instructions

Run the following checks to verify execution:

1. **Service Integrity:** Ensure all 6 Docker services start cleanly (`docker compose up --build`).
2. **MinIO Verification:** Upload test PDF and verify `raw-invoices` container receives the file.
3. **Extraction & Renaming:** Process sample FBR invoice and verify:
* Record is parsed correctly into 15 target schema fields.
* File is copied into `processed-invoices` bucket renamed as `<FBR_INVOICE_NO>.pdf`.


4. **1-to-Many Layout Test:** Upload an invoice containing multiple line items. Ensure fields 1–5 are duplicated across all line items in the final Excel file.
5. **Batch Scale Test:** Test batch upload of 10+ PDFs simultaneously to confirm Celery worker concurrency and Redis task queuing perform without rate-limit failures.

```

```
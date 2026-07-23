import uuid
import json
import datetime
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from app.database import get_async_db
from app.config import settings, get_pkt_now, get_pkt_today_iso
from app.models.invoice import InvoiceHeader, InvoiceLineItem, BatchRecord
from app.models.system_log import SystemLog
from app.schemas.extraction import InvoiceHeaderResponse, InvoiceUpdateRequest, BatchStatusResponse, LineItemSchema
from app.services.minio_service import minio_service
from app.services.excel_service import generate_flat_excel_report
from app.services.logger_service import logger_service
from app.tasks.celery_worker import process_invoice_pipeline

router = APIRouter()

class RejectInvoiceRequest(BaseModel):
    rejection_reason: str

@router.post("/invoices/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Accepts single or batch PDF invoice files (up to 100).
    Stores raw files in MinIO and enqueues Celery processing tasks.
    """
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No files provided for upload.")
    
    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Batch size exceeds maximum limit of 100 files.")

    pkt_now = get_pkt_now()
    batch_id = f"batch_{pkt_now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    
    batch_record = BatchRecord(
        id=batch_id,
        total_files=len(files),
        completed_files=0,
        failed_files=0,
        status="PROCESSING"
    )
    db.add(batch_record)
    await db.commit()

    created_header_ids = []

    for file in files:
        if not file.filename.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
            continue

        file_bytes = await file.read()
        object_name = f"{batch_id}/{uuid.uuid4().hex[:8]}_{file.filename}"
        
        # Upload raw file to MinIO
        minio_service.upload_file(settings.MINIO_BUCKET_RAW, object_name, file_bytes)

        header = InvoiceHeader(
            batch_id=batch_id,
            raw_file_name=file.filename,
            minio_raw_object=object_name,
            status="PENDING",
            insertion_date=get_pkt_today_iso()
        )
        db.add(header)
        await db.flush()
        created_header_ids.append(header.id)

    await db.commit()

    # Trigger async Celery workers for each invoice
    for h_id in created_header_ids:
        process_invoice_pipeline.delay(h_id)

    return {
        "batch_id": batch_id,
        "total_files": len(files),
        "enqueued_count": len(created_header_ids),
        "message": f"Successfully enqueued {len(created_header_ids)} invoices for processing."
    }

@router.get("/invoices/batch/{batch_id}/status", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(BatchRecord).where(BatchRecord.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch ID not found.")

    headers_res = await db.execute(select(InvoiceHeader).where(InvoiceHeader.batch_id == batch_id))
    headers = headers_res.scalars().all()

    completed = sum(1 for h in headers if h.status in ["COMPLETED", "MANUALLY_VERIFIED"])
    needs_review = sum(1 for h in headers if h.status == "NEEDS_REVIEW")
    failed = sum(1 for h in headers if h.status in ["FAILED", "REJECTED"])

    return BatchStatusResponse(
        batch_id=batch_id,
        total_files=batch.total_files,
        completed_files=completed,
        failed_files=failed,
        needs_review_files=needs_review,
        status=batch.status
    )

@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = None,
    batch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_field: Optional[str] = Query("all", description="all | invoice_date | insertion_date | created_at"),
    db: AsyncSession = Depends(get_async_db)
):
    query = select(InvoiceHeader).options(selectinload(InvoiceHeader.line_items)).order_by(InvoiceHeader.id.desc())
    
    if status:
        query = query.where(InvoiceHeader.status == status)
    if batch_id:
        query = query.where(InvoiceHeader.batch_id == batch_id)
        
    if start_date:
        if date_field == "invoice_date":
            query = query.where(InvoiceHeader.invoice_date >= start_date)
        elif date_field == "insertion_date":
            query = query.where(InvoiceHeader.insertion_date >= start_date)
        elif date_field == "created_at":
            query = query.where(func.to_char(InvoiceHeader.created_at, 'YYYY-MM-DD') >= start_date)
        else: # Default: all
            query = query.where(
                (InvoiceHeader.invoice_date >= start_date) |
                (InvoiceHeader.insertion_date >= start_date) | 
                (func.to_char(InvoiceHeader.created_at, 'YYYY-MM-DD') >= start_date)
            )

    if end_date:
        if date_field == "invoice_date":
            query = query.where(InvoiceHeader.invoice_date <= end_date)
        elif date_field == "insertion_date":
            query = query.where(InvoiceHeader.insertion_date <= end_date)
        elif date_field == "created_at":
            query = query.where(func.to_char(InvoiceHeader.created_at, 'YYYY-MM-DD') <= end_date)
        else: # Default: all
            query = query.where(
                (InvoiceHeader.invoice_date <= end_date) |
                (InvoiceHeader.insertion_date <= end_date) | 
                (func.to_char(InvoiceHeader.created_at, 'YYYY-MM-DD') <= end_date)
            )

    res = await db.execute(query)
    headers = res.scalars().all()
    
    output = []
    for h in headers:
        pdf_url = f"/api/v1/invoices/{h.id}/document"
        h_dict = {
            "id": h.id,
            "batch_id": h.batch_id,
            "raw_file_name": h.raw_file_name,
            "status": h.status,
            "missing_fields_summary": json.loads(h.missing_fields_summary) if h.missing_fields_summary else [],
            "rejection_reason": h.rejection_reason,
            "ai_confidence": h.ai_confidence,
            "fbr_invoice_no": h.fbr_invoice_no,
            "registration_no": h.registration_no,
            "business_name": h.business_name,
            "invoice_date": h.invoice_date,
            "insertion_date": h.insertion_date,
            "pdf_url": pdf_url,
            "line_items": [
                {
                    "sr_no": item.sr_no,
                    "hs_code": item.hs_code,
                    "product_description": item.product_description,
                    "sales_type": item.sales_type,
                    "quantity": float(item.quantity) if item.quantity is not None else None,
                    "uom": item.uom,
                    "sales_value": float(item.sales_value) if item.sales_value is not None else None,
                    "retail_price": float(item.retail_price) if item.retail_price is not None else None,
                    "sales_tax": float(item.sales_tax) if item.sales_tax is not None else None,
                    "further_tax": float(item.further_tax) if item.further_tax is not None else 0.0,
                    "fed": float(item.fed) if item.fed is not None else 0.0,
                }
                for item in h.line_items
            ]
        }
        output.append(h_dict)

    return output

@router.get("/invoices/{invoice_id}/document")
async def get_invoice_document(invoice_id: int, db: AsyncSession = Depends(get_async_db)):
    """
    Proxy endpoint to stream PDF invoice document directly from MinIO storage.
    Prevents CORS/host mismatch issues when viewing invoices in the frontend.
    """
    result = await db.execute(select(InvoiceHeader).where(InvoiceHeader.id == invoice_id))
    header = result.scalars().first()
    if not header or not header.minio_raw_object:
        raise HTTPException(status_code=404, detail="Document not found.")

    try:
        file_bytes = minio_service.get_file_bytes(settings.MINIO_BUCKET_RAW, header.minio_raw_object)
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{header.raw_file_name}"',
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch document from storage: {str(e)}")

@router.get("/invoices/exceptions")
async def list_exceptions(db: AsyncSession = Depends(get_async_db)):
    """
    Returns list of invoices requiring Human-In-The-Loop review (status = NEEDS_REVIEW).
    """
    return await list_invoices(status="NEEDS_REVIEW", db=db)

@router.put("/invoices/{invoice_id}/review")
async def update_invoice_review(
    invoice_id: int,
    payload: InvoiceUpdateRequest,
    db: AsyncSession = Depends(get_async_db)
):
    """
    HITL endpoint: Accepts operator corrections for missing/unextracted fields,
    updates header and line items, sets status to MANUALLY_VERIFIED, and moves raw PDF to processed storage.
    """
    result = await db.execute(select(InvoiceHeader).options(selectinload(InvoiceHeader.line_items)).where(InvoiceHeader.id == invoice_id))
    header = result.scalars().first()
    if not header:
        raise HTTPException(status_code=404, detail="Invoice record not found.")

    header.fbr_invoice_no = payload.fbr_invoice_no
    header.registration_no = payload.registration_no
    header.business_name = payload.business_name
    header.invoice_date = payload.invoice_date
    if payload.insertion_date:
        header.insertion_date = payload.insertion_date

    header.status = "MANUALLY_VERIFIED"
    header.missing_fields_summary = None
    header.rejection_reason = None

    # Replace line items
    await db.execute(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id))
    for old_item in header.line_items:
        await db.delete(old_item)

    for item in payload.line_items:
        new_item = InvoiceLineItem(
            invoice_id=header.id,
            sr_no=item.sr_no,
            hs_code=item.hs_code,
            product_description=item.product_description,
            sales_type=item.sales_type,
            quantity=item.quantity,
            uom=item.uom,
            sales_value=item.sales_value,
            retail_price=item.retail_price,
            sales_tax=item.sales_tax,
            further_tax=item.further_tax or 0.0,
            fed=item.fed or 0.0
        )
        db.add(new_item)

    await db.commit()

    # Move to processed MinIO bucket
    if header.fbr_invoice_no:
        try:
            file_bytes = minio_service.get_file_bytes(settings.MINIO_BUCKET_RAW, header.minio_raw_object)
            proc_name = f"{header.fbr_invoice_no}.pdf"
            minio_service.upload_file(settings.MINIO_BUCKET_PROCESSED, proc_name, file_bytes)
        except Exception as e:
            print(f"Error copying to processed-invoices bucket: {e}")

    return {"message": "Invoice successfully updated and verified.", "status": "MANUALLY_VERIFIED"}

@router.post("/invoices/{invoice_id}/reject")
async def reject_invoice(
    invoice_id: int,
    payload: RejectInvoiceRequest,
    db: AsyncSession = Depends(get_async_db)
):
    """
    HITL Rejection Endpoint: Marks document status as REJECTED and records operator reason.
    """
    result = await db.execute(select(InvoiceHeader).where(InvoiceHeader.id == invoice_id))
    header = result.scalars().first()
    if not header:
        raise HTTPException(status_code=404, detail="Invoice record not found.")

    header.status = "REJECTED"
    header.rejection_reason = payload.rejection_reason or "Rejected by operator"
    await db.commit()

    return {"message": "Invoice has been rejected.", "status": "REJECTED", "rejection_reason": header.rejection_reason}

@router.get("/invoices/export")
async def export_excel(
    batch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_field: Optional[str] = Query("all", description="all | invoice_date | insertion_date | created_at"),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Generates and downloads the flat 16-column Excel report for completed/verified invoices filtered by date range and date_field.
    """
    invoices_list = await list_invoices(
        batch_id=batch_id,
        start_date=start_date,
        end_date=end_date,
        date_field=date_field,
        db=db
    )
    
    # Filter out failed, pending, or rejected records
    valid_invoices = [inv for inv in invoices_list if inv["status"] in ["COMPLETED", "MANUALLY_VERIFIED", "NEEDS_REVIEW"]]
    
    if not valid_invoices:
        raise HTTPException(status_code=400, detail="No processed invoice data available for the selected date range.")

    excel_bytes = generate_flat_excel_report(valid_invoices)
    
    date_suffix = f"{start_date}_to_{end_date}" if start_date and end_date else get_pkt_now().strftime('%Y%m%d_%H%M%S')
    filename = f"FBR_Invoices_Export_{date_field}_{date_suffix}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/logs")
async def list_system_logs(
    level: Optional[str] = None,
    category: Optional[str] = None,
    provider: Optional[str] = None,
    invoice_id: Optional[int] = None,
    batch_id: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Paginated logs endpoint with multi-criteria filtering for system, API, and AI execution logs.
    """
    query = select(SystemLog).order_by(SystemLog.id.desc())
    count_query = select(func.count(SystemLog.id))

    if level and level.upper() != "ALL":
        query = query.where(SystemLog.level == level.upper())
        count_query = count_query.where(SystemLog.level == level.upper())

    if category and category.upper() != "ALL":
        query = query.where(SystemLog.category == category.upper())
        count_query = count_query.where(SystemLog.category == category.upper())

    if provider and provider.lower() != "all":
        query = query.where(SystemLog.provider == provider.lower())
        count_query = count_query.where(SystemLog.provider == provider.lower())

    if invoice_id:
        query = query.where(SystemLog.invoice_id == invoice_id)
        count_query = count_query.where(SystemLog.invoice_id == invoice_id)

    if batch_id:
        query = query.where(SystemLog.batch_id == batch_id)
        count_query = count_query.where(SystemLog.batch_id == batch_id)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (SystemLog.event.ilike(search_pattern)) |
            (SystemLog.message.ilike(search_pattern)) |
            (SystemLog.model_name.ilike(search_pattern))
        )
        count_query = count_query.where(
            (SystemLog.event.ilike(search_pattern)) |
            (SystemLog.message.ilike(search_pattern)) |
            (SystemLog.model_name.ilike(search_pattern))
        )

    if start_date:
        query = query.where(func.to_char(SystemLog.timestamp, 'YYYY-MM-DD') >= start_date)
        count_query = count_query.where(func.to_char(SystemLog.timestamp, 'YYYY-MM-DD') >= start_date)

    if end_date:
        query = query.where(func.to_char(SystemLog.timestamp, 'YYYY-MM-DD') <= end_date)
        count_query = count_query.where(func.to_char(SystemLog.timestamp, 'YYYY-MM-DD') <= end_date)

    total_res = await db.execute(count_query)
    total_count = total_res.scalar_one()

    page_val = int(page.default) if hasattr(page, 'default') else int(page)
    limit_val = int(limit.default) if hasattr(limit, 'default') else int(limit)

    offset = (page_val - 1) * limit_val
    query = query.offset(offset).limit(limit_val)
    res = await db.execute(query)
    logs = res.scalars().all()

    items = []
    for log in logs:
        items.append({
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "level": log.level,
            "category": log.category,
            "event": log.event,
            "provider": log.provider,
            "model_name": log.model_name,
            "prompt_tokens": log.prompt_tokens,
            "completion_tokens": log.completion_tokens,
            "total_tokens": log.total_tokens,
            "latency_ms": log.latency_ms,
            "invoice_id": log.invoice_id,
            "batch_id": log.batch_id,
            "message": log.message,
            "metadata_json": log.metadata_json
        })

    return {
        "items": items,
        "total": total_count,
        "page": page_val,
        "limit": limit_val,
        "pages": (total_count + limit_val - 1) // limit_val if limit_val > 0 else 1
    }

@router.get("/logs/stats")
async def get_log_stats(db: AsyncSession = Depends(get_async_db)):
    """
    Returns aggregated metrics and token usage analytics for the Log Tab dashboard.
    """
    total_logs_res = await db.execute(select(func.count(SystemLog.id)))
    total_logs = total_logs_res.scalar_one()

    error_logs_res = await db.execute(
        select(func.count(SystemLog.id)).where(SystemLog.level.in_(["ERROR", "CRITICAL"]))
    )
    error_count = error_logs_res.scalar_one()

    rate_limit_res = await db.execute(
        select(func.count(SystemLog.id)).where(SystemLog.event.ilike("%rate limit%") | SystemLog.event.ilike("%quota%"))
    )
    rate_limit_count = rate_limit_res.scalar_one()

    tokens_res = await db.execute(
        select(
            func.coalesce(func.sum(SystemLog.prompt_tokens), 0),
            func.coalesce(func.sum(SystemLog.completion_tokens), 0),
            func.coalesce(func.sum(SystemLog.total_tokens), 0),
            func.avg(SystemLog.latency_ms)
        ).where(SystemLog.category == "AI_PROVIDER")
    )
    prompt_tokens, completion_tokens, total_tokens, avg_latency = tokens_res.one()

    # Determine active AI Provider & Model name from settings
    provider_type = settings.AI_PROVIDER.lower()
    if provider_type == "gemini":
        active_model = settings.GEMINI_MODEL
    elif provider_type == "anthropic":
        active_model = settings.ANTHROPIC_MODEL
    elif provider_type == "ollama":
        active_model = settings.OLLAMA_MODEL
    else:
        active_model = settings.OPENAI_MODEL

    # Determine health status based on recent errors (last 10 AI provider logs)
    recent_ai_logs_res = await db.execute(
        select(SystemLog)
        .where(SystemLog.category == "AI_PROVIDER")
        .order_by(SystemLog.id.desc())
        .limit(10)
    )
    recent_ai_logs = recent_ai_logs_res.scalars().all()
    recent_errors = sum(1 for log in recent_ai_logs if log.level in ["ERROR", "CRITICAL"])
    model_status = "ERROR" if recent_errors >= 3 else ("WARNING" if recent_errors > 0 else "OPERATIONAL")

    return {
        "active_provider": provider_type,
        "active_model": active_model,
        "model_status": model_status,
        "total_logs": total_logs,
        "error_count": error_count,
        "rate_limit_count": rate_limit_count,
        "prompt_tokens": int(prompt_tokens),
        "completion_tokens": int(completion_tokens),
        "total_tokens": int(total_tokens),
        "avg_latency_ms": round(float(avg_latency), 2) if avg_latency is not None else 0.0
    }

@router.delete("/logs/clear")
async def clear_logs(days: Optional[int] = Query(None, description="Clear logs older than N days. Omit to clear all."), db: AsyncSession = Depends(get_async_db)):
    """
    Clears system logs. If days parameter is provided, deletes logs older than N days.
    """
    if days is not None and days > 0:
        cutoff = get_pkt_now() - datetime.timedelta(days=days)
        await db.execute(SystemLog.__table__.delete().where(SystemLog.timestamp < cutoff))
    else:
        await db.execute(SystemLog.__table__.delete())
    
    await db.commit()
    return {"message": "Logs successfully cleared."}

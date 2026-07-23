import io
import json
from celery import Celery
from pdf2image import convert_from_bytes
from app.config import settings, get_pkt_today_iso
from app.database import SyncSessionLocal
from app.models.invoice import InvoiceHeader, InvoiceLineItem, BatchRecord
from app.services.minio_service import minio_service
from app.services.metacognition import MetacognitionEngine
from app.providers import get_ai_provider

celery_app = Celery(
    "fbr_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Karachi",
    enable_utc=False,
)

@celery_app.task(name="process_invoice_pipeline", bind=True, max_retries=3)
def process_invoice_pipeline(self, invoice_id: int):
    session = SyncSessionLocal()
    try:
        header = session.query(InvoiceHeader).filter(InvoiceHeader.id == invoice_id).first()
        if not header:
            print(f"Invoice record #{invoice_id} not found.")
            return

        header.status = "PROCESSING"
        session.commit()

        # 1. Fetch raw PDF from MinIO
        file_bytes = minio_service.get_file_bytes(settings.MINIO_BUCKET_RAW, header.minio_raw_object)

        # 2. Render PDF to images (supports multi-page document images)
        try:
            images = convert_from_bytes(file_bytes, fmt="png", dpi=150)
            img_bytes_list = []
            for img in images:
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                img_bytes_list.append(buf.getvalue())
        except Exception as pdf_err:
            print(f"PDF rendering error: {pdf_err}")
            img_bytes_list = []

        # 3. Vision LLM Extraction
        provider = get_ai_provider()
        extraction = provider.extract_invoice_data(img_bytes_list)
        ext_dict = extraction.model_dump()

        # Set PKT insertion date default if not provided
        if not ext_dict.get("insertion_date"):
            ext_dict["insertion_date"] = get_pkt_today_iso()

        # 4. Deterministic Quality, Metacognition & Duplicate Database Check
        status, missing_reasons, confidence, cleaned_data = MetacognitionEngine.evaluate_extraction(
            ext_dict,
            db_session=session,
            current_invoice_id=header.id
        )

        # 5. Update Header Fields in DB with cleaned data
        header.fbr_invoice_no = cleaned_data.get("fbr_invoice_no")
        header.registration_no = cleaned_data.get("registration_no")
        header.business_name = cleaned_data.get("business_name")
        header.invoice_date = cleaned_data.get("invoice_date")
        header.insertion_date = cleaned_data.get("insertion_date") or get_pkt_today_iso()
        header.status = status
        header.ai_confidence = confidence
        header.missing_fields_summary = json.dumps(missing_reasons) if missing_reasons else None

        # 6. Delete old line items & insert newly extracted & cleaned line items
        session.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == header.id).delete()

        line_items = cleaned_data.get("line_items", [])
        for item in line_items:
            db_item = InvoiceLineItem(
                invoice_id=header.id,
                sr_no=item.get("sr_no"),
                hs_code=item.get("hs_code"),
                product_description=item.get("product_description"),
                sales_type=item.get("sales_type"),
                quantity=item.get("quantity"),
                uom=item.get("uom"),
                sales_value=item.get("sales_value"),
                retail_price=item.get("retail_price"),
                sales_tax=item.get("sales_tax"),
                further_tax=item.get("further_tax") or 0.0,
                fed=item.get("fed") or 0.0
            )
            session.add(db_item)

        session.commit()

        # 7. Move PDF to processed-invoices bucket if complete and verified
        if status == "COMPLETED" and header.fbr_invoice_no:
            proc_object_name = f"{header.fbr_invoice_no}.pdf"
            minio_service.upload_file(settings.MINIO_BUCKET_PROCESSED, proc_object_name, file_bytes)

        # 8. Update Batch statistics
        batch = session.query(BatchRecord).filter(BatchRecord.id == header.batch_id).first()
        if batch:
            batch.completed_files += 1
            if batch.completed_files >= batch.total_files:
                batch.status = "COMPLETED"
            session.commit()

        return {"invoice_id": invoice_id, "status": status, "missing_reasons": missing_reasons, "confidence": confidence}

    except Exception as e:
        session.rollback()
        print(f"Error processing invoice #{invoice_id}: {e}")
        header = session.query(InvoiceHeader).filter(InvoiceHeader.id == invoice_id).first()
        if header:
            header.status = "FAILED"
            header.missing_fields_summary = json.dumps([f"System execution failure: {str(e)}"])
            session.commit()
            
            batch = session.query(BatchRecord).filter(BatchRecord.id == header.batch_id).first()
            if batch:
                batch.failed_files += 1
                session.commit()
        raise e
    finally:
        session.close()

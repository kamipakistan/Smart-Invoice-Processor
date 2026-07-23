import time
import base64
import json
import httpx
import traceback
from typing import List
from app.providers.base_provider import BaseAIProvider
from app.schemas.extraction import InvoiceExtractionSchema
from app.config import settings
from app.services.logger_service import logger_service

SYSTEM_PROMPT = """
You are an expert FBR (Federal Board of Revenue, Pakistan) Digital Invoice Parser.

This document type has a "Seller Information" block and a "Buyer Information" block
with IDENTICAL field labels (Business Name, Registration No., Province) placed near
each other. Extract registration_no and business_name ONLY from the Buyer Information
section — ignore the Seller Information section entirely.

Analyze the provided invoice image(s) (one invoice may span multiple page images —
merge all line items into a single ordered list; do not repeat header fields per page)
and extract structured JSON matching these 16 fields:

HEADER FIELDS:
1. fbr_invoice_no: Unique FBR Invoice Number, e.g. "2389374DIKJ91FN565683" (registration
   number followed by an alphanumeric code — do not reformat or truncate it)
2. registration_no: Buyer Registration No / NTN / STRN (Buyer Information section only)
3. business_name: Buyer Business Name (Buyer Information section only)
4. invoice_date: Invoice issue date. Convert from the source format (e.g. "05-Jul-2026")
   to YYYY-MM-DD (e.g. "2026-07-05"). If you cannot confidently parse it, return the
   original string unchanged rather than guessing.
5. insertion_date: System insertion date, same conversion rule as invoice_date.
6. line_items: list of objects (see below). Do NOT include the "Total" summary row as
   a line item.

LINE ITEM FIELDS (per row, excluding the Total row):
- sr_no: integer serial number
- hs_code: HS tariff code exactly as printed, e.g. "1701.9920"
- product_description: full product description text
- sales_type: transcribe VERBATIM as printed (e.g. "Goods at standard rate (default)") —
  do not normalize to a category
- quantity: numeric quantity, no thousands separators
- uom: unit of measure as printed (e.g. "KG", "MT", "PCS")
- sales_value: numeric, strip currency symbols/commas
- retail_price: numeric
- sales_tax: numeric
- further_tax: numeric, 0.0 if blank/not applicable
- fed: numeric (Federal Excise Duty), 0.0 if blank/not applicable

RULES:
- If a field is not present on the invoice, set it to null. Do not guess or fabricate.
- Respond with ONLY valid JSON matching this structure — no preamble, no markdown fences,
  no commentary.
"""

class OllamaAIProvider(BaseAIProvider):
    def extract_invoice_data(self, image_bytes_list: List[bytes]) -> InvoiceExtractionSchema:
        images_b64 = [base64.b64encode(img).decode("utf-8") for img in image_bytes_list]
        model_name = settings.OLLAMA_MODEL
        
        payload = {
            "model": model_name,
            "prompt": SYSTEM_PROMPT.strip(),
            "images": images_b64,
            "stream": False,
            "format": "json"
        }

        start_time = time.time()
        try:
            with httpx.Client(timeout=120.0) as client:
                res = client.post(f"{settings.OLLAMA_HOST}/api/generate", json=payload)
                latency_ms = round((time.time() - start_time) * 1000, 2)
                
                if res.status_code == 200:
                    data = res.json()
                    response_text = data.get("response", "{}")
                    parsed = json.loads(response_text)
                    
                    # Ollama returns token evaluation statistics
                    prompt_tokens = data.get("prompt_eval_count", 0)
                    completion_tokens = data.get("eval_count", 0)
                    total_tokens = prompt_tokens + completion_tokens

                    logger_service.log_sync(
                        event="Ollama Vision Extraction Succeeded",
                        level="INFO",
                        category="AI_PROVIDER",
                        provider="ollama",
                        model_name=model_name,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=total_tokens,
                        latency_ms=latency_ms,
                        message=f"Ollama successfully parsed invoice using {model_name} in {latency_ms}ms. Tokens: {total_tokens}.",
                        metadata={"images_count": len(image_bytes_list)}
                    )

                    return InvoiceExtractionSchema(**parsed)
                else:
                    logger_service.log_sync(
                        event="Ollama HTTP Error",
                        level="ERROR",
                        category="AI_PROVIDER",
                        provider="ollama",
                        model_name=model_name,
                        latency_ms=latency_ms,
                        message=f"Ollama returned non-200 HTTP status code {res.status_code}: {res.text}",
                        metadata={"status_code": res.status_code}
                    )
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            stack_trace = traceback.format_exc()
            logger_service.log_sync(
                event="Ollama Connection Failure",
                level="ERROR",
                category="AI_PROVIDER",
                provider="ollama",
                model_name=model_name,
                latency_ms=latency_ms,
                message=f"Failed to communicate with Ollama server ({settings.OLLAMA_HOST}): {e}\n\nTraceback:\n{stack_trace}"
            )
            print(f"Ollama Provider Error: {e}")
        
        return InvoiceExtractionSchema()

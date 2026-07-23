import base64
import json
import httpx
from typing import List
from app.providers.base_provider import BaseAIProvider
from app.schemas.extraction import InvoiceExtractionSchema
from app.config import settings

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
        
        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": SYSTEM_PROMPT.strip(),
            "images": images_b64,
            "stream": False,
            "format": "json"
        }

        try:
            with httpx.Client(timeout=120.0) as client:
                res = client.post(f"{settings.OLLAMA_HOST}/api/generate", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    response_text = data.get("response", "{}")
                    parsed = json.loads(response_text)
                    return InvoiceExtractionSchema(**parsed)
        except Exception as e:
            print(f"Ollama Provider Error: {e}")
        
        return InvoiceExtractionSchema()

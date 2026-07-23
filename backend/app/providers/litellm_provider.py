import os
import base64
import json
from typing import List
import litellm
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

class LiteLLMAIProvider(BaseAIProvider):
    def extract_invoice_data(self, image_bytes_list: List[bytes]) -> InvoiceExtractionSchema:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.strip()}
        ]

        user_content = []
        for img_bytes in image_bytes_list:
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{b64}"
                }
            })
        
        user_content.append({
            "type": "text",
            "text": "Extract all FBR Invoice header fields and line items into structured JSON following system instructions."
        })
        messages.append({"role": "user", "content": user_content})

        provider_type = settings.AI_PROVIDER.lower()
        
        if provider_type == "gemini":
            raw_model = settings.GEMINI_MODEL
            model_name = raw_model if raw_model.startswith("gemini/") else f"gemini/{raw_model}"
            api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
        elif provider_type == "anthropic":
            raw_model = settings.ANTHROPIC_MODEL
            model_name = raw_model if raw_model.startswith("anthropic/") else f"anthropic/{raw_model}"
            api_key = settings.ANTHROPIC_API_KEY or os.getenv("ANTHROPIC_API_KEY")
        else: # Default to openai
            model_name = settings.OPENAI_MODEL
            api_key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")

        kwargs = {
            "model": model_name,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
        }

        if settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
            os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_KEY
            os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_KEY
            if settings.LANGFUSE_HOST:
                os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_HOST
            litellm.success_callback = ["langfuse"]
            litellm.failure_callback = ["langfuse"]

        try:
            response = litellm.completion(**kwargs)
            raw_text = response.choices[0].message.content
            data = json.loads(raw_text)
            return InvoiceExtractionSchema(**data)
        except Exception as e:
            print(f"LiteLLM Provider Error (Provider: {provider_type}, Model: {model_name}): {e}")
            return InvoiceExtractionSchema()

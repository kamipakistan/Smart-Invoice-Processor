import os
import time
import base64
import json
import re
import traceback
from typing import List
import litellm
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
and extract structured JSON matching these 17 fields:

HEADER FIELDS:
1. fbr_invoice_no: Unique FBR Invoice Number, e.g. "2389374DIKJ91FN565683" (registration
   number followed by an alphanumeric code — do not reformat or truncate it)
2. registration_no: Buyer Registration No / NTN / STRN (Buyer Information section only)
3. business_name: Buyer Business Name (Buyer Information section only)
4. invoice_date: Invoice issue date. Convert from the source format (e.g. "05-Jul-2026")
   to YYYY-MM-DD (e.g. "2026-07-05"). If you cannot confidently parse it, return the
   original string unchanged rather than guessing.
5. insertion_date: System insertion date, same conversion rule as invoice_date.
6. fbr_status: The invoice's validity status, found in the "Invoice Summary" section,
   labeled "Status:" (e.g. "Valid", "Cancelled", "Edited"). Transcribe verbatim as
   printed. This is DIFFERENT from "Invoice Type" (e.g. "Sale Invoice") — do not
   confuse the two, and do not infer this value from the "E"/"C" legend text at the
   bottom of the page unless the Status field itself is unreadable.
7. line_items: list of objects (see below). Do NOT include the "Total" summary row as
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

def extract_json_from_text(raw_text: str) -> dict:
    """
    Robustly extracts and parses JSON dictionary from LLM completion responses.
    Handles thinking tags (<think>...</think>), markdown code fences (```json ... ```),
    and leading/trailing whitespace or text.
    """
    if not raw_text:
        return {}
    
    # 1. Try direct json.loads first
    try:
        return json.loads(raw_text)
    except Exception:
        pass

    try:
        # 2. Strip reasoning / thinking tags (e.g. <think>...</think> from Qwen / DeepSeek R1 models)
        cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()

        # 3. Extract JSON string enclosed in markdown code fences if present
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1)
        else:
            # Strip lines starting with ```
            lines = [line for line in cleaned.splitlines() if not line.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()

        # 4. Find the first '{' and last '}'
        start_idx = cleaned.find("{")
        end_idx = cleaned.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
            cleaned = cleaned[start_idx:end_idx + 1]

        return json.loads(cleaned)
    except Exception as parse_err:
        print(f"Failed to parse JSON from model output ({parse_err}). Output snippet: {raw_text[:200]}")
        return {}

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
        elif provider_type == "groq":
            raw_model = settings.GROQ_MODEL
            model_name = raw_model if raw_model.startswith("groq/") else f"groq/{raw_model}"
            api_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY") or os.getenv("GROQ_APIKEY") or os.getenv("groqapikey")
            if api_key:
                os.environ["GROQ_API_KEY"] = api_key
        elif provider_type == "openrouter":
            raw_model = settings.OPENROUTER_MODEL
            model_name = raw_model if raw_model.startswith("openrouter/") else f"openrouter/{raw_model}"
            api_key = settings.OPENROUTER_API_KEY or os.getenv("OPENROUTER_API_KEY") or os.getenv("openrouter_api_key")
            if api_key:
                os.environ["OPENROUTER_API_KEY"] = api_key
        else: # Default to openai
            model_name = settings.OPENAI_MODEL
            api_key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")

        kwargs = {
            "model": model_name,
            "messages": messages,
        }

        # Groq's server-side JSON mode validator fails on Qwen / reasoning models when response_format is forced.
        # Only pass response_format for non-Groq providers.
        if provider_type != "groq":
            kwargs["response_format"] = {"type": "json_object"}

        if api_key:
            kwargs["api_key"] = api_key

        if settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
            try:
                import langfuse  # noqa: F401
                try:
                    import langfuse.version  # noqa: F401
                except ImportError:
                    pass

                # Ensure langfuse has a version attribute for older/newer LiteLLM integration compatibility
                if not hasattr(langfuse, "version"):
                    class _LangfuseVersion:
                        __version__ = getattr(langfuse, "__version__", "2.0.0")
                    setattr(langfuse, "version", _LangfuseVersion)

                os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_KEY
                os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_KEY
                if settings.LANGFUSE_HOST:
                    os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_HOST
                litellm.success_callback = ["langfuse"]
                litellm.failure_callback = ["langfuse"]
            except Exception as langfuse_err:
                logger_service.log_sync(
                    event="Langfuse Tracing Setup Warning",
                    level="WARNING",
                    category="AI_PROVIDER",
                    message=f"LANGFUSE configuration notice ({langfuse_err}). Tracing disabled."
                )

        start_time = time.time()
        try:
            while True:
                try:
                    response = litellm.completion(**kwargs)
                    break
                except Exception as call_err:
                    err_msg = str(call_err)
                    err_msg_lower = err_msg.lower()
                    modified = False

                    # Fallback 1: Temperature unsupported by model (e.g. OpenAI reasoning / custom models like gpt-5.6-luna, o1, o3)
                    if "temperature" in kwargs and ("temperature" in err_msg_lower and ("unsupported" in err_msg_lower or "does not support" in err_msg_lower or "unsupported_value" in err_msg_lower)):
                        logger_service.log_sync(
                            event="AI Provider Temperature Fallback",
                            level="WARNING",
                            category="AI_PROVIDER",
                            provider=provider_type,
                            model_name=model_name,
                            message=f"Model {model_name} does not support custom temperature. Retrying completion without temperature parameter."
                        )
                        kwargs.pop("temperature", None)
                        modified = True

                    # Fallback 2: response_format / JSON mode unsupported or failed validation
                    if "response_format" in kwargs and ("json_validate_failed" in err_msg or "Failed to validate JSON" in err_msg or ("response_format" in err_msg_lower and ("unsupported" in err_msg_lower or "not supported" in err_msg_lower))):
                        logger_service.log_sync(
                            event="AI Provider JSON Validation Fallback",
                            level="WARNING",
                            category="AI_PROVIDER",
                            provider=provider_type,
                            model_name=model_name,
                            message=f"JSON format mode rejected for {model_name}. Retrying completion without forced response_format parameter."
                        )
                        kwargs.pop("response_format", None)
                        modified = True

                    if not modified:
                        raise call_err

            latency_ms = round((time.time() - start_time) * 1000, 2)
            
            raw_text = response.choices[0].message.content or ""
            data = extract_json_from_text(raw_text)
            
            # Extract token usage telemetry
            usage = getattr(response, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", 0) if usage else 0
            completion_tokens = getattr(usage, "completion_tokens", 0) if usage else 0
            total_tokens = getattr(usage, "total_tokens", 0) if usage else (prompt_tokens + completion_tokens)

            # Log successful extraction to database
            logger_service.log_sync(
                event="AI Vision Extraction Succeeded",
                level="INFO",
                category="AI_PROVIDER",
                provider=provider_type,
                model_name=model_name,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                latency_ms=latency_ms,
                message=f"Successfully extracted invoice data using {model_name} in {latency_ms}ms. Total Tokens: {total_tokens} (Prompt: {prompt_tokens}, Completion: {completion_tokens}).",
                metadata={"images_count": len(image_bytes_list), "raw_response_len": len(raw_text)}
            )

            return InvoiceExtractionSchema(**data)
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            err_str = str(e)
            stack_trace = traceback.format_exc()
            
            # Detect Rate Limit / Quota / Token limit exceeded errors
            is_rate_limit = "429" in err_str or "quota" in err_str.lower() or "rate limit" in err_str.lower() or "token" in err_str.lower()
            level = "ERROR" if not is_rate_limit else "CRITICAL"
            event_title = "AI Model Quota / Rate Limit Exceeded" if is_rate_limit else "AI Vision Extraction Failed"

            logger_service.log_sync(
                event=event_title,
                level=level,
                category="AI_PROVIDER",
                provider=provider_type,
                model_name=model_name,
                latency_ms=latency_ms,
                message=f"Error executing AI provider ({provider_type} - {model_name}): {err_str}\n\nTraceback:\n{stack_trace}",
                metadata={
                    "images_count": len(image_bytes_list),
                    "is_rate_limit": is_rate_limit,
                    "error_class": e.__class__.__name__
                }
            )

            print(f"LiteLLM Provider Error (Provider: {provider_type}, Model: {model_name}): {e}")
            return InvoiceExtractionSchema()


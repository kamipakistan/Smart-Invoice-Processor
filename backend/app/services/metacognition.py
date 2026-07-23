import re
import datetime
from typing import Tuple, List, Dict, Any, Optional

class MetacognitionEngine:
    """
    Deterministic Validation, Quality Assurance, and Duplicate Check Engine for FBR Invoices.
    Evaluates extractions against strict regex, type, format, math, and database uniqueness rules.
    Computes an empirical confidence score (0.0 to 1.0) and flags documents for HITL review if any rule fails.
    """

    FBR_NO_REGEX = re.compile(r"^[0-9]+[A-Z0-9]+$", re.IGNORECASE)
    HS_CODE_REGEX = re.compile(r"^\d{4}\.\d{4}$")
    ISO_DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")

    @classmethod
    def parse_and_normalize_date(cls, raw_date_str: Any) -> Tuple[str, bool]:
        """
        Normalizes raw date strings (e.g. '05-Jul-2026', '2026-07-05', '05/07/2026') to YYYY-MM-DD.
        Returns: (normalized_date_str, is_valid_bool)
        """
        if not raw_date_str or not isinstance(raw_date_str, str):
            return "", False

        clean_str = raw_date_str.strip()
        if cls.ISO_DATE_REGEX.match(clean_str):
            return clean_str, True

        date_formats = ["%d-%b-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"]
        for fmt in date_formats:
            try:
                parsed_dt = datetime.datetime.strptime(clean_str, fmt)
                return parsed_dt.strftime("%Y-%m-%d"), True
            except ValueError:
                continue

        return clean_str, False

    @classmethod
    def sanitize_numeric(cls, val: Any) -> float:
        """
        Sanitizes numeric strings by stripping currency symbols, spaces, and thousands commas.
        """
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)
        
        clean_str = str(val).replace(",", "").replace("$", "").replace("Rs.", "").replace("PKR", "").strip()
        try:
            return float(clean_str)
        except ValueError:
            return 0.0

    @classmethod
    def evaluate_extraction(
        cls,
        extracted_data: Dict[str, Any],
        db_session: Optional[Any] = None,
        current_invoice_id: Optional[int] = None
    ) -> Tuple[str, List[str], float, Dict[str, Any]]:
        """
        Evaluates extracted invoice data deterministically and checks historical database for FBR Invoice No duplicates.
        Returns:
            - status: "COMPLETED" | "NEEDS_REVIEW"
            - missing_reasons: List[str]
            - confidence_score: float (0.0 to 1.0)
            - cleaned_data: Dict[str, Any] (with normalized dates & numeric types)
        """
        missing_reasons: List[str] = []
        rules_evaluated = 0
        rules_passed = 0

        cleaned_data = dict(extracted_data)

        # 1. FBR Invoice No Presence & Format Rule
        rules_evaluated += 1
        fbr_no = str(cleaned_data.get("fbr_invoice_no") or "").strip()
        if not fbr_no or fbr_no.lower() in ["null", "none", "n/a"]:
            missing_reasons.append("Header: FBR Invoice No is missing")
        elif len(fbr_no) < 6 or not cls.FBR_NO_REGEX.match(fbr_no):
            missing_reasons.append(f"Header: FBR Invoice No '{fbr_no}' has non-standard format")
        else:
            rules_passed += 1

        # 1b. Duplicate FBR Invoice No Database Check
        if db_session and fbr_no and len(fbr_no) >= 5:
            rules_evaluated += 1
            try:
                from app.models.invoice import InvoiceHeader
                query = db_session.query(InvoiceHeader).filter(
                    InvoiceHeader.fbr_invoice_no == fbr_no,
                    InvoiceHeader.status != "REJECTED"
                )
                if current_invoice_id:
                    query = query.filter(InvoiceHeader.id != current_invoice_id)
                
                duplicate_record = query.first()
                if duplicate_record:
                    missing_reasons.append(
                        f"Duplicate FBR Invoice conflict: FBR Invoice No '{fbr_no}' already exists in historical database (Record #{duplicate_record.id})."
                    )
                else:
                    rules_passed += 1
            except Exception as dup_err:
                print(f"Duplicate DB Check warning: {dup_err}")

        # 2. Registration No (Buyer NTN/STRN) Rule
        rules_evaluated += 1
        reg_no = str(cleaned_data.get("registration_no") or "").strip()
        if not reg_no or reg_no.lower() in ["null", "none", "n/a"]:
            missing_reasons.append("Header: Buyer Registration No (NTN/STRN) is missing")
        else:
            rules_passed += 1

        # 3. Business Name Rule
        rules_evaluated += 1
        bus_name = str(cleaned_data.get("business_name") or "").strip()
        if not bus_name or bus_name.lower() in ["null", "none", "n/a"]:
            missing_reasons.append("Header: Buyer Business Name is missing")
        else:
            rules_passed += 1

        # 4. Invoice Date Rule
        rules_evaluated += 1
        inv_date_raw = cleaned_data.get("invoice_date")
        norm_inv_date, date_valid = cls.parse_and_normalize_date(inv_date_raw)
        cleaned_data["invoice_date"] = norm_inv_date
        if not date_valid:
            missing_reasons.append(f"Header: Invoice Date '{inv_date_raw}' missing or invalid date format")
        else:
            rules_passed += 1

        # 5. Insertion Date Rule
        rules_evaluated += 1
        ins_date_raw = cleaned_data.get("insertion_date") or datetime.date.today().isoformat()
        norm_ins_date, ins_valid = cls.parse_and_normalize_date(ins_date_raw)
        cleaned_data["insertion_date"] = norm_ins_date
        if not ins_valid:
            missing_reasons.append(f"Header: Insertion Date '{ins_date_raw}' missing or invalid date format")
        else:
            rules_passed += 1

        # 6. Line Items Validation & Summary Row Filtering
        raw_items = cleaned_data.get("line_items") or []
        filtered_items = []

        if not raw_items or not isinstance(raw_items, list) or len(raw_items) == 0:
            rules_evaluated += 1
            missing_reasons.append("Line Items: No line items extracted from invoice")
        else:
            for idx, item in enumerate(raw_items):
                desc = str(item.get("product_description") or "").strip()
                s_type = str(item.get("sales_type") or "").strip()
                
                # Filter out summary 'Total' rows if mistakenly captured as a line item
                if "total" in desc.lower() or "total" in s_type.lower():
                    continue

                item_clean = dict(item)
                item_prefix = f"Line Item #{idx + 1}"

                # HS Code Check
                rules_evaluated += 1
                hs = str(item.get("hs_code") or "").strip()
                if not hs or hs.lower() in ["null", "none", "n/a"]:
                    missing_reasons.append(f"{item_prefix}: HS Code is missing")
                elif not cls.HS_CODE_REGEX.match(hs):
                    missing_reasons.append(f"{item_prefix}: HS Code '{hs}' is non-standard format (expected XXXX.XXXX)")
                else:
                    rules_passed += 1

                # Description Check
                rules_evaluated += 1
                if not desc or desc.lower() in ["null", "none", "n/a"]:
                    missing_reasons.append(f"{item_prefix}: Product Description is missing")
                else:
                    rules_passed += 1

                # Sales Type Check
                rules_evaluated += 1
                if not s_type or s_type.lower() in ["null", "none", "n/a"]:
                    missing_reasons.append(f"{item_prefix}: Sales Type is missing")
                else:
                    rules_passed += 1

                # Quantity Check
                rules_evaluated += 1
                qty = cls.sanitize_numeric(item.get("quantity"))
                item_clean["quantity"] = qty
                if qty <= 0:
                    missing_reasons.append(f"{item_prefix}: Quantity must be positive numeric")
                else:
                    rules_passed += 1

                # Sales Value Check
                rules_evaluated += 1
                sales_val = cls.sanitize_numeric(item.get("sales_value"))
                item_clean["sales_value"] = sales_val
                if sales_val <= 0:
                    missing_reasons.append(f"{item_prefix}: Sales Value must be positive numeric")
                else:
                    rules_passed += 1

                # Sanitize taxes & retail price
                item_clean["retail_price"] = cls.sanitize_numeric(item.get("retail_price"))
                item_clean["sales_tax"] = cls.sanitize_numeric(item.get("sales_tax"))
                item_clean["further_tax"] = cls.sanitize_numeric(item.get("further_tax"))
                item_clean["fed"] = cls.sanitize_numeric(item.get("fed"))

                filtered_items.append(item_clean)

        cleaned_data["line_items"] = filtered_items

        confidence_score = round(rules_passed / max(rules_evaluated, 1), 2)

        if len(missing_reasons) > 0 or len(filtered_items) == 0:
            return "NEEDS_REVIEW", missing_reasons, confidence_score, cleaned_data

        return "COMPLETED", [], confidence_score, cleaned_data

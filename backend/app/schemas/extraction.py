from pydantic import BaseModel, Field
from typing import List, Optional

class LineItemSchema(BaseModel):
    sr_no: Optional[int] = Field(None, description="Serial Number (Sr. No.)")
    hs_code: Optional[str] = Field(None, description="Harmonized System Code")
    product_description: Optional[str] = Field(None, description="Product Description")
    sales_type: Optional[str] = Field(None, description="Sales Type")
    quantity: Optional[float] = Field(None, description="Quantity as numeric value")
    uom: Optional[str] = Field(None, description="Unit of Measure")
    sales_value: Optional[float] = Field(None, description="Sales Value before tax")
    retail_price: Optional[float] = Field(None, description="Retail Price")
    sales_tax: Optional[float] = Field(None, description="Sales Tax amount")
    further_tax: Optional[float] = Field(0.0, description="Further Tax amount")
    fed: Optional[float] = Field(0.0, description="Federal Excise Duty amount")

class InvoiceExtractionSchema(BaseModel):
    fbr_invoice_no: Optional[str] = Field(None, description="Unique FBR Invoice Number")
    registration_no: Optional[str] = Field(None, description="Buyer Registration No / NTN / STRN")
    business_name: Optional[str] = Field(None, description="Buyer Business Name")
    invoice_date: Optional[str] = Field(None, description="Invoice Date (YYYY-MM-DD)")
    insertion_date: Optional[str] = Field(None, description="Insertion Date (YYYY-MM-DD)")
    line_items: List[LineItemSchema] = Field(default_factory=list, description="Extracted line items")

class InvoiceHeaderResponse(BaseModel):
    id: int
    batch_id: str
    raw_file_name: str
    minio_raw_object: str
    status: str
    missing_fields_summary: Optional[str] = None
    ai_confidence: Optional[float] = 0.0
    
    fbr_invoice_no: Optional[str] = None
    registration_no: Optional[str] = None
    business_name: Optional[str] = None
    invoice_date: Optional[str] = None
    insertion_date: Optional[str] = None
    
    line_items: List[LineItemSchema] = []

    class Config:
        from_attributes = True

class InvoiceUpdateRequest(BaseModel):
    fbr_invoice_no: Optional[str] = None
    registration_no: Optional[str] = None
    business_name: Optional[str] = None
    invoice_date: Optional[str] = None
    insertion_date: Optional[str] = None
    line_items: List[LineItemSchema] = []

class BatchStatusResponse(BaseModel):
    batch_id: str
    total_files: int
    completed_files: int
    failed_files: int
    needs_review_files: int
    status: str

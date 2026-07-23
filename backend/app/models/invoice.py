from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import get_pkt_now

class BatchRecord(Base):
    __tablename__ = "batch_records"

    id = Column(String(64), primary_key=True)
    total_files = Column(Integer, default=0)
    completed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    status = Column(String(32), default="PROCESSING") # PROCESSING, COMPLETED, FAILED
    created_at = Column(DateTime(timezone=True), default=get_pkt_now)
    updated_at = Column(DateTime(timezone=True), default=get_pkt_now, onupdate=get_pkt_now)

    invoices = relationship("InvoiceHeader", back_populates="batch", cascade="all, delete-orphan")


class InvoiceHeader(Base):
    __tablename__ = "invoice_headers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String(64), ForeignKey("batch_records.id", ondelete="CASCADE"))
    raw_file_name = Column(String(255), nullable=False)
    minio_raw_object = Column(String(255), nullable=False)
    status = Column(String(32), default="PENDING") # PENDING, PROCESSING, COMPLETED, NEEDS_REVIEW, MANUALLY_VERIFIED, REJECTED, FAILED
    missing_fields_summary = Column(Text, nullable=True) # JSON array / description of missing fields
    rejection_reason = Column(Text, nullable=True) # Operator rejection reason
    ai_confidence = Column(Float, default=0.0)

    # 5 Header Fields
    fbr_invoice_no = Column(String(128), index=True, nullable=True)
    registration_no = Column(String(128), nullable=True)
    business_name = Column(String(255), nullable=True)
    invoice_date = Column(String(64), nullable=True)
    insertion_date = Column(String(64), nullable=True)

    created_at = Column(DateTime(timezone=True), default=get_pkt_now)
    updated_at = Column(DateTime(timezone=True), default=get_pkt_now, onupdate=get_pkt_now)

    batch = relationship("BatchRecord", back_populates="invoices")
    line_items = relationship("InvoiceLineItem", back_populates="header", cascade="all, delete-orphan")


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoice_headers.id", ondelete="CASCADE"))

    # 11 Line Item Fields
    sr_no = Column(Integer, nullable=True)
    hs_code = Column(String(64), nullable=True)
    product_description = Column(Text, nullable=True)
    sales_type = Column(String(128), nullable=True)
    quantity = Column(Numeric(15, 4), nullable=True)
    uom = Column(String(32), nullable=True)
    sales_value = Column(Numeric(15, 2), nullable=True)
    retail_price = Column(Numeric(15, 2), nullable=True)
    sales_tax = Column(Numeric(15, 2), nullable=True)
    further_tax = Column(Numeric(15, 2), default=0.0)
    fed = Column(Numeric(15, 2), default=0.0)

    created_at = Column(DateTime(timezone=True), default=get_pkt_now)

    header = relationship("InvoiceHeader", back_populates="line_items")

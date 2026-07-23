export interface LineItem {
  sr_no?: number | null;
  hs_code?: string | null;
  product_description?: string | null;
  sales_type?: string | null;
  quantity?: number | null;
  uom?: string | null;
  sales_value?: number | null;
  retail_price?: number | null;
  sales_tax?: number | null;
  further_tax?: number | null;
  fed?: number | null;
}

export interface InvoiceHeader {
  id: number;
  batch_id: string;
  raw_file_name: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'NEEDS_REVIEW' | 'MANUALLY_VERIFIED' | 'REJECTED' | 'FAILED';
  missing_fields_summary?: string[] | null;
  rejection_reason?: string | null;
  ai_confidence?: number | null;

  // 5 Header Fields
  fbr_invoice_no?: string | null;
  registration_no?: string | null;
  business_name?: string | null;
  invoice_date?: string | null;
  insertion_date?: string | null;

  pdf_url: string;
  line_items: LineItem[];
}

export interface BatchStatus {
  batch_id: string;
  total_files: number;
  completed_files: number;
  failed_files: number;
  needs_review_files: number;
  status: string;
}

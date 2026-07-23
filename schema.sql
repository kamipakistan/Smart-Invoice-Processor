-- Schema definition for Smart Invoice Processor (SIP)
-- Set session timezone to Pakistan Standard Time (PKT)
SET TIMEZONE = 'Asia/Karachi';

CREATE TABLE IF NOT EXISTS batch_records (
    id VARCHAR(64) PRIMARY KEY,
    total_files INT NOT NULL DEFAULT 0,
    completed_files INT NOT NULL DEFAULT 0,
    failed_files INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_headers (
    id SERIAL PRIMARY KEY,
    batch_id VARCHAR(64) REFERENCES batch_records(id) ON DELETE CASCADE,
    raw_file_name VARCHAR(255) NOT NULL,
    minio_raw_object VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, NEEDS_REVIEW, MANUALLY_VERIFIED, REJECTED, FAILED
    missing_fields_summary TEXT, -- JSON array of missing field validation errors
    rejection_reason TEXT, -- Reason provided when rejected by human operator
    ai_confidence FLOAT DEFAULT 0.0,
    
    -- 5 Header Fields
    fbr_invoice_no VARCHAR(128),
    registration_no VARCHAR(128),
    business_name VARCHAR(255),
    invoice_date VARCHAR(64),
    insertion_date VARCHAR(64),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES invoice_headers(id) ON DELETE CASCADE,
    
    -- 11 Line Item Fields
    sr_no INT,
    hs_code VARCHAR(64),
    product_description TEXT,
    sales_type VARCHAR(128),
    quantity NUMERIC(15, 4),
    uom VARCHAR(32),
    sales_value NUMERIC(15, 2),
    retail_price NUMERIC(15, 2),
    sales_tax NUMERIC(15, 2),
    further_tax NUMERIC(15, 2) DEFAULT 0.0,
    fed NUMERIC(15, 2) DEFAULT 0.0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_headers_batch_id ON invoice_headers(batch_id);
CREATE INDEX IF NOT EXISTS idx_invoice_headers_status ON invoice_headers(status);
CREATE INDEX IF NOT EXISTS idx_invoice_headers_fbr_no ON invoice_headers(fbr_invoice_no);
CREATE INDEX IF NOT EXISTS idx_line_items_invoice_id ON invoice_line_items(invoice_id);

CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(16) NOT NULL DEFAULT 'INFO',
    category VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
    event VARCHAR(255) NOT NULL,
    provider VARCHAR(32),
    model_name VARCHAR(128),
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    latency_ms DOUBLE PRECISION,
    invoice_id INT REFERENCES invoice_headers(id) ON DELETE SET NULL,
    batch_id VARCHAR(64),
    message TEXT,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_provider ON system_logs(provider);
CREATE INDEX IF NOT EXISTS idx_system_logs_invoice_id ON system_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_batch_id ON system_logs(batch_id);

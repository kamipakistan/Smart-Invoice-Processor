import { useState, useEffect } from 'react';
import FileUpload from '../components/FileUpload';
import BatchTracker from '../components/BatchTracker';
import InvoiceTable from '../components/InvoiceTable';
import HITLReviewModal from '../components/HITLReviewModal';
import type { InvoiceHeader } from '../types';

interface UploadViewProps {
  apiBase: string;
  onUploadComplete?: () => void;
}

export default function UploadView({ apiBase, onUploadComplete }: UploadViewProps) {
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceHeader[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceHeader | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const fetchInvoices = async () => {
    try {
      const url = activeBatchId
        ? `${apiBase}/api/v1/invoices?batch_id=${activeBatchId}`
        : `${apiBase}/api/v1/invoices`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error("Error loading invoices:", err);
    }
  };

  useEffect(() => {
    fetchInvoices();
    const interval = setInterval(fetchInvoices, 3000);
    return () => clearInterval(interval);
  }, [activeBatchId, apiBase]);

  const handleUploadSuccess = (batchId: string) => {
    setActiveBatchId(batchId);
    if (onUploadComplete) onUploadComplete();
  };

  return (
    <div className="space-y-6">
      {/* File Ingestion Section */}
      <FileUpload
        apiBase={apiBase}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Batch Processing Progress Tracker */}
      {activeBatchId && (
        <BatchTracker
          batchId={activeBatchId}
          apiBase={apiBase}
          onBatchComplete={() => {
            fetchInvoices();
            if (onUploadComplete) onUploadComplete();
          }}
        />
      )}

      {/* Live Table */}
      <InvoiceTable
        invoices={invoices}
        onReviewClick={inv => {
          setSelectedInvoice(inv);
          setIsModalOpen(true);
        }}
      />

      {/* HITL Review Modal if user clicks review from live table */}
      <HITLReviewModal
        invoice={selectedInvoice}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaveSuccess={() => {
          fetchInvoices();
          if (onUploadComplete) onUploadComplete();
        }}
        apiBase={apiBase}
      />
    </div>
  );
}

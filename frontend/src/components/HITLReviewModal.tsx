import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Plus, Trash2, XCircle } from 'lucide-react';
import type { InvoiceHeader, LineItem } from '../types';
import PDFViewer from './PDFViewer';

interface HITLReviewModalProps {
  invoice: InvoiceHeader | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  apiBase: string;
}

export default function HITLReviewModal({
  invoice,
  isOpen,
  onClose,
  onSaveSuccess,
  apiBase,
}: HITLReviewModalProps) {
  if (!isOpen || !invoice) return null;

  // Header form states
  const [fbrInvoiceNo, setFbrInvoiceNo] = useState<string>(invoice.fbr_invoice_no || '');
  const [registrationNo, setRegistrationNo] = useState<string>(invoice.registration_no || '');
  const [businessName, setBusinessName] = useState<string>(invoice.business_name || '');
  const [invoiceDate, setInvoiceDate] = useState<string>(invoice.invoice_date || '');
  const [insertionDate, setInsertionDate] = useState<string>(invoice.insertion_date || new Date().toISOString().split('T')[0]);

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>(invoice.line_items || []);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Rejection dialog state
  const [showRejectDialog, setShowRejectDialog] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejecting, setRejecting] = useState<boolean>(false);

  useEffect(() => {
    if (invoice) {
      setFbrInvoiceNo(invoice.fbr_invoice_no || '');
      setRegistrationNo(invoice.registration_no || '');
      setBusinessName(invoice.business_name || '');
      setInvoiceDate(invoice.invoice_date || '');
      setInsertionDate(invoice.insertion_date || new Date().toISOString().split('T')[0]);
      setLineItems(invoice.line_items || []);
      setShowRejectDialog(false);
      setRejectionReason('');
    }
  }, [invoice]);

  const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      {
        sr_no: prev.length + 1,
        hs_code: '',
        product_description: '',
        sales_type: 'Goods at standard rate (default)',
        quantity: 1,
        uom: 'PCS',
        sales_value: 0,
        retail_price: 0,
        sales_tax: 0,
        further_tax: 0,
        fed: 0,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      fbr_invoice_no: fbrInvoiceNo,
      registration_no: registrationNo,
      business_name: businessName,
      invoice_date: invoiceDate,
      insertion_date: insertionDate,
      line_items: lineItems,
    };

    try {
      const res = await fetch(`${apiBase}/api/v1/invoices/${invoice.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update invoice');
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error saving corrections.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      setErrorMsg("Please specify a reason for rejecting this document.");
      return;
    }
    setRejecting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${apiBase}/api/v1/invoices/${invoice.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to reject invoice');
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error rejecting document.');
    } finally {
      setRejecting(false);
      setShowRejectDialog(false);
    }
  };

  const missingFields = invoice.missing_fields_summary || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Human-In-The-Loop Exception Resolution
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  ID: #{invoice.id}
                </span>
              </h3>
              <p className="text-slate-400 text-xs">
                Inspect document and correct any missing or unextracted fields below.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Split-screen Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Pane: PDF Document Viewer */}
          <div className="lg:col-span-5 border-r border-slate-800 p-4 h-full bg-slate-950/50">
            <PDFViewer url={invoice.pdf_url} fileName={invoice.raw_file_name} />
          </div>

          {/* Right Pane: 16-Field Editor Form */}
          <div className="lg:col-span-7 p-6 overflow-y-auto space-y-6">
            {/* Missing Fields / Conflict Warning Banner */}
            {missingFields.length > 0 && (
              <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl">
                <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Missing / Flagged Validation Constraints ({missingFields.length})
                </h4>
                <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1 font-sans">
                  {missingFields.map((reason, i) => (
                    <li key={i} className={reason.includes("Duplicate") ? "font-bold text-red-300" : ""}>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 rounded-lg text-red-300 text-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmitApprove} className="space-y-6">
              {/* Section 1: 5 Header Fields */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <h4 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
                  Header Fields (1–5)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      1. FBR Invoice No <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fbrInvoiceNo}
                      onChange={e => setFbrInvoiceNo(e.target.value)}
                      placeholder="e.g. 2389374DIKJ91FN565683"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      2. Registration No (Buyer NTN/STRN) <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={registrationNo}
                      onChange={e => setRegistrationNo(e.target.value)}
                      placeholder="e.g. 3491029-4"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      3. Business Name (Buyer Information section only) <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                      placeholder="e.g. AL MOIZ INDUSTRIES LIMITED"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      4. Invoice Date <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={invoiceDate}
                      onChange={e => setInvoiceDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      5. Insertion Date <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={insertionDate}
                      onChange={e => setInsertionDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Line Items (Fields 6–16) */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
                    Line Item Fields (6–16) ({lineItems.length})
                  </h4>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="flex items-center gap-1 text-xs bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>

                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {lineItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="text-xs font-semibold text-slate-300">
                          Item #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="text-slate-400 block mb-1">6. Sr. No</label>
                          <input
                            type="number"
                            value={item.sr_no || idx + 1}
                            onChange={e => handleLineItemChange(idx, 'sr_no', parseInt(e.target.value) || null)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">7. HS Code</label>
                          <input
                            type="text"
                            value={item.hs_code || ''}
                            onChange={e => handleLineItemChange(idx, 'hs_code', e.target.value)}
                            placeholder="1701.9920"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-slate-400 block mb-1">8. Product Description</label>
                          <input
                            type="text"
                            value={item.product_description || ''}
                            onChange={e => handleLineItemChange(idx, 'product_description', e.target.value)}
                            placeholder="Sugar 50kg bag"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">9. Sales Type</label>
                          <input
                            type="text"
                            value={item.sales_type || ''}
                            onChange={e => handleLineItemChange(idx, 'sales_type', e.target.value)}
                            placeholder="Goods at standard rate (default)"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">10. Quantity</label>
                          <input
                            type="number"
                            step="any"
                            value={item.quantity || 0}
                            onChange={e => handleLineItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">11. UoM</label>
                          <input
                            type="text"
                            value={item.uom || ''}
                            onChange={e => handleLineItemChange(idx, 'uom', e.target.value)}
                            placeholder="MT/KG/PCS"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">12. Sales Value</label>
                          <input
                            type="number"
                            step="any"
                            value={item.sales_value || 0}
                            onChange={e => handleLineItemChange(idx, 'sales_value', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">13. Retail Price</label>
                          <input
                            type="number"
                            step="any"
                            value={item.retail_price || 0}
                            onChange={e => handleLineItemChange(idx, 'retail_price', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">14. Sales Tax</label>
                          <input
                            type="number"
                            step="any"
                            value={item.sales_tax || 0}
                            onChange={e => handleLineItemChange(idx, 'sales_tax', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">15. Further Tax</label>
                          <input
                            type="number"
                            step="any"
                            value={item.further_tax || 0}
                            onChange={e => handleLineItemChange(idx, 'further_tax', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-slate-400 block mb-1">16. FED</label>
                          <input
                            type="number"
                            step="any"
                            value={item.fed || 0}
                            onChange={e => handleLineItemChange(idx, 'fed', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Action Buttons: Reject & Approve */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(true)}
                  className="flex items-center gap-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 px-4 py-2 rounded-lg text-sm transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Invoice
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-medium px-5 py-2 rounded-lg text-sm shadow-lg hover:shadow-emerald-500/20 transition-all"
                  >
                    {submitting ? (
                      <span>Saving Verification...</span>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Approve & Save Verification</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Inline Rejection Reason Prompt Modal */}
        {showRejectDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div className="bg-slate-900 border border-red-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <XCircle className="w-6 h-6" />
                <h4 className="text-lg font-bold text-white">Reject Document</h4>
              </div>
              <p className="text-xs text-slate-300">
                Specify the reason for rejecting this document (e.g., Duplicate entry, Illegible scan, Invalid receipt).
              </p>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason here..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-lg p-3 text-sm text-white focus:outline-none"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={rejecting}
                  className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white font-semibold px-4 py-2 rounded-lg text-xs shadow-lg transition-all flex items-center gap-1.5"
                >
                  {rejecting ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { FileText, AlertTriangle, CheckCircle, Clock, XCircle, Eye, AlertOctagon } from 'lucide-react';
import type { InvoiceHeader } from '../types';

interface InvoiceTableProps {
  invoices: InvoiceHeader[];
  onReviewClick?: (invoice: InvoiceHeader) => void;
  showReviewButton?: boolean;
}

export default function InvoiceTable({
  invoices,
  onReviewClick,
  showReviewButton = true,
}: InvoiceTableProps) {
  const getStatusBadge = (invoice: InvoiceHeader) => {
    switch (invoice.status) {
      case 'COMPLETED':
      case 'MANUALLY_VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3.5 h-3.5" />
            {invoice.status === 'MANUALLY_VERIFIED' ? 'Verified' : 'Completed'}
          </span>
        );
      case 'NEEDS_REVIEW':
        const isDup = (invoice.missing_fields_summary || []).some(s => s.includes("Duplicate"));
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isDup ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
            {isDup ? <AlertOctagon className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {isDup ? 'Duplicate Conflict' : 'Needs Review'}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20" title={invoice.rejection_reason || 'Rejected'}>
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      case 'PROCESSING':
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            Processing
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
    }
  };

  if (!invoices || invoices.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-2xl">
        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">No invoices found in this view.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl">
      <table className="w-full text-left text-xs text-slate-300">
        <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">File Name</th>
            <th className="px-4 py-3">FBR Invoice No</th>
            <th className="px-4 py-3">Registration No</th>
            <th className="px-4 py-3">Business Name</th>
            <th className="px-4 py-3">Inv. Date</th>
            <th className="px-4 py-3">Items</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {invoices.map(inv => (
            <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
              <td className="px-4 py-3 font-mono text-slate-400">#{inv.id}</td>
              <td className="px-4 py-3 font-medium text-white max-w-[150px] truncate" title={inv.raw_file_name}>
                {inv.raw_file_name}
              </td>
              <td className="px-4 py-3 font-mono text-cyan-400">
                {inv.fbr_invoice_no || <span className="text-slate-600 italic">Not Extracted</span>}
              </td>
              <td className="px-4 py-3 font-mono text-slate-300">
                {inv.registration_no || <span className="text-slate-600 italic">Missing</span>}
              </td>
              <td className="px-4 py-3 text-slate-200 max-w-[180px] truncate" title={inv.business_name || ''}>
                {inv.business_name || <span className="text-slate-600 italic">Missing</span>}
              </td>
              <td className="px-4 py-3 font-mono text-slate-400">
                {inv.invoice_date || <span className="text-slate-600 italic">Missing</span>}
              </td>
              <td className="px-4 py-3 font-mono text-slate-300">
                {inv.line_items ? inv.line_items.length : 0}
              </td>
              <td className="px-4 py-3">{getStatusBadge(inv)}</td>
              <td className="px-4 py-3 text-right">
                {showReviewButton && inv.status === 'NEEDS_REVIEW' && onReviewClick && (
                  <button
                    onClick={() => onReviewClick(inv)}
                    className="inline-flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Review & Fix
                  </button>
                )}
                {inv.rejection_reason && (
                  <span className="text-[10px] text-red-400 italic block mt-0.5 truncate max-w-[120px]" title={inv.rejection_reason}>
                    {inv.rejection_reason}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

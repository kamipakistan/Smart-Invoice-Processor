import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, ArrowRight, ShieldCheck, AlertOctagon } from 'lucide-react';
import type { InvoiceHeader } from '../types';
import PDFViewer from '../components/PDFViewer';
import HITLReviewModal from '../components/HITLReviewModal';

interface ReviewViewProps {
  apiBase: string;
  onReviewResolved?: () => void;
}

export default function ReviewView({ apiBase, onReviewResolved }: ReviewViewProps) {
  const [exceptions, setExceptions] = useState<InvoiceHeader[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceHeader | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const fetchExceptions = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/invoices/exceptions`);
      if (res.ok) {
        const data: InvoiceHeader[] = await res.json();
        setExceptions(data);
        if (data.length > 0 && !activeInvoice) {
          setActiveInvoice(data[0]);
        } else if (data.length === 0) {
          setActiveInvoice(null);
        }
      }
    } catch (err) {
      console.error("Error fetching exceptions queue:", err);
    }
  };

  useEffect(() => {
    fetchExceptions();
    const interval = setInterval(fetchExceptions, 4000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const handleResolveSuccess = () => {
    fetchExceptions();
    if (onReviewResolved) onReviewResolved();
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <h3 className="text-xl font-bold text-white">Human-In-The-Loop (HITL) Queue</h3>
          </div>
          <p className="text-slate-400 text-sm">
            Invoices flagged for verification due to missing fields or duplicate FBR invoice numbers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-center">
            <span className="block text-2xl font-bold text-amber-400 font-mono">{exceptions.length}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Exceptions Pending</span>
          </div>
        </div>
      </div>

      {exceptions.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
          <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h4 className="text-lg font-bold text-white mb-1">HITL Queue is Clear!</h4>
          <p className="text-slate-400 text-sm">All uploaded invoices have been verified and processed cleanly.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Exception Queue List */}
          <div className="lg:col-span-5 space-y-3">
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider px-1">
              Pending Exceptions ({exceptions.length})
            </h4>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {exceptions.map(inv => {
                const isActive = activeInvoice?.id === inv.id;
                const isDup = (inv.missing_fields_summary || []).some(s => s.includes("Duplicate"));
                return (
                  <div
                    key={inv.id}
                    onClick={() => setActiveInvoice(inv)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-slate-800/90 border-cyan-500/50 shadow-lg shadow-cyan-500/5'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        Record #{inv.id}
                      </span>
                      {isDup ? (
                        <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                          <AlertOctagon className="w-3 h-3" />
                          Duplicate Conflict
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                          Needs Review
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-semibold text-white truncate mb-1" title={inv.raw_file_name}>
                      {inv.raw_file_name}
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-3 font-mono">
                      <span>Inv #: {inv.fbr_invoice_no || 'Missing'}</span>
                      <span>Items: {inv.line_items?.length || 0}</span>
                    </div>

                    {/* Missing Fields Preview */}
                    {inv.missing_fields_summary && inv.missing_fields_summary.length > 0 && (
                      <div className="mt-2 text-[11px] text-amber-300/90 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                        <span className="font-semibold block mb-0.5">Flagged Reason:</span>
                        <div className="truncate text-amber-200">
                          {inv.missing_fields_summary[0]}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Document Preview & Quick Launch */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between h-[600px]">
            {activeInvoice ? (
              <>
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        {activeInvoice.raw_file_name}
                        <span className="text-xs font-mono text-cyan-400">#{activeInvoice.id}</span>
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">
                        FBR No: {activeInvoice.fbr_invoice_no || 'Unextracted'}
                      </p>
                    </div>

                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-lg shadow-cyan-500/20 transition-all"
                    >
                      <span>Open HITL Editor</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inline PDF Preview */}
                  <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-slate-800">
                    <PDFViewer url={activeInvoice.pdf_url} fileName={activeInvoice.raw_file_name} />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-slate-500">
                Select an exception from the left queue to preview.
              </div>
            )}
          </div>
        </div>
      )}

      {/* HITL Editor Modal */}
      <HITLReviewModal
        invoice={activeInvoice}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaveSuccess={handleResolveSuccess}
        apiBase={apiBase}
      />
    </div>
  );
}

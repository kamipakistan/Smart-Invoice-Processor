import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import type { BatchStatus } from '../types';

interface BatchTrackerProps {
  batchId: string;
  apiBase: string;
  onBatchComplete?: () => void;
}

export default function BatchTracker({ batchId, apiBase, onBatchComplete }: BatchTrackerProps) {
  const [status, setStatus] = useState<BatchStatus | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/invoices/batch/${batchId}/status`);
      if (res.ok) {
        const data: BatchStatus = await res.json();
        setStatus(data);
        if (data.status === 'COMPLETED' && onBatchComplete) {
          onBatchComplete();
        }
      }
    } catch (err) {
      console.error("Error polling batch status:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [batchId, apiBase]);

  if (!status) return null;

  const totalProcessed = status.completed_files + status.needs_review_files + status.failed_files;
  const progressPercent = status.total_files > 0 
    ? Math.round((totalProcessed / status.total_files) * 100)
    : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Batch Processing Progress</span>
          <h4 className="text-lg font-bold text-white font-mono">{batchId}</h4>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
          <span>Polling Live Queue Status</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-950 rounded-full h-3 mb-4 overflow-hidden p-0.5 border border-slate-800">
        <div
          className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full rounded-full transition-all duration-500 shadow-sm"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Enqueued</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xl font-bold text-white">{status.total_files}</p>
        </div>

        <div className="bg-slate-950/80 border border-emerald-950/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-emerald-400 text-xs mb-1">
            <span>Auto Extracted</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-300">{status.completed_files}</p>
        </div>

        <div className="bg-slate-950/80 border border-amber-950/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-amber-400 text-xs mb-1">
            <span>HITL Review Needed</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-300">{status.needs_review_files}</p>
        </div>

        <div className="bg-slate-950/80 border border-red-950/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-red-400 text-xs mb-1">
            <span>Failed</span>
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-300">{status.failed_files}</p>
        </div>
      </div>
    </div>
  );
}

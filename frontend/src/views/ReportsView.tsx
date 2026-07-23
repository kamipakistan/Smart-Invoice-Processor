import { useState, useEffect } from 'react';
import {
  Download,
  FileSpreadsheet,
  Calendar,
  Filter,
  RefreshCw,
  Tag
} from 'lucide-react';
import type { InvoiceHeader } from '../types';
import InvoiceTable from '../components/InvoiceTable';

interface ReportsViewProps {
  apiBase: string;
}

export default function ReportsView({ apiBase }: ReportsViewProps) {
  // Utility to get today's date ISO string (YYYY-MM-DD) in Pakistan Standard Time (Asia/Karachi)
  const getPKTDateISO = (d: Date = new Date()) => {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  };

  const [startDate, setStartDate] = useState<string>(getPKTDateISO());
  const [endDate, setEndDate] = useState<string>(getPKTDateISO());
  const [dateField, setDateField] = useState<'all' | 'invoice_date' | 'insertion_date' | 'created_at'>('all');
  const [invoices, setInvoices] = useState<InvoiceHeader[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchFilteredInvoices = async () => {
    setLoading(true);
    try {
      let queryParams = [];
      if (startDate) queryParams.push(`start_date=${startDate}`);
      if (endDate) queryParams.push(`end_date=${endDate}`);
      if (dateField) queryParams.push(`date_field=${dateField}`);

      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const res = await fetch(`${apiBase}/api/v1/invoices${queryString}`);

      if (res.ok) {
        const data: InvoiceHeader[] = await res.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error('Error loading report invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilteredInvoices();
  }, [startDate, endDate, dateField, apiBase]);

  // Preset Date Range Selectors in Pakistan Standard Time
  const setPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    const now = new Date();
    const todayStr = getPKTDateISO(now);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = getPKTDateISO(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      setStartDate(getPKTDateISO(w));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getPKTDateISO(firstDay));
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  const validInvoices = invoices.filter(
    inv => inv.status === 'COMPLETED' || inv.status === 'MANUALLY_VERIFIED' || inv.status === 'NEEDS_REVIEW'
  );

  const exportUrl = `${apiBase}/api/v1/invoices/export?${
    startDate ? `start_date=${startDate}&` : ''
  }${endDate ? `end_date=${endDate}&` : ''}date_field=${dateField}`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            <h3 className="text-xl font-bold text-white">Financial Reports & Audit Exporter</h3>
          </div>
          <p className="text-slate-400 text-sm">
            Export flat 16-column Excel spreadsheets filtered by date range and selected date field target.
          </p>
        </div>

        <a
          href={exportUrl}
          download
          className={`flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all text-sm ${
            validInvoices.length === 0 ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Export Excel Report ({validInvoices.length} Invoices)</span>
        </a>
      </div>

      {/* Date Control Panel with Dropdown Filter */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-cyan-400 uppercase tracking-wider">
            <Filter className="w-4 h-4" />
            Date Filter Settings (PKT - Pakistan Standard Time)
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px] mr-1">Quick Presets:</span>
            <button
              onClick={() => setPreset('today')}
              className={`px-3 py-1 rounded-lg border transition-all ${
                startDate === getPKTDateISO() && endDate === getPKTDateISO()
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Today (Default)
            </button>
            <button
              onClick={() => setPreset('yesterday')}
              className="px-3 py-1 rounded-lg bg-slate-950 text-slate-400 border border-slate-800 hover:text-white transition-all"
            >
              Yesterday
            </button>
            <button
              onClick={() => setPreset('week')}
              className="px-3 py-1 rounded-lg bg-slate-950 text-slate-400 border border-slate-800 hover:text-white transition-all"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setPreset('month')}
              className="px-3 py-1 rounded-lg bg-slate-950 text-slate-400 border border-slate-800 hover:text-white transition-all"
            >
              This Month
            </button>
            <button
              onClick={() => setPreset('all')}
              className="px-3 py-1 rounded-lg bg-slate-950 text-slate-400 border border-slate-800 hover:text-white transition-all"
            >
              All Time
            </button>
          </div>
        </div>

        {/* Dropdown & Date Range Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Dropdown Filter for Field Target Stage */}
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              Select Field Target Stage:
            </label>
            <select
              value={dateField}
              onChange={e => setDateField(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none cursor-pointer font-sans"
            >
              <option value="all">All Date Stages</option>
              <option value="invoice_date">Invoice Date</option>
              <option value="insertion_date">Insertion Date</option>
              <option value="created_at">Created At</option>
            </select>
          </div>

          {/* From Date */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              From Date (Start - PKT)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
            />
          </div>

          {/* To Date */}
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              To Date (End - PKT)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none font-mono"
            />
          </div>

          {/* Apply Filter Button */}
          <div className="md:col-span-2">
            <button
              onClick={fetchFilteredInvoices}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Apply Filter
            </button>
          </div>
        </div>
      </div>

      {/* Filtered Invoices Table */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Processed Invoices ({validInvoices.length}) — Field Target: {dateField.replace('_', ' ').toUpperCase()}
        </h4>
        <InvoiceTable invoices={invoices} showReviewButton={false} />
      </div>
    </div>
  );
}

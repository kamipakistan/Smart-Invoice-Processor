import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Cpu,
  Zap,
  Trash2,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Code2,
  X
} from 'lucide-react';
import type { SystemLog, LogStats, PaginatedLogResponse } from '../types';

interface LogsViewProps {
  apiBase: string;
}

export default function LogsView({ apiBase }: LogsViewProps) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Filters state
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Log Modal
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/logs/stats`);
      if (res.ok) {
        const data: LogStats = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch log stats:', err);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (levelFilter !== 'ALL') params.append('level', levelFilter);
      if (categoryFilter !== 'ALL') params.append('category', categoryFilter);
      if (providerFilter !== 'ALL') params.append('provider', providerFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('page', currentPage.toString());
      params.append('limit', '30');

      const res = await fetch(`${apiBase}/api/v1/logs?${params.toString()}`);
      if (res.ok) {
        const data: PaginatedLogResponse = await res.json();
        setLogs(data.items);
        setTotalCount(data.total);
        setTotalPages(data.pages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [apiBase, levelFilter, categoryFilter, providerFilter, searchQuery, currentPage]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats();
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, apiBase, levelFilter, categoryFilter, providerFilter, searchQuery, currentPage]);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all system logs?')) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/logs/clear`, { method: 'DELETE' });
      if (res.ok) {
        fetchStats();
        fetchLogs();
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-red-950 text-red-400 border border-red-800 animate-pulse">
            <XCircle className="w-3.5 h-3.5" /> CRITICAL
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold font-mono bg-rose-950/80 text-rose-300 border border-rose-800/80">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> ERROR
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold font-mono bg-amber-950/80 text-amber-300 border border-amber-800/80">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> WARNING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/80">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> INFO
          </span>
        );
    }
  };

  const formatTokens = (num?: number | null) => {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Health Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active AI Model & Health Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" /> Model Health Status
            </span>
            <span
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                stats?.model_status === 'OPERATIONAL'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : stats?.model_status === 'WARNING'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  stats?.model_status === 'OPERATIONAL'
                    ? 'bg-emerald-400 animate-ping'
                    : stats?.model_status === 'WARNING'
                    ? 'bg-amber-400'
                    : 'bg-red-500 animate-ping'
                }`}
              />
              {stats?.model_status || 'UNKNOWN'}
            </span>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-white tracking-tight truncate">
              {stats?.active_model || 'Detecting...'}
            </div>
            <div className="text-xs text-slate-500 mt-1 uppercase font-mono">
              Provider: <span className="text-cyan-400 font-semibold">{stats?.active_provider || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Total Tokens Consumed */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> Total Tokens Consumed
            </span>
            <span className="text-xs font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
              Telemetry
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {formatTokens(stats?.total_tokens)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
              <span>Prompt: {formatTokens(stats?.prompt_tokens)}</span>
              <span>Completion: {formatTokens(stats?.completion_tokens)}</span>
            </div>
          </div>
        </div>

        {/* Total Logs & Error Warnings */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" /> Failures & Rate Limits
            </span>
            <span className="text-xs font-mono text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-md border border-rose-400/20">
              Errors
            </span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-400 font-mono">
                {stats?.error_count || 0}
              </span>
              <span className="text-xs text-slate-400">/ {stats?.total_logs || 0} total events</span>
            </div>
            <div className="text-[11px] text-amber-400 mt-1 font-mono">
              Rate Limit / Quota Alerts: {stats?.rate_limit_count || 0}
            </div>
          </div>
        </div>

        {/* Avg Latency Speed */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" /> Avg AI Latency
            </span>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20">
              Response Time
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {stats?.avg_latency_ms ? `${(stats.avg_latency_ms / 1000).toFixed(2)}s` : '0.00s'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              Raw latency: {stats?.avg_latency_ms || 0} ms
            </div>
          </div>
        </div>
      </div>

      {/* Control & Filtering Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search event title, error message, or model..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Level Filter */}
            <select
              value={levelFilter}
              onChange={e => {
                setLevelFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={e => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Categories</option>
              <option value="AI_PROVIDER">AI Provider</option>
              <option value="CELERY_PIPELINE">Celery Pipeline</option>
              <option value="MINIO_STORAGE">MinIO Storage</option>
              <option value="API">API</option>
              <option value="SYSTEM">System</option>
            </select>

            {/* Provider Filter */}
            <select
              value={providerFilter}
              onChange={e => {
                setProviderFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Providers</option>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama</option>
            </select>

            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                autoRefresh
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Toggle 5s live polling"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>

            {/* Clear Logs Button */}
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold transition-all"
              title="Clear all logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Logs Main Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider font-mono">
                <th className="py-3.5 px-4 font-semibold">Timestamp (PKT)</th>
                <th className="py-3.5 px-4 font-semibold">Level</th>
                <th className="py-3.5 px-4 font-semibold">Category</th>
                <th className="py-3.5 px-4 font-semibold">Provider / Model</th>
                <th className="py-3.5 px-4 font-semibold">Tokens (P/C/Total)</th>
                <th className="py-3.5 px-4 font-semibold">Latency</th>
                <th className="py-3.5 px-4 font-semibold">Event Summary</th>
                <th className="py-3.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
                    Fetching system telemetry logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    No logs found matching current criteria.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    {/* Timestamp */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Karachi' }) : 'N/A'}
                    </td>

                    {/* Level */}
                    <td className="py-3 px-4 whitespace-nowrap">{getLevelBadge(log.level)}</td>

                    {/* Category */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {log.category}
                      </span>
                    </td>

                    {/* Provider / Model */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.provider ? (
                        <div className="font-mono text-[11px]">
                          <span className="text-cyan-400 font-bold uppercase">{log.provider}</span>
                          {log.model_name && <span className="text-slate-400 ml-1 text-[10px]">({log.model_name})</span>}
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono text-[10px]">N/A</span>
                      )}
                    </td>

                    {/* Tokens */}
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap text-slate-300">
                      {log.total_tokens !== null && log.total_tokens !== undefined ? (
                        <span>
                          {log.prompt_tokens || 0} / {log.completion_tokens || 0} /{' '}
                          <strong className="text-amber-400">{log.total_tokens}</strong>
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Latency */}
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap text-slate-400">
                      {log.latency_ms ? `${log.latency_ms} ms` : '-'}
                    </td>

                    {/* Event Summary */}
                    <td className="py-3 px-4 max-w-md truncate">
                      <div className="font-semibold text-slate-200 truncate">{log.event}</div>
                      {log.message && <div className="text-[11px] text-slate-500 truncate">{log.message}</div>}
                    </td>

                    {/* Action button */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="View Full Details"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="font-mono">
            Showing <span className="text-white font-bold">{logs.length}</span> of{' '}
            <span className="text-white font-bold">{totalCount}</span> log events
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg disabled:opacity-40 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg disabled:opacity-40 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-xl">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm tracking-tight">{selectedLog.event}</h3>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Log ID #{selectedLog.id} •{' '}
                    {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Karachi' }) : 'N/A'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Top Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800 font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Level</span>
                  <div className="mt-1">{getLevelBadge(selectedLog.level)}</div>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Category</span>
                  <span className="text-slate-200 font-bold block mt-1">{selectedLog.category}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Provider / Model</span>
                  <span className="text-cyan-400 font-bold block mt-1">
                    {selectedLog.provider || 'N/A'} {selectedLog.model_name ? `(${selectedLog.model_name})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Latency</span>
                  <span className="text-slate-200 font-bold block mt-1">
                    {selectedLog.latency_ms ? `${selectedLog.latency_ms} ms` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Token Usage Stats if applicable */}
              {selectedLog.total_tokens !== null && selectedLog.total_tokens !== undefined && (
                <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl flex items-center justify-between font-mono">
                  <span className="text-amber-400 font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Token Consumption Breakdown
                  </span>
                  <div className="text-slate-200 space-x-4">
                    <span>Prompt: <strong className="text-amber-300">{selectedLog.prompt_tokens || 0}</strong></span>
                    <span>Completion: <strong className="text-amber-300">{selectedLog.completion_tokens || 0}</strong></span>
                    <span>Total: <strong className="text-amber-400">{selectedLog.total_tokens}</strong></span>
                  </div>
                </div>
              )}

              {/* Message / Error Body */}
              {selectedLog.message && (
                <div>
                  <h4 className="text-slate-400 font-semibold mb-2 flex items-center gap-1.5 text-xs">
                    <Code2 className="w-4 h-4 text-cyan-400" /> Log Message & Traceback
                  </h4>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 whitespace-pre-wrap overflow-x-auto leading-relaxed max-h-64">
                    {selectedLog.message}
                  </pre>
                </div>
              )}

              {/* Metadata JSON */}
              {selectedLog.metadata_json && (
                <div>
                  <h4 className="text-slate-400 font-semibold mb-2 flex items-center gap-1.5 text-xs">
                    <Layers className="w-4 h-4 text-cyan-400" /> Structured Metadata
                  </h4>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-cyan-300 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedLog.metadata_json), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

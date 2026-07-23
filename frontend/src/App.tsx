import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Database,
  Cpu,
  Layers,
  CheckCircle2
} from 'lucide-react';
import UploadView from './views/UploadView';
import ReviewView from './views/ReviewView';
import ReportsView from './views/ReportsView';
import type { InvoiceHeader } from './types';

const getApiBase = () => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && envUrl !== 'http://localhost:8001') return envUrl;
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `http://${window.location.hostname}:8001`;
  }
  return 'http://localhost:8001';
};

const API_BASE = getApiBase();

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'review' | 'reports'>('upload');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);

  // Poll pending exceptions count
  const fetchExceptionsCount = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/invoices/exceptions`);
      if (res.ok) {
        const data: InvoiceHeader[] = await res.json();
        setPendingReviewCount(data.length);
        setBackendOnline(true);
      }
    } catch (err) {
      console.error('Error connecting to backend:', err);
      setBackendOnline(false);
    }
  };

  useEffect(() => {
    fetchExceptionsCount();
    const interval = setInterval(fetchExceptionsCount, 8000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    {
      id: 'upload',
      label: 'Upload & Ingest',
      icon: Upload,
      description: 'Single or batch invoice upload',
    },
    {
      id: 'review',
      label: 'HITL Review Queue',
      icon: AlertTriangle,
      badge: pendingReviewCount > 0 ? pendingReviewCount : null,
      description: 'Exception resolution & verification',
    },
    {
      id: 'reports',
      label: 'Export Reports',
      icon: FileSpreadsheet,
      description: 'Download 16-column Excel reports',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex overflow-hidden font-sans">
      {/* Mobile Header Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">SIP Invoice Processor</span>
        </div>
        <button
          onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
          className="p-2 text-slate-400 hover:text-white"
        >
          {mobileDrawerOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Left Sidebar Navigation Component */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-slate-900/95 border-r border-slate-800 flex flex-col justify-between transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'
          } ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header: Logo & Branding */}
        <div>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 shrink-0">
                <Layers className="w-6 h-6 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="font-bold text-white text-sm tracking-tight leading-none">
                    Smart Invoice
                  </h1>
                  <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">
                    Processor
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-xs transition-all relative group ${isActive
                    ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/10 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`} />

                  {!sidebarCollapsed && (
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="truncate font-semibold">{item.label}</div>
                      <div className="text-[10px] text-slate-500 truncate font-normal">{item.description}</div>
                    </div>
                  )}

                  {item.badge !== null && item.badge !== undefined && (
                    <span
                      className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${isActive
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: System Health */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          {!sidebarCollapsed ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                  Services Status
                </span>
                <span className={`flex items-center gap-1 text-[10px] font-mono ${backendOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                  {backendOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                Port 8001 • Postgres: 5434
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <span
                className={`w-3 h-3 rounded-full ${backendOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}
                title={backendOnline ? 'Backend Online' : 'Backend Offline'}
              />
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Workspace Pane */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pt-16 lg:pt-0">
        <header className="bg-slate-900/60 border-b border-slate-800 px-8 py-5 hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {navItems.find(n => n.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {navItems.find(n => n.id === activeTab)?.description}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Vision AI Multi-Model Ingestion Engine
            </span>
          </div>
        </header>

        {/* Tab Content Views */}
        <div className="p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === 'upload' && <UploadView apiBase={API_BASE} onUploadComplete={fetchExceptionsCount} />}
          {activeTab === 'review' && <ReviewView apiBase={API_BASE} onReviewResolved={fetchExceptionsCount} />}
          {activeTab === 'reports' && <ReportsView apiBase={API_BASE} />}
        </div>
      </main>
    </div>
  );
}

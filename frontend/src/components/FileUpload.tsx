import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, X, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onUploadSuccess: (batchId: string) => void;
  apiBase: string;
}

export default function FileUpload({ onUploadSuccess, apiBase }: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files).filter(f => 
        f.name.toLowerCase().endsWith('.pdf') || 
        f.name.toLowerCase().endsWith('.png') || 
        f.name.toLowerCase().endsWith('.jpg') || 
        f.name.toLowerCase().endsWith('.jpeg')
      );
      if (filesArr.length > 100) {
        setErrorMsg("Maximum 100 files allowed per batch upload.");
        setSelectedFiles(filesArr.slice(0, 100));
      } else {
        setErrorMsg(null);
        setSelectedFiles(prev => [...prev, ...filesArr].slice(0, 100));
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const filesArr = Array.from(e.dataTransfer.files).filter(f => 
        f.name.toLowerCase().endsWith('.pdf') || 
        f.name.toLowerCase().endsWith('.png') || 
        f.name.toLowerCase().endsWith('.jpg') || 
        f.name.toLowerCase().endsWith('.jpeg')
      );
      setSelectedFiles(prev => [...prev, ...filesArr].slice(0, 100));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setErrorMsg(null);

    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await fetch(`${apiBase}/api/v1/invoices/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Upload failed');
      }

      const data = await res.json();
      setSelectedFiles([]);
      onUploadSuccess(data.batch_id);
    } catch (err: any) {
      console.error(err);
      const msg = err.message === 'Failed to fetch'
        ? `Failed to fetch: Backend server at ${apiBase} is unreachable. Please ensure FastAPI service is running.`
        : (err.message || 'Error uploading files to server.');
      setErrorMsg(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
      <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
        <UploadCloud className="w-6 h-6 text-cyan-400" />
        Single & Batch Invoice Ingestion
      </h3>
      <p className="text-slate-400 text-sm mb-4">
        Drag & drop single or batch FBR Digital Invoices (PDF/PNG/JPG up to 100 files).
      </p>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-950/80 border border-red-800 rounded-lg text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-950/60 hover:bg-slate-950/90 rounded-xl p-8 text-center cursor-pointer transition-all duration-200 group"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
        />
        <UploadCloud className="w-12 h-12 text-slate-500 group-hover:text-cyan-400 mx-auto mb-3 transition-colors" />
        <p className="text-slate-200 font-medium text-base mb-1">
          Click to select or drag and drop invoice files here
        </p>
        <p className="text-slate-500 text-xs">Supports FBR Digital PDF Invoices up to 100 files per batch</p>
      </div>

      {/* Selected Files Preview List */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-slate-300">
              Selected Files ({selectedFiles.length} / 100)
            </span>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
            {selectedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-slate-500 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  onClick={() => removeFile(idx)}
                  className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleUploadSubmit}
            disabled={uploading}
            className="w-full mt-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-lg hover:shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Uploading & Enqueuing Pipeline...</span>
              </>
            ) : (
              <span>Start Batch Processing ({selectedFiles.length} Invoices)</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

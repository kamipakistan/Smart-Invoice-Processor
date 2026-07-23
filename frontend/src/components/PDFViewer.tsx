import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, ExternalLink } from 'lucide-react';

interface PDFViewerProps {
  url: string;
  fileName: string;
}

export default function PDFViewer({ url, fileName }: PDFViewerProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Controls Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <span className="font-medium text-slate-300 truncate max-w-[200px]" title={fileName}>
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-slate-400 min-w-[40px] text-center">{zoom}%</span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 rounded-lg transition-colors ml-1"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* PDF View Canvas / IFrame */}
      <div className="flex-1 relative overflow-auto p-2 flex items-center justify-center bg-slate-950/90">
        <iframe
          src={`${url}#toolbar=0&navpanes=0`}
          title={fileName}
          className="w-full h-full border-0 rounded-lg transition-transform duration-200"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center center'
          }}
        />
      </div>
    </div>
  );
}

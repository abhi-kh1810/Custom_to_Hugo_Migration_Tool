import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  FileCode,
  Map,
} from 'lucide-react';

export default function SitePreview({ projectId, files = [], previewUrl }) {
  const [selectedFile, setSelectedFile] = useState(
    files.find((f) => f.endsWith('.html')) || files[0] || ''
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const sitemapFile = files.find((f) => f === 'sitemap.xml');

  const getPreviewSrc = (filename) =>
    `/api/generate/${projectId}/preview-file/${filename}`;

  if (!files.length) {
    return (
      <div className="glass-card p-12 text-center">
        <FileCode className="w-12 h-12 text-surface-600 mx-auto mb-4" />
        <p className="text-surface-400">No preview available yet.</p>
        <p className="text-surface-600 text-sm mt-1">Build your site to see the preview.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Page Selector */}
        <div className="flex-1 min-w-[200px]">
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="input-field text-sm"
          >
            {htmlFiles.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {sitemapFile && (
            <a
              href={getPreviewSrc('sitemap.xml')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5"
            >
              <Map className="w-3.5 h-3.5" />
              Sitemap
            </a>
          )}
          <button
            onClick={() => {
              const iframe = document.getElementById('preview-iframe');
              if (iframe) iframe.src = iframe.src;
            }}
            className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <a
            href={getPreviewSrc(selectedFile)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </a>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-secondary !px-3 !py-2 text-xs flex items-center gap-1.5"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Preview iFrame */}
      <div
        className={`glass-card overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'fixed inset-4 z-50' : 'relative'
        }`}
      >
        {/* Browser Chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 mx-4">
            <div className="px-3 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-xs text-surface-500 truncate">
              {getPreviewSrc(selectedFile)}
            </div>
          </div>
        </div>

        {/* iFrame */}
        <iframe
          id="preview-iframe"
          src={getPreviewSrc(selectedFile)}
          className={`w-full bg-white ${isFullscreen ? 'h-[calc(100%-48px)]' : 'h-[500px] sm:h-[600px]'}`}
          title="Site Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {/* File list */}
      <div className="glass-card p-4">
        <h4 className="text-sm font-medium text-surface-300 mb-3">Generated Files ({files.length})</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {files.map((file) => (
            <a
              key={file}
              href={getPreviewSrc(file)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors text-sm text-surface-400 hover:text-white truncate"
            >
              <FileCode className="w-3.5 h-3.5 flex-shrink-0 text-primary-400" />
              <span className="truncate">{file}</span>
            </a>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

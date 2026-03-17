import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Download,
  Terminal,
  Globe,
  CheckCircle,
  XCircle,
  Loader2,
  RotateCcw,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DownloadHTTrack() {
  const [url, setUrl] = useState('');
  const [domain, setDomain] = useState(null); // domain being/last downloaded
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(null); // null | 'running' | 'done' | 'error'
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Auto-scroll console to bottom on new log lines
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleDownload = () => {
    const trimmed = url.trim();
    if (!trimmed || running) return;

    // Close any existing SSE connection
    eventSourceRef.current?.close();

    // Extract and store domain for post-completion link
    const parsedDomain = trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    setDomain(parsedDomain);

    setLogs([]);
    setRunning(true);
    setStatus('running');

    const encodedUrl = encodeURIComponent(trimmed);
    const es = new EventSource(`${API_URL}/api/httrack/run?url=${encodedUrl}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        setLogs((prev) => [
          ...prev,
          { type, text: data, id: `${Date.now()}-${Math.random()}` },
        ]);
        if (type === 'done') {
          setStatus('done');
          setRunning(false);
          es.close();
        } else if (type === 'error') {
          setStatus('error');
          setRunning(false);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setLogs((prev) => [
        ...prev,
        { type: 'error', text: 'Connection to server lost.', id: `${Date.now()}` },
      ]);
      setStatus('error');
      setRunning(false);
      es.close();
    };
  };

  const handleReset = () => {
    eventSourceRef.current?.close();
    setLogs([]);
    setStatus(null);
    setRunning(false);
    setDomain(null);
  };

  const lineColor = (type) => {
    switch (type) {
      case 'stderr': return 'text-yellow-400';
      case 'error':  return 'text-red-400';
      case 'done':   return 'text-emerald-400';
      case 'info':   return 'text-primary-400';
      default:       return 'text-surface-300';
    }
  };

  return (
    <div className="page-container space-y-8">
      {/* Header */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <h1 className="section-title">Download Site via HTTrack</h1>
        <p className="section-subtitle">
          Enter a website URL to download and migrate it using the HTTrack migration workflow.
        </p>
      </motion.div>

      {/* URL Input Card */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="glass-card p-6 space-y-4"
      >
        <label className="block text-sm font-medium text-surface-300">
          Site URL
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com"
              disabled={running}
              className="input-field pl-10 disabled:opacity-50 disabled:cursor-not-allowed"
              onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
            />
          </div>
          <button
            onClick={handleDownload}
            disabled={running || !url.trim()}
            className="btn btn-primary px-6 gap-2 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{running ? 'Running…' : 'Download'}</span>
          </button>
          {(logs.length > 0 && !running) && (
            <button
              onClick={handleReset}
              className="btn btn-secondary px-4 gap-2 flex items-center"
              title="Clear output"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-surface-500">
          The URL will be saved to <span className="text-surface-400 font-mono">sites.txt</span> and
          the full migration workflow will run automatically.
        </p>
      </motion.div>

      {/* Console Output */}
      {logs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass-card overflow-hidden"
        >
          {/* Console header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/20">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-surface-400" />
              <span className="text-sm font-medium text-surface-300">Console Output</span>
              <span className="text-xs text-surface-600">({logs.length} lines)</span>
            </div>
            <div className="flex items-center gap-2">
              {status === 'running' && (
                <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Running
                </span>
              )}
              {status === 'done' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Completed
                </span>
              )}
              {status === 'error' && (
                <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  Error
                </span>
              )}
            </div>
          </div>

          {/* Log lines */}
          <div className="p-4 font-mono text-xs leading-5 overflow-y-auto max-h-[520px] bg-black/40 space-y-px">
            {logs.map((log) => (
              <div key={log.id} className={`flex gap-2 ${lineColor(log.type)}`}>
                <span className="text-surface-700 select-none flex-shrink-0">›</span>
                <span className="whitespace-pre-wrap break-all">{log.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </motion.div>
      )}

      {/* Completion card — shown after a successful run */}
      {status === 'done' && domain && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-card p-6 border border-emerald-500/20 bg-emerald-500/5"
        >
          <div className="flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-emerald-300 mb-1">
                Site downloaded and ready
              </h3>
              <p className="text-sm text-surface-400 mb-1">
                The raw download folder has been removed and the reorganised site has been moved to:
              </p>
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="w-4 h-4 text-primary-400 flex-shrink-0" />
                <code className="text-sm text-primary-300 font-mono break-all">
                  sites/{domain}/
                </code>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to={`/fetch?domain=${encodeURIComponent(domain)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  View site in Fetch Site
                </Link>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-surface-800 hover:bg-surface-700 border border-surface-600 text-surface-300 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Download another site
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

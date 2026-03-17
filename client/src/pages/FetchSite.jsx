import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
  Search,
  FolderOpen,
  Folder,
  FileCode,
  FileImage,
  FileType,
  File,
  Code2,
  ChevronRight,
  ChevronDown,
  Palette,
  Package,
  Zap,
  Terminal,
  LayoutTemplate,
  BookOpen,
  Hash,
  Monitor,
  Square,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { convertToHugo, serveHugoSite, stopHugoServer } from '../utils/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// ── Category config ──────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  html:   { label: 'HTML Pages',  color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20',   icon: FileCode  },
  css:    { label: 'Stylesheets', color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',       icon: Palette   },
  js:     { label: 'JavaScript',  color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',   icon: Code2     },
  images: { label: 'Images',      color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: FileImage  },
  fonts:  { label: 'Fonts',       color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20',   icon: FileType  },
  files:  { label: 'Downloads',   color: 'text-pink-400',    bg: 'bg-pink-500/10 border-pink-500/20',       icon: Package   },
  other:  { label: 'Other',       color: 'text-surface-400', bg: 'bg-surface-800 border-surface-700',       icon: File      },
};

function FileIcon({ category, className = 'w-4 h-4 flex-shrink-0' }) {
  const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  const Icon = cfg.icon;
  return <Icon className={`${className} ${cfg.color}`} />;
}

// ── Summary badges ───────────────────────────────────────────────────
function SummaryBadges({ summary }) {
  const keys = ['html', 'css', 'js', 'images', 'fonts', 'files', 'other'];
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((key) => {
        const count = summary[key] || 0;
        if (!count) return null;
        const cfg = CATEGORY_CONFIG[key];
        const Icon = cfg.icon;
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {count} {cfg.label}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-surface-800 border-surface-600 text-white">
        <File className="w-3.5 h-3.5" />
        {summary.total} Total
      </span>
    </div>
  );
}

// ── Recursive folder-tree node ────────────────────────────────────────
function TreeNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2); // auto-expand first 2 levels

  if (node.type === 'file') {
    return (
      <a
        href={`${API_URL}${node.url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileIcon category={node.category} />
        <span className="text-sm text-surface-300 group-hover:text-white truncate flex-1 min-w-0 transition-colors">
          {node.name}
        </span>
        {node.title && (
          <span className="text-xs text-surface-600 truncate hidden sm:block max-w-[200px]">
            {node.title}
          </span>
        )}
        <span className="text-[11px] text-surface-600 flex-shrink-0 ml-1">{node.size}</span>
        <ExternalLink className="w-3 h-3 text-surface-700 group-hover:text-primary-400 flex-shrink-0 transition-colors" />
      </a>
    );
  }

  // Directory node
  const hasChildren = node.children?.length > 0;
  const fileCount = node.children?.filter((c) => c.type === 'file').length || 0;
  const dirCount  = node.children?.filter((c) => c.type === 'directory').length || 0;

  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />}
        {open
          ? <FolderOpen className="w-4 h-4 text-primary-400 flex-shrink-0" />
          : <Folder className="w-4 h-4 text-primary-400 flex-shrink-0" />}
        <span className="text-sm font-medium text-white flex-1 min-w-0 truncate">{node.name}</span>
        {hasChildren && (
          <span className="text-[11px] text-surface-600 flex-shrink-0">
            {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? 's' : ''}`}
            {fileCount > 0 && dirCount > 0 && ', '}
            {dirCount > 0 && `${dirCount} folder${dirCount !== 1 ? 's' : ''}`}
          </span>
        )}
      </button>
      {open && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ── Main page ────────────────────────────────────────────────────────
export default function FetchSite() {
  const [url, setUrl]             = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult]       = useState(null);
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'pages'

  // Pre-fill domain and auto-fetch if redirected from DownloadHTTrack page
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const prefilledDomain = searchParams.get('domain');
    if (!prefilledDomain) return;
    setUrl(prefilledDomain);
    // Auto-trigger the fetch
    setIsChecking(true);
    setResult(null);
    fetch(`${API_URL}/api/sites/check?url=${encodeURIComponent(prefilledDomain)}`)
      .then((res) => res.json())
      .then((data) => {
        setResult(data);
        if (data.found) {
          toast.success(`Found "${data.domain}" — ${data.summary?.total ?? 0} files (HTML, CSS, JS, images, fonts)`);
        } else {
          toast.error(`No local folder found for "${data.domain}"`);
        }
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to fetch site info');
      })
      .finally(() => setIsChecking(false));
  }, [searchParams]);

  // Hugo conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [convertResult, setConvertResult] = useState(null);

  // Hugo local server state
  const [isServing, setIsServing] = useState(false);
  const [serveStatus, setServeStatus] = useState(null); // null | { url, domain }

  const handleConvert = async () => {
    if (!result?.domain) return;
    setIsConverting(true);
    setConvertResult(null);
    setServeStatus(null); // reset server status on new conversion
    try {
      const data = await convertToHugo(result.domain);
      setConvertResult(data);
      toast.success(`Hugo site created — ${data.pageCount ?? 0} pages converted`);
    } catch (err) {
      console.error('Hugo convert error:', err);
      const msg = err.response?.data?.error || err.message || 'Conversion failed';
      setConvertResult({ success: false, error: msg, logs: err.response?.data?.logs });
      toast.error(msg);
    } finally {
      setIsConverting(false);
    }
  };

  const handleServe = async () => {
    const domain = convertResult?.domain || result?.domain;
    if (!domain) return;
    setIsServing(true);
    try {
      const data = await serveHugoSite(domain);
      setServeStatus({ url: data.url, domain: data.domain });
      toast.success(`Hugo server running at ${data.url}`);
      // Open in browser automatically
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Hugo serve error:', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to start server');
    } finally {
      setIsServing(false);
    }
  };

  const handleStopServer = async () => {
    try {
      await stopHugoServer();
      setServeStatus(null);
      toast.success('Hugo server stopped');
    } catch (err) {
      toast.error('Failed to stop server');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) { toast.error('Please enter a URL or domain name'); return; }

    setIsChecking(true);
    setResult(null);

    try {
      const response = await fetch(
        `${API_URL}/api/sites/check?url=${encodeURIComponent(url.trim())}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to check site');
      setResult(data);
      setConvertResult(null); // reset on each new fetch
      if (data.found) {
        toast.success(
          `Found "${data.domain}" — ${data.summary?.total ?? 0} files (HTML, CSS, JS, images, fonts)`
        );
      } else {
        toast.error(`No local folder found for "${data.domain}"`);
      }
    } catch (err) {
      console.error('Fetch site error:', err);
      toast.error(err.message || 'Failed to fetch site info');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Fetch Site from Server</h1>
          <p className="text-surface-400">
            Enter a website URL — serves all HTML, CSS, JS, images &amp; fonts directly from the
            matching local folder
          </p>
        </div>
        <Link to="/" className="btn-secondary flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Input Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="url" className="block text-sm font-semibold text-surface-300 mb-2 tracking-wide uppercase">
                Website URL or Domain
              </label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400 pointer-events-none" />
                <input
                  type="text"
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.knowpneumonia.sg  or  www.knowpneumonia.sg"
                  className="w-full pl-12 pr-4 py-3.5 bg-surface-900 border border-surface-700 text-white placeholder-surface-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isChecking}
                />
              </div>
              <p className="mt-2 text-xs text-surface-500">
                Folder must exist at{' '}
                <code className="text-primary-400">sites/&lt;domain&gt;/</code> on the server.
                All static assets (CSS, JS, images, fonts) are served automatically.
              </p>
            </div>

            <button
              type="submit"
              disabled={isChecking || !url.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isChecking ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Scanning folder...</>
              ) : (
                <><Search className="w-5 h-5" />Fetch Site</>
              )}
            </button>
          </form>
        </motion.div>

        {/* Result Card */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key={result.domain}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -10 }}
              className="glass-card overflow-hidden"
            >
              {/* ─ Status bar ─ */}
              <div className="p-6 border-b border-white/[0.06]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {result.found
                      ? <CheckCircle2 className="w-7 h-7 text-green-400 flex-shrink-0" />
                      : <XCircle className="w-7 h-7 text-red-400 flex-shrink-0" />}
                    <div>
                      <h3 className="font-semibold text-white text-lg leading-tight">{result.domain}</h3>
                      <p className="text-sm text-surface-400 mt-0.5">
                        {result.found
                          ? `${result.summary?.total ?? 0} files — HTML, CSS, JS, images, fonts & more`
                          : 'No matching folder on server'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Summary badges */}
                {result.found && result.summary && (
                  <div className="mt-4">
                    <SummaryBadges summary={result.summary} />
                  </div>
                )}
              </div>

              {result.found && (
                <>
                  {/* ─ Tabs ─ */}
                  <div className="flex border-b border-white/[0.06]">
                    {[
                      { id: 'tree',  label: 'All Files (Folder Tree)' },
                      { id: 'pages', label: `HTML Pages (${result.pages?.length ?? 0})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === tab.id
                            ? 'border-primary-500 text-white'
                            : 'border-transparent text-surface-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* ─ Tab content ─ */}
                  <div className="p-4 max-h-[540px] overflow-y-auto">
                    {activeTab === 'tree' && result.tree && (
                      <div className="space-y-0.5">
                        <TreeNode node={result.tree} depth={0} />
                      </div>
                    )}

                    {activeTab === 'pages' && (
                      <div className="space-y-2">
                        {result.pages?.length > 0 ? (
                          result.pages.map((page) => (
                            <a
                              key={page.path}
                              href={`${API_URL}${page.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-3 rounded-xl bg-surface-900/60 border border-surface-700 hover:border-primary-500/40 hover:bg-primary-500/5 transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText className="w-4 h-4 text-orange-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{page.title}</p>
                                  <p className="text-xs text-surface-500 truncate">{page.path}</p>
                                </div>
                              </div>
                              <ExternalLink className="w-4 h-4 text-surface-600 group-hover:text-primary-400 flex-shrink-0 ml-3 transition-colors" />
                            </a>
                          ))
                        ) : (
                          <p className="text-sm text-surface-500 text-center py-8">No HTML pages found</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ─ Convert into Hugo button ─ */}
              {result.found && <div className="px-6 py-5 border-t border-white/[0.06]">
                <button
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200
                    bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500
                    disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-purple-900/30"
                >
                  {isConverting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Converting to Hugo…</>
                  ) : (
                    <><Zap className="w-5 h-5" />Convert into Hugo</>
                  )}
                </button>

                {/* Conversion result */}
                {convertResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-4 rounded-xl border p-4 ${
                      convertResult.success
                        ? 'bg-green-500/10 border-green-500/20'
                        : 'bg-red-500/10 border-red-500/20'
                    }`}
                  >
                    {convertResult.success ? (
                      <>
                        <div className="flex items-center gap-2 mb-4">
                          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                          <span className="font-semibold text-green-300 text-sm">Hugo site created successfully</span>
                          {convertResult.pageCount != null && (
                            <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium">
                              <Hash className="w-3 h-3" />
                              {convertResult.pageCount} page{convertResult.pageCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {/* Core metadata grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 text-xs">
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <span className="text-surface-500 block mb-0.5">Location</span>
                            <code className="text-green-300 break-all">{convertResult.hugoDir}</code>
                          </div>
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <span className="text-surface-500 block mb-0.5">Base URL</span>
                            <code className="text-green-300 break-all">{convertResult.baseURL}</code>
                          </div>
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <span className="text-surface-500 block mb-0.5">Language</span>
                            <code className="text-green-300">{convertResult.lang}</code>
                          </div>
                          {convertResult.siteTitle && (
                            <div className="bg-white/[0.04] rounded-lg p-2.5">
                              <span className="text-surface-500 block mb-0.5">Site Title</span>
                              <span className="text-green-200 truncate block">{convertResult.siteTitle}</span>
                            </div>
                          )}
                          {convertResult.description && (
                            <div className="bg-white/[0.04] rounded-lg p-2.5 sm:col-span-2">
                              <span className="text-surface-500 block mb-0.5">Description</span>
                              <span className="text-green-200 text-xs leading-relaxed">{convertResult.description}</span>
                            </div>
                          )}
                          {convertResult.keywords && (
                            <div className="bg-white/[0.04] rounded-lg p-2.5 sm:col-span-2">
                              <span className="text-surface-500 block mb-0.5">Keywords</span>
                              <span className="text-green-200 text-xs leading-relaxed">{convertResult.keywords}</span>
                            </div>
                          )}
                          {convertResult.copiedFolders?.length > 0 && (
                            <div className="bg-white/[0.04] rounded-lg p-2.5 sm:col-span-2">
                              <span className="text-surface-500 block mb-1">Copied to static/</span>
                              <div className="flex flex-wrap gap-1.5">
                                {convertResult.copiedFolders.map((f) => (
                                  <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-300 text-[11px] font-medium">
                                    <CheckCircle2 className="w-3 h-3" />{f}/
                                  </span>
                                ))}
                                {convertResult.skippedFolders?.map((f) => (
                                  <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-700 border border-surface-600 text-surface-400 text-[11px]">
                                    {f}/ (not found)
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Pages table */}
                        {convertResult.pages?.length > 0 && (
                          <details className="group mb-3">
                            <summary className="flex items-center gap-1.5 text-xs text-surface-300 cursor-pointer hover:text-white transition-colors select-none py-1">
                              <LayoutTemplate className="w-3.5 h-3.5 text-violet-400" />
                              <span className="font-medium">Pages converted ({convertResult.pages.length})</span>
                              <ChevronDown className="w-3 h-3 ml-auto opacity-50 group-open:rotate-180 transition-transform" />
                            </summary>
                            <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.06]">
                              {/* Header row */}
                              <div className="grid grid-cols-[1fr_1.4fr_1.4fr] gap-0 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider">
                                <span>Slug / Title</span>
                                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />Content file</span>
                                <span className="flex items-center gap-1"><LayoutTemplate className="w-3 h-3" />Layout file</span>
                              </div>
                              {/* Data rows */}
                              {convertResult.pages.map((page) => (
                                <div
                                  key={page.slug}
                                  className="grid grid-cols-[1fr_1.4fr_1.4fr] gap-0 px-3 py-2 border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                                >
                                  <div className="min-w-0 pr-2">
                                    <p className="text-[11px] font-medium text-white truncate">{page.slug}</p>
                                    {page.title && page.title !== page.slug && (
                                      <p className="text-[10px] text-surface-500 truncate mt-0.5">{page.title}</p>
                                    )}
                                  </div>
                                  <code className="text-[10px] text-blue-300/80 truncate pr-2 self-center">
                                    {page.contentFile}
                                  </code>
                                  <code className="text-[10px] text-violet-300/80 truncate self-center">
                                    {page.layoutFile}
                                  </code>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* Build log */}
                        {convertResult.logs && (
                          <details className="group">
                            <summary className="flex items-center gap-1.5 text-xs text-surface-400 cursor-pointer hover:text-white transition-colors select-none">
                              <Terminal className="w-3.5 h-3.5" />
                              View build log
                              <ChevronDown className="w-3 h-3 ml-1 opacity-50 group-open:rotate-180 transition-transform" />
                            </summary>
                            <pre className="mt-2 text-[11px] leading-relaxed text-surface-300 bg-surface-900/80 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {convertResult.logs.join('\n')}
                            </pre>
                          </details>
                        )}

                        {/* ── Display in Local ───────────────────────────────── */}
                        <div className="mt-4 pt-3 border-t border-white/[0.08]">
                          {serveStatus ? (
                            <div className="space-y-2">
                              {/* Running indicator */}
                              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
                                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />
                                <span className="text-cyan-300 font-medium">Hugo server running</span>
                                <a
                                  href={serveStatus.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto flex items-center gap-1 text-cyan-200 hover:text-white underline underline-offset-2 transition-colors"
                                >
                                  {serveStatus.url}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              {/* Open + Stop row */}
                              <div className="flex gap-2">
                                <a
                                  href={serveStatus.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm
                                    bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500
                                    text-white shadow-lg shadow-cyan-900/30 transition-all"
                                >
                                  <Monitor className="w-4 h-4" />
                                  Open in Browser
                                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                                </a>
                                <button
                                  onClick={handleStopServer}
                                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm
                                    bg-surface-800 hover:bg-red-500/10 border border-surface-600 hover:border-red-500/40
                                    text-surface-300 hover:text-red-300 transition-all"
                                >
                                  <Square className="w-3.5 h-3.5" />
                                  Stop
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={handleServe}
                              disabled={isServing}
                              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200
                                bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500
                                disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-cyan-900/30"
                            >
                              {isServing ? (
                                <><Loader2 className="w-5 h-5 animate-spin" />Starting server…</>
                              ) : (
                                <><Monitor className="w-5 h-5" />Display in Local</>
                              )}
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-2">
                        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-red-300 text-sm mb-1">Conversion failed</p>
                          <p className="text-xs text-red-200/70">{convertResult.error}</p>
                          {convertResult.logs && (
                            <pre className="mt-2 text-[11px] leading-relaxed text-surface-300 bg-surface-900/80 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                              {convertResult.logs.join('\n')}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>}

              {/* ─ Not found helper ─ */}
              {!result.found && (
                <div className="p-6">
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <p className="text-sm text-yellow-300 font-medium mb-2">How to add this site:</p>
                    <ol className="text-xs text-yellow-200/70 space-y-1.5 list-decimal list-inside">
                      <li>
                        Download the site with HTTrack into a folder named{' '}
                        <code className="text-yellow-300">{result.domain}</code>
                      </li>
                      <li>
                        Place the folder at{' '}
                        <code className="text-yellow-300">sites/{result.domain}/</code> on the server
                      </li>
                      <li>Submit again — all HTML, CSS, JS, images &amp; fonts will be available instantly</li>
                    </ol>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-6"
        >
          <h3 className="font-semibold mb-3 text-white">How it works</h3>
          <ol className="space-y-2 text-sm text-surface-400">
            <li className="flex gap-3">
              <span className="font-semibold text-primary-500">1.</span>
              <span>Download a website with HTTrack and place the output in <code className="text-primary-400">sites/&lt;domain&gt;/</code> on the server</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary-500">2.</span>
              <span>Enter the URL — the server scans <em>all</em> files: HTML, CSS, JS, images, fonts, PDFs</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary-500">3.</span>
              <span>Browse the complete folder tree here and click any file to open it directly</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary-500">4.</span>
              <span>All assets are served live — no copy or conversion needed</span>
            </li>
          </ol>
        </motion.div>
      </div>
    </div>
  );
}
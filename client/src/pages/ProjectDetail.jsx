import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Hammer,
  Download,
  Eye,
  FileCode,
  Palette,
  Braces,
  ImageIcon,
  Map,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useProject } from '../hooks/useProject';
import SitePreview from '../components/Preview/SitePreview';
import FileUploader from '../components/FileUpload/FileUploader';
import {
  buildSite,
  getPreview,
  getDownloadUrl,
  uploadHTML,
  uploadCSS,
  uploadJS,
  uploadImages,
  deleteProject,
} from '../utils/api';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { project, loading, error, refetch } = useProject(id);

  const [building, setBuilding] = useState(false);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [activeUpload, setActiveUpload] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // Load preview if site is built
  useEffect(() => {
    if (project?.status === 'built') {
      loadPreview();
    }
  }, [project?.status]);

  const loadPreview = async () => {
    try {
      const res = await getPreview(id);
      setPreviewFiles(res.data.files || []);
    } catch (err) {
      // Preview not ready yet
    }
  };

  const handleBuild = async () => {
    try {
      setBuilding(true);
      const res = await buildSite(id);
      toast.success('Site built successfully!');
      await refetch();
      await loadPreview();
      setShowPreview(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Build failed');
    } finally {
      setBuilding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete project "${project.name}"? This action cannot be undone.`)) return;
    try {
      await deleteProject(id);
      toast.success('Project deleted');
      navigate('/');
    } catch (err) {
      toast.error('Failed to delete project');
    }
  };

  const handleUpload = async () => {
    if (!uploadFiles.length || !activeUpload) return;
    try {
      setUploading(true);
      setUploadProgress(null);
      const uploadFn = {
        html: uploadHTML,
        css: uploadCSS,
        js: uploadJS,
        images: uploadImages,
      }[activeUpload];

      await uploadFn(id, uploadFiles, (p) => setUploadProgress(p));
      toast.success(`${uploadFiles.length} file(s) uploaded`);
      setUploadFiles([]);
      setActiveUpload(null);
      setUploadProgress(null);
      refetch();
    } catch (err) {
      setUploadProgress(null);
      const errorMsg = err.response?.data?.error || err.message || 'Upload failed';
      console.error('Upload error:', err);
      toast.error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="page-container text-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Project Not Found</h2>
        <p className="text-surface-400 mb-6">The project you're looking for doesn't exist.</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const statusConfig = {
    draft: { color: 'tag-primary', icon: Clock, label: 'Draft' },
    building: { color: 'tag-warning', icon: Loader2, label: 'Building...' },
    built: { color: 'tag-success', icon: CheckCircle2, label: 'Built' },
    error: { color: 'tag-error', icon: AlertCircle, label: 'Error' },
  };

  const status = statusConfig[project.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  return (
    <div className="page-container space-y-8">
      {/* Back navigation */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-surface-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </motion.div>

      {/* Project Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 sm:p-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{project.name}</h1>
              <span className={`${status.color} flex items-center gap-1`}>
                <StatusIcon className={`w-3 h-3 ${project.status === 'building' ? 'animate-spin' : ''}`} />
                {status.label}
              </span>
            </div>
              <p className="text-surface-400 mb-4">
                {project.description || 'No bio in brief provided'}
              </p>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-surface-400">
                <FileCode className="w-4 h-4 text-orange-400" />
                <span>{project.pages?.length || 0} HTML pages</span>
              </div>
              <div className="flex items-center gap-2 text-surface-400">
                <Palette className="w-4 h-4 text-blue-400" />
                <span>{project.cssFiles?.length || 0} stylesheets</span>
              </div>
              <div className="flex items-center gap-2 text-surface-400">
                <Braces className="w-4 h-4 text-yellow-400" />
                <span>{project.jsFiles?.length || 0} scripts</span>
              </div>
              <div className="flex items-center gap-2 text-surface-400">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span>{project.images?.length || 0} images</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleBuild}
              disabled={building}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {building ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Hammer className="w-4 h-4" />
              )}
              {building ? 'Building...' : 'Build Site'}
            </button>

            {project.status === 'built' && (
              <>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Eye className="w-4 h-4" />
                  {showPreview ? 'Hide' : 'Preview'}
                </button>
                <a
                  href={getDownloadUrl(id)}
                  className="btn-success flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download ZIP
                </a>
              </>
            )}

            <button
              onClick={handleDelete}
              className="btn-danger flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </motion.div>

      {/* Upload More Files */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6 sm:p-8"
      >
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary-400" />
          Add More Files
        </h2>

        {/* Upload Type Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { key: 'html', icon: FileCode, label: 'HTML', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
            { key: 'css', icon: Palette, label: 'CSS', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
            { key: 'js', icon: Braces, label: 'JS', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
            { key: 'images', icon: ImageIcon, label: 'Images', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
          ].map(({ key, icon: Icon, label, color }) => (
            <button
              key={key}
              onClick={() => {
                setActiveUpload(activeUpload === key ? null : key);
                setUploadFiles([]);
              }}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all text-sm font-medium ${
                activeUpload === key
                  ? color
                  : 'text-surface-400 bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Upload Area */}
        {activeUpload && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            <FileUploader
              type={activeUpload}
              files={uploadFiles}
              onFilesChange={setUploadFiles}
              uploading={uploading}
              uploaded={false}
              uploadProgress={uploadProgress}
            />
            {uploadFiles.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Upload {uploadFiles.length} File{uploadFiles.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Uploaded Files List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        {/* Pages */}
        {project.pages?.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-orange-400" />
              HTML Pages ({project.pages.length})
            </h3>
            <div className="space-y-2">
              {project.pages.map((page, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-sm text-surface-300"
                >
                  <FileCode className="w-3.5 h-3.5 text-orange-400/60" />
                  <span className="truncate flex-1">{page.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CSS */}
        {project.cssFiles?.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-blue-400" />
              Stylesheets ({project.cssFiles.length})
            </h3>
            <div className="space-y-2">
              {project.cssFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-sm text-surface-300"
                >
                  <Palette className="w-3.5 h-3.5 text-blue-400/60" />
                  <span className="truncate flex-1">{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JS */}
        {project.jsFiles?.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Braces className="w-4 h-4 text-yellow-400" />
              Scripts ({project.jsFiles.length})
            </h3>
            <div className="space-y-2">
              {project.jsFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-sm text-surface-300"
                >
                  <Braces className="w-3.5 h-3.5 text-yellow-400/60" />
                  <span className="truncate flex-1">{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Images */}
        {project.images?.length > 0 && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              Images ({project.images.length})
            </h3>
            <div className="space-y-2">
              {project.images.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-sm text-surface-300"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400/60" />
                  <span className="truncate flex-1">{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Preview Section */}
      {showPreview && previewFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary-400" />
            Site Preview
          </h2>
          <SitePreview
            projectId={id}
            files={previewFiles}
          />
        </motion.div>
      )}

      {/* Project Meta Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex flex-wrap gap-6 text-xs text-surface-600 pb-4"
      >
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Created: {new Date(project.createdAt).toLocaleString()}
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" />
          Updated: {new Date(project.updatedAt).toLocaleString()}
        </span>
        <span className="flex items-center gap-1.5">
          <Map className="w-3 h-3" />
          ID: {project.id}
        </span>
      </motion.div>
    </div>
  );
}

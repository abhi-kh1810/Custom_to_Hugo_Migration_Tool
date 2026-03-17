import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileCode,
  FileText,
  FileImage,
  Braces,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from 'lucide-react';

const typeConfig = {
  html: {
    icon: FileCode,
    label: 'HTML Pages',
    accept: { 'text/html': ['.html', '.htm'] },
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    textColor: 'text-orange-400',
    description: 'Drop your HTML page files here',
  },
  css: {
    icon: FileText,
    label: 'CSS Stylesheets',
    accept: { 'text/css': ['.css'] },
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    description: 'Drop your CSS stylesheet files here',
  },
  js: {
    icon: Braces,
    label: 'JavaScript Files',
    accept: { 'application/javascript': ['.js'] },
    color: 'from-yellow-500 to-amber-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    textColor: 'text-yellow-400',
    description: 'Drop your JavaScript files here',
  },
  images: {
    icon: FileImage,
    label: 'Images',
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico'] },
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    description: 'Drop your image files here',
  },
};

export default function FileUploader({ type, files, onFilesChange, uploading, uploaded, uploadProgress }) {
  const config = typeConfig[type];
  const Icon = config.icon;
  const [showAllFiles, setShowAllFiles] = useState(false);
  const PREVIEW_COUNT = 10;

  const onDrop = useCallback(
    (acceptedFiles) => {
      onFilesChange([...files, ...acceptedFiles]);
    },
    [files, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: config.accept,
    multiple: true,
    disabled: uploading,
    noClick: false,
    noDrag: false,
    maxFiles: 0, // unlimited
  });

  const removeFile = (index) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    onFilesChange(newFiles);
  };

  const clearAllFiles = () => {
    onFilesChange([]);
    setShowAllFiles(false);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const visibleFiles = showAllFiles ? files : files.slice(0, PREVIEW_COUNT);
  const hiddenCount = files.length - PREVIEW_COUNT;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${config.textColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold flex items-center gap-2">
            {config.label}
            {files.length > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.textColor}`}>
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <p className="text-surface-500 text-sm">{config.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {files.length > 0 && !uploading && (
            <button
              onClick={clearAllFiles}
              className="text-xs text-surface-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
            >
              Clear all
            </button>
          )}
          {uploaded && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Uploaded
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress Bar */}
      {uploadProgress && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-surface-400">
              Uploading chunk {uploadProgress.currentChunk} of {uploadProgress.totalChunks}
              {' '}&bull;{' '}{uploadProgress.uploaded} / {uploadProgress.total} files
            </span>
            <span className={`font-mono font-medium ${config.textColor}`}>
              {Math.round(uploadProgress.percent)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${config.color}`}
              initial={{ width: 0 }}
              animate={{ width: `${uploadProgress.percent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`upload-zone ${isDragActive ? 'upload-zone-active' : ''} ${
          uploading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${config.bgColor}`}
          >
            {isDragActive ? (
              <FolderOpen className={`w-7 h-7 ${config.textColor}`} />
            ) : (
              <Upload className={`w-6 h-6 ${config.textColor}`} />
            )}
          </div>
          {isDragActive ? (
            <p className={`${config.textColor} font-medium`}>Drop files here...</p>
          ) : (
            <>
              <p className="text-surface-300 text-sm">
                <span className={`${config.textColor} font-medium`}>Click to browse</span> or drag
                and drop
              </p>
              <p className="text-surface-600 text-xs">
                {Object.values(config.accept).flat().join(', ')} files &bull; Upload up to 1000 files at once
              </p>
            </>
          )}
        </div>
      </div>

      {/* Folder select helper for bulk uploads */}
      {!uploading && (
        <div className="flex items-center gap-3">
          <label className="btn-secondary !px-4 !py-2 text-xs cursor-pointer flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Select Folder
            <input
              type="file"
              className="hidden"
              // @ts-ignore - webkitdirectory is non-standard but widely supported
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => {
                const selected = Array.from(e.target.files || []);
                const validExts = Object.values(config.accept).flat();
                const filtered = selected.filter((f) => {
                  const ext = '.' + f.name.split('.').pop().toLowerCase();
                  return validExts.includes(ext);
                });
                if (filtered.length > 0) {
                  onFilesChange([...files, ...filtered]);
                }
                e.target.value = '';
              }}
            />
          </label>
          <span className="text-surface-600 text-xs">
            Upload entire folders for bulk imports
          </span>
        </div>
      )}

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-1"
          >
            {/* Summary bar */}
            <div className="flex items-center justify-between px-1 mb-2">
              <p className="text-xs text-surface-400">
                <span className="text-white font-medium">{files.length}</span> file{files.length !== 1 ? 's' : ''} selected &bull;{' '}
                <span className="text-white font-medium">{formatSize(files.reduce((acc, f) => acc + f.size, 0))}</span> total
              </p>
              {files.length > PREVIEW_COUNT && (
                <button
                  onClick={() => setShowAllFiles(!showAllFiles)}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
                >
                  {showAllFiles ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>Show all {files.length} <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>

            {/* File entries */}
            <div className={`space-y-1 ${showAllFiles && files.length > 50 ? 'max-h-[400px] overflow-y-auto pr-1' : ''}`}>
              {visibleFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] group hover:bg-white/[0.04] transition-colors"
                >
                  <Icon className={`w-3.5 h-3.5 ${config.textColor} flex-shrink-0 opacity-60`} />
                  <span className="text-sm text-surface-300 truncate flex-1">{file.name}</span>
                  <span className="text-xs text-surface-600 flex-shrink-0">{formatSize(file.size)}</span>
                  {!uploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(showAllFiles ? index : index);
                      }}
                      className="p-1 rounded text-surface-700 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Collapsed indicator */}
            {!showAllFiles && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllFiles(true)}
                className="w-full py-2 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.06] text-xs text-surface-500 hover:text-primary-400 hover:border-primary-500/30 transition-colors"
              >
                + {hiddenCount} more file{hiddenCount !== 1 ? 's' : ''}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

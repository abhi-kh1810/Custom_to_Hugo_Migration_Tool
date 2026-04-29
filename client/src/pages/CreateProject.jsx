import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Rocket,
  FileCode,
  Palette,
  Braces,
  ImageIcon,
  CheckCircle2,
  Loader2,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FileUploader from '../components/FileUpload/FileUploader';
import {
  createProject,
  uploadHTML,
  uploadCSS,
  uploadJS,
  uploadImages,
} from '../utils/api';

const steps = [
  { id: 'info', label: 'Project Info', icon: Info, number: 1 },
  { id: 'html', label: 'HTML Pages', icon: FileCode, number: 2 },
  { id: 'css', label: 'Stylesheets', icon: Palette, number: 3 },
  { id: 'js', label: 'JavaScript', icon: Braces, number: 4 },
  { id: 'images', label: 'Images', icon: ImageIcon, number: 5 },
];

export default function CreateProject() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [htmlFiles, setHtmlFiles] = useState([]);
  const [cssFiles, setCssFiles] = useState([]);
  const [jsFiles, setJsFiles] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);

  // Upload status & progress
  const [uploaded, setUploaded] = useState({
    html: false,
    css: false,
    js: false,
    images: false,
  });
  const [uploadProgress, setUploadProgress] = useState(null);

  const canProceed = () => {
    if (currentStep === 0) return name.trim().length > 0;
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      // Create project
      try {
        setLoading(true);
        const res = await createProject({ name, description });
        setProjectId(res.data.id);
        toast.success('Project created!');
        setCurrentStep(1);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to create project');
      } finally {
        setLoading(false);
      }
    } else if (currentStep === 1) {
      // Upload HTML
      if (htmlFiles.length > 0 && !uploaded.html) {
        try {
          setLoading(true);
          setUploadProgress(null);
          await uploadHTML(projectId, htmlFiles, (p) => setUploadProgress(p));
          setUploaded((prev) => ({ ...prev, html: true }));
          setUploadProgress(null);
          toast.success(`${htmlFiles.length} HTML file(s) uploaded`);
        } catch (err) {
          setUploadProgress(null);
          toast.error('Failed to upload HTML files');
          return;
        } finally {
          setLoading(false);
        }
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Upload CSS
      if (cssFiles.length > 0 && !uploaded.css) {
        try {
          setLoading(true);
          setUploadProgress(null);
          await uploadCSS(projectId, cssFiles, (p) => setUploadProgress(p));
          setUploaded((prev) => ({ ...prev, css: true }));
          setUploadProgress(null);
          toast.success(`${cssFiles.length} CSS file(s) uploaded`);
        } catch (err) {
          setUploadProgress(null);
          toast.error('Failed to upload CSS files');
          return;
        } finally {
          setLoading(false);
        }
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Upload JS
      if (jsFiles.length > 0 && !uploaded.js) {
        try {
          setLoading(true);
          setUploadProgress(null);
          await uploadJS(projectId, jsFiles, (p) => setUploadProgress(p));
          setUploaded((prev) => ({ ...prev, js: true }));
          setUploadProgress(null);
          toast.success(`${jsFiles.length} JS file(s) uploaded`);
        } catch (err) {
          setUploadProgress(null);
          toast.error('Failed to upload JS files');
          return;
        } finally {
          setLoading(false);
        }
      }
      setCurrentStep(4);
    } else if (currentStep === 4) {
      // Upload Images and navigate
      if (imageFiles.length > 0 && !uploaded.images) {
        try {
          setLoading(true);
          setUploadProgress(null);
          await uploadImages(projectId, imageFiles, (p) => setUploadProgress(p));
          setUploaded((prev) => ({ ...prev, images: true }));
          setUploadProgress(null);
          toast.success(`${imageFiles.length} image(s) uploaded`);
        } catch (err) {
          setUploadProgress(null);
          const errorMsg = err.response?.data?.error || err.message || 'Failed to upload images';
          console.error('Image upload error:', err);
          toast.error(errorMsg);
          return;
        } finally {
          setLoading(false);
        }
      }
      toast.success('Project setup complete!');
      navigate(`/project/${projectId}`);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="page-container max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-surface-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <h1 className="section-title">Create New Project</h1>
        <p className="section-subtitle">
          Set up your Hugo site in a few easy steps
        </p>
      </motion.div>

      {/* Step Progress */}
      <div className="mb-10">
        <div className="flex items-center justify-between relative">
          {/* Progress Line */}
          <div className="absolute top-5 left-5 right-5 h-[2px] bg-white/[0.06]">
            <motion.div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-400"
              initial={{ width: '0%' }}
              animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </div>

          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <div
                  className={`step-badge transition-all duration-300 ${
                    isCompleted
                      ? 'bg-primary-500 text-white shadow-glow'
                      : isCurrent
                      ? 'bg-primary-500/20 text-primary-300 border-2 border-primary-500'
                      : 'bg-surface-800 text-surface-500 border border-white/[0.1]'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium hidden sm:block ${
                    isCurrent ? 'text-white' : 'text-surface-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="glass-card p-6 sm:p-8 mb-8"
      >
        {/* Step 0: Project Info */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Project Information</h2>
              <p className="text-surface-400 text-sm">Give your Hugo site a name, then add Bio in Brief</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Amazing Website"
                  className="input-field"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Bio in Brief
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add Bio in Brief for your website..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: HTML */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Upload HTML Pages</h2>
              <p className="text-surface-400 text-sm">
                Add your HTML page files. Each HTML file will become a separate page in your Hugo site.
              </p>
            </div>
            <FileUploader
              type="html"
              files={htmlFiles}
              onFilesChange={setHtmlFiles}
              uploading={loading}
              uploaded={uploaded.html}
              uploadProgress={currentStep === 1 ? uploadProgress : null}
            />
          </div>
        )}

        {/* Step 2: CSS */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Upload CSS Stylesheets</h2>
              <p className="text-surface-400 text-sm">
                Add your CSS files. They will be automatically linked to all pages.
              </p>
            </div>
            <FileUploader
              type="css"
              files={cssFiles}
              onFilesChange={setCssFiles}
              uploading={loading}
              uploaded={uploaded.css}
              uploadProgress={currentStep === 2 ? uploadProgress : null}
            />
          </div>
        )}

        {/* Step 3: JS */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Upload JavaScript Files</h2>
              <p className="text-surface-400 text-sm">
                Add your JavaScript files for interactivity and functionality.
              </p>
            </div>
            <FileUploader
              type="js"
              files={jsFiles}
              onFilesChange={setJsFiles}
              uploading={loading}
              uploaded={uploaded.js}
              uploadProgress={currentStep === 3 ? uploadProgress : null}
            />
          </div>
        )}

        {/* Step 4: Images */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Upload Images</h2>
              <p className="text-surface-400 text-sm">
                Add images and media assets used in your pages.
              </p>
            </div>
            <FileUploader
              type="images"
              files={imageFiles}
              onFilesChange={setImageFiles}
              uploading={loading}
              uploaded={uploaded.images}
              uploadProgress={currentStep === 4 ? uploadProgress : null}
            />
          </div>
        )}
      </motion.div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0 || loading}
          className="btn-secondary flex items-center gap-2 disabled:opacity-30"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2 text-sm text-surface-500">
          Step {currentStep + 1} of {steps.length}
        </div>

        <button
          onClick={handleNext}
          disabled={!canProceed() || loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {currentStep === steps.length - 1 ? (
            <>
              <Rocket className="w-4 h-4" />
              Finish Setup
            </>
          ) : (
            <>
              Next
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

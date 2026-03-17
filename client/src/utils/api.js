import axios from 'axios';

// Sites API — fetch from local server-side folders
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const checkSite = async (url) => {
  const response = await axios.get(`${API_URL}/api/sites/check`, {
    params: { url },
  });
  return response.data;
};

export const listSites = async () => {
  const response = await axios.get(`${API_URL}/api/sites`);
  return response.data;
};

export const getSitePages = async (siteName) => {
  const response = await axios.get(`${API_URL}/api/sites/${siteName}/pages`);
  return response.data;
};

// Projects API (uses relative paths)
const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 min timeout for large uploads
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

// Response interceptor for error logging
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    console.error('API Error Status:', error.response?.status);
    console.error('API Error URL:', error.config?.url);
    return Promise.reject(error);
  }
);

// Projects
export const getProjects = () => api.get('/projects').then((r) => r.data);
export const getProject = (id) => api.get(`/projects/${id}`).then((r) => r.data);
export const createProject = (data) => api.post('/projects', data).then((r) => r.data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data).then((r) => r.data);
export const deleteProject = (id) => api.delete(`/projects/${id}`).then((r) => r.data);

// ─── Chunked Upload Engine ───────────────────────────────────────────
// Splits large file arrays into batches (default 50 per chunk) and
// uploads them sequentially, calling onProgress after every chunk.
const CHUNK_SIZE = 50;

async function chunkedUpload(url, files, onProgress) {
  const totalFiles = files.length;
  let uploaded = 0;
  const allResults = [];

  for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);
    const formData = new FormData();
    chunk.forEach((file) => formData.append('files', file));

    const res = await api.post(url, formData, {
      timeout: 300000,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const chunkProgress = progressEvent.loaded / progressEvent.total;
          const overallProgress = ((uploaded + chunk.length * chunkProgress) / totalFiles) * 100;
          onProgress({
            percent: Math.min(overallProgress, 99),
            uploaded,
            total: totalFiles,
            currentChunk: Math.floor(i / CHUNK_SIZE) + 1,
            totalChunks: Math.ceil(totalFiles / CHUNK_SIZE),
          });
        }
      },
    });

    uploaded += chunk.length;
    if (res.data?.data) allResults.push(...res.data.data);

    if (onProgress) {
      onProgress({
        percent: (uploaded / totalFiles) * 100,
        uploaded,
        total: totalFiles,
        currentChunk: Math.floor(i / CHUNK_SIZE) + 1,
        totalChunks: Math.ceil(totalFiles / CHUNK_SIZE),
      });
    }
  }

  return { success: true, data: allResults };
}

// File uploads — each accepts an optional onProgress callback
export const uploadHTML = (projectId, files, onProgress) =>
  chunkedUpload(`/upload/${projectId}/html`, files, onProgress);

export const uploadCSS = (projectId, files, onProgress) =>
  chunkedUpload(`/upload/${projectId}/css`, files, onProgress);

export const uploadJS = (projectId, files, onProgress) =>
  chunkedUpload(`/upload/${projectId}/js`, files, onProgress);

export const uploadImages = (projectId, files, onProgress) =>
  chunkedUpload(`/upload/${projectId}/images`, files, onProgress);

export const getProjectFiles = (projectId, type) =>
  api.get(`/upload/${projectId}/files/${type}`).then((r) => r.data);

// Generate
export const buildSite = (projectId) =>
  api.post(`/generate/${projectId}/build`).then((r) => r.data);

export const getPreview = (projectId) =>
  api.get(`/generate/${projectId}/preview`).then((r) => r.data);

export const getPreviewFileUrl = (projectId, filename) =>
  `/api/generate/${projectId}/preview-file/${filename}`;

export const getDownloadUrl = (projectId) =>
  `/api/generate/${projectId}/download`;

export const getSitemap = (projectId) =>
  api.get(`/generate/${projectId}/sitemap`).then((r) => r.data);

export const checkHugoStatus = () =>
  api.get('/generate/hugo-status').then((r) => r.data);

// Health
export const healthCheck = () => api.get('/health').then((r) => r.data);

// Hugo conversion — converts a sites/<domain>/ httrack folder into a full Hugo site
export const convertToHugo = (domain) =>
  api.post('/hugo/convert', { domain }).then((r) => r.data);

// Hugo local preview server
export const serveHugoSite = (domain) =>
  api.post('/hugo/serve', { domain }).then((r) => r.data);

export const getHugoServeStatus = () =>
  api.get('/hugo/serve').then((r) => r.data);

export const stopHugoServer = () =>
  api.delete('/hugo/serve').then((r) => r.data);

export default api;

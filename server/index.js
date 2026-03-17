import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import projectRoutes from './routes/project.js';
import uploadRoutes from './routes/upload.js';
import generateRoutes from './routes/generate.js';
import migrationRoutes from './routes/migration.js';
import sitesRoutes, { SITES_BASE_DIR } from './routes/sites.js';
import hugoRoutes from './routes/hugo.js';
import httrackRoutes from './routes/httrack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001; // Changed from 5000 to 5001

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Ensure storage directories exist
const storagePath = path.join(__dirname, 'storage', 'projects');
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}

// Static files - serve generated Hugo sites for preview
app.use('/preview', express.static(path.join(__dirname, 'storage', 'projects')));

// Serve HTTrack-downloaded sites from the sites/ directory
// URL pattern: /sites/<domain>/<file-path>
app.use('/sites', (req, res, next) => {
  // Resolve the site name from the first path segment
  const parts = req.path.split('/').filter(Boolean);
  if (!parts.length) return res.status(400).send('Site name required');

  const siteName = parts[0];
  // Basic safety: only allow hostname-safe characters
  if (!/^[a-zA-Z0-9.\-_]+$/.test(siteName)) return res.status(400).send('Invalid site name');

  const sitePath = path.join(SITES_BASE_DIR, siteName);
  // Guard against directory traversal
  if (!sitePath.startsWith(SITES_BASE_DIR)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(sitePath)) return res.status(404).send(`Site "${siteName}" not found`);

  // Serve static files relative to the site root
  const relativePath = '/' + parts.slice(1).join('/');
  const fileToServe = relativePath === '/' ? '/index.html' : relativePath;
  const absoluteFile = path.join(sitePath, fileToServe);

  // If the path is a directory, serve its index.html
  if (fs.existsSync(absoluteFile) && fs.statSync(absoluteFile).isDirectory()) {
    return res.sendFile(path.join(absoluteFile, 'index.html'));
  }

  res.sendFile(absoluteFile, (err) => {
    if (err) {
      const indexFallback = path.join(sitePath, 'index.html');
      if (fs.existsSync(indexFallback)) return res.sendFile(indexFallback);
      res.status(404).send('File not found');
    }
  });
});

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/hugo', hugoRoutes);
app.use('/api/httrack', httrackRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Hugo Site Builder API running on http://localhost:${PORT}`);
});

export default app;

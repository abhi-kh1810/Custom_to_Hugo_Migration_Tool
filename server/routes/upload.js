import { Router } from 'express';
import multer from 'multer';
import { upload } from '../middleware/upload.js';
import {
  getProject,
  addPageToProject,
  addAssetToProject,
  getProjectPath,
} from '../services/projectService.js';
import {
  saveFile,
  saveHTMLAsLayout,
  listProjectFiles,
  deleteFile,
} from '../services/fileService.js';
import path from 'path';

const router = Router();

// Multer error handling middleware
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    console.error('[MULTER ERROR]', err.code, err.message);
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  } else if (err) {
    console.error('[UPLOAD ERROR]', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
}

// POST /api/upload/:projectId/html - Upload HTML pages
router.post('/:projectId/html', upload.array('files', 1000), handleMulterError, (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      const htmlContent = file.buffer.toString('utf-8');
      const title = req.body.title || file.originalname.replace(/\.html?$/, '');

      // Save as Hugo layout (preserves full HTML)
      const result = saveHTMLAsLayout(project.path, file.originalname, htmlContent);

      addPageToProject(project.id, {
        name: file.originalname,
        slug: result.slug,
        title,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      });

      results.push(result);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/upload/:projectId/css - Upload CSS files
router.post('/:projectId/css', upload.array('files', 1000), handleMulterError, (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      const result = saveFile(project.path, 'css', file.originalname, file.buffer);
      addAssetToProject(project.id, 'css', {
        name: file.originalname,
        size: file.size,
        path: result.relativePath,
        uploadedAt: new Date().toISOString(),
      });
      results.push(result);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/upload/:projectId/js - Upload JS files
router.post('/:projectId/js', upload.array('files', 1000), handleMulterError, (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      const result = saveFile(project.path, 'js', file.originalname, file.buffer);
      addAssetToProject(project.id, 'js', {
        name: file.originalname,
        size: file.size,
        path: result.relativePath,
        uploadedAt: new Date().toISOString(),
      });
      results.push(result);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/upload/:projectId/images - Upload images
router.post('/:projectId/images', upload.array('files', 1000), handleMulterError, (req, res) => {
  try {
    console.log(`[IMAGE UPLOAD] Starting upload for project: ${req.params.projectId}`);
    console.log(`[IMAGE UPLOAD] Files received: ${req.files?.length || 0}`);
    
    const project = getProject(req.params.projectId);
    if (!project) {
      console.error('[IMAGE UPLOAD] Project not found:', req.params.projectId);
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.files || req.files.length === 0) {
      console.error('[IMAGE UPLOAD] No files in request');
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      console.log(`[IMAGE UPLOAD] Processing: ${file.originalname} (${file.size} bytes)`);
      const result = saveFile(project.path, 'image', file.originalname, file.buffer);
      addAssetToProject(project.id, 'image', {
        name: file.originalname,
        size: file.size,
        path: result.relativePath,
        uploadedAt: new Date().toISOString(),
      });
      results.push(result);
    }

    console.log(`[IMAGE UPLOAD] Successfully uploaded ${results.length} images`);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('[IMAGE UPLOAD] Error:', error.message);
    console.error('[IMAGE UPLOAD] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/upload/:projectId/files/:type - List uploaded files
router.get('/:projectId/files/:type', (req, res) => {
  try {
    const projectPath = getProjectPath(req.params.projectId);
    const files = listProjectFiles(projectPath, req.params.type);
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/upload/:projectId/file - Delete a file
router.delete('/:projectId/file', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path required' });
    }
    const deleted = deleteFile(filePath);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

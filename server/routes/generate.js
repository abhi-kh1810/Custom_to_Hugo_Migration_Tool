import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getProject, updateProject, getProjectPath } from '../services/projectService.js';
import {
  checkHugoInstalled,
  buildSite,
  buildSiteManual,
  createArchive,
} from '../services/hugoService.js';

const router = Router();

// POST /api/generate/:projectId/build - Build Hugo site
router.post('/:projectId/build', async (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    updateProject(project.id, { status: 'building' });

    let result;
    const hugoCheck = await checkHugoInstalled();

    if (hugoCheck.installed) {
      result = await buildSite(project.path);
    } else {
      // Fallback: build manually without Hugo CLI
      result = await buildSiteManual(project.path);
    }

    if (result.success) {
      updateProject(project.id, { status: 'built' });
      res.json({
        success: true,
        data: {
          message: 'Site built successfully',
          hugoInstalled: hugoCheck.installed,
          output: result.output,
          publicPath: result.publicPath,
        },
      });
    } else {
      updateProject(project.id, { status: 'error' });
      res.status(500).json({ success: false, error: result.error || result.stderr });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/generate/:projectId/preview - Get preview file list
router.get('/:projectId/preview', (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const publicPath = path.join(project.path, 'public');
    if (!fs.existsSync(publicPath)) {
      return res.status(400).json({
        success: false,
        error: 'Site has not been built yet. Please build first.',
      });
    }

    const files = [];
    function walkDir(dir, base = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = path.join(base, entry.name);
        if (entry.isDirectory()) {
          walkDir(path.join(dir, entry.name), relativePath);
        } else {
          files.push(relativePath);
        }
      }
    }
    walkDir(publicPath);

    res.json({
      success: true,
      data: {
        files,
        previewUrl: `/preview/${project.id}/public`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/generate/:projectId/preview-file/:filename - Serve a preview file
router.get('/:projectId/preview-file/*', (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const filename = req.params[0];
    const filePath = path.join(project.path, 'public', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/generate/:projectId/download - Download generated site as ZIP
router.get('/:projectId/download', async (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const publicPath = path.join(project.path, 'public');
    if (!fs.existsSync(publicPath)) {
      return res.status(400).json({
        success: false,
        error: 'Site has not been built yet. Please build first.',
      });
    }

    const zipPath = path.join(project.path, `${project.name.replace(/\s+/g, '-')}.zip`);
    await createArchive(publicPath, zipPath);

    res.download(zipPath, `${project.name.replace(/\s+/g, '-')}-hugo-site.zip`, (err) => {
      // Clean up zip after download
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/generate/:projectId/sitemap - Get sitemap
router.get('/:projectId/sitemap', (req, res) => {
  try {
    const project = getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const sitemapPath = path.join(project.path, 'public', 'sitemap.xml');
    if (!fs.existsSync(sitemapPath)) {
      return res.status(404).json({ success: false, error: 'Sitemap not found. Build the site first.' });
    }

    res.type('application/xml').sendFile(sitemapPath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/generate/hugo-status - Check Hugo CLI status
router.get('/hugo-status', async (req, res) => {
  try {
    const status = await checkHugoInstalled();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

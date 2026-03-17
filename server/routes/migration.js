import express from 'express';
import { MigrationService } from '../services/migrationService.js';

const router = express.Router();
const migrationService = new MigrationService();

/**
 * POST /api/migration/download
 * Download a website using the migration scripts
 */
router.post('/download', async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`Starting migration for: ${url}`);

    const result = await migrationService.downloadWebsite(url, {
      timeout: options.timeout || 30 * 60 * 1000,
      onProgress: (message) => {
        console.log(`Progress: ${message}`);
      },
    });

    res.json({
      success: true,
      siteName: result.siteName,
      downloadedSiteDir: result.downloadedSiteDir,
      fileCount: result.fileCount,
    });
  } catch (error) {
    console.error('Migration download error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/migration/full
 * Run full migration with all post-processing
 */
router.post('/full', async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`Starting full migration for: ${url}`);

    const result = await migrationService.fullMigration(url, {
      includeImageProcessing: options.includeImageProcessing !== false,
      includeResourcePathFixing: options.includeResourcePathFixing !== false,
      include404Page: options.include404Page !== false,
      onProgress: (message) => {
        console.log(`Progress: ${message}`);
      },
    });

    res.json({
      success: true,
      siteName: result.siteName,
      downloadedSiteDir: result.downloadedSiteDir,
    });
  } catch (error) {
    console.error('Full migration error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/migration/sites
 * List all downloaded sites
 */
router.get('/sites', async (req, res) => {
  try {
    const sites = await migrationService.listDownloadedSites();
    res.json({
      success: true,
      sites,
      count: sites.length,
    });
  } catch (error) {
    console.error('List sites error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/migration/sites/:siteName
 * Delete a downloaded site
 */
router.delete('/sites/:siteName', async (req, res) => {
  try {
    const { siteName } = req.params;
    const result = await migrationService.deleteSite(siteName);

    if (result.success) {
      res.json({
        success: true,
        message: `Site ${siteName} deleted successfully`,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || 'Site not found',
      });
    }
  } catch (error) {
    console.error('Delete site error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/migration/process-images/:siteName
 * Process images for a specific site
 */
router.post('/process-images/:siteName', async (req, res) => {
  try {
    const { siteName } = req.params;
    const result = await migrationService.processImages(siteName);

    res.json(result);
  } catch (error) {
    console.error('Process images error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/migration/fix-paths/:siteName
 * Fix resource paths for a specific site
 */
router.post('/fix-paths/:siteName', async (req, res) => {
  try {
    const { siteName } = req.params;
    const result = await migrationService.fixResourcePaths(siteName);

    res.json(result);
  } catch (error) {
    console.error('Fix paths error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/migration/create-404/:siteName
 * Create 404 page for a specific site
 */
router.post('/create-404/:siteName', async (req, res) => {
  try {
    const { siteName } = req.params;
    const result = await migrationService.create404Page(siteName);

    res.json(result);
  } catch (error) {
    console.error('Create 404 error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

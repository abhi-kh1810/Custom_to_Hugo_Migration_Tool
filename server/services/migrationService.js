import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration Service
 * Handles the complete website migration process using the ednlt-drupaldemomigrations scripts
 */
export class MigrationService {
  constructor() {
    this.migrationDir = path.join(__dirname, '../ednlt-drupaldemomigrations');
    this.publicDir = path.join(this.migrationDir, 'public');
    this.scriptsDir = path.join(this.migrationDir, 'scripts');
  }

  /**
   * Initialize migration environment
   */
  async initialize() {
    // Ensure public directory exists
    if (!fs.existsSync(this.publicDir)) {
      fs.mkdirSync(this.publicDir, { recursive: true });
    }

    // Ensure all shell scripts are executable
    await this.makeScriptsExecutable();
  }

  /**
   * Make all shell scripts executable
   */
  async makeScriptsExecutable() {
    const scripts = [
      'migrate_site.sh',
      'migrate.sh',
      'run_full_migration.sh',
      'download_and_update_fonts.sh',
      'download_and_update_srcset_images.sh',
      'download_missing_images.sh',
      'reorganize_html_by_url.sh',
    ];

    for (const script of scripts) {
      const scriptPath = path.join(this.migrationDir, script);
      if (fs.existsSync(scriptPath)) {
        try {
          await execPromise(`chmod +x "${scriptPath}"`);
          console.log(`Made ${script} executable`);
        } catch (error) {
          console.warn(`Failed to make ${script} executable:`, error.message);
        }
      }
    }

    // Make scripts in the scripts directory executable
    const scriptsInDir = [
      'create_404_page.sh',
      'download_all_images.sh',
      'download_and_transform_sitemap.sh',
      'fix_404_css_js.sh',
      'fix_all_resource_paths.sh',
      'fix_css_all_pages.py',
      'move_css_fix_to_body.py',
      'process_images_complete.sh',
      'update_all_image_paths.sh',
      'wrap_adobe_dtm_scripts.sh',
    ];

    for (const script of scriptsInDir) {
      const scriptPath = path.join(this.scriptsDir, script);
      if (fs.existsSync(scriptPath)) {
        try {
          await execPromise(`chmod +x "${scriptPath}"`);
          console.log(`Made scripts/${script} executable`);
        } catch (error) {
          console.warn(`Failed to make scripts/${script} executable:`, error.message);
        }
      }
    }
  }

  /**
   * Download website using migrate_site.sh
   */
  async downloadWebsite(url, options = {}) {
    const {
      timeout = 30 * 60 * 1000, // 30 minutes default
      maxBuffer = 100 * 1024 * 1024, // 100MB buffer
      onProgress = null,
    } = options;

    try {
      console.log(`Starting website download for: ${url}`);
      console.log(`Migration directory: ${this.migrationDir}`);

      const scriptPath = path.join(this.migrationDir, 'migrate_site.sh');

      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Migration script not found at: ${scriptPath}`);
      }

      if (onProgress) onProgress('Initializing download...');

      const { stdout, stderr } = await execPromise(`bash "${scriptPath}" "${url}"`, {
        cwd: this.migrationDir,
        maxBuffer,
        timeout,
        env: {
          ...process.env,
          LC_ALL: 'en_US.UTF-8',
          LANG: 'en_US.UTF-8',
        },
      });

      console.log('Migration stdout:', stdout);
      if (stderr) console.log('Migration stderr:', stderr);

      // Get the downloaded site directory
      const parsedUrl = new URL(url);
      const siteName = parsedUrl.hostname;
      const downloadedSiteDir = path.join(this.publicDir, siteName);

      // Wait for directory to be created and populated
      const maxRetries = 10;
      const retryDelay = 2000;

      for (let i = 0; i < maxRetries; i++) {
        if (fs.existsSync(downloadedSiteDir)) {
          const files = fs.readdirSync(downloadedSiteDir);
          if (files.length > 0) {
            console.log(`Downloaded site found with ${files.length} files/folders`);
            return {
              success: true,
              siteName,
              downloadedSiteDir,
              fileCount: files.length,
            };
          }
        }

        if (i < maxRetries - 1) {
          console.log(`Waiting for download to complete... (${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      // List what's actually in the public directory
      const publicContents = fs.existsSync(this.publicDir)
        ? fs.readdirSync(this.publicDir)
        : [];

      throw new Error(
        `Downloaded site not found at ${downloadedSiteDir}. Public directory contains: ${publicContents.join(', ')}`
      );
    } catch (error) {
      console.error('Download error:', error);
      throw new Error(`Website download failed: ${error.message}`);
    }
  }

  /**
   * Process images for a downloaded site
   */
  async processImages(siteName, options = {}) {
    const { onProgress = null } = options;

    try {
      const siteDir = path.join(this.publicDir, siteName);
      if (!fs.existsSync(siteDir)) {
        throw new Error(`Site directory not found: ${siteDir}`);
      }

      if (onProgress) onProgress('Processing images...');

      // Run image processing script
      const scriptPath = path.join(this.scriptsDir, 'process_images_complete.sh');
      
      if (fs.existsSync(scriptPath)) {
        const { stdout, stderr } = await execPromise(`bash "${scriptPath}"`, {
          cwd: this.migrationDir,
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000, // 10 minutes
        });

        console.log('Image processing stdout:', stdout);
        if (stderr) console.log('Image processing stderr:', stderr);
      } else {
        console.warn('Image processing script not found, skipping...');
      }

      return { success: true };
    } catch (error) {
      console.error('Image processing error:', error);
      // Don't fail the entire process
      return { success: false, error: error.message };
    }
  }

  /**
   * Fix resource paths in HTML files
   */
  async fixResourcePaths(siteName, options = {}) {
    const { onProgress = null } = options;

    try {
      const siteDir = path.join(this.publicDir, siteName);
      if (!fs.existsSync(siteDir)) {
        throw new Error(`Site directory not found: ${siteDir}`);
      }

      if (onProgress) onProgress('Fixing resource paths...');

      // Run resource path fixing script
      const scriptPath = path.join(this.scriptsDir, 'fix_all_resource_paths.sh');
      
      if (fs.existsSync(scriptPath)) {
        const { stdout, stderr } = await execPromise(`bash "${scriptPath}"`, {
          cwd: this.migrationDir,
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000, // 10 minutes
        });

        console.log('Resource path fixing stdout:', stdout);
        if (stderr) console.log('Resource path fixing stderr:', stderr);
      } else {
        console.warn('Resource path fixing script not found, skipping...');
      }

      return { success: true };
    } catch (error) {
      console.error('Resource path fixing error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create 404 page
   */
  async create404Page(siteName, options = {}) {
    const { onProgress = null } = options;

    try {
      const siteDir = path.join(this.publicDir, siteName);
      if (!fs.existsSync(siteDir)) {
        throw new Error(`Site directory not found: ${siteDir}`);
      }

      if (onProgress) onProgress('Creating 404 page...');

      const scriptPath = path.join(this.scriptsDir, 'create_404_page.sh');
      
      if (fs.existsSync(scriptPath)) {
        const { stdout, stderr } = await execPromise(`bash "${scriptPath}"`, {
          cwd: this.migrationDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 2 * 60 * 1000, // 2 minutes
        });

        console.log('404 page creation stdout:', stdout);
        if (stderr) console.log('404 page creation stderr:', stderr);
      } else {
        console.warn('404 page creation script not found, skipping...');
      }

      return { success: true };
    } catch (error) {
      console.error('404 page creation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Full migration process with all post-processing scripts
   */
  async fullMigration(url, options = {}) {
    const {
      includeImageProcessing = true,
      includeResourcePathFixing = true,
      include404Page = true,
      onProgress = null,
    } = options;

    try {
      await this.initialize();

      // Step 1: Download website
      if (onProgress) onProgress('Downloading website...');
      const downloadResult = await this.downloadWebsite(url, { onProgress });
      const { siteName, downloadedSiteDir } = downloadResult;

      // Step 2: Process images (optional)
      if (includeImageProcessing) {
        if (onProgress) onProgress('Processing images...');
        await this.processImages(siteName, { onProgress });
      }

      // Step 3: Fix resource paths (optional)
      if (includeResourcePathFixing) {
        if (onProgress) onProgress('Fixing resource paths...');
        await this.fixResourcePaths(siteName, { onProgress });
      }

      // Step 4: Create 404 page (optional)
      if (include404Page) {
        if (onProgress) onProgress('Creating 404 page...');
        await this.create404Page(siteName, { onProgress });
      }

      return {
        success: true,
        siteName,
        downloadedSiteDir,
      };
    } catch (error) {
      console.error('Full migration error:', error);
      throw error;
    }
  }

  /**
   * Get list of downloaded sites
   */
  async listDownloadedSites() {
    try {
      if (!fs.existsSync(this.publicDir)) {
        return [];
      }

      const entries = fs.readdirSync(this.publicDir, { withFileTypes: true });
      const sites = entries
        .filter(entry => entry.isDirectory())
        .map(entry => {
          const sitePath = path.join(this.publicDir, entry.name);
          const stats = fs.statSync(sitePath);
          const files = fs.readdirSync(sitePath);

          return {
            name: entry.name,
            path: sitePath,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            fileCount: files.length,
          };
        });

      return sites;
    } catch (error) {
      console.error('List sites error:', error);
      return [];
    }
  }

  /**
   * Delete a downloaded site
   */
  async deleteSite(siteName) {
    try {
      const siteDir = path.join(this.publicDir, siteName);
      if (fs.existsSync(siteDir)) {
        fs.rmSync(siteDir, { recursive: true, force: true });
        return { success: true };
      }
      return { success: false, error: 'Site not found' };
    } catch (error) {
      console.error('Delete site error:', error);
      return { success: false, error: error.message };
    }
  }
}

export default MigrationService;

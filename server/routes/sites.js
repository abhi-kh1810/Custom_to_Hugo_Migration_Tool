import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Base directory where all site folders live
// Place HTTrack-downloaded site folders like: sites/www.example.com/
const SITES_BASE_DIR = path.join(__dirname, '..', '..', 'sites');

// Skip these folders entirely
const SKIP_DIRS = new Set(['node_modules', '.git']);

// Extension → category mapping
const EXT_CATEGORY = {
  // HTML
  html: 'html', htm: 'html',
  // CSS
  css: 'css',
  // JavaScript
  js: 'js', mjs: 'js', cjs: 'js',
  // Images
  jpg: 'images', jpeg: 'images', png: 'images', gif: 'images',
  svg: 'images', webp: 'images', ico: 'images', avif: 'images', bmp: 'images',
  // Fonts
  woff: 'fonts', woff2: 'fonts', ttf: 'fonts', otf: 'fonts', eot: 'fonts',
  // Documents / Downloads
  pdf: 'files', doc: 'files', docx: 'files', xls: 'files', xlsx: 'files',
  // Data / config
  json: 'other', xml: 'other', txt: 'other', log: 'other', map: 'other',
  backup: 'other',
};

function getCategory(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_CATEGORY[ext] || 'other';
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sanitise the domain input:
 *  - strip protocol (http:// / https://)
 *  - strip trailing slash
 *  - prevent directory traversal
 */
function parseDomain(input) {
  if (!input) return null;
  let domain = input.trim();
  domain = domain.replace(/^https?:\/\//i, '');
  domain = domain.replace(/\/.*$/, ''); // remove any path after the hostname
  // allow only safe characters
  if (!/^[a-zA-Z0-9.\-_]+$/.test(domain)) return null;
  return domain;
}

/**
 * Recursively build a complete file tree for a site folder.
 * Returns { tree, summary } where:
 *   tree    — nested { name, type:'directory'|'file', category, size, url, children[] }
 *   summary — { html, css, js, images, fonts, files, other, total }
 */
function buildFileTree(siteDir, siteName) {
  const summary = { html: 0, css: 0, js: 0, images: 0, fonts: 0, files: 0, other: 0, total: 0 };

  function walk(dir, relPath) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
        // directories first, then files, both alpha
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return { name: path.basename(dir), type: 'directory', children: [] };
    }

    const children = [];

    for (const entry of entries) {
      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const entryAbsPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const subtree = walk(entryAbsPath, entryRelPath);
        if (subtree) children.push(subtree);
      } else {
        const category = getCategory(entry.name);
        const sizeBytes = getFileSize(entryAbsPath);

        // For HTML files try to extract page <title>
        let title = null;
        if (category === 'html') {
          try {
            const content = fs.readFileSync(entryAbsPath, 'utf8');
            const m = content.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (m) title = m[1].trim();
          } catch { /* ignore */ }
        }

        summary[category] = (summary[category] || 0) + 1;
        summary.total += 1;

        children.push({
          name: entry.name,
          type: 'file',
          category,
          size: formatSize(sizeBytes),
          sizeBytes,
          title,
          url: `/sites/${siteName}/${entryRelPath}`,
          path: `/${entryRelPath}`,
        });
      }
    }

    return {
      name: path.basename(dir),
      type: 'directory',
      path: relPath ? `/${relPath}` : '/',
      children,
    };
  }

  const tree = walk(siteDir, '');
  tree.name = siteName; // root node label = domain name
  return { tree, summary };
}

/**
 * Collect only HTML pages (index.html files) — used for the sites list endpoint.
 */
function collectPages(siteDir, siteName) {
  const pages = [];

  function walk(dir, urlPrefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    if (entries.some((e) => e.isFile() && e.name.toLowerCase() === 'index.html')) {
      const htmlPath = path.join(dir, 'index.html');
      let title = urlPrefix === '/' ? siteName : urlPrefix;
      try {
        const content = fs.readFileSync(htmlPath, 'utf8');
        const m = content.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (m) title = m[1].trim();
      } catch { /* ignore */ }

      pages.push({
        title,
        path: urlPrefix,
        url: `/sites/${siteName}${urlPrefix === '/' ? '/index.html' : urlPrefix}`,
      });
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        walk(
          path.join(dir, entry.name),
          urlPrefix === '/' ? `/${entry.name}` : `${urlPrefix}/${entry.name}`
        );
      }
    }
  }

  walk(siteDir, '/');
  return pages;
}

/**
 * GET /api/sites
 * List all available site folders with summary counts
 */
router.get('/', (req, res) => {
  try {
    if (!fs.existsSync(SITES_BASE_DIR)) {
      return res.json({ success: true, data: [] });
    }

    const entries = fs.readdirSync(SITES_BASE_DIR, { withFileTypes: true });
    const sites = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const siteDir = path.join(SITES_BASE_DIR, e.name);
        const hasIndex = fs.existsSync(path.join(siteDir, 'index.html'));
        let summary = { total: 0 };
        try {
          ({ summary } = buildFileTree(siteDir, e.name));
        } catch { /* ignore */ }
        return {
          name: e.name,
          hasIndex,
          summary,
          previewUrl: `/sites/${e.name}/index.html`,
        };
      });

    res.json({ success: true, data: sites });
  } catch (error) {
    console.error('List sites error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/check?url=https://www.example.com
 * Check if a site folder exists; return full file tree + summary
 */
router.get('/check', (req, res) => {
  try {
    const domain = parseDomain(req.query.url);

    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid URL or domain' });
    }

    const sitePath = path.join(SITES_BASE_DIR, domain);

    // Security: make sure resolved path is inside SITES_BASE_DIR
    if (!sitePath.startsWith(SITES_BASE_DIR)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!fs.existsSync(sitePath)) {
      return res.json({
        success: true,
        found: false,
        domain,
        message: `No folder found for "${domain}" in the sites directory`,
      });
    }

    // Build full file tree (all assets) + summary counts
    const { tree, summary } = buildFileTree(sitePath, domain);

    // Also extract HTML pages (with titles) for the quick-open list
    const pages = collectPages(sitePath, domain);

    res.json({
      success: true,
      found: true,
      domain,
      previewUrl: `/sites/${domain}/index.html`,
      summary,   // { html, css, js, images, fonts, files, other, total }
      tree,      // full recursive directory tree
      pages,     // just HTML pages with titles
    });
  } catch (error) {
    console.error('Check site error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/:siteName/pages
 * Return HTML pages + full file tree for a site
 */
router.get('/:siteName/pages', (req, res) => {
  try {
    const domain = parseDomain(req.params.siteName);
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid site name' });
    }

    const sitePath = path.join(SITES_BASE_DIR, domain);
    if (!sitePath.startsWith(SITES_BASE_DIR)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!fs.existsSync(sitePath)) {
      return res.status(404).json({ success: false, error: `Site "${domain}" not found` });
    }

    const { tree, summary } = buildFileTree(sitePath, domain);
    const pages = collectPages(sitePath, domain);
    res.json({ success: true, pages, tree, summary });
  } catch (error) {
    console.error('Get pages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
export { SITES_BASE_DIR };

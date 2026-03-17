import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const execAsync = promisify(exec);

/**
 * Check if Hugo CLI is installed
 */
export async function checkHugoInstalled() {
  try {
    const { stdout } = await execAsync('hugo version');
    return { installed: true, version: stdout.trim() };
  } catch (error) {
    return { installed: false, version: null };
  }
}

/**
 * Build Hugo site
 */
export async function buildSite(projectPath) {
  try {
    // Update the config to reference CSS/JS files
    await updateHugoConfig(projectPath);

    // Touch the build lock file before building
    const lockPath = path.join(projectPath, '.hugo_build.lock');
    fs.writeFileSync(lockPath, '');

    const { stdout, stderr } = await execAsync(`hugo --source "${projectPath}" --minify`, {
      timeout: 60000,
    });

    return {
      success: true,
      output: stdout,
      warnings: stderr,
      publicPath: path.join(projectPath, 'public'),
    };
  } catch (error) {
    // Hugo may exit non-zero but still produce output (e.g. deprecation warnings)
    const publicPath = path.join(projectPath, 'public');
    const hasOutput = fs.existsSync(publicPath) && fs.readdirSync(publicPath).length > 0;

    if (hasOutput) {
      // Hugo built something despite errors - treat as partial success
      return {
        success: true,
        output: error.stdout || '',
        warnings: error.stderr || error.message,
        publicPath,
      };
    }

    return {
      success: false,
      error: error.message,
      stderr: error.stderr,
    };
  }
}

/**
 * Build Hugo site without Hugo CLI (fallback - assembles files manually)
 */
export async function buildSiteManual(projectPath) {
  const publicPath = path.join(projectPath, 'public');

  // Ensure public directory exists (clean it first for fresh build)
  if (fs.existsSync(publicPath)) {
    fs.rmSync(publicPath, { recursive: true, force: true });
  }
  fs.mkdirSync(publicPath, { recursive: true });

  // Touch the build lock file
  const lockPath = path.join(projectPath, '.hugo_build.lock');
  fs.writeFileSync(lockPath, '');

  // 1. Copy static assets to public (css, js, images, fonts, etc.)
  const staticPath = path.join(projectPath, 'static');
  if (fs.existsSync(staticPath)) {
    copyDirRecursive(staticPath, publicPath);
  }

  // 2. Copy assets directory to public (Hugo Pipes alternative)
  const assetsPath = path.join(projectPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    copyDirRecursive(assetsPath, publicPath);
  }

  // 3. Process uploaded HTML pages
  // For the manual build, we use the raw original HTML saved in static/pages/
  // These are the exact HTML files the user uploaded, preserved as-is
  const staticPagesPath = path.join(projectPath, 'static', 'pages');
  const layoutPagePath = path.join(projectPath, 'layouts', 'page');
  const processedSlugs = new Set();

  if (fs.existsSync(staticPagesPath)) {
    const rawHtmlFiles = findAllFiles(staticPagesPath, '.html');
    for (const { fullPath, relativePath } of rawHtmlFiles) {
      let html = fs.readFileSync(fullPath, 'utf-8');
      // Fix asset paths to be relative for the output
      html = fixAssetPaths(html);

      // Output to public/{slug}.html (flat, not in pages/ subfolder)
      const outputFile = path.join(publicPath, relativePath);
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputFile, html);

      const slug = path.basename(relativePath, '.html');
      processedSlugs.add(slug);
    }
  }

  // Fallback: if static/pages doesn't exist but layouts/page does (old projects),
  // assemble pages from layout + content
  if (!fs.existsSync(staticPagesPath) && fs.existsSync(layoutPagePath)) {
    const layoutFiles = findAllFiles(layoutPagePath, '.html');
    for (const { fullPath, relativePath } of layoutFiles) {
      const slug = path.basename(relativePath, '.html');
      if (processedSlugs.has(slug)) continue;

      let layoutHtml = fs.readFileSync(fullPath, 'utf-8');

      // Load matching content body from content/{slug}.md
      const contentMdPath = path.join(projectPath, 'content', `${slug}.md`);
      if (fs.existsSync(contentMdPath)) {
        const mdContent = fs.readFileSync(contentMdPath, 'utf-8');
        const { body } = parseFrontMatter(mdContent);
        // Replace {{ .Content }} placeholder with actual body
        layoutHtml = layoutHtml.replace(/\{\{\s*\.Content\s*\}\}/g, body);
      }

      // Strip remaining Hugo template tags
      layoutHtml = layoutHtml.replace(/\{\{[^}]*\}\}/g, '');

      layoutHtml = fixAssetPaths(layoutHtml);

      const outputFile = path.join(publicPath, relativePath);
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputFile, layoutHtml);
      processedSlugs.add(slug);
    }
  }

  // 4. Process ALL content .md files recursively (for pages that don't have layout HTML)
  const contentPath = path.join(projectPath, 'content');
  if (fs.existsSync(contentPath)) {
    const mdFiles = findAllFiles(contentPath, '.md');
    for (const { fullPath, relativePath } of mdFiles) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { frontMatter, body } = parseFrontMatter(content);
      const slug = path.basename(relativePath, '.md');

      // Skip _index files and already-processed layout pages
      if (slug === '_index') continue;
      if (processedSlugs.has(slug)) continue;

      // Check if there's a corresponding layout file anywhere
      if (layoutPagePath && fs.existsSync(path.join(layoutPagePath, `${slug}.html`))) {
        continue; // Already processed above
      }

      // Build HTML page from markdown content
      const htmlPage = buildHTMLPage(frontMatter, body, projectPath);
      const outputRelative = relativePath.replace(/\.md$/, '.html');
      const outputFile = path.join(publicPath, outputRelative);
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputFile, htmlPage);
    }
  }

  // 5. If no index.html exists in public, create one from the first page or a default
  if (!fs.existsSync(path.join(publicPath, 'index.html'))) {
    // Check if there's a home layout
    const homeLayout = path.join(projectPath, 'layouts', 'index.html');
    if (fs.existsSync(homeLayout)) {
      let html = fs.readFileSync(homeLayout, 'utf-8');
      // Strip Hugo template tags for manual build
      html = stripHugoTags(html, projectPath);
      fs.writeFileSync(path.join(publicPath, 'index.html'), html);
    } else {
      // Create an index that lists/links all pages
      const pages = fs.readdirSync(publicPath).filter(f => f.endsWith('.html') && f !== 'index.html' && f !== '404.html');
      const configPath = path.join(projectPath, 'hugo.toml');
      let siteTitle = 'My Site';
      if (fs.existsSync(configPath)) {
        const cfg = fs.readFileSync(configPath, 'utf-8');
        const m = cfg.match(/title\s*=\s*"([^"]+)"/);
        if (m) siteTitle = m[1];
      }
      const pageLinks = pages.map(p => `    <li><a href="${p}">${p.replace('.html', '')}</a></li>`).join('\n');
      const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle}</title>
${getCSSLinks(projectPath)}
</head>
<body>
  <h1>${siteTitle}</h1>
  <nav>
    <ul>
${pageLinks}
    </ul>
  </nav>
${getJSScripts(projectPath)}
</body>
</html>`;
      fs.writeFileSync(path.join(publicPath, 'index.html'), indexHTML);
    }
  }

  // 6. Generate 404.html if not already there
  if (!fs.existsSync(path.join(publicPath, '404.html'))) {
    const fourOhFourLayout = path.join(projectPath, 'layouts', '404.html');
    if (fs.existsSync(fourOhFourLayout)) {
      let html = fs.readFileSync(fourOhFourLayout, 'utf-8');
      html = stripHugoTags(html, projectPath);
      fs.writeFileSync(path.join(publicPath, '404.html'), html);
    }
  }

  // 7. Generate robots.txt
  const robotsPath = path.join(publicPath, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    const configPath = path.join(projectPath, 'hugo.toml');
    let baseURL = '/';
    if (fs.existsSync(configPath)) {
      const cfg = fs.readFileSync(configPath, 'utf-8');
      const m = cfg.match(/baseURL\s*=\s*"([^"]+)"/);
      if (m) baseURL = m[1];
    }
    fs.writeFileSync(robotsPath, `User-agent: *\nAllow: /\nSitemap: ${baseURL}sitemap.xml\n`);
  }

  // 8. Generate sitemap.xml
  generateSitemap(publicPath, projectPath);

  return {
    success: true,
    output: 'Site built manually (Hugo CLI fallback)',
    publicPath,
  };
}

/**
 * Update Hugo config with CSS and JS references
 */
async function updateHugoConfig(projectPath) {
  const cssDir = path.join(projectPath, 'static', 'css');
  const jsDir = path.join(projectPath, 'static', 'js');
  const assetsCssDir = path.join(projectPath, 'assets', 'css');
  const assetsJsDir = path.join(projectPath, 'assets', 'js');

  let cssFiles = [];
  let jsFiles = [];

  // Collect CSS from static/css
  if (fs.existsSync(cssDir)) {
    cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).map((f) => `/css/${f}`);
  }
  // Also collect CSS from assets/css
  if (fs.existsSync(assetsCssDir)) {
    const assetCss = fs.readdirSync(assetsCssDir).filter((f) => f.endsWith('.css')).map((f) => `/css/${f}`);
    cssFiles = [...new Set([...cssFiles, ...assetCss])];
  }

  // Collect JS from static/js
  if (fs.existsSync(jsDir)) {
    jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => `/js/${f}`);
  }
  // Also collect JS from assets/js
  if (fs.existsSync(assetsJsDir)) {
    const assetJs = fs.readdirSync(assetsJsDir).filter((f) => f.endsWith('.js')).map((f) => `/js/${f}`);
    jsFiles = [...new Set([...jsFiles, ...assetJs])];
  }

  const configPath = path.join(projectPath, 'hugo.toml');
  if (fs.existsSync(configPath)) {
    let config = fs.readFileSync(configPath, 'utf-8');

    // Remove the entire [params] section and everything after it that belongs to params
    config = config.replace(/\n*\[params\][\s\S]*$/, '');

    // Rebuild [params] section cleanly
    config += '\n\n[params]\n';
    config += '  description = ""\n';

    if (cssFiles.length > 0) {
      const cssArray = cssFiles.map((f) => `"${f}"`).join(', ');
      config += `  css = [${cssArray}]\n`;
    }
    if (jsFiles.length > 0) {
      const jsArray = jsFiles.map((f) => `"${f}"`).join(', ');
      config += `  js = [${jsArray}]\n`;
    }

    fs.writeFileSync(configPath, config);
  }
}

/**
 * Generate sitemap.xml
 */
function generateSitemap(publicPath, projectPath) {
  const configPath = path.join(projectPath, 'hugo.toml');
  let baseURL = '/';
  if (fs.existsSync(configPath)) {
    const config = fs.readFileSync(configPath, 'utf-8');
    const match = config.match(/baseURL\s*=\s*"([^"]+)"/);
    if (match) baseURL = match[1];
  }

  const htmlFiles = [];
  function findHTMLFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        findHTMLFiles(filePath);
      } else if (file.endsWith('.html')) {
        htmlFiles.push(path.relative(publicPath, filePath).replace(/\\/g, '/'));
      }
    }
  }
  findHTMLFiles(publicPath);

  const today = new Date().toISOString().split('T')[0];
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
  for (const file of htmlFiles) {
    const loc = `${baseURL}${file}`.replace(/\/+/g, '/').replace(/:\//g, '://');
    sitemap += `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  }
  sitemap += `</urlset>`;

  fs.writeFileSync(path.join(publicPath, 'sitemap.xml'), sitemap);
}

/**
 * Create a ZIP archive of the generated site
 * Includes both the public/ output AND the full Hugo project source
 */
export function createArchive(publicPath, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve({ size: archive.pointer(), path: outputPath });
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Add the built site under a "public" folder
    archive.directory(publicPath, 'public');

    // Also include the full Hugo project source for rebuilding
    const projectPath = path.dirname(publicPath);
    const hugoSourceDirs = ['archetypes', 'assets', 'content', 'data', 'i18n', 'layouts', 'resources', 'static', 'themes'];
    for (const dir of hugoSourceDirs) {
      const dirPath = path.join(projectPath, dir);
      if (fs.existsSync(dirPath)) {
        const entries = fs.readdirSync(dirPath);
        if (entries.length > 0) {
          archive.directory(dirPath, dir);
        } else {
          // Force empty directories into the archive with a .gitkeep
          archive.append('', { name: `${dir}/.gitkeep` });
        }
      }
    }

    // Include Hugo config and other root files
    const rootFiles = ['hugo.toml', '.gitmodules', '.hugo_build.lock'];
    for (const file of rootFiles) {
      const filePath = path.join(projectPath, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    }

    archive.finalize();
  });
}

// Utility functions

/**
 * Recursively find all files with a given extension
 */
function findAllFiles(dir, ext, basePath = '') {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
    if (entry.isDirectory()) {
      results.push(...findAllFiles(fullPath, ext, relativePath));
    } else if (entry.name.endsWith(ext)) {
      results.push({ fullPath, relativePath });
    }
  }
  return results;
}

/**
 * Strip Hugo template tags from HTML (for manual build fallback)
 */
function stripHugoTags(html, projectPath) {
  // Remove Hugo block/define/partial/range/if/end tags
  html = html.replace(/\{\{-?\s*(define|block|partial|range|end|if|else|with|template)\b[^}]*-?\}\}/g, '');
  // Replace .Site.Title with actual title
  const configPath = path.join(projectPath, 'hugo.toml');
  let siteTitle = 'My Site';
  if (fs.existsSync(configPath)) {
    const cfg = fs.readFileSync(configPath, 'utf-8');
    const m = cfg.match(/title\s*=\s*"([^"]+)"/);
    if (m) siteTitle = m[1];
  }
  html = html.replace(/\{\{\s*\.Site\.Title\s*\}\}/g, siteTitle);
  html = html.replace(/\{\{\s*\.Title\s*\}\}/g, siteTitle);
  // Remove any remaining Hugo template expressions
  html = html.replace(/\{\{[^}]*\}\}/g, '');
  return html;
}

/**
 * Get CSS link tags for manual HTML page generation
 */
function getCSSLinks(projectPath) {
  const cssDir = path.join(projectPath, 'static', 'css');
  const assetsCssDir = path.join(projectPath, 'assets', 'css');
  let files = [];
  if (fs.existsSync(cssDir)) {
    files.push(...fs.readdirSync(cssDir).filter(f => f.endsWith('.css')));
  }
  if (fs.existsSync(assetsCssDir)) {
    files.push(...fs.readdirSync(assetsCssDir).filter(f => f.endsWith('.css')));
  }
  files = [...new Set(files)];
  return files.map(f => `    <link rel="stylesheet" href="css/${f}">`).join('\n');
}

/**
 * Get JS script tags for manual HTML page generation
 */
function getJSScripts(projectPath) {
  const jsDir = path.join(projectPath, 'static', 'js');
  const assetsJsDir = path.join(projectPath, 'assets', 'js');
  let files = [];
  if (fs.existsSync(jsDir)) {
    files.push(...fs.readdirSync(jsDir).filter(f => f.endsWith('.js')));
  }
  if (fs.existsSync(assetsJsDir)) {
    files.push(...fs.readdirSync(assetsJsDir).filter(f => f.endsWith('.js')));
  }
  files = [...new Set(files)];
  return files.map(f => `    <script src="js/${f}"></script>`).join('\n');
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontMatter: {}, body: content };

  const fm = {};
  match[1].split('\n').forEach((line) => {
    const [key, ...value] = line.split(':');
    if (key && value.length) {
      fm[key.trim()] = value.join(':').trim().replace(/^"|"$/g, '');
    }
  });
  return { frontMatter: fm, body: match[2] };
}

function fixAssetPaths(html) {
  // Fix CSS paths
  html = html.replace(/href=["'](?:\.\/|\/)?(?:static\/)?css\//g, 'href="css/');
  // Fix JS paths
  html = html.replace(/src=["'](?:\.\/|\/)?(?:static\/)?js\//g, 'src="js/');
  // Fix image paths
  html = html.replace(/src=["'](?:\.\/|\/)?(?:static\/)?images\//g, 'src="images/');
  return html;
}

function buildHTMLPage(frontMatter, body, projectPath) {
  const cssDir = path.join(projectPath, 'static', 'css');
  const jsDir = path.join(projectPath, 'static', 'js');

  let cssLinks = '';
  let jsScripts = '';

  if (fs.existsSync(cssDir)) {
    const cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'));
    cssLinks = cssFiles.map((f) => `    <link rel="stylesheet" href="css/${f}">`).join('\n');
  }
  if (fs.existsSync(jsDir)) {
    const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
    jsScripts = jsFiles.map((f) => `    <script src="js/${f}"></script>`).join('\n');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${frontMatter.title || 'Untitled'}</title>
${cssLinks}
</head>
<body>
${body}
${jsScripts}
</body>
</html>`;
}

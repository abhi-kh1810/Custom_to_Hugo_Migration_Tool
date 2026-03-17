import fs from 'fs';
import path from 'path';

/**
 * Parse an HTML string to extract head content, body content, title, lang, etc.
 */
function parseHTML(htmlContent) {
  // Extract lang attribute
  const langMatch = htmlContent.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  const lang = langMatch ? langMatch[1] : 'en';

  // Extract dir attribute
  const dirMatch = htmlContent.match(/<html[^>]*\sdir=["']([^"']+)["']/i);
  const dir = dirMatch ? dirMatch[1] : 'ltr';

  // Extract title
  const titleMatch = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Extract everything inside <head>...</head>
  const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  let headContent = headMatch ? headMatch[1] : '';

  // Remove <title> from head content (we handle it separately)
  headContent = headContent.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '');

  // Extract everything inside <body>...</body>
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : htmlContent;

  // Extract body attributes (class, id, etc.)
  const bodyTagMatch = htmlContent.match(/<body([^>]*)>/i);
  const bodyAttrs = bodyTagMatch ? bodyTagMatch[1].trim() : '';

  // Extract CSS links from head
  const cssLinks = [];
  const cssRegex = /<link[^>]*rel=["']stylesheet["'][^>]*>/gi;
  let cssMatch;
  while ((cssMatch = cssRegex.exec(headContent)) !== null) {
    cssLinks.push(cssMatch[0]);
  }

  // Extract JS scripts (both head and body)
  const scripts = [];
  const scriptRegex = /<script[^>]*(?:src=["'][^"']+["'])[^>]*>[\s\S]*?<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(htmlContent)) !== null) {
    scripts.push(scriptMatch[0]);
  }

  // Extract inline styles
  const inlineStyles = [];
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(headContent)) !== null) {
    inlineStyles.push(styleMatch[0]);
  }

  // Extract meta tags from head
  const metaTags = [];
  const metaRegex = /<meta[^>]*\/?>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(headContent)) !== null) {
    // Skip charset and viewport (we set those in the layout)
    const tag = metaMatch[0];
    if (!/charset|viewport/i.test(tag)) {
      metaTags.push(tag);
    }
  }

  return {
    lang,
    dir,
    title,
    headContent: headContent.trim(),
    bodyContent: bodyContent.trim(),
    bodyAttrs,
    cssLinks,
    scripts,
    inlineStyles,
    metaTags,
  };
}

/**
 * Save uploaded file to the correct Hugo directory
 */
export function saveFile(projectPath, fileType, filename, buffer) {
  let targetDir;

  switch (fileType) {
    case 'html':
      targetDir = path.join(projectPath, 'content');
      break;
    case 'css':
      targetDir = path.join(projectPath, 'static', 'css');
      break;
    case 'js':
      targetDir = path.join(projectPath, 'static', 'js');
      break;
    case 'image':
      targetDir = path.join(projectPath, 'static', 'images');
      break;
    default:
      targetDir = path.join(projectPath, 'static');
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, buffer);

  return {
    filename,
    path: filePath,
    relativePath: path.relative(projectPath, filePath),
    size: buffer.length,
  };
}

/**
 * Save HTML content as Hugo-compatible markdown with front matter
 * This extracts the body and saves it as content Hugo can render
 */
export function saveHTMLAsContent(projectPath, pageName, htmlContent, title) {
  const contentDir = path.join(projectPath, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  const slug = pageName
    .toLowerCase()
    .replace(/\.html?$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Parse the HTML to extract body content
  const parsed = parseHTML(htmlContent);
  const pageTitle = title || parsed.title || pageName.replace(/\.html?$/, '');

  // Escape accidental Hugo template delimiters
  let safeBody = parsed.bodyContent;
  safeBody = safeBody.replace(/\{\{(?!\s*(define|block|partial|range|end|if|else|with|template|\.|\$))/g, '&#123;&#123;');
  safeBody = safeBody.replace(/\}\}(?!\s*$)/g, '&#125;&#125;');

  const frontMatter = `---
title: "${pageTitle.replace(/"/g, '\\"')}"
date: ${new Date().toISOString()}
draft: false
slug: "${slug}"
---

${safeBody}
`;

  const filePath = path.join(contentDir, `${slug}.md`);
  fs.writeFileSync(filePath, frontMatter);

  return {
    filename: `${slug}.md`,
    path: filePath,
    relativePath: `content/${slug}.md`,
    title: pageTitle,
    slug,
  };
}

/**
 * Save a raw HTML file as a Hugo layout (for full HTML pages)
 * 
 * Strategy:
 * 1. Parse the HTML to extract <head>, <body>, title, CSS, JS, meta
 * 2. Save the FULL original HTML to layouts/page/{slug}.html as a
 *    standalone Hugo layout that renders the page exactly as uploaded
 * 3. Create content/{slug}.md with front matter pointing to this layout
 * 4. Also save raw original HTML to static/pages/{slug}.html as backup
 */
export function saveHTMLAsLayout(projectPath, pageName, htmlContent) {
  const slug = pageName
    .toLowerCase()
    .replace(/\.html?$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Parse the HTML
  const parsed = parseHTML(htmlContent);
  const pageTitle = parsed.title || pageName.replace(/\.html?$/, '');

  // --- 1. Create the Hugo layout template ---
  // This layout renders the full page exactly as the original HTML
  // but wraps it in Hugo-compatible template syntax
  const layoutDir = path.join(projectPath, 'layouts', 'page');
  if (!fs.existsSync(layoutDir)) {
    fs.mkdirSync(layoutDir, { recursive: true });
  }

  // Build a proper Hugo layout that preserves the original HTML structure
  const layoutHTML = `<!DOCTYPE html>
<html lang="${parsed.lang}" dir="${parsed.dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ .Title }}</title>
${parsed.metaTags.map(t => `    ${t}`).join('\n')}
${parsed.cssLinks.map(l => `    ${l}`).join('\n')}
${parsed.inlineStyles.map(s => `    ${s}`).join('\n')}
</head>
<body${parsed.bodyAttrs ? ' ' + parsed.bodyAttrs : ''}>
{{ .Content }}
${parsed.scripts.map(s => `    ${s}`).join('\n')}
</body>
</html>`;

  const layoutPath = path.join(layoutDir, `${slug}.html`);
  fs.writeFileSync(layoutPath, layoutHTML);

  // --- 2. Create content .md with the body HTML as content ---
  // Hugo renders this body via {{ .Content }} in the layout above
  const contentDir = path.join(projectPath, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  // Escape any accidental Hugo template delimiters in user HTML content
  let safeBody = parsed.bodyContent;

  // Remove <script> tags from body content — they are already in the layout template
  // This prevents scripts from being duplicated in the final output
  safeBody = safeBody.replace(/<script[^>]*(?:src=["'][^"']+["'])[^>]*>[\s\S]*?<\/script>/gi, '');

  // Replace {{ and }} that aren't Hugo template tags with HTML entities
  // to prevent Hugo from trying to interpret them
  safeBody = safeBody.replace(/\{\{(?!\s*(define|block|partial|range|end|if|else|with|template|\.|\$))/g, '&#123;&#123;');
  safeBody = safeBody.replace(/\}\}(?!\s*$)/g, '&#125;&#125;');

  // Clean up extra blank lines left after removing scripts
  safeBody = safeBody.replace(/\n{3,}/g, '\n\n').trim();

  const frontMatter = `---
title: "${pageTitle.replace(/"/g, '\\"')}"
date: ${new Date().toISOString()}
draft: false
layout: "${slug}"
type: "page"
slug: "${slug}"
description: "${(parsed.metaTags.find(m => /name=["']description["']/i.test(m)) || '').replace(/.*content=["']([^"']*)["'].*/i, '$1').replace(/"/g, '\\"')}"
---

${safeBody}
`;

  const contentPath = path.join(contentDir, `${slug}.md`);
  fs.writeFileSync(contentPath, frontMatter);

  // --- 3. Save original raw HTML to static/pages/ as backup ---
  const staticPagesDir = path.join(projectPath, 'static', 'pages');
  if (!fs.existsSync(staticPagesDir)) {
    fs.mkdirSync(staticPagesDir, { recursive: true });
  }
  fs.writeFileSync(path.join(staticPagesDir, `${slug}.html`), htmlContent);

  return {
    filename: `${slug}.html`,
    layoutPath,
    contentPath,
    slug,
    title: pageTitle,
  };
}

/**
 * List all files of a given type in the project
 */
export function listProjectFiles(projectPath, fileType) {
  let targetDir;

  switch (fileType) {
    case 'content':
      targetDir = path.join(projectPath, 'content');
      break;
    case 'css':
      targetDir = path.join(projectPath, 'static', 'css');
      break;
    case 'js':
      targetDir = path.join(projectPath, 'static', 'js');
      break;
    case 'images':
      targetDir = path.join(projectPath, 'static', 'images');
      break;
    case 'layouts':
      targetDir = path.join(projectPath, 'layouts');
      break;
    default:
      targetDir = projectPath;
  }

  if (!fs.existsSync(targetDir)) return [];

  return fs.readdirSync(targetDir).map((file) => {
    const filePath = path.join(targetDir, file);
    const stats = fs.statSync(filePath);
    return {
      name: file,
      path: filePath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      modified: stats.mtime.toISOString(),
    };
  });
}

/**
 * Delete a file from the project
 */
export function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Read file contents
 */
export function readFileContent(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
}

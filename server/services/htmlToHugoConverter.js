import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import yaml from 'js-yaml';

/**
 * HTML to Hugo Markdown Converter
 * Converts downloaded HTML files to Hugo-compatible markdown files
 */

export class HtmlToHugoConverter {
  constructor(siteDir, projectId) {
    this.siteDir = siteDir; // Downloaded site directory
    this.projectId = projectId;
    this.hugoSiteDir = path.join(path.dirname(siteDir), `hugo-${path.basename(siteDir)}`);
  }

  /**
   * Main conversion method
   */
  async convert() {
    try {
      // Create Hugo site structure
      await this.createHugoStructure();

      // Find all HTML files
      const htmlFiles = this.findHtmlFiles(this.siteDir);

      // Detect site title from the homepage before converting pages
      this.siteTitle = this.detectSiteTitle(htmlFiles);

      // Detect per-page CSS configuration (groups + page mappings)
      this.cssConfig = this.detectCssConfig(htmlFiles);

      // Convert each HTML file to markdown
      for (const htmlFile of htmlFiles) {
        await this.convertHtmlToMarkdown(htmlFile);
      }

      // Copy assets (CSS, JS, images)
      await this.copyAssets();

      // Create Hugo config
      await this.createHugoConfig();

      return this.hugoSiteDir;
    } catch (error) {
      throw new Error(`Conversion failed: ${error.message}`);
    }
  }

  /**
   * Detect CSS groups across all HTML pages.
   * Pages that share the exact same set of stylesheet links are assigned
   * the same group index so Hugo can load the right CSS per page.
   * Returns { groups: [{files:[href,...]}, ...], pageGroups: {relativePath -> index} }
   */
  detectCssConfig(htmlFiles) {
    const fingerprintToGroup = {}; // fingerprint -> group index
    const groups = [];            // [{files:[...]}, ...]
    const pageGroups = {};        // relativePath -> group index

    for (const htmlFile of htmlFiles) {
      try {
        const html = fs.readFileSync(htmlFile, 'utf-8');
        const dom = new JSDOM(html);
        const links = Array.from(
          dom.window.document.querySelectorAll('link[rel="stylesheet"][href]')
        );

        // Keep the full href (with query string) exactly as it appears in the source
        const files = links
          .map((l) => l.getAttribute('href'))
          .filter((h) => h && !h.startsWith('https://') && !h.startsWith('http://'));

        const fingerprint = files.slice().sort().join('||');
        if (!(fingerprint in fingerprintToGroup)) {
          fingerprintToGroup[fingerprint] = groups.length;
          groups.push({ files });
        }

        const relativePath = path.relative(this.siteDir, htmlFile);
        pageGroups[relativePath] = fingerprintToGroup[fingerprint];
      } catch {
        // skip unreadable files
      }
    }

    return { groups, pageGroups };
  }

  /**
   * Extract the body class string from a page's <body> element, if present.
   */
  detectBodyClass(document) {
    const body = document.querySelector('body');
    return body ? (body.getAttribute('class') || '') : '';
  }

  /**
   * Create Hugo directory structure
   */
  async createHugoStructure() {
    const dirs = [
      this.hugoSiteDir,
      path.join(this.hugoSiteDir, 'content'),
      path.join(this.hugoSiteDir, 'layouts'),
      path.join(this.hugoSiteDir, 'layouts', '_default'),
      path.join(this.hugoSiteDir, 'layouts', 'partials'),
      path.join(this.hugoSiteDir, 'static'),
      path.join(this.hugoSiteDir, 'static', 'css'),
      path.join(this.hugoSiteDir, 'static', 'js'),
      path.join(this.hugoSiteDir, 'static', 'images'),
      path.join(this.hugoSiteDir, 'assets'),
      path.join(this.hugoSiteDir, 'data'),
      path.join(this.hugoSiteDir, 'archetypes'),
      path.join(this.hugoSiteDir, 'i18n'),
      path.join(this.hugoSiteDir, 'themes'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Create default archetype
    const archetypeContent = `---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: false
---
`;
    fs.writeFileSync(
      path.join(this.hugoSiteDir, 'archetypes', 'default.md'),
      archetypeContent
    );
  }

  /**
   * Find all HTML files in directory
   */
  findHtmlFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        this.findHtmlFiles(filePath, fileList);
      } else if (file.endsWith('.html')) {
        fileList.push(filePath);
      }
    });

    return fileList;
  }

 async convertHtmlToMarkdown(htmlFile) {
  const html = fs.readFileSync(htmlFile, 'utf-8');
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Extract basic page info
  const title = this.extractTitle(document);
  const content = this.extractContent(document);
  
  // ═══ IMPORT EXTRACTION FUNCTION ═══
  const { extractTabMenuItems } = await import('../utils/analyzeHtml.js');

  // ═══ EXTRACT DYNAMIC DATA ═══
  const tabMenu = await extractTabMenuItems(html);

  // Create base front matter
  const frontMatter = {
    title: title,
    date: new Date().toISOString(),
    draft: false,
  };

  // Add tab menu if found
  if (tabMenu) {
    frontMatter.tabMenu = tabMenu;
  }

  // Build YAML
  let yamlContent = '---\n';
  yamlContent += `title: "${frontMatter.title}"\n`;
  yamlContent += `date: ${frontMatter.date}\n`;
  yamlContent += `draft: ${frontMatter.draft}\n`;
  
  if (tabMenu) {
    yamlContent += '\ntabMenu:\n';
    yamlContent += '  items:\n';
    for (const item of tabMenu.items) {
      yamlContent += `    - text: "${item.text}"\n`;
      yamlContent += `      url: "${item.url}"\n`;
    }
  }
  
  yamlContent += '---\n';

  // Create final markdown
  const markdown = `${yamlContent}\n${content}`;

  // Determine output path
  const relativePath = path.relative(this.siteDir, htmlFile);
  const outputDir = path.join(
    this.hugoSiteDir,
    'content',
    path.dirname(relativePath)
  );
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  const outputFile = path.join(
    outputDir,
    path.basename(htmlFile, '.html') === 'index' 
      ? '_index.md' 
      : path.basename(htmlFile, '.html') + '.md'
  );

  fs.writeFileSync(outputFile, markdown);
  console.log(`✓ Created ${path.relative(this.hugoSiteDir, outputFile)}`);
}

  /**
   * Detect the site-wide title by reading the homepage <title> tag.
   * The homepage title is typically just the site name (no " | " separator),
   * or the part after the last " | " separator on inner pages.
   * Falls back to the directory basename.
   */
  detectSiteTitle(htmlFiles) {
    // Prefer root index.html as the source of truth for the site title
    const homeCandidates = htmlFiles.filter(
      (f) => path.relative(this.siteDir, f) === 'index.html'
    );

    const fileToCheck = homeCandidates.length ? homeCandidates[0] : htmlFiles[0];

    if (!fileToCheck) return path.basename(this.siteDir);

    try {
      const html = fs.readFileSync(fileToCheck, 'utf-8');
      const dom = new JSDOM(html);
      const titleEl = dom.window.document.querySelector('title');
      if (!titleEl) return path.basename(this.siteDir);

      const raw = titleEl.textContent.trim();
      // If title contains " | ", the site name is the last segment
      if (raw.includes(' | ')) {
        return raw.split(' | ').pop().trim();
      }
      // Otherwise the whole thing is the site title (home page style)
      return raw;
    } catch {
      return path.basename(this.siteDir);
    }
  }

  /**
   * Extract page title.
   * Strips the site-name suffix (" | Site Name") so only the page-specific
   * portion is stored in front matter. Hugo's baseof.html then appends
   * " | {{ .Site.Title }}" automatically for non-home pages.
   */
  extractTitle(document) {
    const titleElement = document.querySelector('title');
    if (titleElement) {
      const raw = titleElement.textContent.trim();
      // Strip trailing " | Site Name" suffix to get the page-specific title
      if (raw.includes(' | ')) {
        return raw.split(' | ').slice(0, -1).join(' | ').trim();
      }
      return raw;
    }

    const h1 = document.querySelector('h1');
    if (h1) return h1.textContent.trim();

    return 'Untitled Page';
  }

  /**
   * Extract meta description
   */
  extractDescription(document) {
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) return metaDescription.getAttribute('content');

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) return ogDescription.getAttribute('content');

    return '';
  }

  /**
   * Extract meta keywords
   */
  extractKeywords(document) {
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
      const keywords = metaKeywords.getAttribute('content');
      return keywords.split(',').map((k) => k.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Extract main content from HTML
   */
  extractMainContent(document) {
    // Try to find main content area
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      '#main',
      'body',
    ];

    let mainElement = null;
    for (const selector of mainSelectors) {
      mainElement = document.querySelector(selector);
      if (mainElement) break;
    }

    if (!mainElement) {
      mainElement = document.body;
    }

    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.navigation',
      '.menu',
      '.sidebar',
      '.advertisement',
      '.ad',
      'iframe',
    ];

    unwantedSelectors.forEach((selector) => {
      const elements = mainElement.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    // Convert HTML to simplified markdown-like format
    return this.htmlToMarkdown(mainElement);
  }

  /**
   * Simple HTML to Markdown converter
   */
  htmlToMarkdown(element) {
    let markdown = '';

    const processNode = (node) => {
      if (node.nodeType === 3) {
        // Text node
        const text = node.textContent.trim();
        if (text) markdown += text + ' ';
      } else if (node.nodeType === 1) {
        // Element node
        const tagName = node.tagName.toLowerCase();

        switch (tagName) {
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            const level = parseInt(tagName[1]);
            markdown += '\n\n' + '#'.repeat(level) + ' ' + node.textContent.trim() + '\n\n';
            break;

          case 'p':
            markdown += '\n\n' + node.textContent.trim() + '\n\n';
            break;

          case 'br':
            markdown += '\n';
            break;

          case 'strong':
          case 'b':
            markdown += '**' + node.textContent.trim() + '**';
            break;

          case 'em':
          case 'i':
            markdown += '*' + node.textContent.trim() + '*';
            break;

          case 'a':
            const href = node.getAttribute('href') || '#';
            markdown += '[' + node.textContent.trim() + '](' + href + ')';
            break;

          case 'img':
            const src = node.getAttribute('src') || '';
            const alt = node.getAttribute('alt') || 'image';
            markdown += '\n\n![' + alt + '](' + src + ')\n\n';
            break;

          case 'ul':
          case 'ol':
            markdown += '\n\n';
            Array.from(node.children).forEach((li, idx) => {
              const bullet = tagName === 'ul' ? '-' : `${idx + 1}.`;
              markdown += bullet + ' ' + li.textContent.trim() + '\n';
            });
            markdown += '\n';
            break;

          case 'blockquote':
            markdown += '\n\n> ' + node.textContent.trim() + '\n\n';
            break;

          case 'code':
            markdown += '`' + node.textContent.trim() + '`';
            break;

          case 'pre':
            markdown += '\n\n```\n' + node.textContent.trim() + '\n```\n\n';
            break;

          case 'div':
          case 'section':
          case 'article':
            Array.from(node.childNodes).forEach(processNode);
            break;

          default:
            Array.from(node.childNodes).forEach(processNode);
        }
      }
    };

    Array.from(element.childNodes).forEach(processNode);

    // Clean up excessive whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown;
  }

  /**
   * Generate content path from HTML file path
   */
  generateContentPath(relativePath) {
    let contentPath = relativePath
      .replace(/\.html$/, '.md')
      .replace(/index\.md$/, '_index.md');

    return path.join(this.hugoSiteDir, 'content', contentPath);
  }

  /**
   * Copy assets (CSS, JS, images) to static directory
   */
  async copyAssets() {
    const assetPatterns = [
      { pattern: /\.(css)$/i, dest: 'css' },
      { pattern: /\.(js)$/i, dest: 'js' },
      { pattern: /\.(jpg|jpeg|png|gif|svg|webp|ico)$/i, dest: 'images' },
    ];

    const copyDir = (src, dest, pattern) => {
      if (!fs.existsSync(src)) return;

      const files = fs.readdirSync(src);

      files.forEach((file) => {
        const srcPath = path.join(src, file);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
          copyDir(srcPath, dest, pattern);
        } else if (pattern.test(file)) {
          const destPath = path.join(dest, file);
          if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
        }
      });
    };

    assetPatterns.forEach(({ pattern, dest }) => {
      const destDir = path.join(this.hugoSiteDir, 'static', dest);
      copyDir(this.siteDir, destDir, pattern);
    });
  }

  /**
   * Create Hugo configuration file
   */
  async createHugoConfig() {
    const siteName = this.siteTitle || path.basename(this.siteDir);

    // Build CSS group TOML entries
    const cssGroups = (this.cssConfig && this.cssConfig.groups) || [];
    const cssGroupToml = cssGroups
      .map((group) => {
        const fileLines = group.files
          .map((f) => `    "${f}"`)
          .join(',\n');
        return `  [[params.cssGroups]]\n    files = [\n${fileLines}\n    ]`;
      })
      .join('\n\n');

    const config = `baseURL = "https://example.com/"
languageCode = "en-us"
title = "${siteName}"
enableRobotsTXT = true

[markup]
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true

[params]
  description = "Converted from ${siteName}"

${cssGroupToml}
`;

    fs.writeFileSync(path.join(this.hugoSiteDir, 'hugo.toml'), config);

    // Create layouts
    this.createBasicLayouts();
  }

  /**
   * Create Hugo layouts with proper structure matching the original site
   */
  createBasicLayouts() {
    // -----------------------------------------------------------------
    // partials/head.html  — CSS loaded per-page via cssGroup frontmatter
    // -----------------------------------------------------------------
    const head = `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ if .IsHome }}{{ .Site.Title }}{{ else }}{{ .Title }} | {{ .Site.Title }}{{ end }}</title>
  <meta name="description" content="{{ with .Description }}{{ . }}{{ else }}{{ .Site.Params.description }}{{ end }}">
  {{ $groupIdx := .Params.cssGroup | int }}
  {{ $cssGroup := index .Site.Params.cssGroups $groupIdx }}
  {{ if $cssGroup }}
    {{ range $cssGroup.files }}
  <link rel="stylesheet" media="all" href="{{ . }}">
    {{ end }}
  {{ end }}
  <link rel="stylesheet" href="/css/style.css">
</head>
`;

    // -----------------------------------------------------------------
    // _default/baseof.html  — proper semantic structure
    // -----------------------------------------------------------------
    const baseof = `<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode }}" dir="ltr">
{{ partial "head.html" . }}
<body{{ with .Params.bodyClass }} class="{{ . }}"{{ end }}>
  <a href="#main-content" class="visually-hidden focusable skip-link">
    Skip to main content
  </a>

  <div class="dialog-off-canvas-main-canvas" data-off-canvas-main-canvas>
    <div class="layout-container">

      {{ partial "header.html" . }}

      <div class="region region-highlighted">
        <div data-drupal-messages-fallback class="hidden"></div>
      </div>

      <main role="main">
        {{ block "main" . }}{{ end }}
      </main>

      {{ partial "footer.html" . }}

    </div>
  </div>

  {{ block "scripts" . }}{{ end }}
</body>
</html>
`;

    // -----------------------------------------------------------------
    // _default/single.html
    // -----------------------------------------------------------------
    const single = `{{ define "main" }}
<a id="main-content" tabindex="-1"></a>
<div class="layout-content">
  <div class="region region-content">
    <article>
      <h1>{{ .Title }}</h1>
      <div class="content">
        {{ .Content }}
      </div>
    </article>
  </div>
</div>
{{ end }}
`;

    // -----------------------------------------------------------------
    // _default/list.html
    // -----------------------------------------------------------------
    const list = `{{ define "main" }}
<a id="main-content" tabindex="-1"></a>
<div class="layout-content">
  <div class="region region-content">
    <h1>{{ .Title }}</h1>
    {{ .Content }}
    <ul>
      {{ range .Pages }}
      <li>
        <a href="{{ .RelPermalink }}">{{ .Title }}</a>
        {{ if .Description }}<p>{{ .Description }}</p>{{ end }}
      </li>
      {{ end }}
    </ul>
  </div>
</div>
{{ end }}
`;

    // -----------------------------------------------------------------
    // partials/header.html  — stub (populated from original if available)
    // -----------------------------------------------------------------
    const header = `<header role="banner">
  <!-- Site header — edit to match your original header HTML -->
</header>
`;

    // -----------------------------------------------------------------
    // partials/footer.html  — stub
    // -----------------------------------------------------------------
    const footer = `<footer role="contentinfo">
  <!-- Site footer — edit to match your original footer HTML -->
</footer>
`;

    const layoutsDir = path.join(this.hugoSiteDir, 'layouts');
    const partialsDir = path.join(layoutsDir, 'partials');
    const defaultDir = path.join(layoutsDir, '_default');

    [partialsDir, defaultDir].forEach((d) => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    fs.writeFileSync(path.join(partialsDir, 'head.html'), head);
    fs.writeFileSync(path.join(partialsDir, 'header.html'), header);
    fs.writeFileSync(path.join(partialsDir, 'footer.html'), footer);
    fs.writeFileSync(path.join(defaultDir, 'baseof.html'), baseof);
    fs.writeFileSync(path.join(defaultDir, 'single.html'), single);
    fs.writeFileSync(path.join(defaultDir, 'list.html'), list);
  }
}

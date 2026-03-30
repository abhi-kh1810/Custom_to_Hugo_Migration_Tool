import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Folders inside an httrack download that are asset directories, NOT pages
const ASSET_FOLDERS = new Set([
  'css', 'js', 'images', 'fonts', 'files', 'unprocessed',
  'errors', '.git', 'node_modules', '__macosx', 'thumbs',
]);

// ═══════════════════════════════════════════════════════════════════
//  LANGUAGE-AWARE FILE FILTER
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a relative path should be included based on language filter options.
 *
 * @param {string} relPath - relative path of the file
 * @param {object} options
 * @param {string[]} [options.excludePrefixes] - exclude files under these path prefixes
 * @param {string}   [options.includePrefix]   - only include files under this prefix
 * @returns {boolean}
 */
function shouldIncludeFile(relPath, options = {}) {
  if (options.excludePrefixes) {
    for (const prefix of options.excludePrefixes) {
      if (relPath.startsWith(prefix + '/') || relPath === prefix) return false;
    }
  }
  if (options.includePrefix) {
    if (!relPath.startsWith(options.includePrefix + '/') && relPath !== options.includePrefix) return false;
  }
  return true;
}

/**
 * Check if a layout path should be included based on language layout filter options.
 *
 * @param {string} relPath - relative path from layoutsDir
 * @param {object} options
 * @param {string[]} [options.excludeLayoutPrefixes] - exclude layout dirs under these prefixes
 * @param {string}   [options.includeLayoutPrefix]   - only include layouts under this prefix
 * @returns {boolean}
 */
function shouldIncludeLayout(relPath, options = {}) {
  // Detect language-tagged homepage files like "index.fr.html" at the layouts root
  const langFileMatch = path.basename(relPath).match(/^index\.([a-z]{2,3})\.html$/);
  const fileLang = langFileMatch ? langFileMatch[1] : null;

  if (options.excludeLayoutPrefixes) {
    for (const prefix of options.excludeLayoutPrefixes) {
      if (relPath.startsWith(prefix + '/') || relPath === prefix) return false;
      // Also exclude language-tagged homepage files for excluded languages (e.g. index.fr.html)
      if (fileLang === prefix) return false;
    }
  }
  if (options.includeLayoutPrefix) {
    if (!relPath.startsWith(options.includeLayoutPrefix + '/') && relPath !== options.includeLayoutPrefix) {
      // Allow language-tagged homepage files matching the included language (e.g. index.fr.html)
      if (!fileLang || fileLang !== options.includeLayoutPrefix) return false;
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  HUGO TEMPLATE ESCAPER
// ═══════════════════════════════════════════════════════════════════

/**
 * Escape any bare `{{` and `}}` in raw HTML so Hugo does not attempt
 * to execute them as Go template actions.
 *
 * Hugo's escape mechanism:  {{ "{{" }}  renders as literal  {{
 *                            {{ "}}" }}  renders as literal  }}
 *
 * We only escape sequences that are NOT already Hugo template calls
 * (i.e. not preceded by a Hugo action opener we injected ourselves).
 */
function escapeHugoDelimiters(html) {
  // Replace {{ that are NOT part of an already-valid Hugo template expression
  // Strategy: replace ALL {{ / }} with their Hugo-escaped equivalents,
  // but skip sequences that are already wrapped as {{ "{{" }} or {{ "}}" }}.
  // Since this raw HTML comes from httrack and contains NO Hugo expressions,
  // it is safe to blindly escape every occurrence.
  return html
    .replace(/\{\{/g, `{{ "{{" }}`)
    .replace(/\}\}/g, `{{ "}}" }}`);
}


// ═══════════════════════════════════════════════════════════════════
//  SEMANTIC TAG IDENTIFIER
// ═══════════════════════════════════════════════════════════════════

/**
 * Identify semantic HTML5 tags present in an HTML string.
 * Returns an object keyed by tag name with count & first-occurrence attrs.
 */
function identifySemanticTags(html) {
  const semanticTags = [
    'main', 'article', 'section', 'aside', 'nav', 'header', 'footer',
    'figure', 'figcaption', 'details', 'summary', 'dialog', 'time', 'mark',
  ];
  const report = {};

  for (const tag of semanticTags) {
    const re = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    let count = 0;
    let firstAttrs = '';
    let m;
    while ((m = re.exec(html)) !== null) {
      if (count === 0) firstAttrs = m[1].trim();
      count++;
    }
    if (count > 0) {
      report[tag] = { count, firstAttrs };
    }
  }
  return report;
}

// ═══════════════════════════════════════════════════════════════════
//  NODE--TYPE-* BLOCK EXTRACTOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract ALL elements that carry a `node--type-*` class from an HTML string.
 * Handles nested tags of the same type correctly.
 *
 * Returns an array of { nodeType, tag, attrs, outerHtml }.
 *
 * e.g.  class="node node--type-page node--promoted"
 *       → nodeType = "page"
 */
function extractNodeTypeBlocks(html) {
  const results = [];
  const tagRe = /<(article|div|section|li|span)\b([^>]*\bnode--type-([\w-]+)\b[^>]*)>/gi;
  let tagMatch;

  while ((tagMatch = tagRe.exec(html)) !== null) {
    const tag      = tagMatch[1];
    const attrs    = tagMatch[2];
    const nodeType = tagMatch[3];
    const start    = tagMatch.index;

    // Walk forward to find the matching closing tag (handles nesting)
    let depth   = 1;
    let cursor  = start + tagMatch[0].length;
    const openRe  = new RegExp(`<${tag}\\b`, 'gi');
    const closeRe = new RegExp(`<\\/${tag}>`, 'gi');

    while (depth > 0 && cursor < html.length) {
      openRe.lastIndex  = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen  = openRe.exec(html);
      const nextClose = closeRe.exec(html);

      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        cursor = nextClose.index + nextClose[0].length;
      }
    }

    results.push({ nodeType, tag, attrs, outerHtml: html.slice(start, cursor) });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  HTML NORMALIZER  (for structural comparison)
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalize HTML for structural comparison.
 * Collapses whitespace and strips dynamic/volatile attributes.
 */
function normalizeHtml(html) {
  return html
    .replace(/\s+/g, ' ')
    .replace(/\bdata-history-node-id=["'][^"']*["']/gi, '')
    .replace(/\bdata-[a-z-]+=["'][^"']*["']/gi, '')
    .replace(/\bstyle=["'][^"']*["']/gi, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════
//  CORE ANALYZER
// ═══════════════════════════════════════════════════════════════════

/**
 * Scan all HTML files inside siteSrcDir (skipping asset folders).
 *
 * Returns:
 * {
 *   semanticTagsSummary : { [tag]:      { totalCount, filesFound[] } },
 *   nodeTypes           : { [nodeType]: { count, canonicalHtml, canonicalNorm, filesFound[] } },
 *   fileReports         : [ { file, semanticTags, nodeTypes } ]
 * }
 */
export { writeNodePartials, writeStructuralPartials, extractDrupalComponents, writeDrupalComponentPartials, extractMenuData, extractBannerData, extractBreadcrumbData };

export function analyzeHtmlFiles(siteSrcDir, options = {}) {
  const fileReports         = [];
  const semanticTagsSummary = {};
  const nodeTypeMap         = {};

  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!ASSET_FOLDERS.has(entry.name.toLowerCase())) walk(absPath, relPath);
        continue;
      }

      // Language filter: skip files that don't match the language filter
      if (!shouldIncludeFile(relPath, options)) continue;

      if (!entry.name.endsWith('.html')) continue;

      let html;
      try { html = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      // ── Semantic tags ──────────────────────────────────────────
      const semanticTags = identifySemanticTags(html);
      for (const [tag, info] of Object.entries(semanticTags)) {
        if (!semanticTagsSummary[tag]) {
          semanticTagsSummary[tag] = { totalCount: 0, filesFound: [] };
        }
        semanticTagsSummary[tag].totalCount += info.count;
        semanticTagsSummary[tag].filesFound.push(relPath);
      }

      // ── node--type-* blocks ────────────────────────────────────
      const nodeBlocks     = extractNodeTypeBlocks(html);
      const nodeTypesInFile = {};

      for (const { nodeType, outerHtml } of nodeBlocks) {
        const norm = normalizeHtml(outerHtml);

        if (!nodeTypeMap[nodeType]) {
          nodeTypeMap[nodeType] = {
            count: 0,
            canonicalHtml: outerHtml,
            canonicalNorm: norm,
            filesFound: [],
          };
        }
        nodeTypeMap[nodeType].count++;
        if (!nodeTypeMap[nodeType].filesFound.includes(relPath)) {
          nodeTypeMap[nodeType].filesFound.push(relPath);
        }

        nodeTypesInFile[nodeType] = (nodeTypesInFile[nodeType] || 0) + 1;
      }

      fileReports.push({ file: relPath, semanticTags, nodeTypes: nodeTypesInFile });
    }
  }

  walk(siteSrcDir, '');

  // Build public nodeTypes — keep canonicalNorm internal for writeNodePartials
  const nodeTypes = {};
  for (const [k, v] of Object.entries(nodeTypeMap)) {
    nodeTypes[k] = {
      count:         v.count,
      canonicalHtml: v.canonicalHtml,
      canonicalNorm: v.canonicalNorm,   // used internally by replaceNodeBlocksInLayouts
      filesFound:    v.filesFound,
    };
  }

  return { semanticTagsSummary, nodeTypes, fileReports };
}

// ═══════════════════════════════════════════════════════════════════
//  LAYOUT FILE UPDATER  — replace raw blocks with partial references
// ═══════════════════════════════════════════════════════════════════

/**
 * Walk all .html files under layoutsDir and replace occurrences of
 * node--type-<nodeType> blocks (that structurally match canonicalHtml)
 * with the Hugo partial reference string.
 */
function replaceNodeBlocksInLayouts(layoutsDir, nodeType, canonicalHtml, partialRef, logs, options = {}) {
  const norm = normalizeHtml(canonicalHtml);
  const nodesPartialDir = path.resolve(layoutsDir, 'partials', 'nodes');
  const partialsDir = path.resolve(layoutsDir, 'partials');

  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip the nodes partial directory and all shared chrome partials
        const resolved = path.resolve(absPath);
        if (resolved === nodesPartialDir || resolved === partialsDir) continue;
        walk(absPath);
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;
      // ── Language filter for root-level layout files (e.g. index.fr.html) ──
      if (!shouldIncludeLayout(relPath, options)) continue;

      let content;
      try { content = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      const tagRe    = /<(article|div|section|li|span)\b([^>]*\bnode--type-[\w-]+\b[^>]*)>/gi;
      const positions = [];
      let m;

      while ((m = tagRe.exec(content)) !== null) {
        // Quick check before expensive nesting walk
        if (!content.slice(m.index).includes(`node--type-${nodeType}`)) continue;

        const tag     = m[1];
        let depth     = 1;
        let cursor    = m.index + m[0].length;
        const openRe  = new RegExp(`<${tag}\\b`, 'gi');
        const closeRe = new RegExp(`<\\/${tag}>`, 'gi');

        while (depth > 0 && cursor < content.length) {
          openRe.lastIndex  = cursor;
          closeRe.lastIndex = cursor;
          const nextOpen  = openRe.exec(content);
          const nextClose = closeRe.exec(content);
          if (!nextClose) break;
          if (nextOpen && nextOpen.index < nextClose.index) {
            depth++;
            cursor = nextOpen.index + nextOpen[0].length;
          } else {
            depth--;
            cursor = nextClose.index + nextClose[0].length;
          }
        }

        const blockHtml = content.slice(m.index, cursor);
        if (normalizeHtml(blockHtml) === norm) {
          positions.push({ start: m.index, end: cursor });
        }
      }

      if (positions.length === 0) continue;

      // Replace from end → start to preserve string indices
      let result = content;
      for (const { start, end } of positions.reverse()) {
        result = result.slice(0, start) + partialRef + result.slice(end);
      }

      try {
        fs.writeFileSync(absPath, result, 'utf8');
        const rel = path.relative(layoutsDir, absPath);
        logs.push(`    ↳ updated layouts/${rel}  (node--type-${nodeType} → partial)`);
      } catch { /* ignore */ }
    }
  }

  walk(layoutsDir, '');
}

// ═══════════════════════════════════════════════════════════════════
//  PARTIAL WRITER
// ═══════════════════════════════════════════════════════════════════

/**
 * For each discovered node--type-*:
 *   1. Write  layouts/partials/nodes/node--type-<x>.html  (canonical HTML)
 *   2. Replace matching raw blocks in all layout .html files with the partial ref
 *
 * Returns array of { nodeType, partialFileName, filesFound }.
 */
function writeNodePartials(nodeTypes, layoutsDir, logs, options = {}) {
  const langSuffix = options.langSuffix || '';
  const nodesPartialDir = path.join(layoutsDir, 'partials', 'nodes');
  fs.mkdirSync(nodesPartialDir, { recursive: true });

  const written = [];

  for (const [nodeType, info] of Object.entries(nodeTypes)) {
    if (info.count === 0) continue;

    const partialFileName = langSuffix
      ? `node--type-${nodeType}-${langSuffix}.html`
      : `node--type-${nodeType}.html`;
    const partialFilePath = path.join(nodesPartialDir, partialFileName);
    const partialRef      = `{{ partial "nodes/${partialFileName}" . }}`;

    // ── Build a dynamic Hugo partial instead of embedding static HTML ──
    const dynamicPartial = buildDynamicNodePartial(nodeType, info.canonicalHtml);

    fs.writeFileSync(partialFilePath, dynamicPartial, 'utf8');
    logs.push(`  ✓ layouts/partials/nodes/${partialFileName}  (dynamic, found in ${info.filesFound.length} file(s))`);

    // ── Replace matching raw blocks in layout files (skips partials/nodes/) ──
    const cleanedHtml = info.canonicalHtml
      .replace(/\{\{-?\s*partial\s+"[^"]*"\s+\.[^}]*?-?\}\}/gi, '');
    replaceNodeBlocksInLayouts(layoutsDir, nodeType, cleanedHtml, partialRef, logs, options);

    written.push({ nodeType, partialFileName, filesFound: info.filesFound });
  }

  return written;
}

// ═══════════════════════════════════════════════════════════════════
//  DYNAMIC PARTIAL BUILDER  (structure-preserving)
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect common Drupal/CMS structural patterns in a node HTML block.
 * Now delegates to STRUCTURAL_PATTERNS for consistency.
 */
function detectNodePatterns(html) {
  const result = {};
  for (const def of STRUCTURAL_PATTERNS) {
    const key = `has${def.type.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}`;
    result[key] = def.pattern.test(html);
  }
  return result;
}

/**
 * Build a structure-preserving Hugo partial for a node--type-* block.
 *
 * Strategy:
 *  1. Keep the FULL original HTML structure intact (Drupal paragraphs, fields, regions)
 *  2. Replace ONLY the values that must be dynamic:
 *     - <title> equivalent headings at the node root level → {{ .Title }}
 *     - Canonical self-links on the node wrapper → {{ .Permalink }}
 *     - Nothing else — all inner content, images, cards, tabs stay as static HTML
 *  3. Escape any remaining {{ }} so Hugo does not mis-parse them
 *  4. Add a comment header describing detected structural patterns
 *
 * This ensures carousels, tabs, sidebars, cards all render identically
 * to the original site.
 */
function buildDynamicNodePartial(nodeType, outerHtml) {
  const patterns = detectNodePatterns(outerHtml);

  // Pattern comment block for developer reference
  const detectedPatterns = Object.entries(patterns)
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/^has/, '').toLowerCase())
    .join(', ');

  let html = outerHtml;

  // ── 1. Strip any Hugo partial refs injected by a previous run ──
  html = html.replace(/\{\{-?\s*partial\s+"[^"]*"\s+\.[^}]*?-?\}\}/gi, '');

  // ── 2. Replace node-level self-referencing hrefs with .Permalink ──
  // Only the outermost node link (e.g. "Read more" / node title link)
  // Targets: <a href="..."> that are direct children of the node wrapper
  // and point to a relative path that looks like the node's own URL.
  // We do NOT replace deeply nested links (navigation, cards, references).
  html = html.replace(
    /(<a\b[^>]*\brel=["']bookmark["'][^>]*\bhref=)["'][^"']*["']/gi,
    `$1"{{ .Permalink }}"`
  );

  // ── 3. Replace node __title heading text with {{ .Title }} ──
  // Only targets <h1>/<h2> inside class="node__title"
  html = html.replace(
    /(<[hH][12][^>]*\bclass=["'][^"']*\bnode__title\b[^"']*["'][^>]*>)\s*(<a\b[^>]*>)[^<]*(<\/a>)\s*(<\/[hH][12]>)/g,
    `$1$2{{ .Title }}$3$4`
  );

  // ── 4. Escape any remaining {{ }} from Drupal/JS in the HTML ──
  html = escapeHugoDelimiters(html);

  // ── 5. Build final partial with header comment ──
  const commentLines = [
    `{{/*`,
    `  node--type-${nodeType} partial`,
    `  Auto-generated by Hugo Converter — structure preserved from source site.`,
    detectedPatterns ? `  Detected patterns: ${detectedPatterns}` : `  No special patterns detected.`,
    `  Dynamic vars: .Title, .Permalink`,
    `  All other content (images, cards, tabs, carousels) is static HTML.`,
    `*/}}`,
  ].join('\n');

  return `${commentLines}\n${html}\n`;
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURAL PATTERN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Defines class patterns and Hugo partial mappings for common UI structures.
 * Each entry:
 *   - pattern   : regex to detect the structure in HTML
 *   - type      : logical name used for partial file naming
 *   - partialRef: Hugo partial call to inject
 *   - classHints: known CSS class names associated with this structure
 */
const STRUCTURAL_PATTERNS = [
  {
    type:       'breadcrumb',
    classHints: [
      'breadcrumb', 'breadcrumbs', 'breadcrumb-wrapper', 'breadcrumbs__item',
      'region-breadcrumb', 'breadcrumb-navigation',
    ],
    idHints: ['block-breadcrumbs', 'breadcrumb', 'breadcrumbs'],
    pattern:    /(?:class|id)=["'][^"']*\b(breadcrumb|breadcrumbs|breadcrumb-wrapper|breadcrumbs__item|region-breadcrumb|block-breadcrumbs)\b[^"']*["']/i,
  },
  {
    type:       'tab-menu',
    classHints: [
      'tab-menu', 'nav-tabs', 'covid-tab-menu', 'tabs--primary',
      'paragraph--type--covid-page-menu', 'js-tabs', 'ui-tabs',
    ],
    idHints: ['tab-menu', 'tabs', 'nav-tabs'],
    pattern:    /(?:class|id)=["'][^"']*\b(tab-menu|nav-tabs|covid-tab-menu|tabs--primary|paragraph--type--covid-page-menu|js-tabs|ui-tabs)\b[^"']*["']/i,
  },
  {
    type:       'carousel',
    classHints: [
      'carousel', 'slick', 'swiper', 'owl-carousel', 'splide',
      'slick-slider', 'swiper-container', 'glide',
    ],
    idHints: ['carousel', 'slider', 'banner-carousel'],
    pattern:    /(?:class|id)=["'][^"']*\b(carousel|slick|swiper|owl-carousel|splide|slick-slider|swiper-container|glide)\b[^"']*["']/i,
  },
  {
    type:       'accordion',
    classHints: [
      'accordion', 'collapse', 'paragraph--type--accordion',
      'accordion-item', 'accordion-header', 'accordion-body',
      'collapsible', 'ui-accordion',
    ],
    idHints: ['accordion', 'faq-accordion'],
    pattern:    /(?:class|id)=["'][^"']*\b(accordion|paragraph--type--accordion|accordion-item|accordion-header|collapsible|ui-accordion)\b[^"']*["']/i,
  },
  {
    type:       'menu',
    classHints: [
      'menu', 'nav', 'navbar', 'main-menu', 'primary-menu',
      'site-navigation', 'menu--main', 'navigation', 'region--navigation',
    ],
    idHints: ['main-menu', 'primary-menu', 'site-navigation', 'navbar'],
    pattern:    /(?:class|id)=["'][^"']*\b(menu--main|main-menu|primary-menu|site-navigation|region--navigation)\b[^"']*["']/i,
  },
  {
    type:       'sidebar',
    classHints: [
      'sidebar', 'aside', 'region-sidebar', 'layout-sidebar',
      'col-sidebar', 'widget-area',
    ],
    idHints: ['sidebar', 'main-sidebar', 'secondary-sidebar'],
    pattern:    /(?:class|id)=["'][^"']*\b(sidebar|region-sidebar|layout-sidebar|col-sidebar|widget-area)\b[^"']*["']/i,
  },
  {
    type:       'banner',
    classHints: [
      'banner', 'hero', 'paragraph--type--covid-page-banner',
      'paragraph--type--banner', 'hero-banner', 'site-banner','hero-banner-image',
      'field--name-field-banner-image',
    ],
    idHints: ['banner', 'hero-banner', 'page-banner'],
    pattern:    /(?:class|id)=["'][^"']*\b(banner|hero|paragraph--type--covid-page-banner|paragraph--type--banner|hero-banner|site-banner|hero-banner-image)\b[^"']*["']/i,
  },
];

// ═══════════════════════════════════════════════════════════════════
//  CLASS-BASED STRUCTURE EXTRACTOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Scan HTML and extract all structural blocks matching STRUCTURAL_PATTERNS.
 *
 * For each matched block returns:
 * {
 *   type        : 'tab-menu' | 'carousel' | 'accordion' | ...
 *   tag         : 'div' | 'nav' | 'ul' | ...
 *   matchedClass: the specific CSS class that triggered detection
 *   outerHtml   : full outer HTML of the block (with proper nesting)
 *   startIndex  : character position in source HTML
 * }
 */
function extractStructuralBlocks(html) {
  const results = [];
  const tagRe = /<(div|nav|ul|ol|section|article|aside|header|footer)\b([^>]*)>/gi;
  let m;

  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1];
    const attrs = m[2];
    const startIndex = m.index;

    const match = findStructuralPatternMatch(tag, attrs);
    if (!match) continue;

    const { outerHtml, endIndex } = extractBalancedStructuralBlock(
      html,
      tag,
      startIndex,
      m[0].length
    );

    results.push({
      type: match.type,
      tag,
      attrs,
      matchedClass: match.matchedHint,
      outerHtml,
      startIndex,
      endIndex,
    });
  }

  results.sort((a, b) => a.startIndex - b.startIndex);

  const filtered = [];
  for (const block of results) {
    const isNested = filtered.some(prev =>
      block.startIndex >= prev.startIndex && block.endIndex <= prev.endIndex
    );
    if (!isNested) filtered.push(block);
  }

  console.log(
    `[DEBUG] extractStructuralBlocks found ${filtered.length} blocks:`,
    filtered.map(b => `${b.type}@${b.startIndex}`)
  );

  return filtered.map(({ endIndex, ...block }) => block);
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURAL MATCH HELPERS
// ═══════════════════════════════════════════════════════════════════

function findStructuralPatternMatch(tag, attrs) {
  const classValue = attrs.match(/\bclass=["']([^"']+)["']/i)?.[1] ?? '';
  const idValue    = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? '';
  const classes    = classValue.split(/\s+/).filter(Boolean);
  const openTag    = `<${tag}${attrs}>`;

  for (const def of STRUCTURAL_PATTERNS) {
    if ((def.idHints || []).includes(idValue)) {
      return { type: def.type, matchedHint: idValue };
    }

    const classHit = def.classHints.find(hint => classes.includes(hint));
    if (classHit) {
      return { type: def.type, matchedHint: classHit };
    }

    if (def.pattern.test(openTag)) {
      return { type: def.type, matchedHint: idValue || classHit || def.type };
    }
  }

  return null;
}
// ═══════════════════════════════════════════════════════════════════
//  DYNAMIC DATA EXTRACTORS FOR FRONT MATTER
// ═══════════════════════════════════════════════════════════════════


/**/
/* Extract carousel/banner slides data from HTML
 */


/**
 * Extract banner/hero data from HTML.
 * Detects multiple hero patterns:
 *  - hero-2: background-image banners (via inline style)
 *  - hero-1: text-only banners (no background image)
 *  - Drupal-style banners with <img> tags (covid-page-banner, hero-banner, etc.)
 * Extracts: heroType, backgroundImage, mobileImage, h1Text, h1Link, introHTML, buttonText, buttonUrl, pcImage, mbImage
 */
function extractBannerData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Strategy 1: Look for hero sections with class patterns (hero-1, hero-2, hero, banner, etc.)
  const heroSection = doc.querySelector(
    '[class*="hero-"], [class*="hero "], .hero, .banner-content, [class*="covid-page-banner"], [class*="hero-banner"], [class*="site-banner"], .banner'
  );
  if (!heroSection) return null;

  const heroClass = heroSection.getAttribute('class') || '';
  const heroStyle = heroSection.getAttribute('style') || '';

  // Detect hero type based on background-image presence
  const bgImageMatch = heroStyle.match(/background-image\s*:\s*url\(['"]?([^'"\)]+)['"]?\)/i);
  const hasBackgroundImage = !!bgImageMatch;

  const result = {};

  if (hasBackgroundImage) {
    // Hero with background image (hero-2 pattern)
    result.heroType = heroClass.match(/hero-\d+/)?.[0] || 'hero-2';
    result.backgroundImage = bgImageMatch[1];

    // Look for mobile image (commonly in a child div with xs-image-replace or visible-xs)
    const mobileDiv = heroSection.querySelector('[class*="xs-image-replace"], [class*="visible-xs"][style*="background-image"]');
    if (mobileDiv) {
      const mbBgMatch = (mobileDiv.getAttribute('style') || '').match(/background-image\s*:\s*url\(['"]?([^'"\)]+)['"]?\)/i);
      if (mbBgMatch) result.mobileImage = mbBgMatch[1];
    }
  } else {
    // Text-only hero (hero-1 pattern) or Drupal img-based banner
    const pcImage = heroSection.querySelector('img[width="2260"], .field--name-field-media-image-1 img, .field--name-field-banner-image img');
    const mbImage = heroSection.querySelector('img[width="780"], .field--name-field-mobile-image img');
    if (pcImage || mbImage) {
      // Drupal-style banner with explicit <img> tags
      result.heroType = heroClass.match(/hero-\d+/)?.[0] || 'banner';
      result.pcImage = pcImage ? pcImage.getAttribute('src') : '';
      result.mbImage = mbImage ? mbImage.getAttribute('src') : '';
      result.pcImageAlt = pcImage ? pcImage.getAttribute('alt') : '';
      result.mbImageAlt = mbImage ? mbImage.getAttribute('alt') : '';
    } else {
      result.heroType = heroClass.match(/hero-\d+/)?.[0] || 'hero-1';
    }
  }

  // Extract h1 text and optional link
  const h1 = heroSection.querySelector('h1');
  if (h1) {
    const h1Link = h1.querySelector('a[href]');
    result.h1Text = (h1.textContent || '').trim();
    if (h1Link) {
      result.h1Link = h1Link.getAttribute('href');
    }
  }

  // Extract intro text (div.intro or similar)
  const intro = heroSection.querySelector('.intro, .hero-description, .banner-text, .hero-text');
  if (intro) {
    // Get innerHTML but exclude any button <a class="btn"> to capture it separately
    const introClone = intro.cloneNode(true);
    const btnInIntro = introClone.querySelector('a.btn, .btn');
    if (btnInIntro) {
      result.buttonText = (btnInIntro.textContent || '').trim();
      result.buttonUrl = btnInIntro.getAttribute('href') || '';
      // Remove the button's parent <p> if it only contains the button
      const btnParent = btnInIntro.parentElement;
      if (btnParent && btnParent.tagName === 'P' && btnParent.querySelectorAll('a').length === 1) {
        btnParent.remove();
      } else {
        btnInIntro.remove();
      }
    }
    // Clean up empty <p>&nbsp;</p> remnants
    const emptyParas = introClone.querySelectorAll('p');
    for (const p of emptyParas) {
      if ((p.textContent || '').trim() === '' || (p.innerHTML || '').trim() === '&nbsp;') {
        p.remove();
      }
    }
    result.introHTML = introClone.innerHTML.trim();
  }

  // Only return if we found meaningful content
  if (result.h1Text || result.introHTML || result.pcImage || result.backgroundImage) {
    return result;
  }
  return null;
}

/**
 * Extract breadcrumb data from HTML.
 * Handles multiple breadcrumb patterns:
 *  - Standard <ol>/<ul> with <li> items
 *  - Inline text breadcrumbs with <a> tags and text separators (e.g. " / ")
 *  - Drupal breadcrumb blocks
 */
function extractBreadcrumbData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const breadcrumb = doc.querySelector(
    '.breadcrumb, .breadcrumbs, [class*="breadcrumb"], ' +
    '[role="navigation"][aria-labelledby*="breadcrumb"], ' +
    '[role="navigation"][aria-label*="breadcrumb"], ' +
    '#breadcrumb, #breadcrumbs, .crumbs'
  );
  if (!breadcrumb) return null;

  const items = [];

  // Strategy 1: List-based breadcrumbs (<ol> or <ul> with <li> items)
  const list = breadcrumb.querySelector('ol, ul');
  if (list) {
    const allLi = Array.from(list.querySelectorAll(':scope > li'));
    for (const li of allLi) {
      const link = li.querySelector('a[href]');
      if (link) {
        items.push({ text: link.textContent.trim(), url: link.getAttribute('href') });
      } else {
        const text = li.textContent.trim();
        if (text) items.push({ text });
      }
    }
  }

  // Strategy 2: Inline breadcrumbs (text nodes mixed with <a> tags, separated by " / ")
  if (items.length === 0) {
    // Find the deepest container with the breadcrumb text (often div.crumbs)
    const crumbsContainer = breadcrumb.querySelector('.crumbs, .crumbs-container .crumbs') || breadcrumb;
    const childNodes = Array.from(crumbsContainer.childNodes);

    for (const node of childNodes) {
      if (node.nodeType === 1 && node.tagName === 'A') {
        // Element node: <a> link
        const text = node.textContent.trim();
        const url = node.getAttribute('href');
        if (text) items.push({ text, url });
      } else if (node.nodeType === 3) {
        // Text node — split by separator and extract non-empty segments
        const parts = node.textContent.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
          // Skip common prefixes like "You are here:"
          if (/^(you are here|du .*r h.*r|accueil|home)\s*:?$/i.test(part)) continue;
          items.push({ text: part });
        }
      }
    }
  }

  return items.length > 0 ? { items } : null;
}

 /* Extract carousel/banner slides data from HTML
 */
function extractCarouselItems(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const carousel = doc.querySelector('.swiper, .carousel, .slick-slider, [class*="swiper-container"]');
  if (!carousel) return null;
  
  const slides = carousel.querySelectorAll('.swiper-slide, .carousel-item, .slick-slide');
  const items = [];
  
  for (const slide of slides) {
    const title = slide.querySelector('h1, h2, h3, .red-style, [class*="title"]');
    const description = slide.querySelector('p, [class*="description"]');
    const link = slide.querySelector('a[href]');
    const pcImage = slide.querySelector('img[src*="pc"], img[src*="desktop"], .field--name-field-pc-image img');
    const mbImage = slide.querySelector('img[src*="mb"], img[src*="mobile"], .field--name-field-mb-image img');
    
    items.push({
      title: title ? title.textContent.trim() : '',
      description: description ? description.innerHTML.trim() : '',
      linkText: link ? link.textContent.trim() : '',
      linkUrl: link ? link.getAttribute('href') : '',
      pcImage: pcImage ? pcImage.getAttribute('src') : '',
      mbImage: mbImage ? mbImage.getAttribute('src') : '',
      pcImageAlt: pcImage ? pcImage.getAttribute('alt') : '',
      mbImageAlt: mbImage ? mbImage.getAttribute('alt') : ''
    });
  }
  
  return items.length > 0 ? { items } : null;
}



/**
 * Extract main menu data from HTML
 */
// CSS class/id fragments that definitively mark a nav as utility (skip it)
const SKIP_NAV_FRAGMENTS = [
  'account', 'user-login', 'menu--account', 'menu--user',
  'language-switcher', 'lang-switcher', 'block-language',
  'social', 'skip-link', 'pager', 'pagination',
];

// CSS class/id fragments that heavily deprioritise (but don't skip) a nav
const DEPRIORITIZE_NAV_CLASSES = [
  'breadcrumb', 'search', 'utility', 'secondary', 'tools',
];

// CSS class/id fragments that suggest a nav IS a primary/structural navigation
const PRIORITIZE_NAV_CLASSES = [
  'menu--main', 'main-menu', 'primary-menu', 'nav-main', 'site-navigation',
  'menu--primary', 'main', 'primary',
  'header',
  'menu--footer', 'footer',
];

/**
 * Generic helper: extract menu items from any nav/ul element.
 * Finds the first `ul` inside `containerEl` that has direct `li` children
 * and returns top-level link items with optional submenu.
 */
function extractNavItems(containerEl) {
  const allUls = Array.from(containerEl.querySelectorAll('ul'));
  const topUl  = allUls.find(ul => ul.querySelectorAll(':scope > li').length > 0);
  if (!topUl) return null;

  const items = [];
  for (const li of topUl.querySelectorAll(':scope > li')) {
    const link = li.querySelector(':scope > a');
    if (!link) continue;
    const text = link.textContent.trim();
    const url  = link.getAttribute('href') || '';
    if (!text) continue;

    const item = { text, url, submenu: [] };

    const subUl = li.querySelector(':scope > ul');
    if (subUl) {
      for (const subLi of subUl.querySelectorAll(':scope > li')) {
        const subLink = subLi.querySelector('a');
        if (subLink) {
          item.submenu.push({
            text: subLink.textContent.trim(),
            url:  subLink.getAttribute('href') || '',
          });
        }
      }
    }

    items.push(item);
  }

  return items.length > 0 ? { items } : null;
}

function extractMenuData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Build candidate list: every <nav> AND every element with role="navigation"
  // that contains at least one <li> (real menu lists).
  const navEls = Array.from(doc.querySelectorAll('nav, [role="navigation"]'));

  let bestNav   = null;
  let bestScore = -Infinity;

  for (const nav of navEls) {
    const classStr = (nav.getAttribute('class') || '').toLowerCase();
    const idStr    = (nav.getAttribute('id')    || '').toLowerCase();
    const combined = classStr + ' ' + idStr;

    // Hard-skip: utility / account / language navs — never use these
    if (SKIP_NAV_FRAGMENTS.some(f => combined.includes(f))) continue;

    // Must contain at least one list item
    const itemCount = nav.querySelectorAll('li').length;
    if (itemCount === 0) continue;

    // Base score = number of items (more items → richer navigation)
    let score = itemCount * 2;

    // Deprioritise secondary/utility menus
    if (DEPRIORITIZE_NAV_CLASSES.some(c => combined.includes(c))) score -= 20;

    // Strongly boost known main/primary/footer menu signals
    if (PRIORITIZE_NAV_CLASSES.some(c => combined.includes(c))) score += 30;

    // Extra boost for explicitly named "main" nav
    if (combined.includes('menu--main') || combined.includes('main-menu'))     score += 50;
    if (combined.includes('menu--primary') || combined.includes('primary-menu')) score += 40;
    if (combined.includes('menu--footer') || combined.includes('footer-menu'))  score += 10;

    if (score > bestScore) { bestScore = score; bestNav = nav; }
  }

  if (!bestNav) return null;
  return extractNavItems(bestNav);
}

function extractTabMenuItems(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const tabMenu = doc.querySelector('.covid-tab-menu, .tab-menu, [class*="nav-tabs"]');
  if (!tabMenu) return null;
  
  const links = tabMenu.querySelectorAll('a[href]');
  const items = [];
  
  for (const link of links) {
    items.push({
      text: link.textContent.trim(),
      url: link.getAttribute('href')
    });
  }
  
  return items.length > 0 ? { items } : null;
}

function extractBalancedStructuralBlock(html, tag, startIndex, openTagLength) {
  let depth = 1;
  let cursor = startIndex + openTagLength;
  const openRe = new RegExp(`<${tag}\\b`, 'gi');
  const closeRe = new RegExp(`<\\/${tag}>`, 'gi');

  while (depth > 0 && cursor < html.length) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;

    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      cursor = nextClose.index + nextClose[0].length;
    }
  }

  return {
    outerHtml: html.slice(startIndex, cursor),
    endIndex: cursor,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURAL BLOCKS REPLACEMENT IN LAYOUTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Walk all .html files under layoutsDir and replace occurrences of
 * structural blocks (that match canonicalHtml) with the Hugo partial reference.
 */
function replaceStructuralBlocksInLayouts(layoutsDir, type, canonicalHtml, partialRef, logs, options = {}) {
  const structuresPartialDir = path.resolve(layoutsDir, 'partials', 'structures');
  const nodesPartialDir = path.resolve(layoutsDir, 'partials', 'nodes');
  // Directories that contain shared chrome partials — never replace blocks inside these
  const partialsDir = path.resolve(layoutsDir, 'partials');

  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const resolved = path.resolve(absPath);
        if (resolved === structuresPartialDir || resolved === nodesPartialDir) continue;
        // Skip the entire partials directory — we must not replace structures
        // inside header.html, footer.html, or other shared chrome partials.
        // Structural block replacement only applies to page-specific layouts.
        if (resolved === partialsDir) continue;
        walk(absPath);
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;
      // ── Language filter for root-level layout files (e.g. index.fr.html) ──
      if (!shouldIncludeLayout(relPath, options)) continue;

      let content;
      try { content = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      // Replace ALL blocks of the same type (not just exact HTML matches)
      // This allows breadcrumbs with different content to be replaced with the same partial
      const positions = extractStructuralBlocks(content)
        .filter(block => block.type === type)  // ← FIXED: Match by type only
        .map(block => ({
          start: block.startIndex,
          end: block.startIndex + block.outerHtml.length,
        }));

      if (positions.length === 0) continue;

      let result = content;
      const ls = options.langSuffix || '';
      for (const { start, end } of positions.reverse()) {
        // Use appropriate partial call based on type
        // For lang-suffixed partials, reference the correct file name
        let replacement = partialRef;
        const suffix = ls ? `-${ls}` : '';
        
        switch (type) {
          case 'tab-menu':
            replacement = `{{ partial "structures/tab-menu${suffix}.html" .Params.tabMenu }}`;
            break;
          case 'carousel':
            replacement = `{{ partial "structures/carousel${suffix}.html" .Params.carousel }}`;
            break;
          case 'banner':
            replacement = `{{ partial "structures/banner${suffix}.html" .Params.banner }}`;
            break;
          case 'menu':
            // navMenu avoids Hugo's reserved built-in 'menu' front matter key
            replacement = `{{ partial "structures/menu${suffix}.html" .Params.navMenu }}`;
            break;
          case 'breadcrumb':
            replacement = `{{ partial "structures/breadcrumb${suffix}.html" .Params.breadcrumb }}`;
            break;
          case 'accordion':
            replacement = `{{ partial "structures/accordion${suffix}.html" .Params.accordion }}`;
            break;
          case 'sidebar':
            replacement = `{{ partial "structures/sidebar${suffix}.html" .Params.sidebar }}`;
            break;
          default:
            replacement = `{{ partial "structures/${type}${suffix}.html" . }}`;
        }
        
        result = result.slice(0, start) + replacement + result.slice(end);
      }

      try {
        fs.writeFileSync(absPath, result, 'utf8');
        const rel = path.relative(layoutsDir, absPath);
        logs.push(`    ↳ updated layouts/${rel}  (${positions.length} ${type} block(s) → partial)`);
      } catch (err) {
        logs.push(`    ✗ failed to update ${path.relative(layoutsDir, absPath)}: ${err.message}`);
      }
    }
  }

  walk(layoutsDir, '');
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURAL PARTIAL WRITER
// ═══════════════════════════════════════════════════════════════════

/**
 * Write Hugo partials for detected structural blocks (tabs, carousels, etc.)
 * Groups blocks by type, picks the canonical (most-common) HTML,
 * and writes to layouts/partials/structures/<type>.html
 *
 * Returns array of { type, partialFileName, occurrences, filesFound }
 */
function writeStructuralPartials(siteSrcDir, layoutsDir, logs, options = {}) {
  const langSuffix = options.langSuffix || '';
  const structuresDir = path.join(layoutsDir, 'partials', 'structures');
  fs.mkdirSync(structuresDir, { recursive: true });

  const typeMap = {};
  const layoutsStructuresDir = path.resolve(layoutsDir, 'partials', 'structures');
  const layoutsNodesDir = path.resolve(layoutsDir, 'partials', 'nodes');

  function walk(dir, relBase, walkOpts = {}) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const resolved = path.resolve(absPath);

        if (walkOpts.skipAssetFolders && ASSET_FOLDERS.has(entry.name.toLowerCase())) continue;
        if (walkOpts.skipPartialDirs && (resolved === layoutsStructuresDir || resolved === layoutsNodesDir)) continue;

        walk(absPath, relPath, walkOpts);
        continue;
      }

      // Language filter: skip files that don't match
      if (walkOpts.langFilter && !shouldIncludeFile(relPath, walkOpts.langFilter)) continue;

      if (!entry.name.endsWith('.html')) continue;

      let html;
      try { html = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      const blocks = extractStructuralBlocks(html);
      const reportPath = walkOpts.label ? `${walkOpts.label}/${relPath}` : relPath;

      for (const block of blocks) {
        if (!typeMap[block.type]) {
          typeMap[block.type] = { blocks: [], normFreq: new Map(), filesFound: new Set() };
        }
        const norm = normalizeHtml(block.outerHtml);
        typeMap[block.type].blocks.push({ html: block.outerHtml, file: reportPath, norm });
        typeMap[block.type].normFreq.set(norm, (typeMap[block.type].normFreq.get(norm) || 0) + 1);
        typeMap[block.type].filesFound.add(reportPath);
      }
    }
  }

  // Apply language filtering to the source scan
  const sourceLangFilter = {};
  if (options.excludePrefixes) sourceLangFilter.excludePrefixes = options.excludePrefixes;
  if (options.includePrefix) sourceLangFilter.includePrefix = options.includePrefix;

  walk(siteSrcDir, '', { label: 'source', skipAssetFolders: true, langFilter: Object.keys(sourceLangFilter).length ? sourceLangFilter : null });
  walk(layoutsDir, '', { label: 'layouts', skipPartialDirs: true });

  const written = [];
  
  // ═══════════════════════════════════════════════════════════════════
  // THRESHOLD: Only create partials for truly common structures
  // ═══════════════════════════════════════════════════════════════════
  const MIN_FILES_THRESHOLD = 2;

  for (const [type, data] of Object.entries(typeMap)) {
    if (data.blocks.length === 0) continue;

    // ─── Check if structure appears in enough files ───
    const uniqueFileCount = data.filesFound.size;
    if (uniqueFileCount < MIN_FILES_THRESHOLD) {
      logs.push(
        `  ⊗ Skipped ${type}: found in only ${uniqueFileCount} file(s) ` +
        `(requires ${MIN_FILES_THRESHOLD}+ files to create partial)`
      );
      continue;
    }

    let maxCount = 0;
    let canonicalNorm = '';
    for (const [norm, count] of data.normFreq.entries()) {
      if (count > maxCount) {
        maxCount = count;
        canonicalNorm = norm;
      }
    }

    const canonicalBlock = data.blocks.find(b => b.norm === canonicalNorm);
    if (!canonicalBlock) continue;

    const partialFileName = langSuffix ? `${type}-${langSuffix}.html` : `${type}.html`;
    const partialFilePath = path.join(structuresDir, partialFileName);
    const partialRef = `{{ partial "structures/${partialFileName}" . }}`;
    const partial = buildStructuralPartial(type, canonicalBlock.html, data.blocks.length);

    fs.writeFileSync(partialFilePath, partial, 'utf8');

    const filesFound = [...data.filesFound];
    logs.push(
      `  ✓ layouts/partials/structures/${partialFileName} ` +
      `(${type}, ${data.blocks.length} occurrence(s) in ${filesFound.length} file(s))`
    );

    const cleanedHtml = canonicalBlock.html
      .replace(/\{\{-?\s*partial\s+"[^"]*"\s+\.[^}]*?-?\}\}/gi, '');
    replaceStructuralBlocksInLayouts(layoutsDir, type, cleanedHtml, partialRef, logs, options);

    written.push({ type, partialFileName, occurrences: data.blocks.length, filesFound });
  }

  return written;
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTURAL PARTIAL BUILDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a Hugo partial for a structural block (tabs, carousels, etc.)
 *
 * @param {string} type - The type of the structural block (e.g., 'tab-menu').
 * @param {string} outerHtml - The outer HTML of the block to be preserved.
 * @param {number} occurrenceCount - The number of times this structure was detected.
 * @returns {string} - The generated Hugßo partial content.
 */
function buildStructuralPartial(type, outerHtml, occurrenceCount) {
  let html = outerHtml;

  // Strip any previously injected Hugo partial refs
  html = html.replace(/\{\{-?\s*partial\s+"[^"]*"\s+\.[^}]*?-?\}\}/gi, '');

  // ═══ SPECIAL HANDLING FOR DYNAMIC PARTIALS ═══
  if (type === 'tab-menu') {
    return buildDynamicTabMenuPartial(html, occurrenceCount);
  }
  if (type === 'carousel') {
    return buildDynamicCarouselPartial(html, occurrenceCount);
  }
  if (type === 'banner') {
    return buildDynamicBannerPartial(html, occurrenceCount);
  }
  if (type === 'menu') {
    return buildDynamicMenuPartial(html, occurrenceCount);
  }
  if (type === 'breadcrumb') {
    return buildDynamicBreadcrumbPartial(html, occurrenceCount);
  }

  // Escape Hugo delimiters from source HTML
  html = escapeHugoDelimiters(html);
  

  const patternDef = STRUCTURAL_PATTERNS.find(p => p.type === type);

  const header = [
    `{{/*`,
    `  Structural partial: ${type}`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  Pattern class hints: ${patternDef?.classHints.join(', ') ?? 'n/a'}`,
    `  Pattern id hints: ${patternDef?.idHints?.join(', ') ?? 'n/a'}`,
    `  Structure is preserved as static HTML.`,
    `  Replace inner text/links with Hugo variables as needed.`,
    `*/}}`,
  ].join('\n');

  return `${header}\n${html}\n`;
}

// ═══════════════════════════════════════════════════════════════════
//  DOM SERIALIZATION HELPERS  (used by dynamic partial builders)
// ═══════════════════════════════════════════════════════════════════

/** Serialize an element's opening tag preserving all original attributes. */
function serializeOpenTag(el) {
  const tag = el.tagName.toLowerCase();
  if (!el.attributes || el.attributes.length === 0) return `<${tag}>`;
  const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ');
  return `<${tag} ${attrs}>`;
}

/** Get the element's close tag. */
function serializeCloseTag(el) {
  return `</${el.tagName.toLowerCase()}>`;
}

/**
 * Returns ancestor elements from outermost down to el's direct parent,
 * stopping (exclusive) at stopEl.
 */
function getAncestorChain(el, stopEl) {
  const ancestors = [];
  let cur = el.parentElement;
  while (cur && cur !== stopEl) {
    ancestors.unshift(cur);
    cur = cur.parentElement;
  }
  return ancestors;
}

/**
 * Strip common state/modifier suffixes from a CSS class list string
 * so only base structural classes remain.
 */
function getBaseClasses(classStr) {
  const stateWords = ['active', 'is-active', 'current', 'selected', 'open', 'is-open', 'visible', 'hidden'];
  const stateSuffixes = ['--active', '--active-trail', '--expanded', '--collapsed', '--open', '--selected', '--current'];
  return (classStr || '')
    .split(/\s+/)
    .filter(c => c && !stateWords.includes(c) && !stateSuffixes.some(s => c.endsWith(s)))
    .join(' ')
    .trim();
}

/**
 * Build dynamic tab-menu partial derived from actual source HTML structure.
 * Extracts real class names and container elements — works for any site.
 */
function buildDynamicTabMenuPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: tab-menu (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  Structure derived from source HTML — adapts to any site.`,
    `  Usage: {{ partial "structures/tab-menu.html" .Params.tabMenu }}`,
    `  Expected front matter:`,
    `  tabMenu:`,
    `    items:`,
    `      - text: "HOME"`,
    `        url: "/home"`,
    `      - text: "ABOUT"`,
    `        url: "/about"`,
    `*/}}`,
  ].join('\n');

  try {
    const dom = new JSDOM(outerHtml);
    const doc = dom.window.document;
    const body = doc.body;

    const links = Array.from(body.querySelectorAll('a[href]'));
    if (links.length === 0) {
      return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
    }

    const firstLink = links[0];
    const root = body.firstElementChild;

    // The "item" wrapper is the link's parent when it is NOT the root container
    const itemWrapper =
      firstLink.parentElement &&
      firstLink.parentElement !== body &&
      firstLink.parentElement !== root
        ? firstLink.parentElement
        : null;

    const linkClass    = firstLink.getAttribute('class') || '';
    const linkClassAttr = linkClass ? ` class="${linkClass}"` : '';
    const linkTpl       = `<a href="{{ .url }}"${linkClassAttr}>{{ .text }}</a>`;

    let itemTpl;
    if (itemWrapper) {
      const iTag       = itemWrapper.tagName.toLowerCase();
      const iClass     = itemWrapper.getAttribute('class') || '';
      const iClassAttr = iClass ? ` class="${iClass}"` : '';
      itemTpl = `<${iTag}${iClassAttr}>${linkTpl}</${iTag}>`;
    } else {
      itemTpl = linkTpl;
    }

    // Build ancestor wrapper chain
    const itemsParent     = itemWrapper ? itemWrapper.parentElement : (root || body);
    const innerContainer  = itemsParent === body ? root : itemsParent;
    const ancestors       = getAncestorChain(innerContainer === body ? (root || body) : innerContainer, body);
    const wrapOpen        = ancestors.map(a => serializeOpenTag(a)).join('\n');
    const wrapClose       = ancestors.slice().reverse().map(a => serializeCloseTag(a)).join('\n');
    const innerOpen       = innerContainer ? serializeOpenTag(innerContainer) : '';
    const innerClose      = innerContainer ? serializeCloseTag(innerContainer) : '';

    const template = [
      `{{ $tabItems := .items }}`,
      `{{ if $tabItems }}`,
      wrapOpen,
      innerOpen,
      `  {{ range $tabItems }}`,
      `    ${itemTpl}`,
      `  {{ end }}`,
      innerClose,
      wrapClose,
      `{{ end }}`,
    ].filter(Boolean).join('\n');

    return `${header}\n${template}\n`;
  } catch {
    return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
  }
}

/**
 * Build dynamic breadcrumb partial derived from actual source HTML structure.
 * Handles both list-based (<ol>/<ul> with <li>) and inline breadcrumbs (text + <a> tags).
 */
function buildDynamicBreadcrumbPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: breadcrumb (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  Structure derived from source HTML — adapts to any site.`,
    `  Usage: {{ partial "structures/breadcrumb.html" .Params.breadcrumb }}`,
    `  Expected front matter:`,
    `  breadcrumb:`,
    `    items:`,
    `      - text: "Home"`,
    `        url: "/"`,
    `      - text: "Current Page"`,
    `*/}}`,
  ].join('\n');

  try {
    const dom = new JSDOM(outerHtml);
    const doc = dom.window.document;
    const body = doc.body;

    // Find the breadcrumb list element
    const list =
      body.querySelector('ol') ||
      body.querySelector('ul.breadcrumbs') ||
      body.querySelector('ul.breadcrumb') ||
      body.querySelector('nav ul') ||
      body.querySelector('ul');

    if (list) {
      // ─── List-based breadcrumb ───
      const listTag       = list.tagName.toLowerCase();
      const listClass     = list.getAttribute('class') || '';
      const listClassAttr = listClass ? ` class="${listClass}"` : '';

      const allLi = Array.from(list.querySelectorAll(':scope > li'));
      if (allLi.length === 0) {
        return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
      }

      const normalLi = allLi.find(li => li.querySelector('a'));
      const activeLi = allLi.find(li =>
        !li.querySelector('a') ||
        li.className.includes('active') ||
        li.className.includes('current')
      );

      const liBaseClass    = getBaseClasses((normalLi || allLi[0]).getAttribute('class') || '');
      const activeModifier = activeLi
        ? (activeLi.getAttribute('class') || '')
            .split(' ')
            .find(c => c.includes('active') || c.includes('current')) || ''
        : '';

      const liClassTpl = liBaseClass
        ? (activeModifier
            ? `class="${liBaseClass}{{ if .active }} ${activeModifier}{{ end }}"`
            : `class="${liBaseClass}"`)
        : `{{ if .active }}class="${activeModifier || 'active'}"{{ end }}`;

      const linkEl        = (normalLi || allLi[0]).querySelector('a');
      const linkClass     = linkEl?.getAttribute('class') || '';
      const linkClassAttr = linkClass ? ` class="${linkClass}"` : '';

      const ancestors = getAncestorChain(list, body);
      const wrapOpen  = ancestors.map(a => serializeOpenTag(a)).join('\n');
      const wrapClose = ancestors.slice().reverse().map(a => serializeCloseTag(a)).join('\n');

      const template = [
        `{{ $breadcrumb := . }}`,
        `{{ if $breadcrumb.items }}`,
        wrapOpen,
        `<${listTag}${listClassAttr}>`,
        `  {{ range $breadcrumb.items }}`,
        `  <li ${liClassTpl}>`,
        `    {{ if .url }}<a href="{{ .url }}"${linkClassAttr}>{{ .text }}</a>{{ else }}{{ .text }}{{ end }}`,
        `  </li>`,
        `  {{ end }}`,
        `</${listTag}>`,
        wrapClose,
        `{{ end }}`,
      ].filter(Boolean).join('\n');

      return `${header}\n${template}\n`;
    } else {
      // ─── Inline / div-based breadcrumb ───
      // Preserve outermost wrapper structure, replace items with dynamic range
      const root = body.firstElementChild;
      if (!root) return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;

      // Find the innermost crumbs container
      const crumbs = root.querySelector('.crumbs, .crumbs-container .crumbs') || root;
      const crumbsTag = crumbs.tagName.toLowerCase();
      const crumbsClass = crumbs.getAttribute('class') || '';

      // Detect link class from any <a> in the breadcrumb
      const existingLink = crumbs.querySelector('a');
      const linkClass = existingLink ? (existingLink.getAttribute('class') || '') : '';
      const linkClassAttr = linkClass ? ` class="${linkClass}"` : '';

      // Detect separator: look for text nodes containing "/"
      const separator = ' / ';

      // Build ancestor chain from crumbs to root
      const ancestors = getAncestorChain(crumbs, body);
      const wrapOpen  = ancestors.map(a => serializeOpenTag(a)).join('\n');
      const wrapClose = ancestors.slice().reverse().map(a => serializeCloseTag(a)).join('\n');

      const template = [
        `{{ $breadcrumb := . }}`,
        `{{ if $breadcrumb.items }}`,
        wrapOpen,
        `<${crumbsTag}${crumbsClass ? ` class="${crumbsClass}"` : ''}>`,
        `  {{ range $i, $item := $breadcrumb.items }}{{ if $i }}${separator}{{ end }}{{ if .url }}<a href="{{ .url }}"${linkClassAttr}>{{ .text }}</a>{{ else }}{{ .text }}{{ end }}{{ end }}`,
        `</${crumbsTag}>`,
        wrapClose,
        `{{ end }}`,
      ].filter(Boolean).join('\n');

      return `${header}\n${template}\n`;
    }
  } catch {
    return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
  }
}

/**
 * Build dynamic carousel partial derived from actual source HTML structure.
 * Uses the first slide as the slide template with image fields made dynamic.
 * Text content structure is preserved from the source site's first slide.
 */
function buildDynamicCarouselPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: carousel (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  Structure derived from source HTML — adapts to any site.`,
    `  Usage: {{ partial "structures/carousel.html" .Params.carousel }}`,
    `  Dynamic fields: .pcImage, .pcImageAlt, .mbImage, .mbImageAlt (images per slide)`,
    `  Note: To make heading/link text dynamic, update the template manually.`,
    `  Expected front matter:`,
    `  carousel:`,
    `    items:`,
    `      - pcImage: "/images/slide1-pc.jpg"`,
    `        pcImageAlt: "Slide one"`,
    `        mbImage: "/images/slide1-mb.jpg"`,
    `        mbImageAlt: "Slide one"`,
    `*/}}`,
  ].join('\n');

  try {
    const dom = new JSDOM(outerHtml);
    const doc = dom.window.document;
    const body = doc.body;

    // Find slides (exclude cloned slick slides)
    const allSlides = Array.from(
      body.querySelectorAll('.swiper-slide, .carousel-item, .slick-slide, [class*="-slide"]')
    ).filter(s => !s.className.includes('cloned') && !s.className.includes('clone'));

    if (allSlides.length === 0) {
      return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
    }

    const firstSlide   = allSlides[0];
    const slidesParent = firstSlide.parentElement;

    // ── Build slide template from actual first slide HTML ──────────────────
    // Escape original {{ }} FIRST so injected Hugo vars are not re-escaped
    let slideTpl = escapeHugoDelimiters(firstSlide.outerHTML);

    // Replace images: first img → pcImage, second → mbImage
    let imgIdx = 0;
    slideTpl = slideTpl.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
      imgIdx++;
      if (imgIdx === 1) {
        return `<img${attrs
          .replace(/\bsrc=["'][^"']*["']/, 'src="{{ .pcImage }}"')
          .replace(/\balt=["'][^"']*["']/, 'alt="{{ .pcImageAlt }}"')
        }>`;
      }
      if (imgIdx === 2) {
        return `<img${attrs
          .replace(/\bsrc=["'][^"']*["']/, 'src="{{ .mbImage }}"')
          .replace(/\balt=["'][^"']*["']/, 'alt="{{ .mbImageAlt }}"')
        }>`;
      }
      return match;
    });

    // ── Build slides container and outer wrapper ───────────────────────────
    const slidesParentClass = slidesParent?.getAttribute('class') || '';
    const slidesParentTag   = slidesParent?.tagName.toLowerCase() || 'div';
    const slidesParentAttr  = slidesParentClass ? ` class="${slidesParentClass}"` : '';
    const slidesContainerOpen  = `<${slidesParentTag}${slidesParentAttr}>`;
    const slidesContainerClose = `</${slidesParentTag}>`;

    // Walk up to get outer ancestors of the slides container
    const outerEl   = slidesParent?.parentElement;
    const ancestors = (outerEl && outerEl !== body)
      ? getAncestorChain(outerEl, body).concat([outerEl])
      : [];
    const wrapOpen  = ancestors.map(a => serializeOpenTag(a)).join('\n');
    const wrapClose = ancestors.slice().reverse().map(a => serializeCloseTag(a)).join('\n');

    const template = [
      `{{ $slides := .items }}`,
      `{{ if $slides }}`,
      wrapOpen,
      slidesContainerOpen,
      `  {{ range $slides }}`,
      `    ${slideTpl}`,
      `  {{ end }}`,
      slidesContainerClose,
      wrapClose,
      `{{ end }}`,
    ].filter(Boolean).join('\n');

    return `${header}\n${template}\n`;
  } catch {
    return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
  }
}

/**
 * Build dynamic banner partial derived from actual source HTML structure.
 * Handles multiple patterns:
 *  - hero-2: background-image banners with mobile image, h1, intro, optional button
 *  - hero-1: text-only banners with h1 and intro
 *  - Drupal-style banners with <img> tags (pcImage/mbImage)
 * Preserves the source site's wrapper elements and class names.
 */
function buildDynamicBannerPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: banner (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  Structure derived from source HTML — adapts to any site.`,
    `  Usage: {{ partial "structures/banner.html" .Params.banner }}`,
    `  Expected front matter:`,
    `  banner:`,
    `    heroType: "hero-2"`,
    `    backgroundImage: "/images/hero-bg.jpg"`,
    `    mobileImage: "/images/hero-mb.jpg"`,
    `    h1Text: "Page Title"`,
    `    h1Link: "/optional-link"`,
    `    introHTML: "<p>Description text</p>"`,
    `    buttonText: "Learn More"`,
    `    buttonUrl: "/page"`,
    `    pcImage: "/images/banner-pc.jpg"`,
    `    mbImage: "/images/banner-mb.jpg"`,
    `    pcImageAlt: "Banner description"`,
    `    mbImageAlt: "Banner description"`,
    `*/}}`,
  ].join('\n');

  try {
    const dom = new JSDOM(outerHtml);
    const doc = dom.window.document;
    const body = doc.body;
    const root = body.firstElementChild;
    if (!root) return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;

    const rootClass = root.getAttribute('class') || '';
    const rootStyle = root.getAttribute('style') || '';
    const hasBackgroundImage = /background-image/i.test(rootStyle);
    const hasImgTags = root.querySelector('img') !== null;

    // Determine which template strategy to use based on source HTML
    if (hasBackgroundImage) {
      // ─── Hero with background-image (hero-2 style) ───
      // Build the template preserving the source structure but making fields dynamic
      const rootTag = root.tagName.toLowerCase();

      // Find the mobile image div
      const mobileDiv = root.querySelector('[class*="xs-image-replace"], [class*="visible-xs"][style*="background-image"]');
      const mobileDivClass = mobileDiv ? (mobileDiv.getAttribute('class') || '') : '';
      const mobileDivTag = mobileDiv ? mobileDiv.tagName.toLowerCase() : 'div';

      // Find h1
      const h1 = root.querySelector('h1');
      const h1Class = h1 ? (h1.getAttribute('class') || '') : '';

      // Find intro div
      const intro = root.querySelector('.intro, .hero-description, .banner-text, .hero-text');
      const introClass = intro ? (intro.getAttribute('class') || '') : '';
      const introTag = intro ? intro.tagName.toLowerCase() : 'div';

      // Find button
      const btn = root.querySelector('a.btn, a[class*="btn"]');
      const btnClass = btn ? (btn.getAttribute('class') || '') : '';

      // Build ancestor chain between root and the h1/content (the right-column wrapper)
      const contentCol = h1 ? h1.parentElement : null;
      const contentColTag = contentCol && contentCol !== root ? contentCol.tagName.toLowerCase() : '';
      const contentColClass = contentCol && contentCol !== root ? (contentCol.getAttribute('class') || '') : '';

      // Check if there's an intermediate container (e.g. div.container)
      const container = contentCol && contentCol.parentElement !== root && contentCol.parentElement !== body
        ? contentCol.parentElement : null;
      const containerTag = container ? container.tagName.toLowerCase() : '';
      const containerClass = container ? (container.getAttribute('class') || '') : '';

      const lines = [];
      lines.push(`{{ $banner := . }}`);
      lines.push(`{{ if $banner }}`);

      // Hero-2 block (background-image)
      lines.push(`{{ if eq $banner.heroType "hero-2" }}`);
      lines.push(`<${rootTag} class="${rootClass}" style="background-image: url('{{ $banner.backgroundImage }}')">`);
      if (mobileDiv) {
        lines.push(`  <${mobileDivTag} class="${mobileDivClass}" style="background-image: url('{{ $banner.mobileImage }}')"></${mobileDivTag}>`);
      }
      if (container) lines.push(`  <${containerTag}${containerClass ? ` class="${containerClass}"` : ''}>`);
      if (contentCol && contentCol !== root) {
        lines.push(`  <${contentColTag}${contentColClass ? ` class="${contentColClass}"` : ''}>`);
      }
      lines.push(`    {{ if $banner.h1Link }}`);
      lines.push(`    <h1${h1Class ? ` class="${h1Class}"` : ''}><a href="{{ $banner.h1Link }}">{{ $banner.h1Text }}</a></h1>`);
      lines.push(`    {{ else }}`);
      lines.push(`    <h1${h1Class ? ` class="${h1Class}"` : ''}>{{ $banner.h1Text }}</h1>`);
      lines.push(`    {{ end }}`);
      if (intro) {
        lines.push(`    {{ if $banner.introHTML }}`);
        lines.push(`    <${introTag}${introClass ? ` class="${introClass}"` : ''}>{{ $banner.introHTML | safeHTML }}</${introTag}>`);
        lines.push(`    {{ end }}`);
      }
      if (btn) {
        lines.push(`    {{ if $banner.buttonText }}`);
        lines.push(`    <a href="{{ $banner.buttonUrl }}" class="${btnClass}">{{ $banner.buttonText }}</a>`);
        lines.push(`    {{ end }}`);
      }
      if (contentCol && contentCol !== root) {
        lines.push(`  </${contentColTag}>`);
      }
      if (container) lines.push(`  </${containerTag}>`);
      lines.push(`</${rootTag}>`);

      // Hero-1 fallback (text-only)
      lines.push(`{{ else }}`);
      lines.push(`<${rootTag} class="{{ $banner.heroType }}">`);
      if (container) lines.push(`  <${containerTag}${containerClass ? ` class="${containerClass}"` : ''}>`);
      lines.push(`  <h1${h1Class ? ` class="${h1Class}"` : ''}>{{ $banner.h1Text }}</h1>`);
      lines.push(`  {{ if $banner.introHTML }}`);
      lines.push(`  <${introTag}${introClass ? ` class="${introClass}"` : ''}>{{ $banner.introHTML | safeHTML }}</${introTag}>`);
      lines.push(`  {{ end }}`);
      if (container) lines.push(`  </${containerTag}>`);
      lines.push(`</${rootTag}>`);
      lines.push(`{{ end }}`);

      lines.push(`{{ end }}`);

      return `${header}\n${lines.join('\n')}\n`;
    } else if (hasImgTags) {
      // ─── Drupal-style banner with <img> tags ───
      let html = escapeHugoDelimiters(outerHtml);
      let imgIdx = 0;
      html = html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
        imgIdx++;
        if (imgIdx === 1) {
          return `<img${attrs
            .replace(/\bsrc=["'][^"']*["']/, 'src="{{ .pcImage }}"')
            .replace(/\balt=["'][^"']*["']/, 'alt="{{ .pcImageAlt }}"')
          }>`;
        }
        if (imgIdx === 2) {
          return `<img${attrs
            .replace(/\bsrc=["'][^"']*["']/, 'src="{{ .mbImage }}"')
            .replace(/\balt=["'][^"']*["']/, 'alt="{{ .mbImageAlt }}"')
          }>`;
        }
        return match;
      });

      // Also make h1 dynamic if present
      html = html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, (match, attrs) => {
        return `{{ if .h1Text }}<h1${attrs}>{{ .h1Text }}</h1>{{ end }}`;
      });

      return `${header}\n{{ if . }}\n${html}\n{{ end }}\n`;
    } else {
      // ─── Text-only hero (hero-1 style, no images) ───
      const rootTag = root.tagName.toLowerCase();
      const h1 = root.querySelector('h1');
      const h1Class = h1 ? (h1.getAttribute('class') || '') : '';
      const intro = root.querySelector('.intro, .hero-description, .banner-text, .hero-text');
      const introClass = intro ? (intro.getAttribute('class') || '') : '';
      const introTag = intro ? intro.tagName.toLowerCase() : 'div';

      const lines = [];
      lines.push(`{{ $banner := . }}`);
      lines.push(`{{ if $banner }}`);
      lines.push(`<${rootTag} class="{{ $banner.heroType | default "${rootClass}" }}">`);
      lines.push(`  <h1${h1Class ? ` class="${h1Class}"` : ''}>{{ $banner.h1Text }}</h1>`);
      if (intro) {
        lines.push(`  {{ if $banner.introHTML }}`);
        lines.push(`  <${introTag}${introClass ? ` class="${introClass}"` : ''}>{{ $banner.introHTML | safeHTML }}</${introTag}>`);
        lines.push(`  {{ end }}`);
      }
      lines.push(`</${rootTag}>`);
      lines.push(`{{ end }}`);

      return `${header}\n${lines.join('\n')}\n`;
    }
  } catch {
    return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
  }
}

/**
 * Build dynamic menu partial derived from actual source HTML structure.
 * Extracts real nav/UL/LI class names — no site-specific hard-coding.
 */
function buildDynamicMenuPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: menu (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  Structure derived from source HTML — adapts to any site.`,
    `  Usage: {{ partial "structures/menu.html" .Params.navMenu }}`,
    `  Note: navMenu avoids Hugo's reserved built-in 'menu' front matter key.`,
    `  Expected front matter:`,
    `  navMenu:`,
    `    items:`,
    `      - text: "Home"`,
    `        url: "/"`,
    `        submenu: []`,
    `      - text: "About"`,
    `        url: "/about"`,
    `        submenu:`,
    `          - text: "Team"`,
    `            url: "/about/team"`,
    `*/}}`,
  ].join('\n');

  try {
    const dom = new JSDOM(outerHtml);
    const doc = dom.window.document;
    const body = doc.body;

    // Find the top-level menu UL
    const menuUl =
      body.querySelector('ul.menu') ||
      body.querySelector('[class*="menu-list"]') ||
      body.querySelector('nav > ul') ||
      body.querySelector('ul');

    if (!menuUl) {
      return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
    }

    const ulClass   = menuUl.getAttribute('class') || '';
    const topLiList = Array.from(menuUl.querySelectorAll(':scope > li'));
    if (topLiList.length === 0) {
      return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
    }

    // Extract base LI class (strip state modifiers)
    const firstLi      = topLiList[0];
    const liBaseClass  = getBaseClasses(firstLi.getAttribute('class') || '');

    // Find the expanded/has-children class from an item that has a submenu
    const expandedLi    = topLiList.find(li => li.querySelector(':scope > ul'));
    const expandedClass = expandedLi
      ? (expandedLi.getAttribute('class') || '')
          .split(' ')
          .find(c => c.includes('expanded') || c.includes('has-children')) || ''
      : '';

    // Link class
    const linkEl        = firstLi.querySelector(':scope > a');
    const linkClass     = linkEl?.getAttribute('class') || '';
    const linkClassAttr = linkClass ? ` class="${linkClass}"` : '';

    // Submenu structure
    const subMenuUl   = expandedLi?.querySelector(':scope > ul');
    const subUlClass  = subMenuUl?.getAttribute('class') || ulClass;
    const subFirstLi  = subMenuUl?.querySelector(':scope > li');
    const subLiClass  = getBaseClasses(subFirstLi?.getAttribute('class') || liBaseClass);
    const subLiClassAttr = subLiClass ? ` class="${subLiClass}"` : '';

    // Build class attribute templates
    const liClassTpl = liBaseClass
      ? (expandedClass
          ? ` class="${liBaseClass}{{ if .submenu }} ${expandedClass}{{ end }}"`
          : ` class="${liBaseClass}"`)
      : '';
    const subUlOpen = subUlClass ? `<ul class="${subUlClass}">` : '<ul>';
    const ulOpen    = ulClass    ? `<ul class="${ulClass}">`    : '<ul>';

    // Build ancestor wrapper (everything outside the UL)
    const ancestors = getAncestorChain(menuUl, body);
    const wrapOpen  = ancestors.map(a => serializeOpenTag(a)).join('\n');
    const wrapClose = ancestors.slice().reverse().map(a => serializeCloseTag(a)).join('\n');

    const template = [
      `{{ $menuItems := .items }}`,
      `{{ if $menuItems }}`,
      wrapOpen,
      `  ${ulOpen}`,
      `    {{ range $menuItems }}`,
      `    <li${liClassTpl}>`,
      `      <a href="{{ .url }}"${linkClassAttr}>{{ .text }}</a>`,
      `      {{ if .submenu }}`,
      `      ${subUlOpen}`,
      `        {{ range .submenu }}`,
      `        <li${subLiClassAttr}><a href="{{ .url }}">{{ .text }}</a></li>`,
      `        {{ end }}`,
      `      </ul>`,
      `      {{ end }}`,
      `    </li>`,
      `    {{ end }}`,
      `  </ul>`,
      wrapClose,
      `{{ end }}`,
    ].filter(Boolean).join('\n');

    return `${header}\n${template}\n`;
  } catch {
    return `${header}\n${escapeHugoDelimiters(outerHtml)}\n`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DYNAMIC DRUPAL COMPONENT DISCOVERY
// ═══════════════════════════════════════════════════════════════════

/**
 * Dynamically scan all HTML files in a site directory and discover
 * Drupal components: paragraph types, field types, block types, regions,
 * and custom component patterns — regardless of which Drupal site it is.
 *
 * Returns: {
 *   paragraphTypes : { [type]: { count, filesFound[], canonicalHtml } },
 *   fieldTypes     : { [type]: { count, filesFound[], canonicalHtml } },
 *   blockTypes     : { [type]: { count, filesFound[], canonicalHtml, blockId } },
 *   regionTypes    : { [type]: { count, filesFound[], canonicalHtml } },
 *   componentPatterns : { [type]: { count, filesFound[], canonicalHtml } },
 * }
 */
function extractDrupalComponents(siteSrcDir, options = {}) {
  const paragraphTypes    = {};
  const fieldTypes        = {};
  const blockTypes        = {};
  const regionTypes       = {};
  const componentPatterns = {};

  // Component patterns detected by wrapper CSS class conventions
  // These are discovered dynamically — any site-specific wrapper classes
  // are picked up by the paragraph/block/region regexes above.
  // This list catches common non-Drupal-convention component wrappers.
  const COMPONENT_WRAPPERS = [
    { re: /class="[^"]*\b(stage-wrapper)\b[^"]*"/gi,           type: 'stage' },
    { re: /class="[^"]*\b(title-text-wrapper)\b[^"]*"/gi,      type: 'title-text' },
    { re: /class="[^"]*\b(image-text-wrapper)\b[^"]*"/gi,      type: 'image-text' },
    { re: /class="[^"]*\b(teasers-wrapper)\b[^"]*"/gi,         type: 'teaser-section' },
    { re: /class="[^"]*\b(teaser-cta-wrapper)\b[^"]*"/gi,      type: 'teaser-cta' },
    { re: /class="[^"]*\b(fold-in-wrapper)\b[^"]*"/gi,         type: 'fold-in' },
    { re: /class="[^"]*\b(three-blocks(?!-))\b[^"]*"/gi,       type: 'three-blocks' },
    { re: /class="[^"]*\b(three-blocks-detailed)\b[^"]*"/gi,   type: 'three-blocks-detailed' },
    { re: /class="[^"]*\b(white-banner)\b[^"]*"/gi,            type: 'white-banner' },
    { re: /class="[^"]*\b(back-to-top)\b[^"]*"/gi,             type: 'back-to-top' },
    { re: /class="[^"]*\b(refrences|references)\b[^"]*"/gi,    type: 'references' },
  ];

  function extractBlockFromPosition(html, matchIndex) {
    // Walk backwards from match to find the opening tag
    let tagStart = matchIndex;
    while (tagStart > 0 && html[tagStart] !== '<') tagStart--;

    const tagNameMatch = html.slice(tagStart).match(/^<([\w]+)\b/);
    const tag = tagNameMatch ? tagNameMatch[1].toLowerCase() : 'div';

    const openRe  = new RegExp(`<${tag}\\b`, 'gi');
    const closeRe = new RegExp(`<\\/${tag}>`, 'gi');
    let depth = 1;
    const openTagEnd = html.indexOf('>', tagStart) + 1;
    let cursor = openTagEnd;

    while (depth > 0 && cursor < html.length) {
      openRe.lastIndex  = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen  = openRe.exec(html);
      const nextClose = closeRe.exec(html);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        cursor = nextClose.index + nextClose[0].length;
      }
    }
    return html.slice(tagStart, cursor);
  }

  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!ASSET_FOLDERS.has(entry.name.toLowerCase())) walk(absPath, relPath);
        continue;
      }

      // Language filter: skip files that don't match
      if (!shouldIncludeFile(relPath, options)) continue;

      if (!entry.name.endsWith('.html')) continue;

      let html;
      try { html = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      // ── Paragraph types ──
      let m;
      const paraRe = /class="[^"]*\bparagraph--type--([\w-]+)\b[^"]*"/gi;
      while ((m = paraRe.exec(html)) !== null) {
        const pType = m[1];
        if (!paragraphTypes[pType]) {
          paragraphTypes[pType] = {
            count: 0,
            filesFound: [],
            canonicalHtml: extractBlockFromPosition(html, m.index),
          };
        }
        paragraphTypes[pType].count++;
        if (!paragraphTypes[pType].filesFound.includes(relPath)) {
          paragraphTypes[pType].filesFound.push(relPath);
        }
      }

      // ── Field types (unique field names per file) ──
      const fieldRe = /class="[^"]*\bfield--name-(field-[\w-]+)\b[^"]*"/gi;
      const seenFields = new Set();
      while ((m = fieldRe.exec(html)) !== null) {
        const fType = m[1];
        if (seenFields.has(fType)) continue;
        seenFields.add(fType);
        if (!fieldTypes[fType]) {
          fieldTypes[fType] = {
            count: 0,
            filesFound: [],
            canonicalHtml: extractBlockFromPosition(html, m.index),
          };
        }
        fieldTypes[fType].count++;
        if (!fieldTypes[fType].filesFound.includes(relPath)) {
          fieldTypes[fType].filesFound.push(relPath);
        }
      }

      // ── Block types (Drupal block-block-content with unique IDs) ──
      const blockRe = /id="(block-[\w-]+)"[^>]*class="[^"]*\bblock\b[^"]*block-block-content\b[^"]*"/gi;
      while ((m = blockRe.exec(html)) !== null) {
        const blockId = m[1];
        const bType = blockId.replace(/^block-/, '');
        if (!blockTypes[bType]) {
          blockTypes[bType] = {
            count: 0, filesFound: [],
            canonicalHtml: extractBlockFromPosition(html, m.index),
            blockId,
          };
        }
        blockTypes[bType].count++;
        if (!blockTypes[bType].filesFound.includes(relPath)) {
          blockTypes[bType].filesFound.push(relPath);
        }
      }
      // Also check reverse attribute order: class before id
      const blockRe2 = /class="[^"]*\bblock\b[^"]*block-block-content\b[^"]*"[^>]*id="(block-[\w-]+)"/gi;
      while ((m = blockRe2.exec(html)) !== null) {
        const blockId = m[1];
        const bType = blockId.replace(/^block-/, '');
        if (blockTypes[bType] && blockTypes[bType].filesFound.includes(relPath)) continue;
        if (!blockTypes[bType]) {
          blockTypes[bType] = {
            count: 0, filesFound: [],
            canonicalHtml: extractBlockFromPosition(html, m.index),
            blockId,
          };
        }
        blockTypes[bType].count++;
        if (!blockTypes[bType].filesFound.includes(relPath)) {
          blockTypes[bType].filesFound.push(relPath);
        }
      }

      // ── Region types ──
      const regionRe = /class="[^"]*\bregion\s+region-([\w-]+)\b[^"]*"/gi;
      while ((m = regionRe.exec(html)) !== null) {
        const rType = m[1];
        if (!regionTypes[rType]) {
          regionTypes[rType] = {
            count: 0, filesFound: [],
            canonicalHtml: extractBlockFromPosition(html, m.index),
          };
        }
        regionTypes[rType].count++;
        if (!regionTypes[rType].filesFound.includes(relPath)) {
          regionTypes[rType].filesFound.push(relPath);
        }
      }

      // ── Component patterns ──
      for (const { re, type } of COMPONENT_WRAPPERS) {
        re.lastIndex = 0;
        let cm;
        while ((cm = re.exec(html)) !== null) {
          if (!componentPatterns[type]) {
            componentPatterns[type] = {
              count: 0, filesFound: [],
              canonicalHtml: extractBlockFromPosition(html, cm.index),
            };
          }
          componentPatterns[type].count++;
          if (!componentPatterns[type].filesFound.includes(relPath)) {
            componentPatterns[type].filesFound.push(relPath);
          }
        }
      }
    }
  }

  walk(siteSrcDir, '');

  return { paragraphTypes, fieldTypes, blockTypes, regionTypes, componentPatterns };
}

// ═══════════════════════════════════════════════════════════════════
//  DRUPAL COMPONENT PARTIAL WRITER
// ═══════════════════════════════════════════════════════════════════

/**
 * Write Hugo partials for all dynamically discovered Drupal components.
 * Creates partials only for components found across multiple pages (shared blocks/regions),
 * or all paragraph/component types (always useful as partials).
 *
 * @param {object} components - Output from extractDrupalComponents()
 * @param {string} layoutsDir - Path to Hugo layouts/ directory
 * @param {string[]} logs - Accumulator for log messages
 * @returns {{ paragraphs: object[], fields: object[], blocks: object[], regions: object[], components: object[] }}
 */
function writeDrupalComponentPartials(components, layoutsDir, logs, options = {}) {
  const langSuffix = options.langSuffix || '';
  const result = { paragraphs: [], fields: [], blocks: [], regions: [], components: [] };

  // ── Paragraph partials ────────────────────────────────────────
  if (Object.keys(components.paragraphTypes).length > 0) {
    const dir = path.join(layoutsDir, 'partials', 'paragraphs');
    fs.mkdirSync(dir, { recursive: true });
    logs.push(`\n  Paragraph types detected${langSuffix ? ` (${langSuffix})` : ''}:`);

    for (const [pType, info] of Object.entries(components.paragraphTypes)) {
      const fileName = langSuffix
        ? `paragraph--${pType}-${langSuffix}.html`
        : `paragraph--${pType}.html`;
      const filePath = path.join(dir, fileName);
      const partial = buildComponentPartial('paragraph', pType, info.canonicalHtml, info.count, info.filesFound);
      fs.writeFileSync(filePath, partial, 'utf8');
      logs.push(`    ✓ partials/paragraphs/${fileName}  (${info.count} occurrence(s) in ${info.filesFound.length} file(s))`);
      result.paragraphs.push({ type: pType, fileName, count: info.count, filesFound: info.filesFound });
    }
  }

  // ── Block partials (shared blocks appearing in 2+ files) ──────
  if (Object.keys(components.blockTypes).length > 0) {
    const dir = path.join(layoutsDir, 'partials', 'blocks');
    fs.mkdirSync(dir, { recursive: true });
    const sharedBlocks = Object.entries(components.blockTypes)
      .filter(([, info]) => info.filesFound.length >= 2);

    if (sharedBlocks.length > 0) {
      logs.push(`\n  Shared block types detected${langSuffix ? ` (${langSuffix})` : ''}:`);
      for (const [bType, info] of sharedBlocks) {
        const fileName = langSuffix
          ? `block--${bType}-${langSuffix}.html`
          : `block--${bType}.html`;
        const filePath = path.join(dir, fileName);
        const partial = buildComponentPartial('block', bType, info.canonicalHtml, info.count, info.filesFound);
        fs.writeFileSync(filePath, partial, 'utf8');
        logs.push(`    ✓ partials/blocks/${fileName}  (${info.count} occurrence(s) in ${info.filesFound.length} file(s))`);
        result.blocks.push({ type: bType, fileName, count: info.count, filesFound: info.filesFound, blockId: info.blockId });
      }
    }
  }

  // ── Region partials (shared regions) ──────────────────────────
  if (Object.keys(components.regionTypes).length > 0) {
    const dir = path.join(layoutsDir, 'partials', 'regions');
    fs.mkdirSync(dir, { recursive: true });
    // Skip 'content' region — it wraps page-specific content that differs per page
    const sharedRegions = Object.entries(components.regionTypes)
      .filter(([rType, info]) => info.filesFound.length >= 2 && rType !== 'content');

    if (sharedRegions.length > 0) {
      logs.push(`\n  Shared region types detected${langSuffix ? ` (${langSuffix})` : ''}:`);
      for (const [rType, info] of sharedRegions) {
        const fileName = langSuffix
          ? `region--${rType}-${langSuffix}.html`
          : `region--${rType}.html`;
        const filePath = path.join(dir, fileName);
        const partial = buildComponentPartial('region', rType, info.canonicalHtml, info.count, info.filesFound);
        fs.writeFileSync(filePath, partial, 'utf8');
        logs.push(`    ✓ partials/regions/${fileName}  (${info.count} occurrence(s) in ${info.filesFound.length} file(s))`);
        result.regions.push({ type: rType, fileName, count: info.count, filesFound: info.filesFound });
      }
    }
  }

  // ── Component pattern partials ────────────────────────────────
  if (Object.keys(components.componentPatterns).length > 0) {
    const dir = path.join(layoutsDir, 'partials', 'components');
    fs.mkdirSync(dir, { recursive: true });
    logs.push(`\n  Component patterns detected${langSuffix ? ` (${langSuffix})` : ''}:`);

    for (const [cType, info] of Object.entries(components.componentPatterns)) {
      const fileName = langSuffix
        ? `${cType}-${langSuffix}.html`
        : `${cType}.html`;
      const filePath = path.join(dir, fileName);
      const partial = buildComponentPartial('component', cType, info.canonicalHtml, info.count, info.filesFound);
      fs.writeFileSync(filePath, partial, 'utf8');
      logs.push(`    ✓ partials/components/${fileName}  (${info.count} occurrence(s) in ${info.filesFound.length} file(s))`);
      result.components.push({ type: cType, fileName, count: info.count, filesFound: info.filesFound });
    }
  }

  // ── Field summary (logged but not written as individual partials — too granular) ──
  if (Object.keys(components.fieldTypes).length > 0) {
    logs.push(`\n  Field types detected:`);
    for (const [fType, info] of Object.entries(components.fieldTypes)) {
      const fieldKind = fType.includes('image') ? 'image'
        : fType.includes('text') ? 'text'
        : fType.includes('link') ? 'link'
        : fType.includes('banner') ? 'image'
        : 'generic';
      logs.push(`    ◦ ${fType} (${fieldKind}) — ${info.count} occurrence(s) in ${info.filesFound.length} file(s)`);
      result.fields.push({ type: fType, fieldKind, count: info.count, filesFound: info.filesFound });
    }
  }

  // ── Replace occurrences in layout files ──────────────────────
  logs.push(`\n  Wiring partials into layout files${langSuffix ? ` (${langSuffix})` : ''}…`);
  replaceDrupalComponentsInLayouts(result, layoutsDir, logs, options);

  return result;
}

/**
 * Build a Hugo partial for a Drupal component (paragraph, block, region, or generic component).
 * Preserves the full HTML structure, escapes Hugo delimiters, adds documentation header.
 */
function buildComponentPartial(category, type, outerHtml, count, filesFound) {
  let html = outerHtml || '';

  // Strip any previously injected Hugo partial refs
  html = html.replace(/\{\{-?\s*partial\s+"[^"]*"\s+\.[^}]*?-?\}\}/gi, '');

  // Escape Hugo delimiters
  html = escapeHugoDelimiters(html);

  const header = [
    `{{/*`,
    `  ${category}: ${type}`,
    `  Auto-generated by Hugo Converter — structure preserved from source site.`,
    `  Occurrences: ${count} in ${filesFound.length} file(s)`,
    `  Files: ${filesFound.slice(0, 5).join(', ')}${filesFound.length > 5 ? ', …' : ''}`,
    `  Customize this partial to use Hugo template variables as needed.`,
    `*/}}`,
  ].join('\n');

  return `${header}\n${html}\n`;
}

// ═══════════════════════════════════════════════════════════════════
//  DRUPAL COMPONENT REPLACER IN LAYOUTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Walk all .html files under layoutsDir and replace Drupal component HTML
 * blocks with Hugo {{ partial "..." . }} calls.
 *
 * Handles:
 *  - Blocks:     <div id="block-X" ...>  →  {{ partial "blocks/block--X.html" . }}
 *  - Paragraphs: <div class="...paragraph--type--X...">  →  {{ partial "paragraphs/paragraph--X.html" . }}
 *  - Regions:    <div class="...region region-X...">  →  {{ partial "regions/region--X.html" . }}
 *  - Components: <div class="...wrapper-class...">  →  {{ partial "components/X.html" . }}
 *
 * @param {object} results - Output from writeDrupalComponentPartials (paragraphs, blocks, regions, components)
 * @param {string} layoutsDir - Path to Hugo layouts/ directory
 * @param {string[]} logs - Accumulator for log messages
 */
function replaceDrupalComponentsInLayouts(results, layoutsDir, logs, options = {}) {
  const partialsDir = path.resolve(layoutsDir, 'partials');

  // Build replacement rules from the discovered components
  const rules = [];

  // Block rules: match by id="block-X"
  for (const block of (results.blocks || [])) {
    rules.push({
      type: 'block',
      id: block.blockId,          // e.g. "block-headerlogo"
      partialRef: `{{ partial "blocks/${block.fileName}" . }}`,
      label: block.fileName,
    });
  }

  // Paragraph rules: match by paragraph--type--X class
  for (const para of (results.paragraphs || [])) {
    rules.push({
      type: 'paragraph',
      cssClass: `paragraph--type--${para.type}`,
      partialRef: `{{ partial "paragraphs/${para.fileName}" . }}`,
      label: para.fileName,
    });
  }

  // Region rules: match by region region-X class (skip content — it's page-specific)
  for (const region of (results.regions || [])) {
    if (region.type === 'content') continue;
    rules.push({
      type: 'region',
      cssClass: `region-${region.type}`,
      partialRef: `{{ partial "regions/${region.fileName}" . }}`,
      label: region.fileName,
    });
  }

  // Component rules: match by known wrapper CSS class
  const COMPONENT_CLASS_MAP = {
    'stage':               'stage-wrapper',
    'title-text':          'title-text-wrapper',
    'image-text':          'image-text-wrapper',
    'teaser-section':      'teasers-wrapper',
    'teaser-cta':          'teaser-cta-wrapper',
    'fold-in':             'fold-in-wrapper',
    'three-blocks':        'three-blocks',
    'three-blocks-detailed': 'three-blocks-detailed',
    'white-banner':        'white-banner',
    'back-to-top':         'back-to-top',
    'references':          'refrences',   // note: Drupal typo preserved
  };
  for (const comp of (results.components || [])) {
    const markerClass = COMPONENT_CLASS_MAP[comp.type] || comp.type;
    rules.push({
      type: 'component',
      cssClass: markerClass,
      partialRef: `{{ partial "components/${comp.fileName}" . }}`,
      label: comp.fileName,
    });
  }

  if (rules.length === 0) return;

  // ── Walk all layout html files (skip partials dir) ──────────────
  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip the partials directory itself (we don't want to modify the very files we just wrote)
        if (path.resolve(absPath) === partialsDir) continue;
        // ── Language filter for layout directories ──
        if (!shouldIncludeLayout(relPath, options)) continue;
        walk(absPath, relPath);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      // ── Language filter for root-level layout files (e.g. index.fr.html) ──
      if (!shouldIncludeLayout(relPath, options)) continue;

      let content;
      try { content = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      let modified = content;
      const replacements = [];

      for (const rule of rules) {
        if (rule.type === 'block' && rule.id) {
          // Find the opening tag with this id, then extract the balanced block
          const blockRe = new RegExp(`<(div|section|article|nav|aside|header|footer)\\b[^>]*\\bid="${rule.id}"[^>]*>`, 'gi');
          let m;
          while ((m = blockRe.exec(modified)) !== null) {
            // Skip if already replaced
            if (modified.slice(Math.max(0, m.index - 10), m.index).includes('{{')) continue;
            const tag = m[1].toLowerCase();
            const blockHtml = extractBalancedBlock(modified, m.index, tag);
            if (blockHtml) {
              replacements.push({ start: m.index, end: m.index + blockHtml.length, partialRef: rule.partialRef, label: rule.label });
            }
          }
        } else if ((rule.type === 'paragraph' || rule.type === 'region' || rule.type === 'component') && rule.cssClass) {
          // Find opening tags whose class attribute contains the marker class
          const classRe = new RegExp(
            `<(div|section|article|nav|aside)\\b[^>]*\\bclass="[^"]*(?:^|\\s)${escapeRegex(rule.cssClass)}(?:\\s|")[^>]*>`,
            'gi'
          );
          let m2;
          while ((m2 = classRe.exec(modified)) !== null) {
            if (modified.slice(Math.max(0, m2.index - 10), m2.index).includes('{{')) continue;
            const tag = m2[1].toLowerCase();
            const blockHtml = extractBalancedBlock(modified, m2.index, tag);
            if (blockHtml) {
              replacements.push({ start: m2.index, end: m2.index + blockHtml.length, partialRef: rule.partialRef, label: rule.label });
            }
          }
        }
      }

      if (replacements.length === 0) continue;

      // Sort by start position descending so we can replace without index shifting
      replacements.sort((a, b) => b.start - a.start);

      // Deduplicate: keep only outermost replacements
      const deduped = [];
      for (const r of replacements) {
        const isNested = deduped.some(outer => r.start >= outer.start && r.end <= outer.end);
        if (isNested) continue;
        // Evict any already-accepted items that are nested inside this one
        for (let i = deduped.length - 1; i >= 0; i--) {
          if (deduped[i].start >= r.start && deduped[i].end <= r.end) deduped.splice(i, 1);
        }
        deduped.push(r);
      }
      deduped.sort((a, b) => b.start - a.start);

      for (const { start, end, partialRef } of deduped) {
        modified = modified.slice(0, start) + partialRef + '\n' + modified.slice(end);
      }

      try {
        fs.writeFileSync(absPath, modified, 'utf8');
        const rel = path.relative(layoutsDir, absPath);
        const labels = [...new Set(deduped.map(r => r.label))].join(', ');
        logs.push(`    ↳ updated layouts/${rel}  (${deduped.length} component(s) → partials: ${labels})`);
      } catch (e) {
        logs.push(`    ✗ failed to update ${absPath}: ${e.message}`);
      }
    }
  }

  walk(layoutsDir, '');

  // ── Second pass: wire block/component refs INSIDE region & paragraph partials ──────────────
  // Region and paragraph partials were written with raw Drupal block HTML.
  // Re-walk only those container partial dirs, applying block-only rules so
  // region partials end up referencing block partials (but never region-in-region).
  // For multilingual: only process partials that belong to this language.
  const langSuffix = options.langSuffix || '';
  const blockAndComponentRules = rules.filter(r => r.type === 'block' || r.type === 'component');
  if (blockAndComponentRules.length > 0) {
    const containerDirs = ['regions', 'paragraphs']
      .map(d => path.join(partialsDir, d))
      .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });

    for (const containerDir of containerDirs) {
      let partialFiles;
      try { partialFiles = fs.readdirSync(containerDir).filter(f => f.endsWith('.html')); }
      catch { continue; }

      // Filter partial files to only process those belonging to the current language
      if (langSuffix) {
        partialFiles = partialFiles.filter(f => f.endsWith(`-${langSuffix}.html`));
      } else {
        // Default language: skip lang-suffixed partials (they belong to other languages)
        const langSuffixPattern = /-[a-z]{2}\.html$/;
        partialFiles = partialFiles.filter(f => !langSuffixPattern.test(f));
      }

      for (const fname of partialFiles) {
        const absPath = path.join(containerDir, fname);
        let content;
        try { content = fs.readFileSync(absPath, 'utf8'); }
        catch { continue; }

        let modified = content;
        const replacements = [];

        for (const rule of blockAndComponentRules) {
          if (rule.type === 'block' && rule.id) {
            const blockRe = new RegExp(
              `<(div|section|article|nav|aside|header|footer)\\b[^>]*\\bid="${rule.id}"[^>]*>`,
              'gi'
            );
            let m;
            while ((m = blockRe.exec(modified)) !== null) {
              if (modified.slice(Math.max(0, m.index - 10), m.index).includes('{{')) continue;
              const tag = m[1].toLowerCase();
              const blockHtml = extractBalancedBlock(modified, m.index, tag);
              if (blockHtml) {
                replacements.push({
                  start: m.index,
                  end: m.index + blockHtml.length,
                  partialRef: rule.partialRef,
                  label: rule.label,
                });
              }
            }
          } else if (rule.type === 'component' && rule.cssClass) {
            const classRe = new RegExp(
              `<(div|section|article|nav|aside)\\b[^>]*\\bclass="[^"]*(?:^|\\s)${escapeRegex(rule.cssClass)}(?:\\s|")[^>]*>`,
              'gi'
            );
            let m2;
            while ((m2 = classRe.exec(modified)) !== null) {
              if (modified.slice(Math.max(0, m2.index - 10), m2.index).includes('{{')) continue;
              const tag = m2[1].toLowerCase();
              const blockHtml = extractBalancedBlock(modified, m2.index, tag);
              if (blockHtml) {
                replacements.push({
                  start: m2.index,
                  end: m2.index + blockHtml.length,
                  partialRef: rule.partialRef,
                  label: rule.label,
                });
              }
            }
          }
        }

        if (replacements.length === 0) continue;

        replacements.sort((a, b) => b.start - a.start);
        const deduped = [];
        for (const r of replacements) {
          const isNested = deduped.some(outer => r.start >= outer.start && r.end <= outer.end);
          if (isNested) continue;
          for (let i = deduped.length - 1; i >= 0; i--) {
            if (deduped[i].start >= r.start && deduped[i].end <= r.end) deduped.splice(i, 1);
          }
          deduped.push(r);
        }
        deduped.sort((a, b) => b.start - a.start);

        for (const { start, end, partialRef } of deduped) {
          modified = modified.slice(0, start) + partialRef + '\n' + modified.slice(end);
        }

        try {
          fs.writeFileSync(absPath, modified, 'utf8');
          const rel = path.relative(partialsDir, absPath);
          const labels = [...new Set(deduped.map(r => r.label))].join(', ');
          logs.push(`    ↳ wired partials/${rel}  (${deduped.length} block(s): ${labels})`);
        } catch (e) {
          logs.push(`    ✗ failed to update ${absPath}: ${e.message}`);
        }
      }
    }
  }

  // ── Third pass: wire ALL partial refs (regions + blocks) in static header.html & footer.html
  // These are the static partials created in Step 5 from the Drupal header/footer HTML.
  // Using ALL rules means region divs are replaced by region partial refs (outermost wins via
  // deduplication), creating the proper chain: header.html → region--header.html → block--X.html
  if (rules.length > 0) {
    // Use configurable header/footer files — for non-default languages, wire into
    // header-{lang}.html and footer-{lang}.html instead of the default files.
    const headerFooterFiles = options.headerFooterFiles || ['header.html', 'footer.html'];
    const staticPartials = headerFooterFiles
      .map(f => path.join(partialsDir, f))
      .filter(f => { try { return fs.statSync(f).isFile(); } catch { return false; } });

    for (const absPath of staticPartials) {
      let content;
      try { content = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      let modified = content;
      const replacements = [];

      for (const rule of rules) {
        if (rule.type === 'block' && rule.id) {
          const blockRe = new RegExp(
            `<(div|section|article|nav|aside|header|footer)\\b[^>]*\\bid="${rule.id}"[^>]*>`,
            'gi'
          );
          let m;
          while ((m = blockRe.exec(modified)) !== null) {
            if (modified.slice(Math.max(0, m.index - 10), m.index).includes('{{')) continue;
            const tag = m[1].toLowerCase();
            const blockHtml = extractBalancedBlock(modified, m.index, tag);
            if (blockHtml) {
              replacements.push({
                start: m.index,
                end: m.index + blockHtml.length,
                partialRef: rule.partialRef,
                label: rule.label,
              });
            }
          }
        } else if ((rule.type === 'region' || rule.type === 'paragraph' || rule.type === 'component') && rule.cssClass) {
          const classRe = new RegExp(
            `<(div|section|article|nav|aside)\\b[^>]*\\bclass="[^"]*(?:^|\\s)${escapeRegex(rule.cssClass)}(?:\\s|")[^>]*>`,
            'gi'
          );
          let m2;
          while ((m2 = classRe.exec(modified)) !== null) {
            if (modified.slice(Math.max(0, m2.index - 10), m2.index).includes('{{')) continue;
            const tag = m2[1].toLowerCase();
            const blockHtml = extractBalancedBlock(modified, m2.index, tag);
            if (blockHtml) {
              replacements.push({
                start: m2.index,
                end: m2.index + blockHtml.length,
                partialRef: rule.partialRef,
                label: rule.label,
              });
            }
          }
        }
      }

      if (replacements.length === 0) continue;

      // Sort descending and deduplicate — outermost element wins (region beats nested block)
      replacements.sort((a, b) => b.start - a.start);
      const deduped = [];
      for (const r of replacements) {
        const isNested = deduped.some(outer => r.start >= outer.start && r.end <= outer.end);
        if (isNested) continue;
        for (let i = deduped.length - 1; i >= 0; i--) {
          if (deduped[i].start >= r.start && deduped[i].end <= r.end) deduped.splice(i, 1);
        }
        deduped.push(r);
      }
      deduped.sort((a, b) => b.start - a.start);

      for (const { start, end, partialRef } of deduped) {
        modified = modified.slice(0, start) + partialRef + '\n' + modified.slice(end);
      }

      try {
        fs.writeFileSync(absPath, modified, 'utf8');
        const rel = path.relative(partialsDir, absPath);
        const labels = [...new Set(deduped.map(r => r.label))].join(', ');
        logs.push(`    ↳ wired partials/${rel}  (${deduped.length} partial(s): ${labels})`);
      } catch (e) {
        logs.push(`    ✗ failed to update ${absPath}: ${e.message}`);
      }
    }
  }
}

/** Escape a string for use as a literal pattern inside a RegExp */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the outer HTML of a balanced HTML block starting at startIndex.
 * @param {string} html - Full HTML string
 * @param {number} startIndex - Index of the opening '<' of the block
 * @param {string} tag - Tag name (e.g. 'div')
 * @returns {string|null} - Full outer HTML of the block, or null if not found
 */
function extractBalancedBlock(html, startIndex, tag) {
  const openTagEnd = html.indexOf('>', startIndex);
  if (openTagEnd === -1) return null;

  // Handle self-closing tags
  if (html[openTagEnd - 1] === '/') return html.slice(startIndex, openTagEnd + 1);

  const openRe  = new RegExp(`<${tag}\\b`, 'gi');
  const closeRe = new RegExp(`<\\/${tag}>`, 'gi');
  let depth = 1;
  let cursor = openTagEnd + 1;

  while (depth > 0 && cursor < html.length) {
    openRe.lastIndex  = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen  = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;  // unbalanced / truncated HTML — abort cleanly
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      cursor = nextClose.index + nextClose[0].length;
    }
  }
  if (depth !== 0) return null;
  return html.slice(startIndex, cursor);
}
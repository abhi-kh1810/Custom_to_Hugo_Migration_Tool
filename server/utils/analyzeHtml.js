import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Folders inside an httrack download that are asset directories, NOT pages
const ASSET_FOLDERS = new Set([
  'css', 'js', 'images', 'fonts', 'files', 'unprocessed',
  'errors', '.git', 'node_modules', '__macosx', 'thumbs',
]);
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
export function identifySemanticTags(html) {
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
export function extractNodeTypeBlocks(html) {
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
export function normalizeHtml(html) {
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
export function analyzeHtmlFiles(siteSrcDir) {
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
export function replaceNodeBlocksInLayouts(layoutsDir, nodeType, canonicalHtml, partialRef, logs) {
  const norm = normalizeHtml(canonicalHtml);
  const nodesPartialDir = path.resolve(layoutsDir, 'partials', 'nodes');

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // ── Skip the nodes partial directory entirely ──
        if (path.resolve(absPath) === nodesPartialDir) continue;
        walk(absPath);
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;

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

  walk(layoutsDir);
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
export function writeNodePartials(nodeTypes, layoutsDir, logs) {
  const nodesPartialDir = path.join(layoutsDir, 'partials', 'nodes');
  fs.mkdirSync(nodesPartialDir, { recursive: true });

  const written = [];

  for (const [nodeType, info] of Object.entries(nodeTypes)) {
    if (info.count === 0) continue;

    const partialFileName = `node--type-${nodeType}.html`;
    const partialFilePath = path.join(nodesPartialDir, partialFileName);
    const partialRef      = `{{ partial "nodes/${partialFileName}" . }}`;

    // ── Build a dynamic Hugo partial instead of embedding static HTML ──
    const dynamicPartial = buildDynamicNodePartial(nodeType, info.canonicalHtml);

    fs.writeFileSync(partialFilePath, dynamicPartial, 'utf8');
    logs.push(`  ✓ layouts/partials/nodes/${partialFileName}  (dynamic, found in ${info.filesFound.length} file(s))`);

    // ── Replace matching raw blocks in layout files (skips partials/nodes/) ──
    const cleanedHtml = info.canonicalHtml
      .replace(/\{\{-?\s*partial\s+"[^"]*"\s+\.[^}]*?-?\}\}/gi, '');
    replaceNodeBlocksInLayouts(layoutsDir, nodeType, cleanedHtml, partialRef, logs);

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
export function extractStructuralBlocks(html) {
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
 * Extract banner data from HTML
 */
export function extractBannerData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const banner = doc.querySelector('.banner-content, .hero, [class*="covid-page-banner"], [class*="hero-banner"]');
  if (!banner) return null;
  
  const pcImage = banner.querySelector('img[width="2260"], .field--name-field-media-image-1 img');
  const mbImage = banner.querySelector('img[width="780"], .field--name-field-mobile-image img');
  
  return {
    pcImage: pcImage ? pcImage.getAttribute('src') : '',
    mbImage: mbImage ? mbImage.getAttribute('src') : '',
    pcImageAlt: pcImage ? pcImage.getAttribute('alt') : '',
    mbImageAlt: mbImage ? mbImage.getAttribute('alt') : ''
  };
}

/**
 * Extract breadcrumb data from HTML
 */
export function extractBreadcrumbData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const breadcrumb = doc.querySelector('.breadcrumb, .breadcrumbs, [role="navigation"][aria-labelledby*="breadcrumb"]');
  if (!breadcrumb) return null;
  
  const items = [];
  const links = breadcrumb.querySelectorAll('a, li');
  
  for (const item of links) {
    if (item.tagName === 'A') {
      items.push({
        text: item.textContent.trim(),
        url: item.getAttribute('href'),
        active: false
      });
    } else if (item.tagName === 'LI' && !item.querySelector('a')) {
      // Current page (no link)
      items.push({
        text: item.textContent.trim(),
        url: '',
        active: true
      });
    }
  }
  
  return items.length > 0 ? { items } : null;
}

 /* Extract carousel/banner slides data from HTML
 */
export function extractCarouselItems(html) {
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
export function extractMenuData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Look for different menu structures
  let menu = doc.querySelector('.menu--main, #block-pfkpsg-main-menu, nav[role="navigation"]');
  
  // Check for storefront navigation
  if (!menu) {
    menu = doc.querySelector('.storefront-nav, nav.storefront-nav');
  }
  
  if (!menu) return null;
  
  const items = [];
  
  // Handle storefront-nav structure (Breakthrough Change Accelerator)
  const storefrontItems = menu.querySelectorAll(':scope > ul > li');
  if (storefrontItems.length > 0) {
    for (const li of storefrontItems) {
      const link = li.querySelector('a');
      if (link) {
        items.push({
          text: link.textContent.trim(),
          url: link.getAttribute('href') || '',
          submenu: []
        });
      }
    }
    return items.length > 0 ? { items } : null;
  }
  
  // Handle menu--main structure (KnowPneumonia style)
  const topLevelItems = menu.querySelectorAll(':scope > .scroll-block > .nav-list-box > ul.menu > li.menu-item');
  
  for (const li of topLevelItems) {
    const link = li.querySelector(':scope > a');
    const submenu = li.querySelector(':scope > ul.menu');
    const item = {
      text: link ? link.textContent.trim() : '',
      url: link ? link.getAttribute('href') : '',
      submenu: []
    };
    
    if (submenu) {
      const subItems = submenu.querySelectorAll(':scope > li.menu-item > a');
      for (const subLink of subItems) {
        item.submenu.push({
          text: subLink.textContent.trim(),
          url: subLink.getAttribute('href')
        });
      }
    }
    
    items.push(item);
  }
  
  return items.length > 0 ? { items } : null;
}

export function extractTabMenuItems(html) {
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
export function replaceStructuralBlocksInLayouts(layoutsDir, type, canonicalHtml, partialRef, logs) {
  const structuresPartialDir = path.resolve(layoutsDir, 'partials', 'structures');
  const nodesPartialDir = path.resolve(layoutsDir, 'partials', 'nodes');

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const resolved = path.resolve(absPath);
        if (resolved === structuresPartialDir || resolved === nodesPartialDir) continue;
        walk(absPath);
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;

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
      for (const { start, end } of positions.reverse()) {
        // Use appropriate partial call based on type
        let replacement = partialRef;
        
        switch (type) {
          case 'tab-menu':
            replacement = '{{ partial "structures/tab-menu.html" .Params.tabMenu }}';
            break;
          case 'carousel':
            replacement = '{{ partial "structures/carousel.html" .Params.carousel }}';
            break;
          case 'banner':
            replacement = '{{ partial "structures/banner.html" .Params.banner }}';
            break;
          case 'menu':
            replacement = '{{ partial "structures/menu.html" .Params.menu }}';
            break;
          case 'breadcrumb':
            replacement = '{{ partial "structures/breadcrumb.html" .Params.breadcrumb }}';
            break;
          case 'accordion':
            replacement = '{{ partial "structures/accordion.html" .Params.accordion }}';
            break;
          case 'sidebar':
            replacement = '{{ partial "structures/sidebar.html" .Params.sidebar }}';
            break;
          default:
            // For any other types, use generic context
            replacement = `{{ partial "structures/${type}.html" . }}`;
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

  walk(layoutsDir);
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
export function writeStructuralPartials(siteSrcDir, layoutsDir, logs) {
  const structuresDir = path.join(layoutsDir, 'partials', 'structures');
  fs.mkdirSync(structuresDir, { recursive: true });

  const typeMap = {};
  const layoutsStructuresDir = path.resolve(layoutsDir, 'partials', 'structures');
  const layoutsNodesDir = path.resolve(layoutsDir, 'partials', 'nodes');

  function walk(dir, relBase, options = {}) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const resolved = path.resolve(absPath);

        if (options.skipAssetFolders && ASSET_FOLDERS.has(entry.name.toLowerCase())) continue;
        if (options.skipPartialDirs && (resolved === layoutsStructuresDir || resolved === layoutsNodesDir)) continue;

        walk(absPath, relPath, options);
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;

      let html;
      try { html = fs.readFileSync(absPath, 'utf8'); }
      catch { continue; }

      const blocks = extractStructuralBlocks(html);
      const reportPath = options.label ? `${options.label}/${relPath}` : relPath;

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

  walk(siteSrcDir, '', { label: 'source', skipAssetFolders: true });
  walk(layoutsDir, '', { label: 'layouts', skipPartialDirs: true });

  const written = [];
  
  // ═══════════════════════════════════════════════════════════════════
  // THRESHOLD: Only create partials for truly common structures
  // ═══════════════════════════════════════════════════════════════════
  const MIN_FILES_THRESHOLD = 2; // Structure must appear in at least 10 files

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

    const partialFileName = `${type}.html`;
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
    replaceStructuralBlocksInLayouts(layoutsDir, type, cleanedHtml, partialRef, logs);

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

/**
 * Build dynamic tab-menu partial
 */
function buildDynamicTabMenuPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: tab-menu (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  `,
    `  Preserves structure, makes menu items dynamic.`,
    `  `,
    `  Usage:`,
    `    {{ partial "structures/tab-menu.html" .Params.tabMenu }}`,
    `  `,
    `  Expected front matter:`,
    `  tabMenu:`,
    `    items:`,
    `      - text: "HOME"`,
    `        url: "../covid-19-my-reasons"`,
    `      - text: "SYMPTOMS"`,
    `        url: "#symptoms"`,
    `*/}}`,
  ].join('\n');

  const template = `
{{ $menuItems := .items }}

{{ if $menuItems }}
<div class="field__item page-menu covid-tab-menu">
  <div class="paragraph paragraph--type--covid-page-menu paragraph--view-mode--default">
    <div class="field field--name-field-menu-item field--type-link field--label-hidden field__items">
      {{ range $menuItems }}
        <div class="field__item">
          <a href="{{ .url }}">{{ .text }}</a>
        </div>
      {{ end }}
    </div>
  </div>
</div>
{{ end }}
`;

  return header + '\n' + template;
}

/**
 * Build dynamic breadcrumb partial
 */
function buildDynamicBreadcrumbPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: breadcrumb (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  `,
    `  Usage: {{ partial "structures/breadcrumb.html" .Params.breadcrumb }}`,
    `  `,
    `  Expected front matter:`,
    `  breadcrumb:`,
    `    items:`,
    `      - text: "Home"`,
    `        url: "/"`,
    `        active: false`,
    `      - text: "Current Page"`,
    `        url: ""`,
    `        active: true`,
    `*/}}`,
  ].join('\n');

  const template = `
{{ $breadcrumb := . }}
{{ if $breadcrumb.items }}
<div id="block-breadcrumbs">
  <div class="container">
    <nav role="navigation" aria-labelledby="system-breadcrumb">
      <h2 id="system-breadcrumb" class="visually-hidden">Breadcrumb</h2>
      <ul class="breadcrumbs">
        {{ range $breadcrumb.items }}
        <li class="breadcrumbs__item{{ if .active }} breadcrumbs__item--active{{ end }}">
          {{ if .url }}
            <a href="{{ .url }}" class="breadcrumbs__link">{{ .text }}</a>
          {{ else }}
            {{ .text }}
          {{ end }}
        </li>
        {{ end }}
      </ul>
    </nav>
  </div>
</div>
{{ end }}
`;

  return header + '\n' + template;
}

/**
 * Build dynamic carousel partial
 */
function buildDynamicCarouselPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: carousel (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  `,
    `  Usage: {{ partial "structures/carousel.html" .Params.carousel }}`,
    `  `,
    `  Expected front matter:`,
    `  carousel:`,
    `    items:`,
    `      - title: "65 OR OLDER?"`,
    `        description: "<p>You may be at greater risk...</p>"`,
    `        linkText: "Learn More"`,
    `        linkUrl: "pneumococcal-pneumonia"`,
    `        pcImage: "/images/home_banner01_pc.jpg"`,
    `        mbImage: "/images/home_banner01_mb.jpg"`,
    `*/}}`,
  ].join('\n');

  const template = `
{{ $slides := .items }}
{{ if $slides }}
<div class="home-swiper-container">
  <div class="swiper-button-prev">
    <img src="/images/chev-left.svg" alt="prev"/>
  </div>
  <div class="swiper">
    <div class="field field--name-field-banner field--type-entity-reference-revisions field--label-hidden swiper-wrapper field__items">
      {{ range $slides }}
      <div class="swiper-slide">
        <div class="field__item">
          <div class="paragraph paragraph--type--banner paragraph--view-mode--homepage">
            <div class="banner-des">
              <div class="des-container">
                {{ if .title }}
                <div class="clearfix text-formatted field field--name-field-title field--type-text field--label-hidden field__item">
                  <div class="red-style">{{ .title }}</div>
                </div>
                {{ end }}
                {{ if .description }}
                <div class="clearfix text-formatted field field--name-field-description field--type-text-long field--label-hidden field__item">
                  {{ .description | safeHTML }}
                </div>
                {{ end }}
                {{ if .linkUrl }}
                <div class="field field--name-field-link field--type-link field--label-hidden field__items">
                  <div class="field__item"><a href="{{ .linkUrl }}">{{ .linkText }}</a></div>
                </div>
                {{ end }}
              </div>
            </div>
            <div class="banner-imgs">
              {{ if .pcImage }}
              <div class="field field--name-field-pc-image field--type-entity-reference field--label-hidden field__item">
                <img loading="eager" src="{{ .pcImage }}" alt="{{ .pcImageAlt }}" />
              </div>
              {{ end }}
              {{ if .mbImage }}
              <div class="field field--name-field-mb-image field--type-entity-reference field--label-hidden field__item">
                <img loading="eager" src="{{ .mbImage }}" alt="{{ .mbImageAlt }}" />
              </div>
              {{ end }}
            </div>
          </div>
        </div>
      </div>
      {{ end }}
    </div>
  </div>
  <div class="swiper-button-next">
    <img src="/images/chev-right.svg" alt="next"/>
  </div>
</div>
{{ end }}
`;

  return header + '\n' + template;
}

/**
 * Build dynamic banner partial
 */
function buildDynamicBannerPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: banner (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  `,
    `  Usage: {{ partial "structures/banner.html" .Params.banner }}`,
    `  `,
    `  Expected front matter:`,
    `  banner:`,
    `    pcImage: "/images/covid19_today_hero_v2.jpg"`,
    `    mbImage: "/images/covid19_today_hero_mob.jpg"`,
    `    pcImageAlt: "Covid19 today"`,
    `    mbImageAlt: "Covid19 today"`,
    `*/}}`,
  ].join('\n');

  const template = `
{{ if . }}
<div class="banner-content covid-content">
  <div class="field__item">
    <div class="paragraph paragraph--type--covid-page-banner paragraph--view-mode--default">
      <div class="field field--name-field-responsive-image field--type-entity-reference field--label-hidden field__item">
        <article class="media media--type-responsive-image media--view-mode-default">
          {{ if .pcImage }}
          <div class="field field--name-field-media-image-1 field--type-image field--label-visually_hidden">
            <div class="field__label visually-hidden">Image</div>
            <div class="field__item">
              <img loading="lazy" src="{{ .pcImage }}" alt="{{ .pcImageAlt }}" />
            </div>
          </div>
          {{ end }}
          {{ if .mbImage }}
          <div class="field field--name-field-mobile-image field--type-image field--label-hidden field__item">
            <img loading="lazy" src="{{ .mbImage }}" alt="{{ .mbImageAlt }}" />
          </div>
          {{ end }}
        </article>
      </div>
    </div>
  </div>
</div>
{{ end }}
`;

  return header + '\n' + template;
}

/**
 * Build dynamic menu partial
 */
function buildDynamicMenuPartial(outerHtml, occurrenceCount) {
  const header = [
    `{{/*`,
    `  Structural partial: menu (dynamic)`,
    `  Auto-generated by Hugo Converter.`,
    `  Occurrences found: ${occurrenceCount}`,
    `  `,
    `  Usage: {{ partial "structures/menu.html" .Params.menu }}`,
    `  `,
    `  Note: Menu data should be in data/menu.yaml (site-wide data)`,
    `*/}}`,
  ].join('\n');

  const template = `
{{ $menuItems := .items }}
{{ if $menuItems }}
<nav role="navigation" aria-labelledby="block-pfkpsg-main-menu-menu" id="block-pfkpsg-main-menu" class="block block-menu navigation menu--main">
  <h2 class="visually-hidden" id="block-pfkpsg-main-menu-menu">Main navigation</h2>
  <div class="close-button">
    <img src="/images/header-close.png" alt="hamburger menu"/>
  </div>
  <div class="scroll-block">
    <div class="links-box">
      <a href="https://www.pfizerpro.com.sg/therapy-areas/covid-19/?cmp=kpsg-home" target="_blank" class="header-login-link">Login for Healthcare Professionals</a>
      <a href="https://www.facebook.com/PfizerKnowpneumoniaSG/" target="_blank" class="header-icon-f"><img src="/images/header-icon-f.svg" alt="Header Logo" /></a>
    </div>
    <div class="nav-list-box">
      <ul class="menu">
        {{ range $menuItems }}
        <li class="menu-item{{ if .submenu }} menu-item--expanded{{ end }}">
          <a href="{{ .url }}">{{ .text }}</a>
          {{ if .submenu }}
          <ul class="menu">
            {{ range .submenu }}
            <li class="menu-item">
              <a href="{{ .url }}">{{ .text }}</a>
            </li>
            {{ end }}
          </ul>
          {{ end }}
        </li>
        {{ end }}
      </ul>
    </div>
  </div>
</nav>
{{ end }}
`;

  return header + '\n' + template;
}
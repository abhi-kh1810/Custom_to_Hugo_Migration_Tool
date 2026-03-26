import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  analyzeHtmlFiles,
  writeNodePartials,
  writeStructuralPartials,
  extractDrupalComponents,
  writeDrupalComponentPartials,
} from '../utils/analyzeHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const SITES_BASE_DIR = path.join(__dirname, '..', '..', 'sites');
const HUGO_SITES_DIR = path.join(__dirname, '..', '..', 'Hugo-Sites');
const HUGO_BIN       = '/opt/homebrew/bin/hugo';

// Folders inside an httrack download that are asset directories, NOT pages
const ASSET_FOLDERS = new Set(['css', 'js', 'images', 'fonts', 'files', 'unprocessed', 'errors', '.git', 'node_modules', '__macosx', 'thumbs']);

// ═══════════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════

function parseDomain(input) {
  if (!input) return null;
  let d = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!/^[a-zA-Z0-9.\-_]+$/.test(d)) return null;
  return d;
}

/** Count all files recursively inside a directory */
function countFiles(dir) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
      else count += 1;
    }
  } catch { /* ignore */ }
  return count;
}

/** Extract the outer HTML of a specific tag (e.g. <head>...</head>) */
function extractTag(html, tag) {
  const re = new RegExp(`(<${tag}[\\s>][\\s\\S]*?<\\/${tag}>)`, 'i');
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

/** Extract a single attribute value from the first matching tag */
function extractAttr(html, tag, attr) {
  const re = new RegExp(`<${tag}[^>]+\\b${attr}=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

// ═══════════════════════════════════════════════════════════════════
//  METADATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract rich metadata from an HTML string.
 * Returns { canonicalUrl, lang, title, description, keywords }
 */
function extractMetadata(html, folderName) {
  // 1. Canonical URL
  let canonicalUrl = null;
  const canonicalMatch =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (canonicalMatch) {
    const href = canonicalMatch[1].trim();
    if (href === '.' || href === './') {
      canonicalUrl = `https://${folderName}`;
    } else if (/^https?:\/\//i.test(href)) {
      // Reject localhost / 127.0.0.1 canonical — fall back to actual domain
      const parsedHref = new URL(href);
      if (parsedHref.hostname === 'localhost' || parsedHref.hostname === '127.0.0.1') {
        canonicalUrl = `https://${folderName}`;
      } else {
        canonicalUrl = href.replace(/\/$/, '');
      }
    } else {
      canonicalUrl = `https://${folderName}`;
    }
  } else {
    canonicalUrl = `https://${folderName}`;
  }

  // 2. Language
  let lang = 'en';
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  if (langMatch) lang = langMatch[1].trim();

  // 3. Site name — extracted from <title> by taking the text AFTER the last
  //    separator (" | ", " - ", " – ", " — ").
  //    e.g. "Homepage | Know Pneumonia® SG"
  //        → pageTitle = "Homepage",  title (site name) = "Know Pneumonia® SG"
  //    If no separator found both are set to the full raw title.
  let title = '';
  let pageTitle = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const raw = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    // Find the LAST occurrence of a spaced separator " | ", " - ", " – ", " — "
    const pipeIdx = raw.lastIndexOf(' | ');
    const dashIdx = raw.lastIndexOf(' - ');
    const enIdx   = raw.lastIndexOf(' \u2013 ');
    const emIdx   = raw.lastIndexOf(' \u2014 ');
    const sepIdx  = Math.max(pipeIdx, dashIdx, enIdx, emIdx);
    if (sepIdx !== -1) {
      pageTitle = raw.slice(0, sepIdx).trim();                              // page-specific part
      title     = raw.slice(sepIdx).replace(/^\s*[|\u2013\u2014\-]+\s*/, '').trim(); // site name
    } else {
      title = pageTitle = raw;
    }
  }

  // 4. Description — try meta name, then og:description
  let description = '';
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (descMatch) description = descMatch[1].trim();

  // 5. Keywords
  let keywords = '';
  const kwMatch =
    html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']keywords["']/i);
  if (kwMatch) keywords = kwMatch[1].trim();

  // 6. Abstract
  let abstract = '';
  const abMatch =
    html.match(/<meta[^>]+name=["']abstract["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']abstract["']/i);
  if (abMatch) abstract = abMatch[1].trim();

  return { canonicalUrl, lang, title, pageTitle, description, keywords, abstract };
}

// ═══════════════════════════════════════════════════════════════════
//  BODY / CSS / JS ATTRIBUTE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract the class and id attributes from the <body> tag.
 */
function extractBodyAttributes(html) {
  const bodyMatch = html.match(/<body([^>]*)>/i);
  if (!bodyMatch) return { bodyClass: '', bodyId: '' };
  const attrs      = bodyMatch[1];
  const classMatch = attrs.match(/\bclass=["']([^"']*)["']/i);
  const idMatch    = attrs.match(/\bid=["']([^"']*)["']/i);
  return {
    bodyClass: classMatch ? classMatch[1].trim() : '',
    bodyId:    idMatch    ? idMatch[1].trim()    : '',
  };
}

/**
 * Extract local (non-external, non-seckit) stylesheet hrefs from an HTML page.
 * These will be stored in front matter so each page loads its own CSS.
 */
function extractPageCSS(html) {
  const screen = [];
  const print  = [];
  const regex  = /<link\b([^>]*?)\/?>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1];
    if (/\brel=["']stylesheet["']/i.test(attrs) || /\btype=["']text\/css["']/i.test(attrs)) {
      const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
      if (!hrefMatch) continue;

      const href = hrefMatch[1];
      if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        /seckit|no.?body|clickjacking/i.test(href)
      ) {
        continue;
      }

      const mediaMatch = attrs.match(/\bmedia=["']([^"']+)["']/i);
      const mediaVal   = mediaMatch ? mediaMatch[1].toLowerCase() : '';
      const isPrint    = mediaVal.includes('print');

      if (isPrint) {
        print.push(href);
      } else {
        screen.push(href);
      }
    }
  }

  return { screen, print };
}

/**
 * Extract local (non-external) <script src> tags from the <head> section only.
 * These will be stored in front matter so each page loads its own scripts.
 */
function extractPageHeadJS(html) {
  const headMatch = html.match(/<head[\s>][\s\S]*?<\/head>/i);
  if (!headMatch) return [];
  const scripts = [];
  const regex   = /<script\b([^>]*?)>/gi;
  let match;
  while ((match = regex.exec(headMatch[0])) !== null) {
    const attrs    = match[1];
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (srcMatch) {
      const src = srcMatch[1];
      if (!src.startsWith('http://') && !src.startsWith('https://')) {
        scripts.push(src);
      }
    }
  }
  return scripts;
}

// ═══════════════════════════════════════════════════════════════════
//  SMART MAIN CONTENT EXTRACTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract the unique "main" body content of a page, stripping shared chrome
 * (header, nav, footer, scripts) so only page-specific content remains.
 *
 * Tries 7 strategies in order of specificity:
 *   1. <main> tag
 *   2. role="main" on any element
 *   3. Common IDs: #main, #content, #main-content, etc.
 *   4. Common classes: .main-content, .page-content, etc.
 *   5. <article> tag
 *   6. Drupal-style region-content div
 *   7. Full <body> minus <header>, <nav>, <footer>, inline <script>
 */
/**
 * Extract a balanced outer HTML block for a tag starting at startIndex.
 * Returns the full outer HTML (opening tag + content + closing tag), or null
 * if no balanced closing tag is found (malformed/truncated HTML).
 */
function extractBalancedOuter(html, startIndex, tag) {
  const openTagEnd = html.indexOf('>', startIndex);
  if (openTagEnd === -1) return null;
  if (html[openTagEnd - 1] === '/') return html.slice(startIndex, openTagEnd + 1); // self-closing

  const openRe  = new RegExp(`<${tag}\\b`, 'gi');
  const closeRe = new RegExp(`<\\/${tag}>`, 'gi');
  let depth = 1;
  let cursor = openTagEnd + 1;

  while (depth > 0 && cursor < html.length) {
    openRe.lastIndex  = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen  = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;  // unbalanced — abort, do not return truncated content
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

/**
 * Like extractBalancedOuter but returns only the INNER content.
 */
function extractBalancedInner(html, startIndex, tag) {
  const outer = extractBalancedOuter(html, startIndex, tag);
  if (!outer) return null;
  const innerStart = outer.indexOf('>') + 1;
  const innerEnd   = outer.lastIndexOf(`</${tag}>`);
  return outer.slice(innerStart, innerEnd).trim();
}

function smartExtractMainContent(html) {
  // Strategy 1: semantic <main> tag — use balanced extraction to handle nested <main> elements
  const mainIdx = html.search(/<main\b/i);
  if (mainIdx !== -1) {
    const inner = extractBalancedInner(html, mainIdx, 'main');
    if (inner) return inner;
  }

  // Strategy 2: role="main" — use balanced extraction
  const roleMains = ['div', 'section', 'article'];
  for (const tag of roleMains) {
    const re = new RegExp(`<${tag}\\b[^>]+role=["']main["'][^>]*>`, 'i');
    const m  = re.exec(html);
    if (m) {
      const inner = extractBalancedInner(html, m.index, tag);
      if (inner) return inner;
    }
  }

  // Strategy 3: common ID selectors — use balanced extraction
  const commonIds = ['main-content', 'main', 'content', 'page-content', 'site-content', 'primary', 'wrapper', 'container'];
  for (const id of commonIds) {
    for (const tag of ['div', 'section', 'article']) {
      const re = new RegExp(`<${tag}\\b[^>]+id=["']${id}["'][^>]*>`, 'i');
      const m  = re.exec(html);
      if (m) {
        const inner = extractBalancedInner(html, m.index, tag);
        if (inner) return inner;
      }
    }
  }

  // Strategy 4: common class selectors — use balanced extraction
  const commonClasses = ['main-content', 'page-content', 'content-area', 'site-content', 'entry-content', 'post-content', 'article-content', 'region-content'];
  for (const cls of commonClasses) {
    for (const tag of ['div', 'section', 'article']) {
      const re = new RegExp(`<${tag}\\b[^>]+class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>`, 'i');
      const m  = re.exec(html);
      if (m) {
        const inner = extractBalancedInner(html, m.index, tag);
        if (inner) return inner;
      }
    }
  }

  // Strategy 5: <article> tag — balanced extraction
  const articleIdx = html.search(/<article\b/i);
  if (articleIdx !== -1) {
    const inner = extractBalancedInner(html, articleIdx, 'article');
    if (inner) return inner;
  }

  // Strategy 6: Drupal / CMS region-content fallback — balanced extraction
  const rcRe = /<div\b[^>]+class="[^"]*\bregion-content\b[^"]*"[^>]*>/i;
  const rcM  = rcRe.exec(html);
  if (rcM) {
    const inner = extractBalancedInner(html, rcM.index, 'div');
    if (inner) return inner;
  }

  // Strategy 7: body minus shared chrome
  const bodyIdx = html.search(/<body\b/i);
  if (bodyIdx !== -1) {
    const bodyContent = extractBalancedInner(html, bodyIdx, 'body');
    if (bodyContent) {
      let body = bodyContent;
      body = body.replace(/<header[\s\S]*?<\/header>/gi, '');
      body = body.replace(/<nav[\s\S]*?<\/nav>/gi, '');
      body = body.replace(/<footer[\s\S]*?<\/footer>/gi, '');
      body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
      return body.trim();
    }
  }

  return '{{ .Content }}';
}

// ═══════════════════════════════════════════════════════════════════
//  PARTIAL PROCESSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a raw <head> block — replace static page values with Hugo template vars.
 * Handles: title, canonical, shortlink, description, keywords, og: tags, twitter: tags.
 */
function processHeadPartial(headHtml) {
  let h = headHtml;

  // <title>
  h = h.replace(
    /<title[^>]*>[\s\S]*?<\/title>/gi,
    '<title>{{ if .IsHome }}{{ .Site.Title }}{{ else }}{{ .Title }} | {{ .Site.Title }}{{ end }}</title>'
  );

  // canonical & shortlink href → .Permalink
  for (const rel of ['canonical', 'shortlink']) {
    h = h.replace(
      new RegExp(`(<link[^>]+rel=["']${rel}["'][^>]+href=)["'][^"']*["']`, 'gi'),
      `$1"{{ .Permalink }}"`
    ).replace(
      new RegExp(`(<link[^>]+href=)["'][^"']*["']([^>]+rel=["']${rel}["'])`, 'gi'),
      `$1"{{ .Permalink }}"$2`
    );
  }

  // meta description
  const descVal = `"{{ with .Description }}{{ . }}{{ else }}{{ .Site.Params.description }}{{ end }}"`;
  h = h
    .replace(/(<meta[^>]+name=["']description["'][^>]+content=)["'][^"']*["']/gi, `$1${descVal}`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+name=["']description["'])/gi, `$1${descVal}$2`);

  // meta keywords
  const kwVal = `"{{ with .Params.keywords }}{{ . }}{{ else }}{{ .Site.Params.keywords }}{{ end }}"`;
  h = h
    .replace(/(<meta[^>]+name=["']keywords["'][^>]+content=)["'][^"']*["']/gi, `$1${kwVal}`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+name=["']keywords["'])/gi, `$1${kwVal}$2`);

  // og:title
  h = h
    .replace(/(<meta[^>]+property=["']og:title["'][^>]+content=)["'][^"']*["']/gi, `$1"{{ .Title }}"`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+property=["']og:title["'])/gi, `$1"{{ .Title }}"$2`);

  // og:description
  h = h
    .replace(/(<meta[^>]+property=["']og:description["'][^>]+content=)["'][^"']*["']/gi, `$1${descVal}`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+property=["']og:description["'])/gi, `$1${descVal}$2`);

  // og:url
  h = h
    .replace(/(<meta[^>]+property=["']og:url["'][^>]+content=)["'][^"']*["']/gi, `$1"{{ .Permalink }}"`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+property=["']og:url["'])/gi, `$1"{{ .Permalink }}"$2`);

  // twitter:title
  h = h
    .replace(/(<meta[^>]+name=["']twitter:title["'][^>]+content=)["'][^"']*["']/gi, `$1"{{ .Title }}"`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+name=["']twitter:title["'])/gi, `$1"{{ .Title }}"$2`);

  // twitter:description
  h = h
    .replace(/(<meta[^>]+name=["']twitter:description["'][^>]+content=)["'][^"']*["']/gi, `$1${descVal}`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+name=["']twitter:description["'])/gi, `$1${descVal}$2`);

  // meta abstract
  const abVal = `"{{ with .Params.abstract }}{{ . }}{{ else }}{{ .Site.Params.abstract }}{{ end }}"`;
  h = h
    .replace(/(<meta[^>]+name=["']abstract["'][^>]+content=)["'][^"']*["']/gi, `$1${abVal}`)
    .replace(/(<meta[^>]+content=)["'][^"']*["']([^>]+name=["']abstract["'])/gi, `$1${abVal}$2`);

  // Remove <link> tags that load CSS known to hide <body> (security-kit, anti-clickjacking)
  // These rely on Drupal lifecycle JS that doesn't run in a static Hugo site.
  h = h.replace(/<link[^>]+id=["'][^"']*(?:seckit|no.body|clickjacking|no_body)[^"']*["'][^>]*\/?>/gi, '');

  // Remove ALL remaining local stylesheet <link> tags — they are page-specific and
  // will be re-injected dynamically from .Params.pageCSS in the template below.
  // Keep external CDN links (https?://) untouched.
  h = h.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'](?!https?:\/\/)[^"']+["'][^>]*\/?>/gi, '');
  h = h.replace(/<link\b[^>]*\bhref=["'](?!https?:\/\/)[^"']+["'][^>]*\brel=["']stylesheet["'][^>]*\/?>/gi, '');
  h = h.replace(/<link\b[^>]*\btype=["']text\/css["'][^>]*\bhref=["'](?!https?:\/\/)[^"']+["'][^>]*\/?>/gi, '');

  // Remove local head <script src="..."> tags — re-injected via .Params.pageJS.
  h = h.replace(/<script\b[^>]*\bsrc=["'](?!https?:\/\/)[^"']+["'][^>]*><\/script>/gi, '');
  h = h.replace(/<script\b[^>]*\bsrc=["'](?!https?:\/\/)[^"']+["'][^>]*>/gi, '');

  // Hugo template blocks — render per-page CSS & JS from front matter params.
  const cssBlock = `  {{- range .Params.pageCSS }}
  <link rel="stylesheet" media="all" href="{{ . }}">
  {{- end }}
  {{- range .Params.pagePrintCSS }}
  <link rel="stylesheet" media="print" href="{{ . }}">
  {{- end }}`;
  const jsBlock  = `  {{- range .Params.pageJS }}
  <script src="{{ . }}"></script>
  {{- end }}`;
  h = h.replace(/(<\/head>)/i, `${cssBlock}\n${jsBlock}\n$1`);

  return h;
}

/**
 * Fix all relative hrefs in the header partial so they work from any page depth.
 * - href="."              → href="/"         (root alias)
 * - href="page-slug"      → href="/page-slug" (relative → absolute)
 * Skips: already-absolute (/…), external (https?://…), anchors (#…), mailto:, tel:
 */
function processHeaderPartial(headerHtml, langPrefix) {
  const prefix = langPrefix ? `/${langPrefix}` : '';
  return headerHtml.replace(/href="([^"]*)"/gi, (match, val) => {
    if (!val) return match;
    if (val === '.' || val === './') return prefix ? `href="${prefix}/"` : 'href="/"';
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(val)) return match; // already correct
    return `href="${prefix}/${val}"`; // relative slug → absolute
  });
}

// ═══════════════════════════════════════════════════════════════════
//  BASEOF BUILDER
// ═══════════════════════════════════════════════════════════════════

/** Extract the skip-link anchor (accessibility) from the body */
function extractSkipLink(html) {
  const m = html.match(/<a[^>]+class="[^"]*skip-link[^"]*"[^>]*>[\s\S]*?<\/a>/i);
  return m ? m[0] : '';
}

/** Extract footer-level <script> tags (after </footer>, before </body>) */
function extractBodyScripts(html) {
  const afterFooter = html.replace(/[\s\S]*<\/footer>/i, '');
  const matches = [...afterFooter.matchAll(/<script[\s\S]*?<\/script>/gi)];
  return matches.map(m => '  ' + m[0].trim()).join('\n');
}

/**
 * Extract wrapper divs that sit between <body> and <header>.
 * These are site-level chrome containers (e.g. Drupal or Bootstrap wrappers).
 * Returns { open, close } strings for use in baseof.html.
 */
function extractBodyWrappers(html) {
  const bodyTagM   = html.match(/<body[^>]*>/i);
  const headerTagM = html.match(/<header[\s>]/i);
  if (!bodyTagM || !headerTagM) {
    return { open: '', close: '' };
  }
  const bodyEnd   = html.indexOf(bodyTagM[0]) + bodyTagM[0].length;
  const headerIdx = html.indexOf(headerTagM[0]);
  let between = html.slice(bodyEnd, headerIdx);
  // Remove skip link
  between = between.replace(/<a[^>]+skip-link[^>]*>[\s\S]*?<\/a>/i, '').trim();
  const openCount = (between.match(/<div[^>]*>/gi) || []).length;
  const close = Array.from({ length: openCount }, () => '</div>').join('\n  ');
  return { open: between, close };
}

/**
 * Build layouts/_default/baseof.html.
 *
 * The baseof is the master shell — it contains everything that
 * every page shares: <html>, lang, head partial, header partial,
 * the {{ block "main" }} slot, footer partial, and body scripts.
 *
 * Individual page layout files only need to define the "main" block.
 */
function buildBaseof(html, isMultilingual) {
  const dir     = extractAttr(html, 'html', 'dir') || 'ltr';
  const skipLink = extractSkipLink(html);
  const { open: wrapOpen, close: wrapClose } = extractBodyWrappers(html);
  const scripts  = extractBodyScripts(html);

  const skipLinkLine   = skipLink ? `\n  ${skipLink}\n` : '';
  const wrapOpenLine   = wrapOpen  ? `\n${wrapOpen}\n`  : '';
  const wrapCloseLine  = wrapClose ? `\n${wrapClose}\n` : '';
  const scriptsBlock   = scripts
    ? `{{ block "scripts" . }}\n${scripts}\n{{ end }}`
    : `{{ block "scripts" . }}{{ end }}`;

  // For multilingual sites, use language-specific partials with fallback
  let headPartial, headerPartial, footerPartial;
  if (isMultilingual) {
    headPartial = `{{ $headPartial := printf "head-%s.html" .Language.Lang }}
  {{ if templates.Exists (printf "partials/%s" $headPartial) }}
    {{ partial $headPartial . }}
  {{ else }}
    {{ partial "head.html" . }}
  {{ end }}`;
    headerPartial = `{{ $headerPartial := printf "header-%s.html" .Language.Lang }}
  {{ if templates.Exists (printf "partials/%s" $headerPartial) }}
    {{ partial $headerPartial . }}
  {{ else }}
    {{ partial "header.html" . }}
  {{ end }}`;
    footerPartial = `{{ $footerPartial := printf "footer-%s.html" .Language.Lang }}
  {{ if templates.Exists (printf "partials/%s" $footerPartial) }}
    {{ partial $footerPartial . }}
  {{ else }}
    {{ partial "footer.html" . }}
  {{ end }}`;
  } else {
    headPartial   = '{{ partial "head.html" . }}';
    headerPartial = '  {{ partial "header.html" . }}';
    footerPartial = '  {{ partial "footer.html" . }}';
  }

  return `<!DOCTYPE html>
<html lang="{{ .Site.Language.Lang | default .Site.LanguageCode }}" dir="${dir}">
${headPartial}
<body{{ with .Params.bodyClass }} class="{{ . }}"{{ end }}{{ with .Params.bodyId }} id="{{ . }}"{{ end }}>${skipLinkLine}
${wrapOpenLine}${headerPartial}

  {{ block "main" . }}{{ end }}

${footerPartial}
${wrapCloseLine}
${scriptsBlock}
</body>
</html>
`;
}

// ═══════════════════════════════════════════════════════════════════
//  CONTENT & LAYOUT FILE BUILDERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Turn an httrack slug path into a Hugo-safe type name.
 * e.g. "covid-19/faq" → "covid-19-faq"
 */
function slugToTypeName(slug) {
  return slug.replace(/\//g, '-');
}

/**
 * Build the content/_index.md front matter for a discovered page.
 *
 * Hugo resolution:
 *   type: "<typeSlug>"  →  Hugo looks in layouts/<typeSlug>/
 *   layout: "<name>"   →  Hugo looks for layouts/<typeSlug>/<name>.html
 *
 * This gives every page its own isolated layout file, matching
 * the reference site pattern exactly.
 */
function buildContentFrontMatter({ slug, title, description, abstract, bodyClass, bodyId, pageCSS, pageJS, tabMenu, carousel, banner, breadcrumb, pageLang, isMultilingual, defaultLang }) {
  let typeSlug, layoutName;
  if (isMultilingual && pageLang && pageLang !== (defaultLang || 'en')) {
    // Non-default language: type = "<lang>/<slugToTypeName(slug)>"
    // This maps to layouts/<lang>/<typeSlug>/ directory, mirroring the content structure
    typeSlug = `${pageLang}/${slugToTypeName(slug)}`;
    layoutName = slug.split('/').pop() || slug;
  } else {
    typeSlug   = slugToTypeName(slug);
    layoutName = slug.split('/').pop();
  }
  // YAML single-quoted scalars: only ' needs escaping, as '' (doubled).
  const yml = (s) => (s || '').replace(/'/g, "''");

  let fm = `---\n`;
  fm += `title: '${yml(title || slug)}'\n`;
  fm += `draft: false\n`;
  if (description) fm += `description: '${yml(description)}'\n`;
  if (abstract)    fm += `abstract: '${yml(abstract)}'\n`;
  fm += `type: '${typeSlug}'\n`;
  fm += `layout: '${layoutName}'\n`;
  if (bodyClass) fm += `bodyClass: '${yml(bodyClass)}'\n`;
  if (bodyId)    fm += `bodyId: '${yml(bodyId)}'\n`;
  if (pageCSS && pageCSS.length) {
    fm += `pageCSS:\n`;
    for (const css of pageCSS) fm += `  - '${yml(css)}'\n`;
  }
  if (pagePrintCSS && pagePrintCSS.length) {
    fm += `pagePrintCSS:\n`;
    for (const css of pagePrintCSS) fm += `  - '${yml(css)}'\n`;
  }
  if (pageJS && pageJS.length) {
    fm += `pageJS:\n`;
    for (const js of pageJS) fm += `  - '${yml(js)}'\n`;
  }

  // TAB MENU DATA
  if (tabMenu && tabMenu.items && tabMenu.items.length > 0) {
    fm += `tabMenu:\n  items:\n`;
    for (const item of tabMenu.items) {
      fm += `    - text: '${yml(item.text)}'\n      url: '${yml(item.url)}'\n`;
    }
  }

  // CAROUSEL DATA
  if (carousel && carousel.items && carousel.items.length > 0) {
    fm += `carousel:\n  items:\n`;
    for (const item of carousel.items) {
      fm += `    - title: '${yml(item.title)}'\n`;
      fm += `      description: '${yml(item.description)}'\n`;
      fm += `      linkText: '${yml(item.linkText)}'\n`;
      fm += `      linkUrl: '${yml(item.linkUrl)}'\n`;
      fm += `      pcImage: '${yml(item.pcImage)}'\n`;
      fm += `      mbImage: '${yml(item.mbImage)}'\n`;
      fm += `      pcImageAlt: '${yml(item.pcImageAlt)}'\n`;
      fm += `      mbImageAlt: '${yml(item.mbImageAlt)}'\n`;
    }
  }

  // BANNER DATA
  if (banner && (banner.pcImage || banner.mbImage)) {
    fm += `banner:\n`;
    if (banner.pcImage)    fm += `  pcImage: '${yml(banner.pcImage)}'\n`;
    if (banner.mbImage)    fm += `  mbImage: '${yml(banner.mbImage)}'\n`;
    if (banner.pcImageAlt) fm += `  pcImageAlt: '${yml(banner.pcImageAlt)}'\n`;
    if (banner.mbImageAlt) fm += `  mbImageAlt: '${yml(banner.mbImageAlt)}'\n`;
  }

  // BREADCRUMB DATA
  if (breadcrumb && breadcrumb.items && breadcrumb.items.length > 0) {
    fm += `breadcrumb:\n  items:\n`;
    for (const item of breadcrumb.items) {
      fm += `    - text: '${yml(item.text)}'\n`;
      fm += `      url: '${yml(item.url)}'\n`;
      if (item.active) fm += `      active: true\n`;
    }
  }

  fm += `---\n`;
  return fm;
}



/**
 * Build a page-specific layout file.
 *
 * Pattern:  layouts/<typeSlug>/<layoutName>.html
 *
 * The file only defines the "main" block — baseof.html provides
 * the full HTML shell, head, header, and footer via partials.
 *
 * The extracted main content (raw HTML from the original httrack page)
 * is embedded directly — no markdown processing, exact fidelity.
 */
function buildPageLayout(mainContent) {
  return `{{ define "main" }}\n${mainContent}\n{{ end }}\n`;
}

/**
 * Build hugo.toml from extracted metadata.
 */
function buildHugoToml({ canonicalUrl, lang, title, description, keywords, abstract, siteName, detectedLanguages }) {
  const siteTitle = title || siteName;
  // TOML basic strings (double-quoted): escape backslash and double-quote only.
  const tomlEsc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  let toml = `baseURL = "${canonicalUrl}/"\n`;
  toml += `title = "${tomlEsc(siteTitle)}"\n`;

  if (detectedLanguages && detectedLanguages.size > 1) {
    // Multilingual site configuration
    const defaultLang = lang || 'en';
    toml += `defaultContentLanguage = "${defaultLang}"\n`;
    toml += `defaultContentLanguageInSubdir = false\n`;
    toml += `\n[languages]\n`;
    for (const [langCode, langInfo] of detectedLanguages) {
      toml += `  [languages.${langCode}]\n`;
      toml += `    weight = ${langInfo.weight}\n`;
      toml += `    languageCode = "${langCode}"\n`;
      toml += `    languageName = "${tomlEsc(langInfo.name)}"\n`;
      toml += `    contentDir = "content/${langCode}"\n`;
    }
  } else {
    toml += `languageCode = "${lang}"\n`;
  }

  toml += `\n[params]\n`;
  if (description) toml += `  description = "${tomlEsc(description)}"\n`;
  if (keywords)    toml += `  keywords    = "${tomlEsc(keywords)}"\n`;
  if (abstract)    toml += `  abstract    = "${tomlEsc(abstract)}"\n`;
  return toml;
}

// ═══════════════════════════════════════════════════════════════════
//  PAGE DISCOVERY
// ═══════════════════════════════════════════════════════════════════

/**
 * Recursively discover all "pages" inside the httrack site folder.
 *
 * A "page" is any sub-directory that:
 *   - is NOT a known asset folder (css/, js/, images/, fonts/, …)
 *   - contains an index.html file
 *
 * Returns an array of:
 *   { slug, urlPath, htmlPath, depth }
 *
 * slug    = path relative to site root  e.g. "about-rsv"  or  "covid-19/faq"
 * urlPath = absolute Hugo URL          e.g. "/about-rsv/"
 * htmlPath = absolute path on disk to the source index.html
 * depth   = 1 for top-level pages, 2 for nested, etc.
 */
function discoverPages(siteSrcDir) {
  const pages = [];

  function walk(dir, relPath, depth) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ASSET_FOLDERS.has(entry.name.toLowerCase())) continue;

      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const entryAbsPath = path.join(dir, entry.name);
      const indexHtml    = path.join(entryAbsPath, 'index.html');

      if (fs.existsSync(indexHtml)) {
        pages.push({
          slug:     entryRelPath,
          urlPath:  `/${entryRelPath}/`,
          htmlPath: indexHtml,
          depth,
        });
      }

      // Recurse into sub-directories for nested pages
      walk(entryAbsPath, entryRelPath, depth + 1);
    }
  }

  walk(siteSrcDir, '', 1);
  return pages;
}

// ═══════════════════════════════════════════════════════════════════
//  SHARED PARTIAL DETECTOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect whether a given tag (header/footer/nav) is shared across pages.
 *
 * Reads up to `sampleSize` page HTML files and extracts the named tag.
 * If the same tag block appears in ≥ 80% of pages → it's shared → make it a partial.
 *
 * Returns the canonical partial HTML string, or null if too varied.
 */
function detectSharedPartial(tagName, sampleHtmls) {
  if (!sampleHtmls.length) return null;
  const extracted = sampleHtmls
    .map(html => extractTag(html, tagName))
    .filter(Boolean);

  if (!extracted.length) return null;

  // Use the homepage's version as the canonical
  const canonical = extracted[0];

  const matchCount = extracted.filter(b => {
    // Compare normalised (collapse whitespace, strip inline styles)
    const norm = s => s.replace(/\s+/g, ' ').replace(/style="[^"]*"/gi, '').trim();
    return norm(b) === norm(canonical);
  }).length;

  const sharedRatio = matchCount / extracted.length;
  // Accept if ≥ 60% match (some pages may have minor active-state differences)
  return sharedRatio >= 0.6 ? canonical : canonical;
  // Always return the homepage version — it is the correct "source of truth"
  // for shared chrome even if individual pages tweak active nav classes.
}

// ═══════════════════════════════════════════════════════════════════
//  HOMEPAGE SUB-PATH DETECTION
// ═══════════════════════════════════════════════════════════════════

function homepagePath(canonicalUrl, domain) {
  if (!canonicalUrl) return null;
  try {
    const u = new URL(canonicalUrl);
    const pathname = u.pathname.replace(/^\/|\/$/, '');
    if (!pathname || u.hostname !== domain) return null;
    return pathname;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MULTILINGUAL DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Get human-readable name for a language code.
 */
function getLanguageName(code) {
  const names = {
    en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español',
    it: 'Italiano', pt: 'Português', nl: 'Nederlands', ja: '日本語',
    zh: '中文', ko: '한국어', ar: 'العربية', ru: 'Русский',
    pl: 'Polski', sv: 'Svenska', da: 'Dansk', fi: 'Suomi',
    no: 'Norsk', cs: 'Čeština', hu: 'Magyar', ro: 'Română',
    el: 'Ελληνικά', tr: 'Türkçe', th: 'ไทย', vi: 'Tiếng Việt',
  };
  return names[code] || code.toUpperCase();
}

/**
 * Detect languages from sitemap.xml hreflang tags or directory structure.
 * Returns a Map<langCode, { weight, name }> with ≥ 2 entries,
 * or null if only one language is found (monolingual site).
 */
function detectLanguages(siteSrcDir) {
  const languages = new Map();

  // 1. Parse sitemap.xml for xhtml:link hreflang tags
  const sitemapPath = path.join(siteSrcDir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    try {
      const xml = fs.readFileSync(sitemapPath, 'utf8');
      const re = /hreflang=["']([a-zA-Z]{2,3})(?:-[a-zA-Z]+)*["']/gi;
      let m;
      while ((m = re.exec(xml)) !== null) {
        const code = m[1].toLowerCase();
        if (!languages.has(code)) {
          languages.set(code, { weight: languages.size + 1, name: getLanguageName(code) });
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Fallback — look for language directories that contain index.html
  //    and whose <html lang> matches the directory name.
  if (languages.size <= 1) {
    const candidates = ['fr','de','es','it','pt','nl','ja','zh','ko','ar','ru','pl','sv','da','fi','no','cs','hu','ro','el','tr','th','vi'];
    for (const lang of candidates) {
      const idx = path.join(siteSrcDir, lang, 'index.html');
      if (!fs.existsSync(idx)) continue;
      try {
        const html = fs.readFileSync(idx, 'utf8');
        const lm = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
        if (lm && lm[1].toLowerCase().startsWith(lang)) {
          if (!languages.has('en')) languages.set('en', { weight: 1, name: 'English' });
          if (!languages.has(lang)) languages.set(lang, { weight: languages.size + 1, name: getLanguageName(lang) });
        }
      } catch { /* ignore */ }
    }
  }

  return languages.size > 1 ? languages : null;
}

/**
 * Determine the language of a page from its slug.
 * Returns { lang, cleanSlug } where cleanSlug has the lang prefix removed.
 */
function getPageLanguage(slug, detectedLanguages, defaultLang) {
  if (!detectedLanguages) return { lang: defaultLang, cleanSlug: slug };
  const first = slug.split('/')[0];
  if (first !== defaultLang && detectedLanguages.has(first)) {
    return { lang: first, cleanSlug: slug.slice(first.length + 1) };
  }
  return { lang: defaultLang, cleanSlug: slug };
}

// ═══════════════════════════════════════════════════════════════════
//  CONVERT ROUTE
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/hugo/convert
 * Body: { domain: "www.knowpneumonia.sg" }
 *
 * Converts a full httrack-extracted site into a proper Hugo site:
 *
 *  Step 1  — hugo new site scaffold + git init
 *  Step 2  — Extract metadata from index.html → hugo.toml
 *  Step 3  — Copy static assets (css/ js/ images/ fonts/ files/)
 *  Step 4  — Build shared partials (head, header, footer)
 *  Step 5  — Build layouts/_default/baseof.html  (master HTML shell)
 *  Step 6  — Build layouts/_default/single.html + list.html  (fallbacks)
 *  Step 7  — Discover ALL pages in the site folder
 *  Step 8  — Homepage: content/_index.md + layouts/index.html
 *  Step 9  — Inner pages: for each discovered page →
 *              content/<slug>/_index.md  (Hugo front matter)
 *              layouts/<typeSlug>/<layoutName>.html  (page-specific layout)
 *  Step 10 — Build archetypes/default.md
 */
router.post('/convert', (req, res) => {
  const logs = [];

  try {
    const domain = parseDomain(req.body.domain);
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid domain name' });
    }

    const siteSrcDir = path.join(SITES_BASE_DIR, domain);
    if (!fs.existsSync(siteSrcDir)) {
      return res.status(404).json({ success: false, error: `Source site folder not found: sites/${domain}` });
    }

    if (!fs.existsSync(HUGO_SITES_DIR)) {
      fs.mkdirSync(HUGO_SITES_DIR, { recursive: true });
    }

    const hugoSiteDir = path.join(HUGO_SITES_DIR, domain);

    // ── Step 1: Hugo scaffold + git ───────────────────────────────
    if (fs.existsSync(hugoSiteDir)) {
      logs.push(`Hugo site already exists at Hugo-Sites/${domain} — refreshing content & layouts`);
    } else {
      const cmd = `"${HUGO_BIN}" new site "${domain}" --format toml`;
      const out  = execSync(cmd, { cwd: HUGO_SITES_DIR, encoding: 'utf8' });
      logs.push(out.trim());
      logs.push(`✓ Hugo site scaffolded at Hugo-Sites/${domain}`);
    }

    const gitDir = path.join(hugoSiteDir, '.git');
    if (!fs.existsSync(gitDir)) {
      const out = execSync('git init', { cwd: hugoSiteDir, encoding: 'utf8' });
      logs.push(out.trim());
      logs.push(`✓ Git initialised`);
    }

    // ── Step 2: Read homepage + extract metadata ──────────────────
    const indexHtmlPath = path.join(siteSrcDir, 'index.html');
    let srcHtml = '';
    let meta    = { canonicalUrl: `https://${domain}`, lang: 'en', title: domain, description: '', keywords: '' };

    if (fs.existsSync(indexHtmlPath)) {
      srcHtml = fs.readFileSync(indexHtmlPath, 'utf8');
      meta    = extractMetadata(srcHtml, domain);
      logs.push(`✓ Metadata extracted from sites/${domain}/index.html`);
      logs.push(`  baseURL      : ${meta.canonicalUrl}`);
      logs.push(`  languageCode : ${meta.lang}`);
      logs.push(`  title        : ${meta.title || '(none)'}`);
      if (meta.description) logs.push(`  description  : ${meta.description.slice(0, 80)}${meta.description.length > 80 ? '…' : ''}`);
    } else {
      logs.push(`⚠ No index.html in sites/${domain}/ — using defaults`);
    }

    // ── Step 2b: Detect multilingual site ────────────────────────
    const detectedLanguages = detectLanguages(siteSrcDir);
    const isMultilingual = !!detectedLanguages;
    const defaultLang = meta.lang || 'en';

    if (isMultilingual) {
      logs.push(`\n✓ Multilingual site detected`);
      for (const [lang, info] of detectedLanguages) {
        logs.push(`  ${lang}: ${info.name} (weight ${info.weight})`);
      }
    } else {
      logs.push(`\nMonolingual site (${meta.lang})`);
    }

    // Write hugo.toml
    const hugoTomlPath = path.join(hugoSiteDir, 'hugo.toml');
    fs.writeFileSync(hugoTomlPath, buildHugoToml({ ...meta, siteName: domain, detectedLanguages }), 'utf8');
    logs.push(`✓ hugo.toml written`);

    // ── Step 3: Copy static asset folders ────────────────────────
    logs.push(`\nCopying static assets…`);
    const staticDir = path.join(hugoSiteDir, 'static');
    fs.mkdirSync(staticDir, { recursive: true });

    const copiedFolders  = [];
    const skippedFolders = [];

    for (const folder of ['css', 'js', 'files', 'fonts', 'images']) {
      const srcFolder  = path.join(siteSrcDir, folder);
      const destFolder = path.join(staticDir, folder);
      if (!fs.existsSync(srcFolder)) {
        skippedFolders.push(folder);
        continue;
      }
      try {
        fs.cpSync(srcFolder, destFolder, { recursive: true, force: true });
        const count = countFiles(destFolder);
        copiedFolders.push(folder);
        logs.push(`  ✓ ${folder}/  (${count} file${count !== 1 ? 's' : ''})`);
      } catch (e) {
        logs.push(`  ✗ ${folder}/  failed: ${e.message}`);
      }
    }
    if (skippedFolders.length) logs.push(`  ⚠ Not found (skipped): ${skippedFolders.join(', ')}`);

    // ── Step 3b: Override any body-hiding CSS files ───────────────
    const cssSrcDir  = path.join(staticDir, 'css');
    const BODY_HIDE_PATTERN = /seckit|no.?body|clickjack/i;
    const overrideCSS = '/* overridden by Hugo conversion — body is always visible */\nbody { display: block !important; }\n';
    if (fs.existsSync(cssSrcDir)) {
      for (const file of fs.readdirSync(cssSrcDir)) {
        if (BODY_HIDE_PATTERN.test(file) && file.endsWith('.css')) {
          const filePath = path.join(cssSrcDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (/display\s*:\s*none/i.test(content)) {
              fs.writeFileSync(filePath, overrideCSS, 'utf8');
              logs.push(`  ✓ Overrode body-hiding CSS: static/css/${file}`);
            }
          } catch { /* ignore */ }
        }
      }
    }

    // ── Step 3c: Copy flat (non-index) HTML files verbatim to static/ ──
    // Files like 404.html, errors/404.html etc. end up in public/ unchanged.
    // Only skip true system folders (.git, node_modules, __macosx).
    // Asset folders (css, js, images…) AND the errors/ folder are scanned
    // because they may contain flat HTML pages (e.g. errors/404.html).
    const SKIP_IN_FLAT_SCAN = new Set(['.git', 'node_modules', '__macosx', 'thumbs', 'unprocessed']);
    const flatHtmlCopied = [];
    (function copyFlatHtmlToStatic(dir, relBase) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const absPath = path.join(dir, entry.name);
        const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (!SKIP_IN_FLAT_SCAN.has(entry.name.toLowerCase()))
            copyFlatHtmlToStatic(absPath, relPath);
          continue;
        }
        // Only flat .html files — skip index.html (those become Hugo pages)
        if (!entry.name.endsWith('.html') || entry.name === 'index.html') continue;
        const destPath = path.join(staticDir, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        try { fs.copyFileSync(absPath, destPath); flatHtmlCopied.push(relPath); } catch { /* ignore */ }
      }
    })(siteSrcDir, '');
    if (flatHtmlCopied.length) {
      logs.push(`  ✓ ${flatHtmlCopied.length} flat HTML file(s) copied verbatim to static/ → public/`);
      for (const f of flatHtmlCopied) logs.push(`    - ${f}`);
    }

    // ── Step 4: Discover all pages ────────────────────────────────
    logs.push(`\nDiscovering pages in sites/${domain}/…`);
    const pages = discoverPages(siteSrcDir);
    logs.push(`  Found ${pages.length} page${pages.length !== 1 ? 's' : ''}`);

    // Build a sample of page HTMLs for shared partial detection (homepage + up to 4 inner pages)
    const sampleHtmls = [srcHtml];
    for (const page of pages.slice(0, 4)) {
      try { sampleHtmls.push(fs.readFileSync(page.htmlPath, 'utf8')); } catch { /* ignore */ }
    }

    // ── Step 5: Build shared partials ────────────────────────────
    logs.push(`\nBuilding partials…`);
    const layoutsDir  = path.join(hugoSiteDir, 'layouts');
    const partialsDir = path.join(layoutsDir, 'partials');
    const defaultDir  = path.join(layoutsDir, '_default');
    for (const d of [layoutsDir, partialsDir, defaultDir]) {
      fs.mkdirSync(d, { recursive: true });
    }

    // head.html — always from homepage
    const rawHead = extractTag(srcHtml, 'head') || '<head></head>';
    fs.writeFileSync(path.join(partialsDir, 'head.html'), processHeadPartial(rawHead) + '\n', 'utf8');
    logs.push(`  ✓ layouts/partials/head.html`);

    // header.html — detect shared version across pages
    const rawHeader = detectSharedPartial('header', sampleHtmls) || '<header></header>';
    fs.writeFileSync(path.join(partialsDir, 'header.html'), processHeaderPartial(rawHeader) + '\n', 'utf8');
    logs.push(`  ✓ layouts/partials/header.html`);

    // footer.html — detect shared version across pages
    const rawFooter = detectSharedPartial('footer', sampleHtmls) || '<footer></footer>';
    fs.writeFileSync(path.join(partialsDir, 'footer.html'), rawFooter + '\n', 'utf8');
    logs.push(`  ✓ layouts/partials/footer.html`);

    // ── Step 5b: Build language-specific partials for multilingual sites ──
    if (isMultilingual) {
      logs.push(`\nBuilding language-specific partials…`);
      for (const [lang] of detectedLanguages) {
        if (lang === defaultLang) continue;

        const langHomePath = path.join(siteSrcDir, lang, 'index.html');
        if (!fs.existsSync(langHomePath)) {
          logs.push(`  ⚠ No homepage for ${lang} — skipping language-specific partials`);
          continue;
        }

        const langHtml = fs.readFileSync(langHomePath, 'utf8');

        // Build sample HTMLs for this language (homepage + up to 4 inner pages)
        const langSampleHtmls = [langHtml];
        const langPages = pages.filter(p => p.slug.startsWith(lang + '/'));
        for (const page of langPages.slice(0, 4)) {
          try { langSampleHtmls.push(fs.readFileSync(page.htmlPath, 'utf8')); } catch { /* ignore */ }
        }

        // head-{lang}.html
        const langHead = extractTag(langHtml, 'head') || '<head></head>';
        fs.writeFileSync(path.join(partialsDir, `head-${lang}.html`), processHeadPartial(langHead) + '\n', 'utf8');
        logs.push(`  ✓ layouts/partials/head-${lang}.html`);

        // header-{lang}.html
        const langHeader = detectSharedPartial('header', langSampleHtmls) || '<header></header>';
        fs.writeFileSync(path.join(partialsDir, `header-${lang}.html`), processHeaderPartial(langHeader, lang) + '\n', 'utf8');
        logs.push(`  ✓ layouts/partials/header-${lang}.html`);

        // footer-{lang}.html
        const langFooter = detectSharedPartial('footer', langSampleHtmls) || '<footer></footer>';
        fs.writeFileSync(path.join(partialsDir, `footer-${lang}.html`), langFooter + '\n', 'utf8');
        logs.push(`  ✓ layouts/partials/footer-${lang}.html`);
      }
    }

    // ── Step 6: _default layouts ──────────────────────────────────
    logs.push(`\nBuilding _default layouts…`);

    fs.writeFileSync(path.join(defaultDir, 'baseof.html'), buildBaseof(srcHtml, isMultilingual), 'utf8');
    logs.push(`  ✓ layouts/_default/baseof.html  (HTML shell with partials)`);

    fs.writeFileSync(path.join(defaultDir, 'single.html'),
      `{{ define "main" }}\n{{ .Content }}\n{{ end }}\n`, 'utf8');
    logs.push(`  ✓ layouts/_default/single.html  (fallback: renders .Content)`);

    fs.writeFileSync(path.join(defaultDir, 'list.html'),
      `{{ define "main" }}\n{{ .Content }}\n{{ end }}\n`, 'utf8');
    logs.push(`  ✓ layouts/_default/list.html    (fallback: renders .Content)`);

    // ── Step 7: Content root directory ───────────────────────────
    const contentDir = path.join(hugoSiteDir, 'content');
    fs.mkdirSync(contentDir, { recursive: true });

    // For multilingual, create per-language content directories
    if (isMultilingual) {
      for (const [lang] of detectedLanguages) {
        fs.mkdirSync(path.join(contentDir, lang), { recursive: true });
      }
    }

       // ── Step 8: Homepage ──────────────────────────────────────────
    logs.push(`\nBuilding homepage…`);

    const { bodyClass: homeBodyClass, bodyId: homeBodyId } = extractBodyAttributes(srcHtml);
    const { screen: homePageCSS, print: homePagePrintCSS } = extractPageCSS(srcHtml);
    const homePageJS  = extractPageHeadJS(srcHtml);
    const homePageTitle = (meta.pageTitle || meta.title || domain);
    // YAML single-quoted scalars: escape ' as ''
    const yml = (s) => (s || '').replace(/'/g, "''");
    let homeFm = `---\ntitle: '${yml(homePageTitle)}'\ndraft: false\n`;
    if (meta.description)  homeFm += `description: '${yml(meta.description)}'\n`;
    if (homeBodyClass)     homeFm += `bodyClass: '${yml(homeBodyClass)}'\n`;
    if (homeBodyId)        homeFm += `bodyId: '${yml(homeBodyId)}'\n`;
    if (homePageCSS.length) {
      homeFm += `pageCSS:\n`;
      for (const css of homePageCSS) homeFm += `  - '${yml(css)}'\n`;
    }
    if (homePagePrintCSS && homePagePrintCSS.length) {
      homeFm += `pagePrintCSS:\n`;
      for (const css of homePagePrintCSS) homeFm += `  - '${yml(css)}'\n`;
    }
    if (homePageJS.length) {
      homeFm += `pageJS:\n`;
      for (const js of homePageJS) homeFm += `  - '${yml(js)}'\n`;
    }
    homeFm += `---\n`;

    const homeMainContent  = smartExtractMainContent(srcHtml);
    const subPath          = homepagePath(meta.canonicalUrl, domain);

    if (isMultilingual) {
      // ─── Multilingual homepage handling ───
      // Default language homepage → content/<defaultLang>/_index.md
      const defaultContentDir = path.join(contentDir, defaultLang);
      fs.mkdirSync(defaultContentDir, { recursive: true });
      fs.writeFileSync(path.join(defaultContentDir, '_index.md'), homeFm, 'utf8');
      logs.push(`  ✓ content/${defaultLang}/_index.md`);

      // Default language homepage layout
      if (!subPath) {
        fs.writeFileSync(path.join(layoutsDir, 'index.html'), buildPageLayout(homeMainContent), 'utf8');
        logs.push(`  ✓ layouts/index.html  (${defaultLang} homepage at /)`);
      } else {
        const subDir = path.join(layoutsDir, subPath);
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'index.html'), buildPageLayout(homeMainContent), 'utf8');
        logs.push(`  ✓ layouts/${subPath}/index.html  (${defaultLang} homepage at /${subPath}/)`);
      }

      // Other language homepages
      for (const [lang] of detectedLanguages) {
        if (lang === defaultLang) continue;

        const langHomeIndexPath = path.join(siteSrcDir, lang, 'index.html');
        if (!fs.existsSync(langHomeIndexPath)) {
          logs.push(`  ⚠ No homepage found for language: ${lang}`);
          continue;
        }

        const langHtml = fs.readFileSync(langHomeIndexPath, 'utf8');
        const langMeta = extractMetadata(langHtml, domain);
        const { bodyClass: langBodyClass, bodyId: langBodyId } = extractBodyAttributes(langHtml);
        const langCSS = extractPageCSS(langHtml);
        const langJS  = extractPageHeadJS(langHtml);
        const langPageTitle = langMeta.pageTitle || langMeta.title || domain;

        let langFm = `---\ntitle: '${yml(langPageTitle)}'\ndraft: false\n`;
        if (langMeta.description) langFm += `description: '${yml(langMeta.description)}'\n`;
        if (langBodyClass)        langFm += `bodyClass: '${yml(langBodyClass)}'\n`;
        if (langBodyId)           langFm += `bodyId: '${yml(langBodyId)}'\n`;
        if (langCSS.length) {
          langFm += `pageCSS:\n`;
          for (const css of langCSS) langFm += `  - '${yml(css)}'\n`;
        }
        if (langJS.length) {
          langFm += `pageJS:\n`;
          for (const js of langJS) langFm += `  - '${yml(js)}'\n`;
        }
        langFm += `---\n`;

        const langContentDir = path.join(contentDir, lang);
        fs.mkdirSync(langContentDir, { recursive: true });
        fs.writeFileSync(path.join(langContentDir, '_index.md'), langFm, 'utf8');
        logs.push(`  ✓ content/${lang}/_index.md`);

        const langMainContent = smartExtractMainContent(langHtml);
        fs.writeFileSync(path.join(layoutsDir, `index.${lang}.html`), buildPageLayout(langMainContent), 'utf8');
        logs.push(`  ✓ layouts/index.${lang}.html  (${lang} homepage at /${lang}/)`);
      }
    } else {
      // ─── Monolingual homepage handling (original logic) ───
      fs.writeFileSync(path.join(contentDir, '_index.md'), homeFm, 'utf8');
      logs.push(`  ✓ content/_index.md`);

      if (!subPath) {
        fs.writeFileSync(path.join(layoutsDir, 'index.html'), buildPageLayout(homeMainContent), 'utf8');
        logs.push(`  ✓ layouts/index.html  (homepage at /)`);
      } else {
        const subDir = path.join(layoutsDir, subPath);
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'index.html'), buildPageLayout(homeMainContent), 'utf8');
        logs.push(`  ✓ layouts/${subPath}/index.html  (homepage at /${subPath}/)`);
      }
    }

    // ── Step 9: Inner pages ───────────────────────────────────────
    logs.push(`\nBuilding inner pages…`);
    const convertedPages = [];

    for (const page of pages) {
      const { slug, htmlPath } = page;

      // For multilingual, detect page language and get clean slug
      let pageLang = defaultLang;
      let cleanSlug = slug;

      if (isMultilingual) {
        const langInfo = getPageLanguage(slug, detectedLanguages, defaultLang);
        pageLang = langInfo.lang;
        cleanSlug = langInfo.cleanSlug;

        // Skip language homepages (they were handled in Step 8)
        if (cleanSlug === '') continue;
      }

      let pageHtml = '';
      try { pageHtml = fs.readFileSync(htmlPath, 'utf8'); }
      catch (e) {
        logs.push(`  ✗ [${slug}] cannot read HTML: ${e.message}`);
        continue;
      }

      const pageMeta    = extractMetadata(pageHtml, domain);
      const mainContent = smartExtractMainContent(pageHtml);
      const { bodyClass: pageBodyClass, bodyId: pageBodyId } = extractBodyAttributes(pageHtml);
      const { screen: pageCSS, print: pagePrintCSS } = extractPageCSS(pageHtml);
      const pageJS      = extractPageHeadJS(pageHtml);

      // Compute type and layout names based on multilingual context
      let typeSlug, layoutName;
      if (isMultilingual && pageLang !== defaultLang) {
        // Non-default language: type = "<lang>/<cleanTypeSlug>"
        // Layout goes in layouts/<lang>/<cleanTypeSlug>/
        const cleanTypeSlug = slugToTypeName(cleanSlug);
        typeSlug = `${pageLang}/${cleanTypeSlug}`;
        layoutName = cleanSlug.split('/').pop() || cleanSlug;
      } else if (isMultilingual) {
        // Default language in a multilingual site
        typeSlug = slugToTypeName(cleanSlug);
        layoutName = cleanSlug.split('/').pop();
      } else {
        // Monolingual site (original logic)
        typeSlug = slugToTypeName(slug);
        layoutName = slug.split('/').pop();
      }

      // Content directory: for multilingual, content goes under content/<lang>/
      const contentSlugParts = isMultilingual
        ? [pageLang, ...cleanSlug.split('/')]
        : slug.split('/');
      const contentSlugDir = path.join(contentDir, ...contentSlugParts);
      fs.mkdirSync(contentSlugDir, { recursive: true });
      const contentFile = path.join(contentSlugDir, '_index.md');

      // Use cleanSlug for front matter in multilingual mode
      const fmSlug = isMultilingual ? cleanSlug : slug;
      fs.writeFileSync(
        contentFile,
        buildContentFrontMatter({
          slug:        fmSlug,
          title:       pageMeta.pageTitle || pageMeta.title,
          description: pageMeta.description,
          abstract:    pageMeta.abstract,
          bodyClass:   pageBodyClass,
          bodyId:      pageBodyId,
          pageCSS,
          pagePrintCSS,
          pageJS,
          pageLang,
          isMultilingual,
          defaultLang,
        }),
        'utf8'
      );

      // Layout directory: mirrors content structure
      const layoutTypeDir = path.join(layoutsDir, ...typeSlug.split('/'));
      fs.mkdirSync(layoutTypeDir, { recursive: true });
      const layoutFile = path.join(layoutTypeDir, `${layoutName}.html`);
      fs.writeFileSync(layoutFile, buildPageLayout(mainContent), 'utf8');

      const relContentParts = isMultilingual
        ? `content/${pageLang}/${cleanSlug}/_index.md`
        : `content/${slug}/_index.md`;
      const relLayout  = `layouts/${typeSlug}/${layoutName}.html`;

      logs.push(`  ✓ [${slug}]  (lang: ${pageLang})`);
      logs.push(`       content : ${relContentParts}`);
      logs.push(`       layout  : ${relLayout}`);
      logs.push(`       title   : ${pageMeta.pageTitle || pageMeta.title || '(none)'}`);

      convertedPages.push({
        slug,
        title:       pageMeta.pageTitle || pageMeta.title || slug,
        description: pageMeta.description || '',
        contentFile: relContentParts,
        layoutFile:  relLayout,
        typeSlug,
        layoutName,
      });
    }

    // ── Step 10: archetypes/default.md ───────────────────────────
    const archetypesDir = path.join(hugoSiteDir, 'archetypes');
    fs.mkdirSync(archetypesDir, { recursive: true });
    const archetypeDefault = `---\ntitle: '{{ replace .File.ContentBaseName "-" " " | title }}'\ndraft: false\n---\n`;
    fs.writeFileSync(path.join(archetypesDir, 'default.md'), archetypeDefault, 'utf8');
    logs.push(`\n✓ archetypes/default.md`);

    // ── Step 11: Dynamic partials — AFTER all layout files exist ─
    // Analyses source HTML, creates partial files, then wires them
    // into the layout files that were just built in Steps 8–9.
    // Works for ANY Drupal site — no hard-coded class assumptions.
    logs.push(`\nDiscovering & wiring dynamic partials…`);
    let dynamicPartials = { nodePartials: [], structuralPartials: [], drupalComponents: null };

    try {
      if (isMultilingual) {
        // ═════════════════════════════════════════════════════════════
        //  MULTILINGUAL: Analyse and create partials PER LANGUAGE
        //  This prevents content from one language leaking into another.
        // ═════════════════════════════════════════════════════════════
        const nonDefaultLangs = [];
        for (const [lang] of detectedLanguages) {
          if (lang !== defaultLang) nonDefaultLangs.push(lang);
        }

        // ── Step 11a: Default language analysis & partials ──────────
        logs.push(`\n  Default language (${defaultLang}) dynamic partials…`);
        const defaultFilter = { excludePrefixes: nonDefaultLangs };
        const defaultLayoutFilter = { excludeLayoutPrefixes: nonDefaultLangs };

        // 1. node--type-* partials (default language only)
        const analysis = analyzeHtmlFiles(siteSrcDir, defaultFilter);
        if (Object.keys(analysis.nodeTypes).length > 0) {
          logs.push(`\n  Node types found (${defaultLang}): ${Object.keys(analysis.nodeTypes).join(', ')}`);
          dynamicPartials.nodePartials = writeNodePartials(analysis.nodeTypes, layoutsDir, logs, defaultLayoutFilter);
        } else {
          logs.push(`  No node--type-* blocks detected (${defaultLang})`);
        }

        // 2. Structural patterns (default language only)
        dynamicPartials.structuralPartials = writeStructuralPartials(
          siteSrcDir, layoutsDir, logs,
          { ...defaultFilter, ...defaultLayoutFilter }
        );
        if (dynamicPartials.structuralPartials.length === 0) {
          logs.push(`  No shared structural patterns detected (${defaultLang})`);
        }

        // 3. Drupal components (default language only → wire into default layouts + header/footer)
        const drupalComponents = extractDrupalComponents(siteSrcDir, defaultFilter);
        const componentResult = writeDrupalComponentPartials(drupalComponents, layoutsDir, logs, {
          ...defaultLayoutFilter,
          headerFooterFiles: ['header.html', 'footer.html'],
        });
        dynamicPartials.drupalComponents = componentResult;

        // ── Step 11b: Non-default language partials ─────────────────
        for (const lang of nonDefaultLangs) {
          logs.push(`\n  Language (${lang}) dynamic partials…`);
          const langFilter = { includePrefix: lang };
          const langLayoutFilter = { includeLayoutPrefix: lang };

          // 1. node--type-* partials for this language
          const langAnalysis = analyzeHtmlFiles(siteSrcDir, langFilter);
          if (Object.keys(langAnalysis.nodeTypes).length > 0) {
            logs.push(`\n  Node types found (${lang}): ${Object.keys(langAnalysis.nodeTypes).join(', ')}`);
            writeNodePartials(langAnalysis.nodeTypes, layoutsDir, logs, { langSuffix: lang, ...langLayoutFilter });
          }

          // 2. Structural patterns for this language
          writeStructuralPartials(siteSrcDir, layoutsDir, logs, {
            ...langFilter, langSuffix: lang, ...langLayoutFilter,
          });

          // 3. Drupal components for this language → wire into lang layouts + header-{lang}/footer-{lang}
          const langComponents = extractDrupalComponents(siteSrcDir, langFilter);
          writeDrupalComponentPartials(langComponents, layoutsDir, logs, {
            langSuffix: lang,
            ...langLayoutFilter,
            headerFooterFiles: [`header-${lang}.html`, `footer-${lang}.html`],
          });
        }

      } else {
        // ═════════════════════════════════════════════════════════════
        //  MONOLINGUAL: Original logic — scan everything at once
        // ═════════════════════════════════════════════════════════════

        // 1. node--type-* blocks → partials/nodes/node--type-X.html
        //    AND replaces matching blocks in all layout files
        const analysis = analyzeHtmlFiles(siteSrcDir);
        if (Object.keys(analysis.nodeTypes).length > 0) {
          logs.push(`\n  Node types found: ${Object.keys(analysis.nodeTypes).join(', ')}`);
          dynamicPartials.nodePartials = writeNodePartials(analysis.nodeTypes, layoutsDir, logs);
        } else {
          logs.push(`  No node--type-* blocks detected`);
        }

        // 2. Structural patterns (breadcrumb, tabs, carousel, accordion, menu, sidebar, banner)
        //    → partials/structures/X.html  AND replaces in layouts
        dynamicPartials.structuralPartials = writeStructuralPartials(siteSrcDir, layoutsDir, logs);
        if (dynamicPartials.structuralPartials.length === 0) {
          logs.push(`  No shared structural patterns detected`);
        }

        // 3. Drupal paragraphs, blocks, regions, components
        //    → partials/{paragraphs,blocks,regions,components}/X.html
        //    AND replaces matching HTML in all layout files
        const drupalComponents = extractDrupalComponents(siteSrcDir);
        const componentResult = writeDrupalComponentPartials(drupalComponents, layoutsDir, logs);
        dynamicPartials.drupalComponents = componentResult;
      }

    } catch (err) {
      logs.push(`  ⚠ Dynamic partial discovery warning: ${err.message}`);
      console.error('Dynamic partial error:', err);
    }

    // ── Summary ───────────────────────────────────────────────────
    const totalPartials = 3 /* head, header, footer */
      + (dynamicPartials.nodePartials?.length || 0)
      + (dynamicPartials.structuralPartials?.length || 0)
      + (dynamicPartials.drupalComponents?.paragraphs?.length || 0)
      + (dynamicPartials.drupalComponents?.blocks?.length || 0)
      + (dynamicPartials.drupalComponents?.regions?.length || 0)
      + (dynamicPartials.drupalComponents?.components?.length || 0);

    logs.push(`\n${'═'.repeat(50)}`);
    logs.push(`Hugo site ready at: Hugo-Sites/${domain}/`);
    logs.push(`  ${convertedPages.length + 1} pages  (1 homepage + ${convertedPages.length} inner)`);
    logs.push(`  ${copiedFolders.length} asset folders copied to static/`);
    logs.push(`  ${totalPartials} partials created (head, header, footer + ${totalPartials - 3} dynamic)`);
    logs.push(`${'═'.repeat(50)}`);

    return res.json({
      success:        true,
      domain,
      hugoDir:        `Hugo-Sites/${domain}`,
      baseURL:        meta.canonicalUrl,
      lang:           meta.lang,
      siteTitle:      meta.title || domain,
      description:    meta.description,
      keywords:       meta.keywords,
      isMultilingual,
      languages:      isMultilingual ? Object.fromEntries(detectedLanguages) : null,
      copiedFolders,
      skippedFolders,
      pageCount:      convertedPages.length + 1,
      pages:          convertedPages,
      partials: {
        static:     ['head.html', 'header.html', 'footer.html'],
        nodes:      dynamicPartials.nodePartials || [],
        structural: dynamicPartials.structuralPartials || [],
        paragraphs: dynamicPartials.drupalComponents?.paragraphs || [],
        blocks:     dynamicPartials.drupalComponents?.blocks || [],
        regions:    dynamicPartials.drupalComponents?.regions || [],
        components: dynamicPartials.drupalComponents?.components || [],
        fields:     dynamicPartials.drupalComponents?.fields || [],
      },
      totalPartials,
      logs,
    });

  } catch (err) {
    console.error('Hugo convert error:', err);
    logs.push(`✗ Fatal error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message, logs });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  STANDALONE ANALYZE ROUTE  —  POST /api/hugo/analyze
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/hugo/analyze
 * Body: { domain: "www.example.com" }
 *
 * Analyzes HTML files in sites/<domain>/ and returns a full report.
 * If the Hugo site already exists (convert already run), also writes
 * node--type-* partials to layouts/partials/nodes/.
 */
router.post('/analyze', (req, res) => {
  const logs = [];
  try {
    const domain = parseDomain(req.body.domain);
    if (!domain) return res.status(400).json({ success: false, error: 'Invalid domain name' });

    const siteSrcDir = path.join(SITES_BASE_DIR, domain);
    if (!fs.existsSync(siteSrcDir)) {
      return res.status(404).json({ success: false, error: `Source site not found: sites/${domain}` });
    }

    logs.push(`Analyzing HTML files in sites/${domain}/…`);
    const analysis = analyzeHtmlFiles(siteSrcDir);

    // Semantic tag summary
    logs.push(`\nSemantic tags found:`);
    if (Object.keys(analysis.semanticTagsSummary).length) {
      for (const [tag, info] of Object.entries(analysis.semanticTagsSummary)) {
        logs.push(`  <${tag}>  ×${info.totalCount}  in ${info.filesFound.length} file(s)`);
      }
    } else {
      logs.push(`  (none detected)`);
    }

    logs.push(`\n✓ Analysis complete`);

    return res.json({
      success: true,
      domain,
      semanticTagsSummary: analysis.semanticTagsSummary,
      fileReports:     analysis.fileReports,
      logs,
    });

  } catch (err) {
    console.error('Hugo analyze error:', err);
    logs.push(`✗ Fatal: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message, logs });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  LOCAL PREVIEW  —  POST /api/hugo/serve   GET /api/hugo/serve   DELETE /api/hugo/serve
// ═══════════════════════════════════════════════════════════════════

/** Module-scoped process handle so we can kill & restart it */
let hugoServerProc  = null;
let hugoServerDomain = null;
let hugoServerPort   = 1313;

/**
 * POST /api/hugo/serve
 * Body: { domain }  e.g. "www.knowpneumonia.sg"
 *
 * Kills any existing `hugo server` process, then starts a fresh one
 * pointing at  Hugo-Sites/<domain>/  on port 1313.
 * Returns { url, domain, port } once the server is ready.
 */
router.post('/serve', async (req, res) => {
  const domain = (req.body?.domain || '').trim();
  if (!domain) return res.status(400).json({ error: 'domain is required' });

  const sitePath = path.join(HUGO_SITES_DIR, domain);
  if (!fs.existsSync(sitePath)) {
    return res.status(404).json({
      error: `Hugo site not found at Hugo-Sites/${domain}`,
    });
  }

  // Kill any existing hugo server
  if (hugoServerProc) {
    try { hugoServerProc.kill('SIGTERM'); } catch { /* already dead */ }
    hugoServerProc  = null;
    hugoServerDomain = null;
  }

  // Also kill any stray hugo server on port 1313 left over from previous runs
  try {
    execSync(`lsof -ti tcp:${hugoServerPort} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch { /* no process on that port */ }

  // Give the OS a moment to release the port
  await new Promise((r) => setTimeout(r, 400));

  const serverLogs = [];
  let started  = false;
  let errored  = false;
  let startErr = '';

  hugoServerProc = spawn(
    HUGO_BIN,
    [
      'server',
      '--port',        String(hugoServerPort),
      '--bind',        '0.0.0.0',
      '--baseURL',     `http://localhost:${hugoServerPort}`,
      '--disableFastRender',
      '--navigateToChanged=false',
    ],
    {
      cwd:   sitePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  hugoServerDomain = domain;

  hugoServerProc.stdout.on('data', (d) => serverLogs.push(d.toString()));
  hugoServerProc.stderr.on('data', (d) => {
    const line = d.toString();
    serverLogs.push(line);
    if (/error/i.test(line) && !started) {
      errored  = true;
      startErr = line.trim();
    }
  });

  hugoServerProc.on('exit', (code) => {
    if (hugoServerProc) {
      hugoServerProc  = null;
      hugoServerDomain = null;
    }
  });

  // Wait up to 4 seconds for `hugo server` to print its "Web Server is available" line
  const ready = await new Promise((resolve) => {
    const deadline = Date.now() + 4000;
    const check = () => {
      if (errored) return resolve(false);
      const combined = serverLogs.join('');
      if (/Web Server is available|press Ctrl\+C/i.test(combined)) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(check, 150);
    };
    setTimeout(check, 150);
  });

  if (errored) {
    if (hugoServerProc) { try { hugoServerProc.kill(); } catch {} }
    hugoServerProc  = null;
    hugoServerDomain = null;
    return res.status(500).json({ error: startErr || 'Hugo server failed to start', logs: serverLogs });
  }

  return res.json({
    success: true,
    domain,
    port:    hugoServerPort,
    url:     `http://localhost:${hugoServerPort}`,
    ready,
  });
});

/**
 * GET /api/hugo/serve
 * Returns the current running server status.
 */
router.get('/serve', (req, res) => {
  if (hugoServerProc && hugoServerDomain) {
    return res.json({
      running: true,
      domain:  hugoServerDomain,
      url:     `http://localhost:${hugoServerPort}`,
      port:    hugoServerPort,
    });
  }
  return res.json({ running: false });
});

/**
 * DELETE /api/hugo/serve
 * Stops the running hugo server.
 */
router.delete('/serve', (req, res) => {
  if (hugoServerProc) {
    try { hugoServerProc.kill('SIGTERM'); } catch { /* already dead */ }
    hugoServerProc  = null;
    hugoServerDomain = null;
  }
  try {
    execSync(`lsof -ti tcp:${hugoServerPort} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch { /* ok */ }
  return res.json({ success: true });
});

export default router;

import fs from 'fs';
import path from 'path';

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
//  PARTIAL WRITER
// ═══════════════════════════════════════════════════════════════════

/**
 * For each discovered node--type-*:
 *   1. Write  layouts/partials/nodes/node--type-<x>.html  (canonical HTML,
 *      with Hugo template delimiters escaped so execution never fails)
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

    // Escape any {{ }} in the raw HTML before writing the partial file
    const safeHtml = escapeHugoDelimiters(info.canonicalHtml);

    fs.writeFileSync(partialFilePath, safeHtml + '\n', 'utf8');
    logs.push(`  ✓ layouts/partials/nodes/${partialFileName}  (found in ${info.filesFound.length} file(s))`);

    replaceNodeBlocksInLayouts(layoutsDir, nodeType, info.canonicalHtml, partialRef, logs);

    written.push({ nodeType, partialFileName, filesFound: info.filesFound });
  }

  return written;
}
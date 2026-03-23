import { extractDrupalComponents, writeDrupalComponentPartials, analyzeHtmlFiles, writeNodePartials } from './utils/analyzeHtml.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const layoutsDir = path.resolve(__dirname, '../Hugo-Sites/www.eliquis.ca/layouts');
const siteSrcDir = path.resolve(__dirname, '../sites/www.eliquis.ca');
const logs = [];

// Test extraction + writing + replacement
const components = extractDrupalComponents(siteSrcDir);
const result = writeDrupalComponentPartials(components, layoutsDir, logs);

console.log('--- LOGS ---');
logs.forEach(l => console.log(l));

console.log('\n--- RESULT ---');
console.log('blocks:', result.blocks.map(b => b.fileName));
console.log('regions:', result.regions.map(r => r.fileName));
console.log('components:', result.components.map(c => c.fileName));

// Verify that index.html was updated with partial references
const indexLayout = path.join(layoutsDir, 'index.html');
if (fs.existsSync(indexLayout)) {
  const content = fs.readFileSync(indexLayout, 'utf8');
  const partialRefs = content.match(/\{\{[\s\S]*?partial\s+"[^"]+"/g) || [];
  console.log('\n--- Partial refs in layouts/index.html ---');
  partialRefs.forEach(r => console.log(' ', r));
} else {
  console.log('\nNo layouts/index.html found (run convert first)');
}

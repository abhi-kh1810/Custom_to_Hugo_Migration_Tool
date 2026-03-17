#!/usr/bin/env node

/**
 * Config Generator - Convert CSV to config.json
 * Usage: node config-generator.js [csv-file]
 */

const fs = require('fs');
const path = require('path');

function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      // Convert enabled to boolean
      if (header === 'enabled') {
        obj[header] = value === 'true';
      } else {
        obj[header] = value;
      }
    });
    return obj;
  });
}

function generateConfig(sites) {
  return {
    sites: sites,
    viewports: {
      desktop: {
        width: 1920,
        height: 1080,
        enabled: true
      },
      tablet: {
        width: 768,
        height: 1024,
        enabled: false
      },
      mobile: {
        width: 375,
        height: 667,
        enabled: false
      }
    },
    settings: {
      screenshotsDir: './screenshots',
      comparisonDir: './comparison-results',
      timeout: 30000,
      waitAfterLoad: 2000,
      fullPage: true,
      pixelmatchThreshold: 0.1
    }
  };
}

// Main execution
const csvFile = process.argv[2] || 'sites-template.csv';
const csvPath = path.join(__dirname, csvFile);

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  console.log('\nUsage: node config-generator.js [csv-file]');
  console.log('Example: node config-generator.js sites.csv');
  process.exit(1);
}

console.log(`📄 Reading sites from: ${csvFile}`);
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const sites = parseCSV(csvContent);

console.log(`✓ Found ${sites.length} sites`);
console.log(`✓ Enabled sites: ${sites.filter(s => s.enabled).length}`);

const config = generateConfig(sites);
const configPath = path.join(__dirname, 'config.json');

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`\n✅ Configuration saved to: config.json`);
console.log('\nYou can now run: node cli.js');

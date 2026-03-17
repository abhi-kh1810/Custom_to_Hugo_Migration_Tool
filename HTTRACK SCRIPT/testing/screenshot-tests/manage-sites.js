#!/usr/bin/env node

/**
 * Site Manager - Quick operations on config.json
 * Usage: node manage-sites.js <command> [options]
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    console.error('❌ config.json not found!');
    console.log('Run: node config-generator.js sites.csv');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function listSites(config) {
  console.log('\n📊 Sites Configuration:\n');
  console.log(`Total sites: ${config.sites.length}`);
  console.log(`Enabled: ${config.sites.filter(s => s.enabled).length}`);
  console.log(`Disabled: ${config.sites.filter(s => !s.enabled).length}\n`);
  
  config.sites.forEach((site, index) => {
    const status = site.enabled ? '✓' : '✗';
    console.log(`${index + 1}. [${status}] ${site.name}`);
    console.log(`   Preview: ${site.previewUrl}`);
    console.log(`   Prod: ${site.prodUrl}\n`);
  });
}

function listViewports(config) {
  console.log('\n📱 Viewports Configuration:\n');
  Object.entries(config.viewports).forEach(([name, viewport]) => {
    const status = viewport.enabled ? '✓ ENABLED' : '✗ DISABLED';
    console.log(`${name}: ${viewport.width}x${viewport.height} [${status}]`);
  });
  console.log('');
}

function enableAll(config) {
  config.sites.forEach(site => site.enabled = true);
  saveConfig(config);
  console.log('✅ All sites enabled');
}

function disableAll(config) {
  config.sites.forEach(site => site.enabled = false);
  saveConfig(config);
  console.log('✅ All sites disabled');
}

function enableRange(config, start, end) {
  const startIdx = parseInt(start) - 1;
  const endIdx = parseInt(end);
  
  if (startIdx < 0 || endIdx > config.sites.length) {
    console.error('❌ Invalid range');
    process.exit(1);
  }
  
  config.sites.forEach((site, idx) => {
    site.enabled = (idx >= startIdx && idx < endIdx);
  });
  
  saveConfig(config);
  console.log(`✅ Enabled sites ${start}-${end}`);
  console.log(`   Total enabled: ${config.sites.filter(s => s.enabled).length}`);
}

function enableByName(config, names) {
  const nameList = names.split(',').map(n => n.trim());
  let count = 0;
  
  config.sites.forEach(site => {
    if (nameList.includes(site.name)) {
      site.enabled = true;
      count++;
    }
  });
  
  saveConfig(config);
  console.log(`✅ Enabled ${count} site(s): ${nameList.join(', ')}`);
}

function disableByName(config, names) {
  const nameList = names.split(',').map(n => n.trim());
  let count = 0;
  
  config.sites.forEach(site => {
    if (nameList.includes(site.name)) {
      site.enabled = false;
      count++;
    }
  });
  
  saveConfig(config);
  console.log(`✅ Disabled ${count} site(s): ${nameList.join(', ')}`);
}

function setViewport(config, viewport, enabled) {
  if (!config.viewports[viewport]) {
    console.error(`❌ Unknown viewport: ${viewport}`);
    console.log(`Available: ${Object.keys(config.viewports).join(', ')}`);
    process.exit(1);
  }
  
  config.viewports[viewport].enabled = enabled === 'true';
  saveConfig(config);
  console.log(`✅ ${viewport} ${enabled === 'true' ? 'enabled' : 'disabled'}`);
}

function showStats(config) {
  const enabledSites = config.sites.filter(s => s.enabled);
  const enabledViewports = Object.entries(config.viewports)
    .filter(([_, v]) => v.enabled)
    .map(([name, _]) => name);
  
  console.log('\n📊 Test Statistics:\n');
  console.log(`Sites to test: ${enabledSites.length}`);
  console.log(`Viewports: ${enabledViewports.join(', ')}`);
  console.log(`\nEstimated comparisons:`);
  
  enabledSites.forEach(site => {
    console.log(`  ${site.name}: ~${enabledViewports.length} viewports × pages in sitemap`);
  });
  
  console.log(`\nTotal viewport comparisons: ${enabledSites.length * enabledViewports.length}`);
  console.log('(Each site may have multiple pages from sitemap)\n');
}

// Main
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
🔧 Site Manager

Usage: node manage-sites.js <command> [options]

Commands:
  list                    List all sites
  viewports               List viewport configuration
  stats                   Show test statistics
  
  enable-all              Enable all sites
  disable-all             Disable all sites
  enable-range <start> <end>    Enable sites from start to end (1-based)
  enable <name1,name2>    Enable specific sites by name
  disable <name1,name2>   Disable specific sites by name
  
  viewport <name> <true|false>  Enable/disable viewport

Examples:
  node manage-sites.js list
  node manage-sites.js enable-range 1 20
  node manage-sites.js enable site1,site2,site3
  node manage-sites.js viewport tablet true
  node manage-sites.js stats
  `);
  process.exit(0);
}

const config = loadConfig();

switch (command) {
  case 'list':
    listSites(config);
    break;
    
  case 'viewports':
    listViewports(config);
    break;
    
  case 'stats':
    showStats(config);
    break;
    
  case 'enable-all':
    enableAll(config);
    break;
    
  case 'disable-all':
    disableAll(config);
    break;
    
  case 'enable-range':
    if (args.length < 3) {
      console.error('Usage: node manage-sites.js enable-range <start> <end>');
      process.exit(1);
    }
    enableRange(config, args[1], args[2]);
    break;
    
  case 'enable':
    if (args.length < 2) {
      console.error('Usage: node manage-sites.js enable <name1,name2,...>');
      process.exit(1);
    }
    enableByName(config, args[1]);
    break;
    
  case 'disable':
    if (args.length < 2) {
      console.error('Usage: node manage-sites.js disable <name1,name2,...>');
      process.exit(1);
    }
    disableByName(config, args[1]);
    break;
    
  case 'viewport':
    if (args.length < 3) {
      console.error('Usage: node manage-sites.js viewport <name> <true|false>');
      process.exit(1);
    }
    setViewport(config, args[1], args[2]);
    break;
    
  default:
    console.error(`❌ Unknown command: ${command}`);
    console.log('Run "node manage-sites.js" for help');
    process.exit(1);
}

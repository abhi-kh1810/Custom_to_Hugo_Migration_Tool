#!/usr/bin/env node

/**
 * Screenshot Comparison CLI Tool
 * Quick setup and execution without manual configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load and display configuration
function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.log('⚠️  No config.json found. Using default configuration.');
    console.log('   Create config.json or run: node config-generator.js sites.csv\n');
    return null;
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const enabledSites = config.sites.filter(s => s.enabled);
  const enabledViewports = Object.entries(config.viewports)
    .filter(([_, v]) => v.enabled)
    .map(([name, _]) => name);
  
  console.log('📋 Configuration:');
  console.log(`   Sites: ${enabledSites.length} enabled (${config.sites.length} total)`);
  console.log(`   Viewports: ${enabledViewports.join(', ')}`);
  console.log(`   Enabled sites: ${enabledSites.map(s => s.name).join(', ')}`);
  console.log('');
  
  return config;
}

const REQUIRED_DEPS = [
  '@playwright/test',
  'playwright',
  'xml2js',
  'pixelmatch',
  'pngjs'
];

console.log('🎬 Screenshot Comparison Tool\n');

// Load configuration
loadConfig();

// Check if dependencies are installed
const packageJson = require('./package.json');
const installedDeps = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
};

const missingDeps = REQUIRED_DEPS.filter(dep => !installedDeps[dep]);

if (missingDeps.length > 0) {
  console.log('📦 Installing required dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed\n');
  } catch (error) {
    console.error('❌ Failed to install dependencies');
    process.exit(1);
  }
}

// Check for Playwright browsers
if (!fs.existsSync(path.join(process.env.HOME || process.env.USERPROFILE, '.cache/ms-playwright'))) {
  console.log('🌐 Installing Playwright browsers...');
  try {
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    console.log('✅ Browsers installed\n');
  } catch (error) {
    console.warn('⚠️  Could not install browsers automatically. Run: npx playwright install\n');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'quick';

console.log('Starting comparison...\n');

try {
  switch (command) {
    case 'quick':
    case 'html':
      console.log('Running quick HTML comparison...\n');
      execSync('node screenshot-comparison.js', { stdio: 'inherit' });
      console.log('\n✅ HTML report generated!');
      console.log(`📊 Open: file://${process.cwd()}/comparison-results/comparison-report.html\n`);
      break;
      
    case 'test':
    case 'playwright':
      console.log('Running Playwright test suite...\n');
      execSync('npx playwright test screenshot-comparison.spec.js', { stdio: 'inherit' });
      console.log('\n✅ Tests complete!');
      console.log('📊 View report: npx playwright show-report\n');
      break;
      
    case 'both':
    case 'all':
      console.log('Running both comparison methods...\n');
      execSync('node screenshot-comparison.js', { stdio: 'inherit' });
      console.log('\n---\n');
      execSync('npx playwright test screenshot-comparison.spec.js', { stdio: 'inherit' });
      console.log('\n✅ All comparisons complete!');
      console.log(`📊 HTML: file://${process.cwd()}/comparison-results/comparison-report.html`);
      console.log('📊 Playwright: npx playwright show-report\n');
      break;
      
    case 'help':
    case '--help':
    case '-h':
      console.log(`
Usage: node cli.js [command]

Commands:
  quick, html        Generate HTML comparison report (default)
  test, playwright   Run Playwright test suite with pixel diff
  both, all         Run both comparison methods
  help              Show this help message

Examples:
  node cli.js                    # Quick HTML report
  node cli.js test               # Playwright tests
  node cli.js both               # Run everything

Options:
  --help, -h                     Show this help message

For more information, see SCREENSHOT_COMPARISON_README.md
      `);
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "node cli.js help" for usage information\n');
      process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Comparison failed:', error.message);
  process.exit(1);
}

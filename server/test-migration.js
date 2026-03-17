#!/usr/bin/env node

/**
 * Test Migration Script
 * 
 * Usage: node test-migration.js <url> [options]
 * 
 * Examples:
 *   node test-migration.js https://example.com
 *   node test-migration.js https://example.com --skip-images
 *   node test-migration.js https://example.com --download-only
 */

import { MigrationService } from './services/migrationService.js';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Migration Test Script
=====================

Usage: node test-migration.js <url> [options]

Arguments:
  url                     Website URL to migrate (required)

Options:
  --download-only        Download only, skip post-processing
  --skip-images          Skip image processing
  --skip-paths           Skip resource path fixing
  --skip-404             Skip 404 page creation
  --help, -h             Show this help message

Examples:
  node test-migration.js https://example.com
  node test-migration.js https://example.com --skip-images
  node test-migration.js https://example.com --download-only
  `);
  process.exit(0);
}

const url = args[0];
const downloadOnly = args.includes('--download-only');
const skipImages = args.includes('--skip-images');
const skipPaths = args.includes('--skip-paths');
const skip404 = args.includes('--skip-404');

// Validate URL
try {
  new URL(url);
} catch (error) {
  console.error('❌ Invalid URL:', url);
  process.exit(1);
}

const migrationService = new MigrationService();

async function runTest() {
  try {
    console.log('🚀 Starting migration test...');
    console.log('📍 URL:', url);
    console.log('⚙️  Options:', {
      downloadOnly,
      skipImages,
      skipPaths,
      skip404,
    });
    console.log('');

    const startTime = Date.now();

    if (downloadOnly) {
      // Download only
      console.log('📥 Downloading website...');
      const result = await migrationService.downloadWebsite(url, {
        onProgress: (message) => {
          console.log('  ℹ️ ', message);
        },
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('');
      console.log('✅ Download completed!');
      console.log('📊 Results:');
      console.log('  • Site Name:', result.siteName);
      console.log('  • Directory:', result.downloadedSiteDir);
      console.log('  • File Count:', result.fileCount);
      console.log('  • Duration:', duration, 'seconds');
    } else {
      // Full migration
      console.log('🔄 Running full migration with post-processing...');
      const result = await migrationService.fullMigration(url, {
        includeImageProcessing: !skipImages,
        includeResourcePathFixing: !skipPaths,
        include404Page: !skip404,
        onProgress: (message) => {
          console.log('  ℹ️ ', message);
        },
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('');
      console.log('✅ Full migration completed!');
      console.log('📊 Results:');
      console.log('  • Site Name:', result.siteName);
      console.log('  • Directory:', result.downloadedSiteDir);
      console.log('  • Duration:', duration, 'seconds');
    }

    console.log('');
    console.log('🎉 Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Migration failed!');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('');
  console.log('⚠️  Migration interrupted by user');
  process.exit(1);
});

// Run the test
runTest();

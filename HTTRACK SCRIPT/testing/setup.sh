#!/bin/bash

# Quick Setup Script for Screenshot Comparison Testing
# This script will set up everything you need to start testing

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Screenshot Comparison Testing - Quick Setup           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Working directory: $SCRIPT_DIR"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js v18 or higher from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Node.js found: $NODE_VERSION"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "✅ npm found: v$NPM_VERSION"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
echo "   This may take a few minutes..."
echo ""

if [ -f "package.json" ]; then
    npm install
else
    echo "⚠️  No package.json found. Installing dependencies manually..."
    npm install @playwright/test playwright xml2js pixelmatch pngjs
fi

echo ""
echo "✅ Dependencies installed"
echo ""

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
echo "   This will download Chromium browser (~300MB)"
echo ""

npx playwright install chromium

echo ""
echo "✅ Browsers installed"
echo ""

# Make scripts executable
echo "🔧 Setting permissions..."
chmod +x run-comparison.sh cli.js 2>/dev/null || true
echo "✅ Permissions set"
echo ""

# Create output directories
echo "📁 Creating output directories..."
mkdir -p screenshots/prod/desktop screenshots/prod/tablet screenshots/prod/mobile
mkdir -p screenshots/preview/desktop screenshots/preview/tablet screenshots/preview/mobile
mkdir -p comparison-results
echo "✅ Directories created"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete! 🎉                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📚 Quick Start:"
echo ""
echo "   1. Run quick comparison:"
echo "      node screenshot-comparison.js"
echo ""
echo "   2. View the HTML report:"
echo "      open comparison-results/comparison-report.html"
echo ""
echo "   3. Or use the interactive menu:"
echo "      ./run-comparison.sh"
echo ""
echo "   4. Or use npm scripts:"
echo "      npm test                 # Quick HTML report"
echo "      npm run test:visual      # Playwright tests"
echo "      npm run test:desktop     # Desktop only"
echo "      npm run test:mobile      # Mobile only"
echo ""
echo "📖 For more information:"
echo "   - Quick start: cat HOW_TO_RUN.md"
echo "   - Full docs: cat SCREENSHOT_COMPARISON_README.md"
echo "   - Commands: cat QUICK_REFERENCE.md"
echo ""
echo "🚀 Ready to test!"
echo ""

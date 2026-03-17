#!/bin/bash

# Screenshot Comparison Quick Start Script
# This script helps you quickly set up and run screenshot comparisons

set -e  # Exit on error

echo "🚀 Screenshot Comparison Tool - Quick Start"
echo "==========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v20.18.0 or higher."
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ] || [ ! -d "node_modules/playwright" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
    
    echo "🌐 Installing Playwright browsers..."
    npx playwright install chromium
    echo ""
fi

# Menu
echo "Choose comparison method:"
echo ""
echo "1) Quick HTML Report (Recommended for first-time users)"
echo "   - Generates side-by-side HTML comparison"
echo "   - Faster execution"
echo "   - Easy to share"
echo ""
echo "2) Advanced Playwright Test with Pixel Diff"
echo "   - Detailed pixel-by-pixel comparison"
echo "   - Interactive test report"
echo "   - Diff images showing exact differences"
echo ""
echo "3) Both methods"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🎬 Running quick HTML comparison..."
        npm run screenshot-compare
        echo ""
        echo "✅ Done! Open the report:"
        echo "   file://$(pwd)/comparison-results/comparison-report.html"
        ;;
    2)
        echo ""
        echo "🎬 Running Playwright test suite..."
        npm run screenshot-compare:visual
        echo ""
        echo "✅ Done! View the report with:"
        echo "   npx playwright show-report"
        ;;
    3)
        echo ""
        echo "🎬 Running both comparison methods..."
        echo ""
        echo "Step 1/2: HTML Report"
        npm run screenshot-compare
        echo ""
        echo "Step 2/2: Playwright Test"
        npm run screenshot-compare:visual
        echo ""
        echo "✅ Done! Reports available:"
        echo "   HTML: file://$(pwd)/comparison-results/comparison-report.html"
        echo "   Playwright: Run 'npx playwright show-report'"
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "📁 Screenshots saved in: $(pwd)/screenshots/"
echo ""
echo "📚 For more options, see SCREENSHOT_COMPARISON_README.md"

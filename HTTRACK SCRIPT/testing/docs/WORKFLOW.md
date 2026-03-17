# 📊 Screenshot Comparison Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCREENSHOT COMPARISON TOOL                    │
└─────────────────────────────────────────────────────────────────┘

                              START
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Parse sitemap.xml    │
                    │  Extract URLs         │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Convert Preview URLs │
                    │  to Production URLs   │
                    └───────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │  HTML Comparison    │       │  Playwright Tests   │
    │  (Quick Method)     │       │  (Advanced Method)  │
    └─────────────────────┘       └─────────────────────┘
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │  For each viewport: │       │  For each viewport: │
    │  • Desktop          │       │  • Desktop          │
    │  • Tablet           │       │  • Tablet           │
    │  • Mobile           │       │  • Mobile           │
    └─────────────────────┘       └─────────────────────┘
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │  For each URL:      │       │  For each URL:      │
    │  1. Go to Prod URL  │       │  1. Go to Prod URL  │
    │  2. Take screenshot │       │  2. Take screenshot │
    │  3. Go to Prev URL  │       │  3. Go to Prev URL  │
    │  4. Take screenshot │       │  4. Take screenshot │
    │                     │       │  5. Pixel compare   │
    │                     │       │  6. Generate diff   │
    └─────────────────────┘       └─────────────────────┘
                │                               │
                ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │  Generate HTML      │       │  Playwright HTML    │
    │  Report with:       │       │  Report with:       │
    │  • Side-by-side     │       │  • Diff images      │
    │  • Statistics       │       │  • Pixel counts     │
    │  • File sizes       │       │  • Test status      │
    └─────────────────────┘       └─────────────────────┘
                │                               │
                └───────────────┬───────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Review Results       │
                    │  • HTML Report        │
                    │  • Playwright Report  │
                    │  • Screenshots        │
                    └───────────────────────┘
                                │
                                ▼
                              END
```

## 🎯 Process Flow Details

### Stage 1: Input Processing
```
sitemap.xml → Parser → URL List
├── https://hjerteamyloidosedk-preview.pfizerstatic.io/
├── https://hjerteamyloidosedk-preview.pfizerstatic.io/article/om-attr-cm
└── ... (14 URLs total)

URL Conversion:
Preview: https://hjerteamyloidosedk-preview.pfizerstatic.io/article/om-attr-cm
   ↓
Production: https://hjerteamyloidose.dk/article/om-attr-cm
```

### Stage 2: Screenshot Capture
```
For each URL × Each Viewport:

┌──────────────────────────────────────┐
│ Production Environment               │
│ https://hjerteamyloidose.dk         │
│                                      │
│ Desktop (1920×1080)  ────────────►  │ screenshot_prod_desktop.png
│ Tablet  (768×1024)   ────────────►  │ screenshot_prod_tablet.png
│ Mobile  (375×667)    ────────────►  │ screenshot_prod_mobile.png
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ Preview Environment                  │
│ https://...pfizerstatic.io          │
│                                      │
│ Desktop (1920×1080)  ────────────►  │ screenshot_prev_desktop.png
│ Tablet  (768×1024)   ────────────►  │ screenshot_prev_tablet.png
│ Mobile  (375×667)    ────────────►  │ screenshot_prev_mobile.png
└──────────────────────────────────────┘
```

### Stage 3: Comparison (Playwright Method)
```
┌─────────────┐     ┌─────────────┐
│   Prod PNG  │     │  Preview PNG│
│ (1920×1080) │     │ (1920×1080) │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
                 ▼
         ┌───────────────┐
         │  Pixelmatch   │
         │  Algorithm    │
         └───────┬───────┘
                 │
                 ▼
         ┌───────────────┐
         │  Diff Image   │
         │  (colored)    │
         └───────┬───────┘
                 │
                 ▼
         ┌───────────────┐
         │  Statistics   │
         │  • Pixels     │
         │  • Percentage │
         └───────────────┘
```

## 📊 Comparison Metrics

### Method 1: HTML Report
```
Input: Screenshots only
Output:
  ├── comparison-report.html
  │   ├── Side-by-side images
  │   ├── File sizes
  │   └── Summary stats
  └── comparison-summary.json
      └── Metadata
```

### Method 2: Playwright Tests
```
Input: Screenshots + Pixel comparison
Output:
  ├── playwright-report/
  │   ├── index.html
  │   ├── Test results
  │   └── Attachments
  ├── screenshots/
  │   ├── *_prod.png
  │   ├── *_preview.png
  │   └── *_diff.png (highlighted differences)
  └── Pixel statistics
      ├── Total pixels
      ├── Different pixels
      └── Difference percentage
```

## 🎨 Visual Diff Interpretation

```
┌─────────────────────────────────────────────┐
│  Production Screenshot                      │
│  ┌─────────────────────────────────────┐   │
│  │ ■ Header                            │   │
│  │ ■ Navigation Menu                   │   │
│  │ ■ Main Content                      │   │
│  │ ■ Footer                            │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    │
                    │ Compare with Pixelmatch
                    ▼
┌─────────────────────────────────────────────┐
│  Preview Screenshot                         │
│  ┌─────────────────────────────────────┐   │
│  │ ■ Header                            │   │
│  │ ■ Navigation Menu (different)       │   │
│  │ ■ Main Content                      │   │
│  │ ■ Footer                            │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Diff Image (Red = Different)               │
│  ┌─────────────────────────────────────┐   │
│  │ □ Header (gray = same)              │   │
│  │ █ Navigation Menu (red = different) │   │
│  │ □ Main Content (gray = same)        │   │
│  │ □ Footer (gray = same)              │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Stats: 5,234 pixels different (2.7%)      │
└─────────────────────────────────────────────┘
```

## 📈 Scale & Performance

```
Your Site:
├── 14 URLs from sitemap
├── 3 Viewports (desktop, tablet, mobile)
└── Total: 42 screenshot comparisons

Estimated Time:
├── Screenshot capture: ~30 seconds per URL
├── Total capture time: ~7 minutes
├── Comparison time: ~10 seconds per pair
└── Total runtime: ~8-10 minutes

Storage:
├── Screenshot size: ~100-500 KB each
├── Total screenshots: 84 (42 prod + 42 preview)
└── Estimated disk space: 10-50 MB
```

## 🔄 Execution Paths

### Path 1: Quick Start
```
npm run screenshot-compare
    ↓
Launch Chromium
    ↓
For each URL (sequential)
    ↓
Take screenshots
    ↓
Generate HTML report
    ↓
Open in browser
```

### Path 2: Detailed Testing
```
npm run screenshot-compare:visual
    ↓
Launch Playwright Test Runner
    ↓
For each URL (with retries)
    ↓
Take screenshots
    ↓
Pixel comparison
    ↓
Generate diff images
    ↓
Create test report
    ↓
View with: npx playwright show-report
```

### Path 3: Interactive
```
./run-comparison.sh
    ↓
Check dependencies
    ↓
Show menu
    ↓
User selects method
    ↓
Execute chosen path
    ↓
Display results
```

## 💡 Decision Tree

```
                    Need to compare screenshots?
                              │
                    ┌─────────┴─────────┐
                    │                   │
                  Yes                  No
                    │                   └─► Exit
                    ▼
        Quick check or detailed analysis?
                    │
        ┌───────────┴───────────┐
        │                       │
      Quick                  Detailed
        │                       │
        ▼                       ▼
    HTML Report          Playwright Tests
    (Method 1)              (Method 2)
        │                       │
        ▼                       ▼
    Good enough?           Set threshold?
        │                       │
    ┌───┴───┐               ┌───┴───┐
    │       │              Yes      No
   Yes     No               │        │
    │       │               ▼        ▼
    └───► Done        Auto-fail   Manual
                      on diffs    review
```

This visual guide helps you understand the complete workflow! 🎉

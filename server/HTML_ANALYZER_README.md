# HTML Analyzer Service Documentation

## Overview

The HTML Analyzer Service analyzes HTML files to identify semantic tags and extract common HTML structures from elements with `node--type-*` classes, then creates reusable partial files and modifies original files to reference these partials.

## Architecture

### Client-Server Connection

The HTML Analyzer is built as a **RESTful API service** with the following architecture:

#### Server Components
- **Express.js Backend** (Port 3003)
  - Hosts REST API endpoints
  - Handles file analysis and processing
  - Manages file I/O operations
  - Returns JSON responses

#### Client Interaction
- **HTTP REST API** communication
  - Client sends POST requests with JSON payloads
  - Server processes requests and returns JSON responses
  - Supports CORS for cross-origin requests
  - Standard HTTP status codes for response handling

#### Connection Flow
```
┌─────────────┐                    ┌─────────────────┐
│   Client    │                    │  Express Server │
│  (Any HTTP  │                    │   (Port 3003)   │
│   Client)   │                    │                 │
└──────┬──────┘                    └────────┬────────┘
       │                                    │
       │  POST /api/analyze/extract-partials│
       ├───────────────────────────────────>│
       │  { sourcePath, outputPath }        │
       │                                    │
       │                                    │ Process Files
       │                                    │ Create Partials
       │                                    │ Generate Report
       │                                    │
       │         JSON Response              │
       │<───────────────────────────────────┤
       │  { success, data, stats }          │
       │                                    │
```

#### Supported Clients
1. **Web Browsers** (via Fetch API or Axios)
   ```javascript
   const response = await fetch('http://localhost:3003/api/analyze/extract-partials', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ sourcePath: '/path/to/files' })
   });
   ```

2. **Node.js Applications** (via Axios or native fetch)
   ```javascript
   import axios from 'axios';
   const result = await axios.post('http://localhost:3003/api/analyze/extract-partials', {
     sourcePath: '/path/to/files'
   });
   ```

3. **Command Line** (via cURL)
   ```bash
   curl -X POST http://localhost:3003/api/analyze/extract-partials \
     -H "Content-Type: application/json" \
     -d '{"sourcePath": "/path/to/files"}'
   ```

4. **API Testing Tools** (Postman, Insomnia, Thunder Client)

#### Server Configuration
- **Base URL**: `http://localhost:3003`
- **Protocol**: HTTP (can be configured for HTTPS)
- **Response Format**: JSON
- **Request Format**: JSON
- **CORS**: Enabled for cross-origin requests

#### Communication Protocol
- **Request Method**: POST
- **Content-Type**: application/json
- **Response Type**: application/json
- **Encoding**: UTF-8
- **Status Codes**:
  - 200: Success
  - 400: Bad Request (invalid parameters)
  - 500: Server Error (processing failure)

### Frontend Client Integration

#### Adding HTML Analyzer Tab to Client Application

To integrate the HTML Analyzer into a client application (React, Vue, Angular, or vanilla JS), follow these steps:

**Step 1: Create a New Tab Component**

For React-based client:
```javascript
// filepath: client/src/components/HtmlAnalyzerTab.jsx
import React, { useState } from 'react';
import axios from 'axios';

const HtmlAnalyzerTab = () => {
  const [sourcePath, setSourcePath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const API_URL = 'http://localhost:3003';

  const handleAnalyze = async (endpoint) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_URL}/api/analyze/${endpoint}`, {
        sourcePath,
        outputPath: outputPath || undefined
      });
      setResults(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="html-analyzer-tab">
      <h2>HTML Analyzer</h2>
      
      <div className="form-group">
        <label>Source Path:</label>
        <input
          type="text"
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="/path/to/html/files"
        />
      </div>

      <div className="form-group">
        <label>Output Path (optional):</label>
        <input
          type="text"
          value={outputPath}
          onChange={(e) => setOutputPath(e.target.value)}
          placeholder="/custom/output/path"
        />
      </div>

      <div className="button-group">
        <button 
          onClick={() => handleAnalyze('extract-partials')}
          disabled={!sourcePath || loading}
        >
          Extract Partials
        </button>
        <button 
          onClick={() => handleAnalyze('node-types')}
          disabled={!sourcePath || loading}
        >
          Analyze Node Types
        </button>
        <button 
          onClick={() => handleAnalyze('semantic-tags')}
          disabled={!sourcePath || loading}
        >
          Analyze Semantic Tags
        </button>
      </div>

      {loading && <div className="spinner">Analyzing...</div>}
      
      {error && (
        <div className="error-message">
          <h3>Error:</h3>
          <pre>{error}</pre>
        </div>
      )}

      {results && (
        <div className="results">
          <h3>Results:</h3>
          <pre>{JSON.stringify(results, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default HtmlAnalyzerTab;
```

**Step 2: Add Tab to Main Navigation**

```javascript
// filepath: client/src/App.jsx
import HtmlAnalyzerTab from './components/HtmlAnalyzerTab';

function App() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="app">
      <nav className="tabs">
        <button onClick={() => setActiveTab('home')}>Home</button>
        <button onClick={() => setActiveTab('analyzer')}>HTML Analyzer</button>
        {/* ...other tabs */}
      </nav>

      <div className="tab-content">
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'analyzer' && <HtmlAnalyzerTab />}
        {/* ...other tab contents */}
      </div>
    </div>
  );
}
```

**Step 3: Add Styling**

```css
/* filepath: client/src/styles/HtmlAnalyzer.css */
.html-analyzer-tab {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.form-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.button-group {
  display: flex;
  gap: 10px;
  margin: 20px 0;
}

.button-group button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.button-group button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.spinner {
  text-align: center;
  padding: 20px;
  color: #007bff;
}

.error-message {
  background-color: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 4px;
  margin: 20px 0;
}

.results {
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 4px;
  margin: 20px 0;
}

.results pre {
  overflow-x: auto;
  white-space: pre-wrap;
}
```

#### Vanilla JavaScript Implementation

For non-framework applications:

```html
<!-- filepath: client/public/analyzer.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HTML Analyzer</title>
  <style>
    /* Same CSS as above */
  </style>
</head>
<body>
  <div class="html-analyzer-tab">
    <h2>HTML Analyzer</h2>
    
    <div class="form-group">
      <label>Source Path:</label>
      <input type="text" id="sourcePath" placeholder="/path/to/html/files">
    </div>

    <div class="form-group">
      <label>Output Path (optional):</label>
      <input type="text" id="outputPath" placeholder="/custom/output/path">
    </div>

    <div class="button-group">
      <button onclick="analyze('extract-partials')">Extract Partials</button>
      <button onclick="analyze('node-types')">Analyze Node Types</button>
      <button onclick="analyze('semantic-tags')">Analyze Semantic Tags</button>
    </div>

    <div id="loading" style="display:none;">Analyzing...</div>
    <div id="error" class="error-message" style="display:none;"></div>
    <div id="results" class="results" style="display:none;"></div>
  </div>

  <script>
    const API_URL = 'http://localhost:3003';

    async function analyze(endpoint) {
      const sourcePath = document.getElementById('sourcePath').value;
      const outputPath = document.getElementById('outputPath').value;
      
      if (!sourcePath) {
        alert('Please enter a source path');
        return;
      }

      const loading = document.getElementById('loading');
      const error = document.getElementById('error');
      const results = document.getElementById('results');

      loading.style.display = 'block';
      error.style.display = 'none';
      results.style.display = 'none';

      try {
        const response = await fetch(`${API_URL}/api/analyze/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath,
            outputPath: outputPath || undefined
          })
        });

        const data = await response.json();

        if (data.success) {
          results.innerHTML = `<h3>Results:</h3><pre>${JSON.stringify(data, null, 2)}</pre>`;
          results.style.display = 'block';
        } else {
          throw new Error(data.error || 'Analysis failed');
        }
      } catch (err) {
        error.innerHTML = `<h3>Error:</h3><pre>${err.message}</pre>`;
        error.style.display = 'block';
      } finally {
        loading.style.display = 'none';
      }
    }
  </script>
</body>
</html>
```

#### Vue.js Implementation

```vue
<!-- filepath: client/src/components/HtmlAnalyzerTab.vue -->
<template>
  <div class="html-analyzer-tab">
    <h2>HTML Analyzer</h2>
    
    <div class="form-group">
      <label>Source Path:</label>
      <input v-model="sourcePath" placeholder="/path/to/html/files">
    </div>

    <div class="form-group">
      <label>Output Path (optional):</label>
      <input v-model="outputPath" placeholder="/custom/output/path">
    </div>

    <div class="button-group">
      <button @click="analyze('extract-partials')" :disabled="!sourcePath || loading">
        Extract Partials
      </button>
      <button @click="analyze('node-types')" :disabled="!sourcePath || loading">
        Analyze Node Types
      </button>
      <button @click="analyze('semantic-tags')" :disabled="!sourcePath || loading">
        Analyze Semantic Tags
      </button>
    </div>

    <div v-if="loading" class="spinner">Analyzing...</div>
    <div v-if="error" class="error-message">
      <h3>Error:</h3>
      <pre>{{ error }}</pre>
    </div>
    <div v-if="results" class="results">
      <h3>Results:</h3>
      <pre>{{ JSON.stringify(results, null, 2) }}</pre>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'HtmlAnalyzerTab',
  data() {
    return {
      sourcePath: '',
      outputPath: '',
      loading: false,
      results: null,
      error: null,
      API_URL: 'http://localhost:3003'
    };
  },
  methods: {
    async analyze(endpoint) {
      this.loading = true;
      this.error = null;
      try {
        const response = await axios.post(`${this.API_URL}/api/analyze/${endpoint}`, {
          sourcePath: this.sourcePath,
          outputPath: this.outputPath || undefined
        });
        this.results = response.data;
      } catch (err) {
        this.error = err.response?.data?.error || err.message;
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped>
/* Same CSS as above */
</style>
```

#### Integration Checklist

- [ ] Ensure server is running on port 3003
- [ ] Configure CORS on server to allow client origin
- [ ] Install axios or use native fetch in client
- [ ] Add HTML Analyzer tab to main navigation
- [ ] Import and register HtmlAnalyzerTab component
- [ ] Test API connectivity
- [ ] Handle loading states and errors
- [ ] Display results in user-friendly format

## Features

- ✅ Analyzes HTML files for `node--type-*` class patterns
- ✅ Identifies semantic HTML5 tags (header, nav, main, article, section, etc.)
- ✅ Extracts common structures into reusable Hugo partials
- ✅ Automatically modifies original files to use partials
- ✅ Generates detailed analysis reports with recommendations
- ✅ Creates parameterized Hugo templates

## API Endpoints

### 1. Extract Partials (Full Analysis)

**POST** `/api/analyze/extract-partials`

Performs complete analysis: identifies patterns, creates partials, and modifies files.

**Request Body:**
```json
{
  "sourcePath": "/path/to/html/files",
  "outputPath": "/optional/output/path"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Analysis completed successfully",
  "data": {
    "sourcePath": "/path/to/html/files",
    "outputPath": "/output/path",
    "stats": {
      "filesAnalyzed": 15,
      "nodeTypesFound": 3,
      "partialsCreated": 2,
      "filesModified": 10
    },
    "partials": [
      {
        "name": "article-node.html",
        "path": "/output/path/partials/article-node.html",
        "nodeType": "node--type-article",
        "occurrences": 8,
        "files": ["page1.html", "page2.html"]
      }
    ],
    "reportPath": "/output/path/analysis-report.json"
  }
}
```

### 2. Analyze Node Types Only

**POST** `/api/analyze/node-types`

Analyzes files to identify all `node--type-*` patterns without creating partials.

**Request Body:**
```json
{
  "sourcePath": "/path/to/html/files"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalFiles": 15,
    "nodeTypesFound": 3,
    "summary": [
      {
        "nodeType": "node--type-article",
        "count": 8,
        "files": ["page1.html", "page2.html"],
        "semanticTags": ["article", "header", "footer"],
        "structures": 8
      }
    ]
  }
}
```

### 3. Analyze Semantic Tags

**POST** `/api/analyze/semantic-tags`

Extracts semantic HTML5 tag usage statistics.

**Request Body:**
```json
{
  "sourcePath": "/path/to/html/files"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalFiles": 15,
    "semanticTagsUsage": {
      "index.html": {
        "header": 1,
        "nav": 1,
        "main": 1,
        "article": 3,
        "section": 5,
        "aside": 1,
        "footer": 1
      }
    }
  }
}
```

## Usage Examples

### Using cURL

```bash
# Analyze and extract partials
curl -X POST http://localhost:3003/api/analyze/extract-partials \
  -H "Content-Type: application/json" \
  -d '{"sourcePath": "/path/to/html/files"}'

# Analyze node types only
curl -X POST http://localhost:3003/api/analyze/node-types \
  -H "Content-Type: application/json" \
  -d '{"sourcePath": "/path/to/html/files"}'

# Analyze semantic tags
curl -X POST http://localhost:3003/api/analyze/semantic-tags \
  -H "Content-Type: application/json" \
  -d '{"sourcePath": "/path/to/html/files"}'
```

### Using Node.js

```javascript
import axios from 'axios';

const API_URL = 'http://localhost:3003';

// Extract partials
const result = await axios.post(`${API_URL}/api/analyze/extract-partials`, {
  sourcePath: '/path/to/html/files',
  outputPath: '/custom/output/path' // optional
});

console.log('Partials created:', result.data.data.partials);
```

### Direct Service Usage

```javascript
import { HtmlAnalyzerService } from './services/htmlAnalyzerService.js';

const analyzer = new HtmlAnalyzerService(
  '/path/to/source/files',
  '/path/to/output'
);

const result = await analyzer.analyze();
const report = analyzer.generateReport(result);

console.log(report);
```

## Generated Partial Structure

Partials are created with Hugo template syntax and documentation:

```html
{{/*
  Partial: article-node.html
  Node Type: node--type-article
  Occurrences: 8
  
  Usage:
  {{ partial "article-node" (dict "Content" .Content "Image" .Image "Link" .Link) }}
  
  Parameters:
  - content: Main content text
  - image: Image source URL
  - altText: Image alt text
  - link: Link URL
  
  Semantic Tags: article, header, footer
*/}}

<article class="node--type-article">
  <header>
    <h2>{{ .Title }}</h2>
  </header>
  <div class="content">
    {{ .Content }}
  </div>
  <footer>
    <a href="{{ .Link }}">Read more</a>
  </footer>
</article>
```

## How It Works

1. **File Discovery**: Recursively scans directory for HTML files
2. **Pattern Detection**: Identifies elements with `node--type-*` classes
3. **Structure Analysis**: Analyzes DOM structure, semantic tags, and attributes
4. **Common Pattern Identification**: Groups similar structures
5. **Template Extraction**: Creates parameterized Hugo templates
6. **Partial Generation**: Writes partial files with documentation
7. **File Modification**: Replaces original elements with partial references
8. **Report Generation**: Creates detailed analysis report with recommendations

## Semantic Tags Detected

- `<header>`
- `<nav>`
- `<main>`
- `<article>`
- `<section>`
- `<aside>`
- `<footer>`
- `<figure>`
- `<figcaption>`
- `<time>`
- `<mark>`

## Configuration

No configuration needed. The service automatically:
- Creates output directories
- Handles nested directory structures
- Preserves file paths in output
- Generates descriptive partial names
- Creates Hugo-compatible templates

## Output Structure

```
output_path/
├── analysis-report.json        # Detailed analysis report
├── partials/                   # Hugo partial files
│   ├── article-node.html
│   ├── page-node.html
│   └── event-node.html
└── [original structure]        # Modified HTML files
    ├── index.html
    ├── about.html
    └── ...
```

## Error Handling

The API handles common errors:
- Missing source path
- Invalid paths
- No HTML files found
- Parsing errors
- File system errors

All errors return structured JSON:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Testing

Run the test script:
```bash
cd server
chmod +x test-analyze.sh
./test-analyze.sh
```

Or test locally:
```bash
node test-analyze-local.js
```

## Best Practices

1. **Backup First**: Always backup original files before analysis
2. **Review Partials**: Review generated partials for correctness
3. **Test Integration**: Test Hugo site builds after integration
4. **Customize Templates**: Adjust Hugo template variables as needed
5. **Consolidate**: Merge similar partials if too many are created

## Limitations

- Requires at least 2 occurrences to create a partial
- Basic template parameterization (manual refinement may be needed)
- Works best with consistent HTML structure
- Generated partials may need manual Hugo template adjustments

## Future Enhancements

- AI-powered template generation
- Custom pattern matching rules
- Front matter extraction
- Multi-language support
- Interactive partial customization
- Integration with Hugo CLI for validation

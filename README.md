# Hugo Site Builder

A full-stack web platform that converts any live website into a production-ready [Hugo](https://gohugo.io/) static site. Mirror a site via HTTrack, auto-process all assets, fix resource paths, and generate a complete Hugo project — all through a modern React UI backed by an Express API.

---

## Features

- **URL to Hugo** — Enter any website URL; the platform mirrors it with HTTrack and converts the downloaded HTML into a Hugo project automatically.
- **File Upload Mode** — Manually upload your own HTML, CSS, JS, and image files to build a Hugo project without mirroring.
- **Asset Processing** — Automatically fixes resource paths, processes images, handles fonts, and cleans up downloaded site structure.
- **Hugo Project Generation** — Generates Hugo layouts, partials, and content files from raw HTML using intelligent semantic analysis.
- **Live Preview** — Serve and preview the generated Hugo site directly in the browser from within the app.
- **Project Management** — Create, view, and manage multiple Hugo conversion projects.
- **Download** — Download the generated Hugo project as a ZIP archive.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion, React Router |
| Backend | Node.js, Express |
| Site Mirroring | [HTTrack](https://www.httrack.com/) |
| Static Site | [Hugo](https://gohugo.io/) |
| HTML Parsing | jsdom, Turndown |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [HTTrack](https://www.httrack.com/) — for URL mirroring
- [Hugo](https://gohugo.io/installation/) — for building generated sites (optional)

Install on macOS:
```bash
brew install httrack hugo
```

Install on Ubuntu/Debian:
```bash
sudo apt-get install httrack
# For Hugo, see https://gohugo.io/installation/linux/
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone <repo-url>
cd Create_Hugo_Site
```

### 2. Quick start (recommended)

```bash
chmod +x start.sh
./start.sh
```

This script installs dependencies for both `server` and `client`, then starts both servers.

### 3. Manual start

**Install dependencies:**
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Return to root
cd ..
```

**Start the backend** (runs on `http://localhost:5001`):
```bash
cd server
npm run dev
```

**Start the frontend** (runs on `http://localhost:5173`):
```bash
cd client
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Project Structure

```
├── client/                  # React + Vite frontend
│   └── src/
│       ├── pages/           # Home, FetchSite, CreateProject, ProjectDetail, DownloadHTTrack
│       ├── components/      # FileUpload, Layout, Preview
│       ├── hooks/           # useProject
│       └── utils/           # API helpers
├── server/                  # Express backend
│   ├── routes/              # project, upload, generate, hugo, httrack, migration, sites
│   ├── services/            # hugoService, migrationService, projectService, fileService
│   ├── utils/               # HTML analyzer, ASX helpers
│   ├── middleware/          # Multer upload middleware
│   └── storage/projects/    # Generated project files
├── sites/                   # HTTrack-mirrored raw site downloads
├── Hugo-Sites/              # Generated Hugo projects
├── HTTRACK SCRIPT/          # Migration shell scripts and utilities
└── start.sh                 # One-command startup script
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get project details |
| `POST` | `/api/upload/html` | Upload HTML files |
| `POST` | `/api/upload/css` | Upload CSS files |
| `POST` | `/api/upload/js` | Upload JS files |
| `POST` | `/api/upload/images` | Upload image files |
| `POST` | `/api/generate` | Generate Hugo project from uploads |
| `POST` | `/api/hugo/convert` | Mirror URL + convert to Hugo |
| `GET` | `/api/hugo/sites` | List downloaded sites |
| `POST` | `/api/hugo/serve/:site` | Serve a Hugo site for preview |
| `POST` | `/api/migration/full` | Full migration (download + process) |
| `GET` | `/api/migration/sites` | List migrated sites |

---

## Usage

### Convert a URL to Hugo

1. Go to **Fetch Site** in the UI.
2. Enter the target website URL.
3. Click **Convert** — the platform mirrors the site, processes assets, and generates the Hugo project.
4. Preview the result and download the ZIP.

### Upload & Convert HTML files

1. Go to **Create Project**.
2. Enter a project name and upload your HTML, CSS, JS, and image files step by step.
3. Generate the Hugo project and preview/download it.

---

## License

MIT

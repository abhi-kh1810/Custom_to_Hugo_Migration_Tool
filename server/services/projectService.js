import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_PATH = path.join(__dirname, '..', 'storage', 'projects');

// In-memory project store (replace with DB for production)
const projects = new Map();

export function getAllProjects() {
  return Array.from(projects.values()).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

export function getProject(id) {
  return projects.get(id) || null;
}

export function createProject(name, description = '') {
  const id = uuidv4();
  const projectPath = path.join(STORAGE_PATH, id);

  // Create full Hugo project directory structure
  const dirs = [
    // Core Hugo directories
    'archetypes',
    'assets',
    'assets/css',
    'assets/js',
    'assets/images',
    'content',
    'content/posts',
    'data',
    'i18n',
    'layouts',
    'layouts/_default',
    'layouts/_default/_markup',
    'layouts/partials',
    'layouts/shortcodes',
    'layouts/page',
    'public',
    'resources',
    'resources/_gen',
    'resources/_gen/assets',
    'resources/_gen/images',
    'static',
    'static/css',
    'static/js',
    'static/images',
    'static/fonts',
    'themes',
  ];

  dirs.forEach((dir) => {
    fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
  });

  // Create Hugo config (hugo.toml)
  const hugoConfig = `baseURL = "/"
languageCode = "en-us"
title = "${name}"
theme = ""
summaryLength = 70
buildDrafts = false
buildFuture = false
buildExpired = false
enableRobotsTXT = true
enableGitInfo = false
enableEmoji = true

[pagination]
  pagerSize = 10
  path = "page"

[markup]
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true
  [markup.highlight]
    codeFences = true
    guessSyntax = true
    lineNos = false
    noClasses = true
    style = "monokai"

[sitemap]
  changefreq = "weekly"
  filename = "sitemap.xml"
  priority = 0.5

[outputs]
  home = ["HTML", "RSS"]
  page = ["HTML"]
  section = ["HTML", "RSS"]

[params]
  description = "${description}"
  author = ""
  dateFormat = "January 2, 2006"
`;

  // Create archetypes/default.md (Hugo archetype template)
  const defaultArchetype = `---
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true
description: ""
tags: []
categories: []
---
`;

  // Create .gitmodules (for theme submodules)
  const gitmodules = `# Git submodules for Hugo themes\n# Example:\n# [submodule "themes/my-theme"]\n#   path = themes/my-theme\n#   url = https://github.com/user/my-theme.git\n`;

  // Create .hugo_build.lock (Hugo build lock)
  const hugoBuildLock = '';

  // Write all config and scaffold files
  fs.writeFileSync(path.join(projectPath, 'hugo.toml'), hugoConfig);
  fs.writeFileSync(path.join(projectPath, 'archetypes', 'default.md'), defaultArchetype);
  fs.writeFileSync(path.join(projectPath, '.gitmodules'), gitmodules);
  fs.writeFileSync(path.join(projectPath, '.hugo_build.lock'), hugoBuildLock);

  // Create robots.txt template
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: {{ "sitemap.xml" | absURL }}\n`;
  fs.writeFileSync(path.join(projectPath, 'layouts', 'robots.txt'), robotsTxt);

  // Create 404 page
  const notFoundLayout = `{{ define "main" }}
<div style="text-align:center; padding:50px;">
  <h1>404 - Page Not Found</h1>
  <p>The page you are looking for does not exist.</p>
  <a href="/">Go Home</a>
</div>
{{ end }}`;
  fs.writeFileSync(path.join(projectPath, 'layouts', '404.html'), notFoundLayout);

  // Create head partial for custom head injections
  const headPartial = `{{/* Custom head content - add meta tags, fonts, etc. */}}
<meta name="description" content="{{ with .Description }}{{ . }}{{ else }}{{ .Site.Params.description }}{{ end }}">
<meta name="author" content="{{ .Site.Params.author }}">
`;
  fs.writeFileSync(path.join(projectPath, 'layouts', 'partials', 'head.html'), headPartial);

  // Create header partial
  const headerPartial = `{{/* Site header partial */}}
<header>
  <nav>
    <a href="/">{{ .Site.Title }}</a>
  </nav>
</header>
`;
  fs.writeFileSync(path.join(projectPath, 'layouts', 'partials', 'header.html'), headerPartial);

  // Create footer partial
  const footerPartial = `{{/* Site footer partial */}}
<footer>
  <p>&copy; {{ now.Year }} {{ .Site.Title }}. All rights reserved.</p>
</footer>
`;
  fs.writeFileSync(path.join(projectPath, 'layouts', 'partials', 'footer.html'), footerPartial);

  // Create default _index.md for content root
  const rootContentIndex = `---
title: "Home"
date: ${new Date().toISOString()}
draft: false
---
`;
  fs.writeFileSync(path.join(projectPath, 'content', '_index.md'), rootContentIndex);

  // Create base layout (baseof.html - master template)
  const baseLayout = `<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode | default "en" }}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>{{ if not .IsHome }}{{ .Title }} | {{ end }}{{ .Site.Title }}</title>
    {{- partial "head.html" . -}}
    {{ range .Site.Params.css }}
    <link rel="stylesheet" href="{{ . | relURL }}">
    {{ end }}
    {{- block "head" . }}{{ end -}}
</head>
<body>
    {{- partial "header.html" . -}}
    <main>
    {{- block "main" . }}{{ end -}}
    </main>
    {{- partial "footer.html" . -}}
    {{ range .Site.Params.js }}
    <script src="{{ . | relURL }}"></script>
    {{ end }}
    {{- block "footer_js" . }}{{ end -}}
</body>
</html>`;

  fs.writeFileSync(
    path.join(projectPath, 'layouts', '_default', 'baseof.html'),
    baseLayout
  );

  // Create default single page layout
  const singleLayout = `{{ define "main" }}
{{ .Content }}
{{ end }}`;

  fs.writeFileSync(
    path.join(projectPath, 'layouts', '_default', 'single.html'),
    singleLayout
  );

  // Create default list layout
  const listLayout = `{{ define "main" }}
<div class="page-list">
  <h1>{{ .Title }}</h1>
  {{ .Content }}
  {{ range .Paginator.Pages }}
  <article>
    <h2><a href="{{ .Permalink }}">{{ .Title }}</a></h2>
    {{ if .Description }}<p>{{ .Description }}</p>{{ else }}<p>{{ .Summary }}</p>{{ end }}
    <time datetime="{{ .Date.Format "2006-01-02" }}">{{ .Date.Format "January 2, 2006" }}</time>
  </article>
  {{ end }}
  {{ template "_internal/pagination.html" . }}
</div>
{{ end }}`;

  fs.writeFileSync(
    path.join(projectPath, 'layouts', '_default', 'list.html'),
    listLayout
  );

  // Create index/home page layout
  const indexLayout = `{{ define "main" }}
<div class="home">
  {{ .Content }}
  {{ range first 10 (where .Site.RegularPages "Section" "ne" "") }}
  <article>
    <h2><a href="{{ .Permalink }}">{{ .Title }}</a></h2>
    {{ if .Description }}<p>{{ .Description }}</p>{{ else }}<p>{{ .Summary }}</p>{{ end }}
  </article>
  {{ end }}
</div>
{{ end }}`;

  fs.writeFileSync(
    path.join(projectPath, 'layouts', 'index.html'),
    indexLayout
  );

  // Create section layout (for content sections like /posts/)
  const sectionLayout = `{{ define "main" }}
<div class="section">
  <h1>{{ .Title }}</h1>
  {{ .Content }}
  {{ range .Paginator.Pages }}
  <article>
    <h2><a href="{{ .Permalink }}">{{ .Title }}</a></h2>
    {{ if .Description }}<p>{{ .Description }}</p>{{ else }}<p>{{ .Summary }}</p>{{ end }}
    <time datetime="{{ .Date.Format "2006-01-02" }}">{{ .Date.Format "January 2, 2006" }}</time>
  </article>
  {{ end }}
  {{ template "_internal/pagination.html" . }}
</div>
{{ end }}`;

  fs.writeFileSync(
    path.join(projectPath, 'layouts', '_default', 'section.html'),
    sectionLayout
  );

  const project = {
    id,
    name,
    description,
    path: projectPath,
    pages: [],
    cssFiles: [],
    jsFiles: [],
    images: [],
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  projects.set(id, project);
  return project;
}

export function updateProject(id, updates) {
  const project = projects.get(id);
  if (!project) return null;
  const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
  projects.set(id, updated);
  return updated;
}

export function deleteProject(id) {
  const project = projects.get(id);
  if (!project) return false;
  // Remove files
  if (fs.existsSync(project.path)) {
    fs.rmSync(project.path, { recursive: true, force: true });
  }
  projects.delete(id);
  return true;
}

export function addPageToProject(id, page) {
  const project = projects.get(id);
  if (!project) return null;
  project.pages.push(page);
  project.updatedAt = new Date().toISOString();
  projects.set(id, project);
  return project;
}

export function addAssetToProject(id, type, asset) {
  const project = projects.get(id);
  if (!project) return null;
  if (type === 'css') project.cssFiles.push(asset);
  else if (type === 'js') project.jsFiles.push(asset);
  else if (type === 'image') project.images.push(asset);
  project.updatedAt = new Date().toISOString();
  projects.set(id, project);
  return project;
}

export function getProjectPath(id) {
  return path.join(STORAGE_PATH, id);
}

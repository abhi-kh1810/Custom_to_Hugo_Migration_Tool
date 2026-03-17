import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const HTTRACK_DIR = path.join(__dirname, '..', '..', 'HTTRACK SCRIPT');
const SITES_TXT = path.join(HTTRACK_DIR, 'sites.txt');
const SITES_BASE_DIR = path.join(__dirname, '..', '..', 'sites');

/**
 * After a successful migration, clean up intermediate folders:
 *  - Delete HTTRACK SCRIPT/public/<domain>  (raw HTTrack download)
 *  - Move  HTTRACK SCRIPT/public/reorg/<domain>  →  sites/<domain>
 *
 * Returns an array of status message strings (for SSE).
 */
function postMigrationCleanup(domain) {
  const messages = [];
  const publicSiteDir = path.join(HTTRACK_DIR, 'public', domain);
  const reorgSiteDir  = path.join(HTTRACK_DIR, 'public', 'reorg', domain);
  const targetSiteDir = path.join(SITES_BASE_DIR, domain);

  // 1. Remove raw download folder
  if (fs.existsSync(publicSiteDir)) {
    messages.push(`🗑️  Removing intermediate download folder: public/${domain}`);
    fs.rmSync(publicSiteDir, { recursive: true, force: true });
    messages.push(`✅ Removed public/${domain}`);
  }

  // 2. Move reorg folder to sites/
  if (fs.existsSync(reorgSiteDir)) {
    messages.push(`📦 Moving public/reorg/${domain} → sites/${domain}`);

    // Remove any existing version in sites/
    if (fs.existsSync(targetSiteDir)) {
      fs.rmSync(targetSiteDir, { recursive: true, force: true });
    }

    // Ensure sites/ directory exists
    fs.mkdirSync(SITES_BASE_DIR, { recursive: true });

    fs.renameSync(reorgSiteDir, targetSiteDir);
    messages.push(`✅ Site is now available at sites/${domain}`);
  } else {
    messages.push(`⚠️  No reorg folder found at public/reorg/${domain} — skipping move`);
  }

  return messages;
}

/**
 * Sanitise a URL/domain string.
 * Strips protocol, trailing slashes, and validates characters.
 */
function parseDomain(input) {
  if (!input) return null;
  let domain = input.trim();
  domain = domain.replace(/^https?:\/\//i, '');
  domain = domain.replace(/\/.*$/, '');
  if (!/^[a-zA-Z0-9.\-_]+$/.test(domain)) return null;
  return domain;
}

/**
 * GET /api/httrack/run?url=<url>
 * SSE endpoint: writes the hostname to sites.txt then streams
 * stdout/stderr from run_full_migration.sh back to the client.
 */
router.get('/run', (req, res) => {
  const rawUrl = req.query.url;

  if (!rawUrl) {
    return res.status(400).json({ error: 'url query param required' });
  }

  // Validate URL format
  let normalized = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  try {
    new URL(normalized);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const domain = parseDomain(rawUrl);
  if (!domain) {
    return res.status(400).json({ error: 'Invalid domain' });
  }

  // Write domain to sites.txt
  try {
    fs.writeFileSync(SITES_TXT, domain + '\n', 'utf-8');
  } catch (err) {
    return res.status(500).json({ error: `Failed to write sites.txt: ${err.message}` });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  send('info', `Starting migration for: ${domain}`);
  send('info', `sites.txt updated with: ${domain}`);

  // Spawn the migration script
  const proc = spawn('bash', ['run_full_migration.sh', domain], {
    cwd: HTTRACK_DIR,
  });

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) send('stdout', line);
    }
  });

  proc.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) send('stderr', line);
    }
  });

  proc.on('close', (code) => {
    if (code === 0) {
      send('info', `✅ Migration script completed (exit code ${code})`);

      // Post-migration: delete raw download folder, move reorg → sites/
      send('info', '🔄 Running post-migration cleanup…');
      try {
        const cleanupMsgs = postMigrationCleanup(domain);
        for (const msg of cleanupMsgs) send('info', msg);
        send('done', `✅ Done — site available at sites/${domain}`);
      } catch (cleanupErr) {
        send('stderr', `⚠️  Cleanup warning: ${cleanupErr.message}`);
        send('done', `✅ Migration finished (cleanup had warnings)`);
      }
    } else {
      send('done', `⚠️  Process exited with code ${code}`);
    }
    res.end();
  });

  proc.on('error', (err) => {
    send('error', `Failed to start process: ${err.message}`);
    res.end();
  });

  // Kill child process if client disconnects
  req.on('close', () => {
    proc.kill('SIGTERM');
  });
});

export default router;

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLOWED_EXTS = new Set(['.html', '.htm']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.system_generated', 'dist', 'build', '.venv']);

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    contentType: 'application/json; charset=utf-8',
    status,
  });
}

function expandInputPath(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return '';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  if (trimmed.startsWith('file://')) {
    return fileURLToPath(trimmed);
  }
  return trimmed;
}

function normalizeForCompare(p) {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function buildAllowedRoots(workspaceUris = []) {
  const roots = [];
  const addRoot = (dir) => {
    if (!dir || typeof dir !== 'string') return;
    const resolved = path.resolve(dir);
    roots.push(normalizeForCompare(resolved));
    try {
      if (fs.existsSync(resolved)) {
        roots.push(normalizeForCompare(fs.realpathSync(resolved)));
      }
    } catch {
      // ignore unresolvable root
    }
  };

  addRoot(os.homedir());
  addRoot(os.tmpdir());
  for (const uri of workspaceUris) {
    if (typeof uri === 'string' && uri.startsWith('file://')) {
      try {
        addRoot(fileURLToPath(uri));
      } catch {
        // ignore malformed URI
      }
    }
  }
  return Array.from(new Set(roots));
}

function isWithinAllowedRoots(targetPath, roots) {
  let candidate = normalizeForCompare(targetPath);
  try {
    if (fs.existsSync(targetPath)) {
      candidate = normalizeForCompare(fs.realpathSync(targetPath));
    }
  } catch {
    return false;
  }
  return roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
}

function scanHtmlFiles(dir, maxDepth = 3, maxFiles = 30) {
  const results = [];
  if (!dir || !fs.existsSync(dir)) return results;

  function walk(current, depth) {
    if (depth > maxDepth || results.length >= maxFiles * 2) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && ALLOWED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            filePath: fullPath,
            fileName: entry.name,
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // ignore unreadable stat
        }
      }
    }
  }

  walk(dir, 0);
  return results;
}

const app = new SidecarApp();

app.page('/', () => {
  const html = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf-8');
  return new Response(html, { contentType: 'text/html; charset=utf-8' });
});

app.api('/api/open', (data = {}) => {
  try {
    const rawFile = expandInputPath(data.file);
    if (!rawFile) {
      return jsonError(400, '请提供 HTML 文件路径。');
    }

    const targetPath = path.resolve(rawFile);
    const ext = path.extname(targetPath).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return jsonError(400, `仅支持 .html / .htm 文件（当前为 "${ext || '无扩展名'}"）。`);
    }

    const workspaceUris = Array.isArray(data.workspaceUris) ? data.workspaceUris : [];
    const roots = buildAllowedRoots(workspaceUris);
    if (!isWithinAllowedRoots(targetPath, roots)) {
      return jsonError(403, '安全限制：仅允许打开用户主目录、工作区或临时目录内的 HTML 文件。');
    }

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      return jsonError(404, `找不到文件：${targetPath}`);
    }

    const stat = fs.statSync(targetPath);
    const content = fs.readFileSync(targetPath, 'utf-8');
    return {
      filePath: targetPath,
      fileName: path.basename(targetPath),
      content,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch (err) {
    return jsonError(500, err.message || '读取文件失败');
  }
}, 'POST');

app.api('/api/list', (data = {}) => {
  const seen = new Set();
  const files = [];
  const pushAll = (items, source) => {
    for (const item of items) {
      const key = normalizeForCompare(item.filePath);
      if (seen.has(key)) continue;
      seen.add(key);
      files.push({ ...item, source });
    }
  };

  const convId = process.env.ANTIGRAVITY_CONVERSATION_ID;
  if (convId) {
    const appData = process.env.ANTIGRAVITY_APP_DATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
    const artifactDir = path.join(appData, 'brain', convId);
    pushAll(scanHtmlFiles(artifactDir, 2, 20), 'Artifact');
  }

  const workspaceUris = Array.isArray(data.workspaceUris) ? data.workspaceUris : [];
  for (const uri of workspaceUris) {
    if (typeof uri === 'string' && uri.startsWith('file://')) {
      try {
        pushAll(scanHtmlFiles(fileURLToPath(uri), 3, 30), '工作区');
      } catch {
        // ignore invalid uri
      }
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { files: files.slice(0, 30) };
}, 'POST');

app.run();

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.RENDER_PORT || 8787);
const PUBLIC_RENDER_BASE_URL = String(process.env.PUBLIC_RENDER_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');

function publicUrl(pathname) {
  return `${PUBLIC_RENDER_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `Render process exited with ${code}`));
      }
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'remotion-render-server' });
      return;
    }

    if (req.method === 'POST' && req.url === '/render') {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const seedId = payload.seedId || 'seed-717-live';
      const outputName = `${seedId}-${Date.now()}.mp4`;
      const outputPath = path.join(root, 'outputs', outputName);
      const dataPath = path.join(root, 'src', 'remotion', 'render-data.json');

      await mkdir(path.join(root, 'outputs'), { recursive: true });
      await writeFile(dataPath, JSON.stringify(payload, null, 2), 'utf8');

      await run('pnpm', [
        'exec',
        'remotion',
        'render',
        'src/remotion/index.jsx',
        'SeedVideo',
        outputPath,
        '--overwrite',
      ]);

      sendJson(res, 200, {
        ok: true,
        outputName,
        downloadUrl: publicUrl(`/outputs/${outputName}`),
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/outputs/')) {
      const requestUrl = new URL(req.url, PUBLIC_RENDER_BASE_URL);
      const fileName = decodeURIComponent(requestUrl.pathname.replace('/outputs/', ''));
      const filePath = path.join(root, 'outputs', fileName);
      if (!existsSync(filePath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const shouldDownload = requestUrl.searchParams.get('download') === '1';
      const file = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `${shouldDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(file);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Remotion render server listening on http://0.0.0.0:${PORT}`);
});

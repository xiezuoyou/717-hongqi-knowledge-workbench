import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function text(file) {
  return readFile(path.join(root, file), 'utf8');
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: missing "${needle}"`);
  }
}

function assertNoMissingJsxImports(source, file) {
  const jsxTags = [...source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((match) => match[1]);
  const namedImports = [...source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'[^']+';/g)]
    .flatMap((match) => match[1].split(','))
    .map((item) => item.trim().split(/\s+as\s+/).pop())
    .filter(Boolean);
  const defaultImports = [
    ...source.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from/g),
    ...source.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s*,/g),
  ].map((match) => match[1]);
  const constDeclarations = [...source.matchAll(/const\s+([A-Z][A-Za-z0-9_]*)\s*=/g)].map((match) => match[1]);
  const functionComponents = [...source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)].map((match) => match[1]);
  const known = new Set([...namedImports, ...defaultImports, ...constDeclarations, ...functionComponents]);
  const missing = [...new Set(jsxTags)].filter((tag) => !known.has(tag));

  if (missing.length) {
    throw new Error(`${file}: missing JSX imports or declarations: ${missing.join(', ')}`);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
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
        reject(new Error(stderr || stdout || `${command} exited with ${code}`));
      }
    });
  });
}

const main = await text('src/main.jsx');
const aiServer = await text('scripts/ai-server.mjs');
const seedVideo = await text('src/remotion/SeedVideo.jsx');
const rootFile = await text('src/remotion/Root.jsx');

[
  ['src/main.jsx', main, 'const workflowNodeTypes = ['],
  ['src/main.jsx', main, "type: 'tts'"],
  ['src/main.jsx', main, "fetch(`http://127.0.0.1:8790/ai/${endpoint}`"],
  ['src/main.jsx', main, "fetch('http://127.0.0.1:8790/ai/process-images'"],
  ['src/main.jsx', main, 'workflow-studio'],
  ['src/main.jsx', main, 'workflow-project-bar'],
  ['src/main.jsx', main, 'workflowNodeTypes.map'],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/package-video'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/check-material-support'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/check-grammar'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/text-production'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/script-split'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/material-package'"],
  ['scripts/ai-server.mjs', aiServer, 'async function createMaterialPackageFiles'],
  ['scripts/ai-server.mjs', aiServer, 'packageDir'],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/tts/voice-package'"],
  ['src/remotion/SeedVideo.jsx', seedVideo, 'Video,'],
  ['src/remotion/SeedVideo.jsx', seedVideo, 'materialPlan'],
  ['src/remotion/SeedVideo.jsx', seedVideo, 'activeTransform.fit'],
  ['src/remotion/SeedVideo.jsx', seedVideo, 'activeTransform.scale'],
  ['src/remotion/SeedVideo.jsx', seedVideo, 'activeSourceStart'],
  ['src/remotion/Root.jsx', rootFile, 'function getCompositionSize()'],
  ['src/remotion/Root.jsx', rootFile, "ratio === '9:16'"],
  ['src/remotion/Root.jsx', rootFile, "ratio === '4:3'"],
].forEach(([file, source, needle]) => assertIncludes(source, needle, file));

assertNoMissingJsxImports(main, 'src/main.jsx');

await run('pnpm', ['build']);
await run('pnpm', ['exec', 'remotion', 'compositions', 'src/remotion/index.jsx']);

console.log('Regression check passed: core AI, TTS, timeline, material transform, package, and render hooks are present.');

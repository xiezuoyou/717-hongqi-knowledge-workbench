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
  const defaultImports = [...source.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from/g)].map((match) => match[1]);
  const functionComponents = [...source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)].map((match) => match[1]);
  const known = new Set([...namedImports, ...defaultImports, ...functionComponents]);
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
  ['src/main.jsx', main, "const voiceAuditionText = '欢迎使用红旗内容裂变平台'"],
  ['src/main.jsx', main, "postAi('/ai/generate-script'"],
  ['src/main.jsx', main, "postAi('/ai/check-material-support'"],
  ['src/main.jsx', main, "postAi('/ai/check-grammar'"],
  ['src/main.jsx', main, "postAi('/ai/refine-line'"],
  ['src/main.jsx', main, "postAi('/ai/refine-script'"],
  ['src/main.jsx', main, "postAi('/ai/package-video'"],
  ['src/main.jsx', main, 'workflowProject'],
  ['src/main.jsx', main, 'materialPlan: plan'],
  ['src/main.jsx', main, '生成中...'],
  ['src/main.jsx', main, 'onBlur={(event) => checkScriptLine(index, event.target.value)}'],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/package-video'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/check-material-support'"],
  ['scripts/ai-server.mjs', aiServer, "req.url === '/ai/check-grammar'"],
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

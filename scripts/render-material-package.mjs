import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import materialData from '../src/remotion/material-data.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'outputs', 'seed-a-material-package', '素材包');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

for (const clip of materialData.clips) {
  const groupDir = path.join(outputRoot, clip.group);
  await mkdir(groupDir, { recursive: true });
  await run('pnpm', [
    'exec',
    'remotion',
    'render',
    'src/remotion/index.jsx',
    clip.id,
    path.join(groupDir, `${clip.name}.mp4`),
    '--overwrite',
    '--concurrency=3',
  ]);
}

console.log(`Material package rendered: ${outputRoot}`);

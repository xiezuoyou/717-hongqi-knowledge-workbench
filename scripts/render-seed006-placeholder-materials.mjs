import { readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const materialRoot = path.join(root, '素材库', '种子内容', 'seed-006-717粉丝盛典现场打卡探场', '素材包');
const dataFile = path.join(root, 'src', 'remotion', 'placeholder-material-data.json');

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

async function listLeafMaterialFolders() {
  const segments = await readdir(materialRoot, { withFileTypes: true });
  const clips = [];
  let index = 1;
  for (const segmentEntry of segments.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))) {
    const segmentPath = path.join(materialRoot, segmentEntry.name);
    const details = await readdir(segmentPath, { withFileTypes: true });
    for (const detailEntry of details.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))) {
      clips.push({
        id: `Seed006Placeholder${String(index).padStart(2, '0')}`,
        segment: segmentEntry.name,
        detail: detailEntry.name,
        folder: path.join(segmentPath, detailEntry.name),
        duration: 3,
      });
      index += 1;
    }
  }
  return clips;
}

const clips = await listLeafMaterialFolders();
await writeFile(dataFile, `${JSON.stringify({ clips }, null, 2)}\n`);

for (const clip of clips) {
  await run('pnpm', [
    'exec',
    'remotion',
    'render',
    'src/remotion/index.jsx',
    clip.id,
    path.join(clip.folder, '占位素材.mp4'),
    '--overwrite',
    '--concurrency=3',
  ]);
}

console.log(`Rendered ${clips.length} placeholder material videos.`);

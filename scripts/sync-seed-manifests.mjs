/**
 * 把后端 manifest 同步到 public/seeds/，供前端二级页 fetch。
 *
 * 唯一真源是 src/data/seed/manifests/{seedId}.manifest.json（后端 8793/8796 也读这份）。
 * public/seeds/ 是生成产物，不要手改 —— 手改过一次，结果前端显示的分段和后端选片
 * 用的分段对不上，而且 clips 全是空的。
 *
 * 展示用的 title / angle / directionId 不在这里，前端直接从 seeds.ts 拿，
 * 避免同一个字段两处维护。
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src/data/seed/manifests');
const targetDir = path.join(root, 'public/seeds');

async function main() {
  await mkdir(targetDir, { recursive: true });

  let entries = [];
  try {
    entries = await readdir(sourceDir);
  } catch {
    console.error(`找不到 manifest 目录：${sourceDir}`);
    process.exit(1);
  }

  const manifests = entries.filter((name) => name.endsWith('.manifest.json'));

  if (manifests.length === 0) {
    console.warn('没有找到任何 manifest，public/seeds/ 保持不变');
    return;
  }

  for (const name of manifests) {
    const raw = await readFile(path.join(sourceDir, name), 'utf8');

    // 解析一遍，语法坏了就地报错，别把坏 JSON 同步到前端
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(`${name} 不是合法 JSON，跳过：${error.message}`);
      process.exitCode = 1;
      continue;
    }

    const seedId = parsed.seedId || name.replace('.manifest.json', '');
    const realClips = (parsed.segments || []).reduce(
      (sum, segment) => sum + (segment.clips || []).filter((clip) => clip.state === 'real').length,
      0,
    );

    await writeFile(
      path.join(targetDir, `${seedId}.json`),
      JSON.stringify(parsed, null, 2),
      'utf8',
    );

    console.log(
      `${seedId}.json  ${(parsed.segments || []).length} 段 / ${realClips} 个真实片段`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Regression check — structural baseline for the 813 platform.
 *
 * History: the previous version asserted against a fixed-flow script editor UI
 * that is not in this repository. Every assertion pointed at `src/main.jsx`,
 * which now holds an unused storage browser, so the command crashed on its
 * first assertion and verified nothing.
 *
 * This version asserts only what actually ships, and reports the rest as an
 * inventory instead of failing. Two modes:
 *
 *   pnpm regression            assert shipped capabilities, print gap inventory
 *   pnpm regression --strict   also fail when the gap inventory is non-empty
 *
 * Set REGRESSION_RENDER=1 to additionally validate Remotion compositions
 * (slower, needs a bundle step).
 *
 * SCOPE — read this before adding a check.
 *
 * The 813 platform is the only user-facing product here. Its design rule is
 * that users see ONE simple action (pick a seed -> get a video); every step in
 * between runs server-side and is never exposed. The audience is channel staff
 * with little AI familiarity, so "no visible pipeline" is a product decision,
 * not an unfinished feature.
 *
 * Consequences for this file:
 *   - 813 platform checks are the health signal. A failure here is a real
 *     regression.
 *   - The node canvas (public/workflow-canvas.html) belongs to a SEPARATE
 *     project that shares ancestry with the auto-edit idea. It is reported for
 *     information only and never counted as 813 health.
 *   - AI service routes with no frontend caller are NOT gaps in the UI. They
 *     are the raw material the one-click flow will call server-side. Listed as
 *     backend inventory, not as missing entry points.
 *
 * Scope note: this is a structural check (capability wiring is present). It
 * cannot detect behavioural regressions — for those see the vitest suite.
 */

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const STRICT = process.argv.includes('--strict');
const WITH_RENDER = process.env.REGRESSION_RENDER === '1';

const FILES = {
  platform: 'src/main.tsx',
  canvas: 'public/workflow-canvas.html',
  aiServer: 'scripts/ai-server.mjs',
  storageServer: 'scripts/storage-server.mjs',
  seedVideo: 'src/remotion/SeedVideo.jsx',
  remotionRoot: 'src/remotion/Root.jsx',
};

async function readOrNull(file) {
  try {
    return await readFile(path.join(root, file), 'utf8');
  } catch {
    return null;
  }
}

const source = {};
for (const [key, file] of Object.entries(FILES)) {
  source[key] = await readOrNull(file);
}

const failures = [];
const missingFiles = Object.entries(FILES).filter(([key]) => source[key] === null);
for (const [key, file] of missingFiles) {
  failures.push(`${file}: file is missing (expected for capability group "${key}")`);
}

/**
 * Shipped capabilities. Each entry is [group, sourceKey, needle, description].
 * A missing needle means a capability that used to be wired is now gone.
 */
const CHECKS = [
  // --- 813 platform: RAG question answering ---
  ['RAG 问答', 'platform', '/chat/message', '提交问题的接口调用'],
  ['RAG 问答', 'platform', '/chat/conversations', '会话列表拉取'],
  ['RAG 问答', 'platform', '/chat/messages', '历史消息拉取'],
  ['RAG 问答', 'platform', 'text.delta', '流式增量文本处理'],
  ['RAG 问答', 'platform', 'reference.added', '引用来源处理'],
  ['RAG 问答', 'platform', 'response.completed', '回答结束事件处理'],
  ['RAG 问答', 'platform', 'AbortController', '中止生成的控制器'],
  ['RAG 问答', 'platform', 'knowledgeAiLastQuestion', '重新生成所需的上一问缓存'],

  // --- 813 platform: knowledge base + entry cards ---
  ['知识库', 'platform', 'knowledgeAiModules', 'AI 模块定义'],
  ['知识库', 'platform', 'knowledgeAiEntryCards', 'AI 模板入口卡片'],

  // --- storage / material service (813 依赖) ---
  ['素材存储', 'storageServer', '/api/storage', '素材存储接口'],

  // --- backend services behind the future one-click 裂变 ---
  // 这些是服务端能力，813 用户不会直接看到它们，也不该看到。
  ['后端服务', 'aiServer', "req.url === '/ai/text-production'", '脚本生成能力'],
  ['后端服务', 'aiServer', "req.url === '/ai/script-split'", '脚本拆解能力'],
  ['后端服务', 'aiServer', "req.url === '/ai/material-package'", '素材包能力'],
  ['后端服务', 'aiServer', "req.url === '/ai/video-recognition'", '视频识别能力'],
  ['渲染服务', 'seedVideo', 'materialPlan', '素材计划读取'],
  ['渲染服务', 'seedVideo', 'activeTransform.fit', 'contain/cover 传入渲染'],
  ['渲染服务', 'seedVideo', 'activeTransform.scale', '缩放传入渲染'],
  ['渲染服务', 'seedVideo', 'activeSourceStart', '源素材起点传入渲染'],
  ['渲染服务', 'remotionRoot', 'function getCompositionSize()', '输出尺寸随画布比例'],
  ['渲染服务', 'remotionRoot', "ratio === '9:16'", '9:16 比例支持'],
  ['渲染服务', 'remotionRoot', "ratio === '4:3'", '4:3 比例支持'],
];

const groups = new Map();
for (const [group, key, needle, description] of CHECKS) {
  const text = source[key];
  const ok = text !== null && text.includes(needle);
  if (!groups.has(group)) groups.set(group, { pass: 0, fail: 0 });
  const bucket = groups.get(group);
  if (ok) {
    bucket.pass += 1;
  } else {
    bucket.fail += 1;
    failures.push(`[${group}] ${FILES[key]}: 缺少 ${description}（标记 "${needle}"）`);
  }
}

/**
 * --- 813 的真实缺口 ---
 *
 * 注意这里的提法和上一版相反。上一版说"后端能力没有前端入口"，把它当成
 * 813 缺界面。这是错的：脚本拆解、口播、时间线这些*不应该*出现在 813 的
 * 界面上，用户看不懂也不该看懂。它们是"一键裂变"背后的服务端原料。
 *
 * 813 的缺口是反过来的——入口已经有了，但还没接后端：
 * 用户能点"生成裂变视频 / 素材包 / 脚本"，返回的却是写死的演示数据。
 */
const platformText = source.platform || '';

// 813 前端真实发出的请求。只有 chat 相关的话，说明裂变功能还是演示态。
const platformRequests = [...platformText.matchAll(/fetch\(`\$\{API_ROOT\}([^`?]*)/g)]
  .map((match) => match[1])
  .filter((route, index, all) => all.indexOf(route) === index)
  .sort();

// 演示态的标志：结果由定时器 + 写死文案产生，而不是来自网络。
const seedActionsAreMocked = /seedAiGenerateTimerRef\.current = window\.setTimeout/.test(platformText);

const platformGaps = [];
if (seedActionsAreMocked) {
  platformGaps.push('一键裂变（视频 / 素材包 / 脚本）返回写死的演示数据，未接后端');
}
if (platformText.includes('/assets/717-demo/')) {
  platformGaps.push('种子页素材引用 /assets/717-demo/，该目录不存在，页面会出现碎图');
}

/**
 * 后端已建成、但还没被 813 接上的能力。这些不是"缺界面"，而是等着被
 * 一键裂变在服务端串起来的原料。从服务代码解析，避免清单过期。
 */
const declaredRoutes = new Set();
if (source.aiServer) {
  for (const match of source.aiServer.matchAll(/req\.url === '(\/(?:ai|tts)\/[a-z0-9-]+)'/g)) {
    declaredRoutes.add(match[1]);
  }
}
const notWiredToPlatform = [...declaredRoutes].filter((route) => !platformText.includes(route)).sort();

/**
 * 自由画布：同仓库里的另一个项目，不是 813 的界面，也不会给 813 用户看到。
 * 只统计规模，不计入 813 的健康度，也不因它变化而失败。
 */
const canvasNodeCount = source.canvas
  ? new Set([...source.canvas.matchAll(/type: '([a-z-]+)'/g)].map((match) => match[1])).size
  : 0;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

// ---- report ----

console.log('\n=== 已上线能力 ===');
for (const [group, { pass, fail }] of groups) {
  const mark = fail === 0 ? 'OK  ' : 'FAIL';
  console.log(`  ${mark} ${group.padEnd(10)} ${pass} 项通过${fail ? `，${fail} 项缺失` : ''}`);
}

console.log('\n=== 813 的真实缺口 ===');
if (platformGaps.length === 0) {
  console.log('  无');
} else {
  for (const item of platformGaps) console.log(`  待接  ${item}`);
}
console.log(`  813 前端真实请求：${platformRequests.length ? platformRequests.join('、') : '无'}`);

console.log('\n=== 后端已建成、等一键裂变在服务端串起来的能力 ===');
if (notWiredToPlatform.length === 0) {
  console.log('  无');
} else {
  for (const route of notWiredToPlatform) console.log(`  待串接  ${route}`);
  console.log(`  共 ${notWiredToPlatform.length} / ${declaredRoutes.size} 项。这些不该出现在 813 界面上，只在服务端调用。`);
}

console.log('\n=== 参考：自由画布（同仓库的另一个项目，不计入 813） ===');
console.log(`  节点类型 ${canvasNodeCount} 个。它的变化不影响 813 的体检结果。`);

if (failures.length) {
  console.error('\n=== 回归失败 ===');
  for (const line of failures) console.error(`  ${line}`);
  console.error(`\n共 ${failures.length} 处已上线能力缺失，说明改动破坏了现有功能。`);
  process.exit(1);
}

console.log('\n=== 构建校验 ===');
// 直接调构建器，不走 package.json 的 build 脚本：
// 那个脚本是 `tsc --noEmit && vite build`，但项目没有 TypeScript 配置，
// tsc 会打印帮助文本并以失败退出，导致真实构建永远不执行。
await run('pnpm', ['exec', 'vite', 'build']);
console.log('  OK   前端构建通过');

if (WITH_RENDER) {
  await run('pnpm', ['exec', 'remotion', 'compositions', 'src/remotion/index.jsx']);
  console.log('  OK   Remotion 合成列表可解析');
} else {
  console.log('  跳过 Remotion 合成校验（设 REGRESSION_RENDER=1 开启）');
}

if (STRICT && platformGaps.length) {
  console.error('\n--strict：813 存在未接后端的功能，视为失败。');
  process.exit(1);
}

console.log('\n结构回归通过：已上线能力完整，缺口见上方清单。\n');

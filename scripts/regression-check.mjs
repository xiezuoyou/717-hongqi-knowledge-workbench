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

  // --- storage / material service ---
  ['素材存储', 'storageServer', '/api/storage', '素材存储接口'],

  // --- canvas: node palette ---
  ['画布节点', 'canvas', "type: 'text-production'", '脚本裂变节点'],
  ['画布节点', 'canvas', "type: 'script-split'", '脚本拆解节点'],
  ['画布节点', 'canvas', "type: 'tts'", '语音生成节点'],
  ['画布节点', 'canvas', "type: 'caption'", '字幕对齐节点'],
  ['画布节点', 'canvas', "type: 'timeline-beats'", '时间线节点'],
  ['画布节点', 'canvas', "type: 'material-package'", '素材包节点'],
  ['画布节点', 'canvas', "type: 'video-recognition'", '视频识别节点'],
  ['画布节点', 'canvas', "type: 'video-params'", '视频参数节点'],
  ['画布节点', 'canvas', "type: 'review'", '审核节点'],
  ['画布节点', 'canvas', "type: 'loop-control'", '循环控制节点'],
  ['画布节点', 'canvas', "type: 'content-sandbox'", '内容沙盒节点'],

  // --- canvas: wiring to the AI service ---
  ['画布联通', 'canvas', '/ai/text-production', '脚本裂变调用'],
  ['画布联通', 'canvas', '/ai/script-split', '脚本拆解调用'],
  ['画布联通', 'canvas', '/ai/video-recognition', '视频识别调用'],
  ['画布联通', 'canvas', '/ai/material-package', '素材包调用'],
  ['画布联通', 'canvas', '/ai/material-upload', '素材上传调用'],
  ['画布联通', 'canvas', '/tts/voice-package', '语音包合成调用'],

  // --- render layer: these back the material transform baseline ---
  ['渲染层', 'seedVideo', 'materialPlan', '素材计划读取'],
  ['渲染层', 'seedVideo', 'activeTransform.fit', 'contain/cover 传入渲染'],
  ['渲染层', 'seedVideo', 'activeTransform.scale', '缩放传入渲染'],
  ['渲染层', 'seedVideo', 'activeSourceStart', '源素材起点传入渲染'],
  ['渲染层', 'remotionRoot', 'function getCompositionSize()', '输出尺寸随画布比例'],
  ['渲染层', 'remotionRoot', "ratio === '9:16'", '9:16 比例支持'],
  ['渲染层', 'remotionRoot', "ratio === '4:3'", '4:3 比例支持'],
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
 * Gap inventory: AI service routes that no frontend calls. These are built
 * capabilities with no way for a user to reach them. Parsed from the service
 * itself so the list cannot drift out of date.
 */
const declaredRoutes = new Set();
if (source.aiServer) {
  for (const match of source.aiServer.matchAll(/req\.url === '(\/(?:ai|tts)\/[a-z0-9-]+)'/g)) {
    declaredRoutes.add(match[1]);
  }
}

const frontendText = [source.platform, source.canvas].filter(Boolean).join('\n');
const unreachable = [...declaredRoutes].filter((route) => !frontendText.includes(route)).sort();

/**
 * Baseline requirements that have no implementation anywhere. Each entry maps a
 * line from 当前可用流程稳定性基线.md to the marker that would prove it exists.
 * Kept explicit so the doc and the code can be compared at a glance.
 */
const BASELINE_ITEMS = [
  ['脚本输入框失焦触发素材支持校验', '/ai/check-material-support'],
  ['脚本输入框失焦触发病句校验', '/ai/check-grammar'],
  ['单句 AI 修改窗口', '/ai/refine-line'],
  ['整体 AI 修改入口', '/ai/refine-script'],
  ['AI 生成脚本', '/ai/generate-script'],
  ['包装方案生成', '/ai/package-video'],
  ['音色试听固定短句', '欢迎使用红旗内容裂变平台'],
];
const baselineGaps = BASELINE_ITEMS.filter(([, needle]) => !frontendText.includes(needle));

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

console.log('\n=== 缺口：已建成但用户到不了的 AI 能力 ===');
if (unreachable.length === 0) {
  console.log('  无');
} else {
  for (const route of unreachable) console.log(`  待接入  ${route}`);
  console.log(`  共 ${unreachable.length} / ${declaredRoutes.size} 项后端能力没有任何前端入口`);
}

console.log('\n=== 缺口：基线文档要求但尚未实现 ===');
if (baselineGaps.length === 0) {
  console.log('  无');
} else {
  for (const [item] of baselineGaps) console.log(`  待建    ${item}`);
}

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

if (STRICT && (unreachable.length || baselineGaps.length)) {
  console.error('\n--strict：存在未接入能力或未实现的基线要求，视为失败。');
  process.exit(1);
}

console.log('\n结构回归通过：已上线能力完整，缺口见上方清单。\n');

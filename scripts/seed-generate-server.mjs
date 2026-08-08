import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

await loadEnv();

const PORT = Number(process.env.SEED_GENERATE_PORT || 8794);
const MIMO_API_KEY = process.env.MIMO_API_KEY;
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5-pro';

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
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function loadDirection(directionId) {
  const directionsPath = path.join(root, 'src/data/seed/directions.ts');
  const content = await readFile(directionsPath, 'utf8');

  // 简单解析 TS 文件获取 directions 数组
  const match = content.match(/export const directions[^=]*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('无法解析 directions.ts');
  }

  // 用 eval 解析（生产环境应该用 AST 解析）
  const directionsCode = `[${match[1]}]`;
  const directions = eval(directionsCode);

  const direction = directions.find(d => d.id === directionId);
  if (!direction) {
    throw new Error(`未找到内容方向：${directionId}`);
  }

  return direction;
}

async function callMimo(messages) {
  if (!MIMO_API_KEY) {
    throw new Error('缺少 MIMO_API_KEY');
  }

  const response = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MIMO_API_KEY,
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: MIMO_MODEL,
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`MiMo 返回非 JSON：${raw.slice(0, 180)}`);
  }

  if (!response.ok) {
    const message = result?.error?.message || result?.message || raw || `HTTP ${response.status}`;
    throw new Error(`MiMo 调用失败：${message}`);
  }

  const content = result?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('MiMo 返回为空');
  }

  return JSON.parse(content.trim());
}

function buildGeneratePrompt(direction) {
  return [
    {
      role: 'system',
      content: [
        '你是 813 种子内容规划 Agent。',
        '你的任务是根据内容方向，生成一份完整的种子内容规划。',
        '种子内容是给摄影师的拍摄指南，拍完后供各端口使用者裂变。',
        '逻辑线段数不固定，根据内容表达需求决定（3-6段都可以）。',
        '每段要明确：要拍什么画面、目的是什么、建议时长。',
        '只返回 JSON，不要 markdown 包装。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于以下内容方向，生成种子内容规划：',
        '',
        `方向名称：${direction.label}`,
        `核心理念：${direction.summary}`,
        `为什么现在合适：${direction.whyNow}`,
        `怎么做：${direction.howTo}`,
        `适用形式：${direction.formats.join('、')}`,
        `禁止事项：${direction.guardrails.join('、')}`,
        '',
        '活动背景：813 粉丝盛典（8月13日），红旗品牌粉丝聚会，有舞台表演、互动体验、品牌共创。',
        '',
        '返回格式：',
        '{',
        '  "title": "种子内容标题",',
        '  "angle": "这个种子的切入角度（一句话）",',
        '  "segments": [',
        '    {',
        '      "label": "段落名称（如：开场钩子）",',
        '      "purpose": "这段的传播作用",',
        '      "targetDurationSeconds": 3,',
        '      "shootingGuide": {',
        '        "subjects": ["要拍的画面主体1", "画面主体2"],',
        '        "requirements": ["画面要求1", "画面要求2"],',
        '        "suggestedClipCount": "3-5"',
        '      }',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    },
  ];
}

async function generateSeedContent(directionId) {
  console.log(`[seed/generate] 开始生成种子内容，directionId=${directionId}`);

  // 1. 读取内容方向
  const direction = await loadDirection(directionId);

  // 2. 调用 MiMo 生成规划
  const plan = await callMimo(buildGeneratePrompt(direction));

  // 3. 生成 seedId
  const timestamp = Date.now();
  const seedId = `seed-${String(timestamp).slice(-3)}`;

  // 4. 构建 manifest
  const manifest = {
    seedId,
    version: 1,
    directionId,
    title: plan.title,
    angle: plan.angle,
    status: 'planning',
    createdAt: new Date().toISOString(),
    format: {
      aspectRatio: '9:16',
      targetDurationSeconds: plan.segments.reduce((sum, seg) => sum + seg.targetDurationSeconds, 0),
      durationToleranceSeconds: 5,
    },
    productionRules: [
      '裂变成片不出现真人主持或出镜口播',
      '原片中的真人只作为参考，不作为后续裂变必须复用的视觉主体',
      '素材包只放实拍素材，字幕、贴纸、转场、尾板、关注引导画面属于后期 AI/Remotion 制作',
      '目标比例 9:16 竖屏',
    ],
    segments: plan.segments.map((seg, index) => ({
      id: `seg-${index + 1}`,
      order: index + 1,
      label: seg.label,
      purpose: seg.purpose,
      required: true,
      targetDurationSeconds: seg.targetDurationSeconds,
      shootingGuide: seg.shootingGuide,
      clips: [],
    })),
    gaps: [],
  };

  // 5. 创建文件结构
  const seedDir = path.join(root, '素材库/种子内容', `${seedId}-${plan.title}`);
  const materialDir = path.join(seedDir, '素材包');

  await mkdir(seedDir, { recursive: true });
  await mkdir(materialDir, { recursive: true });

  // 6. 写 manifest.json
  const manifestPath = path.join(seedDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // 7. 生成 README.md
  const readme = [
    `# ${plan.title}`,
    '',
    `**内容方向**：${direction.label}`,
    `**切入角度**：${plan.angle}`,
    `**状态**：规划中`,
    '',
    '## 逻辑线',
    '',
    ...plan.segments.map((seg, index) => [
      `### ${index + 1}. ${seg.label}（${seg.targetDurationSeconds}s）`,
      '',
      `**目的**：${seg.purpose}`,
      '',
      '**要拍的画面**：',
      ...seg.shootingGuide.subjects.map(s => `- ${s}`),
      '',
      '**画面要求**：',
      ...seg.shootingGuide.requirements.map(r => `- ${r}`),
      '',
      `**建议素材数量**：${seg.shootingGuide.suggestedClipCount} 个视频，裂变时随机选 1 个`,
      '',
    ].join('\n')),
    '## 拍摄说明',
    '',
    '1. 按照上述逻辑线顺序拍摄',
    '2. 每段拍摄多个角度/时刻的视频，放到对应文件夹',
    '3. 视频格式：MP4，9:16 竖屏，尽量稳定',
    '4. 拍摄完成后，在对应文件夹下创建 `素材说明.md`，描述每个视频的画面内容',
    '',
    '## 文件夹结构',
    '',
    '```',
    '素材包/',
    ...plan.segments.map((seg, index) =>
      `├── ${String(index + 1).padStart(2, '0')}_${seg.label}/`
    ),
    '```',
  ].join('\n');

  const readmePath = path.join(seedDir, 'README.md');
  await writeFile(readmePath, readme, 'utf8');

  // 8. 创建素材文件夹
  for (let i = 0; i < plan.segments.length; i++) {
    const seg = plan.segments[i];
    const segDir = path.join(materialDir, `${String(i + 1).padStart(2, '0')}_${seg.label}`);
    await mkdir(segDir, { recursive: true });

    // 在每个文件夹下创建素材说明模板
    const segGuide = [
      `# ${seg.label}`,
      '',
      `**目的**：${seg.purpose}`,
      `**时长**：${seg.targetDurationSeconds}s`,
      '',
      '## 要拍的画面',
      '',
      ...seg.shootingGuide.subjects.map(s => `- ${s}`),
      '',
      '## 画面要求',
      '',
      ...seg.shootingGuide.requirements.map(r => `- ${r}`),
      '',
      '## 已拍摄素材',
      '',
      '拍摄完成后，在下方列出每个视频文件及其画面描述：',
      '',
      '### 视频1：文件名.mp4',
      '画面描述：（填写画面内容、镜头角度、时长等）',
      '',
      '### 视频2：文件名.mp4',
      '画面描述：',
      '',
    ].join('\n');

    await writeFile(path.join(segDir, '素材说明.md'), segGuide, 'utf8');
  }

  console.log(`[seed/generate] 生成完成：${seedDir}`);

  return {
    seedId,
    title: plan.title,
    angle: plan.angle,
    directionId,
    segments: manifest.segments,
    files: {
      seedDir,
      manifestPath,
      readmePath,
      materialDir,
    },
  };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'seed-generate-server',
        hasKey: Boolean(MIMO_API_KEY),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/seed/generate') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const { directionId } = payload;

      if (!directionId) {
        throw new Error('缺少参数：directionId');
      }

      const result = await generateSeedContent(directionId);

      sendJson(res, 200, {
        ok: true,
        type: 'seed-generate-result',
        ...result,
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} error:`, error);
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Seed generate server listening on http://127.0.0.1:${PORT}`);
});

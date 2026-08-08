import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);

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

const PORT = Number(process.env.SEED_PACKAGE_PORT || 8793);
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

async function loadSeedManifest(seedId) {
  const manifestPath = path.join(root, 'src/data/seed/manifests', `${seedId}.manifest.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`种子 ${seedId} 的 manifest 文件不存在`);
  }
  const content = await readFile(manifestPath, 'utf8');
  return JSON.parse(content);
}

// 选片逻辑：按 priority (P0 > P1 > P2) 和 targetDurationSeconds 选够时长
function selectClips(manifest, targetDurationSeconds = null) {
  const target = targetDurationSeconds || manifest.format?.targetDurationSeconds || 25;
  const tolerance = manifest.format?.durationToleranceSeconds || 5;
  const minDuration = target - tolerance;
  const maxDuration = target + tolerance;

  const allClips = (manifest.segments || [])
    .filter(seg => seg.required !== false)
    .flatMap(seg => (seg.clips || []).map(clip => ({
      ...clip,
      segmentId: seg.id,
      segmentLabel: seg.label,
      segmentOrder: seg.order,
      segmentPurpose: seg.purpose,
      segmentTargetDuration: seg.targetDurationSeconds,
    })));

  // 按 priority 分组
  const priorityOrder = ['P0', 'P1', 'P2'];
  const clipsByPriority = {
    P0: allClips.filter(c => c.priority === 'P0' && c.state === 'real'),
    P1: allClips.filter(c => c.priority === 'P1' && c.state === 'real'),
    P2: allClips.filter(c => c.priority === 'P2' && c.state === 'real'),
  };

  const selected = [];
  let totalDuration = 0;

  // 先选 P0
  for (const clip of clipsByPriority.P0) {
    if (totalDuration >= maxDuration) break;
    selected.push(clip);
    totalDuration += clip.durationSeconds || 0;
  }

  // 如果不够，补 P1
  if (totalDuration < minDuration) {
    for (const clip of clipsByPriority.P1) {
      if (totalDuration >= maxDuration) break;
      selected.push(clip);
      totalDuration += clip.durationSeconds || 0;
    }
  }

  // 还不够，补 P2
  if (totalDuration < minDuration) {
    for (const clip of clipsByPriority.P2) {
      if (totalDuration >= maxDuration) break;
      selected.push(clip);
      totalDuration += clip.durationSeconds || 0;
    }
  }

  return {
    clips: selected,
    totalDuration,
    targetDuration: target,
    inRange: totalDuration >= minDuration && totalDuration <= maxDuration,
  };
}

// 调用 MiMo 生成文案
async function generateScript(seedId, manifest, selectedClips, userRequest) {
  if (!MIMO_API_KEY) {
    throw new Error('缺少 MIMO_API_KEY，无法生成文案');
  }

  const clipsSummary = selectedClips.map(clip => ({
    segment: clip.segmentLabel,
    subject: clip.subject,
    description: clip.description,
    proves: clip.proves,
    duration: clip.durationSeconds,
  }));

  const messages = [
    {
      role: 'system',
      content: [
        '你是 813 种子内容裂变的文案生成 Agent。',
        '你的任务是基于种子素材和用户诉求，生成一份结构化的视频文案脚本。',
        '脚本必须是 markdown 格式，包含：标题、分镜脚本（按素材段落组织）、素材使用说明。',
        '分镜脚本的每一段对应一个素材片段，写清楚：画面主体、口播文案、时长。',
        '口播文案要口语化、适合短视频、符合用户诉求。',
        '只返回 markdown 文本，不要 JSON 包装。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户诉求：${userRequest || '基于种子内容做一个短视频'}`,
        `种子内容：${manifest.seedId}`,
        `活动方向：${manifest.segments?.[0]?.purpose || ''}`,
        `已选素材（${selectedClips.length} 个片段，总时长 ${selectedClips.reduce((sum, c) => sum + (c.durationSeconds || 0), 0).toFixed(1)}s）：`,
        JSON.stringify(clipsSummary, null, 2),
        '',
        '请生成 markdown 格式的视频脚本，结构如下：',
        '# 视频标题',
        '## 分镜脚本',
        '### 1. 开场（3s）',
        '**画面**：红旗盛典拱门',
        '**口播**：欢迎回家，717 粉丝盛典现场...',
        '',
        '## 素材使用说明',
        '- 素材 1：节奏段1_入口开场/红旗盛典拱门/717-拱门.mp4（2.3s）',
        '- ...',
      ].join('\n'),
    },
  ];

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

  return content.trim();
}

// 打包成 zip
async function createPackage(seedId, manifest, selectedClips, scriptMarkdown) {
  const packageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputRoot = path.join(root, 'outputs', 'seed-packages');
  const packageDir = path.join(outputRoot, packageId);
  await mkdir(packageDir, { recursive: true });

  // 写文案
  const scriptPath = path.join(packageDir, 'script.md');
  await writeFile(scriptPath, scriptMarkdown, 'utf8');

  // 写素材清单
  const materialsListPath = path.join(packageDir, 'materials.json');
  await writeFile(materialsListPath, JSON.stringify({
    seedId,
    clips: selectedClips.map(clip => ({
      file: clip.file,
      subject: clip.subject,
      duration: clip.durationSeconds,
      segment: clip.segmentLabel,
    })),
  }, null, 2), 'utf8');

  // 复制素材文件到 package
  const materialsDir = path.join(packageDir, 'materials');
  await mkdir(materialsDir, { recursive: true });

  const packageRoot = path.join(root, manifest.packageRoot || '素材库/种子内容');
  for (const clip of selectedClips) {
    const sourcePath = path.join(packageRoot, clip.file);
    if (!existsSync(sourcePath)) {
      console.warn(`素材文件不存在，跳过：${clip.file}`);
      continue;
    }
    const fileName = path.basename(clip.file);
    const destPath = path.join(materialsDir, fileName);
    await execFileAsync('cp', [sourcePath, destPath]);
  }

  // 打包成 zip
  const zipName = `seed-package-${packageId}.zip`;
  const zipPath = path.join(outputRoot, zipName);
  await execFileAsync('zip', ['-qry', zipPath, packageId], {
    cwd: outputRoot,
  });

  return {
    packageId,
    packageDir,
    zipPath,
    zipUrl: `/outputs/seed-packages/${zipName}`,
    scriptPath,
    materialsDir,
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
        service: 'seed-package-server',
        hasKey: Boolean(MIMO_API_KEY),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/seed/package') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const { seedId, userRequest, targetDurationSeconds } = payload;

      if (!seedId) {
        throw new Error('缺少参数：seedId');
      }

      console.log(`[seed/package] seedId=${seedId}, request="${userRequest || ''}"`);

      // 1. 读 manifest
      const manifest = await loadSeedManifest(seedId);

      // 2. 选片
      const selection = selectClips(manifest, targetDurationSeconds);
      console.log(`[seed/package] 选中 ${selection.clips.length} 个片段，总时长 ${selection.totalDuration.toFixed(1)}s`);

      if (selection.clips.length === 0) {
        throw new Error('没有可用素材，无法生成素材包');
      }

      // 3. 生成文案
      const scriptMarkdown = await generateScript(seedId, manifest, selection.clips, userRequest);

      // 4. 打包
      const packageResult = await createPackage(seedId, manifest, selection.clips, scriptMarkdown);

      sendJson(res, 200, {
        ok: true,
        type: 'seed-package-result',
        seedId,
        packageId: packageResult.packageId,
        zipUrl: packageResult.zipUrl,
        scriptPreview: scriptMarkdown.slice(0, 500),
        clipCount: selection.clips.length,
        totalDuration: selection.totalDuration,
        inRange: selection.inRange,
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
  console.log(`Seed package server listening on http://127.0.0.1:${PORT}`);
});

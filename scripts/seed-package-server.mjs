import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
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

// 选片逻辑：按逻辑线顺序，从每段随机选 1 个
function selectClips(manifest, targetDurationSeconds = null) {
  const segments = (manifest.segments || []).filter(seg => seg.required !== false);
  const selected = [];

  for (const seg of segments) {
    const candidates = (seg.clips || []).filter(c => c.state === 'real');

    if (candidates.length === 0) {
      console.warn(`[selectClips] segment ${seg.id} 没有可用素材，跳过`);
      continue;
    }

    // 按 priority 分组
    const p0 = candidates.filter(c => c.priority === 'P0');
    const p1 = candidates.filter(c => c.priority === 'P1');
    const p2 = candidates.filter(c => c.priority === 'P2');

    // 优先选 P0，没有就选 P1，再没有选 P2
    const pool = p0.length ? p0 : (p1.length ? p1 : p2);

    // 随机选 1 个
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selectedClip = {
      ...pool[randomIndex],
      segmentId: seg.id,
      segmentLabel: seg.label,
      segmentOrder: seg.order,
      segmentPurpose: seg.purpose,
      segmentTargetDuration: seg.targetDurationSeconds,
    };

    selected.push(selectedClip);
  }

  const totalDuration = selected.reduce((sum, clip) => sum + (clip.durationSeconds || 0), 0);

  return {
    clips: selected,
    totalDuration,
    segmentCount: segments.length,
    selectedCount: selected.length,
  };
}

// 调用 MiMo 生成文案
async function generateScript(seedId, manifest, selectedClips, userRequest) {
  if (!MIMO_API_KEY) {
    throw new Error('缺少 MIMO_API_KEY，无法生成文案');
  }

  // 构建逻辑线信息
  const logicLine = selectedClips.map(clip => ({
    order: clip.segmentOrder,
    label: clip.segmentLabel,
    purpose: clip.segmentPurpose,
    targetDuration: clip.segmentTargetDuration,
    selectedClip: {
      subject: clip.subject,
      description: clip.description,
      proves: clip.proves,
      duration: clip.durationSeconds,
    },
  }));

  const totalDuration = selectedClips.reduce((sum, clip) => sum + (clip.durationSeconds || 0), 0);

  const messages = [
    {
      role: 'system',
      content: [
        '你是 813 种子内容裂变的文案生成 Agent。',
        '你的任务是基于种子内容的逻辑线和用户诉求，生成一份视频脚本。',
        '脚本必须严格按照逻辑线的段落顺序组织，每段对应一个素材片段。',
        '口播文案总长度要匹配总时长（按中文口播速度，约 3-4 字/秒）。',
        '口播要口语化、适合短视频、符合用户诉求。',
        '只返回 markdown 文本，不要 JSON 包装。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于以下逻辑线和素材，生成视频脚本：',
        '',
        `用户诉求：${userRequest || '基于种子内容做一个短视频'}`,
        `种子内容：${manifest.title || seedId}`,
        `总时长：${totalDuration.toFixed(1)}s`,
        '',
        '逻辑线（按顺序）：',
        ...logicLine.map(seg => [
          `${seg.order}. ${seg.label}（${seg.targetDuration}s）`,
          `   目的：${seg.purpose}`,
          `   素材：${seg.selectedClip.subject}`,
          `   画面：${seg.selectedClip.description}`,
          `   实际时长：${seg.selectedClip.duration}s`,
        ].join('\n')),
        '',
        '返回格式（markdown）：',
        '# 视频标题',
        '',
        '## 分镜脚本',
        '',
        '### 1. 段落名称（Xs）',
        '**画面**：画面主体',
        '**口播**：口播文案（口语化，自然）',
        '',
        '### 2. ...',
        '',
        '## 素材使用说明',
        '- 素材1：文件路径（时长）',
        '  - 用途说明',
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

  // clip.file 是相对素材包目录的路径，所以 packageRoot 必须指到「.../素材包」这一层。
  // manifest 里没写就没法拼对，之前静默 skip 会产出一个只有文案的空包，所以这里直接报错。
  if (!manifest.packageRoot) {
    throw new Error(`种子 ${seedId} 的 manifest 缺少 packageRoot，无法定位素材文件`);
  }
  const packageRoot = path.join(root, manifest.packageRoot);
  let copied = 0;
  const missing = [];
  for (const clip of selectedClips) {
    const sourcePath = path.join(packageRoot, clip.file);
    if (!existsSync(sourcePath)) {
      missing.push(clip.file);
      continue;
    }
    const fileName = path.basename(clip.file);
    const destPath = path.join(materialsDir, fileName);
    await execFileAsync('cp', [sourcePath, destPath]);
    copied += 1;
  }
  if (missing.length > 0) {
    console.warn(`[seed/package] ${missing.length} 个素材文件不存在：\n  ${missing.join('\n  ')}`);
  }
  if (copied === 0) {
    throw new Error('选中的素材文件都不存在，素材包里会没有视频，已终止');
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

    // zip 下载。前端下载按钮直接指到这里，没有这个路由 zipUrl 就是个 404。
    if (req.method === 'GET' && req.url?.startsWith('/outputs/seed-packages/')) {
      const requested = decodeURIComponent(req.url.split('?')[0]);
      const outputRoot = path.join(root, 'outputs', 'seed-packages');
      const filePath = path.resolve(root, `.${requested}`);

      // 只允许读 outputs/seed-packages 下的 .zip，挡掉 ../ 穿越
      if (!filePath.startsWith(outputRoot + path.sep) || !filePath.endsWith('.zip')) {
        sendJson(res, 403, { ok: false, error: 'Forbidden' });
        return;
      }
      if (!existsSync(filePath)) {
        sendJson(res, 404, { ok: false, error: '素材包不存在或已过期' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
        'Access-Control-Allow-Origin': '*',
      });
      createReadStream(filePath).pipe(res);
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

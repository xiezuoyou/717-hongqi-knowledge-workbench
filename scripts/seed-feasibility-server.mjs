import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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

const PORT = Number(process.env.SEED_FEASIBILITY_PORT || 8796);
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

function buildFeasibilityPrompt(manifest, userRequest) {
  // 收集所有素材的 proves 信息
  const materialCapabilities = manifest.segments.map(seg => ({
    label: seg.label,
    purpose: seg.purpose,
    clips: (seg.clips || [])
      .filter(c => c.state === 'real')
      .map(c => ({
        subject: c.subject,
        description: c.description,
        proves: c.proves,
        doesNotProve: c.doesNotProve,
      })),
  })).filter(seg => seg.clips.length > 0);

  return [
    {
      role: 'system',
      content: [
        '你是 813 种子内容可行性判断 Agent。',
        '你的任务是判断用户的裂变诉求能否用当前种子内容实现。',
        '判断标准：',
        '- supported: 素材完全支持用户诉求，可以直接做',
        '- degradable: 素材部分支持，可以做但需要调整表达或降低预期',
        '- unsupported: 素材不支持，做不了',
        '只根据素材的 proves / doesNotProve 判断，不要脑补素材里没有的内容。',
        '只返回 JSON，不要 markdown 包装。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请判断以下用户诉求能否用当前种子内容实现：',
        '',
        `用户诉求：${userRequest}`,
        `种子内容：${manifest.title || manifest.seedId}`,
        `内容方向：${manifest.directionId || ''}`,
        '',
        '当前可用素材：',
        JSON.stringify(materialCapabilities, null, 2),
        '',
        '返回格式：',
        '{',
        '  "verdict": "supported | degradable | unsupported",',
        '  "reason": "判断理由（一句话）",',
        '  "fallback": "如果是 degradable，建议怎么调整；如果是 unsupported，建议用什么种子",',
        '  "brief": "可以做的简短方向（如果 supported 或 degradable）"',
        '}',
      ].join('\n'),
    },
  ];
}

async function checkFeasibility(seedId, userRequest) {
  console.log(`[seed/feasibility] seedId=${seedId}, request="${userRequest}"`);

  const manifest = await loadSeedManifest(seedId);
  const result = await callMimo(buildFeasibilityPrompt(manifest, userRequest));

  console.log(`[seed/feasibility] verdict=${result.verdict}`);

  return {
    seedId,
    userRequest,
    verdict: result.verdict,
    reason: result.reason,
    fallback: result.fallback || '',
    brief: result.brief || '',
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
        service: 'seed-feasibility-server',
        hasKey: Boolean(MIMO_API_KEY),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/seed/feasibility') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const { seedId, userRequest } = payload;

      if (!seedId || !userRequest) {
        throw new Error('缺少参数：seedId 或 userRequest');
      }

      const result = await checkFeasibility(seedId, userRequest);

      sendJson(res, 200, {
        ok: true,
        type: 'seed-feasibility-result',
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
  console.log(`Seed feasibility server listening on http://127.0.0.1:${PORT}`);
});

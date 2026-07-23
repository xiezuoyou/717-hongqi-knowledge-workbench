import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);

async function loadEnv() {
  const envPaths = [
    path.join(root, '.env'),
    path.join(process.env.HOME || '', '.codex', 'imagegen.env'),
  ].filter(Boolean);
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
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
}

await loadEnv();

const PORT = Number(process.env.AI_PORT || 8790);
const CANVAS_PORT = Number(process.env.WORKFLOW_CANVAS_PORT || 5174);
const CANVAS_ROOT = path.resolve(process.env.WORKFLOW_CANVAS_ROOT || path.join(root, 'public'));
const PUBLIC_AI_BASE_URL = String(process.env.PUBLIC_AI_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const MIMO_API_KEY = process.env.MIMO_API_KEY;
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5-pro';
const MIMO_VIDEO_MODEL = process.env.MIMO_VIDEO_MODEL || 'mimo-v2.5';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
const MINIMAX_TTS_MODEL = process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd';
const GRSAI_BASE_URL = process.env.GRSAI_BASE_URL || 'https://grsai.dakka.com.cn';
const GRSAI_API_KEY = process.env.GRSAI_API_KEY || process.env.OPENAI_API_KEY;
const MATERIAL_ROOT = path.join(root, '素材库');
const MATERIAL_TAG_DIR = path.join(MATERIAL_ROOT, '标签MD');
const MAX_VIDEO_DOWNLOAD_BYTES = Number(process.env.MAX_VIDEO_DOWNLOAD_BYTES || 50 * 1024 * 1024);

function publicUrl(pathname) {
  return `${PUBLIC_AI_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

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
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function normalizeScriptItems(items, fallback = []) {
  if (!Array.isArray(items)) {
    throw new Error('AI 返回格式错误：缺少 scripts 数组');
  }
  return items.map((item, index) => {
    const fallbackItem = fallback[index] || {};
    const text = String(item.text || '').trim();
    if (!text) throw new Error(`AI 返回格式错误：第 ${index + 1} 段缺少 text`);
    return {
      name: item.name || item.segment || fallbackItem.name || `节奏段 ${index + 1}`,
      text,
      duration: Number(item.duration || fallbackItem.duration || Math.max(3, Math.round((text.length / 9) * 10) / 10)),
      material: item.material || fallbackItem.material || item.materialHint || '待匹配素材',
    };
  });
}

function parseJsonContent(content) {
  const cleaned = String(content || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    error.rawContent = cleaned;
    throw error;
  }
}

function cleanScriptText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed = raw;
  try {
    const data = JSON.parse(raw);
    parsed = [
      data.handoffText,
      data.cleanScript,
      data.copy,
      data.text,
      data.answer,
      data.summary,
      data.payload?.rawText,
      data.payload?.copy,
      data.payload?.answer,
      data.payload?.summary,
      Array.isArray(data.payload?.variants) ? data.payload.variants.map((item) => item.copy || item.text || '').join('\n') : '',
    ].filter(Boolean).join('\n') || raw;
  } catch {}
  const lines = String(parsed)
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```(?:json)?|```/gi, ''))
    .replace(/^\s*[-*#>\d.、]+/gm, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(文本生产|视频识别|脚本拆分|脚本拆解|内容分析|内容裂变|内容问答)[（(].*[）)]/.test(line))
    .filter((line) => !/^(版本\s*\d+|角度[:：]|素材建议[:：]|策略[:：]|可复用结构[:：]|建议下一步[:：]|风险[:：]|受众[:：])/.test(line))
    .filter((line) => !/^(summary|strategy|variants|materialHint|nextActions|payload|raw|ok|type|mode)[:：]/i.test(line));
  return lines.join('')
    .replace(/文本生产[（(][^）)]*[）)]/g, '')
    .replace(/素材建议[:：][^。！？!?]*/g, '')
    .replace(/角度[:：][^。！？!?]*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function splitScriptSegments(text) {
  const source = cleanScriptText(text);
  const matches = source.match(/[^，。！？!?；;、,.]+[，。！？!?；;、,.]?/g) || [];
  const initial = matches.map((part, index) => {
    const trimmed = part.trim();
    const delimiter = trimmed.match(/[，。！？!?；;、,.]$/)?.[0] || '';
    return {
      id: `seg-${String(index + 1).padStart(3, '0')}`,
      order: index + 1,
      text: trimmed,
      delimiter,
    };
  }).filter((item) => item.text);
  const merged = [];
  for (let index = 0; index < initial.length; index += 1) {
    const current = initial[index];
    const next = initial[index + 1];
    if (next && shouldMergeLeadPhrase(current, next)) {
      merged.push({
        ...current,
        text: `${current.text}${next.text}`,
        delimiter: next.delimiter || current.delimiter,
      });
      index += 1;
    } else {
      merged.push(current);
    }
  }
  return merged.map((segment, index) => ({
    ...segment,
    id: `seg-${String(index + 1).padStart(3, '0')}`,
    order: index + 1,
  }));
}

function shouldMergeLeadPhrase(current, next) {
  const text = String(current?.text || '').replace(/[，,]\s*$/, '').trim();
  const nextText = String(next?.text || '').trim();
  if (!text || !nextText) return false;
  if (!/[，,]$/.test(current.text || '')) return false;
  const plainLength = Array.from(text).length;
  const hasPredicate = /(让|使|把|给|能|会|是|不是|成为|带来|实现|拥有|支持|开启|告别|守护|辅助|预警|刹停|变道|登场|亮相|出现|走进|开进)/.test(text);
  const nextHasPredicate = /^(让|使|把|给|以|为|从此|就|会|能|是|不是|成为|带来|实现|告别|守护|辅助|预警|刹停|变道)/.test(nextText);
  const looksLikeLeadNoun = plainLength <= 10 && !hasPredicate;
  return looksLikeLeadNoun && nextHasPredicate;
}

function extractTextProductionScriptText(result) {
  const payload = result?.payload && typeof result.payload === 'object' ? result.payload : result;
  const direct = [
    result?.scriptText,
    payload?.scriptText,
    payload?.copy,
    Array.isArray(payload?.variants) ? payload.variants[0]?.copy : '',
  ].find((value) => typeof value === 'string' && value.trim());
  return String(direct || '').replace(/[\r\n\t]+/g, '').trim();
}

function normalizeScriptSplitServerResult(result, cleanScript, punctuationSegments) {
  const segmentById = Object.fromEntries(punctuationSegments.map((segment) => [segment.id, segment]));
  const fallbackBlock = {
    id: 'block-001',
    order: 1,
    role: '内容大段',
    segmentIds: punctuationSegments.map((segment) => segment.id),
    visualUnits: punctuationSegments.map((segment, index) => ({
      id: `unit-${String(index + 1).padStart(3, '0')}`,
      order: index + 1,
      segmentIds: [segment.id],
      mergeByAi: false,
      materialType: 'general',
      mergeLocked: false,
    })),
  };
  const rawBlocks = Array.isArray(result?.contentBlocks) && result.contentBlocks.length
    ? result.contentBlocks
    : [fallbackBlock];
  const contentBlocks = rawBlocks.map((block, blockIndex) => {
    const blockSegmentIds = Array.isArray(block.segmentIds) && block.segmentIds.length
      ? block.segmentIds.filter((id) => segmentById[id])
      : [];
    const rawUnits = Array.isArray(block.visualUnits) && block.visualUnits.length
      ? block.visualUnits
      : blockSegmentIds.map((segmentId, index) => ({
          id: `unit-${String(blockIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
          order: index + 1,
          segmentIds: [segmentId],
          mergeByAi: false,
          materialType: 'general',
          mergeLocked: false,
        }));
    const visualUnits = rawUnits.map((unit, unitIndex) => {
      const unitSegmentIds = Array.isArray(unit.segmentIds) && unit.segmentIds.length
        ? unit.segmentIds.filter((id) => segmentById[id])
        : [];
      const text = unitSegmentIds.map((id) => segmentById[id]?.text || '').join('');
      const materialType = ['general', 'guided', 'specific'].includes(unit.materialType) ? unit.materialType : 'general';
      return {
        id: unit.id || `unit-${String(blockIndex + 1).padStart(2, '0')}-${String(unitIndex + 1).padStart(2, '0')}`,
        order: Number(unit.order || unitIndex + 1),
        segmentIds: unitSegmentIds,
        text,
        mergeByAi: Boolean(unit.mergeByAi || unitSegmentIds.length > 1),
        materialType,
        mergeLocked: Boolean(unit.mergeLocked || materialType === 'specific'),
      };
    }).filter((unit) => unit.segmentIds.length);
    const segmentIds = [...new Set(visualUnits.flatMap((unit) => unit.segmentIds))];
    return {
      id: block.id || `block-${String(blockIndex + 1).padStart(3, '0')}`,
      order: Number(block.order || blockIndex + 1),
      role: block.role || '内容大段',
      segmentIds,
      text: segmentIds.map((id) => segmentById[id]?.text || '').join(''),
      visualUnits,
    };
  }).filter((block) => block.visualUnits.length);
  return {
    ok: true,
    type: 'script-split-result',
    cleanScript,
    punctuationSegments,
    contentBlocks,
    visualGroups: contentBlocks.flatMap((block) => block.visualUnits.map((unit) => ({
      ...unit,
      blockId: block.id,
      blockOrder: block.order,
      blockRole: block.role,
      blockText: block.text,
    }))),
    raw: result,
  };
}

function sendFile(res, contentType, file) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(file);
}

async function serveWorkflowCanvas(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${CANVAS_PORT}`);
    const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/workflow-canvas.html' : requestUrl.pathname);
    const filePath = path.resolve(CANVAS_ROOT, `.${pathname}`);
    if (!filePath.startsWith(CANVAS_ROOT) || !existsSync(filePath)) {
      sendJson(res, 404, { ok: false, error: 'File not found' });
      return;
    }
    const file = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypeForFile(filePath),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(file);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] canvas ${req.method} ${req.url} failed:`, error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.zip') return 'application/zip';
  return 'image/jpeg';
}

function grsaiGenerateUrl() {
  const baseUrl = GRSAI_BASE_URL.replace(/\/$/, '');
  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/api/generate`
    : `${baseUrl}/v1/api/generate`;
}

function extractMdField(content, label) {
  const match = content.match(new RegExp(`^- ${label}：(.+)$`, 'm'));
  return match ? match[1].replace(/^`|`$/g, '').trim() : '';
}

function extractMdList(content, heading) {
  const index = content.indexOf(`## ${heading}`);
  if (index === -1) return [];
  const rest = content.slice(index).split('\n').slice(1);
  const lines = [];
  for (const line of rest) {
    if (line.startsWith('## ')) break;
    const item = line.match(/^- (.+)$/);
    if (item) lines.push(item[1].trim());
  }
  return lines;
}

function extractMdSection(content, heading) {
  const index = content.indexOf(`## ${heading}`);
  if (index === -1) return '';
  const rest = content.slice(index).split('\n').slice(1);
  const lines = [];
  for (const line of rest) {
    if (line.startsWith('## ')) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

async function loadImageAssetTags() {
  const entries = existsSync(MATERIAL_TAG_DIR) ? await readdir(MATERIAL_TAG_DIR, { withFileTypes: true }) : [];
  const mdFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.includes('索引'))
    .map((entry) => entry.name)
    .sort();

  const assets = [];
  const seenHashes = new Set();
  for (const fileName of mdFiles) {
    const mdPath = path.join(MATERIAL_TAG_DIR, fileName);
    const content = await readFile(mdPath, 'utf8');
    if (!content.includes('素材类型：图片')) continue;

    const sourcePath = extractMdField(content, '文件路径');
    const fullSourcePath = path.resolve(root, sourcePath);
    if (!sourcePath || !fullSourcePath.startsWith(path.join(MATERIAL_ROOT, '图片')) || !existsSync(fullSourcePath)) {
      continue;
    }

    const fileHash = createHash('sha1').update(await readFile(fullSourcePath)).digest('hex');
    if (seenHashes.has(fileHash)) {
      continue;
    }
    seenHashes.add(fileHash);

    const title = fileName
      .replace(/^图片-/, '')
      .replace(/\.md$/, '')
      .replace(/^\S+?-\d+-/, '');

    assets.push({
      id: String(assets.length + 1),
      title,
      tagFile: `素材库/标签MD/${fileName}`,
      sourcePath,
      fileName: path.basename(sourcePath),
      fileHash,
      url: publicUrl(`/material-assets?path=${encodeURIComponent(sourcePath)}`),
      category: extractMdField(content, '素材分类'),
      tags: extractMdList(content, '检索标签'),
      uses: extractMdList(content, '适用方向'),
      description: extractMdSection(content, '检索描述').replace(/\s+/g, ' '),
      content,
    });
  }
  return assets;
}

function detectImageSearchIntent(prompt) {
  const text = String(prompt || '').toLowerCase();
  const hasAny = (words) => words.some((word) => text.includes(word.toLowerCase()));
  if (hasAny(['717', '粉丝盛典', '晚会', '天工之夜', 'gala', '舞台', '演出', '乐队', '观众', '活动现场'])) {
    return 'event';
  }
  if (hasAny(['车标', '立标', '金葵花车标', '前脸', '格栅', '中网', '机盖'])) {
    return 'emblem';
  }
  if (hasAny(['金葵花', '国礼', '国雅', '国耀', '国悦'])) {
    return 'golden';
  }
  return 'general';
}

function assetMatchesIntent(asset, intent) {
  const text = `${asset.title} ${asset.category} ${asset.tags.join(' ')} ${asset.description}`.toLowerCase();
  if (intent === 'event') return /717|粉丝盛典|晚会|天工之夜|gala|舞台|演出|乐队|观众|活动现场/.test(text);
  if (intent === 'emblem') return /车标|立标|前脸|格栅|中网|机盖/.test(text);
  if (intent === 'golden') return /金葵花|国礼|国雅|国耀|国悦/.test(text);
  return true;
}

function scoreAsset(prompt, asset) {
  const intent = detectImageSearchIntent(prompt);
  const text = `${asset.title} ${asset.category} ${asset.tags.join(' ')} ${asset.description}`.toLowerCase();
  const terms = Array.from(new Set(String(prompt || '')
    .toLowerCase()
    .replace(/[，。！？、,.!?]/g, ' ')
    .split(/\s+/)
    .flatMap((term) => [term, ...['717', '粉丝盛典', '晚会', '天工之夜', 'gala', '舞台', '演出', '乐队', '观众', '金葵花', '车标', '立标', '国礼', '国雅', '国耀', '国悦'].filter((key) => term.includes(key) || String(prompt).includes(key))])
    .filter((term) => !['图片', '素材', '搜索', '找一下', '帮我找'].includes(term))
    .filter((term) => term.length >= 2)));
  const baseScore = terms.reduce((score, term) => score + (text.includes(term) ? 2 : 0), 0);
  const intentScore = assetMatchesIntent(asset, intent) ? 12 : -24;
  return baseScore + (intent === 'general' ? 0 : intentScore);
}

async function callMimo(messages) {
  if (!MIMO_API_KEY) {
    throw new Error('缺少 MIMO_API_KEY，请先在 .env 中配置');
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
    throw new Error('MiMo 返回为空：未拿到 choices[0].message.content');
  }
  return parseJsonContent(content);
}

async function callMimoVideo(messages) {
  if (!MIMO_API_KEY) {
    throw new Error('缺少 MIMO_API_KEY，请先在 .env 中配置');
  }

  const response = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MIMO_API_KEY,
      Authorization: `Bearer ${MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: MIMO_VIDEO_MODEL,
      messages,
      max_completion_tokens: 4096,
    }),
  });

  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`MiMo 视频理解返回非 JSON：${raw.slice(0, 180)}`);
  }

  if (!response.ok) {
    const message = result?.error?.message || result?.message || raw || `HTTP ${response.status}`;
    const detail = result?.error ? `；detail=${JSON.stringify(result.error)}` : '';
    throw new Error(`MiMo 视频理解调用失败：${message}${detail}`);
  }

  const content = result?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('MiMo 视频理解返回为空：未拿到 choices[0].message.content');
  }
  return parseJsonContent(content);
}

async function fetchVideoAsDataUrl(videoUrl) {
  const url = String(videoUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('视频 URL 必须是公网 http(s) 地址，不能填写本机路径或 file:// 地址');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome Safari',
      Accept: 'video/mp4,video/*,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`URL 预检失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_VIDEO_DOWNLOAD_BYTES) {
    throw new Error(`URL 视频超过 ${Math.round(MAX_VIDEO_DOWNLOAD_BYTES / 1024 / 1024)}MB，当前测试接口不下载大文件`);
  }
  if (!/^video\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
    throw new Error(`URL 返回的不是直接视频文件，content-type=${contentType || 'unknown'}。请使用 mp4/mov 直链，不要使用网页分享链接`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_VIDEO_DOWNLOAD_BYTES) {
    throw new Error(`URL 视频超过 ${Math.round(MAX_VIDEO_DOWNLOAD_BYTES / 1024 / 1024)}MB，当前测试接口不下载大文件`);
  }
  const mimeType = contentType.split(';')[0] || 'video/mp4';
  return `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
}

function seedContext(payload) {
  return JSON.stringify({
    seed: payload.seed,
    seedSegments: payload.seedSegments,
    selectedDetails: payload.selectedDetails,
    userRequest: payload.request,
  }, null, 2);
}

function generatePrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是短视频口播脚本 Agent，只负责输出最终可直接念出来的中文口播脚本。',
        '禁止输出工作说明、分析说明、制作说明或“我会/这一段/重点看”这类内部执行语。',
        '脚本必须保留种子内容的节奏段结构，每段是一句自然口播。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于以下种子内容和用户需求，生成 4 段口播脚本。',
        '返回格式：{"scripts":[{"name":"开头钩子","text":"...","duration":3.2,"material":"..."}]}',
        'duration 可按中文口播时长估算，material 写该段推荐素材需求或已选细节名。',
        seedContext(payload),
        `当前基础脚本：${JSON.stringify(payload.currentScript || [], null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function refinePrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是短视频口播脚本精修 Agent。',
        '你必须理解完整种子内容、当前节奏段、用户改编方向、已选细节、当前句和前后文。',
        '只重写当前这一句，必须是最终可直接念出来的口播句。',
        '禁止输出解释、制作说明、执行说明、分析说明。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请按照用户精修要求重写 currentLine.text，只返回新句子。',
        '返回格式：{"text":"...","reason":"一句话说明修改方向"}',
        `精修要求：${payload.prompt}`,
        `上下文：${JSON.stringify(payload.context, null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function scriptRefinePrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是短视频口播脚本总控 Agent。',
        '你要根据用户提出的整体修改要求，重写整条脚本。',
        '必须保留四个节奏段的结构，不要改变段落数量。',
        '输出必须是最终可直接念出来的口播句，不要输出内部说明。',
        '可以调整开头、节奏、结尾、评论引导和整体语气，但不要写成分析稿。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请根据用户的整体修改要求，重写整条脚本。',
        '返回格式：{"scripts":[{"name":"开头钩子","text":"...","duration":3.2,"material":"..."}]}',
        `整体修改要求：${payload.prompt}`,
        `当前种子内容：${JSON.stringify(payload.seed, null, 2)}`,
        `当前节奏段：${JSON.stringify(payload.seedSegments, null, 2)}`,
        `当前脚本：${JSON.stringify(payload.currentScript || [], null, 2)}`,
        `已选细节：${JSON.stringify(payload.selectedDetails || [], null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function materialSupportPrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是视频素材支撑性判断 Agent。',
        '你的任务不是改写文案，而是判断当前素材描述是否能支持这句口播文案。',
        '只根据给定素材描述判断，不要使用外部知识补全。',
        '判断标准：素材只要明确包含对应画面主体，就可以支持视觉层面的主观描述，例如“中控屏看起来大”“尺寸感明显”“车灯有层次”“现场挺热闹”。',
        '不要把“看起来大、尺寸感明显、科技感、好看、有质感、层次丰富”这类主观视觉描述当成具体参数；只要画面主体存在，就应判断为支持。',
        '只有文案包含明确数字参数、官方尺寸、专属设计名称、技术结构、配置名称、无法从画面直接证明的事实，且素材描述没有明确写出该信息时，才判断为不支持。',
        '例如“中控屏这块儿尺寸确实大”在有中控画面的情况下应支持；“中控屏有12英寸”在素材描述没有12英寸时不支持。',
        '主体包含关系：素材描述中的“内饰中控”“中控”“座舱”可以视为包含中控屏画面主体；“车灯细节”“车灯”“前脸”可以视为包含车灯画面主体。',
        '不支持时必须指出文案中具体哪一句或哪个关键词无法被素材支撑。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请判断素材描述是否支持当前口播文案。',
        '返回格式：{"supported":true,"reason":"...","unsupportedClaims":[]} 或 {"supported":false,"reason":"...","unsupportedClaims":["12 英寸"]}',
        `口播文案：${payload.text}`,
        `当前节奏段：${JSON.stringify(payload.segment, null, 2)}`,
        `当前可用素材描述：${JSON.stringify(payload.materialScope, null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function grammarCheckPrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是短视频口播中文表达检查 Agent。',
        '你的任务是检查一句口播文案是否存在病句、语序不顺、表达别扭、重复、口语不自然等问题。',
        '只检查中文表达本身，不要改写句子。',
        '如果句子表达通顺、符合口播语感，返回 supported=true。',
        '如果句子有明显病句、语序问题或语义别扭，返回 supported=false，并指出具体问题点。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请检查当前口播文案是否有病句或表达不顺。',
        '返回格式：{"supported":true,"reason":"..."} 或 {"supported":false,"reason":"...","issues":["..."]}',
        `口播文案：${payload.text}`,
      ].join('\n\n'),
    },
  ];
}

function packagePrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是短视频包装设计 Agent。',
        '你的任务是把用户的自然语言包装需求，转换成 Remotion 可执行的结构化包装配置。',
        '只输出 JSON 对象，不要 Markdown，不要解释。',
        '配置必须克制，不要生成太多叠加元素；优先服务口播和画面可读性。',
        'overlays 最多 4 个，highlightWords 最多 8 个。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于当前视频脚本、时间线、素材和用户包装需求，生成包装配置。',
        '返回格式：{"subtitleStyle":{"type":"hongqi|social|clean","position":"bottom|middle","highlightWords":["..."]},"overlays":[{"type":"bigTitle|cornerBadge|sectionLabel","text":"...","start":0,"duration":1.5}],"transitions":{"type":"cut|fade|slide","duration":0.25},"effects":{"vignette":0.2,"contrast":1.05,"saturation":1.05},"summary":["..."]}',
        `用户包装需求：${payload.prompt}`,
        `快捷需求：${JSON.stringify(payload.quickNeeds || [], null, 2)}`,
        `视频标题：${payload.title || ''}`,
        `画布比例：${payload.canvasRatio || ''}`,
        `脚本：${JSON.stringify(payload.script || [], null, 2)}`,
        `时间线：${JSON.stringify(payload.timelineBeats || [], null, 2)}`,
        `素材段：${JSON.stringify(payload.materialClips || [], null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function assistantPrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是红旗知识工作台里的 AI 智库助手。',
        '你的任务是帮助用户围绕知识库做搜索、整理、改写、审核和内容生产。',
        '回答要短、稳、可执行，优先给出直接结论和下一步动作。',
        '不要输出长篇解释、不要编造事实、不要提到你是模型或系统。',
        '如果用户的问题不完整，先补出一个最可用的理解，再给 1 到 3 条下一步建议。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请根据用户输入，直接给出适合工作台使用的 AI 回复。',
        '返回格式：{"reply":"...","suggestions":["...","..."]}',
        `用户输入：${payload.prompt}`,
        `当前模块：${payload.module || 'AI智库'}`,
        `当前子功能：${payload.subModule || 'AI智库助手'}`,
        `工作台上下文：${JSON.stringify(payload.context || {}, null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function imageSearchPrompt(payload) {
  return [
    {
      role: 'system',
      content: [
        '你是红旗知识工作台的图片素材检索助手。',
        '你只能根据我提供的候选素材回答，不允许编造不存在的素材。',
        '你的任务是从候选素材中挑出最符合用户需求的 6 张图片。',
        '只返回 JSON 对象，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请从候选图片中选出最适合的 6 张，并说明每张为什么匹配。',
        '返回格式：{"reply":"...","matches":[{"id":"1","reason":"..."}]}',
        `用户需求：${payload.prompt}`,
        `候选图片：${JSON.stringify(payload.candidates, null, 2)}`,
      ].join('\n\n'),
    },
  ];
}

function videoRecognitionPrompt(payload) {
  const outputs = Array.isArray(payload.outputs) && payload.outputs.length
    ? payload.outputs
    : ['contentAnalysis', 'scriptExtraction', 'frameAnalysis'];
  const sourceLabel = payload.sourceType === 'url'
    ? `视频 URL：${payload.videoUrl || ''}`
    : `本地视频：${payload.localFile || payload.localAsset?.name || '未命名视频'}`;
  const outputSpec = {
    contentAnalysis: outputs.includes('contentAnalysis') ? {
      summary: '视频内容一句话总结',
      coreMessage: '视频想传递的核心信息',
      audienceAppeal: '对用户有吸引力的点',
      contentStructure: ['按时间顺序拆出内容结构'],
    } : undefined,
    scriptExtraction: outputs.includes('scriptExtraction') ? {
      transcript: '如果能识别到字幕/口播/屏幕文字，则提取为完整文本；没有就写空字符串',
      scriptBeats: [{ id: 'beat-01', text: '按表达意思拆出的脚本/画面节奏段', purpose: '这一段的传播作用' }],
      reusableCopywritingPattern: ['可复用的文案结构'],
    } : undefined,
    frameAnalysis: outputs.includes('frameAnalysis') ? {
      visualStyle: '画面风格、色彩、构图、镜头语言',
      timeline: [{ timeRange: '00:00-00:03', scene: '画面主体', camera: '镜头运动/景别', editingNote: '剪辑用途' }],
      keyFrames: ['关键画面主体列表'],
      editingStyle: '节奏、转场、字幕、包装风格',
    } : undefined,
  };

  return [
    {
      role: 'system',
      content: [
        '你是短视频种子内容识别 Agent。',
        '你要根据用户提供的视频，做面向内容裂变工作流的结构化识别。',
        '不要输出寒暄、不要输出 Markdown，只返回 JSON 对象。',
        '如果视频没有口播或字幕，不要编造逐字稿；可以根据画面给出内容结构和画面分析。',
        '时间轴允许粗略估计，不要求逐帧精确，但必须服务后续脚本生成、素材匹配和 Remotion 剪辑。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        {
          type: 'video_url',
          video_url: {
            url: payload.videoUrl || payload.videoDataUrl,
          },
          fps: 2,
          media_resolution: 'default',
        },
        {
          type: 'text',
          text: [
            '请识别这个视频，并严格返回 JSON。',
            `输入来源：${sourceLabel}`,
            `用户勾选识别类型：${outputs.join('、')}`,
            `返回字段模板：${JSON.stringify(outputSpec, null, 2)}`,
            '额外要求：',
            '1. 顶层必须包含 ok=true、type="video-recognition-result"、sourceType、source、outputs、payload。',
            '2. payload 里只填用户勾选的识别类型。',
            '3. timeline 的 timeRange 用 00:00-00:00 格式。',
            '4. 如果无法识别某部分，写明 reason，不要编造。',
          ].join('\n\n'),
        },
      ],
    },
  ];
}

function videoFrameRecognitionPrompt(payload) {
  const outputs = Array.isArray(payload.outputs) && payload.outputs.length
    ? payload.outputs
    : ['contentAnalysis', 'scriptExtraction', 'frameAnalysis'];
  const frames = Array.isArray(payload.frameDataUrls) ? payload.frameDataUrls.slice(0, 8) : [];
  return [
    {
      role: 'system',
      content: [
        '你是短视频种子内容识别 Agent。',
        '现在视频直传处理失败，你将根据视频抽帧图片做兜底识别。',
        '你必须明确这是基于关键帧的近似分析，不能编造音频、口播或完整字幕。',
        '不要输出 Markdown，只返回 JSON 对象。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        ...frames.map((url) => ({
          type: 'image_url',
          image_url: { url },
        })),
        {
          type: 'text',
          text: [
            '请基于这些按时间顺序抽取的视频关键帧，输出结构化视频识别结果。',
            `视频名称：${payload.localFile || payload.videoUrl || payload.localAsset?.name || '未命名视频'}`,
            `用户勾选识别类型：${outputs.join('、')}`,
            '返回格式：',
            '{"ok":true,"type":"video-recognition-result","fallback":"frame-extraction","sourceType":"local","source":"...","outputs":["contentAnalysis"],"payload":{"contentAnalysis":{},"scriptExtraction":{},"frameAnalysis":{}}}',
            '字段要求：',
            '1. contentAnalysis.summary/coreMessage/audienceAppeal/contentStructure 必须尽量填写。',
            '2. scriptExtraction 不得编造口播逐字稿；没有字幕/文字就 transcript=""，scriptBeats 写画面节奏段。',
            '3. frameAnalysis.timeline 按关键帧顺序写粗略 timeRange，例如 frame-01、frame-02 或 00:00-00:03。',
            '4. payload 只填用户勾选的识别类型。',
          ].join('\n\n'),
        },
      ],
    },
  ];
}

function textProductionPrompt(payload) {
  const inputText = String(payload.inputText || '').trim();
  const instruction = String(payload.instruction || '').trim();

  return [
    {
      role: 'system',
      content: [
        '你是内容裂变工作流里的脚本裂变 Agent。',
        '你只做一件事：根据输入和用户要求生成一版可直接口播的短视频脚本。',
        'scriptText 必须绝对干净，只包含口播正文。',
        '不要标题、不要角度、不要素材建议、不要分析说明、不要序号、不要 Markdown、不要 JSON 字段名混入 scriptText。',
        '不要输出 Markdown，只返回 JSON 对象。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `脚本要求：${instruction || '无'}`,
        `输入文本：${inputText}`,
        '只返回：{"ok":true,"type":"script-variation-result","scriptText":"纯净口播脚本正文"}',
      ].join('\n\n'),
    },
  ];
}

function scriptSplitPrompt(payload) {
  const cleanScript = String(payload.cleanScript || '').trim();
  const segments = Array.isArray(payload.punctuationSegments) ? payload.punctuationSegments : [];
  const instruction = String(payload.instruction || '').trim();
  return [
    {
      role: 'system',
      content: [
        '你只做脚本分组，输入已清洗切句。',
        '把小句分成内容大段 blocks；大段只表示主旨范围。',
        '每个大段内，把相邻且同一意思的小句合并为 visualUnits。',
        '短实体引导词不能单独成段；如“红旗智驾，让/以/为/从此……”必须和后面的谓语或价值表达作为整体判断。',
        'materialType 是素材支撑要求，不是素材名称。',
        'general：抽象情绪/价值/感受/泛场景，通用素材可支撑。',
        'guided：有明确方向或品牌/系统/场景名，但没有具体功能动作/参数/部件细节；可用方向素材支撑，也可和相邻同语义合并。',
        'specific：出现具体功能动作、参数、部件细节、可验证画面、屏幕文字、微距细节、具体演示动作，必须专用素材支撑，mergeLocked=true。',
        '不要因为出现品牌名、车型名、系统名就直接判 specific；例如“交给红旗智驾/红旗智驾陪你开”通常是 guided，不是 specific。',
        '只有像“AEB自动刹停/主动预警/17寸仪表盘/汝窑漆面微距/车标升降/自动变道/具体舞台人物动作”才 specific。',
        '不要解释原因，不要素材推荐，不要画面建议。',
        '不要输出 Markdown，只返回 JSON 对象。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `额外要求：${instruction || '无'}`,
        `已切小句：${JSON.stringify(segments.map((item) => ({ id: item.id, text: item.text })))}`,
        '只返回：{"ok":true,"type":"script-split-result","contentBlocks":[{"id":"block-001","order":1,"role":"钩子","segmentIds":["seg-001"],"visualUnits":[{"id":"unit-001","order":1,"segmentIds":["seg-001"],"mergeByAi":false,"materialType":"general|guided|specific","mergeLocked":false}]}]}',
      ].join('\n\n'),
    },
  ];
}

function materialPackagePrompt(payload) {
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  const instruction = String(payload.instruction || '').trim();
  return [
    {
      role: 'system',
      content: [
        '你只给素材包文件夹命名。',
        '输入已经是脚本拆解后的主旨段和画面单元，不要重新拆脚本。',
        '每个画面单元只输出一个短文件夹名，表示用户应该往里面放什么素材。',
        '文件夹名必须是素材画面描述，不要复述口播脚本文案。',
        '例如输出“城市道路车辆行驶”“驾驶员轻握方向盘”“雷达摄像头特写”，不要输出“让出行更轻松”。',
        'materialBrief 只写一句很短的素材长什么样，12-28 个字即可。',
        '不要写解释、不要写素材清单长文。',
        '不要输出 Markdown，只返回 JSON 对象。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `额外要求：${instruction || '无'}`,
        `脚本结构：${JSON.stringify(blocks)}`,
        '只返回：{"ok":true,"type":"material-package-plan","blocks":[{"blockId":"block-001","blockFolderName":"钩子","items":[{"unitId":"unit-001","folderName":"城市道路车辆行驶","materialBrief":"车辆在城市道路平稳行驶"}]}]}',
      ].join('\n\n'),
    },
  ];
}

function safePackageName(value, fallback = '素材') {
  const text = String(value || fallback)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return Array.from(text || fallback).slice(0, 36).join('');
}

function bufferFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('上传文件格式错误：缺少 dataUrl');
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function safeUploadedFileName(fileName) {
  const ext = path.extname(String(fileName || '')).slice(0, 12);
  const base = safePackageName(path.basename(String(fileName || 'asset'), ext || ''), 'asset');
  return `${base || 'asset'}-${Date.now()}-${randomUUID().slice(0, 6)}${ext}`;
}

function normalizeMaterialPackagePlan(result, scriptSplitResult, payload = {}) {
  const blocks = Array.isArray(scriptSplitResult?.contentBlocks) ? scriptSplitResult.contentBlocks : [];
  const visualGroups = Array.isArray(scriptSplitResult?.visualGroups) ? scriptSplitResult.visualGroups : [];
  const groupById = Object.fromEntries(visualGroups.map((group) => [group.id, group]));
  const planBlocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const planBlockById = Object.fromEntries(planBlocks.map((block) => [block.blockId, block]));
  const normalizedBlocks = blocks.map((block, blockIndex) => {
    const planBlock = planBlockById[block.id] || planBlocks[blockIndex] || {};
    const planItemById = Object.fromEntries((planBlock.items || []).map((item) => [item.unitId, item]));
    const units = Array.isArray(block.visualUnits) ? block.visualUnits : [];
    return {
      blockId: block.id || `block-${String(blockIndex + 1).padStart(3, '0')}`,
      order: Number(block.order || blockIndex + 1),
      role: block.role || '内容大段',
      folderName: safePackageName(planBlock.blockFolderName || block.role || `主旨段${blockIndex + 1}`),
      items: units.map((unit, unitIndex) => {
        const group = groupById[unit.id] || unit;
        const planItem = planItemById[unit.id] || (planBlock.items || [])[unitIndex] || {};
        const text = String(group.text || unit.text || '').trim();
        return {
          unitId: unit.id || group.id || `unit-${String(unitIndex + 1).padStart(3, '0')}`,
          order: Number(unit.order || unitIndex + 1),
          text,
          materialType: group.materialType || unit.materialType || 'general',
          folderName: safePackageName(planItem.folderName || text || `画面${unitIndex + 1}`),
          materialBrief: String(planItem.materialBrief || planItem.brief || planItem.description || '').trim(),
        };
      }),
    };
  }).filter((block) => block.items.length);
  return {
    ok: true,
    type: 'material-package-result',
    packageName: safePackageName(payload.packageName || '素材包'),
    ratio: String(payload.ratio || '4:3').trim(),
    note: String(payload.note || '').trim(),
    videoParams: payload.videoParams && typeof payload.videoParams === 'object' ? payload.videoParams : {},
    blocks: normalizedBlocks,
    raw: result,
  };
}

async function createMaterialPackageFiles(plan) {
  const packageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputRoot = path.join(root, 'outputs', 'material-packages');
  const packageDir = path.join(outputRoot, packageId, plan.packageName || '素材包');
  await mkdir(packageDir, { recursive: true });
  const noteLines = [
    `素材比例：${plan.ratio || '4:3'}`,
    '素材类型：实拍视频优先，可补充图片。',
    '建议数量：每个画面文件夹放 1-3 个素材。',
    '命名建议：素材文件按实际画面内容命名。',
    plan.note ? `补充要求：${plan.note}` : '',
    '',
    '素材放置说明：',
    ...plan.blocks.flatMap((block) => [
      '',
      `${String(block.order).padStart(2, '0')}_${block.folderName}`,
      ...block.items.map((item) => [
        `  ${String(item.order).padStart(2, '0')}_${item.folderName}`,
        `    素材类型：${item.materialType}`,
        `    画面要求：${item.materialBrief || item.folderName}`,
        `    对应口播：${item.text}`,
      ].join('\n')),
    ]),
  ].filter((line) => line !== '');
  await writeFile(path.join(packageDir, 'test.txt'), noteLines.join('\n'), 'utf8');
  for (const block of plan.blocks) {
    const blockDir = path.join(packageDir, `${String(block.order).padStart(2, '0')}_${block.folderName}`);
    await mkdir(blockDir, { recursive: true });
    for (const item of block.items) {
      const itemDir = path.join(blockDir, `${String(item.order).padStart(2, '0')}_${item.folderName}`);
      await mkdir(itemDir, { recursive: true });
    }
  }
  const zipName = `material-package-${packageId}.zip`;
  const zipPath = path.join(outputRoot, packageId, zipName);
  await execFileAsync('zip', ['-qry', zipPath, plan.packageName || '素材包'], {
    cwd: path.join(outputRoot, packageId),
  });
  return {
    packageId,
    packageDir,
    zipPath,
    zipUrl: publicUrl(`/outputs/material-packages/${packageId}/${zipName}`),
  };
}

const minimaxVoicePresets = [
  { id: 'Chinese (Mandarin)_Reliable_Executive', name: '沉稳高管', display: '沉稳高管', provider: 'minimax', voiceId: 'Chinese (Mandarin)_Reliable_Executive', tone: 'male / executive / trustworthy' },
  { id: 'Chinese (Mandarin)_Unrestrained_Young_Man', name: '不羁青年', display: '不羁青年', provider: 'minimax', voiceId: 'Chinese (Mandarin)_Unrestrained_Young_Man', tone: 'young / energetic / casual' },
  { id: 'Chinese (Mandarin)_Gentleman', name: '温润男声', display: '温润男声', provider: 'minimax', voiceId: 'Chinese (Mandarin)_Gentleman', tone: 'male / warm / clear' },
  { id: 'Chinese (Mandarin)_Male_Announcer', name: '播报男声', display: '播报男声', provider: 'minimax', voiceId: 'Chinese (Mandarin)_Male_Announcer', tone: 'male / announcer / authoritative' },
  { id: 'male-qn-jingying', name: '精英青年', display: '精英青年', provider: 'minimax', voiceId: 'male-qn-jingying', tone: 'male / young / standard' },
  { id: 'Chinese (Mandarin)_News_Anchor', name: '新闻女声', display: '新闻女声', provider: 'minimax', voiceId: 'Chinese (Mandarin)_News_Anchor', tone: 'female / anchor / professional' },
  { id: 'Chinese (Mandarin)_Warm_Bestie', name: '暖心闺蜜', display: '暖心闺蜜', provider: 'minimax', voiceId: 'Chinese (Mandarin)_Warm_Bestie', tone: 'female / friendly / social' },
];

function normalizeMiniMaxVoices(result) {
  const groups = [
    ['system_voice', '系统音色'],
    ['voice_cloning', '克隆音色'],
    ['voice_generation', '生成音色'],
    ['music_generation', '音乐音色'],
  ];
  return groups.flatMap(([key, type]) => (
    Array.isArray(result?.[key])
      ? result[key].map((voice) => ({
        id: voice.voice_id,
        voiceId: voice.voice_id,
        voiceName: voice.voice_name || voice.voice_id,
        description: Array.isArray(voice.description) ? voice.description.join('、') : voice.description,
        type,
        createdTime: voice.created_time,
        provider: 'minimax',
      })).filter((voice) => voice.voiceId)
      : []
  ));
}

async function callMiniMaxVoiceList() {
  if (!MINIMAX_API_KEY) {
    throw new Error('缺少 MINIMAX_API_KEY，请先在 .env 中配置');
  }

  const response = await fetch(`${MINIMAX_BASE_URL}/get_voice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      'api-key': MINIMAX_API_KEY,
    },
    body: JSON.stringify({ voice_type: 'all' }),
  });

  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`MiniMax 音色库返回非 JSON：${raw.slice(0, 180)}`);
  }

  const statusCode = result?.base_resp?.status_code;
  if (!response.ok || (typeof statusCode === 'number' && statusCode !== 0)) {
    const message = result?.base_resp?.status_msg || result?.error?.message || result?.message || raw || `HTTP ${response.status}`;
    throw new Error(`MiniMax 音色库调用失败：${message}`);
  }

  return normalizeMiniMaxVoices(result);
}

function normalizeMiniMaxText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMiniMaxTtsPayload(payload) {
  const voiceId = payload.voiceId || 'vivi';
  const model = payload.model || MINIMAX_TTS_MODEL;
  const speed = Number(payload.speed ?? 1);
  const pitch = Number(payload.pitch ?? 0);
  const vol = Number(payload.vol ?? 1);
  const text = normalizeMiniMaxText(payload.text);
  return {
    model,
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed,
      pitch,
      vol,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    },
    subtitle_enable: Boolean(payload.subtitleEnable),
    subtitle_type: payload.subtitleType || 'word',
  };
}

async function callMiniMaxTts(payload) {
  if (!MINIMAX_API_KEY) {
    throw new Error('缺少 MINIMAX_API_KEY，请先在 .env 中配置');
  }

  const requestBody = JSON.stringify(buildMiniMaxTtsPayload(payload));
  const baseUrls = [...new Set([
    MINIMAX_BASE_URL,
    MINIMAX_BASE_URL.includes('api.minimaxi.com')
      ? MINIMAX_BASE_URL.replace('api.minimaxi.com', 'api.minimax.io')
      : MINIMAX_BASE_URL,
    MINIMAX_BASE_URL.includes('api.minimax.io')
      ? MINIMAX_BASE_URL.replace('api.minimax.io', 'api.minimaxi.com')
      : MINIMAX_BASE_URL,
  ])];
  let lastError = null;

  for (const baseUrl of baseUrls) {
    const response = await fetch(`${baseUrl}/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        'api-key': MINIMAX_API_KEY,
      },
      body: requestBody,
    });

    const raw = await response.text();
    let result;
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      if (response.status === 404 || /page not found/i.test(raw)) {
        lastError = new Error(`MiniMax 接口 ${baseUrl} 返回 404：${raw.slice(0, 180)}`);
        continue;
      }
      throw new Error(`MiniMax 返回非 JSON：${raw.slice(0, 180)}`);
    }

    if (!response.ok) {
      const message = result?.base_resp?.status_msg || result?.error?.message || result?.message || raw || `HTTP ${response.status}`;
      if (response.status === 404 || /page not found/i.test(message)) {
        lastError = new Error(`MiniMax 接口 ${baseUrl} 返回 404：${message}`);
        continue;
      }
      throw new Error(`MiniMax 调用失败：${message}`);
    }

    const statusCode = result?.base_resp?.status_code;
    if (typeof statusCode === 'number' && statusCode !== 0) {
      throw new Error(`MiniMax 调用失败：${result?.base_resp?.status_msg || `status_code ${statusCode}`}`);
    }

    return result;
  }

  throw lastError || new Error('MiniMax TTS 调用失败');
}

function hexToBuffer(hex) {
  const clean = String(hex || '').trim();
  if (!clean) return Buffer.alloc(0);
  return Buffer.from(clean, 'hex');
}

function safeFileName(value) {
  const ascii = String(value || 'voice')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return ascii || 'voice';
}

function resolveProcessImagePath(sourcePath) {
  const fullPath = path.resolve(root, String(sourcePath || ''));
  const allowedRoots = [
    path.join(MATERIAL_ROOT, '图片'),
    path.join(root, 'outputs', 'image-ai'),
  ];
  if (!allowedRoots.some((allowedRoot) => fullPath.startsWith(allowedRoot)) || !existsSync(fullPath)) {
    throw new Error(`图片不存在或不允许处理：${sourcePath}`);
  }
  return fullPath;
}

async function processImagesWithAi(payload) {
  const selectedAssets = Array.isArray(payload.assets) ? payload.assets : [];
  if (selectedAssets.length === 0) throw new Error('请先选择要处理的图片');

  const imagePaths = selectedAssets
    .map((asset) => resolveProcessImagePath(asset.sourcePath))
    .slice(0, 4);

  const outputDir = path.join(root, 'outputs', 'image-ai');
  await mkdir(outputDir, { recursive: true });

  const packageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const outputName = `${packageId}.png`;
  const outputPath = path.join(outputDir, outputName);
  const promptPath = path.join(outputDir, `${packageId}.prompt.txt`);
  const userPrompt = String(payload.prompt || '').trim();
  const selectedSummary = selectedAssets
    .map((asset, index) => `${index + 1}. ${asset.title || asset.fileName || '参考图'}：${asset.description || asset.reason || ''}`)
    .join('\n');
  const prompt = [
    userPrompt ? `用户原始输入：\n${userPrompt}` : '',
    selectedSummary ? `参考素材信息：\n${selectedSummary}` : '',
    '请严格按照用户原始输入执行，不要自行改写、删减或替换用户指定的文字内容。',
  ].filter(Boolean).join('\n\n');
  await writeFile(promptPath, prompt);

  const images = await Promise.all(imagePaths.map(async (imagePath) => {
    const file = await readFile(imagePath);
    const ext = path.extname(imagePath).slice(1).toLowerCase() || 'jpeg';
    const mimeType = ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    return `data:${mimeType};base64,${file.toString('base64')}`;
  }));

  const wantsText = /标题|大标题|文字|文案|封面/.test(userPrompt);
  const aspectRatio = /4\s*[:：]\s*3/.test(userPrompt)
    ? '4:3'
    : /3\s*[:：]\s*4/.test(userPrompt)
      ? '3:4'
      : /16\s*[:：]\s*9/.test(userPrompt)
        ? '16:9'
        : 'auto';

  if (!GRSAI_API_KEY) {
    throw new Error('缺少 OPENAI_API_KEY，请先配置 GPT Image 2 接口密钥');
  }

  const response = await fetch(grsaiGenerateUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GRSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      images,
      aspectRatio,
      replyType: 'json',
    }),
  });

  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`GPT Image 返回非 JSON：${raw.slice(0, 240)}`);
  }

  if (!response.ok || result?.status === 'failed' || result?.status === 'violation') {
    const message = typeof result?.error === 'string'
      ? result.error
      : result?.error
        ? JSON.stringify(result.error)
        : result?.message || raw || `HTTP ${response.status}`;
    throw new Error(`图片生成失败：${message}`);
  }

  const imageUrl = Array.isArray(result?.results) ? result.results[0]?.url : '';
  if (!imageUrl) {
    throw new Error('图片生成完成但没有拿到结果地址');
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`结果图片下载失败：HTTP ${imageResponse.status}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  await writeFile(outputPath, imageBuffer);

  return {
    id: packageId,
    title: 'AI创作结果',
    sourcePath: `outputs/image-ai/${outputName}`,
    fileName: outputName,
    url: publicUrl(`/outputs/image-ai/${outputName}`),
    prompt,
    stdout: wantsText ? 'text-enabled' : 'text-disabled',
    stderr: '',
  };
}

async function fetchMiniMaxSubtitle(subtitleUrl) {
  if (!subtitleUrl) return [];
  const response = await fetch(subtitleUrl);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`字幕文件下载失败：HTTP ${response.status}`);
  }
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    throw new Error(`字幕文件不是 JSON：${raw.slice(0, 180)}`);
  }
}

function normalizeSubtitleItems(items, offsetMs = 0) {
  const list = Array.isArray(items) ? items : [];
  return list.flatMap((item) => {
    const segmentStart = Number(item.time_begin || 0);
    const words = Array.isArray(item.timestamped_words) ? item.timestamped_words : [];
    if (words.length > 0) {
      return words.map((word) => ({
        text: word.word,
        startMs: Math.round(offsetMs + Number(word.time_begin || segmentStart || 0)),
        endMs: Math.round(offsetMs + Number(word.time_end || item.time_end || segmentStart || 0)),
        textBegin: word.word_begin,
        textEnd: word.word_end,
        granularity: 'word',
      }));
    }
    return [{
      text: item.text,
      startMs: Math.round(offsetMs + Number(item.time_begin || 0)),
      endMs: Math.round(offsetMs + Number(item.time_end || 0)),
      textBegin: item.text_begin,
      textEnd: item.text_end,
      granularity: 'sentence',
    }];
  });
}

async function synthesizeVoiceSegment({ slice, index, settings, outputDir, packageId }) {
  const result = await callMiniMaxTts({
    ...settings,
    text: slice.text,
    subtitleEnable: true,
    subtitleType: 'word',
  });
  const audioHex = result?.data?.audio || '';
  const audioFormat = result?.extra_info?.audio_format || 'mp3';
  const durationMs = Math.round(Number(result?.extra_info?.audio_length || 0));
  const baseName = `${String(index + 1).padStart(2, '0')}-${safeFileName(slice.name)}`;
  const audioName = `${baseName}.${audioFormat}`;
  const subtitleName = `${baseName}.titles.json`;
  const audioPath = path.join(outputDir, audioName);
  const subtitlePath = path.join(outputDir, subtitleName);
  const rawSubtitle = await fetchMiniMaxSubtitle(result?.data?.subtitle_file);
  await writeFile(audioPath, hexToBuffer(audioHex));
  await writeFile(subtitlePath, JSON.stringify(rawSubtitle, null, 2));
  return {
    name: slice.name,
    text: slice.text,
    durationMs,
    audioName,
    subtitleName,
    audioUrl: publicUrl(`/outputs/voice-packages/${packageId}/${audioName}`),
    subtitleUrl: publicUrl(`/outputs/voice-packages/${packageId}/${subtitleName}`),
    rawSubtitle,
    extraInfo: result?.extra_info || {},
  };
}

async function synthesizeVoicePackageFull({ slices, settings, outputDir, packageId }) {
  const text = slices
    .map((slice) => String(slice.text || '').trim())
    .filter(Boolean)
    .join('');
  const result = await callMiniMaxTts({
    ...settings,
    text,
    subtitleEnable: true,
    subtitleType: 'word',
  });
  const audioHex = result?.data?.audio || '';
  const audioFormat = result?.extra_info?.audio_format || 'mp3';
  const durationMs = Math.round(Number(result?.extra_info?.audio_length || 0));
  const audioName = `full-voice.${audioFormat}`;
  const subtitleName = 'full-voice.titles.json';
  const audioPath = path.join(outputDir, audioName);
  const subtitlePath = path.join(outputDir, subtitleName);
  const rawSubtitle = await fetchMiniMaxSubtitle(result?.data?.subtitle_file);
  await writeFile(audioPath, hexToBuffer(audioHex));
  await writeFile(subtitlePath, JSON.stringify(rawSubtitle, null, 2));
  return {
    name: '完整口播',
    text,
    durationMs,
    audioName,
    subtitleName,
    audioUrl: publicUrl(`/outputs/voice-packages/${packageId}/${audioName}`),
    subtitleUrl: publicUrl(`/outputs/voice-packages/${packageId}/${subtitleName}`),
    rawSubtitle,
    extraInfo: result?.extra_info || {},
  };
}

function normalizeVoiceHandoff(handoff = {}) {
  return {
    title: handoff.title || '',
    voiceId: handoff.voiceId || '',
    generatedAt: handoff.generatedAt || new Date().toISOString(),
    totalDurationMs: Number(handoff.totalDurationMs || 0),
    segments: Array.isArray(handoff.segments) ? handoff.segments : [],
  };
}

function normalizeTimelineText(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function buildVisualTimeline(scriptSplitResult = {}, subtitles = [], durationMs = 0) {
  const cleanScript = normalizeTimelineText(scriptSplitResult.cleanScript || scriptSplitResult.scriptText || '');
  const groups = Array.isArray(scriptSplitResult.visualGroups) ? scriptSplitResult.visualGroups : [];
  if (!cleanScript || !groups.length) return [];

  let cursor = 0;
  return groups.map((group, index) => {
    const text = normalizeTimelineText(group.text || '');
    const foundIndex = text ? cleanScript.indexOf(text, cursor) : -1;
    const startChar = foundIndex >= 0 ? foundIndex : cursor;
    const endChar = Math.max(startChar + text.length, startChar + 1);
    cursor = Math.min(cleanScript.length, endChar);

    const matchedSubtitles = subtitles.filter((item) => {
      const begin = Number(item.textBegin);
      const end = Number(item.textEnd);
      return Number.isFinite(begin) && Number.isFinite(end) && end > startChar && begin < endChar;
    });
    const fallbackStart = Math.round((startChar / Math.max(cleanScript.length, 1)) * durationMs);
    const fallbackEnd = Math.round((endChar / Math.max(cleanScript.length, 1)) * durationMs);
    const startMs = matchedSubtitles.length ? matchedSubtitles[0].startMs : fallbackStart;
    const endMs = matchedSubtitles.length ? matchedSubtitles[matchedSubtitles.length - 1].endMs : fallbackEnd;

    return {
      id: group.id || `visual-${String(index + 1).padStart(3, '0')}`,
      order: index + 1,
      blockId: group.blockId || '',
      blockRole: group.blockRole || '',
      text: group.text || '',
      materialType: group.materialType || 'general',
      startMs,
      endMs: Math.max(endMs, startMs + 120),
      durationMs: Math.max(endMs - startMs, 120),
    };
  });
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
        service: 'mimo-ai-server',
        model: MIMO_MODEL,
        baseUrl: MIMO_BASE_URL,
        hasKey: Boolean(MIMO_API_KEY),
        videoModel: MIMO_VIDEO_MODEL,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/generate-script') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(generatePrompt(payload));
      sendJson(res, 200, {
        ok: true,
        scripts: normalizeScriptItems(result.scripts, payload.currentScript),
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/refine-line') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(refinePrompt(payload));
      const text = String(result.text || '').trim();
      if (!text) throw new Error('AI 返回格式错误：缺少 text');
      sendJson(res, 200, { ok: true, text, raw: result });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/refine-script') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(scriptRefinePrompt(payload));
      sendJson(res, 200, {
        ok: true,
        scripts: normalizeScriptItems(result.scripts, payload.currentScript),
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/check-material-support') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(materialSupportPrompt(payload));
      sendJson(res, 200, {
        ok: true,
        supported: Boolean(result.supported),
        reason: result.reason || '',
        unsupportedClaims: Array.isArray(result.unsupportedClaims) ? result.unsupportedClaims : [],
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/check-grammar') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(grammarCheckPrompt(payload));
      sendJson(res, 200, {
        ok: true,
        supported: Boolean(result.supported),
        reason: result.reason || '',
        issues: Array.isArray(result.issues) ? result.issues : [],
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/package-video') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(packagePrompt(payload));
      sendJson(res, 200, {
        ok: true,
        packageConfig: {
          subtitleStyle: result.subtitleStyle || {},
          overlays: Array.isArray(result.overlays) ? result.overlays : [],
          transitions: result.transitions || {},
          effects: result.effects || {},
          summary: Array.isArray(result.summary) ? result.summary : [],
        },
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/text-production') {
      const payload = JSON.parse(await readBody(req) || '{}');
      if (!String(payload.inputText || '').trim()) {
        throw new Error('缺少输入文本');
      }
      let result;
      try {
        result = await callMimo(textProductionPrompt(payload));
      } catch (error) {
        if (!error.rawContent) throw error;
        sendJson(res, 200, {
          ok: true,
          type: 'script-variation-result',
          mode: 'scriptVariation',
          scriptText: cleanScriptText(error.rawContent),
          payload: {
            scriptText: cleanScriptText(error.rawContent),
            warning: '模型返回了非严格 JSON，已保留原文供编辑保存。',
          },
          raw: { rawText: error.rawContent },
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        type: 'script-variation-result',
        mode: 'scriptVariation',
        scriptText: extractTextProductionScriptText(result),
        payload: {
          scriptText: extractTextProductionScriptText(result),
        },
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/script-split') {
      const payload = JSON.parse(await readBody(req) || '{}');
      if (!String(payload.scriptText || '').trim()) {
        throw new Error('缺少上游脚本字段 scriptText：请先重新执行文本生产节点，确保它产出纯净脚本字段');
      }
      const cleanScript = String(payload.scriptText || '').replace(/\s+/g, '').trim();
      const punctuationSegments = splitScriptSegments(cleanScript);
      if (!cleanScript || !punctuationSegments.length) {
        throw new Error('未能从上游内容中提取到可拆解脚本');
      }
      let result;
      const startedAt = Date.now();
      try {
        result = await callMimo(scriptSplitPrompt({
          ...payload,
          cleanScript,
          punctuationSegments,
        }));
      } catch (error) {
        console.warn(`[script-split] MiMo failed after ${Date.now() - startedAt}ms: ${error.message}`);
        if (!error.rawContent) throw error;
        const fallbackResult = normalizeScriptSplitServerResult({
          ok: true,
          type: 'script-split-result',
          contentBlocks: [],
          scriptMaterialOverview: {
            materialDirections: [],
            visualTone: '',
            notes: '模型返回非严格 JSON，未生成素材方向概览。',
          },
          warning: '模型返回了非严格 JSON，已保留原文供编辑保存。',
          raw: { rawText: error.rawContent },
        }, cleanScript, punctuationSegments);
        sendJson(res, 200, {
          ...fallbackResult,
          warning: '模型返回了非严格 JSON，已使用程序兜底拆解。',
        });
        return;
      }
      console.log(`[script-split] MiMo ${Date.now() - startedAt}ms, segments=${punctuationSegments.length}`);
      sendJson(res, 200, normalizeScriptSplitServerResult(result, cleanScript, punctuationSegments));
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/material-package') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const scriptSplitResult = payload.scriptSplitResult && typeof payload.scriptSplitResult === 'object'
        ? payload.scriptSplitResult
        : null;
      const blocks = Array.isArray(scriptSplitResult?.contentBlocks) ? scriptSplitResult.contentBlocks : [];
      if (!scriptSplitResult || !blocks.length) {
        throw new Error('素材包生成缺少脚本拆解结果：请先连接并执行脚本拆解节点');
      }
      const promptBlocks = blocks.map((block) => ({
        blockId: block.id,
        role: block.role,
        items: (block.visualUnits || []).map((unit) => ({
          unitId: unit.id,
          text: unit.text,
          materialType: unit.materialType,
        })),
      }));
      let result;
      const startedAt = Date.now();
      try {
        result = await callMimo(materialPackagePrompt({
          ...payload,
          blocks: promptBlocks,
        }));
      } catch (error) {
        console.warn(`[material-package] MiMo failed after ${Date.now() - startedAt}ms: ${error.message}`);
        result = {
          ok: true,
          type: 'material-package-plan',
          blocks: promptBlocks.map((block) => ({
            blockId: block.blockId,
            blockFolderName: block.role,
            items: block.items.map((item) => ({
              unitId: item.unitId,
              folderName: item.text,
            })),
          })),
          warning: error.rawContent ? '模型返回非严格 JSON，已使用文本兜底命名。' : error.message,
        };
      }
      const plan = normalizeMaterialPackagePlan(result, scriptSplitResult, payload);
      const files = await createMaterialPackageFiles(plan);
      console.log(`[material-package] MiMo ${Date.now() - startedAt}ms, blocks=${plan.blocks.length}`);
      sendJson(res, 200, {
        ...plan,
        ...files,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/material-upload') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const packageDir = path.resolve(String(payload.packageDir || ''));
      const materialRoot = path.join(root, 'outputs', 'material-packages');
      if (!packageDir || !packageDir.startsWith(materialRoot) || !existsSync(packageDir)) {
        throw new Error('素材上传缺少有效素材包目录');
      }
      const blockDirName = `${String(payload.blockOrder || 1).padStart(2, '0')}_${safePackageName(payload.blockFolderName || '主旨段')}`;
      const itemDirName = `${String(payload.itemOrder || 1).padStart(2, '0')}_${safePackageName(payload.itemFolderName || '画面素材')}`;
      const targetDir = path.join(packageDir, blockDirName, itemDirName);
      if (!targetDir.startsWith(packageDir)) throw new Error('素材上传路径非法');
      await mkdir(targetDir, { recursive: true });
      const { mimeType, buffer } = bufferFromDataUrl(payload.dataUrl);
      const savedName = safeUploadedFileName(payload.fileName || 'asset');
      const savedPath = path.join(targetDir, savedName);
      await writeFile(savedPath, buffer);
      sendJson(res, 200, {
        ok: true,
        type: 'material-upload-result',
        unitId: payload.unitId || '',
        fileName: savedName,
        originalName: payload.fileName || '',
        mimeType,
        size: buffer.length,
        savedPath,
        savedAt: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/video-recognition') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
      const hasUrl = payload.sourceType === 'url' && String(payload.videoUrl || '').trim();
      const hasLocalData = payload.sourceType !== 'url' && String(payload.videoDataUrl || '').startsWith('data:video/');
      const hasLocalFrames = payload.sourceType !== 'url'
        && Array.isArray(payload.frameDataUrls)
        && payload.frameDataUrls.length > 0;
      if (!hasUrl && !hasLocalData && !hasLocalFrames) {
        throw new Error('缺少视频输入：请上传本地视频或填写视频 URL');
      }
      if (hasUrl && !/^https?:\/\//i.test(String(payload.videoUrl || '').trim())) {
        throw new Error('视频 URL 必须是公网 http(s) 地址，不能填写本机路径或 file:// 地址');
      }
      if (hasLocalData && Buffer.byteLength(payload.videoDataUrl, 'utf8') > 70 * 1024 * 1024) {
        throw new Error('本地视频超过可直传大小，请改用视频 URL 或上传 50MB 以内的视频');
      }

      let result;
      let fallback = '';
      try {
        if (hasLocalFrames && !hasLocalData) {
          fallback = 'frame-extraction';
          result = await callMimoVideo(videoFrameRecognitionPrompt({
            ...payload,
            outputs,
          }));
        } else {
          result = await callMimoVideo(videoRecognitionPrompt({
            ...payload,
            outputs,
          }));
        }
      } catch (error) {
        const canRetryUrlAsData = payload.sourceType === 'url'
          && /download or process media content|media content/i.test(error.message);
        if (canRetryUrlAsData) {
          try {
            const videoDataUrl = await fetchVideoAsDataUrl(payload.videoUrl);
            fallback = 'url-downloaded-as-data-url';
            result = await callMimoVideo(videoRecognitionPrompt({
              ...payload,
              sourceType: 'local',
              videoDataUrl,
              localFile: path.basename(new URL(payload.videoUrl).pathname) || 'url-video',
              outputs,
            }));
          } catch (retryError) {
            throw new Error(`${error.message}；URL 重试失败：${retryError.message}`);
          }
        } else {
          const canFallbackToFrames = payload.sourceType !== 'url'
          && /download or process media content|media content|Param Incorrect/i.test(error.message)
          && Array.isArray(payload.frameDataUrls)
          && payload.frameDataUrls.length > 0;
          if (!canFallbackToFrames) throw error;
          fallback = 'frame-extraction';
          result = await callMimoVideo(videoFrameRecognitionPrompt({
            ...payload,
            outputs,
          }));
        }
      }
      const normalizedPayload = result.payload && Object.values(result.payload).some((value) => (
        value && (typeof value !== 'object' || Object.keys(value).length > 0)
      ))
        ? result.payload
        : (result.outputs && !Array.isArray(result.outputs) ? result.outputs : result);
      sendJson(res, 200, {
        ok: true,
        type: 'video-recognition-result',
        sourceType: payload.sourceType || 'local',
        source: payload.sourceType === 'url'
          ? payload.videoUrl
          : (payload.localFile || payload.localAsset?.name || '本地视频'),
        outputs,
        fallback: fallback || result.fallback || '',
        payload: normalizedPayload,
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/assistant') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMimo(assistantPrompt(payload));
      const reply = String(result.reply || result.text || '').trim();
      if (!reply) throw new Error('AI 返回格式错误：缺少 reply');
      sendJson(res, 200, {
        ok: true,
        reply,
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/search-images') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const prompt = String(payload.prompt || '').trim();
      if (!prompt) throw new Error('缺少 prompt');

      const assets = await loadImageAssetTags();
      const intent = detectImageSearchIntent(prompt);
      const ranked = assets
        .map((asset) => ({ ...asset, score: scoreAsset(prompt, asset) }))
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh-Hans-CN'));
      const intentRanked = intent === 'general'
        ? ranked
        : ranked.filter((asset) => assetMatchesIntent(asset, intent));
      const searchRanked = intentRanked.length > 0 ? intentRanked : ranked;

      const candidatePool = searchRanked.slice(0, 12).map((asset) => ({
        id: asset.id,
        title: asset.title,
        category: asset.category,
        tags: asset.tags,
        description: asset.description,
        sourcePath: asset.sourcePath,
      }));

      let result = null;
      try {
        result = await callMimo(imageSearchPrompt({ prompt, candidates: candidatePool }));
      } catch {
        result = null;
      }

      let chosen = [];
      if (result && Array.isArray(result.matches)) {
        const idSet = new Set(result.matches.map((item) => String(item.id)));
        chosen = ranked.filter((asset) => idSet.has(asset.id));
      }
      if (chosen.length < 12) {
        for (const asset of searchRanked) {
          if (!chosen.some((item) => item.id === asset.id)) {
            chosen.push(asset);
          }
          if (chosen.length >= 12) break;
        }
      }

      const matches = chosen.slice(0, 12).map((asset) => ({
        id: asset.id,
        title: asset.title,
        url: asset.url,
        tagFile: asset.tagFile,
        sourcePath: asset.sourcePath,
        fileName: path.basename(asset.sourcePath),
        tags: asset.tags,
        description: asset.description,
        reason: result?.matches?.find((item) => String(item.id) === asset.id)?.reason
          || `标签命中：${asset.tags.slice(0, 4).join('、')}`,
      }));

      const reply = result?.reply
        || `已为你找到 ${matches.length} 张相关图片，优先匹配你的搜索主题。`;

      sendJson(res, 200, {
        ok: true,
        reply,
        matches,
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/ai/process-images') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const generated = await processImagesWithAi(payload);
      sendJson(res, 200, {
        ok: true,
        reply: '已基于所选图片完成 AI 创作。',
        generated,
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/tts/voices') {
      let voices = minimaxVoicePresets;
      let source = 'fallback';
      let warning = '';
      try {
        voices = await callMiniMaxVoiceList();
        source = 'api';
      } catch (error) {
        warning = error.message;
      }
      sendJson(res, 200, {
        ok: true,
        provider: 'minimax',
        model: MINIMAX_TTS_MODEL,
        source,
        warning,
        count: voices.length,
        voices,
        hasKey: Boolean(MINIMAX_API_KEY),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/tts/audition') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const result = await callMiniMaxTts(payload);
      const audioHex = result?.data?.audio || '';
      const audioFormat = result?.extra_info?.audio_format || 'mp3';
      const outputDir = path.join(root, 'outputs', 'tts-auditions');
      await mkdir(outputDir, { recursive: true });
      const fileName = `${String(payload.voiceId || 'voice').replace(/[^a-zA-Z0-9_-]+/g, '_')}-${Date.now()}-${randomUUID().slice(0, 8)}.${audioFormat}`;
      const filePath = path.join(outputDir, fileName);
      await writeFile(filePath, hexToBuffer(audioHex));
      sendJson(res, 200, {
        ok: true,
        provider: 'minimax',
        model: MINIMAX_TTS_MODEL,
        outputName: fileName,
        audioUrl: publicUrl(`/outputs/tts-auditions/${fileName}`),
        extraInfo: result?.extra_info || {},
        raw: result,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/tts/voice-package') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const slices = Array.isArray(payload.slices) ? payload.slices : [];
      if (slices.length === 0) {
        throw new Error('缺少口播分段 slices');
      }
      const packageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
      const outputDir = path.join(root, 'outputs', 'voice-packages', packageId);
      await mkdir(outputDir, { recursive: true });
      const settings = {
        voiceId: payload.voiceId,
        speed: payload.speed,
        vol: payload.vol,
        pitch: payload.pitch,
        emotion: payload.emotion,
        pronunciationDict: payload.pronunciationDict,
      };
      const fullVoice = await synthesizeVoicePackageFull({
        slices,
        settings,
        outputDir,
        packageId,
      });
      const offsetMs = fullVoice.durationMs;
      const subtitles = normalizeSubtitleItems(fullVoice.rawSubtitle, 0);
      const visualTimeline = buildVisualTimeline(payload.handoff?.scriptSplitResult, subtitles, offsetMs);
      const segments = [{
        ...fullVoice,
        startMs: 0,
        endMs: offsetMs,
        subtitles,
      }];
      const timeline = {
        packageId,
        title: payload.title || 'voice-package',
        voiceId: payload.voiceId,
        generatedAt: new Date().toISOString(),
        durationMs: offsetMs,
        segments: segments.map(({ rawSubtitle, ...segment }) => segment),
        subtitles,
        visualTimeline,
      };
      const handoff = normalizeVoiceHandoff({
        ...payload.handoff,
        title: payload.title || 'voice-package',
        voiceId: payload.voiceId,
        totalDurationMs: offsetMs,
        segments: visualTimeline,
      });
      const timelineName = 'voice-timeline.json';
      const handoffName = 'voice-handoff.json';
      await writeFile(path.join(outputDir, timelineName), JSON.stringify(timeline, null, 2));
      await writeFile(path.join(outputDir, handoffName), JSON.stringify(handoff, null, 2));
      sendJson(res, 200, {
        ok: true,
        type: 'voice-package-result',
        provider: 'minimax',
        model: MINIMAX_TTS_MODEL,
        packageId,
        durationMs: offsetMs,
        audioUrl: fullVoice.audioUrl,
        audioName: fullVoice.audioName,
        subtitleUrl: fullVoice.subtitleUrl,
        text: fullVoice.text,
        timelineUrl: publicUrl(`/outputs/voice-packages/${packageId}/${timelineName}`),
        handoffUrl: publicUrl(`/outputs/voice-packages/${packageId}/${handoffName}`),
        segments: timeline.segments,
        subtitles: timeline.subtitles,
        visualTimeline,
        handoff,
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/outputs/tts-auditions/')) {
      const fileName = decodeURIComponent(req.url.replace('/outputs/tts-auditions/', ''));
      const filePath = path.join(root, 'outputs', 'tts-auditions', fileName);
      if (!existsSync(filePath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const file = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `inline; filename="${safeFileName(fileName)}"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(file);
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/outputs/voice-packages/')) {
      const relativePath = decodeURIComponent(req.url.replace('/outputs/voice-packages/', ''));
      const filePath = path.join(root, 'outputs', 'voice-packages', relativePath);
      if (!filePath.startsWith(path.join(root, 'outputs', 'voice-packages')) || !existsSync(filePath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const file = await readFile(filePath);
      const contentType = filePath.endsWith('.json') ? 'application/json; charset=utf-8' : 'audio/mpeg';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safeFileName(path.basename(filePath))}"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(file);
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && req.url?.startsWith('/outputs/material-packages/')) {
      const requestUrl = new URL(req.url, PUBLIC_AI_BASE_URL);
      const relativePath = decodeURIComponent(requestUrl.pathname.replace('/outputs/material-packages/', ''));
      const filePath = path.join(root, 'outputs', 'material-packages', relativePath);
      if (!filePath.startsWith(path.join(root, 'outputs', 'material-packages')) || !existsSync(filePath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const file = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentTypeForFile(filePath),
        'Content-Disposition': `attachment; filename="${safeFileName(path.basename(filePath, path.extname(filePath)))}${path.extname(filePath)}"`,
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(file);
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/outputs/image-ai/')) {
      const fileName = decodeURIComponent(req.url.replace('/outputs/image-ai/', ''));
      const filePath = path.join(root, 'outputs', 'image-ai', fileName);
      if (!filePath.startsWith(path.join(root, 'outputs', 'image-ai')) || !existsSync(filePath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const file = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentTypeForFile(filePath),
        'Content-Disposition': `inline; filename="${safeFileName(path.basename(filePath))}"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(file);
      return;
    }

    const materialAssetUrl = new URL(req.url, PUBLIC_AI_BASE_URL);
    if (req.method === 'GET' && materialAssetUrl.pathname === '/material-assets') {
      const sourcePath = materialAssetUrl.searchParams.get('path') || '';
      const fullPath = path.resolve(root, sourcePath);
      if (!sourcePath || !fullPath.startsWith(path.join(MATERIAL_ROOT, '图片')) || !existsSync(fullPath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const file = await readFile(fullPath);
      res.writeHead(200, {
        'Content-Type': contentTypeForFile(fullPath),
        'Content-Disposition': `inline; filename="${safeFileName(path.basename(fullPath))}"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(file);
      return;
    }

    if (req.method === 'GET' && materialAssetUrl.pathname === '/seed-assets') {
      const sourcePath = materialAssetUrl.searchParams.get('path') || '';
      const fullPath = path.resolve(root, sourcePath);
      if (!sourcePath || !fullPath.startsWith(path.join(MATERIAL_ROOT, '种子内容')) || !existsSync(fullPath)) {
        sendJson(res, 404, { ok: false, error: 'File not found' });
        return;
      }
      const file = await readFile(fullPath);
      res.writeHead(200, {
        'Content-Type': contentTypeForFile(fullPath),
        'Content-Disposition': `attachment; filename="${safeFileName(path.basename(fullPath))}${path.extname(fullPath)}"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(file);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} failed:`, error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MiMo AI server listening on http://0.0.0.0:${PORT}`);
});

const canvasServer = createServer(serveWorkflowCanvas);
canvasServer.listen(CANVAS_PORT, '0.0.0.0', () => {
  console.log(`Workflow canvas server listening on http://0.0.0.0:${CANVAS_PORT}/workflow-canvas.html`);
});

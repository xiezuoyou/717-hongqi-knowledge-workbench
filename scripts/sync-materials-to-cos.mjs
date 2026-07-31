import COS from 'cos-nodejs-sdk-v5';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function loadEnv() {
  const envPaths = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
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

const COS_SECRET_ID = process.env.COS_SECRET_ID || '';
const COS_SECRET_KEY = process.env.COS_SECRET_KEY || '';
const COS_SESSION_TOKEN = process.env.COS_SESSION_TOKEN || '';
const COS_BUCKET = process.env.COS_BUCKET || '';
const COS_REGION = process.env.COS_REGION || 'ap-beijing';
const COS_MATERIAL_PREFIX = String(process.env.COS_MATERIAL_PREFIX || '素材库/')
  .replace(/^\/+/, '')
  .replace(/\/?$/, '/');
const materialRoot = path.join(root, '素材库');
const shouldCommit = process.argv.includes('--commit');

if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION) {
  throw new Error('COS 未配置完整，请补充 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION');
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
  };
  return types[ext] || 'application/octet-stream';
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function cosKeyForFile(filePath) {
  const relative = path.relative(materialRoot, filePath).split(path.sep).join('/');
  return `${COS_MATERIAL_PREFIX}${relative}`.replace(/\/+/g, '/');
}

function putObject(client, key, body, contentType) {
  return new Promise((resolve, reject) => {
    client.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: body,
      ContentType: contentType,
    }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

const files = await walkFiles(materialRoot);
const totalBytes = (await Promise.all(files.map((file) => stat(file)))).reduce((sum, item) => sum + item.size, 0);

console.log(`${shouldCommit ? '开始上传' : '预览同步'}：${files.length} 个文件，${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`目标：cos://${COS_BUCKET}/${COS_MATERIAL_PREFIX}`);

if (!shouldCommit) {
  for (const file of files.slice(0, 20)) {
    console.log(`- ${path.relative(root, file)} -> ${cosKeyForFile(file)}`);
  }
  if (files.length > 20) console.log(`... 还有 ${files.length - 20} 个文件`);
  console.log('确认无误后执行：pnpm cos:sync');
  process.exit(0);
}

const client = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
  SecurityToken: COS_SESSION_TOKEN || undefined,
  FileParallelLimit: 5,
  ChunkParallelLimit: 5,
});

let uploaded = 0;
let uploadedBytes = 0;
for (const file of files) {
  const body = await readFile(file);
  const key = cosKeyForFile(file);
  await putObject(client, key, body, contentTypeForFile(file));
  uploaded += 1;
  uploadedBytes += body.length;
  console.log(`[${uploaded}/${files.length}] ${path.relative(root, file)} -> ${key}`);
}

console.log(`同步完成：${uploaded} 个文件，${(uploadedBytes / 1024 / 1024).toFixed(2)} MB`);

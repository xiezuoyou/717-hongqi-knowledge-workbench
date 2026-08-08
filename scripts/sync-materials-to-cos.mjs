#!/usr/bin/env node
/**
 * Push 素材库 media to COS so the frontend can load it from CDN instead of
 * bundling it into dist/.
 *
 * Why this exists: main.tsx asks for /assets/717-demo/stage-01..04.jpg and
 * seed-delivery-demo.mp4. Those files were never placed in public/, so the seed
 * pages render broken images. The real photos DO exist in 素材库/图片/, they are
 * just named by content hash. This script uploads them under the stable keys the
 * frontend already expects, then the frontend only needs VITE_ASSET_BASE set to
 * the CDN origin.
 *
 * Dry run by default — prints exactly what would upload and to which key.
 * Pass --commit to actually upload. Requires COS_SECRET_ID / COS_SECRET_KEY /
 * COS_BUCKET / COS_REGION in .env (same vars scripts/storage-server.mjs uses).
 *
 *   pnpm cos:sync:dry     # inspect the plan
 *   pnpm cos:sync         # upload
 *   pnpm assets:local     # no credentials: copy the same slots into public/assets/
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const commit = process.argv.includes("--commit");
const localOnly = process.argv.includes("--local");

/** Minimal .env reader — avoids adding a dotenv dependency just for this. */
const loadEnvFile = () => {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadEnvFile();

/**
 * Fall back to the credentials tccli already holds, so nobody has to copy
 * secrets into .env just to run this script.
 *
 * Note: tccli stores TEMPORARY credentials (secretId/secretKey plus a session
 * token with an expiry). The COS SDK therefore needs XCosSecurityToken as well,
 * and the token WILL expire — re-login with tccli if uploads start returning
 * auth errors. Values are never printed.
 */
const loadTccliCredential = () => {
  if (process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY) return null;
  const credentialPath = path.join(
    process.env.HOME || "",
    ".tccli/default.credential",
  );
  if (!fs.existsSync(credentialPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
    if (!parsed.secretId || !parsed.secretKey) return null;
    process.env.COS_SECRET_ID = parsed.secretId;
    process.env.COS_SECRET_KEY = parsed.secretKey;
    if (parsed.token) process.env.COS_SECURITY_TOKEN = parsed.token;
    const expiresAt = Number(parsed.expiresAt) || 0;
    return { expiresAt, expired: expiresAt > 0 && expiresAt * 1000 < Date.now() };
  } catch {
    return null;
  }
};

const tccliCredential = loadTccliCredential();

const IMAGE_DIR = path.join(projectRoot, "素材库/图片/717粉丝盛典/晚会");

/**
 * The four stage slots the seed pages reference, mapped to real photos.
 * Chosen from 素材库/标签MD/ descriptions so each slot gets a fitting frame:
 *   main        主视觉    → 粉丝盛典红旗天工之夜大屏
 *   crowd       传播画面  → 雨中舞台全景
 *   interaction 互动瞬间  → 红色舞台群演（观众灯牌）
 *   product     产品露出  → 红旗天工之夜舞台字
 */
const STAGE_SLOTS = [
  { key: "717-demo/stage-01.jpg", source: "9f63f255e0d70e305df3244e62a77345.jpg", note: "主视觉 / 天工之夜大屏" },
  { key: "717-demo/stage-02.jpg", source: "c9c9cdf89851d1596b6e78204a94bd91.jpg", note: "传播画面 / 雨中舞台全景" },
  { key: "717-demo/stage-03.jpg", source: "3d1003b23c943df40e4101283ca9d2b1.jpg", note: "互动瞬间 / 红色舞台群演" },
  { key: "717-demo/stage-04.jpg", source: "4d2db532d6636e1dd70e7b2b1f390796.jpg", note: "产品露出 / 天工之夜舞台字" },
];

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Build the upload plan without touching the network. */
const buildPlan = () => {
  const plan = [];
  const missing = [];

  for (const slot of STAGE_SLOTS) {
    const absolute = path.join(IMAGE_DIR, slot.source);
    if (!fs.existsSync(absolute)) {
      missing.push({ ...slot, absolute });
      continue;
    }
    plan.push({
      key: slot.key,
      absolute,
      note: slot.note,
      size: fs.statSync(absolute).size,
      contentType: MIME_BY_EXT[path.extname(absolute).toLowerCase()] || "application/octet-stream",
    });
  }

  // Everything else in the gala folder goes up under a browsable prefix so the
  // knowledge base and 素材查找 have real files to point at later.
  if (fs.existsSync(IMAGE_DIR)) {
    const claimed = new Set(STAGE_SLOTS.map((slot) => slot.source));
    for (const name of fs.readdirSync(IMAGE_DIR).sort()) {
      const ext = path.extname(name).toLowerCase();
      if (!MIME_BY_EXT[ext]) continue;
      const absolute = path.join(IMAGE_DIR, name);
      plan.push({
        key: `717-gala/${name}`,
        absolute,
        note: claimed.has(name) ? "同时作为 stage 槽位使用" : "素材库原图",
        size: fs.statSync(absolute).size,
        contentType: MIME_BY_EXT[ext],
      });
    }
  }

  return { plan, missing };
};

const { plan, missing } = buildPlan();

const bucket = process.env.COS_BUCKET || "";
const region = process.env.COS_REGION || "";
const cdnBase = (process.env.COS_CDN_BASE || "").replace(/\/+$/, "");
const origin = cdnBase || (bucket && region ? `https://${bucket}.cos.${region}.myqcloud.com` : "");

// Objects are uploaded under this prefix, so the frontend base must include it.
// Printing the origin alone yields a 404 — that mistake shipped once already.
const prefix = (process.env.COS_ASSET_PREFIX || "assets").replace(/^\/+|\/+$/g, "");
const publicBase = origin ? (prefix ? `${origin}/${prefix}` : origin) : "";

console.log(`\n=== 上传计划（${commit ? "真实上传" : "dry-run，未上传"}）===`);
if (!plan.length) {
  console.log("  没有可上传的文件，检查 素材库/图片/717粉丝盛典/晚会 是否存在。");
} else {
  const total = plan.reduce((sum, item) => sum + item.size, 0);
  for (const item of plan) {
    console.log(`  ${item.key.padEnd(46)} ${formatBytes(item.size).padStart(8)}  ${item.note}`);
  }
  console.log(`  ---- 共 ${plan.length} 个文件，${formatBytes(total)}`);
}

if (missing.length) {
  console.log("\n=== 找不到的源文件（stage 槽位会继续碎图）===");
  for (const item of missing) {
    console.log(`  ${item.key} ← ${path.relative(projectRoot, item.absolute)}`);
  }
}

console.log("\n=== 前端怎么用 ===");
if (publicBase) {
  console.log(`  在 .env 里配 VITE_ASSET_BASE=${publicBase}`);
  console.log(`  配好后 stage-01 解析到 ${publicBase}/717-demo/stage-01.jpg`);
} else {
  console.log("  配好 COS_BUCKET / COS_REGION（或 COS_CDN_BASE）后这里会打印该填的 VITE_ASSET_BASE。");
}
console.log("  没配 VITE_ASSET_BASE 时前端回落到 /assets，也就是当前的本地行为。");

// --local: copy the same slot mapping into public/ instead of uploading. No
// credentials, no bucket, no CDN — the seed pages just stop showing broken
// images while the COS decision is still open. public/assets/717-demo/ is
// gitignored, so these copies never enter the repo or a production build.
if (localOnly) {
  const targetDir = path.join(projectRoot, "public/assets/717-demo");
  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  for (const item of plan) {
    if (!item.key.startsWith("717-demo/")) continue;
    fs.copyFileSync(item.absolute, path.join(projectRoot, "public/assets", item.key));
    copied += 1;
  }
  console.log(`\n=== 本地模式 ===`);
  console.log(`  已复制 ${copied} 个文件到 public/assets/717-demo/（该目录已 gitignore）`);
  console.log("  不要配 VITE_ASSET_BASE，前端回落到 /assets 就能读到这些图。");
  console.log("  这是过渡方案：COS 桶和 CDN 域名定下来后改用 --commit。\n");
  process.exit(0);
}

if (!commit) {
  console.log("\n加 --local 复制到本地 public/（无需凭证），或 --commit 真正上传到 COS。\n");
  process.exit(0);
}

const requiredEnv = ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"];
const absent = requiredEnv.filter((name) => !process.env[name]);
if (absent.length) {
  console.error(`\n缺少环境变量：${absent.join(", ")}`);
  console.error("在项目根目录建 .env（参考 .env.example）后重试。凭证不会被打印。\n");
  process.exit(1);
}

const { default: COS } = await import("cos-nodejs-sdk-v5");

// tccli stores TEMPORARY credentials (STS), so a session token is required and
// the whole thing expires. Long-term keys in .env have no token — pass it only
// when present, otherwise COS rejects the empty header.
const securityToken = process.env.COS_SECURITY_TOKEN || "";
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
  ...(securityToken ? { SecurityToken: securityToken } : {}),
});

let uploaded = 0;
let failed = 0;

for (const item of plan) {
  const objectKey = prefix ? `${prefix}/${item.key}` : item.key;
  try {
    await cos.putObject({
      Bucket: bucket,
      Region: region,
      Key: objectKey,
      Body: fs.createReadStream(item.absolute),
      ContentLength: item.size,
      ContentType: item.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    });
    uploaded += 1;
    console.log(`  已上传 ${objectKey}`);
  } catch (error) {
    failed += 1;
    console.error(`  失败 ${objectKey}: ${error?.message || error}`);
  }
}

console.log(`\n完成：成功 ${uploaded}，失败 ${failed}。`);
if (failed) process.exit(1);

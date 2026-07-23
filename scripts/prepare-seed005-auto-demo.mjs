import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const materialRoot = path.join(root, '素材库', '种子内容', 'seed-005-非遗天青色国雅爆款反拆', '素材包');
const publicRoot = path.join(root, 'public', 'seed005-auto');
const dataFile = path.join(root, 'src', 'remotion', 'auto-seed005-data.json');
const ttsOutputRoot = path.join(root, 'outputs', 'tts-auditions');
const ttsUrl = 'http://127.0.0.1:8790/tts/audition';
const voiceId = 'Chinese (Mandarin)_Lyrical_Voice';
const targetDuration = 35.267;
const ffmpegDir = path.join(root, 'node_modules', '.pnpm', '@remotion+compositor-darwin-arm64@4.0.490', 'node_modules', '@remotion', 'compositor-darwin-arm64');
const ffmpegBin = path.join(ffmpegDir, 'ffmpeg');

const beats = [
  {
    id: 'dream',
    detail: '汝瓷器物近景',
    source: ['节奏段1_汝瓷质感', '汝瓷器物近景', '7月21日.mov'],
    publicFile: '01-ruyao-object.mp4',
    text: '九百年前，宋徽宗做了个梦。',
  },
  {
    id: 'rain-sky',
    detail: '雨后天空水面',
    source: ['节奏段1_汝瓷质感', '雨后天空水面', '7月21日.mov'],
    publicFile: '02-rain-sky.mp4',
    text: '雨停云散，天边露出一抹青色。',
  },
  {
    id: 'glaze',
    detail: '汝瓷釉面纹理',
    source: ['节奏段1_汝瓷质感', '汝瓷釉面纹理', '7月21日.mov'],
    publicFile: '03-ruyao-glaze.mp4',
    text: '后来，汝窑把它烧进瓷器。',
  },
  {
    id: 'celadon',
    detail: '汝瓷陈列环境',
    source: ['节奏段2_文化铺垫', '汝瓷陈列环境', '7月21日.mov'],
    publicFile: '04-ruyao-display.mp4',
    text: '这就是雨过天青。',
  },
  {
    id: 'classic',
    detail: '古画文物纹样',
    source: ['节奏段2_文化铺垫', '古画文物纹样', '7月21日.mov'],
    publicFile: '05-classic-texture.mp4',
    text: '不张扬，却很高级。',
  },
  {
    id: 'car-full',
    detail: '国雅整车外观',
    source: ['节奏段3_国雅露出', '国雅整车外观', '7月21日.mov'],
    publicFile: '06-guoya-full.mp4',
    text: '再看红旗金葵花国雅。',
  },
  {
    id: 'car-paint',
    detail: '国雅车漆近景',
    source: ['节奏段3_国雅露出', '国雅车漆近景', '7月21日.mov'],
    publicFile: '07-guoya-paint.mp4',
    text: '光落在车漆上，东方气质就出来了。',
  },
  {
    id: 'grille',
    detail: '国雅前脸格栅',
    source: ['节奏段3_国雅露出', '国雅前脸格栅', '7月21日.mov'],
    publicFile: '08-guoya-grille.mp4',
    text: '它不是炫耀豪华，是把雨过天青放到车身上。',
  },
  {
    id: 'emblem',
    detail: '国雅车标立标',
    source: ['节奏段3_国雅露出', '国雅车标立标', '7月21日.mov'],
    publicFile: '09-guoya-emblem.mp4',
    text: '这抹颜色，够不够国雅？',
  },
];

function mediaDurationSeconds(filePath) {
  const result = spawnSync('mdls', ['-raw', '-name', 'kMDItemDurationSeconds', filePath], {
    encoding: 'utf8',
  });
  const value = Number(String(result.stdout || '').trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function transcodeForBrowser(source, target) {
  const result = spawnSync(ffmpegBin, [
    '-y',
    '-i', source,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    target,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DYLD_LIBRARY_PATH: ffmpegDir,
    },
  });
  if (result.status !== 0) {
    throw new Error(`素材转码失败：${source}\n${result.stderr || result.stdout}`);
  }
}

async function generateVoice(item, index) {
  const response = await fetch(ttsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voiceId,
      text: item.text,
      speed: 1,
      vol: 1,
      pitch: -1,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.outputName) {
    throw new Error(`TTS 生成失败：${result.error || result.message || response.status}`);
  }

  const sourceAudio = path.join(ttsOutputRoot, result.outputName);
  const extension = path.extname(result.outputName) || '.mp3';
  const voiceFile = `voice-${String(index + 1).padStart(2, '0')}${extension}`;
  await copyFile(sourceAudio, path.join(publicRoot, voiceFile));

  return {
    voiceFile,
    duration: Math.max(0.8, Number(result.extraInfo?.audio_length || 0) / 1000),
  };
}

await mkdir(publicRoot, { recursive: true });

const bgmSource = path.join(materialRoot, '古风.mp3');
await copyFile(bgmSource, path.join(publicRoot, 'bgm.mp3'));
const bgmDuration = mediaDurationSeconds(bgmSource);

const prepared = [];
for (let index = 0; index < beats.length; index += 1) {
  const item = beats[index];
  const source = path.join(materialRoot, ...item.source);
  await transcodeForBrowser(source, path.join(publicRoot, item.publicFile));
  const voice = await generateVoice(item, index);
  prepared.push({
    ...item,
    ...voice,
  });
}

const voiceTotalDuration = prepared.reduce((total, item) => total + item.duration, 0);
const segmentPadding = Math.max(0, (targetDuration - voiceTotalDuration) / prepared.length);
let start = 0;
const timed = prepared.map((item, index) => {
  const duration =
    index === prepared.length - 1
      ? Math.max(item.duration, targetDuration - start)
      : item.duration + segmentPadding;
  const next = {
    ...item,
    start,
    duration,
    voiceDuration: item.duration,
  };
  start += duration;
  return next;
});

const data = {
  seedId: 'seed-005',
  title: '汝瓷天青色国雅自动裂变测试',
  duration: start,
  canvasRatio: '4:3',
  style: {
    subtitle: 'plain-white',
    transition: 'soft-dissolve',
    mood: '柔和、优雅、古风',
  },
  voiceProfile: {
    voiceId,
    label: '抒情男声',
    timingNote: `语音保持正常速度；每段按实际音频时长补 ${segmentPadding.toFixed(3)}s 画面呼吸口，贴近种子原片约 ${targetDuration.toFixed(3)}s。`,
  },
  bgm: {
    src: 'seed005-auto/bgm.mp3',
    volume: 0.18,
    duration: bgmDuration,
    loopWhenShorterThanVideo: bgmDuration > 0 && bgmDuration < start,
  },
  timelineBeats: timed.map((item, index) => ({
    id: `beat-${String(index + 1).padStart(2, '0')}`,
    text: item.text,
    start: item.start,
    duration: item.duration,
    materialName: item.detail,
    materialType: '强绑定素材',
    visualNeed: item.detail,
  })),
  voiceClips: timed.map((item, index) => ({
    id: `voice-${String(index + 1).padStart(2, '0')}`,
    src: `seed005-auto/${item.voiceFile}`,
    start: item.start,
    duration: item.duration,
    volume: 1,
  })),
  materialClips: timed.map((item, index) => ({
    id: `clip-${String(index + 1).padStart(2, '0')}-${item.id}`,
    index: index + 1,
    detail: item.detail,
    src: `seed005-auto/${item.publicFile}`,
    start: item.start,
    duration: item.duration,
    materialName: item.detail,
    materialType: '强绑定素材',
    visualNeed: item.detail,
  })),
};

await writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Prepared seed-005 demo: ${prepared.length} clips, ${start.toFixed(2)} seconds.`);

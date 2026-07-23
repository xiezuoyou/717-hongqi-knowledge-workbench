import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourceRoot = '/Users/xiezuoyou/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_29l2yhkrq1c222_04a4/msg/file/2026-07/归档/素材包';
const materialRoot = path.join(root, '素材库', '种子内容', 'seed-006-717粉丝盛典现场打卡探场', '素材包');
const publicRoot = path.join(root, 'public', 'seed006-real');
const dataFile = path.join(root, 'src', 'remotion', 'auto-seed006-real-data.json');
const ttsOutputRoot = path.join(root, 'outputs', 'tts-auditions');
const bgmSource = '/Users/xiezuoyou/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_29l2yhkrq1c222_04a4/msg/video/2026-07/1b03935d6383fc1e76119ffa46364d65.mp4';
const ttsUrl = 'http://127.0.0.1:8790/tts/audition';
const voiceId = 'male-qn-daxuesheng-jingpin';

function mediaDurationSeconds(filePath) {
  const result = spawnSync('mdls', ['-raw', '-name', 'kMDItemDurationSeconds', filePath], {
    encoding: 'utf8',
  });
  const value = Number(String(result.stdout || '').trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const beats = [
  {
    id: 'entry',
    segment: '入口开场',
    detail: '红旗盛典拱门',
    source: ['节奏段1_入口开场', '红旗盛典拱门', '拱门.mp4'],
    target: ['节奏段1_入口开场', '红旗盛典拱门', '717-拱门.mp4'],
    publicFile: '01-entry-arch.mp4',
    voiceText: '七幺七粉丝盛典，开场了。',
    subtitleText: '717粉丝盛典，开场了。',
    phrases: [{ text: '717粉丝盛典', highlight: true }, { text: '开场了' }],
  },
  {
    id: 'red-carpet',
    segment: '入口开场',
    detail: '红毯人流',
    source: ['节奏段1_入口开场', '红毯人流', '红毯人流.mp4'],
    target: ['节奏段1_入口开场', '红毯人流', '717-红毯人流.mp4'],
    publicFile: '02-red-carpet.mp4',
    voiceText: '红毯一铺开，人气马上就起来了。',
    subtitleText: '红毯一铺开，人气马上就起来了。',
    phrases: [{ text: '红毯一铺开', highlight: true }, { text: '人气马上就起来了' }],
  },
  {
    id: 'signage',
    segment: '现场打卡',
    detail: '欢迎回家指示牌',
    source: ['节奏段2_位置指引', '欢迎回家指示牌', '欢迎回家.mp4'],
    target: ['节奏段2_位置指引', '欢迎回家指示牌', '717-欢迎回家.mp4'],
    publicFile: '03-welcome-sign.mp4',
    voiceText: '看见欢迎回家，一下就有那味儿了。',
    subtitleText: '看见“欢迎回家”，一下就有那味儿了。',
    phrases: [{ text: '欢迎回家', highlight: true }, { text: '一下就有那味儿了' }],
  },
  {
    id: 'interaction',
    segment: '互动打卡',
    detail: '互动打卡动作',
    source: ['节奏段3_节目打卡', '互动打卡动作', '互动打卡.mp4'],
    target: ['节奏段3_节目打卡', '互动打卡动作', '717-互动打卡.mp4'],
    publicFile: '04-interaction.mp4',
    voiceText: '互动区这边，拍照、打卡、围观，全都很热闹。',
    subtitleText: '拍照、打卡、围观，全都很热闹。',
    phrases: [{ text: '拍照、打卡、围观', highlight: true }, { text: '全都很热闹' }],
  },
  {
    id: 'stage',
    segment: '舞台演出',
    detail: '精彩演出区域',
    source: ['节奏段3_节目打卡', '精彩演出区域', '精彩演出区域.mp4'],
    target: ['节奏段3_节目打卡', '精彩演出区域', '717-精彩演出区域.mp4'],
    publicFile: '05-stage.mp4',
    voiceText: '舞台演出也没闲着，现场氛围一直在线。',
    subtitleText: '舞台演出也没闲着，现场氛围一直在线。',
    phrases: [{ text: '舞台演出', highlight: true }, { text: '现场氛围一直在线' }],
  },
  {
    id: 'camping',
    segment: '休闲体验',
    detail: '露营休闲区',
    source: ['节奏段4_休闲体验', '露营休闲区', '露营休闲区.mp4'],
    target: ['节奏段4_休闲体验', '露营休闲区', '717-露营休闲区.mp4'],
    publicFile: '06-camping.mp4',
    voiceText: '草坪、帐篷、休闲区，逛累了还能坐一会儿。',
    subtitleText: '草坪、帐篷、休闲区，逛累了还能坐一会儿。',
    phrases: [{ text: '草坪、帐篷、休闲区', highlight: true }, { text: '逛累了还能坐一会儿' }],
  },
  {
    id: 'racing',
    segment: '赛车展示',
    detail: '车身外观',
    source: ['节奏段5_赛车展示', '车身外观', '车身外观.mp4'],
    target: ['节奏段5_赛车展示', '车身外观', '717-车身外观.mp4'],
    publicFile: '07-racing-car.mp4',
    voiceText: '再去赛车展区看看，实车近看真的更有冲击力。',
    subtitleText: '再去赛车展区看看，实车近看真的更有冲击力。',
    phrases: [{ text: '赛车展区', highlight: true }, { text: '实车近看更有冲击力' }],
  },
  {
    id: 'fan-wall',
    segment: '提问收尾',
    detail: '红旗粉丝墙',
    source: ['节奏段6_关注收尾', '红旗粉丝墙', '红旗粉丝墙.mp4'],
    target: ['节奏段6_关注收尾', '红旗粉丝墙', '717-红旗粉丝墙.mp4'],
    publicFile: '08-fan-wall.mp4',
    voiceText: '你最想打卡哪一块？评论区告诉我。',
    subtitleText: '你最想打卡哪一块？评论区告诉我。',
    phrases: [{ text: '你最想打卡哪一块？', highlight: true }, { text: '评论区告诉我' }],
  },
];

async function generateVoice(item, index) {
  const response = await fetch(ttsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voiceId,
      text: item.voiceText,
      speed: 1.08,
      vol: 1,
      pitch: 0,
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
    duration: Math.max(0.6, Number(result.extraInfo?.audio_length || 0) / 1000),
  };
}

await mkdir(publicRoot, { recursive: true });
await copyFile(bgmSource, path.join(publicRoot, 'bgm-source.mp4'));
const bgmDuration = mediaDurationSeconds(bgmSource);

let start = 0;
const prepared = [];
for (let index = 0; index < beats.length; index += 1) {
  const item = beats[index];
  const source = path.join(sourceRoot, ...item.source);
  const materialTarget = path.join(materialRoot, ...item.target);
  const publicTarget = path.join(publicRoot, item.publicFile);
  await mkdir(path.dirname(materialTarget), { recursive: true });
  await copyFile(source, materialTarget);
  await copyFile(source, publicTarget);

  const voice = await generateVoice(item, index);
  prepared.push({ ...item, ...voice, start });
  start += voice.duration;
}

const data = {
  seedId: 'seed-006',
  title: '717 粉丝盛典真实素材自动裂变测试',
  duration: start,
  canvasRatio: '9:16',
  voiceProfile: {
    voiceId,
    label: '青年大学生音色-beta',
    inputRule: '语音输入统一写作“七幺七”，字幕和画面文字保留“717”。',
  },
  bgm: {
    src: 'seed006-real/bgm-source.mp4',
    volume: 0.16,
    duration: bgmDuration,
    loopWhenShorterThanVideo: bgmDuration > 0 && bgmDuration < start,
  },
  timelineBeats: prepared.map((item, index) => ({
    id: `beat-${String(index + 1).padStart(2, '0')}`,
    segmentName: item.segment,
    text: item.subtitleText,
    voiceText: item.voiceText,
    start: item.start,
    duration: item.duration,
    phrases: item.phrases,
    materialName: item.detail,
    materialType: '强绑定素材',
    visualNeed: `${item.segment} / ${item.detail}`,
  })),
  voiceClips: prepared.map((item, index) => ({
    id: `voice-${String(index + 1).padStart(2, '0')}`,
    src: `seed006-real/${item.voiceFile}`,
    start: item.start,
    duration: item.duration,
    volume: 1,
  })),
  materialClips: prepared.map((item, index) => ({
    id: `clip-${String(index + 1).padStart(2, '0')}-${item.id}`,
    index: index + 1,
    segment: item.segment,
    detail: item.detail,
    src: `seed006-real/${item.publicFile}`,
    start: item.start,
    duration: item.duration,
    materialName: item.detail,
    materialType: '强绑定素材',
    visualNeed: `${item.segment} / ${item.detail}`,
  })),
};

await writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Prepared ${prepared.length} real-material clips, ${start.toFixed(2)} seconds.`);

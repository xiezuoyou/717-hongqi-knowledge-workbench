import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public', 'seed006-auto');
const materialRoot = path.join(root, '素材库', '种子内容', 'seed-006-717粉丝盛典现场打卡探场', '素材包');
const dataFile = path.join(root, 'src', 'remotion', 'auto-seed006-data.json');
const bgmSource = '/Users/xiezuoyou/Downloads/v1e00fgi0000d1tg4evog65vhehrdkj0.MP4';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

const materialMap = [
  {
    id: 'clip-01-entry',
    segment: '入口开场',
    detail: '红旗盛典拱门',
    srcFolder: ['节奏段1_入口开场', '红旗盛典拱门'],
    publicFile: '01-entry-arch.mp4',
    voiceFile: 'voice-01.m4a',
    start: 0,
    duration: 3.8,
    text: '七一七红旗粉丝盛典，现场已经开场。',
    phrases: [
      { text: '717红旗粉丝盛典', highlight: true },
      { text: '现场已经开场' }
    ]
  },
  {
    id: 'clip-02-location',
    segment: '位置指引',
    detail: '红旗国际汽车公园定位',
    srcFolder: ['节奏段2_位置指引', '红旗国际汽车公园定位'],
    publicFile: '02-location.mp4',
    voiceFile: 'voice-02.m4a',
    start: 3.8,
    duration: 4.2,
    text: '先看位置和动线，到了现场不容易迷路。',
    phrases: [
      { text: '先看位置和动线', highlight: true },
      { text: '到了现场不容易迷路' }
    ]
  },
  {
    id: 'clip-03-signage',
    segment: '位置指引',
    detail: '欢迎回家指示牌',
    srcFolder: ['节奏段2_位置指引', '欢迎回家指示牌'],
    publicFile: '03-signage.mp4',
    voiceFile: 'voice-03.m4a',
    start: 8,
    duration: 3.6,
    text: '欢迎回家这几个字，氛围一下就有了。',
    phrases: [
      { text: '欢迎回家', highlight: true },
      { text: '氛围一下就有了' }
    ]
  },
  {
    id: 'clip-04-program',
    segment: '节目打卡',
    detail: '精彩演出区域',
    srcFolder: ['节奏段3_节目打卡', '精彩演出区域'],
    publicFile: '04-program.mp4',
    voiceFile: 'voice-04.m4a',
    start: 11.6,
    duration: 4.2,
    text: '演出、打卡和活动物料，都适合拍成一条路线。',
    phrases: [
      { text: '演出、打卡', highlight: true },
      { text: '都能拍成一条路线' }
    ]
  },
  {
    id: 'clip-05-camping',
    segment: '休闲体验',
    detail: '露营休闲区',
    srcFolder: ['节奏段4_休闲体验', '露营休闲区'],
    publicFile: '05-camping.mp4',
    voiceFile: 'voice-05.m4a',
    start: 15.8,
    duration: 3.8,
    text: '中间还能切到休闲区，让视频不只是看展。',
    phrases: [
      { text: '露营休闲区', highlight: true },
      { text: '让视频不只是看展' }
    ]
  },
  {
    id: 'clip-06-racing',
    segment: '赛车展示',
    detail: '超哇赛车展车',
    srcFolder: ['节奏段5_赛车展示', '超哇赛车展车'],
    publicFile: '06-racing.mp4',
    voiceFile: 'voice-06.m4a',
    start: 19.6,
    duration: 4.4,
    text: '最后用超哇赛车收住亮点，下一条继续看现场。',
    phrases: [
      { text: '超哇赛车', highlight: true },
      { text: '下一条继续看现场' }
    ]
  }
];

await mkdir(publicRoot, { recursive: true });
await copyFile(bgmSource, path.join(publicRoot, 'bgm-source.mp4'));

for (const item of materialMap) {
  const source = path.join(materialRoot, ...item.srcFolder, '占位素材.mp4');
  await copyFile(source, path.join(publicRoot, item.publicFile));
  const aiffFile = path.join(publicRoot, item.voiceFile.replace('.m4a', '.aiff'));
  const m4aFile = path.join(publicRoot, item.voiceFile);
  await run('say', ['-v', 'Tingting', '-r', '218', '-o', aiffFile, item.text]);
  await run('afconvert', ['-f', 'm4af', '-d', 'aac', aiffFile, m4aFile]);
}

const data = {
  seedId: 'seed-006',
  title: '717 粉丝盛典现场自动裂变测试',
  duration: 24,
  canvasRatio: '9:16',
  bgm: {
    src: 'seed006-auto/bgm-source.mp4',
    volume: 0.24
  },
  timelineBeats: materialMap.map((item, index) => ({
    id: `beat-${String(index + 1).padStart(2, '0')}`,
    segmentName: item.segment,
    text: item.text,
    start: item.start,
    duration: item.duration,
    phrases: item.phrases,
    materialName: item.detail,
    materialType: '强绑定素材',
    visualNeed: `${item.segment} / ${item.detail}`
  })),
  voiceClips: materialMap.map((item, index) => ({
    id: `voice-${String(index + 1).padStart(2, '0')}`,
    src: `seed006-auto/${item.voiceFile}`,
    start: item.start,
    duration: item.duration,
    volume: 1
  })),
  materialClips: materialMap.map((item) => ({
    id: item.id,
    index: materialMap.indexOf(item) + 1,
    segment: item.segment,
    detail: item.detail,
    src: `seed006-auto/${item.publicFile}`,
    start: item.start,
    duration: item.duration,
    materialName: item.detail,
    materialType: '强绑定素材',
    visualNeed: `${item.segment} / ${item.detail}`
  }))
};

await writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Prepared ${materialMap.length} clips and BGM for AutoSeed006Video.`);

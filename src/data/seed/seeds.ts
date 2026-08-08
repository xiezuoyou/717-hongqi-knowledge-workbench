/**
 * 第二层数据：种子内容
 * 只把真实存在的三个种子目录写进来，其他装饰卡删掉（原来 expandedSeedCards 有 8 张，
 * 但 5 张都是复制标题改的假卡，点进去没有东西）。
 */

import type { Seed } from "./types";

export const seeds: Seed[] = [
  {
    id: "seed-005",
    directionId: "brand-memory",
    title: "非遗天青色国雅爆款反拆",
    angle: "用非遗文化和经典色彩承接品牌记忆，面向年轻用户做文化种草",
    status: "preparing",
    coverKey: null,
    packageRoot: "素材库/种子内容/seed-005-非遗天青色国雅爆款反拆",
    manifestPath: null,
    outputs: ["package", "video"],
    covers: [],
  },
  {
    id: "seed-006",
    directionId: "tech-experience",
    title: "717 粉丝盛典现场打卡探场",
    angle: "用活动现场实拍混剪 + 字幕旁白，做快速种草和打卡裂变",
    status: "ready",
    coverKey: "seed-006-cover",
    packageRoot: "素材库/种子内容/seed-006-717粉丝盛典现场打卡探场/素材包",
    manifestPath: "src/data/seed/manifests/seed-006.manifest.json",
    outputs: ["package", "video"],
    covers: [
      "717 粉丝盛典入口拱门和红毯",
      "欢迎回家指示牌和活动地点",
      "精彩演出区域和互动打卡动作",
      "露营休闲区草坪体验",
      "赛车展车和车身外观",
      "红旗粉丝墙打卡",
    ],
  },
  {
    id: "seed-007",
    directionId: "tech-experience",
    title: "红旗天工产品传播资料",
    angle: "围绕天工智能平台做产品细节解读和卖点传播（推测，需确认实际定位）",
    status: "preparing",
    coverKey: null,
    packageRoot: "素材库/种子内容/seed-007-红旗天工产品传播资料",
    manifestPath: null,
    outputs: ["package", "video"],
    covers: [],
  },
];

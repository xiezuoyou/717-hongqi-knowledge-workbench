/**
 * 时间线：08/11（预热启动）→ 08/13（爆发峰值）→ 08/20（长尾收口）
 * 基于策划文档「长春813「家」年华·非官方传播节奏颗粒度拆解」
 * 三段节奏: 预热10% / 爆发60% / 长尾30%
 */

import type { TimelineDay } from "./types";

export const timeline: TimelineDay[] = [
  // ========== 预热段 8/11-8/13白天 ==========
  {
    date: "2026-08-11",
    label: "08/11 预热·同城热搜日",
    status: "upcoming",
    focus: "长春文旅预热+活动期待 #长春最近要搞大事情#",
    directionIds: ["event-atmosphere", "user-experience"],
    seedIds: [],
    note: "从长春本地文旅切入,通过打卡地点、溜达路线、城市氛围营造活动预热。内容以生活场景为主,露营、带娃出行等日常用车画面自然带出产品。",
  },
  {
    date: "2026-08-12",
    label: "08/12 预热·持续预热",
    status: "upcoming",
    focus: "活动还没开始,长春这波文旅先玩明白",
    directionIds: ["event-atmosphere", "user-experience"],
    seedIds: [],
    note: "继续长春本地玩法种草,儿童婚纱打卡点、城市工业风拍照地、citywalk 路线。HS6 的露营空间、H7 的带娃舒适度在这些场景里自然出现。",
  },
  {
    date: "2026-08-13",
    label: "08/13 白天·临界预热",
    status: "upcoming",
    focus: "本来以为就是个车展,结果长春把科技卷成这样",
    directionIds: ["tech-safety", "user-experience"],
    seedIds: [],
    note: "科技体验环节预告,提前释放现场四电机、智能泊车等画面勾起好奇。话题从'长春卷科技'的角度切入,为晚上的爆发做铺垫。",
  },

  // ========== 爆发段 8/13晚-8/14 (峰值) ==========
  {
    date: "2026-08-13",
    label: "08/13 晚·双热搜爆发",
    status: "event",
    focus: "今天在活动现场,我整个人都看傻了",
    directionIds: ["celebrity-experience", "tech-safety", "user-experience", "event-atmosphere"],
    seedIds: ["seed-006"],
    note: "四条线同时发力:袁娅维现场唱歌自然带出 H7 随心悦唱、G919 四电机双层极限突围实拍、智能泊车街区各种复杂场景演示、813 晚会现场氛围和粉丝互动。小红书还有汉服达人开大车的反差感内容。",
  },
  {
    date: "2026-08-14",
    label: "08/14 爆发·金句混剪",
    status: "upcoming",
    focus: "昨晚的名场面,我二刷了,越看越上头",
    directionIds: ["celebrity-experience", "tech-safety", "user-experience"],
    seedIds: [],
    note: "袁娅维的东北话金句和长春文旅联动、徐梦桃夫妇的自动泊车 PK 人工停车、安全测试名场面混剪(电池包挨枪子泡盐水电锯切)、用户真实体验证言。把昨晚的高光做二次发酵。",
  },

  // ========== 长尾段 8/15-8/20 ==========
  {
    date: "2026-08-15",
    label: "08/15 长尾·安全偏执",
    status: "upcoming",
    focus: "看完红旗安全测试,我后背发凉但也踏实了",
    directionIds: ["tech-safety"],
    seedIds: [],
    note: "聚焦安全测试的极限画面:24 小时盐水浸泡、九宫格底部撞击、零下 40 度到零上 60 度温度冲击、火烧切割、战损电池包多重枪击。用'红旗对自己下死手'的角度讲安全偏执。",
  },
  {
    date: "2026-08-16",
    label: "08/16 长尾·金句延续",
    status: "upcoming",
    focus: "这几天被红旗刷屏,但我服",
    directionIds: ["celebrity-experience", "user-experience"],
    seedIds: [],
    note: "袁娅维的金句继续发酵,媒体实测 HS6 完胜 Model3 的对比内容,用户真实体验分享。从明星话题和实测数据两个角度延续热度。",
  },
  {
    date: "2026-08-17",
    label: "08/17 长尾·HS6技术重点",
    status: "upcoming",
    focus: "带娃露营一趟,HS6这车真香",
    directionIds: ["user-experience"],
    seedIds: [],
    note: "深挖 HS6 三个方向:座椅的多向调节、加热通风按摩;灵犀座舱的连续语音指令和场景模式;空间的灵活储物、后排舒适度、露营场景扩展。从家庭用车的实际需求切入。",
  },
  {
    date: "2026-08-18",
    label: "08/18 长尾·天工安全向",
    status: "upcoming",
    focus: "红旗这测试,卷得离谱但我是服的",
    directionIds: ["tech-safety"],
    seedIds: [],
    note: "天工的安全技术深度内容:天工九考、天工 X 中汽试炼场的高速爆胎/高速飞坡/跨层记忆泊车、840 次多场景仿真覆盖 200+ 事故场景。讲红旗把篮球砸车这种小概率都要算进去的细节控属性。",
  },
  {
    date: "2026-08-19",
    label: "08/19 长尾·G919越野",
    status: "upcoming",
    focus: "这越野车当场给我看傻",
    directionIds: ["tech-safety", "user-experience"],
    seedIds: [],
    note: "G919 的越野能力展示:鸿鹄越野平台、矢量四电机、四轮转向、双层极限突围和实景挑战。从越野性能和极限场景的角度讲产品硬实力。",
  },
  {
    date: "2026-08-20",
    label: "08/20 长尾·收口",
    status: "upcoming",
    focus: "这半个月被红旗硬核种草了",
    directionIds: ["tech-safety", "user-experience", "event-atmosphere"],
    seedIds: [],
    note: "用户证言合集、工程师幕后揭秘(为什么红旗技术专家人均'被迫害妄想')、国标只是起点的技术态度总结。把这半个月的技术传播做一个情绪化的收尾。",
  },
];

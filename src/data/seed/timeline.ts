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
    note: "同城抖音热搜×1:长春文旅打卡、溜达路线、活动搭建花絮。车型轻铺垫(露营/带娃场景带出HS6),不硬广。",
  },
  {
    date: "2026-08-12",
    label: "08/12 预热·持续预热",
    status: "upcoming",
    focus: "活动还没开始,长春这波文旅先玩明白",
    directionIds: ["event-atmosphere", "user-experience"],
    seedIds: [],
    note: "长春玩法路线、儿童婚纱打卡、城市工业风拍照。车型生活场景轻植入:HS6露营空间、H7带娃舒适。",
  },
  {
    date: "2026-08-13",
    label: "08/13 白天·临界预热",
    status: "upcoming",
    focus: "本来以为就是个车展,结果长春把科技卷成这样",
    directionIds: ["tech-safety", "user-experience"],
    seedIds: [],
    note: "技术环节预告(配合晚场,不死发):提前放现场科技体验素材合集(四电机、智能泊车)勾食欲。钩子:'今晚还有文娱惊喜,蹲住'。",
  },

  // ========== 爆发段 8/13晚-8/14 (峰值) ==========
  {
    date: "2026-08-13",
    label: "08/13 晚·双热搜爆发",
    status: "event",
    focus: "今天在活动现场,我整个人都看傻了",
    directionIds: ["celebrity-experience", "tech-safety", "user-experience", "event-atmosphere"],
    seedIds: ["seed-006"],
    note: "同城热搜×1(科技新花样)+文娱热搜×1(袁娅维)。四线并发:①明星·袁娅维→H7随心悦唱;②技术·G919四电机/智能泊车实拍;③活动·813晚会现场氛围;④体验·试驾/泊车PK/露营区。小红书汉服达人:反差感小姑娘开大车。",
  },
  {
    date: "2026-08-14",
    label: "08/14 爆发·金句混剪",
    status: "upcoming",
    focus: "昨晚的名场面,我二刷了,越看越上头",
    directionIds: ["celebrity-experience", "tech-safety", "user-experience"],
    seedIds: [],
    note: "①明星:袁娅维Vlog+长春文旅'欢迎大家来玩'话题链、徐梦桃夫妇自动泊车PK;②技术名场面:安全测试混剪'战损电池包先挨枪子再泡盐水又被电锯切';③民间证言:不卷概念不炫技,用户实测什么才叫好用的智能。",
  },

  // ========== 长尾段 8/15-8/20 ==========
  {
    date: "2026-08-15",
    label: "08/15 长尾·安全偏执",
    status: "upcoming",
    focus: "看完红旗安全测试,我后背发凉但也踏实了",
    directionIds: ["tech-safety"],
    seedIds: [],
    note: "#枪机火烧电锯...红旗为了安全真对自己下死手# #看完安全测试合集,这下懂了为什么红旗能掀半挂# —— 24h盐水浸泡、九宫格底部撞击、温度冲击、火烧切割、战损电池包枪击。",
  },
  {
    date: "2026-08-16",
    label: "08/16 长尾·金句延续",
    status: "upcoming",
    focus: "这几天被红旗刷屏,但我服",
    directionIds: ["celebrity-experience", "user-experience"],
    seedIds: [],
    note: "袁娅维金句混剪;用户实测智能体验 #不卷概念不炫技...#;媒体实测HS6完胜Model3素材。",
  },
  {
    date: "2026-08-17",
    label: "08/17 长尾·HS6技术重点",
    status: "upcoming",
    focus: "带娃露营一趟,HS6这车真香",
    directionIds: ["user-experience"],
    seedIds: [],
    note: "HS6三大方向:①座椅'同级最优乘坐体验'(多向调节/加热通风按摩);②灵犀座舱'智能不止于功能,更在于懂你'(连续语音指令/场景模式自定义);③空间'大空间也能很聪明'(灵活储物/后排/露营扩展)。",
  },
  {
    date: "2026-08-18",
    label: "08/18 长尾·天工安全向",
    status: "upcoming",
    focus: "红旗这测试,卷得离谱但我是服的",
    directionIds: ["tech-safety"],
    seedIds: [],
    note: "#原来红旗是个细节控!连篮球砸车这种小概率事件都算进去了# #别人家测试叫安全验证,红旗测试叫极限生存# —— 天工九考、天工X中汽试炼场(爆胎/飞坡/跨层记忆泊车)、840次多场景仿真。",
  },
  {
    date: "2026-08-19",
    label: "08/19 长尾·G919越野",
    status: "upcoming",
    focus: "这越野车当场给我看傻",
    directionIds: ["tech-safety", "user-experience"],
    seedIds: [],
    note: "G919鸿鹄越野平台矢量四电机、四轮转向、双层极限突围/实景挑战;#车企安全测试卷成这样了?红旗:我还没发力#。",
  },
  {
    date: "2026-08-20",
    label: "08/20 长尾·收口",
    status: "upcoming",
    focus: "这半个月被红旗硬核种草了",
    directionIds: ["tech-safety", "user-experience", "event-atmosphere"],
    seedIds: [],
    note: "#国标只是红旗的起点并非上限# 合集;用户证言'不吹不黑,真实体验';工程师幕后 #为什么说红旗技术专家人均'被迫害妄想'?# #工程师现身说法:红旗上市前要渡多少劫#。",
  },
];

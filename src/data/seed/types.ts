/**
 * 813 种子裂变 · 数据契约
 *
 * 设计原则：每个字段都要能对应上运行时的一件具体事，对不上的不要加。
 * 运行时只做三件事：
 *   A. 判断用户诉求能不能做（可行性墙）
 *   B. 按需要挑素材（选片）
 *   C. 生成口播文案
 * 下面每个字段都标了「谁读它」，加字段前先想清楚这一栏怎么填。
 *
 * 分两层：
 *   第一层 Direction / TimelineDay —— 首页内容层。能独立交付，很多用户看完就走。
 *   第二层 Seed / SeedManifest    —— 种子内容层。裂变的输入。
 *
 * 存储解耦：manifest 是素材的唯一事实来源，文件夹路径只是它里面的一个字段
 * （Seed.packageRoot + Clip.file）。素材换桶、换目录、整批替换都不影响这份契约。
 */

/* ============================================================
 * 第一层：首页内容层
 * ============================================================ */

export type DirectionId =
  | "tech-experience"
  | "fan-cocreation"
  | "family-travel"
  | "brand-memory";

/** 内容形态。前端展示成标签，文案生成用它定长度和语气。 */
export type ContentFormat =
  | "short-video" // 短视频 / 视频号切片
  | "note" // 小红书图文笔记
  | "moments" // 朋友圈
  | "recap"; // 活动复盘 / 长图文

export type Direction = {
  /** 前端筛选和路由用 */
  id: DirectionId;
  /** 卡片标题 */
  label: string;
  /** 用户直接复制去发的话题标签 */
  hashtags: string[];
  /** 卡片上的一句话，说清这个方向是什么 */
  summary: string;
  /**
   * 方向解析：为什么现在适合发这个。
   * 谁读它：前端（方向详情页主体）、文案生成（定切入角度）。
   */
  whyNow: string;
  /**
   * 创作建议：具体怎么做。
   * 谁读它：前端（方向详情页）、文案生成（定结构）。
   */
  howTo: string;
  /** 适合的内容形态。前端展示 + 文案生成定长度。 */
  formats: ContentFormat[];
  /**
   * 这个方向下明确不要做的事。
   * 谁读它：可行性墙（判 unsupported 的依据之一）、文案生成（负向约束）。
   * 注意：这是方向级的传播纪律，和素材有没有无关。素材层面的限制在 Clip.doesNotProve。
   */
  guardrails: string[];
  /** 挂在这个方向下的种子。一对多。 */
  seedIds: string[];
};

/** 时间线上某一天的状态 */
export type TimelineDayStatus =
  | "past" // 已经过去
  | "active" // 今天
  | "upcoming" // 还没到
  | "event"; // 活动当天（8/13）

export type TimelineDay = {
  /** ISO 日期，排序和「今天是哪天」的判断都用它，不要用 "08/09" 这种展示串 */
  date: string;
  /** 展示用的短标签 */
  label: string;
  status: TimelineDayStatus;
  /** 这天的节奏点，一句话 */
  focus: string;
  /** 这天可参与的具体热点方向（不再引用 DirectionId，每天独立） */
  directions: string[];
  /**
   * 这天放出哪些种子。存 id，不存标题字符串。
   * 存字符串是上一版的问题：时间线和真实种子对不上，点进去没有东西。
   */
  seedIds: string[];
};

/* ============================================================
 * 第二层：种子内容层
 * ============================================================ */

/** 种子能出的产物。"只给文案" 已被砍掉，不要加回来。 */
export type SeedOutput = "package" | "video";

export type SeedStatus =
  /** 素材和 manifest 都齐了，可以裂变 */
  | "ready"
  /** 目录建了但 manifest 没写 / 素材没到，前端不给裂变入口 */
  | "preparing";

export type Seed = {
  id: string;
  /** 挂在哪个方向下 */
  directionId: DirectionId;
  title: string;
  /**
   * 这条种子的具体角度，说清它和同方向其他种子的区别。
   * 谁读它：前端（卡片副标题）、可行性墙（判断用户诉求是不是该走这条种子）。
   */
  angle: string;
  status: SeedStatus;
  /** 封面图 key，前端映射到实际图片。没有就 null。 */
  coverKey: string | null;
  /**
   * 素材存储根目录，相对仓库根。
   * 所有 Clip.file 都相对它。换存储位置只改这一处。
   */
  packageRoot: string | null;
  /** manifest 路径，相对仓库根。status 为 preparing 时是 null。 */
  manifestPath: string | null;
  /** 这条种子支持哪些产物 */
  outputs: SeedOutput[];
  /**
   * 这条种子整体能证明什么，是 manifest 里所有 Clip.proves 的汇总。
   * 谁读它：可行性墙做 fallback —— 判 unsupported 时要回答「换哪条种子能做这个角度」，
   * 有这一栏就不用把所有 manifest 全加载一遍。
   * 冗余是故意的，改 manifest 时要同步改这里，测试会校验一致性。
   */
  covers: string[];
};

/* ============================================================
 * manifest：素材的唯一事实来源
 * ============================================================ */

/** 素材是真片还是占位。占位素材不能进真实产物，墙必须能区分。 */
export type ClipState = "real" | "placeholder";

/** 选片优先级 */
export type ClipPriority = "P0" | "P1" | "P2";

export type Clip = {
  id: string;
  /** 相对 Seed.packageRoot 的路径 */
  file: string;
  state: ClipState;
  /** 真实时长，秒。选片凑目标时长用。从文件头读出来的，不是估的。 */
  durationSeconds: number;
  /** 画面主体，一个词。选片用。 */
  subject: string;
  /** 画面里实际拍到了什么。谁读它：选片、文案生成（写画面提示）。 */
  description: string;
  /**
   * 这条素材能证明什么。
   * 谁读它：可行性墙（判 supported 的依据）、文案生成（口播只能说这里面有的东西）。
   */
  proves: string[];
  /**
   * 这条素材明确不能证明什么。
   * 谁读它：可行性墙（判 unsupported / degradable 的依据）。
   * 这是最需要人判断的字段 —— 缺了它，墙会推给用户一个素材根本不支持的脚本。
   */
  doesNotProve: string[];
  priority: ClipPriority;
  /**
   * 有没有人真的看过这条素材并确认过上面的描述。
   * false = 描述是从文件夹名和 README 推出来的，墙的判断可能不准。
   * 谁读它：校对流程（知道还剩哪些要看）、墙（可以对未校对的素材给更保守的结论）。
   */
  reviewed: boolean;
  /** 备注，比如「这条 27 秒，实际含多个镜头，需要切分」 */
  note?: string;
};

/**
 * 节奏段。段的顺序 + 用途就是分镜结构，
 * 摄影师按段填素材，文案生成按段写句子，选片按段凑时长。
 */
export type Segment = {
  id: string;
  /** 展示顺序 */
  order: number;
  label: string;
  /**
   * 这一段在叙事里干什么。
   * 谁读它：文案生成（每段写什么由它决定）。
   */
  purpose: string;
  /** 缺了这段成片就不成立。选片时不能跳过。 */
  required: boolean;
  /** 这段在成片里占多长，秒。选片凑时长用。 */
  targetDurationSeconds: number;
  clips: Clip[];
};

/**
 * 已知缺口：README / 分镜里要求有，但素材实际不存在。
 * 谁读它：可行性墙 —— 用户想强调的正好落在缺口上时，
 * 要能明确说「这个角度现在没素材」并给替代方案，而不是含糊地说无法生成。
 */
export type Gap = {
  segmentId: string;
  /** 缺什么 */
  expected: string;
  /** 缺了它导致什么做不了 */
  impact: string;
};

export type SeedManifest = {
  seedId: string;
  /** 改了素材或描述就升版本，前端和缓存靠它判断新旧 */
  version: number;
  /** ISO 日期 */
  updatedAt: string;
  format: {
    /** "9:16" */
    aspectRatio: string;
    /** 成片目标时长，秒 */
    targetDurationSeconds: number;
    /** 允许的上下浮动，秒。选片凑不到精确值时用。 */
    durationToleranceSeconds: number;
  };
  /**
   * 硬约束，违反了成片就不能用。
   * 谁读它：可行性墙（这些是不可协商的，用户要求撞上就是 unsupported）、
   *        文案生成（负向约束）、视频生成（渲染时不能违反）。
   */
  productionRules: string[];
  segments: Segment[];
  gaps: Gap[];
};

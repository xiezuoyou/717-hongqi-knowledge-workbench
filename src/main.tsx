import React from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import ReactMarkdown from "react-markdown";
import { ThinkingOrb } from "thinking-orbs";
import {
  directions,
  seeds,
  timeline,
  type DirectionId,
} from "./data/seed";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Database,
  Download,
  FileText,
  Package,
  PenLine,
  FolderOpen,
  Home,
  KeyRound,
  LogOut,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Send,
  Square,
  Tags,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import ColorBends from "./components/react-bits/ColorBends";
import "./styles.css";

const API_ROOT = (import.meta.env.VITE_STORAGE_API || "http://127.0.0.1:8791/api/storage").replace(
  /\/api\/storage$/,
  "",
);
const ADP_APPLICATION_ID = "2084629648176788096";

// 图片和视频不进前端构建产物：素材统一放对象存储 + CDN，前端只存路径。
// VITE_ASSET_BASE 配成 CDN 域名（如 https://cdn.example.com/813）后，
// 所有素材走 CDN；不配时回落到 /assets，本地开发仍能用 public/assets 下的文件。
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE || "/assets").replace(/\/+$/, "");
const assetUrl = (path: string) => `${ASSET_BASE}/${path.replace(/^\/+/, "")}`;

// 这批素材来自去年的 717 粉丝盛典现场，路径沿用 717 是事实描述，不跟着口径改 813。
const seedStageImage = {
  main: assetUrl("717-demo/stage-01.jpg"),
  crowd: assetUrl("717-demo/stage-02.jpg"),
  interaction: assetUrl("717-demo/stage-03.jpg"),
  product: assetUrl("717-demo/stage-04.jpg"),
};
const seedDeliveryDemoVideo = assetUrl("717-demo/seed-delivery-demo.mp4");

type KnowledgeAiMessageType = "thought" | "tool_call" | "reply" | string;

type KnowledgeAiToolCall = {
  id: string;
  name: string;
  title: string;
  status: string;
  statusLabel: string;
};

type KnowledgeAiReference = {
  id: string;
  name: string;
  knowledgeName: string;
  pages: number[];
  url: string;
};

type KnowledgeAiConversation = {
  Id: string;
  Title: string;
  LastActiveAt: number;
  CreatedAt: number;
  ApplicationId: string;
};

type KnowledgeAiTurn = {
  question: string;
  answer: string;
  references: KnowledgeAiReference[];
  toolCalls: KnowledgeAiToolCall[];
};

type KnowledgeAiSearchItem = {
  id?: string;
  kind?: "image" | "video" | "document" | string;
  url?: string;
  previewUrl?: string;
  name?: string;
  mimeType?: string;
  score?: number;
  text?: string;
  page?: string | number;
  dataset?: string;
};

type KnowledgeAiSearchResult = {
  responseType: "search_results" | "image_gallery";
  query?: string;
  title?: string;
  message?: string;
  count?: number;
  items: KnowledgeAiSearchItem[];
};

const parseKnowledgeAiSearchResult = (content: string): KnowledgeAiSearchResult | null => {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!clean.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(clean);
    if (
      (parsed?.responseType === "search_results" || parsed?.responseType === "image_gallery")
      && Array.isArray(parsed.items)
    ) {
      return parsed as KnowledgeAiSearchResult;
    }
  } catch {
    // Streaming content is expected to be incomplete until the final event arrives.
  }
  return null;
};

// ADP sends JSON results token by token. Keep the incomplete payload out of the chat
// surface, then replace it with the finished result module once parsing succeeds.
const isKnowledgeAiSearchResultCandidate = (content: string) => {
  const clean = content.trimStart();
  return clean.startsWith("{") || clean.startsWith("```json");
};

const scoreLabel = (score?: number) => typeof score === "number" ? `${Math.round(score)} 分` : "语义匹配";

/**
 * Carries the HTTP status so the message shown to the user can depend on it,
 * without ever putting the raw upstream body on screen.
 */
class KnowledgeAiRequestError extends Error {
  status: number;
  constructor(status: number) {
    super(`chat request failed with status ${status}`);
    this.name = "KnowledgeAiRequestError";
    this.status = status;
  }
}

/**
 * Turns a failure into something a non-technical user can act on.
 *
 * The audience here is channel staff who mostly know AI as a chat box, so the
 * message must say what happened and what to do next — never a status code, a
 * stack, or the upstream JSON body (which is what this used to render).
 */
const describeKnowledgeAiError = (error: unknown) => {
  if (error instanceof KnowledgeAiRequestError) {
    if (error.status === 429) return "提问的人太多，稍等一下再试。";
    if (error.status === 401 || error.status === 403) return "没有访问知识库的权限，请联系管理员。";
    if (error.status >= 500) return "知识库服务暂时没有响应，稍后再试一次。";
    if (error.status === 400) return "这个问题服务暂时没能处理，换一种说法试试。";
    return "提问没有成功，请再试一次。";
  }
  if (error instanceof TypeError) return "网络连接不上，检查一下网络后再试。";
  return "提问没有成功，请再试一次。";
};

function KnowledgeAiSearchResults({ result }: { result: KnowledgeAiSearchResult }) {
  const items = result.items || [];
  const imageItems = items.filter((item) => item.kind === "image");
  const videoItems = items.filter((item) => item.kind === "video");
  const documentItems = items.filter((item) => item.kind === "document");

  return (
    <section className="knowledge-ai-search-results" aria-label={result.title || "素材搜索结果"}>
      <header className="knowledge-ai-search-results-header">
        <div>
          <span>素材搜索</span>
          <h2>{result.title || "搜索结果"}</h2>
        </div>
        <strong>{result.count ?? items.length} 项</strong>
      </header>

      {result.message ? <p className="knowledge-ai-search-message">{result.message}</p> : null}

      {imageItems.length > 0 ? (
        <div className="knowledge-ai-media-grid">
          {imageItems.map((item, index) => {
            const imageUrl = item.previewUrl || item.url;
            return (
              <article className="knowledge-ai-media-card" key={item.id || `${item.name || "image"}-${index}`}>
                {imageUrl ? <img src={imageUrl} alt={item.name || "图片搜索结果"} loading="lazy" /> : <div className="knowledge-ai-media-placeholder">图片不可预览</div>}
                <footer>
                  <div>
                    <strong>{item.name || "未命名图片"}</strong>
                    <span>{scoreLabel(item.score)}</span>
                  </div>
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer" title="打开原图"><Download size={16} /></a> : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}

      {videoItems.length > 0 ? (
        <div className="knowledge-ai-result-stack">
          {videoItems.map((item, index) => (
            <article className="knowledge-ai-video-card" key={item.id || `${item.name || "video"}-${index}`}>
              {item.url ? <video controls preload="metadata" poster={item.previewUrl || undefined} src={item.url} /> : <div className="knowledge-ai-media-placeholder">视频不可预览</div>}
              <div><strong>{item.name || "未命名视频"}</strong><span>{scoreLabel(item.score)}</span></div>
            </article>
          ))}
        </div>
      ) : null}

      {documentItems.length > 0 ? (
        <div className="knowledge-ai-result-stack">
          {documentItems.map((item, index) => (
            <article className="knowledge-ai-document-card" key={item.id || `${item.name || "document"}-${index}`}>
              <FileText size={20} />
              <div>
                <strong>{item.name || "未命名文档"}</strong>
                <p>{item.text || "文档内容语义匹配"}</p>
                <span>{item.page ? `第 ${item.page} 页 · ` : ""}{scoreLabel(item.score)}</span>
              </div>
              {item.url ? <a href={item.url} target="_blank" rel="noreferrer" title="打开文档"><Download size={16} /></a> : null}
            </article>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? <p className="knowledge-ai-search-empty">没有找到匹配的素材。</p> : null}
    </section>
  );
}

function KnowledgeAiSearchResultTrigger({
  result,
  onOpen,
}: {
  result: KnowledgeAiSearchResult;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="knowledge-ai-search-result-trigger" onClick={onOpen}>
      <Search size={17} />
      <span><strong>已找到 {result.count ?? result.items.length} 项素材</strong><em>{result.title || "打开查看搜索结果"}</em></span>
      <ChevronDown size={17} />
    </button>
  );
}

function KnowledgeAiSearchResultModal({
  result,
  onClose,
}: {
  result: KnowledgeAiSearchResult;
  onClose: () => void;
}) {
  return (
    <div className="knowledge-ai-search-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="knowledge-ai-search-modal" role="dialog" aria-modal="true" aria-label="素材搜索结果">
        <header>
          <div><span>素材检索</span><strong>搜索结果</strong></div>
          <button type="button" onClick={onClose} aria-label="关闭搜索结果"><X size={18} /></button>
        </header>
        <div className="knowledge-ai-search-modal-content">
          <KnowledgeAiSearchResults result={result} />
        </div>
      </section>
    </div>
  );
}

const librarySections = [
  {
    id: "product-info",
    lead: "01",
    title: "产品信息",
    note: "所有内容生产和审核都要先对齐的产品基础资料，要求稳定、准确、可引用。",
    items: [
      "HS6、H7、G919、天工05/06 产品资料",
      "产品图片、车型亮点与标准表述",
      "卖点参数、场景化表达和禁用说法",
      "后续 AI 回答与内容审核的基础依据",
    ],
  },
  {
    id: "communication-files",
    lead: "02",
    title: "传播文件",
    note: "围绕 813 项目的策略、规则和风险边界，决定内容能怎么说、哪些不能说。",
    items: [
      "813 项目背景与传播策划策略文件",
      "公关策略文件与对外沟通口径",
      "平台传播规则与近期传播敏感点",
      "禁止传播方向和审核注意事项",
    ],
  },
  {
    id: "asset-library",
    lead: "03",
    title: "素材资源",
    note: "用户做内容、AI 生成素材包和视频交付时，可以直接调用和继续加工的资源。",
    items: [
      "产品图片与产品资源素材",
      "813 公共素材、活动现场图片和视频",
      "官方 BGC 素材、海报物料和视觉资产",
      "可用于图文、剪辑、视频生成的素材包",
    ],
  },
  {
    id: "seed-operation",
    lead: "04",
    title: "种子内容",
    note: "承接运营策略方向，把热点、选题、发布建议和种子内容沉淀成可执行的内容库。",
    items: [
      "热点方向与非官方铺设内容",
      "内容选题、发布建议和平台适配",
      "种子内容、裂变内容和脚本方向",
      "专题目标、传播节奏和内容复盘",
    ],
  },
] as const;

type LibrarySectionId = (typeof librarySections)[number]["id"];

const libraryFilters: Record<
  LibrarySectionId,
  Array<{ id: string; label: string; subFilters: string[] }>
> = {
  "product-info": [
    { id: "hs6", label: "HS6", subFilters: ["产品资料", "产品图片", "相关视频", "审核依据"] },
    { id: "h7", label: "H7", subFilters: ["产品资料", "产品图片", "相关视频", "审核依据"] },
    { id: "g919", label: "G919", subFilters: ["产品资料", "产品图片", "相关视频", "审核依据"] },
    { id: "tiangong-05", label: "天工05", subFilters: ["产品资料", "产品图片", "相关视频", "审核依据"] },
    { id: "tiangong-06", label: "天工06", subFilters: ["产品资料", "产品图片", "相关视频", "审核依据"] },
  ],
  "communication-files": [
    { id: "project", label: "项目背景", subFilters: ["全部背景", "813项目", "传播目标", "用户人群"] },
    { id: "strategy", label: "传播策略", subFilters: ["全部策略", "传播主线", "阶段规划", "内容目标"] },
    { id: "pr", label: "公关策略", subFilters: ["全部公关", "对外口径", "媒体沟通", "风险回复"] },
    { id: "platform", label: "平台规则", subFilters: ["全部平台", "小红书", "抖音", "视频号"] },
    { id: "risk", label: "禁传方向", subFilters: ["全部风险", "敏感点", "禁用标题", "禁用画面"] },
  ],
  "asset-library": [
    { id: "product-assets", label: "产品素材", subFilters: ["全部产品", "产品图片", "产品视频", "卖点物料"] },
    { id: "public-assets", label: "813公共素材", subFilters: ["全部公共素材", "主视觉", "活动KV", "通用贴片"] },
    { id: "event-assets", label: "活动现场", subFilters: ["全部现场", "现场图片", "现场视频", "互动片段"] },
    { id: "bgc-assets", label: "BGC素材", subFilters: ["全部BGC", "官方视频", "视觉资产", "物料包"] },
  ],
  "seed-operation": [
    { id: "hotspot", label: "热点方向", subFilters: ["全部热点", "智能科技", "粉丝共创", "家庭出行"] },
    { id: "topic", label: "内容选题", subFilters: ["全部选题", "图文选题", "短视频选题", "口播方向"] },
    { id: "seed-content", label: "种子内容", subFilters: ["全部种子", "图文种子", "视频种子", "裂变种子"] },
    { id: "publish", label: "发布建议", subFilters: ["全部建议", "小红书", "抖音", "视频号"] },
  ],
};

type LibraryEntry = {
  title: string;
  tag: string;
  meta: string;
  desc: string;
  image?: string;
  kind?: "document" | "image";
  tabs?: Array<{ id: string; label: string; title: string; points: string[] }>;
};

type LibraryFolder = {
  id: string;
  name: string;
  items: LibraryEntry[];
};

const hs6LibraryEntries: LibraryEntry[] = [
  {
    title: "HS6 PHEV 产品培训课件",
    tag: "产品资料",
    meta: "PPT课件 / 117页 / 已处理",
    desc: "覆盖市场定位、参数梯度、核心卖点、竞品对比和场景化 FAB 话术，是 HS6 内容生产与审核的主资料。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "这份资料适合作为 HS6 的基础母本",
        points: [
          "课件由红旗渠道管理部、产品策划及项目管理部、红旗 GTM 部联合出品。",
          "内容主线包括市场潜力、装备梯度、产品魅点、舒适座舱、空间、混动能耗、安全和智驾。",
          "适合沉淀为产品问答、销售话术、传播文案和审核依据。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "产品信息优先提取参数和稳定表达",
        points: [
          "车型尺寸为 4925*1970*1740mm，轴距 2925mm。",
          "核心版本包括 145/240/220 四驱智混版，主销版本纯电续航可达 248km，综合续航最高 1650km。",
          "重点配置包含双 15.6 吋高清屏、8295P 芯片、车载冷暖箱、零重力座椅、记忆泊车和高速领航辅助。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "可拆成舒适、空间、混动、安全、智驾五条内容线",
        points: [
          "舒适线强调“冰箱彩电大沙发”、健康环保座舱和智能硬件。",
          "空间线强调 84.2% 得房率、503L 后备箱、31 处储物空间和灵动布局。",
          "混动线强调 45.21% 热效率、快充 15 分钟、低温性能和低能耗。",
          "安全线强调 9H4M 车身、电池安全、国密级信息防护和功能安全。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "审核时优先锁定参数、竞品对比和极限表述",
        points: [
          "涉及“同级领先”“行业第一”“全系标配”等表达需要回看原始页证据。",
          "竞品对比涉及理想 L6、比亚迪唐、途观 L Pro 等，需要保持原资料口径。",
          "参数类内容优先使用课件原文，不自行扩写绝对化结论。",
        ],
      },
    ],
  },
  {
    title: "HS6 上市后用户调研报告",
    tag: "用户调研",
    meta: "PPT报告 / 26页 / 已处理 4m48s",
    desc: "围绕 HS6 上市后的用户画像、购车动机、战胜战败因素、使用场景和满意抱怨点进行归纳，适合作为传播策略与产品迭代判断依据。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "这份资料适合作为 HS6 上市后反馈入口",
        points: [
          "报告时间为 2026 年 6 月 26 日，研究目标覆盖产品诊断、定位验证、营销策略和改款方向验证。",
          "样本包含本品用户、战败用户、潜在用户、经销商访谈等，覆盖济南、成都、郑州、杭州、深圳、长沙等城市。",
          "资料更适合回答“谁在买、为什么买、为什么放弃、哪里满意、哪里抱怨”。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "核心用户与战胜战败结论",
        points: [
          "HS6 用户被拆成有闲乐享派、圆规中产、进阶青年三类，其中圆规中产占比 40%，进阶青年占比 29%，有闲乐享派占比 31%。",
          "战胜因素集中在乘坐舒适性、内部空间、性价比、外观内饰和安全性。",
          "战败因素主要来自外观内饰、乘坐舒适性，尤其是减震，以及价格和门店优惠力度。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "传播应放大到店体验、家庭场景和越级空间",
        points: [
          "报告指出用户常因“喜欢的车型出现在眼前”产生购买念头，因此传播上应增加偶遇、到店、试驾和场景露出的机会。",
          "“越级空间”“大五座”“得房率”被很好传达，是目标受众最容易感知的内容抓手。",
          "舒适、安全、照顾家人是最强情感动机，内容上应减少纯参数堆叠，增加家庭陪伴、通勤、回老家、自驾旅行场景。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "调研结论适合做策略参考，不适合当参数依据",
        points: [
          "用户观点、访谈原话和战胜战败原因可以作为传播方向参考，但不能替代产品参数或官方配置表。",
          "涉及竞品对比时，需要区分定量数据、定性访谈和策略判断，避免把用户主观反馈写成官方结论。",
          "负面反馈如辅助驾驶、减震、价格优惠等可用于内部优化，不宜在对外内容中直接展开。",
        ],
      },
    ],
  },
  {
    title: "HS6 FAB 场景化话术",
    tag: "话术",
    meta: "演示占位 / 可替换",
    desc: "模拟从产品资料中整理出的销售话术入口，后续可替换为正式 FAB 话术文件或 AI 自动拆解结果。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "FAB 是这份资料里最适合 AI 加工的部分",
        points: [
          "每个卖点都给出功能、对比优势和用户利益点。",
          "适合直接转成小红书笔记、销售直播口播和短视频分镜。",
          "可以作为 AI 生成脚本时的标准结构输入。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "可复用的典型话术方向",
        points: [
          "车载冷暖箱：带娃热奶、老人温水、夏天冰饮，上车即享。",
          "舒适制动：跟车更轻松，刹停不点头，更平稳舒适。",
          "泊车辅助：狭窄车位、跨层停车场等场景降低泊车焦虑。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "话术可以按用户身份拆分",
        points: [
          "家庭用户：空间、舒适、健康座舱、儿童遗忘提醒。",
          "通勤用户：能耗、补能、智驾、舒适制动。",
          "新手用户：泊车、城市领航、安全预警。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "FAB 可改写，但不能改参数",
        points: [
          "生活化表达可以扩写，参数和竞品对比不做二次夸张。",
          "涉及安全效果时避免承诺式表达。",
          "AI 输出脚本时建议保留原始 FAB 对应关系。",
        ],
      },
    ],
  },
  {
    title: "HS6 参数与装备梯度",
    tag: "审核依据",
    meta: "演示占位 / 可替换",
    desc: "模拟参数和版本配置的审核入口，后续可替换为正式配置表、价格表或版本差异文件。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "这张卡用于查版本、参数和配置边界",
        points: [
          "课件中包含 145、240、220 四驱智混版的参数与装备梯度。",
          "覆盖基础功能、座舱配置、智驾配置、四驱和 CDC 可调悬挂等信息。",
          "适合做内容审核、脚本校验和销售答疑。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "高频查验参数",
        points: [
          "CLTC 纯电续航：145 / 248 / 228km。",
          "CLTC 综合续航：1580 / 1650 / 1460km。",
          "四驱版百公里加速 4.8s，最高车速 205km/h。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "参数适合转成对比型内容",
        points: [
          "用“城市通勤不用油、长途出行少焦虑”承接续航。",
          "用“服务区喝杯咖啡的时间补能”承接快充。",
          "用“坐满人拉满货，高速超车依然轻松”承接动力。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "版本配置不要跨版本混用",
        points: [
          "主销、全系、选装包、四驱专属配置要明确区分。",
          "价格和配置如后续有新版本，应以最新确认版为准。",
          "参数表内容优先作为“强审核依据”。",
        ],
      },
    ],
  },
  {
    title: "HS6 舒适座舱卖点拆解",
    tag: "卖点",
    meta: "课件拆分 / 演示占位",
    desc: "从产品课件中拆出的舒适座舱内容包，适合做家庭出行、乘坐体验、车内配置和生活化场景表达。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "这张卡聚焦用户一坐进车里能感知的部分",
        points: [
          "围绕座椅、屏幕、冷暖箱、音响、空气管理和车内便利配置做内容拆分。",
          "适合转化为“带家人出门更舒服”“孩子老人都照顾到”的生活化表达。",
          "后续可接入图片、短视频片段和车内功能演示素材。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "舒适配置要先讲体验，再补参数",
        points: [
          "双 15.6 吋高清屏和 8295P 芯片适合承接智能座舱体验。",
          "车载冷暖箱、座椅舒适配置和车内储物更适合放进真实家庭场景。",
          "健康环保座舱、空气管理等内容适合和孩子、老人、长途乘坐绑定。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "内容角度可以从“全家都舒服”切进去",
        points: [
          "图文方向：一天用车里哪些配置会被家人真正用到。",
          "短视频方向：上车、坐下、放饮料、孩子看屏、老人休息，连成一个轻剧情。",
          "口播方向：不要堆配置名，讲“这些功能为什么会让你少操心”。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "舒适体验可放大感受，功能边界要准确",
        points: [
          "功能名称、配置是否标配、具体版本差异需要回到配置表确认。",
          "健康、安全、空气质量类表达避免绝对承诺。",
          "体验表达可以生活化，但不能把主观感受写成官方测试结论。",
        ],
      },
    ],
  },
  {
    title: "HS6 越级空间表达包",
    tag: "卖点",
    meta: "课件拆分 / 演示占位",
    desc: "拆解 HS6 的大五座、后备箱、储物空间和得房率表达，适合做家庭装载、露营、自驾和多人出行内容。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "空间是 HS6 最容易被用户现场感知的抓手",
        points: [
          "这张卡用于整理车身尺寸、轴距、座舱空间、后备箱和储物能力。",
          "适合支撑看车、试驾、到店探车、亲子出行和自驾旅行内容。",
          "可配合现场素材做“一眼看得懂”的空间展示。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "空间表达要把数字翻译成画面",
        points: [
          "车型尺寸和轴距可作为基础参数入口，但对外内容应重点讲乘坐和装载。",
          "后备箱、储物格、二排乘坐和家庭行李场景适合组合展示。",
          "“越级空间”“大五座”“得房率”可以作为主标题方向，但要注意审核口径。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "空间内容可以做成强画面感对比",
        points: [
          "图文方向：一家三口周末出门，行李、婴儿车、露营装备怎么放。",
          "短视频方向：用固定镜头展示人坐进去、物放进去、座椅调整后的变化。",
          "直播方向：让用户现场提问“能不能放下这个”，用即时演示增强真实感。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "空间类内容尤其注意测量口径",
        points: [
          "车身尺寸、轴距、后备箱容积等参数以正式资料为准。",
          "涉及“同级最大”“远超竞品”等表达必须有明确依据。",
          "真人演示可增强可信度，但不要用夸张镜头制造不真实空间感。",
        ],
      },
    ],
  },
  {
    title: "HS6 混动续航与补能卡",
    tag: "产品资料",
    meta: "课件拆分 / 演示占位",
    desc: "将混动效率、纯电续航、综合续航、快充和低温用车拆成可传播的信息卡，方便内容生产时快速取用。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "这张卡回答用户最关心的用车成本和里程焦虑",
        points: [
          "内容覆盖城市通勤、长途自驾、补能效率和冬季用车稳定性。",
          "适合沉淀为问答、对比图、口播脚本和短视频场景演示。",
          "后续可接入续航测试、补能实拍和车主使用反馈。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "混动信息要按场景分层说明",
        points: [
          "城市通勤可强调纯电覆盖日常使用，长途出行再强调综合续航。",
          "快充能力适合转化为“短暂停留即可补能”的场景表达。",
          "能耗、热效率和续航数字属于强参数，必须跟版本对应。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "传播上少讲技术名词，多讲使用收益",
        points: [
          "小红书：一周通勤不用油、周末出城不焦虑的账本式内容。",
          "抖音：快充、出发、抵达三段式剪辑，突出补能节奏。",
          "销售口播：先问用户每天通勤距离，再解释哪个续航版本更合适。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "续航类表达要避免绝对化和泛化",
        points: [
          "CLTC、综合续航、纯电续航不能混用。",
          "不同版本、不同环境、不同驾驶习惯会影响实际表现，需要保留条件。",
          "“不用充电”“永远不焦虑”等表达不建议使用。",
        ],
      },
    ],
  },
  {
    title: "HS6 安全与智能驾驶要点",
    tag: "审核依据",
    meta: "课件拆分 / 演示占位",
    desc: "整理车身安全、电池安全、信息安全、辅助驾驶和泊车辅助等内容，适合做审核校验与信任感传播。",
    tabs: [
      {
        id: "overview",
        label: "资料概览",
        title: "这张卡用于把安全感讲清楚，而不是讲玄",
        points: [
          "内容覆盖被动安全、电池安全、智能辅助驾驶、泊车辅助和信息安全。",
          "适合支持家庭用户、长途用户和新手用户的决策表达。",
          "可作为对外文案审核时的高优先级参考卡。",
        ],
      },
      {
        id: "key-info",
        label: "关键信息",
        title: "安全与智驾要区分“保护”和“辅助”",
        points: [
          "车身结构、电池安全和信息安全更适合承接信任感。",
          "高速领航、记忆泊车、泊车辅助等属于使用便利和驾驶辅助能力。",
          "面向新手用户时，可以把泊车、预警、跟车和长途辅助拆开讲。",
        ],
      },
      {
        id: "content-angle",
        label: "传播分析",
        title: "安全内容适合做“看不见但很重要”的解释型内容",
        points: [
          "图文方向：买家庭车时安全到底要看哪些地方。",
          "短视频方向：用场景复现讲新手泊车、长途跟车和雨天出行。",
          "口播方向：先讲用户担心什么，再把对应能力解释清楚。",
        ],
      },
      {
        id: "review",
        label: "审核提示",
        title: "智驾类内容必须避免替代驾驶承诺",
        points: [
          "辅助驾驶不能表达为自动驾驶，也不能暗示用户可以脱离注意力。",
          "安全类表达避免“绝对安全”“零风险”等承诺。",
          "所有功能以实际车型版本、开放城市和软件状态为准。",
        ],
      },
    ],
  },
];

const makeProductImageEntries = (
  product: string,
  folder: string,
  files: string[],
): LibraryEntry[] =>
  files.map((file, index) => ({
    title: `${product} 产品图片 ${String(index + 1).padStart(2, "0")}`,
    tag: "产品图片",
    meta: "图片",
    image: `/assets/${folder}/${file}`,
    desc: "",
    kind: "image",
  }));

const hs6ImageEntries = makeProductImageEntries("HS6", "hs6-demo", [
  "hs6-09.jpg",
  "hs6-10.jpg",
  "hs6-11.jpg",
  "hs6-12.jpg",
  "hs6-13.jpg",
  "hs6-14.jpg",
  "hs6-15.jpg",
  "hs6-16.jpg",
  "hs6-17.jpg",
  "hs6-18.jpg",
  "hs6-19.jpg",
  "hs6-20.jpg",
  "hs6-21.jpg",
  "hs6-22.jpg",
  "hs6-23.jpg",
  "hs6-24.jpg",
]);

const h7ImageEntries = makeProductImageEntries("H7", "h7-demo", [
  "h7-01.jpeg",
  "h7-02.jpeg",
  "h7-03.jpeg",
  "h7-04.jpeg",
  "h7-05.jpeg",
  "h7-06.jpeg",
  "h7-07.jpeg",
  "h7-08.jpeg",
  "h7-09.jpeg",
]);

const libraryEntries: Record<LibrarySectionId, LibraryEntry[]> = {
  "product-info": [
    { title: "HS6 产品核心信息卡", tag: "HS6", meta: "产品资料 / 已校准", desc: "整理车型定位、核心卖点、场景话术和不可误用的参数口径。" },
    { title: "H7 豪华舒适表达库", tag: "H7", meta: "产品资料 / 待审核", desc: "补充舒适、安全、家庭出行和商务场景下的内容表达模板。" },
    { title: "G919 旗舰传播要点", tag: "G919", meta: "产品资料 / 已校准", desc: "用于高端旗舰内容生产的品牌语气、技术亮点和视觉关键词。" },
    { title: "天工05/06 场景化问答", tag: "天工", meta: "AI问答 / 草稿", desc: "模拟用户可能追问的问题，沉淀标准回复和审核依据。" },
  ],
  "communication-files": [
    { title: "813 项目传播背景", tag: "项目背景", meta: "策略文件 / 确定版", desc: "说明项目目标、传播周期、核心人群和阶段性内容重点。" },
    { title: "813 公关传播口径", tag: "公关口径", meta: "公关文件 / 待复核", desc: "整理对外表述、媒体沟通边界和容易误解的表达方式。" },
    { title: "平台传播规则速查", tag: "平台规则", meta: "规则文件 / 已归档", desc: "面向小红书、抖音、视频号的审核敏感点和推荐表达方式。" },
    { title: "近期禁传方向清单", tag: "禁传方向", meta: "审核规则 / 高优先级", desc: "沉淀不可触碰的话题、画面、标题方向和评论区风险提示。" },
  ],
  "asset-library": [
    { title: "产品图片精选包", tag: "产品图片", meta: "图片素材 / 36张", desc: "包含车型外观、内饰、细节和可用于封面的标准素材。" },
    { title: "813 活动现场图库", tag: "活动图片", meta: "现场素材 / 58张", desc: "沉淀现场氛围、用户互动、舞台高光和传播可用画面。" },
    { title: "BGC 官方视频素材", tag: "BGC", meta: "视频素材 / 12条", desc: "适合剪辑包装、混剪和视频生成的官方素材片段。" },
    { title: "海报物料与视觉资产", tag: "海报物料", meta: "设计物料 / 18组", desc: "包含主视觉、KV延展、贴纸元素和活动传播模板。" },
  ],
  "seed-operation": [
    { title: "智能科技体验热点包", tag: "热点方向", meta: "种子方向 / 今日推荐", desc: "围绕技术体验、现场互动和真实感知生成内容角度。" },
    { title: "非官方铺设内容选题", tag: "内容选题", meta: "选题库 / 24条", desc: "适合达人、用户视角和平台原生内容的选题储备。" },
    { title: "平台发布建议清单", tag: "发布建议", meta: "发布策略 / 可复用", desc: "按小红书、抖音、视频号拆解标题、封面和发布时间建议。" },
    { title: "种子裂变内容复盘", tag: "内容复盘", meta: "复盘文档 / 草稿", desc: "记录不同内容方向的表现、反馈和后续可继续放大的切口。" },
  ],
};

const majorTabs = [
  {
    id: "seed",
    label: "专题种子库",
    subTabs: [
      { id: "topic-board", label: "专题看板" },
      { id: "hotspots", label: "热点方向" },
      { id: "seed-content", label: "种子内容" },
    ],
  },
  {
    id: "library",
    label: "知识库",
    subTabs: [
      { id: "product-info", label: "产品信息" },
      { id: "communication-files", label: "传播文件" },
      { id: "asset-library", label: "素材资源" },
      { id: "seed-operation", label: "种子内容" },
    ],
  },
  {
    id: "tools",
    label: "AI智库",
    subTabs: [
      { id: "assistant", label: "AI助手" },
    ],
  },
];

// ============================================================
// 适配层：新数据层 → 旧 UI 格式
// ============================================================

const hotTopics = directions.map(d => ({
  id: d.id,
  label: d.label,
  tag: "热点方向",
  topics: d.hashtags,
  desc: d.summary,
}));

// 当天的热点方向：默认显示第一天(8/11)
const todayTimeline = timeline[0];
const todayHotTopics = todayTimeline.directions.map((direction, index) => ({
  id: `today-${index}`,
  label: direction,
  tag: "当日热点",
  topics: [],
  desc: direction,
}));

type TopicId = DirectionId | string;
type SeedAiAction = "package" | "video"; // "script" 已被砍掉
type SeedScope = "current" | "all";
type SeedAiResult = {
  action: SeedAiAction;
  title: string;
  intro: string;
  sections?: Array<{ label: string; content: string }>;
  scriptRows?: Array<{ time: string; voice: string; visual: string }>;
  materials?: Array<{ name: string; type: string; note: string }>;
  video?: {
    src: string;
    title: string;
    copy: string;
    tags: string[];
  };
  downloadUrl?: string;
  isError?: boolean;
  isLoading?: boolean;
  isWarning?: boolean;
  needsConfirmation?: boolean;
  pendingRequest?: { seedId: string; userRequest: string; brief?: string };
};

const seedAiActionMeta: Record<
  SeedAiAction,
  { label: string; placeholder: string }
> = {
  package: {
    label: "素材包生成",
    placeholder: "例如：我具备视频剪辑能力，请按现场感和互动感生成素材包",
  },
  video: {
    label: "视频生成",
    placeholder: "例如：请根据活动现场和粉丝互动，直接生成一支可发布的种子裂变视频",
  },
};

type SeedCard = {
  id: string;
  title: string;
  topicId: TopicId;
  source: string;
  mediaType: string;
  image: string;
  desc: string;
  topics: string[];
  count: string;
};

const seedCards = seeds.map(seed => ({
  id: seed.id,
  title: seed.title,
  topicId: seed.directionId,
  source: "813 种子内容",
  mediaType: "视频",
  image: seedStageImage.main,
  desc: seed.angle,
  topics: ["种子内容", seed.status === "ready" ? "可用" : "准备中"],
  count: seed.status === "ready" ? "素材齐全" : "准备中",
}));

const expandedSeedCards = seedCards; // 不再展开假卡

const seedDetailPanels = [
  {
    title: "内容方向",
    copy: "这组种子不适合只当“晚会照片”使用，更适合拆成三条传播主线：第一条是盛典现场的仪式感，用舞台、大屏、灯光和开场节奏建立品牌声量；第二条是粉丝与品牌的双向奔赴，用互动、欢呼、合影和情绪瞬间建立真实感；第三条是产品与品牌符号的自然露出，把红旗的产品气质放进活动记忆里。",
    featured: true,
  },
  {
    title: "舞台氛围",
    copy: "适合做开场镜头、封面背景和活动回顾主视觉，关键词可标注为“晚会、舞台、灯光、盛典、开场”。",
  },
  {
    title: "粉丝情绪",
    copy: "重点捕捉观众、互动、应援和现场热度，用来支撑“用户共创”“热爱同行”类表达。",
  },
  {
    title: "品牌信息",
    copy: "保留红旗、813粉丝盛典、产品露出、主视觉元素等识别信息，便于后续检索和审核。",
  },
  {
    title: "内容风险",
    copy: "发布前需要检查人物肖像、现场屏幕文字、品牌称谓和车型露出是否准确，避免误读活动主题。",
  },
];

const seedKeywords = [
  "813粉丝盛典",
  "晚会现场",
  "舞台大屏",
  "灯光氛围",
  "粉丝互动",
  "品牌共创",
  "活动回顾",
  "短视频脚本",
  "图文标题",
  "发布审核",
];

const seedScripts = [
  {
    title: "结构一｜高燃开场",
    copy: "从舞台灯光和大屏画面切入，用一句“813粉丝盛典现场，把红旗和热爱放在同一个舞台上”建立情绪，再接现场人群、主视觉和品牌露出的快速蒙太奇。",
  },
  {
    title: "结构二｜粉丝同行",
    copy: "先给观众和互动镜头，再落到“这不是一次单向发布，而是品牌和用户一起完成的盛典”。适合做更温暖、更真实的活动回顾。",
  },
  {
    title: "结构三｜品牌记忆",
    copy: "以红旗符号、舞台主视觉和产品露出为线索，把现场素材整理成“看见热爱、看见用户、看见红旗下一步”的传播短片。",
  },
];

const seedVisuals = [
  { label: "主视觉", image: seedStageImage.main },
  { label: "互动瞬间", image: seedStageImage.interaction },
  { label: "传播画面", image: seedStageImage.crowd },
];

const topicAnalysis: Record<TopicId, { explain: string; direction: string }> =
  Object.fromEntries(
    directions.map(d => [d.id, { explain: d.whyNow, direction: d.howTo }])
  ) as Record<TopicId, { explain: string; direction: string }>;

// 当天热点方向的分析数据
const todayTopicAnalysis: Record<string, { explain: string; direction: string }> =
  Object.fromEntries(
    todayHotTopics.map(topic => [
      topic.id,
      {
        explain: `${todayTimeline.label}的重点传播方向之一`,
        direction: `${todayTimeline.focus}。这个方向下，可以围绕"${topic.label}"展开内容创作。`,
      }
    ])
  );

// 合并两个分析数据源
const allTopicAnalysis = { ...topicAnalysis, ...todayTopicAnalysis };

type KnowledgeAiModuleId = "qa" | "review" | "analysis" | "copy" | "material";

const knowledgeAiModules: Array<{
  id: KnowledgeAiModuleId;
  label: string;
  tag: string;
  note: string;
  examples: string[];
}> = [
  {
    id: "qa",
    label: "知识库问答",
    tag: "检索 / 确认口径",
    note: "适合从 813 专项资料库里找答案、查资料、确认产品和项目口径。",
    examples: [
      "查询813项目的核心背景信息，并整理成简洁说明。",
      "查找目前知识库中关于813活动规则的资料，并列出重点。",
      "查询某个产品的核心卖点、适用人群和推荐表达。",
      "查找813相关公关口径中，关于用户疑问回复的内容。",
    ],
  },
  {
    id: "review",
    label: "内容审核",
    tag: "事实 / 风险 / 口径",
    note: "适合粘贴文案、脚本、评论回复或种子内容，让 AI 基于知识库审核。",
    examples: [
      "请审核以下文案是否符合813项目的传播口径。",
      "请检查这段内容中是否存在夸大宣传、事实错误或敏感表达。",
      "请判断这段短视频脚本是否和知识库中的产品信息一致。",
      "请审核这段评论区回复是否存在公关风险。",
    ],
  },
  {
    id: "analysis",
    label: "内容分析",
    tag: "归纳 / 对比 / 提炼",
    note: "适合选中一个或多个知识库内容后，做归纳、对比和传播信息提炼。",
    examples: [
      "请分析我选择的这些资料，提炼出3个最适合传播的核心卖点。",
      "请对比这些资料中的表达差异，并整理出统一口径。",
      "请从这些资料里提炼适合短视频开头使用的信息。",
      "请分析这些内容适合哪些平台发布。",
    ],
  },
  {
    id: "copy",
    label: "文案加工",
    tag: "脚本 / 标题 / 改写",
    note: "适合基于选中的知识库资料，生成可用图文、短视频脚本和平台标题。",
    examples: [
      "请基于我选择的资料，生成一篇小红书风格的种草文案。",
      "请把这些产品信息改写成30秒短视频口播脚本。",
      "请根据这些资料，生成3个适合抖音发布的视频标题。",
      "请把这段官方资料改写成更适合普通用户理解的表达。",
    ],
  },
  {
    id: "material",
    label: "素材匹配",
    tag: "图片 / 视频 / 封面",
    note: "适合根据脚本、选中资料或传播目标，推荐可搭配的图片和视频素材。",
    examples: [
      "请根据这个短视频脚本，推荐可搭配的视频素材。",
      "请找出适合813专题页使用的核心视觉素材。",
      "请判断这些素材是否适合对外传播。",
      "请根据选中内容，推荐封面图方向和标题文案。",
    ],
  },
];

const knowledgeAiEntryCards: Array<{
  moduleId: KnowledgeAiModuleId;
  lead: string;
  title: string;
  defaultPrompt: string;
  description: string;
}> = [
  {
    moduleId: "qa",
    lead: "01",
    title: "知识库信息搜索",
    defaultPrompt: "我想搜索一下关于红旗HS6的一些信息",
    description: "帮你从知识库里快速找到资料和答案，并标清信息来自哪里。",
  },
  {
    moduleId: "copy",
    lead: "02",
    title: "AI内容制作",
    defaultPrompt: "围绕红旗新车卖点，写3条短视频开场",
    description: "把已有资料改写成脚本、标题、发布文案等可以直接使用的内容。",
  },
  {
    moduleId: "review",
    lead: "03",
    title: "内容信息审核",
    defaultPrompt: "这段话有没有夸大或不准确的地方",
    description: "检查文案有没有不准确、太夸张或不适合公开发布的地方。",
  },
];

const knowledgeAiSearchResults = [
  {
    title: "HS6 PHEV 产品培训课件",
    tag: "产品资料",
    score: "96%",
    note: "包含车型定位、核心卖点、空间、混动、安全和智驾信息。",
  },
  {
    title: "HS6 上市后用户调研报告",
    tag: "用户调研",
    score: "91%",
    note: "包含用户画像、购买动机、战胜战败因素和传播机会点。",
  },
  {
    title: "813 项目传播背景",
    tag: "项目背景",
    score: "86%",
    note: "用于确认项目阶段、传播目标和基础背景口径。",
  },
  {
    title: "平台传播规则速查",
    tag: "平台规则",
    score: "78%",
    note: "用于校验小红书、抖音、视频号的表达边界。",
  },
  {
    title: "产品图片棚拍素材",
    tag: "素材资源",
    score: "72%",
    note: "可用于封面、图文配图和产品视觉素材匹配。",
  },
];

function LandingPage({
  isLaunching,
  onStart,
  authMode,
  authMessage,
  onAuthModeChange,
  onLogin,
  onRegister,
  onInvitationApply,
}: {
  isLaunching: boolean;
  onStart: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  authMode: "intro" | "login" | "register" | "invite";
  authMessage: string;
  onAuthModeChange: (mode: "login" | "register" | "invite") => void;
  onLogin: (accountName: string, password: string) => void;
  onRegister: (data: { accountName: string; password: string; inviteCode: string }) => void;
  onInvitationApply: (data: {
    realName: string;
    identity: string;
    email: string;
    usage: string;
  }) => void;
}) {
  const [pointer, setPointer] = React.useState({ x: 0, y: 0 });
  const [loginAccount, setLoginAccount] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [registerAccount, setRegisterAccount] = React.useState("");
  const [registerPassword, setRegisterPassword] = React.useState("");
  const [inviteCode, setInviteCode] = React.useState("");
  const [realName, setRealName] = React.useState("");
  const [identity, setIdentity] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [usage, setUsage] = React.useState("");

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 36;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 24;
    setPointer({ x, y });
  };

  const handlePointerLeave = () => {
    setPointer({ x: 0, y: 0 });
  };

  return (
    <main className="hero-page">
      <section
        className={`poster-frame ${isLaunching ? "is-launching" : ""}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={
          {
            "--mx": `${pointer.x}px`,
            "--my": `${pointer.y}px`,
            "--bg-x": `${pointer.x * 0.35}px`,
            "--bg-y": `${pointer.y * 0.35}px`,
            "--left-x": `${pointer.x * -0.08}px`,
            "--left-y": `${pointer.y * -0.05}px`,
            "--right-x": `${pointer.x * 0.08}px`,
            "--right-y": `${pointer.y * 0.05}px`,
            "--soft-x": `${pointer.x * 0.02}px`,
            "--soft-y": `${pointer.y * 0.02}px`,
            "--footer-x": `${pointer.x * 0.015}px`,
            "--footer-y": `${pointer.y * 0.015}px`,
          } as React.CSSProperties
        }
      >
        <div className="hero-color-bends-bg" aria-hidden="true">
          <ColorBends
            colors={[
              "#fcfcfa",
              "#eeeeec",
              "#dedfdd",
              "#ced0cf",
              "#babdbd",
              "#a8acad",
              "#969b9e",
            ]}
            rotation={90}
            autoRotate={0}
            speed={0.2}
            scale={1}
            frequency={1}
            warpStrength={1}
            mouseInfluence={1}
            parallax={0.5}
            noise={0.15}
            iterations={1}
            intensity={1.5}
            bandWidth={6}
            transparent={false}
          />
        </div>

        <header className="poster-nav">
          <button className="menu-button" aria-label="打开菜单">
            <span />
            <span />
          </button>
          <nav aria-label="主导航">
            <a href="#ai">AI</a>
            <a href="#library">KNOWLEDGE</a>
            <a href="#seed">SEED 813</a>
          </nav>
        </header>

        <div className="hero-grid">
          <aside className="left-mark">
            <strong>08&apos;13</strong>
            <span>PROJECT DATA SHOW</span>
          </aside>

          <section className={authMode === "intro" ? "right-copy" : "right-copy auth-copy"}>
            {authMode === "intro" ? (
              <>
                <p className="event-kicker">
                  红旗粉丝「家」年华暨智能科技体验日
                </p>
                <h1>专项知识库</h1>
                <div className="copy-line" />
                <span>
                  登记制准入 / 知识库增强 / 模板化AI
                  <br />
                  让资料、审核与种子裂变沿一条清晰路径运转
                </span>
              </>
            ) : (
              <div className="auth-panel">
                <header>
                  <span>INVITATION ACCESS</span>
                  <strong>
                    {authMode === "login"
                      ? "账号登录"
                      : authMode === "register"
                        ? "注册账号"
                        : "申请邀请码"}
                  </strong>
                  <p>
                    {authMode === "login"
                      ? "请先登录后进入 813 专项知识库工作台。"
                      : authMode === "register"
                        ? "注册采用邀约制，请填写账号信息和邀请码。"
                        : "没有邀请码时，请提交真实信息，确认后邀请码会发送至邮箱。"}
                  </p>
                </header>

                {authMode === "login" ? (
                  <form
                    className="auth-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onLogin(loginAccount, loginPassword);
                    }}
                  >
                    <label>
                      <span>账号名</span>
                      <input
                        value={loginAccount}
                        onChange={(event) => setLoginAccount(event.currentTarget.value)}
                        placeholder="请输入账号名"
                      />
                    </label>
                    <label>
                      <span>密码</span>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(event) => setLoginPassword(event.currentTarget.value)}
                        placeholder="请输入密码"
                      />
                    </label>
                    {authMessage ? <p className="auth-message">{authMessage}</p> : null}
                    <button type="submit">登录并进入</button>
                    <button type="button" onClick={() => onAuthModeChange("register")}>
                      注册账号
                    </button>
                  </form>
                ) : null}

                {authMode === "register" ? (
                  <form
                    className="auth-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onRegister({
                        accountName: registerAccount,
                        password: registerPassword,
                        inviteCode,
                      });
                    }}
                  >
                    <label>
                      <span>账号名</span>
                      <input
                        value={registerAccount}
                        onChange={(event) => setRegisterAccount(event.currentTarget.value)}
                        placeholder="支持中文账号名"
                      />
                    </label>
                    <label>
                      <span>密码</span>
                      <input
                        type="password"
                        value={registerPassword}
                        onChange={(event) => setRegisterPassword(event.currentTarget.value)}
                        placeholder="设置登录密码"
                      />
                    </label>
                    <label>
                      <span>邀请码</span>
                      <input
                        value={inviteCode}
                        onChange={(event) => setInviteCode(event.currentTarget.value)}
                        placeholder="请输入邀请码"
                      />
                    </label>
                    {authMessage ? <p className="auth-message">{authMessage}</p> : null}
                    <button type="submit">提交注册</button>
                    <button type="button" onClick={() => onAuthModeChange("invite")}>
                      没有邀请码，申请一个
                    </button>
                    <button type="button" onClick={() => onAuthModeChange("login")}>
                      返回登录
                    </button>
                  </form>
                ) : null}

                {authMode === "invite" ? (
                  <form
                    className="auth-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onInvitationApply({ realName, identity, email, usage });
                    }}
                  >
                    <label>
                      <span>真实姓名</span>
                      <input
                        value={realName}
                        onChange={(event) => setRealName(event.currentTarget.value)}
                        placeholder="请输入真实姓名"
                      />
                    </label>
                    <label>
                      <span>身份</span>
                      <input
                        value={identity}
                        onChange={(event) => setIdentity(event.currentTarget.value)}
                        placeholder="如：项目成员 / 代理商 / 内容团队"
                      />
                    </label>
                    <label>
                      <span>邮箱</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.currentTarget.value)}
                        placeholder="用于接收邀请码"
                      />
                    </label>
                    <label>
                      <span>使用需求说明</span>
                      <textarea
                        value={usage}
                        onChange={(event) => setUsage(event.currentTarget.value)}
                        placeholder="请简要说明你希望使用知识库完成什么工作"
                      />
                    </label>
                    {authMessage ? <p className="auth-message">{authMessage}</p> : null}
                    <button type="submit">提交申请</button>
                    <button type="button" onClick={() => onAuthModeChange("register")}>
                      返回注册
                    </button>
                  </form>
                ) : null}
              </div>
            )}
          </section>
        </div>

        {authMode === "intro" ? (
          <a className="start-cue" href="#ai" aria-label="开始使用" onClick={onStart}>
            <span className="start-cue-line" />
            <span className="start-cue-text">开始使用</span>
            <span className="start-cue-arrow" />
          </a>
        ) : null}

        <footer className="poster-footer">
          <span>S W I G E&nbsp;&nbsp; V I S U A L&nbsp;&nbsp; D E S I G N</span>
          <span>资料沉淀 — AI处理 — 种子裂变</span>
        </footer>
      </section>
    </main>
  );
}

function WorkbenchPage({
  isEntering,
  accountName,
  onAccountUpdate,
  onPasswordUpdate,
  onLogout,
}: {
  isEntering: boolean;
  accountName: string;
  onAccountUpdate: (nextAccountName: string) => void;
  onPasswordUpdate: (currentPassword: string, nextPassword: string) => boolean;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = React.useState("seed");
  const [activeSubTab, setActiveSubTab] = React.useState("topic-board");
  const [activeTopicId, setActiveTopicId] = React.useState<TopicId>(todayHotTopics[0].id);
  const [seedScope, setSeedScope] = React.useState<SeedScope>("current");
  const topicDetailRef = React.useRef<HTMLElement | null>(null);
  const topicChangeTweenRef = React.useRef<gsap.core.Tween | null>(null);
  const topicDetailMountedRef = React.useRef(false);
  const topicSelectionTokenRef = React.useRef(0);
  const [displayTab, setDisplayTab] = React.useState("seed");
  const [isContentVisible, setIsContentVisible] = React.useState(true);
  const [selectedSeed, setSelectedSeed] = React.useState<SeedCard | null>(null);
  const [seedManifest, setSeedManifest] = React.useState<any | null>(null);
  const [seedManifestState, setSeedManifestState] =
    React.useState<"loading" | "ready" | "missing">("loading");
  const [isSeedAiOpen, setIsSeedAiOpen] = React.useState(false);
  const [activeSeedAiAction, setActiveSeedAiAction] = React.useState<SeedAiAction | null>(null);
  const [isSeedAiReturning, setIsSeedAiReturning] = React.useState(false);
  const [isSeedAiGenerating, setIsSeedAiGenerating] = React.useState(false);
  const [seedAiResult, setSeedAiResult] = React.useState<SeedAiResult | null>(null);
  const [seedAiPrompt, setSeedAiPrompt] = React.useState("");
  const [selectedLibraryEntry, setSelectedLibraryEntry] = React.useState<LibraryEntry | null>(null);
  const [activeLibraryAnalysisTab, setActiveLibraryAnalysisTab] = React.useState("overview");
  const [libraryFolders, setLibraryFolders] = React.useState<LibraryFolder[]>([
    { id: "default", name: "默认收集夹", items: [] },
  ]);
  const [activeLibraryFolderId, setActiveLibraryFolderId] = React.useState("default");
  const [isLibraryDrawerOpen, setIsLibraryDrawerOpen] = React.useState(false);
  const [renamingLibraryFolderId, setRenamingLibraryFolderId] = React.useState<string | null>(null);
  const [activeKnowledgeAiModule, setActiveKnowledgeAiModule] =
    React.useState<KnowledgeAiModuleId>("qa");
  const [knowledgeAiPrompt, setKnowledgeAiPrompt] = React.useState("");
  const [selectedKnowledgeAiMenu, setSelectedKnowledgeAiMenu] =
    React.useState<KnowledgeAiModuleId | null>(null);
  const [selectedKnowledgeSources, setSelectedKnowledgeSources] = React.useState<string[]>([
    knowledgeAiSearchResults[0].title,
    knowledgeAiSearchResults[1].title,
  ]);
  const [hasKnowledgeAiResult, setHasKnowledgeAiResult] = React.useState(false);
  const [knowledgeAiAnswer, setKnowledgeAiAnswer] = React.useState("");
  // Failures are kept separate from the answer. Previously the raw backend
  // response body was written into knowledgeAiAnswer, which showed users a JSON
  // blob and left no way to retry.
  const [knowledgeAiError, setKnowledgeAiError] = React.useState("");
  // Set when the user stops generation, so the UI can say so instead of
  // rendering the "no answer yet" placeholder as if something broke.
  const [wasKnowledgeAiStopped, setWasKnowledgeAiStopped] = React.useState(false);
  const [knowledgeAiSearchModalResult, setKnowledgeAiSearchModalResult] = React.useState<KnowledgeAiSearchResult | null>(null);
  const [isKnowledgeAiSearchModalOpen, setIsKnowledgeAiSearchModalOpen] = React.useState(false);
  const [knowledgeAiToolCalls, setKnowledgeAiToolCalls] = React.useState<KnowledgeAiToolCall[]>([]);
  const [knowledgeAiReferences, setKnowledgeAiReferences] = React.useState<KnowledgeAiReference[]>([]);
  const [knowledgeAiConversationId, setKnowledgeAiConversationId] = React.useState("");
  const [knowledgeAiLastQuestion, setKnowledgeAiLastQuestion] = React.useState("");
  const [knowledgeAiTurns, setKnowledgeAiTurns] = React.useState<KnowledgeAiTurn[]>([]);
  const [isKnowledgeAiCopied, setIsKnowledgeAiCopied] = React.useState(false);
  const [isKnowledgeAiStreaming, setIsKnowledgeAiStreaming] = React.useState(false);
  const [isKnowledgeAiConversationLoading, setIsKnowledgeAiConversationLoading] = React.useState(false);
  const [isAiConversationDrawerOpen, setIsAiConversationDrawerOpen] = React.useState(false);
  const [knowledgeAiConversations, setKnowledgeAiConversations] = React.useState<KnowledgeAiConversation[]>([]);
  const knowledgeAiMessageTypesRef = React.useRef(new Map<string, KnowledgeAiMessageType>());
  const knowledgeAiConversationIdRef = React.useRef("");
  const knowledgeAiAnswerBufferRef = React.useRef("");
  const knowledgeAiFlushTimerRef = React.useRef<number | null>(null);
  const knowledgeAiAbortControllerRef = React.useRef<AbortController | null>(null);
  const knowledgeAiConversationRef = React.useRef<HTMLDivElement | null>(null);
  const seedAiReturnTimerRef = React.useRef<number | null>(null);
  const seedAiGenerateTimerRef = React.useRef<number | null>(null);
  const minorNavRef = React.useRef<HTMLElement | null>(null);
  const minorLabelRefs = React.useRef<Record<string, HTMLSpanElement | null>>({});
  const sectionRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const contentScrollRef = React.useRef<HTMLDivElement | null>(null);
  const hasMountedContentRef = React.useRef(false);
  const [minorIndicator, setMinorIndicator] = React.useState({ left: 0, width: 0 });
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [libraryFilterBySection, setLibraryFilterBySection] = React.useState<
    Record<LibrarySectionId, string>
  >({
    "product-info": libraryFilters["product-info"][0].id,
    "communication-files": libraryFilters["communication-files"][0].id,
    "asset-library": libraryFilters["asset-library"][0].id,
    "seed-operation": libraryFilters["seed-operation"][0].id,
  });
  const [librarySubFilterBySection, setLibrarySubFilterBySection] = React.useState<
    Record<LibrarySectionId, string>
  >({
    "product-info": libraryFilters["product-info"][0].subFilters[0],
    "communication-files": libraryFilters["communication-files"][0].subFilters[0],
    "asset-library": libraryFilters["asset-library"][0].subFilters[0],
    "seed-operation": libraryFilters["seed-operation"][0].subFilters[0],
  });
  const workspaceMainRef = React.useRef<HTMLElement | null>(null);
  const [profileAccountName, setProfileAccountName] = React.useState(accountName);
  const [profileCurrentPassword, setProfileCurrentPassword] = React.useState("");
  const [profileNewPassword, setProfileNewPassword] = React.useState("");
  const [profileMessage, setProfileMessage] = React.useState("");

  const loadKnowledgeAiConversations = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_ROOT}/chat/conversations?ApplicationId=${ADP_APPLICATION_ID}`);
      if (!response.ok) return;
      const items = await response.json();
      if (Array.isArray(items)) setKnowledgeAiConversations(items);
    } catch {
      // The conversation list is auxiliary; keep the AI composer usable if it is unavailable.
    }
  }, []);

  const loadKnowledgeAiConversation = React.useCallback(async (conversation: KnowledgeAiConversation) => {
    setIsKnowledgeAiConversationLoading(true);
    knowledgeAiConversationIdRef.current = conversation.Id;
    setKnowledgeAiConversationId(conversation.Id);
    setKnowledgeAiPrompt("");
    setSelectedKnowledgeAiMenu(null);
    setKnowledgeAiAnswer("");
    setKnowledgeAiTurns([]);
    setKnowledgeAiReferences([]);
    setKnowledgeAiToolCalls([]);
    setKnowledgeAiLastQuestion("");
    setHasKnowledgeAiResult(true);
    try {
      const response = await fetch(`${API_ROOT}/chat/messages?ConversationId=${encodeURIComponent(conversation.Id)}`);
      if (!response.ok) throw new Error("历史消息查询失败");
      const payload = await response.json();
      const records = payload?.Response?.Records;
      if (!Array.isArray(records)) return;
      const parsed: KnowledgeAiTurn[] = [];
      let pendingQuestion = "";
      for (const record of records) {
        if (!record?.Content) continue;
        if (record.IsFromSelf) {
          pendingQuestion = String(record.Content);
        } else if (pendingQuestion) {
          parsed.push({ question: pendingQuestion, answer: String(record.Content), references: [], toolCalls: [] });
          pendingQuestion = "";
        }
      }
      const current = parsed.pop();
      setKnowledgeAiTurns(parsed);
      if (current) {
        setKnowledgeAiLastQuestion(current.question);
        setKnowledgeAiAnswer(current.answer);
      } else if (pendingQuestion) {
        setKnowledgeAiLastQuestion(pendingQuestion);
      } else {
        setKnowledgeAiLastQuestion(conversation.Title || "");
        setHasKnowledgeAiResult(false);
      }
    } catch {
      setHasKnowledgeAiResult(false);
    } finally {
      setIsKnowledgeAiConversationLoading(false);
    }
  }, []);

  const active = React.useMemo(
    () => majorTabs.find((item) => item.id === activeTab) || majorTabs[0],
    [activeTab],
  );
  const isProfileTab = activeTab === "profile";
  const activeSubTabs = isProfileTab ? [] : active.subTabs || [];
  const activeLibrarySection = React.useMemo(
    () =>
      librarySections.find((section) => section.id === activeSubTab) || librarySections[0],
    [activeSubTab],
  );
  const activeLibraryFilterId = libraryFilterBySection[activeLibrarySection.id];
  const activeLibraryFilters = libraryFilters[activeLibrarySection.id];
  const activeLibraryFilter =
    activeLibraryFilters.find((filter) => filter.id === activeLibraryFilterId) ||
    activeLibraryFilters[0];
  const activeLibrarySubFilter =
    librarySubFilterBySection[activeLibrarySection.id] || activeLibraryFilter.subFilters[0];
  const baseLibraryEntries =
    activeLibrarySection.id === "product-info" && activeLibraryFilter.id === "hs6"
      ? [...hs6LibraryEntries, ...hs6ImageEntries]
      : activeLibrarySection.id === "product-info" && activeLibraryFilter.id === "h7"
        ? h7ImageEntries
      : libraryEntries[activeLibrarySection.id];
  const activeLibraryEntries =
    activeLibrarySection.id === "product-info" && activeLibrarySubFilter === "产品资料"
      ? baseLibraryEntries.filter(
          (entry) => entry.kind !== "image" && entry.tag !== "审核依据" && !entry.meta.includes("视频"),
        )
      : activeLibrarySubFilter.startsWith("全部")
        ? baseLibraryEntries
        : baseLibraryEntries.filter(
            (entry) =>
              entry.tag === activeLibrarySubFilter ||
              entry.meta.includes(activeLibrarySubFilter) ||
              entry.title.includes(activeLibrarySubFilter),
          );
  const isLibraryImageGallery =
    activeLibrarySection.id === "product-info" &&
    (activeLibrarySubFilter === "产品图片" ||
      activeLibraryEntries.every((entry) => entry.kind === "image")) &&
    activeLibraryEntries.some((entry) => entry.kind === "image");
  const activeLibraryFolder =
    libraryFolders.find((folder) => folder.id === activeLibraryFolderId) || libraryFolders[0];
  const libraryCollectionCount = libraryFolders.reduce(
    (total, folder) => total + folder.items.length,
    0,
  );
  const activeKnowledgeAiConfig =
    knowledgeAiModules.find((module) => module.id === activeKnowledgeAiModule) ||
    knowledgeAiModules[0];
  const selectedKnowledgeAiSources = knowledgeAiSearchResults.filter((result) =>
    selectedKnowledgeSources.includes(result.title),
  );
  const visibleSeedCards = React.useMemo(
    () =>
      seedScope === "current"
        ? expandedSeedCards.filter((seed) => seed.topicId === activeTopicId)
        : expandedSeedCards,
    [activeTopicId, seedScope],
  );

  React.useEffect(() => {
    if (!activeSubTabs.some((item) => item.id === activeSubTab)) {
      setActiveSubTab(activeSubTabs[0]?.id || "");
    }
  }, [activeSubTab, activeSubTabs]);

  React.useEffect(() => {
    setProfileAccountName(accountName);
  }, [accountName]);

  React.useEffect(() => {
    if (!hasMountedContentRef.current) {
      hasMountedContentRef.current = true;
      return;
    }

    setIsContentVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayTab(activeTab);
      setIsContentVisible(true);
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab === "tools") loadKnowledgeAiConversations();
  }, [activeTab, loadKnowledgeAiConversations]);

  React.useEffect(() => {
    const navNode = minorNavRef.current;
    const labelNode = minorLabelRefs.current[activeSubTab];
    if (!navNode || !labelNode) return;
    const navRect = navNode.getBoundingClientRect();
    const labelRect = labelNode.getBoundingClientRect();
    setMinorIndicator({
      left: labelRect.left - navRect.left,
      width: labelRect.width,
    });
  }, [activeTab, activeSubTab, displayTab]);

  const updateScrollProgress = React.useCallback(() => {
    const node = contentScrollRef.current;
    if (!node) return;
    const maxScroll = node.scrollHeight - node.clientHeight;
    setScrollProgress(maxScroll > 0 ? node.scrollTop / maxScroll : 0);

    if (activeTab !== "seed" || displayTab !== "seed") return;
    const anchorLine = node.getBoundingClientRect().top + 92;
    let currentSection = "topic-board";
    for (const sectionId of ["topic-board", "hotspots", "seed-content"]) {
      const section = sectionRefs.current[sectionId];
      if (section && section.getBoundingClientRect().top <= anchorLine) {
        currentSection = sectionId;
      }
    }
    setActiveSubTab((current) => (current === currentSection ? current : currentSection));
  }, [activeTab, displayTab]);

  React.useEffect(() => {
    const node = contentScrollRef.current;
    if (!node) return;
    updateScrollProgress();
    node.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      node.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("resize", updateScrollProgress);
    };
  }, [displayTab, updateScrollProgress]);

  const handleMinorSelect = (sectionId: string) => {
    setActiveSubTab(sectionId);
    if (activeTab === "library") {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (activeTab !== "seed") return;
    const node = contentScrollRef.current;
    const section = sectionRefs.current[sectionId];
    if (!node || !section) return;
    const nodeRect = node.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    node.scrollTo({
      top: node.scrollTop + sectionRect.top - nodeRect.top - 18,
      behavior: "smooth",
    });
  };

  const handleLibraryFilterSelect = (sectionId: LibrarySectionId, filterId: string) => {
    setLibraryFilterBySection((current) => ({
      ...current,
      [sectionId]: filterId,
    }));
    const nextFilter = libraryFilters[sectionId].find((filter) => filter.id === filterId);
    setLibrarySubFilterBySection((current) => ({
      ...current,
      [sectionId]: nextFilter?.subFilters[0] || current[sectionId],
    }));
  };

  const handleAddLibraryEntry = (entry: LibraryEntry) => {
    setLibraryFolders((current) =>
      current.map((folder) => {
        if (folder.id !== activeLibraryFolderId) return folder;
        if (folder.items.some((item) => item.title === entry.title)) return folder;
        return { ...folder, items: [...folder.items, entry] };
      }),
    );
    setIsLibraryDrawerOpen(true);
  };

  const handleCreateLibraryFolder = () => {
    const nextId = `folder-${Date.now()}`;
    setLibraryFolders((current) => [
      ...current,
      { id: nextId, name: `新建文件夹 ${current.length}`, items: [] },
    ]);
    setActiveLibraryFolderId(nextId);
    setRenamingLibraryFolderId(nextId);
    setIsLibraryDrawerOpen(true);
  };

  const handleRenameLibraryFolder = (folderId: string, name: string) => {
    const nextName = name.trim() || "未命名文件夹";
    setLibraryFolders((current) =>
      current.map((folder) => (folder.id === folderId ? { ...folder, name: nextName } : folder)),
    );
  };

  const handleDeleteLibraryFolder = (folderId: string) => {
    setLibraryFolders((current) => {
      if (current.length === 1) {
        return [{ ...current[0], items: [] }];
      }
      const nextFolders = current.filter((folder) => folder.id !== folderId);
      if (activeLibraryFolderId === folderId) {
        setActiveLibraryFolderId(nextFolders[0].id);
      }
      return nextFolders;
    });
  };

  const handleRemoveLibraryEntry = (folderId: string, title: string) => {
    setLibraryFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, items: folder.items.filter((item) => item.title !== title) }
          : folder,
      ),
    );
  };

  const handleDownloadLibraryFolder = () => {
    if (!activeLibraryFolder.items.length) return;

    const packageText = [
      `${activeLibraryFolder.name} / 文件收集空间批量导出`,
      `共 ${activeLibraryFolder.items.length} 个文件`,
      "",
      ...activeLibraryFolder.items.map((item, index) =>
        [
          `${index + 1}. ${item.title}`,
          `类型：${item.kind === "image" ? "图片" : "文档"}`,
          `分类：${item.tag}`,
          `信息：${item.kind === "image" ? "图片素材" : item.meta}`,
          `说明：${item.desc}`,
        ].join("\n"),
      ),
    ].join("\n\n");
    const blob = new Blob([packageText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeLibraryFolder.name}-批量下载清单.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const flushKnowledgeAiStream = () => {
    if (knowledgeAiFlushTimerRef.current !== null) {
      window.clearTimeout(knowledgeAiFlushTimerRef.current);
      knowledgeAiFlushTimerRef.current = null;
    }
    const answerDelta = knowledgeAiAnswerBufferRef.current;
    knowledgeAiAnswerBufferRef.current = "";
    if (answerDelta) setKnowledgeAiAnswer((current) => current + answerDelta);
  };

  const scheduleKnowledgeAiFlush = () => {
    if (knowledgeAiFlushTimerRef.current !== null) return;
    knowledgeAiFlushTimerRef.current = window.setTimeout(flushKnowledgeAiStream, 50);
  };

  const handleKnowledgeAiSubmit = async (questionOverride?: string) => {
    const question = (questionOverride || knowledgeAiPrompt).trim();
    if (!question || isKnowledgeAiStreaming) return;
    const abortController = new AbortController();
    knowledgeAiAbortControllerRef.current = abortController;
    knowledgeAiMessageTypesRef.current.clear();
    flushKnowledgeAiStream();
    if (knowledgeAiLastQuestion && (knowledgeAiAnswer || knowledgeAiToolCalls.length > 0)) {
      setKnowledgeAiTurns((current) => [
        ...current,
        {
          question: knowledgeAiLastQuestion,
          answer: knowledgeAiAnswer,
          references: knowledgeAiReferences,
          toolCalls: knowledgeAiToolCalls,
        },
      ]);
    }
    setHasKnowledgeAiResult(true);
    setKnowledgeAiAnswer("");
    setKnowledgeAiSearchModalResult(null);
    setIsKnowledgeAiSearchModalOpen(false);
    setKnowledgeAiToolCalls([]);
    setKnowledgeAiReferences([]);
    setKnowledgeAiLastQuestion(question);
    setIsKnowledgeAiCopied(false);
    setKnowledgeAiError("");
    setWasKnowledgeAiStopped(false);
    setIsKnowledgeAiStreaming(true);
    if (selectedKnowledgeSources.length === 0) {
      setSelectedKnowledgeSources([
        knowledgeAiSearchResults[0].title,
        knowledgeAiSearchResults[1].title,
      ]);
    }
    try {
      const response = await fetch(`${API_ROOT}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          Contents: [{ Type: "text", Text: question }],
          ConversationId: knowledgeAiConversationIdRef.current || undefined,
          ApplicationId: ADP_APPLICATION_ID,
        }),
      });
      if (!response.ok || !response.body) {
        // Carry the status code, not the upstream body: the body is raw JSON or a
        // stack trace, and these users cannot act on either.
        throw new KnowledgeAiRequestError(response.status);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.Type === "conversation" && payload.Payload?.Id) {
              knowledgeAiConversationIdRef.current = payload.Payload.Id;
              setKnowledgeAiConversationId(payload.Payload.Id);
              setKnowledgeAiConversations((current) => {
                const conversation = payload.Payload as KnowledgeAiConversation;
                const next = current.filter((item) => item.Id !== conversation.Id);
                return [conversation, ...next].sort((a, b) => b.LastActiveAt - a.LastActiveAt);
              });
              continue;
            }

            if (["message.added", "message.processing", "message.done"].includes(payload.Type)) {
              const message = payload.Message;
              const messageId = message?.MessageId || payload.MessageId;
              if (messageId && message?.Type) {
                knowledgeAiMessageTypesRef.current.set(messageId, message.Type);
              }
              if (messageId && message?.Type === "tool_call") {
                setKnowledgeAiToolCalls((current) => {
                  const index = current.findIndex((item) => item.id === messageId);
                  const existing = index === -1 ? undefined : current[index];
                  const toolName = message.ExtraInfo?.ToolName
                    ? String(message.ExtraInfo.ToolName).split("/")[0]
                    : existing?.name || message.Name || "知识库工具";
                  const nextTool: KnowledgeAiToolCall = {
                    id: messageId,
                    name: toolName,
                    title: message.Title || existing?.title || "正在调用知识库能力",
                    status: message.Status || "processing",
                    statusLabel: message.StatusDesc || (message.Status === "success" ? "已完成" : "执行中"),
                  };
                  return index === -1
                    ? [...current, nextTool]
                    : current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextTool } : item));
                });
              }
              continue;
            }

            if (payload.Type === "text.delta" && payload.Text) {
              const messageType = knowledgeAiMessageTypesRef.current.get(payload.MessageId);
              if (messageType === "reply") {
                knowledgeAiAnswerBufferRef.current += payload.Text;
                scheduleKnowledgeAiFlush();
              }
              continue;
            }

            if (payload.Type === "reference.added" && payload.Reference) {
              const reference = payload.Reference;
              const doc = reference.DocRefer || {};
              const nextReference: KnowledgeAiReference = {
                id: reference.Id || reference.ReferBizId || doc.ReferenceId || doc.ReferBizId || `${reference.Name || doc.DocName}-${reference.Index || 0}`,
                name: reference.Name || reference.DocName || doc.DocName || "知识库资料",
                knowledgeName: reference.KnowledgeName || doc.KnowledgeName || "717-hongqi-kb",
                pages: Array.isArray(reference.PageInfos) ? reference.PageInfos : [],
                url: reference.Url || doc.Url || "",
              };
              setKnowledgeAiReferences((current) => {
                const index = current.findIndex((item) => item.id === nextReference.id);
                return index === -1
                  ? [...current, nextReference]
                  : current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextReference } : item));
              });
              continue;
            }

            if (payload.Type === "response.completed" && payload.Response?.ConversationId) {
              knowledgeAiConversationIdRef.current = payload.Response.ConversationId;
              setKnowledgeAiConversationId(payload.Response.ConversationId);
            }
          } catch {
            // Ignore keepalive and incomplete SSE frames.
          }
        }
      }
    } catch (error) {
      // Aborts are a user action, not a failure: handleKnowledgeAiStop owns that
      // message. Everything else becomes plain language — the raw upstream body
      // (often a JSON error envelope) must never reach a non-technical user.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setKnowledgeAiError(describeKnowledgeAiError(error));
      }
    } finally {
      flushKnowledgeAiStream();
      if (knowledgeAiAbortControllerRef.current === abortController) {
        knowledgeAiAbortControllerRef.current = null;
      }
      setIsKnowledgeAiStreaming(false);
    }
  };

  const handleKnowledgeAiStop = () => {
    knowledgeAiAbortControllerRef.current?.abort();
    knowledgeAiAbortControllerRef.current = null;
    // Flush whatever already arrived so the user keeps the partial answer
    // instead of watching it disappear.
    flushKnowledgeAiStream();
    setWasKnowledgeAiStopped(true);
    setIsKnowledgeAiStreaming(false);
  };

  const handleKnowledgeAiCopy = async () => {
    if (!knowledgeAiAnswer) return;
    await navigator.clipboard.writeText(knowledgeAiAnswer);
    setIsKnowledgeAiCopied(true);
    window.setTimeout(() => setIsKnowledgeAiCopied(false), 1600);
  };

  React.useEffect(() => {
    if (!hasKnowledgeAiResult) return;
    const frame = window.requestAnimationFrame(() => {
      const conversation = knowledgeAiConversationRef.current;
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasKnowledgeAiResult, knowledgeAiAnswer, knowledgeAiToolCalls]);

  React.useEffect(() => {
    if (isKnowledgeAiStreaming) return;
    const result = parseKnowledgeAiSearchResult(knowledgeAiAnswer);
    if (!result) return;
    setKnowledgeAiSearchModalResult(result);
    setIsKnowledgeAiSearchModalOpen(true);
  }, [isKnowledgeAiStreaming, knowledgeAiAnswer]);

  React.useEffect(() => {
    if (!isKnowledgeAiSearchModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsKnowledgeAiSearchModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isKnowledgeAiSearchModalOpen]);

  const handleKnowledgeAiEntrySelect = (card: (typeof knowledgeAiEntryCards)[number]) => {
    handleKnowledgeAiStop();
    setActiveKnowledgeAiModule(card.moduleId);
    setKnowledgeAiPrompt("");
    setHasKnowledgeAiResult(false);
    setSelectedKnowledgeAiMenu(card.moduleId);
  };

  const handleKnowledgeAiPromptSelect = (prompt: string) => {
    setKnowledgeAiPrompt(prompt);
    setHasKnowledgeAiResult(false);
  };

  React.useEffect(() => {
    if (seedAiReturnTimerRef.current) {
      window.clearTimeout(seedAiReturnTimerRef.current);
      seedAiReturnTimerRef.current = null;
    }
    setIsSeedAiOpen(false);
    setActiveSeedAiAction(null);
    setIsSeedAiReturning(false);
    setIsSeedAiGenerating(false);
    setSeedAiResult(null);
    setSeedAiPrompt("");
    if (!selectedSeed) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedSeed(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSeed]);

  React.useEffect(() => {
    if (!selectedSeed) {
      setSeedManifest(null);
      setSeedManifestState("loading");
      return;
    }

    // manifest 是 public/seeds/ 下的生成产物，由 scripts/sync-seed-manifests.mjs
    // 从 src/data/seed/manifests/ 同步而来。没有 manifest 的种子（素材还没拍）
    // 会拿到 404，这不是错误，是「素材准备中」的正常状态。
    let cancelled = false;
    const seedId = selectedSeed.id;
    setSeedManifest(null);
    setSeedManifestState("loading");

    fetch(`/seeds/${seedId}.json`)
      .then(async (res) => {
        if (!res.ok) return null;
        // 404 时 dev server 会回 index.html，不是 JSON，所以解析失败也算「没有」
        try {
          return await res.json();
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.segments) && data.segments.length > 0) {
          setSeedManifest(data);
          setSeedManifestState("ready");
        } else {
          setSeedManifest(null);
          setSeedManifestState("missing");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSeedManifest(null);
        setSeedManifestState("missing");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSeed]);

  React.useEffect(() => {
    setActiveLibraryAnalysisTab("overview");
    if (!selectedLibraryEntry) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedLibraryEntry(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLibraryEntry]);

  React.useEffect(() => {
    return () => {
      if (seedAiReturnTimerRef.current) {
        window.clearTimeout(seedAiReturnTimerRef.current);
      }
      if (seedAiGenerateTimerRef.current) {
        window.clearTimeout(seedAiGenerateTimerRef.current);
      }
    };
  }, []);

  const handleSeedAiBack = () => {
    if (!activeSeedAiAction || isSeedAiReturning || isSeedAiGenerating) return;
    setIsSeedAiReturning(true);
    if (seedAiReturnTimerRef.current) {
      window.clearTimeout(seedAiReturnTimerRef.current);
    }
    seedAiReturnTimerRef.current = window.setTimeout(() => {
      setActiveSeedAiAction(null);
      setSeedAiPrompt("");
      setSeedAiResult(null);
      setIsSeedAiReturning(false);
      seedAiReturnTimerRef.current = null;
    }, 190);
  };

  const handleSeedAiSubmit = async () => {
    if (!activeSeedAiAction || isSeedAiGenerating) return;
    const submittedPrompt = seedAiPrompt;
    const seedId = selectedSeed?.id;

    setIsSeedAiGenerating(true);
    setSeedAiResult(null);

    if (seedAiGenerateTimerRef.current) {
      window.clearTimeout(seedAiGenerateTimerRef.current);
    }

    try {
      const seedTitle = selectedSeed?.title || "813粉丝盛典｜晚会舞台种子";

      if (activeSeedAiAction === "package") {
        // Step 1: 静默判断可行性（不显示UI）
        const feasibilityResponse = await fetch('http://127.0.0.1:8796/seed/feasibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seedId,
            userRequest: submittedPrompt || '生成素材包',
          }),
        });

        if (!feasibilityResponse.ok) {
          const error = await feasibilityResponse.json().catch(() => ({ error: '可行性判断失败' }));
          throw new Error(error.error || `HTTP ${feasibilityResponse.status}`);
        }

        const feasibility = await feasibilityResponse.json();

        // Step 2: 根据可行性决定是否继续
        if (feasibility.verdict === 'unsupported') {
          setSeedAiResult({
            action: "package",
            title: "暂不支持此需求",
            intro: feasibility.reason.replace(/种子内容|种子/g, "素材库"),
            sections: [
              {
                label: "建议",
                content: feasibility.fallback?.replace(/种子内容|种子/g, "素材") || "请尝试调整需求描述",
              },
            ],
            isError: true,
          });
          return;
        }

        if (feasibility.verdict === 'degradable') {
          // 显示调整方案，等待用户确认
          setSeedAiResult({
            action: "package",
            title: "需要调整一下",
            intro: feasibility.reason.replace(/种子内容|种子/g, "素材库"),
            sections: [
              {
                label: "调整方案",
                content: feasibility.fallback?.replace(/种子内容|种子/g, "素材") || "根据现有素材生成",
              },
            ],
            isWarning: true,
            needsConfirmation: true,
            pendingRequest: { seedId, userRequest: submittedPrompt || '生成素材包', brief: feasibility.brief },
          });
          return; // 等待用户点击"继续生成"
        }

        // Step 3: supported - 直接生成素材包
        setSeedAiResult({
          action: "package",
          title: "生成中...",
          intro: "正在为你准备素材包",
          isLoading: true,
        });

        const response = await fetch('http://127.0.0.1:8793/seed/package', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seedId,
            userRequest: submittedPrompt || '生成素材包',
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: '请求失败' }));
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        setSeedAiResult({
          action: "package",
          title: "素材包已生成",
          intro: submittedPrompt
            ? `已根据你的需求生成素材包：${submittedPrompt}`
            : "基于当前种子内容，已生成可直接使用的素材包。",
          sections: [
            {
              label: "素材包信息",
              content: `包含 ${result.clipCount} 个视频片段，总时长 ${result.totalDuration.toFixed(1)} 秒。`,
            },
          ],
          downloadUrl: `http://127.0.0.1:8793${result.zipUrl}`,
        });
      } else if (activeSeedAiAction === "video") {
        await new Promise(resolve => setTimeout(resolve, 2000));
        setSeedAiResult({
          action: "video",
          title: "视频生成结果",
          intro: submittedPrompt
            ? `已根据你的要求生成视频交付：${submittedPrompt}`
            : "基于当前种子内容生成一支可发布的种子裂变视频，并同步整理发布信息。",
          sections: [
            {
              label: "发布标题",
              content: "813粉丝盛典现场高光｜这一晚，把热爱拍成了记忆",
            },
            {
              label: "发布文案",
              content: "从舞台灯光到粉丝互动，从现场欢呼到品牌共创，这支视频适合用作活动后第一波裂变传播。",
            },
            {
              label: "发布话题标签",
              content: "#813粉丝盛典 #红旗粉丝家年华 #现场高光 #品牌共创 #活动回顾",
            },
          ],
          video: {
            src: seedDeliveryDemoVideo,
            title: "813粉丝盛典裂变视频",
            copy: "建议发布在抖音 / 视频号 / 小红书。",
            tags: ["#813粉丝盛典", "#现场高光", "#品牌共创", "#活动回顾"],
          },
        });
      } else {
        throw new Error('不支持的操作类型');
      }
    } catch (error) {
      console.error('[seed AI] 生成失败:', error);
      setSeedAiResult({
        action: activeSeedAiAction,
        title: "生成失败",
        intro: error.message || "请求失败，请稍后重试",
        sections: [
          {
            label: "错误信息",
            content: String(error.message || error),
          },
        ],
        isError: true,
      });
    } finally {
      setIsSeedAiGenerating(false);
      setSeedAiPrompt("");
      seedAiGenerateTimerRef.current = null;
    }
  };


  const handleDownloadMaterialPackage = () => {
    if (!seedAiResult?.downloadUrl) return;
    const link = document.createElement("a");
    link.href = seedAiResult.downloadUrl;
    link.download = "";
    link.click();
  };

  const handleContinueGeneration = async () => {
    if (!seedAiResult?.pendingRequest) return;

    const { seedId, userRequest, brief } = seedAiResult.pendingRequest;

    setIsSeedAiGenerating(true);
    setSeedAiResult({
      action: "package",
      title: "生成中...",
      intro: brief || "正在为你准备素材包",
      isLoading: true,
    });

    try {
      const response = await fetch('http://127.0.0.1:8793/seed/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedId, userRequest }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      setSeedAiResult({
        action: "package",
        title: "素材包已生成",
        intro: userRequest !== '生成素材包'
          ? `已根据你的需求生成素材包：${userRequest}`
          : "基于当前种子内容，已生成可直接使用的素材包。",
        sections: [
          {
            label: "素材包信息",
            content: `包含 ${result.clipCount} 个视频片段，总时长 ${result.totalDuration.toFixed(1)} 秒。`,
          },
        ],
        downloadUrl: `http://127.0.0.1:8793${result.zipUrl}`,
      });
    } catch (error: any) {
      console.error("[seed AI continue]", error);
      setSeedAiResult({
        action: "package",
        title: "生成失败",
        intro: error.message || "生成素材包时出错，请重试",
        isError: true,
      });
    } finally {
      setIsSeedAiGenerating(false);
    }
  };

  React.useLayoutEffect(() => {
    if (!isEntering || !workspaceMainRef.current) return undefined;
    const workspaceMain = workspaceMainRef.current;
    const majorButtons = workspaceMain.querySelectorAll(".workbench-major-nav button");
    const minorButtons = workspaceMain.querySelectorAll(".workbench-minor-nav button");
    const greeting = workspaceMain.querySelector(".daily-greeting");
    const contentSections = workspaceMain.querySelectorAll(
      ".workspace-stage.is-visible > section:not(.daily-greeting)",
    );
    if (!majorButtons.length || !minorButtons.length || !greeting || !contentSections.length) {
      return undefined;
    }

    const context = gsap.context(() => {
      gsap.set([majorButtons, minorButtons, greeting, contentSections], {
        opacity: 0,
        y: 28,
      });

      const timeline = gsap.timeline({
        defaults: {
          ease: "power3.out",
          overwrite: "auto",
        },
      });

      timeline
        .to(majorButtons, {
          opacity: 1,
          y: 0,
          duration: 0.24,
          stagger: 0.035,
        })
        .to(
          minorButtons,
          {
            opacity: 1,
            y: 0,
            duration: 0.24,
            stagger: 0.035,
          },
          "-=0.12",
        )
        .to(
          greeting,
          {
            opacity: 1,
            y: 0,
            duration: 0.32,
          },
          "-=0.06",
        )
        .to(
          contentSections,
          {
            opacity: 1,
            y: 0,
            duration: 0.34,
            stagger: 0.07,
          },
          "-=0.08",
        );
    }, workspaceMain);

    return () => context.revert();
  }, []);

  React.useLayoutEffect(() => {
    const detail = topicDetailRef.current;
    if (!detail) return;
    if (!topicDetailMountedRef.current) {
      topicDetailMountedRef.current = true;
      return;
    }
    topicChangeTweenRef.current = gsap.fromTo(
      detail,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.34, ease: "power3.out" },
    );
  }, [activeTopicId]);

  React.useEffect(() => {
    return () => {
      topicChangeTweenRef.current?.kill();
    };
  }, []);

  const handleTopicSelect = (topicId: TopicId) => {
    if (topicId === activeTopicId) return;
    const detail = topicDetailRef.current;
    const selectionToken = topicSelectionTokenRef.current + 1;
    topicSelectionTokenRef.current = selectionToken;
    topicChangeTweenRef.current?.kill();
    if (!detail) {
      setActiveTopicId(topicId);
      return;
    }
    topicChangeTweenRef.current = gsap.to(detail, {
      opacity: 0,
      y: 10,
      duration: 0.16,
      ease: "power2.in",
      onComplete: () => {
        if (topicSelectionTokenRef.current === selectionToken) {
          setActiveTopicId(topicId);
        }
      },
    });
  };

  const selectedLibraryTab =
    selectedLibraryEntry?.tabs?.find((tab) => tab.id === activeLibraryAnalysisTab) ||
    selectedLibraryEntry?.tabs?.[0];

  const renderPanel = () => {
    if (displayTab === "profile") {
      return (
        <section className="profile-home">
          <div className="profile-panel">
            <header>
              <span>PERSONAL CENTER</span>
              <h1>个人中心</h1>
              <p>管理当前账号信息、登录密码和工作台访问状态。</p>
            </header>

            <div className="profile-card-grid">
              <form
                className="profile-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  const cleanName = profileAccountName.trim();
                  if (!cleanName) {
                    setProfileMessage("账号名不能为空。");
                    return;
                  }
                  onAccountUpdate(cleanName);
                  setProfileMessage("账号名已更新。");
                }}
              >
                <div className="profile-card-title">
                  <UserRound size={18} />
                  <strong>账号信息</strong>
                </div>
                <label>
                  <span>账号名</span>
                  <input
                    value={profileAccountName}
                    onChange={(event) => setProfileAccountName(event.currentTarget.value)}
                    placeholder="请输入账号名"
                  />
                </label>
                <button type="submit">保存账号名</button>
              </form>

              <form
                className="profile-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!profileNewPassword.trim()) {
                    setProfileMessage("请填写新密码。");
                    return;
                  }
                  const isUpdated = onPasswordUpdate(profileCurrentPassword, profileNewPassword);
                  setProfileMessage(isUpdated ? "密码已更新。" : "当前密码不正确。");
                  if (isUpdated) {
                    setProfileCurrentPassword("");
                    setProfileNewPassword("");
                  }
                }}
              >
                <div className="profile-card-title">
                  <KeyRound size={18} />
                  <strong>修改密码</strong>
                </div>
                <label>
                  <span>当前密码</span>
                  <input
                    type="password"
                    value={profileCurrentPassword}
                    onChange={(event) => setProfileCurrentPassword(event.currentTarget.value)}
                    placeholder="请输入当前密码"
                  />
                </label>
                <label>
                  <span>新密码</span>
                  <input
                    type="password"
                    value={profileNewPassword}
                    onChange={(event) => setProfileNewPassword(event.currentTarget.value)}
                    placeholder="请输入新密码"
                  />
                </label>
                <button type="submit">更新密码</button>
              </form>
            </div>

            <footer>
              <p>{profileMessage || `当前登录账号：${accountName}`}</p>
              <button type="button" onClick={onLogout}>
                <LogOut size={16} />
                退出登录
              </button>
            </footer>
          </div>
        </section>
      );
    }

    if (displayTab === "tools") {
      return (
        <section
          className={hasKnowledgeAiResult ? "knowledge-ai-home is-chatting" : "knowledge-ai-home"}
          onClick={(event) => {
            const target = event.target;

            if (
              !(target instanceof HTMLElement) ||
              hasKnowledgeAiResult ||
              !selectedKnowledgeAiMenu
            ) {
              return;
            }

            const isInsideKnowledgeAiControl = target.closest(
              ".knowledge-ai-heading, .knowledge-ai-entry-grid, .knowledge-ai-prompt-stack, .knowledge-ai-composer-shell, .knowledge-ai-result",
            );

            if (!isInsideKnowledgeAiControl) {
              if (selectedKnowledgeAiMenu) {
                setSelectedKnowledgeAiMenu(null);
                setKnowledgeAiPrompt("");
              }
              setHasKnowledgeAiResult(false);
            }
          }}
        >
          <div className={hasKnowledgeAiResult ? "knowledge-ai-heading is-dismissed" : "knowledge-ai-heading"}>
            <h1>智旗灵思，知行有方</h1>
            <p>
              围绕红旗知识库完成资料搜索、内容制作与信息审核，让用户用一句自然语言就能调用资料、整理表达、校验口径，把复杂的内容生产流程收束到一个 AI 工作入口。
            </p>
          </div>

          {!selectedKnowledgeAiMenu ? (
            <div className={hasKnowledgeAiResult ? "knowledge-ai-entry-grid is-dismissed" : "knowledge-ai-entry-grid"}>
              {knowledgeAiEntryCards.map((card) => (
                <article key={card.title} className="knowledge-ai-entry-card">
                  <span>{card.lead}</span>
                  <strong>{card.title}</strong>
                  <em>{card.description}</em>
                  <button type="button" onClick={() => handleKnowledgeAiEntrySelect(card)}>
                    <Plus size={15} />
                    选择
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {hasKnowledgeAiResult ? (
            <div className="knowledge-ai-conversation" ref={knowledgeAiConversationRef}>
              {knowledgeAiTurns.map((turn, index) => (
                <React.Fragment key={`${turn.question}-${index}`}>
                  <div className="knowledge-ai-user-turn">
                    <p>{turn.question}</p>
                  </div>
                  <div className="knowledge-ai-assistant-turn">
                    <div className="knowledge-ai-assistant-body">
                      {turn.answer ? (() => {
                        const structuredResult = parseKnowledgeAiSearchResult(turn.answer);
                        return structuredResult
                          ? <KnowledgeAiSearchResultTrigger result={structuredResult} onOpen={() => {
                            setKnowledgeAiSearchModalResult(structuredResult);
                            setIsKnowledgeAiSearchModalOpen(true);
                          }} />
                          : <div className="knowledge-ai-answer-content"><ReactMarkdown>{turn.answer}</ReactMarkdown></div>;
                      })() : <p className="knowledge-ai-answer-empty">这一轮没有得到回答。</p>}
                    </div>
                  </div>
                </React.Fragment>
              ))}
              {knowledgeAiLastQuestion ? (
                <div className="knowledge-ai-user-turn">
                  <p>{knowledgeAiLastQuestion}</p>
                </div>
              ) : null}

              <div className="knowledge-ai-assistant-turn">
                <div className="knowledge-ai-assistant-body">
                  {(knowledgeAiToolCalls.length > 0 || isKnowledgeAiStreaming) ? (
                    <details className="knowledge-ai-thinking" open={isKnowledgeAiStreaming}>
                      <summary>
                        <span>
                          <Sparkles size={15} />
                          {isKnowledgeAiStreaming ? "正在思考" : "已完成思考"}
                        </span>
                        <ChevronDown size={16} />
                      </summary>
                      <div className="knowledge-ai-thinking-content">
                        <p>{isKnowledgeAiStreaming ? "正在检索并整理相关资料…" : "已完成检索"}</p>
                        {knowledgeAiToolCalls.length > 0 ? (
                          <div className="knowledge-ai-tools" aria-label="工具调用">
                            {knowledgeAiToolCalls.map((tool) => (
                              <div key={tool.id} className="knowledge-ai-tool-row">
                                <span className={tool.status === "success" ? "is-success" : ""}>
                                  {tool.status === "success" ? <Check size={13} /> : <Search size={13} />}
                                </span>
                                <p><strong>{tool.name}</strong>{tool.title}</p>
                                <em>{tool.statusLabel}</em>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  {knowledgeAiAnswer ? (
                    (() => {
                      const structuredResult = parseKnowledgeAiSearchResult(knowledgeAiAnswer);
                      return structuredResult
                        ? <KnowledgeAiSearchResultTrigger result={structuredResult} onOpen={() => {
                          setKnowledgeAiSearchModalResult(structuredResult);
                          setIsKnowledgeAiSearchModalOpen(true);
                        }} />
                        : isKnowledgeAiStreaming && isKnowledgeAiSearchResultCandidate(knowledgeAiAnswer)
                          ? <div className="knowledge-ai-search-pending">正在整理搜索结果…</div>
                        : <div className="knowledge-ai-answer-content"><ReactMarkdown>{knowledgeAiAnswer}</ReactMarkdown></div>;
                    })()
                  ) : isKnowledgeAiStreaming || isKnowledgeAiConversationLoading ? (
                    <div className="knowledge-ai-answer-loading" aria-label="正在生成回答">
                      <ThinkingOrb state="searching" size={20} theme="light" aria-label="正在检索并生成回答" />
                      <p>正在检索知识库，请稍等…</p>
                    </div>
                  ) : knowledgeAiError ? (
                    // A real failure: say what happened in plain language and offer
                    // the one action that helps, instead of dumping the raw response.
                    <div className="knowledge-ai-answer-failed" aria-label="回答失败">
                      <p>{knowledgeAiError}</p>
                      {knowledgeAiLastQuestion ? (
                        <button
                          type="button"
                          className="knowledge-ai-answer-retry"
                          onClick={() => handleKnowledgeAiSubmit(knowledgeAiLastQuestion)}
                        >
                          <RotateCcw size={14} />
                          重新提问
                        </button>
                      ) : null}
                    </div>
                  ) : wasKnowledgeAiStopped ? (
                    <p className="knowledge-ai-answer-empty">已停止生成。可以换个问法再问一次。</p>
                  ) : (
                    <p className="knowledge-ai-answer-empty">这次没有找到可用的资料，试着把问题说得更具体一些。</p>
                  )}

                  {knowledgeAiAnswer ? (
                    <>
                      {knowledgeAiReferences.length > 0 ? (
                        <details className="knowledge-ai-references">
                          <summary>
                            <FileText size={14} />
                            引用了 {knowledgeAiReferences.length} 份知识库资料
                            <ChevronDown size={14} />
                          </summary>
                          <div>
                            {knowledgeAiReferences.map((reference) => (
                              <a key={reference.id} href={reference.url || undefined} target={reference.url ? "_blank" : undefined} rel="noreferrer">
                                <FileText size={14} />
                                <span><strong>{reference.name}</strong><em>{reference.knowledgeName}{reference.pages.length ? ` · 第 ${reference.pages.join("、")} 页` : ""}</em></span>
                              </a>
                            ))}
                          </div>
                        </details>
                      ) : null}
                      {!parseKnowledgeAiSearchResult(knowledgeAiAnswer) ? (
                        <div className="knowledge-ai-answer-actions">
                          <button type="button" onClick={handleKnowledgeAiCopy} title="复制回答">
                            {isKnowledgeAiCopied ? <Check size={15} /> : <Copy size={15} />}
                          </button>
                          <button type="button" onClick={() => handleKnowledgeAiSubmit(knowledgeAiLastQuestion)} disabled={isKnowledgeAiStreaming} title="重新生成">
                            <RotateCcw size={15} />
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {selectedKnowledgeAiMenu ? (
            <div className={hasKnowledgeAiResult ? "knowledge-ai-prompt-stack is-dismissed" : "knowledge-ai-prompt-stack"} aria-label={`${activeKnowledgeAiConfig.label}提示词`}>
              {activeKnowledgeAiConfig.examples.map((prompt, index) => (
                <button
                  key={prompt}
                  type="button"
                  className="knowledge-ai-prompt-pill"
                  style={{ animationDelay: `${index * 42}ms` }}
                  onClick={() => handleKnowledgeAiPromptSelect(prompt)}
                >
                  <em>“{prompt}”</em>
                </button>
              ))}
            </div>
          ) : null}

          <div className="knowledge-ai-composer-shell">
            <form
              className="knowledge-ai-composer"
              onSubmit={(event) => {
                event.preventDefault();
                handleKnowledgeAiSubmit();
              }}
            >
              <input
                value={knowledgeAiPrompt}
                onChange={(event) => setKnowledgeAiPrompt(event.currentTarget.value)}
                placeholder="你可以参考上边提示词完成需求，或直接点击后修改提示词"
              />
              {/*
                Always type="button". It used to flip to "submit" when idle, but
                the flip happens in the same click that clears the streaming
                state, so the browser then ran the (now submit) button's default
                action and re-sent the question — stopping appeared to restart
                generation. Dispatching here keeps the click on one path.
              */}
              <button
                type="button"
                className={isKnowledgeAiStreaming ? "is-stopping" : ""}
                aria-label={isKnowledgeAiStreaming ? "停止生成" : "发送"}
                onClick={() => {
                  if (isKnowledgeAiStreaming) handleKnowledgeAiStop();
                  else handleKnowledgeAiSubmit();
                }}
              >
                {isKnowledgeAiStreaming ? <Square size={17} fill="currentColor" /> : <ArrowUp size={21} strokeWidth={2.4} />}
              </button>
            </form>
          </div>
          {isKnowledgeAiSearchModalOpen && knowledgeAiSearchModalResult ? (
            <KnowledgeAiSearchResultModal
              result={knowledgeAiSearchModalResult}
              onClose={() => setIsKnowledgeAiSearchModalOpen(false)}
            />
          ) : null}
        </section>
      );
    }

    if (displayTab === "library") {
      return (
        <section className="library-home">
          <div className="library-filter-shell">
            <div className="library-filter-row library-filter-row--primary">
              {activeLibraryFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={filter.id === activeLibraryFilter.id ? "active" : ""}
                  onClick={() => handleLibraryFilterSelect(activeLibrarySection.id, filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="library-filter-row library-filter-row--secondary">
              {activeLibraryFilter.subFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={filter === activeLibrarySubFilter ? "active" : ""}
                  onClick={() =>
                    setLibrarySubFilterBySection((current) => ({
                      ...current,
                      [activeLibrarySection.id]: filter,
                    }))
                  }
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <div
            className={
              isLibraryImageGallery
                ? "library-entry-grid library-entry-grid--masonry"
                : "library-entry-grid"
            }
          >
            {activeLibraryEntries.map((entry, index) => (
              <article
                key={entry.title}
                className={
                  entry.kind === "image"
                    ? "library-entry-card library-entry-card--image"
                    : "library-entry-card"
                }
                style={{ animationDelay: `${index * 36}ms` }}
                onClick={() => setSelectedLibraryEntry(entry)}
              >
                <button
                  type="button"
                  className="library-collect-button"
                  aria-label={`收集 ${entry.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAddLibraryEntry(entry);
                  }}
                >
                  <Plus size={16} />
                </button>
                {entry.image ? (
                  <img className="library-entry-cover" src={entry.image} alt={entry.title} />
                ) : null}
                {entry.kind === "image" ? (
                  null
                ) : (
                  <>
                    <span>{entry.tag}</span>
                    <strong>{entry.title}</strong>
                    <em>{entry.meta}</em>
                    <p>{entry.desc}</p>
                    <button type="button">打开文件</button>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      );
    }

    return (
      <>
        <section className="daily-greeting" aria-label="今日热点提示">
          <strong>HI! {accountName}</strong>
          <span>你可以关注这些相关热点</span>
        </section>

        {/* 热点日视图 */}
        <section
          className="timeline-view-shell"
          ref={(node) => {
            sectionRefs.current["topic-board"] = node;
          }}
        >
          <div className="timeline-view-head">
            <div>
              <span>CAMPAIGN TIMELINE</span>
              <h1>热点日视图</h1>
              <p className="timeline-view-note">
                813传播分三段节奏:预热(8/11-8/13白天)、爆发(8/13晚-8/14)、长尾(8/15-8/20)。
                每天有不同的热点方向和传播焦点,摄影师按日拍摄,用户按需裂变。
              </p>
            </div>
          </div>
          <div className="timeline-view-grid">
            {timeline.map((day) => {
              return (
                <article
                  key={day.date}
                  className={`timeline-day-card status-${day.status}`}
                  data-date={day.date}
                >
                  <header className="timeline-day-header">
                    <div className="timeline-day-label">
                      <span className="timeline-day-date">{day.label}</span>
                      {day.status === "event" && <em className="timeline-day-badge">活动日</em>}
                    </div>
                    <h3 className="timeline-day-focus">{day.focus}</h3>
                  </header>

                  <div className="timeline-day-directions">
                    {day.directions.map((direction, idx) => (
                      <span key={idx} className="timeline-direction-tag">
                        {direction}
                      </span>
                    ))}
                  </div>

                  {day.note && (
                    <p className="timeline-day-note">{day.note}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="hot-topic-shell"
          aria-label="热点方向"
          ref={(node) => {
            sectionRefs.current.hotspots = node;
          }}
        >
          <div className="publish-board-head">
            <div>
              <span>HOTSPOT</span>
              <h1>热点方向</h1>
              <p className="hot-topic-note">{todayTimeline.label} · 今日可参与的具体热点方向</p>
            </div>
          </div>
          <section className="hot-topic-menu">
            {todayHotTopics.map((topic) => (
              <button
                className={topic.id === activeTopicId ? "active" : ""}
                key={topic.id}
                type="button"
                onClick={() => handleTopicSelect(topic.id)}
              >
                <div>
                  <div className="topic-pill-row">
                    {topic.topics.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <strong>
                    {topic.label}
                  </strong>
                  <p>{topic.desc}</p>
                </div>
              </button>
            ))}
          </section>
          <section
            className="hot-topic-detail"
            ref={(node) => {
              topicDetailRef.current = node;
            }}
          >
            <div className="hot-topic-detail-body">
              <article>
                <span>热点解读</span>
                <p>{allTopicAnalysis[activeTopicId]?.explain || "暂无解读"}</p>
              </article>
              <article>
                <span>内容方向推荐</span>
                <p>{allTopicAnalysis[activeTopicId]?.direction || "暂无推荐"}</p>
              </article>
            </div>
          </section>
          <section
            className="topic-content topic-content--embedded"
            ref={(node) => {
              sectionRefs.current["seed-content"] = node;
            }}
        >
          <div className="publish-board-head seed-content-heading">
            <div>
              <span>SEED CONTENT</span>
              <h1>种子内容</h1>
              <p className="seed-content-note">我们已围绕热点方向制作种子内容与案例，供你参考。你可以借助这些种子内容，快速产出属于自己的内容。</p>
            </div>
            <div className="seed-scope-toggle" aria-label="种子内容范围">
              <button
                className={seedScope === "current" ? "active" : ""}
                type="button"
                onClick={() => setSeedScope("current")}
              >
                当前热点方向种子
              </button>
              <button
                className={seedScope === "all" ? "active" : ""}
                type="button"
                onClick={() => setSeedScope("all")}
              >
                全部种子内容
              </button>
            </div>
          </div>
          <div className="seed-card-list">
            {visibleSeedCards.map((seed, index) => (
              <article
                className="seed-content-card"
                key={`${seed.title}-${index}`}
                style={{ animationDelay: `${Math.min(index, 11) * 28}ms` }}
              >
                <div className="adaptive-media">
                  <span className="seed-media-type">{seed.mediaType}</span>
                  <img src={seed.image} alt="" />
                </div>
                <div className="seed-content-copy">
                  <span className="seed-source">
                    <BookOpen size={15} />
                    {seed.source}
                  </span>
                  <strong>{seed.title}</strong>
                  <p>{seed.desc}</p>
                  <div className="seed-topic-block">
                    <span>相关话题</span>
                    <div>
                      {seed.topics.map((topic) => (
                        <em key={topic}>
                          <Tags size={13} />
                          {topic}
                        </em>
                      ))}
                    </div>
                  </div>
                  <footer>
                    <span>{seed.count}</span>
                    <button type="button" onClick={() => setSelectedSeed(seed)}>查看种子</button>
                  </footer>
                </div>
              </article>
            ))}
          </div>
          </section>
        </section>
      </>
    );
  };

  return (
    <main
      className={`workbench-page ${isEntering ? "is-entering" : ""} ${
        activeTab === "library" && isLibraryDrawerOpen ? "has-library-drawer" : ""
      } ${activeTab === "tools" && isAiConversationDrawerOpen ? "has-ai-drawer" : ""}`}
      id="ai"
    >
      <aside className="workbench-rail" aria-label="工作台导航">
        <a className="rail-logo" href="#" aria-label="返回首页">
          <Home size={18} />
        </a>
        <nav>
          <button
            className={activeTab === "seed" ? "active" : ""}
            type="button"
            aria-label="种子专题页"
            onClick={() => setActiveTab("seed")}
          >
            <Video size={18} />
          </button>
          <button
            className={activeTab === "library" ? "active" : ""}
            type="button"
            aria-label="知识库"
            onClick={() => setActiveTab("library")}
          >
            <Database size={18} />
          </button>
          <button
            className={activeTab === "tools" ? "active" : ""}
            type="button"
            aria-label="AI模板入口"
            onClick={() => setActiveTab("tools")}
          >
            <Sparkles size={18} />
          </button>
          <button
            className={activeTab === "profile" ? "active" : ""}
            type="button"
            aria-label="个人中心"
            onClick={() => setActiveTab("profile")}
          >
            <UserRound size={18} />
          </button>
        </nav>
      </aside>

      <section
        className={isProfileTab ? "workspace-main workspace-main--profile" : "workspace-main"}
        ref={workspaceMainRef}
      >
        {!isProfileTab ? (
          <section className="workbench-tab-band">
            <nav className="workbench-major-nav" aria-label="主功能">
              {majorTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={tab.id === activeTab ? "active" : ""}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <nav className="workbench-minor-nav" aria-label="子功能" ref={minorNavRef}>
              {activeSubTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === activeSubTab ? "active" : ""}
                  onClick={() => handleMinorSelect(item.id)}
                >
                  <span
                    ref={(node) => {
                      minorLabelRefs.current[item.id] = node;
                    }}
                    className="workbench-minor-label"
                  >
                    {item.label}
                  </span>
                </button>
              ))}
              <span
                className="workbench-minor-indicator"
                style={{
                  transform: `translateX(${minorIndicator.left}px)`,
                  width: minorIndicator.width,
                }}
              />
            </nav>
          </section>
        ) : null}

        <div className="workspace-scroll" ref={contentScrollRef}>
          <div
            className={`workspace-stage workspace-stage--${displayTab} ${
              isContentVisible ? "is-visible" : ""
            }`}
          >
            {renderPanel()}
          </div>
          <div className="workspace-progress" aria-hidden="true">
            <span style={{ transform: `scaleY(${Math.max(scrollProgress, 0.08)})` }} />
          </div>
        </div>
      </section>

      {activeTab === "library" ? (
        <button
          type="button"
          className={`library-folder-fab ${isLibraryDrawerOpen ? "is-open" : ""}`}
          aria-label="打开文件收集空间"
          onClick={() => setIsLibraryDrawerOpen((open) => !open)}
        >
          <FolderOpen size={20} />
          {libraryCollectionCount > 0 ? <span>{libraryCollectionCount}</span> : null}
        </button>
      ) : null}

      {activeTab === "library" ? (
        <aside className={`library-folder-drawer ${isLibraryDrawerOpen ? "is-open" : ""}`}>
          <header className="library-folder-head">
            <div>
              <span>COLLECTION</span>
              <strong>文件收集空间</strong>
            </div>
            <button type="button" onClick={() => setIsLibraryDrawerOpen(false)}>
              <X size={18} />
            </button>
          </header>

          <div className="library-folder-layout">
            <nav className="library-folder-list" aria-label="文件夹列表">
              {libraryFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={folder.id === activeLibraryFolderId ? "active" : ""}
                  onClick={() => setActiveLibraryFolderId(folder.id)}
                >
                  <FolderOpen size={15} />
                  <span>{folder.name}</span>
                  <em>{folder.items.length}</em>
                </button>
              ))}
              <button
                type="button"
                className="library-folder-create"
                onClick={handleCreateLibraryFolder}
              >
                <Plus size={15} />
                新建文件夹
              </button>
            </nav>

            <section className="library-folder-content">
              <div className="library-folder-titlebar">
                {renamingLibraryFolderId === activeLibraryFolder.id ? (
                  <input
                    autoFocus
                    defaultValue={activeLibraryFolder.name}
                    onBlur={(event) => {
                      handleRenameLibraryFolder(activeLibraryFolder.id, event.currentTarget.value);
                      setRenamingLibraryFolderId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleRenameLibraryFolder(activeLibraryFolder.id, event.currentTarget.value);
                        setRenamingLibraryFolderId(null);
                      }
                    }}
                  />
                ) : (
                  <strong>{activeLibraryFolder.name}</strong>
                )}
                <div>
                  <button
                    type="button"
                    disabled={activeLibraryFolder.items.length === 0}
                    onClick={handleDownloadLibraryFolder}
                  >
                    <Download size={15} />
                    批量下载
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingLibraryFolderId(activeLibraryFolder.id)}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLibraryFolder(activeLibraryFolder.id)}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              </div>

              <div className="library-folder-items">
                {activeLibraryFolder.items.length > 0 ? (
                  activeLibraryFolder.items.map((item) => (
                    <article key={item.title}>
                      {item.image ? <img src={item.image} alt="" /> : <Database size={18} />}
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.kind === "image" ? "图片" : item.meta}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`移除 ${item.title}`}
                        onClick={() => handleRemoveLibraryEntry(activeLibraryFolder.id, item.title)}
                      >
                        <X size={15} />
                      </button>
                    </article>
                  ))
                ) : (
                  <p>点击资料或图片右上角的加号，先把需要的内容收进来。</p>
                )}
              </div>
            </section>
          </div>
        </aside>
      ) : null}

      {activeTab === "tools" ? (
        <>
          <button
            type="button"
            className={`library-folder-fab ai-conversation-fab ${isAiConversationDrawerOpen ? "is-open" : ""}`}
            aria-label="打开对话列表"
            onClick={() => setIsAiConversationDrawerOpen((open) => !open)}
          >
            <MessageCircle size={19} />
            {knowledgeAiConversations.length > 0 ? <span>{knowledgeAiConversations.length}</span> : null}
          </button>

          <aside className={`library-folder-drawer ai-conversation-drawer ${isAiConversationDrawerOpen ? "is-open" : ""}`}>
            <header className="library-folder-head">
              <div>
                <span>CONVERSATIONS</span>
                <strong>AI 对话列表</strong>
              </div>
              <button type="button" onClick={() => setIsAiConversationDrawerOpen(false)} aria-label="关闭对话列表">
                <X size={18} />
              </button>
            </header>

            <section className="ai-conversation-list" aria-label="AI 对话列表">
              <button
                type="button"
                className="ai-conversation-new"
                onClick={() => {
                  handleKnowledgeAiStop();
                  knowledgeAiConversationIdRef.current = "";
                  setKnowledgeAiConversationId("");
                  setKnowledgeAiTurns([]);
                  setKnowledgeAiAnswer("");
                  setKnowledgeAiLastQuestion("");
                  setKnowledgeAiReferences([]);
                  setKnowledgeAiToolCalls([]);
                  setHasKnowledgeAiResult(false);
                  setKnowledgeAiPrompt("");
                  setSelectedKnowledgeAiMenu(null);
                  setIsAiConversationDrawerOpen(false);
                }}
              >
                <Plus size={15} />
                新建对话
              </button>
              {knowledgeAiConversations.length > 0 ? knowledgeAiConversations.map((conversation) => (
                <button
                  key={conversation.Id}
                  type="button"
                  className={conversation.Id === knowledgeAiConversationId ? "active" : ""}
                  onClick={() => {
                    handleKnowledgeAiStop();
                    setIsAiConversationDrawerOpen(false);
                    void loadKnowledgeAiConversation(conversation);
                  }}
                >
                  <MessageCircle size={15} />
                  <span>{conversation.Title || "未命名对话"}</span>
                  <em>{new Date(conversation.LastActiveAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</em>
                </button>
              )) : (
                <p className="ai-conversation-empty">还没有 AI 对话，发送第一个问题后会自动出现在这里。</p>
              )}
            </section>
          </aside>
        </>
      ) : null}

      {selectedLibraryEntry ? (
        <div
          className="library-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedLibraryEntry(null)}
        >
          <section
            className={
              selectedLibraryEntry.kind === "image"
                ? "library-modal library-modal--image"
                : "library-modal"
            }
            role="dialog"
            aria-modal="true"
            aria-label="知识库资料分析"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="library-modal-topbar">
              <span>
                <Database size={17} />
                {selectedLibraryEntry.meta}
              </span>
              <div className="library-modal-actions">
                <button type="button" onClick={() => setSelectedLibraryEntry(null)}>
                  <X size={18} />
                  返回列表
                </button>
                <button type="button">
                  <Download size={17} />
                  下载原文件
                </button>
              </div>
            </header>

            {selectedLibraryEntry.kind === "image" ? (
              <div className="library-image-preview">
                <img
                  className="library-modal-cover"
                  src={selectedLibraryEntry.image || ""}
                  alt={selectedLibraryEntry.title}
                />
              </div>
            ) : null}
            {selectedLibraryEntry.kind !== "image" ? (
              <>
                <div className="library-modal-hero">
                  {selectedLibraryEntry.image ? (
                    <img
                      className="library-modal-cover"
                      src={selectedLibraryEntry.image}
                      alt={selectedLibraryEntry.title}
                    />
                  ) : null}
                  <span>{selectedLibraryEntry.tag}</span>
                  <h1>{selectedLibraryEntry.title}</h1>
                  <p>{selectedLibraryEntry.desc}</p>
                </div>

                <nav className="library-analysis-tabs" aria-label="资料分析菜单">
                  {selectedLibraryEntry.tabs?.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={tab.id === selectedLibraryTab?.id ? "active" : ""}
                      onClick={() => setActiveLibraryAnalysisTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>

                {selectedLibraryTab ? (
                  <section className="library-analysis-panel">
                    <strong>{selectedLibraryTab.title}</strong>
                    <div>
                      {selectedLibraryTab.points.map((point) => (
                        <p key={point}>{point}</p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {selectedSeed ? (
        <div className="seed-modal-backdrop" role="presentation" onClick={() => setSelectedSeed(null)}>
          <div className="seed-modal-stack" onClick={(event) => event.stopPropagation()}>
            <section
              className="seed-modal"
              role="dialog"
              aria-modal="true"
              aria-label="种子内容分析"
            >
              <header className="seed-modal-topbar">
                <span className="seed-modal-source">
                  <BookOpen size={18} />
                  {selectedSeed.source}
                </span>
                <button type="button" onClick={() => setSelectedSeed(null)}>
                  <X size={18} />
                  返回列表
                </button>
              </header>

              <div className="seed-modal-hero">
                <h1>{selectedSeed.title}</h1>
                <div className="seed-meta-row">
                  <span className="seed-direction-tag">
                    {directions.find(d => d.id === selectedSeed.topicId)?.label || "种子内容"}
                  </span>
                  <span className="seed-status-tag">
                    {selectedSeed.count}
                  </span>
                </div>
              </div>

              {/* 内容拆解：来自 seeds.ts，不依赖 manifest */}
              <section className="seed-info-section">
                <h2>内容拆解</h2>
                <p>{selectedSeed.desc}</p>
              </section>

              {seedManifestState === "ready" && seedManifest ? (
                <>
                  {/* 逻辑线 */}
                  {seedManifest.logicalLine ? (
                    <section className="seed-info-section">
                      <h2>逻辑线</h2>
                      <p>{seedManifest.logicalLine}</p>
                    </section>
                  ) : null}

                  {/* 分段结构 */}
                  <section className="seed-segments-section">
                    <h2>分段结构</h2>
                    <div className="seed-segments-grid">
                      {seedManifest.segments.map((seg: any) => {
                        const realCount = (seg.clips || []).filter(
                          (clip: any) => clip.state === "real",
                        ).length;
                        return (
                          <article key={seg.id} className="seed-segment-card">
                            <span className="segment-order">段 {seg.order}</span>
                            <strong>{seg.label}</strong>
                            <p>{seg.purpose}</p>
                            <span className="segment-clip-count">
                              {realCount > 0 ? `${realCount} 个可用素材` : "素材待补"}
                            </span>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                </>
              ) : seedManifestState === "loading" ? (
                <section className="seed-info-section">
                  <p className="seed-info-muted">正在读取分段结构…</p>
                </section>
              ) : (
                <section className="seed-info-section">
                  <h2>分段结构</h2>
                  <p className="seed-info-muted">
                    这条种子的拍摄结构还没定稿，素材也还没入库，所以暂时不能做 AI 裂变。
                    可以先看「717 粉丝盛典现场打卡探场」，那条已经可用。
                  </p>
                </section>
              )}

              {/* AI 裂变悬浮按钮：没有素材的种子不给点，避免点了才报错 */}
              <button
                className="seed-ai-fab-trigger"
                type="button"
                disabled={seedManifestState !== "ready"}
                onClick={() => setIsSeedAiOpen(!isSeedAiOpen)}
                aria-label={
                  seedManifestState !== "ready"
                    ? "素材准备中，暂不能裂变"
                    : isSeedAiOpen
                      ? "关闭 AI 裂变"
                      : "打开 AI 裂变"
                }
              >
                <Sparkles size={20} />
                <span>{seedManifestState === "ready" ? "AI 裂变" : "素材准备中"}</span>
              </button>

              {/* AI 裂变悬浮面板 */}
              {isSeedAiOpen ? (
                <div className="seed-ai-overlay" onClick={() => setIsSeedAiOpen(false)}>
                  <div
                    className={`seed-ai-panel ${activeSeedAiAction && !seedAiResult ? 'is-input-mode' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activeSeedAiAction && !seedAiResult ? (
                      <>
                        <button
                          type="button"
                          className="seed-ai-back-btn"
                          onClick={handleSeedAiBack}
                          aria-label="返回 AI 功能列表"
                        >
                          <ArrowLeft size={18} />
                        </button>
                        <input
                          type="text"
                          className="seed-ai-input"
                          aria-label={seedAiActionMeta[activeSeedAiAction].label}
                          value={seedAiPrompt}
                          placeholder={seedAiActionMeta[activeSeedAiAction].placeholder}
                          onChange={(event) => setSeedAiPrompt(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !isSeedAiGenerating) {
                              event.preventDefault();
                              handleSeedAiSubmit();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="seed-ai-submit-btn"
                          disabled={isSeedAiGenerating}
                          onClick={handleSeedAiSubmit}
                          aria-label="提交"
                        >
                          {isSeedAiGenerating ? (
                            <ThinkingOrb state="composing" size={20} theme="light" aria-label="正在生成" />
                          ) : (
                            <Send size={18} />
                          )}
                        </button>
                      </>
                    ) : !activeSeedAiAction && !seedAiResult ? (
                      <>
                        <header className="seed-ai-panel-header">
                          <div>
                            <h2>AI 裂变</h2>
                            <p>基于种子内容生成素材包或成片视频</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsSeedAiOpen(false)}
                            aria-label="关闭"
                          >
                            <X size={18} />
                          </button>
                        </header>
                        <div className="seed-ai-actions">
                          <button type="button" onClick={() => setActiveSeedAiAction("package")}>
                            <Package size={18} />
                            <div>
                              <strong>素材包生成</strong>
                              <small>适合具备视频剪辑能力、需要素材包支持的用户</small>
                            </div>
                          </button>
                          <button type="button" onClick={() => setActiveSeedAiAction("video")}>
                            <Clapperboard size={18} />
                            <div>
                              <strong>视频生成</strong>
                              <small>根据需求自动生成种子裂变视频</small>
                            </div>
                          </button>
                        </div>
                      </>
                    ) : seedAiResult ? (
                      <div className="seed-ai-result">
                        <header>
                          <div>
                            <h3>{seedAiResult.title}</h3>
                            <p>{seedAiResult.intro}</p>
                          </div>
                          {seedAiResult.downloadUrl && !seedAiResult.isLoading && !seedAiResult.isError ? (
                            <button type="button" onClick={handleDownloadMaterialPackage}>
                              <Download size={16} />
                              下载素材包
                            </button>
                          ) : null}
                        </header>

                        {seedAiResult.isLoading ? (
                          <div className="seed-ai-loading">
                            <ThinkingOrb state="composing" size={20} theme="light" aria-label="正在处理" />
                            <span>处理中...</span>
                          </div>
                        ) : null}

                        {seedAiResult.sections?.map((section) => (
                          <article key={section.label}>
                            <strong>{section.label}</strong>
                            <p>{section.content}</p>
                          </article>
                        ))}

                        {seedAiResult.needsConfirmation ? (
                          <button
                            type="button"
                            className="seed-ai-continue"
                            onClick={handleContinueGeneration}
                            disabled={isSeedAiGenerating}
                          >
                            继续生成
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>

          </div>
        </div>
      ) : null}
    </main>
  );
}

const authUsersStorageKey = "hongqi-auth-users";
const authAccountStorageKey = "hongqi-auth-account";

const readAuthUsers = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(authUsersStorageKey) || "{}");
    return typeof parsed === "object" && parsed !== null
      ? ({ Admin: "Admin", ...(parsed as Record<string, string>) } as Record<string, string>)
      : { Admin: "Admin" };
  } catch {
    return { Admin: "Admin" };
  }
};

const writeAuthUsers = (users: Record<string, string>) => {
  window.localStorage.setItem(authUsersStorageKey, JSON.stringify({ Admin: "Admin", ...users }));
};

function App() {
  const [hash, setHash] = React.useState(() => window.location.hash);
  const [isLaunching, setIsLaunching] = React.useState(false);
  const [isWorkbenchEntering, setIsWorkbenchEntering] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [accountName, setAccountName] = React.useState(
    () => window.localStorage.getItem(authAccountStorageKey) || "",
  );
  const [authMode, setAuthMode] = React.useState<"intro" | "login" | "register" | "invite">(
    "intro",
  );
  const [authMessage, setAuthMessage] = React.useState("");
  const isAuthenticated = Boolean(accountName);

  React.useEffect(() => {
    const handleHashChange = () => {
      const nextHash = window.location.hash;
      setHash(nextHash);
      if (nextHash && isAuthenticated) {
        setIsTransitioning(true);
        setIsWorkbenchEntering(true);
        window.setTimeout(() => {
          setIsLaunching(false);
          setIsWorkbenchEntering(false);
          setIsTransitioning(false);
        }, 780);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [isAuthenticated]);

  const handleStart = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setAuthMode("login");
      setAuthMessage("");
      return;
    }
    if (isLaunching) return;
    setIsLaunching(true);
    setIsTransitioning(true);
    window.setTimeout(() => {
      window.location.hash = "ai";
    }, 820);
  };

  const enterWorkbench = (nextAccountName: string) => {
    setAuthMessage("");
    setAuthMode("intro");
    setIsLaunching(true);
    setIsTransitioning(true);
    setIsWorkbenchEntering(true);
    window.setTimeout(() => {
      setAccountName(nextAccountName);
      window.localStorage.setItem(authAccountStorageKey, nextAccountName);
      setHash("#ai");
      window.location.hash = "ai";
      window.setTimeout(() => {
        setIsLaunching(false);
        setIsWorkbenchEntering(false);
        setIsTransitioning(false);
      }, 780);
    }, 520);
  };

  const handleLogin = (nextAccountName: string, password: string) => {
    const cleanAccount = nextAccountName.trim();
    const users = readAuthUsers();
    if (users[cleanAccount] && users[cleanAccount] === password) {
      enterWorkbench(cleanAccount);
      return;
    }
    setAuthMessage("账号或密码不正确，请确认后再登录。");
  };

  const handleRegister = (data: {
    accountName: string;
    password: string;
    inviteCode: string;
  }) => {
    const cleanAccount = data.accountName.trim();
    if (!cleanAccount || !data.password || !data.inviteCode.trim()) {
      setAuthMessage("请填写账号名、密码和邀请码。");
      return;
    }
    if (data.inviteCode.trim().toUpperCase() !== "ADMIN") {
      setAuthMessage("邀请码暂未通过，请确认邀请码或先提交申请。");
      return;
    }
    const users = readAuthUsers();
    writeAuthUsers({ ...users, [cleanAccount]: data.password });
    enterWorkbench(cleanAccount);
  };

  const handleInvitationApply = (data: {
    realName: string;
    identity: string;
    email: string;
    usage: string;
  }) => {
    if (!data.realName.trim() || !data.identity.trim() || !data.email.trim() || !data.usage.trim()) {
      setAuthMessage("请完整填写真实姓名、身份、邮箱和使用需求说明。");
      return;
    }
    setAuthMessage("申请已提交，请关注邮箱，信息确认后会发送邀请码。");
  };

  const handleAccountUpdate = (nextAccountName: string) => {
    const cleanAccount = nextAccountName.trim();
    if (!cleanAccount || cleanAccount === accountName) return;
    const users = readAuthUsers();
    const currentPassword = users[accountName] || users.Admin;
    const { [accountName]: _oldPassword, ...restUsers } = users;
    writeAuthUsers({ ...restUsers, [cleanAccount]: currentPassword });
    setAccountName(cleanAccount);
    window.localStorage.setItem(authAccountStorageKey, cleanAccount);
  };

  const handlePasswordUpdate = (currentPassword: string, nextPassword: string) => {
    const users = readAuthUsers();
    const storedPassword = users[accountName] || "";
    if (!storedPassword || storedPassword !== currentPassword) {
      return false;
    }
    writeAuthUsers({ ...users, [accountName]: nextPassword });
    return true;
  };

  const handleLogout = () => {
    window.localStorage.removeItem(authAccountStorageKey);
    setAccountName("");
    setHash("");
    setAuthMode("intro");
    setAuthMessage("");
    setIsLaunching(false);
    setIsWorkbenchEntering(false);
    setIsTransitioning(false);
    if (window.location.hash) {
      window.location.hash = "";
    }
  };

  return (
    <div className={`transition-stage ${isTransitioning ? "is-transitioning" : ""}`}>
      {!hash || !isAuthenticated ? (
        <LandingPage
          isLaunching={isLaunching}
          onStart={handleStart}
          authMode={authMode}
          authMessage={authMessage}
          onAuthModeChange={(mode) => {
            setAuthMode(mode);
            setAuthMessage("");
          }}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onInvitationApply={handleInvitationApply}
        />
      ) : (
        <WorkbenchPage
          isEntering={isWorkbenchEntering}
          accountName={accountName}
          onAccountUpdate={handleAccountUpdate}
          onPasswordUpdate={handlePasswordUpdate}
          onLogout={handleLogout}
        />
      )}
      <section className="pc-only-overlay" aria-label="PC 端访问提示">
        <div>
          <span>PC ONLY</span>
          <strong>请使用 PC 端访问</strong>
          <p>当前工作台为桌面端设计，手机比例下暂不开放使用。</p>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <App />,
);

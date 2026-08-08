# 813 种子裂变 · 落地施工计划

状态：Step 1 数据层完成，准备接入前端。最后更新 2026-08-09。
读这份文件前先读项目 `CLAUDE.md`（架构、凭证状态、口径规则、踩过的坑）。

## 进度记录

### 2026-08-09
- ✅ **Step 1 数据层**：两层结构从零搭建完成
  - 第一层（首页内容）：`directions.ts` 4 个方向 + `timeline.ts` 5 天排期
  - 第二层（种子内容）：`seeds.ts` 3 个种子索引 + `seed-006.manifest.json` 素材清单
  - 关键设计：manifest 是唯一事实来源，存储与契约解耦
  - seed-006：6 段节奏、8 条真实素材（65.37s）、5 个已知缺口、所有描述标记 `reviewed: false` 待校对
  - 交付：7 文件 851 行，已提交 `4cbe0c6`，`pnpm build` + `pnpm regression` 通过
  - 文档：`docs/seed-data-contract.md` 记录字段用途和运行时流程
- 🔄 **下一步**：接入 `main.tsx`，替换硬编码的 `hotTopics` / `expandedSeedCards` / `publishTimeline`
- ⏸️ **Step 2-7 暂缓**：视频裂变单独一坨，等数据层接完前端再继续

## 一、功能是什么（已对齐，不要再讨论）

四层，全部要上，因为 813 之前有预热动作就要用：

1. **时间线看板** —— 每天的节奏点、今天可关注哪些方向、后面还有什么
2. **热点方向** —— 方向解析 + 创作建议。**这层要能独立成为完整交付**：很多用户压根不需要素材包，只想看今天有什么可发、可蹭。裂变入口不要在视觉上压过这层
3. **种子内容** —— 一个方向下挂 1~N 个种子，种子 = 一个具体可执行的角度
4. **效果回传 + 种子推荐** —— 用户已明确后置，本轮不做

裂变只出 **两种**产物：**素材包（含文案）** 和 **视频**。
"只给文案"已被用户砍掉（"没有人去用的"）。`seedAiActionMeta` 里的 `script` 动作要删。

## 二、运行时流程（两条链 + 一个接口）

**链 A 内容供给（人工为主）**
① 官方定方向 → ② 排期（哪天放哪些方向/种子）→ ③ 方向下拆种子 →
④ 按叙事节奏建空文件夹（文件夹名就是分镜清单）→ ⑤ 摄影师填素材 →
⑥ **写素材描述库 json**

**链 B 用户消费（运行时）**
① 看时间线 → ② 读方向解析（**很多人到这里就走，目的已达成**）→ ③ 看该方向下的种子 →
④ 提交自由文本诉求 → ⑤ **可行性墙**判断 → ⑥ 选产物（素材包 / 视频）→
⑦ 等待态·失败态·重试 → ⑧（后置）效果回传

**接口 = 链 A ⑥ 的 `素材描述库.json`。** 链 B 只读这份 json 做判断、选片、生成，
两条链之间没有其他耦合。没有它，墙只能靠猜，会推给用户一个素材根本不支持的脚本。

格式已存在，**沿用不要重新设计**：`素材库/种子内容/seed-005-非遗天青色国雅爆款反拆/素材描述库.template.json`

```
seedId / version / targetDurationSeconds
assets[]:
  filePath              素材路径
  durationSeconds       选片凑时长用
  visualSubject         主体，选片用
  visualDescription     画面里实际拍到了什么
  supportsScriptLines[] 能支撑哪些口播句  → 脚本生成的可用句池
  doesNotSupport[]      明确不能证明什么  → 墙判"不支持"的依据
  priority              P0/P1/P2         → 选片优先级
```

## 三、开工前必须定的两件事

1. **seed-006 的素材描述库谁写？** 我按文件夹名 + 参考截图生成初稿、用户校对；还是用户写、我只做格式校验。
   这个决定直接影响 8/13 摄影师填完素材后到上线的时间。
2. **素材包走哪条路？** 复用 `/ai/material-package`（现有，返回真 zipUrl，但入参是 `scriptSplitResult`，
   是自由画布流水线的中间态）还是新写 `/seed/package`。
   我倾向新写：输入是文件夹清单不是脚本切分结果，硬接会把两个流程绑死。

## 四、施工步骤

### Step 1 · 数据层（全部后续的前提）

现状：三层数据都在 `src/main.tsx` 里硬编码，且**方向→种子的一对多关系已经用 `topicId` 建好了**。
所以不是搭骨架，是抽数据 + 补关联。

- `publishTimeline`（1134 行）3 天，seed 只有 `title`+`status` 字符串，**不指向真实种子**
- `hotTopics`（4 个方向，`as const` 派生 `TopicId`）+ `topicAnalysis`（每方向 explain/direction 两段长文案）
  —— 这层信息密度已够，最接近可用
- `expandedSeedCards`（985 行）8 张卡全是 `...seedCards[n]` 展开改标题，
  `count: "8 条线索"` 是装饰，**不指向 `素材库/种子内容/` 任何真实文件夹**

做：新建 `src/data/seed/`

```
directions.ts  id / label / topics[] / explain / direction     （合并 hotTopics + topicAnalysis）
seeds.ts       id / directionId / title / cover / manifest / outputs / status
timeline.ts    day / status / seedIds[]                        （引用 seeds 的 id，不再写字符串标题）
```

关键新增 `manifest`：指向该种子的 `素材描述库.json`。墙和选片唯一的输入。

只把 **seed-006 做成真链路**，其余卡 `status: "preparing"` 不给裂变入口。

这一层就是后面那个「Skill」的目标产物 —— 种子方向定稿后，Skill 只需重写这三个文件。

验证：`pnpm build` + `pnpm regression`。提交。

### Step 2 · seed-006 素材描述库（最硬的缺口）

`素材库/种子内容/seed-006-717粉丝盛典现场打卡探场/素材描述库.json`

实际盘点（**不是之前说的 20 个真实片段**）：13 个场景文件夹，
**8 个有真实 717 片段**：拱门、红毯人流、欢迎回家、互动打卡、精彩演出区域、露营休闲区、车身外观、红旗粉丝墙
**5 个只有占位素材**：活动地图与路标、现场活动物料、赛道围栏与打卡位、人群空镜、红色品牌视觉

真片标 real、占位标 placeholder，墙要能区分（占位素材不能进真实产物）。
按 Step 3 的输入需求填 `doesNotSupport`，这是最需要人判断的字段。提交。

### Step 3 · 可行性墙 `/seed/feasibility`

唯一真正新增的核心能力。输入 `{ seedId, userRequest }`，
读该 seed 的 manifest 作上下文，MiMo `response_format: json_object` 强制返回：

```
verdict: "supported" | "degradable" | "unsupported"
reason:  为什么
fallback: 不支持时的替代方案（换哪个种子能做这个角度）
brief:   { tone, identity, emphasis[], avoid[] }   → Step 4/5 的输入
```

三类对应用户的原话：
- 口吻/身份/侧重 → supported
- 具体信息能靠字幕口播带 → degradable，告诉用户"画面用通用镜头，信息放字幕"
- 要新场景新镜头 → unsupported，说清为什么 + 给替代方案

**必须说人话。** 用户群体（4S 店员工）不了解 AI，只说"无法生成"等于坏了。

可复用：MiMo `/chat/completions` 已验证可用（HTTP 200，`mimo-v2.5-pro`，key 已在 `.env`）。
**不复用** `/ai/text-production` —— 它是自由画布的输入契约，硬套要改它的入参。

测试打 stub，参照 `tests/stub-adp-server.mjs` 的做法。提交。

### Step 4 · 素材包产出

输入 `{ seedId, brief }` → 按 `priority` + `durationSeconds` 选片 → 生成口播文案 md → 连素材打 zip。
现有 `handleDownloadMaterialPackage` 只是拼纯文本 blob 下载 `813-seed-material-package.txt`，不是真包，要替换。
路由归属见第三节第 2 件事。提交。

### Step 5 · 视频产出

`/render` + Remotion `SeedVideo` 已通，且**不需要第三方 key**（只要 `RENDER_PORT` / `PUBLIC_RENDER_BASE_URL`）。

**必修 bug**：`/render` 把参数写进**共用的** `src/remotion/render-data.json` 再同步渲染，
两个用户同时点会互相覆盖。改成每次渲染写独立临时文件、渲完删。提交。

### Step 6 · 前端接线 + 状态（体感分水岭）

- 删 `seedAiActionMeta` 的 `script` 动作
- 换掉 `handleSeedAiSubmit`（2285-2405 行）的 `setTimeout(2000)` + 写死文案三分支
- 墙的三种 verdict 各有对应展示；degradable 要让用户能确认后继续
- 补等待态 / 失败态 / 重试。**照搬知识问答已做过的四件套**：
  等待有明确提示、报错说人话、给重试入口、空结果用中性灰不用红色。不用重新设计。

全仓库共 9 处 `setTimeout` 模拟延迟，本轮只动裂变这条链上的。提交。

### Step 7 · 收口

`pnpm build` + `pnpm test` + `pnpm regression`，删临时脚本，检查工作区干净。

## 五、顺序与并行

Step 1 是全部依赖的前提，做完立刻提交基线。
Step 2 和 Step 1 可并行（不同文件）。
Step 3 依赖 Step 2。Step 4/5 依赖 Step 3 的 brief 契约（契约先定，实现可并行）。
Step 6 依赖 3/4/5。

## 六、clear 后会忘掉的关键事实

- `pnpm` 11.20.0；**`npx` 不在 PATH**，用 `pnpm exec` 或 `node_modules/.bin/`
- 没有 `tsconfig.json`，没有类型检查
- dev server 端口 5175；`ai-server` 8790 上跑着 **Codex 起的旧进程（8/7 22:08 启动，没加载 key），不要杀**，
  需要时另起一个实例（上次用 8795）
- `.env`：`MIMO_*` 已填并验证；`MINIMAX_API_KEY`（TTS）、`GRSAI_API_KEY` 仍为空；`ADP_*` 为空
- `COS_BUCKET`/`COS_REGION` = 北京知识桶（storage-server + MetaInsight 用），
  `ASSET_BUCKET`/`ASSET_REGION` = 广州资产桶（cos:sync 用）。**动之前先想清楚是哪个用途**
- `pnpm test` 的 6 个测试打 stub，只验前端逻辑，**不验真实 ADP 链路**。别说成"RAG 已上线"
- `seed-delivery-demo.mp4` 全仓库无源文件，是裂变演示态占位，接真后应该是跑出来的
- 素材库那 45 张位图**不要 Read 进上下文**，`ls`/`find` 看路径就行
- 方法论（用户明确要求）：**先按需求设计落地逻辑，再回头看仓库里有没有现成能用的路径，
  通了才借来用并做测试。不要拿着已有代码猜怎么整合** —— 仓库混着自由画布等别的项目的死代码
- 缺仓库里读不出来的外部信息（云上怎么配的、某能力是自研还是买的、某目录将来放什么）→ **停下来问，不要推理填空**

## 七、本轮不做（记着，别顺手做了）

- 效果回传 + 种子推荐（用户已定后置）
- ADP / 知识库那条线（用户已定往后放）
- 种子内容定稿后的部署 Skill（等方向定下来）
- `/ai/material-upload` 的方向问题（它要浏览器上传，和摄影师→素材库→COS 相反）—— 先确认是否在范围内
- 717→813 口径统一、`public/` 137M Remotion 产物瘦身、断点整合

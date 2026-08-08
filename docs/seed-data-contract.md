# 813 种子裂变 · 数据契约文档

## 概述

两层数据结构，从消费端倒推设计，每个字段都能对应上运行时的具体需求。

**第一层 · 首页内容层**  
Direction（热点方向）+ TimelineDay（时间线排期）  
→ 能独立交付，很多用户看完就走，不进裂变。

**第二层 · 种子内容层**  
Seed（种子索引）+ SeedManifest（素材清单）  
→ 裂变的输入。manifest 是素材的唯一事实来源，文件夹路径只是它里面的一个字段。

## 设计原则

1. **字段必须可追溯到运行时需求**  
   运行时只做三件事：判断用户诉求能不能做（可行性墙）、按需要挑素材（选片）、生成口播文案。  
   每个字段在 `types.ts` 里都标了「谁读它」，加字段前先想清楚这一栏怎么填。

2. **存储与契约解耦**  
   manifest 是事实来源，素材路径是它里面的字段（`Seed.packageRoot` + `Clip.file`）。  
   换桶、换目录、整批替换都不影响这份契约。8/13 之后素材怎么摆、放哪个桶，
   都不需要改代码，改 `Seed.packageRoot` 一处即可。

3. **冗余是故意的**  
   `Seed.covers` 是 manifest 里所有 `Clip.proves` 的汇总，明显冗余。  
   但可行性墙判 unsupported 时要回答「换哪条种子能做这个角度」，  
   有这一栏就不用把所有 manifest 全加载一遍。改 manifest 时要同步改 `covers`，测试会校验一致性。

## 运行时流程与字段使用

### A. 可行性墙（`/seed/feasibility`）

输入：`{ seedId, userRequest }`  
输出：`{ verdict: "supported" | "degradable" | "unsupported", reason, fallback, brief }`

**读哪些字段**：

- `Direction.guardrails` —— 这个方向明确不做的事，用户要求撞上直接 unsupported
- `SeedManifest.productionRules` —— 硬约束，不可协商
- `Clip.proves` —— 用户要强调的东西，素材能不能证明
- `Clip.doesNotProve` —— **最关键**，缺了它墙会推一个素材根本不支持的脚本
- `SeedManifest.gaps` —— 已知缺口，用户诉求正好落在缺口上时要能说清「这个角度现在没素材」
- `Clip.state` —— 占位素材不能进真实产物，墙必须能区分
- `Clip.reviewed` —— 未校对的素材给更保守的判断
- `Seed.covers`（fallback 用）—— 判 unsupported 时要回答换哪条种子

**三档判断**：

- **supported** —— 改口吻、身份、侧重，素材都能支撑
- **degradable** —— 具体信息能靠字幕口播带，画面用通用镜头，告诉用户「画面用通用镜头，信息放字幕」
- **unsupported** —— 要新场景新镜头，说清为什么 + 给替代方案（查 `Seed.covers` 找能做这个角度的其他种子）

### B. 选片（素材包 `/seed/package` 和视频生成都要做）

输入：`{ seedId, brief }`（brief 是墙返回的，含 tone / identity / emphasis / avoid）  
输出：选中的 clip 列表 + 每段用哪几条

**读哪些字段**：

- `Segment.required` —— 必选段，不能跳过
- `Segment.targetDurationSeconds` —— 凑目标时长
- `SeedManifest.format.targetDurationSeconds` + `durationToleranceSeconds` —— 成片总时长约束
- `Clip.priority` —— P0 > P1 > P2
- `Clip.durationSeconds` —— 凑时长用
- `Clip.state` —— 占位素材不能进真实产物
- `Clip.subject` —— 按 brief.emphasis 匹配

**选片逻辑**（伪代码）：

```
for each segment in manifest.segments:
  if segment.required or brief 提到这段的 purpose:
    candidates = segment.clips.filter(c => c.state == "real")
    sort by priority then duration fit
    pick until targetDurationSeconds ± tolerance
```

### C. 文案生成

输入：`{ seedId, brief, selectedClips }`  
输出：口播文案 markdown，分段对应 `Segment.label`

**读哪些字段**：

- `Direction.whyNow` + `howTo` —— 定切入角度和结构
- `Direction.guardrails` —— 负向约束，不要写这些
- `Segment.purpose` —— 每段在叙事里干什么，决定每段写什么
- `Clip.description` —— 写画面提示
- `Clip.proves` —— **口播只能说这里面有的东西**，说了素材证明不了的就是胡编
- `SeedManifest.productionRules` —— 负向约束
- `brief.tone / identity / emphasis / avoid` —— 用户诉求

## 字段校对优先级

所有字段里，**`Clip.doesNotProve` 最需要人判断**，它是墙判「不支持」的唯一依据。  
其次是 `Clip.proves`，它决定文案能写什么。  
`Clip.description` 是辅助，写错了顶多画面提示不准，不会导致整条链路判断错误。

当前 seed-006 的 8 条真实素材都标了 `"reviewed": false`，  
意思是描述是从文件夹名和 README 推出来的，没有人真的看过视频确认。  
**校对时优先看 `doesNotProve`，再看 `proves`，最后看 `description`。**

## 已知缺口（`SeedManifest.gaps`）

README 里要求有、但素材实际不存在的东西。seed-006 有 5 个缺口：

1. 红旗国际汽车公园定位 / 活动地图 —— 不能做「如何到达」类内容
2. 现场活动物料特写 —— 不能展示装置和互动道具细节
3. 草坪帐篷 / 轻松玩乐氛围 —— 缺少亲子、朋友互动的具体画面
4. 超哇赛车展车 / 赛道围栏 —— 只有车身外观，不能强调「赛车」
5. 人群空镜 / 红色品牌视觉 —— 缺少通用转场和氛围镜头

可行性墙读这个字段，用户诉求正好落在缺口上时要能说清「这个角度现在没素材」  
并给替代方案，而不是含糊地说「无法生成」。

## 文件清单

```
src/data/seed/
  types.ts              类型定义 + 字段文档
  directions.ts         第一层：4 个热点方向
  seeds.ts              第二层：3 个种子索引（seed-005/006/007）
  timeline.ts           时间线：08/09 → 08/13
  index.ts              导出 + 辅助函数
  manifests/
    seed-006.manifest.json    唯一 ready 的种子，8 条真实素材
```

## 下一步

这份数据结构还没接入 `main.tsx`，前端仍然读老的 `hotTopics` / `expandedSeedCards` / `publishTimeline`。  
下一步是把前端切换到新数据层，删掉 `main.tsx` 里的硬编码。

**可见变化**：卡片数会从 8 张降到 3 张（删掉 5 张假卡）。这是正确的 —— 移除虚假数据，  
但需要告诉用户这个变化。视觉上空了就在 UI 里加「更多种子准备中」的占位。

## 测试

TODO：写一个测试校验 `Seed.covers` 和对应 manifest 的 `Clip.proves` 一致。  
冗余字段必须有测试保证同步，否则改 manifest 忘了改 `covers`，墙的 fallback 就会推错。

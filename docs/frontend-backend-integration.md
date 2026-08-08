# 813 裂变 - 前后端对接方案

## 核心认知（2026-08-09 明确）

### 关于内容方向（热点方向）

- **不需要 B 端界面动态生成**
- 流程：策划定方向 → Claude 生成静态文件 → 覆盖到服务器
- 前端只负责**展示**已经定好的方向
- 这些内容今天或明天就会定下来，然后不动

### 关于种子内容生成

- **不需要 B 端界面**
- 流程：策划定种子方向 → Claude 用 `/seed/generate` 生成文件 → 覆盖到服务器
- 生成的是静态文件：README.md + manifest.json + 文件夹结构
- 前端只负责**展示和使用**这些已生成的种子

### 关于 B 端（摄影师上传素材）

- **B 端 = 摄影师素材收集页面**，不是内容策划界面
- 功能：摄影师按拍摄指南拍摄后，自主上传素材到对应文件夹
- 状态：**往后放**，等热点方向和种子内容确定后再做
- 原因：现在做也是空的，等内容定了再做更高效

---

## 后端接口现状（已完成）

| 接口 | 端口 | 功能 | 使用场景 | 状态 |
|------|------|------|----------|------|
| `/seed/generate` | 8794 | 生成种子内容 | Claude 命令行工具 | ✅ 已完成 |
| `/seed/feasibility` | 8796 | 可行性判断 | C 端用户裂变 | ✅ 已完成 |
| `/seed/package` | 8793 | 素材包产出 | C 端用户裂变 | ✅ 已完成 |

### `/seed/generate` - 生成种子内容

**输入**：
```json
{
  "directionId": "tech-experience"
}
```

**输出**：
```json
{
  "seedId": "seed-199",
  "title": "813盛典现场，红旗智能科技的'小心机'都藏在这了",
  "angle": "用第一视角体验，带用户感受那些'用起来才懂'的智能细节",
  "segments": [
    {
      "id": "seg-1",
      "label": "开场钩子",
      "purpose": "...",
      "targetDurationSeconds": 5,
      "shootingGuide": {
        "subjects": ["..."],
        "requirements": ["..."],
        "suggestedClipCount": "3-4"
      }
    }
  ],
  "files": {
    "manifestPath": "...",
    "readmePath": "..."
  }
}
```

**用途**：
- Claude 命令行执行：`curl -X POST http://127.0.0.1:8794/seed/generate -d '{"directionId":"tech-experience"}'`
- 生成的文件覆盖到 `src/data/seed/manifests/` 和 `素材库/种子内容/`
- 前端从静态文件读取，不调用此接口

---

### `/seed/feasibility` - 可行性判断

**输入**：
```json
{
  "seedId": "seed-006",
  "userRequest": "我想做一个强调现场氛围的短视频"
}
```

**输出**：
```json
{
  "verdict": "supported | degradable | unsupported",
  "reason": "判断理由",
  "fallback": "如果不支持，建议调整方向或换种子",
  "brief": "如果支持，可以做的简短方向"
}
```

**用途**：
- C 端用户裂变流程第一步
- 判断用户诉求能否用当前种子实现
- 前端根据 verdict 决定是否继续

---

### `/seed/package` - 素材包产出

**输入**：
```json
{
  "seedId": "seed-006",
  "userRequest": "我想做一个强调现场体验感的短视频"
}
```

**输出**：
```json
{
  "seedId": "seed-006",
  "packageId": "1786208483601-e3746ab3",
  "zipUrl": "/outputs/seed-packages/seed-package-xxx.zip",
  "scriptPreview": "# 视频标题\n\n## 分镜脚本\n...",
  "clipCount": 4,
  "totalDuration": 23.27
}
```

**用途**：
- C 端用户裂变流程第二步（可行性判断通过后）
- 按逻辑线选片 + 生成文案 + 打包 zip
- 前端展示下载链接

---

## C 端前端对接（当前要做）

### 流程改造

**当前流程**（有问题）：
```
用户输入诉求 → 点"生成素材包" → 直接调 /seed/package → 显示结果
```

**正确流程**：
```
1. 用户输入诉求
2. 点"生成素材包"按钮
3. 显示"判断可行性中..."
4. 调用 /seed/feasibility
   ├─ unsupported → 显示"当前种子不支持" + 建议 + 停止
   ├─ degradable → 显示"可以做但需调整" + 警告 + 确认按钮
   └─ supported → 继续
5. 显示"生成中..."
6. 调用 /seed/package
7. 显示结果 + 下载链接
```

### 需要改动的代码

**文件**：`src/main.tsx`

**改动点 1**：`handleSeedAiSubmit` 函数
```javascript
const handleSeedAiSubmit = async () => {
  // ...现有代码

  if (activeSeedAiAction === "package") {
    // 1. 先判断可行性
    setSeedAiResult({
      action: "package",
      title: "判断可行性中...",
      intro: "正在分析当前种子内容是否支持您的需求",
      isLoading: true,
    });

    const feasibilityRes = await fetch('http://127.0.0.1:8796/seed/feasibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seedId,
        userRequest: submittedPrompt,
      }),
    });

    const feasibility = await feasibilityRes.json();

    // 2. 根据可行性决定是否继续
    if (feasibility.verdict === 'unsupported') {
      setSeedAiResult({
        action: "package",
        title: "当前种子不支持此需求",
        intro: feasibility.reason,
        sections: [
          {
            label: "建议",
            content: feasibility.fallback,
          },
        ],
        isError: true,
      });
      return;
    }

    if (feasibility.verdict === 'degradable') {
      // TODO: 显示警告 + 确认按钮，用户确认后再继续
      // 现在先直接继续
    }

    // 3. 生成素材包
    setSeedAiResult({
      action: "package",
      title: "生成素材包中...",
      intro: feasibility.brief || "正在生成",
      isLoading: true,
    });

    const packageRes = await fetch('http://127.0.0.1:8793/seed/package', {
      // ... 现有代码
    });

    // ... 显示结果
  }
};
```

**改动点 2**：增加 UI 状态
```javascript
type SeedAiResult = {
  action: string;
  title: string;
  intro: string;
  sections?: Array<{label: string; content: string}>;
  downloadUrl?: string;
  isError?: boolean;
  isLoading?: boolean;  // 新增
};
```

**改动点 3**：结果展示组件
```jsx
{seedAiResult.isLoading && (
  <div className="seed-ai-loading">
    <span>处理中...</span>
  </div>
)}

{seedAiResult.isError && (
  <div className="seed-ai-error">
    <p>{seedAiResult.intro}</p>
    {/* 显示建议 */}
  </div>
)}
```

---

## B 端功能（往后放）

### 摄影师素材收集页面

**功能**：
- 展示当前种子内容的拍摄指南
- 按 segment 分类展示文件夹
- 每个文件夹下：
  - 显示拍摄要求（shootingGuide）
  - 上传视频文件
  - 填写素材备注（实际拍了什么、有什么问题）
- 上传后自动更新 manifest 的 clips 数组

**技术方案**：
- 新增页面：`/photographer-upload`
- 读取 manifest.json 的 segments
- 上传接口：`POST /seed/upload`（需新建）
- 文件存储：直接上传到 `素材库/种子内容/seed-xxx/素材包/XX_段落名/`

**优先级**：低，等内容确定后再做

---

## 静态内容生成流程（Claude 工具）

### 生成热点方向

**输入**：策划提供的方向列表

**执行**：
```bash
# Claude 根据策划提供的信息，更新 src/data/seed/directions.ts
```

**输出**：
- 更新 `directions.ts` 文件
- 提交到 git

### 生成种子内容

**输入**：确定的 directionId

**执行**：
```bash
curl -X POST http://127.0.0.1:8794/seed/generate \
  -H "Content-Type: application/json" \
  -d '{"directionId":"tech-experience"}'
```

**输出**：
- `素材库/种子内容/seed-xxx/` 文件夹
- `src/data/seed/manifests/seed-xxx.manifest.json`
- 更新 `src/data/seed/seeds.ts`（添加新种子）
- 提交到 git

---

## 当前工作状态

### ✅ 已完成

- 阶段 A 后端：`/seed/generate` 接口
- 阶段 B 后端：`/seed/feasibility` + `/seed/package` 接口
- 数据层：`directions.ts` / `seeds.ts` / `timeline.ts`
- 前端展示：种子卡片、内容方向

### 🚧 进行中

- C 端可行性判断接入（改造 `handleSeedAiSubmit`）

### ⏸️ 暂缓

- B 端摄影师上传页面（等内容确定）
- 视频生成功能（Step B3）

### 📋 待定

- 热点方向内容（等策划确定）
- 种子内容方向（等策划确定）

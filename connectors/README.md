# Meta Insight 连接器

连接器入口：`POST /connector/metainsight/search`

它把项目现有的 Meta Insight 混合检索封装为 Agent 可调用的 HTTP 工具。接口支持 `all`、`image`、`video`、`document` 四种类型，最多返回 50 条按相关度排序的结果。

## 配置

在服务端环境变量中设置：

```bash
METAINSIGHT_CONNECTOR_TOKEN=一段随机长字符串
```

设置后，调用方必须携带：

```http
Authorization: Bearer 一段随机长字符串
```

未设置该变量时，本地开发环境不强制鉴权。

## 接入 ADP Agent

1. 将 `metainsight-search.openapi.json` 导入 ADP 的连接器/API 插件。
2. 将 `servers[0].url` 替换为部署 `storage-server` 的公网 HTTPS 域名。
3. 配置 Bearer Token，与 `METAINSIGHT_CONNECTOR_TOKEN` 保持一致。
4. 将连接器挂载到 Agent，并在 Agent 说明中声明：用户要求搜索图片、视频、文档或素材时调用 `searchKnowledgeBaseAssets`。

本地的 `/api/search` 仍保留给项目页面使用；Agent 使用独立的 `/connector/metainsight/search`，两者共享同一套 Meta Insight 数据集和服务端凭证。

# MetaInsight MCP Server

标准 MCP Streamable HTTP 服务，用于搜索 717 知识库中的图片、视频和文档索引。当前服务只读取 MetaInsight 数据集，不会修改 COS 对象或索引。

## 工具

- `search_metainsight_assets`：按自然语言搜索全部、图片、视频或文档素材。
- `get_metainsight_dataset_status`：查询三个语义检索数据集的状态和索引进度。

## 本地运行

服务读取项目根目录的 `.env` 和 `.env.local`：

```bash
pnpm mcp:metainsight
```

默认端点：`http://127.0.0.1:8792/mcp`

健康检查：`http://127.0.0.1:8792/health`

如果配置了 `METAINSIGHT_MCP_TOKEN`，MCP 客户端必须携带：

```http
Authorization: Bearer <METAINSIGHT_MCP_TOKEN>
```

未单独设置 MCP Token 时会回退到 `METAINSIGHT_CONNECTOR_TOKEN`。两个变量都为空时仅适合本地调试，不强制鉴权。

## SCF 入口

`metainsight-server.mjs` 已导出 `main_handler` 和 `handler`。SCF 部署包需要包含 `mcp/`、生产依赖和环境变量，函数入口指向：

```text
index.main_handler
```

服务采用无状态 JSON 响应模式，不依赖函数实例内存或长连接，适合云函数冷启动和弹性扩缩容。

## 已部署环境

- 地域：`ap-guangzhou`
- 函数：`metainsight-mcp-717`
- 运行时：`Nodejs18.15`
- 公网端点：`https://1328484090-1lzeczuoqb.ap-guangzhou.tencentscf.com/mcp`
- 传输：MCP Streamable HTTP，无状态 JSON 响应
- 鉴权：`Authorization: Bearer <METAINSIGHT_MCP_TOKEN>`

函数 URL 自身不启用腾讯云 IAM 请求签名，由 MCP 服务内的 Bearer Token 拦截未授权请求。Token 只保存在 SCF 环境变量和本机安全配置中，不应写入仓库。

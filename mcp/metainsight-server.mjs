import dotenv from 'dotenv';
import { webcrypto } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { getMetaInsightDatasetStatus, searchMetaInsightAssets } from './metainsight-core.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: false });

const assetTypeSchema = z.enum(['all', 'image', 'video', 'document']);

export const createMetaInsightMcpServer = () => {
  const server = new McpServer(
    { name: '717-metainsight-search', version: '1.0.0' },
    {
      instructions: '只使用 MetaInsight 实际返回的图片、视频和文档结果。不得编造文件名、资源地址、匹配分数或资料内容。',
    },
  );

  server.registerTool('search_metainsight_assets', {
    title: '搜索 MetaInsight 多模态素材',
    description: '使用自然语言在 717 知识库中搜索图片、视频和文档，可限定素材类型，并按 MetaInsight 相关度返回真实结果。',
    inputSchema: {
      query: z.string().min(1).describe('自然语言检索内容，例如：红旗 HS6 活动现场舞台视频'),
      assetType: assetTypeSchema.default('all').describe('all、image、video 或 document'),
      limit: z.number().int().min(1).max(50).default(10).describe('最多返回结果数量'),
      threshold: z.number().min(0).default(1).describe('MetaInsight 匹配阈值'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (input) => {
    try {
      const result = await searchMetaInsightAssets(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.error?.Message || error.message || 'MetaInsight 搜索失败' }],
      };
    }
  });

  server.registerTool('get_metainsight_dataset_status', {
    title: '查看 MetaInsight 数据集状态',
    description: '查看图片、视频和文档语义检索数据集的索引状态与进度。',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
    try {
      const result = await getMetaInsightDatasetStatus();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.error?.Message || error.message || 'MetaInsight 状态查询失败' }],
      };
    }
  });

  return server;
};

const unauthorizedResponse = () => new Response(JSON.stringify({
  jsonrpc: '2.0',
  error: { code: -32001, message: 'Unauthorized' },
  id: null,
}), {
  status: 401,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const isAuthorized = (request) => {
  const expected = String(process.env.METAINSIGHT_MCP_TOKEN || process.env.METAINSIGHT_CONNECTOR_TOKEN || '').trim();
  return !expected || request.headers.get('authorization') === `Bearer ${expected}`;
};

export const handleMetaInsightMcpRequest = async (request) => {
  if (!isAuthorized(request)) return unauthorizedResponse();
  const server = createMetaInsightMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
};

const eventToRequest = (event = {}) => {
  const method = event.requestContext?.http?.method || event.httpMethod || event.requestContext?.httpMethod || 'POST';
  const headers = new Headers(event.headers || {});
  const rawBody = event.body || '';
  const body = event.isBase64Encoded ? Buffer.from(rawBody, 'base64') : rawBody;
  const path = event.rawPath || event.path || '/mcp';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  return new Request(`https://scf.local${path}${query}`, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
  });
};

const responseToScf = async (response) => ({
  statusCode: response.status,
  headers: Object.fromEntries(response.headers.entries()),
  body: await response.text(),
  isBase64Encoded: false,
});

export const main_handler = async (event) => responseToScf(
  await handleMetaInsightMcpRequest(eventToRequest(event)),
);

export const handler = main_handler;

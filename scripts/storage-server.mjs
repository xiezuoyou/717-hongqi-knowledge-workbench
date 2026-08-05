import http from 'node:http';
import dotenv from 'dotenv';
import COS from 'cos-nodejs-sdk-v5';
import { v20231130 as LkeApi } from 'tencentcloud-sdk-nodejs-lke/tencentcloud/services/lke/v20231130/index.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: false });

const { COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION } = process.env;
if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION) {
  throw new Error('缺少 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION');
}

const cos = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });
const ADP_SECRET_ID = process.env.ADP_SECRET_ID || process.env.COS_SECRET_ID;
const ADP_SECRET_KEY = process.env.ADP_SECRET_KEY || process.env.COS_SECRET_KEY;
const ADP_REGION = process.env.ADP_REGION || 'ap-guangzhou';
const adp = ADP_SECRET_ID && ADP_SECRET_KEY ? new LkeApi.Client({ credential: { secretId: ADP_SECRET_ID, secretKey: ADP_SECRET_KEY }, region: ADP_REGION }) : null;
const port = Number(process.env.STORAGE_PORT || 8791);
const appId = COS_BUCKET.split('-').pop();
const ciHost = `${appId}.ci.${COS_REGION}.myqcloud.com`;
const searchDatasets = {
  all: { name: process.env.METAINSIGHT_DATASET || '717-knowledge-base', template: 'COSBasicMeta', label: '全部对象' },
  image: { name: process.env.METAINSIGHT_IMAGE_DATASET || '717-image-search', template: 'ImageSearch', label: '图片语义' },
  video: { name: process.env.METAINSIGHT_VIDEO_DATASET || '717-video-search', template: 'VideoSearch', label: '视频语义' },
  document: { name: process.env.METAINSIGHT_DOC_DATASET || '717-doc-search', template: 'DocSearch', label: '文档内容' },
};
const officialAdpConversations = new Map();
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); };
const call = (method, params) => new Promise((resolve, reject) => cos[method](params, (error, data) => error ? reject(error) : resolve(data)));
const readBody = (req) => new Promise((resolve, reject) => { const chunks = []; req.on('data', (chunk) => chunks.push(chunk)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
const tag = (xml, name) => (xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1] || '';
const unescape = (value) => value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
const parseSearchXml = (xml) => {
  const results = [];
  for (const section of ['Doc', 'Image', 'Video']) {
    const group = tag(xml, `${section}Result`);
    const items = group.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`, 'g')) || [];
    for (const item of items) {
      const uri = unescape(tag(item, 'URI'));
      if (!uri) continue;
      results.push({ uri, score: Number(tag(item, 'Score')) || 0, text: unescape(tag(item, 'Text')), page: tag(item, 'TextPage'), imageUrls: tag(item, 'ImageUrls') });
    }
  }
  return results;
};

const runMetaInsightSearch = async (payload) => {
  const query = String(payload.query || '').trim();
  const type = searchDatasets[payload.type] ? payload.type : 'image';
  if (!query) throw new Error('请输入搜索内容');
  const types = type === 'all' ? ['image', 'video', 'document'] : [type];
  const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 50);
  const batches = await Promise.all(types.map(async (kind) => {
    const dataset = searchDatasets[kind];
    const body = JSON.stringify({ DatasetName: dataset.name, Mode: 'text', Templates: dataset.template, SearchText: query, Limit: limit, MatchThreshold: Number(payload.threshold) || 1 });
    const data = await cos.request({ Method: 'POST', Url: `https://${ciHost}/datasetquery/hybridsearch`, Headers: { 'Content-Type': 'application/json' }, Body: body, RawBody: true });
    return parseSearchXml(data.Body?.toString() || '').map((item) => ({
      ...item,
      type: kind,
      assetUrl: item.uri,
      previewUrl: item.imageUrls || item.uri,
    }));
  }));
  return {
    type,
    dataset: types.map((kind) => searchDatasets[kind].name),
    template: types.map((kind) => searchDatasets[kind].template),
    query,
    results: batches.flat().sort((a, b) => b.score - a.score).slice(0, limit),
  };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Language' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/application/list') {
    const applicationId = process.env.ADP_APP_BIZ_ID || process.env.ADP_BOT_BIZ_ID || '717-knowledge-base';
    return json(res, 200, { Applications: [{ ApplicationId: applicationId, Name: '717知识库', Greeting: '你好，我是717知识库智能助手。', OpeningQuestions: ['请查询813项目的核心背景信息，并整理成简洁说明。', '请概括当前知识库中的主要用户画像和竞品。'], Pattern: 'agent', AppStatus: 2, InputBox: { InputBoxButtons: [] }, EnableWebSearch: false, EnableAudit: true, SpaceId: 'default_space' }] });
  }
  if (url.pathname === '/account/info') return json(res, 200, { Info: { Id: 'local-user', Name: '717用户', Avatar: '' } });
  if (url.pathname === '/system/config') return json(res, 200, { Config: { EnableVoiceInput: false } });
  if (url.pathname === '/suggestions') return json(res, 200, { Groups: [] });
  if (url.pathname === '/chat/conversations') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const applicationId = url.searchParams.get('ApplicationId');
    return json(res, 200, [...officialAdpConversations.values()].filter((item) => !applicationId || item.ApplicationId === applicationId).sort((a, b) => b.LastActiveAt - a.LastActiveAt));
  }
  if (url.pathname === '/chat/messages') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const conversationId = url.searchParams.get('ConversationId') || '';
    const conversation = officialAdpConversations.get(conversationId);
    if (!conversationId) return json(res, 400, { error: '缺少 ConversationId' });
    if (!adp) return json(res, 503, { error: '未配置 ADP 凭证' });
    try {
      const result = await adp.GetMsgRecord({
        Type: 5,
        Count: 100,
        SessionId: conversationId,
        BotAppKey: process.env.ADP_APP_KEY,
        Scene: 2,
      });
      return json(res, 200, {
        Response: {
          ApplicationId: conversation?.ApplicationId || process.env.ADP_APP_BIZ_ID || '',
          Records: result?.Records || [],
        },
        RequestId: result?.RequestId,
      });
    } catch (error) {
      return json(res, 502, { error: error.message || 'ADP 历史消息查询失败', code: error.code });
    }
  }
  if (url.pathname === '/chat/conversation/delete') {
    const payload = JSON.parse((await readBody(req)).toString() || '{}');
    officialAdpConversations.delete(String(payload.ConversationId || ''));
    return json(res, 200, { Success: 1 });
  }
  if (url.pathname === '/feedback/rate') return json(res, 200, { Success: 1 });
  if (url.pathname === '/share/create') return json(res, 200, { ShareId: '' });
  if (url.pathname === '/chat/message') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    try {
      const payload = JSON.parse((await readBody(req)).toString() || '{}');
      const appKey = String(process.env.ADP_APP_KEY || '').trim();
      const applicationId = String(payload.ApplicationId || process.env.ADP_APP_BIZ_ID || '');
      const contents = Array.isArray(payload.Contents) ? payload.Contents : [];
      const firstText = contents.find((item) => item?.Type === 'text')?.Text || '新对话';
      const isNewConversation = !payload.ConversationId;
      const conversationId = String(payload.ConversationId || crypto.randomUUID());
      if (!appKey) return json(res, 400, { error: '缺少 ADP_APP_KEY' });
      const now = Date.now();
      const conversation = { Id: conversationId, AccountId: 'local-user', Title: String(firstText).slice(0, 18), LastActiveAt: now, CreatedAt: officialAdpConversations.get(conversationId)?.CreatedAt || now, ApplicationId: applicationId };
      officialAdpConversations.set(conversationId, conversation);
      const upstream = await fetch('https://wss.lke.cloud.tencent.com/adp/v2/chat', {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ConversationId: conversationId, AppKey: appKey, Contents: contents, Incremental: true, EnableMultiIntent: true, VisitorId: '717-local-user', Stream: 'enable' }),
      });
      if (!upstream.ok || !upstream.body) return json(res, 502, { error: `ADP V2 对话接口返回 ${upstream.status}` });
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      if (isNewConversation) res.write(`data: ${JSON.stringify({ Type: 'conversation', Payload: { ...conversation, IsNewConversation: true } })}\n\n`);
      for await (const chunk of upstream.body) res.write(chunk);
      res.write(`data: ${JSON.stringify({ Type: 'conversation', Payload: { ...conversation, IsNewConversation: false } })}\n\n`);
      return res.end();
    } catch (error) {
      if (!res.headersSent) return json(res, 502, { error: error.message || 'ADP 官方客户端代理失败' });
      return res.end();
    }
  }
  if (url.pathname === '/api/search') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    try {
      const payload = JSON.parse((await readBody(req)).toString() || '{}');
      return json(res, 200, await runMetaInsightSearch(payload));
    } catch (error) { return json(res, 500, { error: error.error?.Message || error.message || 'MetaInsight 查询失败' }); }
  }
  if (url.pathname === '/connector/metainsight/search') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const expectedToken = String(process.env.METAINSIGHT_CONNECTOR_TOKEN || '').trim();
    if (expectedToken && req.headers.authorization !== `Bearer ${expectedToken}`) {
      return json(res, 401, { error: '未授权的 Meta Insight 连接器请求' });
    }
    try {
      const payload = JSON.parse((await readBody(req)).toString() || '{}');
      const result = await runMetaInsightSearch({ ...payload, type: payload.type || 'all' });
      return json(res, 200, {
        connector: 'metainsight',
        ...result,
        count: result.results.length,
      });
    } catch (error) { return json(res, 500, { error: error.error?.Message || error.message || 'Meta Insight 连接器查询失败' }); }
  }
  if (url.pathname === '/api/search/status') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    try {
      const datasets = await Promise.all(Object.entries(searchDatasets).map(async ([type, item]) => {
        try { const data = await cos.request({ Method: 'GET', Url: `https://${ciHost}/dataset`, Query: { datasetname: item.name } }); return { type, ...item, state: data.Response?.Dataset?.State || 'Unknown', progress: Number(data.Response?.Dataset?.TaskProgress || 0) }; }
        catch (error) { return { type, ...item, state: 'Error', error: error.error?.Message || error.message }; }
      }));
      return json(res, 200, { datasets });
    } catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (url.pathname === '/api/adp/apps') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (!adp) return json(res, 503, { configured: false, error: '未配置 ADP 凭证' });
    try {
      const result = await adp.ListApp({ AppType: 'knowledge_qa', PageSize: 100, PageNumber: 1 });
      return json(res, 200, { configured: true, region: ADP_REGION, apps: result?.List || result?.AppList || [], total: result?.Total, requestId: result?.RequestId });
    } catch (error) { return json(res, 502, { configured: true, region: ADP_REGION, error: error.message || 'ADP 应用查询失败', code: error.code }); }
  }
  if (url.pathname === '/api/adp/app') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (!adp) return json(res, 503, { configured: false, error: '未配置 ADP 凭证' });
    const appBizId = url.searchParams.get('appBizId') || process.env.ADP_APP_BIZ_ID || process.env.ADP_BOT_BIZ_ID;
    if (!appBizId) return json(res, 400, { error: '缺少 appBizId，且未配置 ADP_APP_BIZ_ID' });
    try { const result = await adp.DescribeApp({ AppBizId: appBizId, AppType: 'knowledge_qa' }); return json(res, 200, { appBizId, app: result, requestId: result?.RequestId }); }
    catch (error) { return json(res, 502, { appBizId, region: ADP_REGION, error: error.message || 'ADP 应用查询失败', code: error.code }); }
  }
  if (url.pathname === '/api/adp/ws-token') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!adp) return json(res, 503, { configured: false, error: '未配置 ADP 管控凭证' });
    try {
      const payload = JSON.parse((await readBody(req)).toString() || '{}');
      const appKey = String(payload.appKey || process.env.ADP_APP_KEY || '').trim();
      const visitorId = String(payload.visitorId || 'web-user').slice(0, 64);
      if (!appKey) return json(res, 400, { error: '缺少 ADP_APP_KEY' });
      const result = await adp.GetWsToken({ Type: 5, BotAppKey: appKey, VisitorBizId: visitorId });
      return json(res, 200, { token: result?.Token, balance: result?.Balance, pattern: result?.Pattern, inputLenLimit: result?.InputLenLimit, requestId: result?.RequestId });
    } catch (error) { return json(res, 502, { error: error.message || 'ADP 会话令牌获取失败', code: error.code }); }
  }
  if (url.pathname === '/api/adp/chat') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!adp) return json(res, 503, { configured: false, error: '未配置 ADP 管控凭证' });
    try {
      const payload = JSON.parse((await readBody(req)).toString() || '{}');
      const appKey = String(payload.appKey || process.env.ADP_APP_KEY || '').trim();
      const visitorId = String(payload.visitorId || 'web-user').slice(0, 64);
      const content = String(payload.content || '').trim();
      const sessionId = String(payload.sessionId || '');
      if (!appKey) return json(res, 400, { error: '缺少 ADP_APP_KEY' });
      if (!content) return json(res, 400, { error: '缺少 content' });
      const tokenResult = await adp.GetWsToken({ Type: 5, BotAppKey: appKey, VisitorBizId: visitorId });
      if (!tokenResult?.Token) return json(res, 502, { error: 'ADP 未返回会话令牌' });
      const requestId = String(payload.requestId || crypto.randomUUID());
      const upstream = await fetch('https://wss.lke.cloud.tencent.com/v1/qbot/chat/sse', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ content, bot_app_key: appKey, token: tokenResult.Token, visitor_biz_id: visitorId, request_id: requestId, session_id: sessionId, streaming_thinking: payload.streamingThinking !== false, incremental: true, custom_variables: payload.customVariables || undefined }),
      });
      if (!upstream.ok || !upstream.body) return json(res, 502, { error: `ADP 对话接口返回 ${upstream.status}` });
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      for await (const chunk of upstream.body) res.write(chunk);
      return res.end();
    } catch (error) { if (!res.headersSent) return json(res, 502, { error: error.message || 'ADP 对话请求失败', code: error.code }); res.end(); }
  }
  if (!url.pathname.startsWith('/api/storage')) return json(res, 404, { error: 'Not found' });
  try {
    const prefix = url.searchParams.get('prefix') || '';
    if (req.method === 'GET') {
      const data = await call('getBucket', { Bucket: COS_BUCKET, Region: COS_REGION, Prefix: prefix, Delimiter: '/', MaxKeys: 1000 });
      return json(res, 200, { prefix, folders: (data.CommonPrefixes || []).map((item) => item.Prefix), files: (data.Contents || []).filter((item) => item.Key !== prefix).map((item) => ({ key: item.Key, name: item.Key.slice(prefix.length), size: Number(item.Size), updated: item.LastModified, etag: item.ETag })) });
    }
    if (req.method === 'POST') {
      const key = url.searchParams.get('key');
      if (!key) return json(res, 400, { error: '缺少 key' });
      const body = await readBody(req);
      const data = await call('putObject', { Bucket: COS_BUCKET, Region: COS_REGION, Key: key, Body: body, ContentLength: body.length, ContentType: req.headers['content-type'] || 'application/octet-stream' });
      return json(res, 200, { key, etag: data.ETag });
    }
    if (req.method === 'DELETE') {
      const key = url.searchParams.get('key');
      const folder = url.searchParams.get('folder');
      if (!key && !folder) return json(res, 400, { error: '缺少 key 或 folder' });
      if (folder) {
        let marker = '';
        let deleted = 0;
        do {
          const page = await call('getBucket', { Bucket: COS_BUCKET, Region: COS_REGION, Prefix: folder, MaxKeys: 1000, Marker: marker });
          const keys = (page.Contents || []).map((item) => item.Key);
          if (keys.length) {
            await call('deleteMultipleObject', { Bucket: COS_BUCKET, Region: COS_REGION, Objects: keys.map((item) => ({ Key: item })) });
            deleted += keys.length;
          }
          marker = page.IsTruncated ? page.NextMarker : '';
        } while (marker);
        return json(res, 200, { folder, deleted });
      }
      await call('deleteObject', { Bucket: COS_BUCKET, Region: COS_REGION, Key: key });
      return json(res, 200, { key });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) { return json(res, 500, { error: error.message || 'COS 请求失败' }); }
});
server.listen(port, '0.0.0.0', () => console.log(`Storage API listening on http://127.0.0.1:${port}`));

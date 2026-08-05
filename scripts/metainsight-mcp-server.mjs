import http from 'node:http';
import { handleMetaInsightMcpRequest } from '../mcp/metainsight-server.mjs';

const port = Number(process.env.METAINSIGHT_MCP_PORT || 8792);

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

const server = http.createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ ok: true, service: '717-metainsight-search', transport: 'streamable-http' }));
  }
  if (new URL(request.url, `http://${request.headers.host}`).pathname !== '/mcp') {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ error: 'Not found' }));
  }
  try {
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await readBody(request);
    const webRequest = new Request(`http://${request.headers.host}${request.url}`, {
      method: request.method,
      headers: request.headers,
      body,
    });
    const webResponse = await handleMetaInsightMcpRequest(webRequest);
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message || 'Internal server error' },
      id: null,
    }));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`MetaInsight MCP listening on http://127.0.0.1:${port}/mcp`);
});

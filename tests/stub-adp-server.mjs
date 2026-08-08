/**
 * Stub of the storage/ADP backend, for behaviour tests only.
 *
 * It speaks the same SSE shape the real ADP knowledge endpoint speaks, so the
 * frontend's stream parser is exercised for real. The scenario is chosen by the
 * question text, which keeps the tests readable: they just ask a question.
 *
 *   "正常问答"  -> conversation -> reply deltas -> reference -> completed
 *   "慢速回答"  -> same, but waits before the first delta (loading window)
 *   "服务器错误" -> 500 with a raw body, to observe how errors surface
 *   "永不回答"  -> opens the stream and never finishes (so stop can be tested)
 *   "只有思考"  -> emits a non-reply message and deltas that must be ignored
 */

import { createServer } from "node:http";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const CONVERSATION_ID = "stub-conversation-1";

async function streamNormal(res, { slow = false } = {}) {
  sendEvent(res, {
    Type: "conversation",
    Payload: { Id: CONVERSATION_ID, Title: "桩会话", LastActiveAt: Date.now() },
  });

  const messageId = "stub-message-1";
  sendEvent(res, { Type: "message.added", Message: { MessageId: messageId, Type: "reply" } });

  // A tool call, so the tool row rendering is covered too.
  sendEvent(res, {
    Type: "message.added",
    Message: {
      MessageId: "stub-tool-1",
      Type: "tool_call",
      Title: "检索知识库",
      Status: "processing",
      StatusDesc: "执行中",
      ExtraInfo: { ToolName: "knowledge_search/v1" },
    },
  });

  if (slow) await sleep(1200);

  for (const piece of ["红旗 813 ", "粉丝盛典的", "传播重点是"]) {
    sendEvent(res, { Type: "text.delta", MessageId: messageId, Text: piece });
    await sleep(60);
  }

  sendEvent(res, {
    Type: "message.done",
    Message: {
      MessageId: "stub-tool-1",
      Type: "tool_call",
      Title: "检索知识库",
      Status: "success",
      StatusDesc: "已完成",
      ExtraInfo: { ToolName: "knowledge_search/v1" },
    },
  });

  sendEvent(res, { Type: "text.delta", MessageId: messageId, Text: "统一口径。" });

  sendEvent(res, {
    Type: "reference.added",
    Reference: {
      Id: "ref-1",
      Name: "813传播口径说明.pdf",
      KnowledgeName: "hongqi-kb",
      PageInfos: [1, 2],
      Url: "https://example.invalid/doc",
    },
  });

  sendEvent(res, { Type: "response.completed", Response: { ConversationId: CONVERSATION_ID } });
  res.end();
}

async function streamThinkingOnly(res) {
  sendEvent(res, {
    Type: "conversation",
    Payload: { Id: CONVERSATION_ID, Title: "桩会话", LastActiveAt: Date.now() },
  });
  // Message type is NOT "reply", so these deltas must never reach the answer.
  sendEvent(res, { Type: "message.added", Message: { MessageId: "think-1", Type: "thinking" } });
  for (const piece of ["内部思考A", "内部思考B"]) {
    sendEvent(res, { Type: "text.delta", MessageId: "think-1", Text: piece });
    await sleep(40);
  }
  sendEvent(res, { Type: "response.completed", Response: { ConversationId: CONVERSATION_ID } });
  res.end();
}

export function startStubAdpServer({ port = 0 } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (url.pathname === "/chat/conversations") {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ Conversations: [] }));
      return;
    }

    if (url.pathname === "/chat/messages") {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ Messages: [] }));
      return;
    }

    if (url.pathname === "/chat/message" && req.method === "POST") {
      const body = await readBody(req);
      const question = body?.Contents?.[0]?.Text || "";

      if (question.includes("服务器错误")) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end('{"Error":{"Code":"InternalError","Message":"stub upstream failure"}}');
        return;
      }

      res.writeHead(200, SSE_HEADERS);

      if (question.includes("永不回答")) {
        // Hold the stream open; the client is expected to abort.
        sendEvent(res, {
          Type: "conversation",
          Payload: { Id: CONVERSATION_ID, Title: "桩会话", LastActiveAt: Date.now() },
        });
        sendEvent(res, { Type: "message.added", Message: { MessageId: "hang-1", Type: "reply" } });
        return;
      }

      if (question.includes("只有思考")) {
        await streamThinkingOnly(res);
        return;
      }

      await streamNormal(res, { slow: question.includes("慢速回答") });
      return;
    }

    // Everything else (asset listing etc.) answers empty so the UI can mount.
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ folders: [], files: [] }));
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actualPort = server.address().port;
      resolve({
        port: actualPort,
        origin: `http://127.0.0.1:${actualPort}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

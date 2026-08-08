/**
 * Behaviour tests for the 813 platform's RAG question-answer flow.
 *
 * These drive the real UI in a real browser against a stub backend, so they
 * cover what the structural regression check cannot: whether the thing still
 * behaves correctly, not just whether the code still contains certain strings.
 *
 * The assertions describe CURRENT behaviour, including two known defects that
 * are deliberately pinned (see "known defect" comments). When those get fixed,
 * the corresponding assertion must be updated in the same change — that is the
 * point: the fix becomes visible instead of silent.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";

import { startStubAdpServer } from "./stub-adp-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let stub;
let vite;
let browser;
let baseUrl;

function startViteDevServer(storageApi) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", "0", "--strictPort", "false"],
      { cwd: root, env: { ...process.env, VITE_STORAGE_API: storageApi }, stdio: ["ignore", "pipe", "pipe"] },
    );

    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        child.stdout.off("data", onData);
        resolve({ child, url: match[0] });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`vite exited with ${code}:\n${output}`));
    });
    setTimeout(() => reject(new Error(`vite did not report a URL in time:\n${output}`)), 60_000);
  });
}

/** Opens the AI entry page with a logged-in account already primed. */
async function openAiPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    // The app reads users as JSON but the account name as a plain string.
    localStorage.setItem("hongqi-auth-users", JSON.stringify({ Admin: "Admin" }));
    localStorage.setItem("hongqi-auth-account", "Admin");
  });
  const page = await context.newPage();
  // The workbench is gated on a non-empty hash AND an authenticated account;
  // loading the bare URL leaves you on the landing page.
  await page.goto(`${baseUrl}#ai`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("AI模板入口").click({ timeout: 15_000 });
  await page.waitForSelector(".knowledge-ai-composer", { timeout: 15_000 });
  return { page, context };
}

async function ask(page, question) {
  const input = page.locator(".knowledge-ai-composer input");
  await input.fill(question);
  await page.getByLabel("发送").click();
}

beforeAll(async () => {
  stub = await startStubAdpServer();
  const started = await startViteDevServer(`${stub.origin}/api/storage`);
  vite = started.child;
  baseUrl = started.url;
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  vite?.kill("SIGTERM");
  await stub?.close();
});

describe("知识问答：正常流程", () => {
  it("流式输出后展示完整答案、工具调用和引用来源", async () => {
    const { page, context } = await openAiPage();
    try {
      await ask(page, "正常问答：813 传播重点是什么");

      // Answer accumulates from the streamed deltas.
      await expect
        .poll(() => page.locator(".knowledge-ai-answer-content").innerText(), { timeout: 15_000 })
        .toContain("统一口径");

      const answer = await page.locator(".knowledge-ai-answer-content").innerText();
      expect(answer).toContain("红旗 813");

      // Tool call row reaches its finished state. Uses textContent, not
      // innerText: the rows live inside a collapsed <details>, and innerText
      // only reports rendered text.
      await expect
        .poll(() => page.locator(".knowledge-ai-tool-row").textContent(), { timeout: 15_000 })
        .toContain("已完成");

      // The streamed reference was parsed and counted.
      await expect
        .poll(() => page.locator(".knowledge-ai-references").textContent(), { timeout: 15_000 })
        .toContain("1 份");

      // Streaming has ended: the button is back to "发送".
      await expect.poll(() => page.getByLabel("发送").count(), { timeout: 15_000 }).toBe(1);
    } finally {
      await context.close();
    }
  }, 60_000);

  it("非 reply 类型的流式内容不会混进答案", async () => {
    const { page, context } = await openAiPage();
    try {
      await ask(page, "只有思考：内部推理不应外泄");

      await expect.poll(() => page.getByLabel("发送").count(), { timeout: 15_000 }).toBe(1);

      const body = await page.locator(".knowledge-ai-assistant-body").innerText();
      expect(body).not.toContain("内部思考A");
      expect(body).not.toContain("内部思考B");
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe("知识问答：等待状态", () => {
  it("首字到达前展示生成中动画", async () => {
    const { page, context } = await openAiPage();
    try {
      await ask(page, "慢速回答：请稍等");

      // The thinking indicator must exist while the answer is still empty.
      await page.waitForSelector('[aria-label="正在生成回答"]', { timeout: 10_000 });

      // And it must disappear once text arrives.
      await expect
        .poll(() => page.locator('[aria-label="正在生成回答"]').count(), { timeout: 20_000 })
        .toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe("知识问答：中止生成", () => {
  /**
   * Regression guard for a fixed defect.
   *
   * The button used to derive its `type` from the same state its click handler
   * mutated: handleKnowledgeAiStop set isKnowledgeAiStreaming to false, React
   * applied type="button" -> type="submit" while the click was still being
   * dispatched, and the browser then performed the submit default action. Net
   * effect: stop aborted the request and immediately started a new one, so
   * generation never stopped. Measured then: 2 POSTs for one stop click.
   *
   * The POST count assertion below is the part that actually pins the fix —
   * the visible label alone would not have caught it.
   */
  it("点击停止后退出生成状态，且不会重新发起请求", async () => {
    const { page, context } = await openAiPage();
    try {
      let posts = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/chat/message")) posts += 1;
      });

      await ask(page, "永不回答：这个流不会结束");

      // While streaming, the same button becomes a stop control.
      await page.waitForSelector('[aria-label="停止生成"]', { timeout: 10_000 });
      expect(posts).toBe(1);

      await page.getByLabel("停止生成").click();

      // Streaming state clears and the send affordance returns.
      await expect.poll(() => page.getByLabel("发送").count(), { timeout: 10_000 }).toBe(1);
      expect(await page.locator('[aria-label="停止生成"]').count()).toBe(0);

      // The stop click must not have started another request.
      await page.waitForTimeout(500);
      expect(posts).toBe(1);
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe("知识问答：报错处理", () => {
  it("后端 500 时说人话并给出重试入口", async () => {
    const { page, context } = await openAiPage();
    try {
      await ask(page, "服务器错误：触发 500");

      await expect
        .poll(() => page.locator(".knowledge-ai-answer-failed").innerText(), { timeout: 15_000 })
        .toContain("稍后再试");

      const shown = await page.locator(".knowledge-ai-answer-failed").innerText();

      // The upstream body and status code must never reach the user.
      expect(shown).not.toContain("InternalError");
      expect(shown).not.toContain("500");
      expect(shown).not.toContain("stub upstream failure");

      // A retry affordance exists and re-sends the same question.
      const retry = page.getByRole("button", { name: "重新提问" });
      expect(await retry.count()).toBe(1);

      // The UI must not stay stuck in the streaming state.
      await expect.poll(() => page.getByLabel("发送").count(), { timeout: 15_000 }).toBe(1);
    } finally {
      await context.close();
    }
  }, 60_000);

  it("空状态用中性提示，不用红色报错样式", async () => {
    const { page, context } = await openAiPage();
    try {
      // A stream that completes without ever producing reply text.
      await ask(page, "只有思考：内部推理不应外泄");
      await expect.poll(() => page.getByLabel("发送").count(), { timeout: 15_000 }).toBe(1);

      // It is an empty result, not a failure: no error element, neutral copy.
      expect(await page.locator(".knowledge-ai-answer-failed").count()).toBe(0);
      const empty = page.locator(".knowledge-ai-answer-empty");
      expect(await empty.count()).toBe(1);
      expect(await empty.innerText()).toContain("更具体");
    } finally {
      await context.close();
    }
  }, 60_000);
});

/**
 * 813 种子裂变数据层 · 导出入口
 */

export * from "./types";
export { directions } from "./directions";
export { seeds } from "./seeds";
export { timeline } from "./timeline";

import type { Direction, Seed, TimelineDay, SeedManifest } from "./types";
import { directions } from "./directions";
import { seeds } from "./seeds";
import { timeline } from "./timeline";

/** 按 id 查方向 */
export function getDirectionById(id: string): Direction | undefined {
  return directions.find((d) => d.id === id);
}

/** 按 id 查种子 */
export function getSeedById(id: string): Seed | undefined {
  return seeds.find((s) => s.id === id);
}

/** 按日期查时间线 */
export function getTimelineByDate(date: string): TimelineDay | undefined {
  return timeline.find((t) => t.date === date);
}

/** 今天的时间线 */
export function getTodayTimeline(): TimelineDay | undefined {
  const today = new Date().toISOString().split("T")[0];
  return timeline.find((t) => t.date === today);
}

/** 加载种子的 manifest。运行时按需加载，不在启动时全加载。 */
export async function loadSeedManifest(seedId: string): Promise<SeedManifest | null> {
  const seed = getSeedById(seedId);
  if (!seed || !seed.manifestPath) return null;

  try {
    // Vite 的动态 import 要求路径是字面量或受限的模板字符串，
    // 这里用 fetch + JSON.parse 规避限制
    const res = await fetch(`/${seed.manifestPath}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 获取某个方向下的所有种子（已按优先级排序：ready 在前）
 */
export function getSeedsByDirection(directionId: string): Seed[] {
  return seeds
    .filter((s) => s.directionId === directionId)
    .sort((a, b) => {
      if (a.status === "ready" && b.status !== "ready") return -1;
      if (a.status !== "ready" && b.status === "ready") return 1;
      return 0;
    });
}

/**
 * 获取所有 ready 状态的种子
 */
export function getReadySeeds(): Seed[] {
  return seeds.filter((s) => s.status === "ready");
}

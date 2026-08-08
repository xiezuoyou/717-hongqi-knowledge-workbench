/**
 * 时间线：08/09（今天）→ 08/13（活动日）
 */

import type { TimelineDay } from "./types";

export const timeline: TimelineDay[] = [
  {
    date: "2026-08-09",
    label: "08/09",
    status: "active",
    focus: "预热启动，释放方向和创作建议",
    directionIds: ["tech-experience", "fan-cocreation", "brand-memory"],
    seedIds: ["seed-006"],
  },
  {
    date: "2026-08-10",
    label: "08/10",
    status: "upcoming",
    focus: "持续预热，补充种子内容",
    directionIds: ["tech-experience", "fan-cocreation", "family-travel"],
    seedIds: [],
  },
  {
    date: "2026-08-11",
    label: "08/11",
    status: "upcoming",
    focus: "倒计时两天，加大裂变素材投放",
    directionIds: ["tech-experience", "fan-cocreation", "brand-memory"],
    seedIds: [],
  },
  {
    date: "2026-08-12",
    label: "08/12",
    status: "upcoming",
    focus: "倒计时一天，活动前最后一波预热",
    directionIds: ["tech-experience", "fan-cocreation", "family-travel", "brand-memory"],
    seedIds: [],
  },
  {
    date: "2026-08-13",
    label: "08/13",
    status: "event",
    focus: "813 粉丝盛典当天，实时现场内容",
    directionIds: ["tech-experience", "fan-cocreation", "family-travel", "brand-memory"],
    seedIds: [],
  },
];

import type { Workspace } from "../shared/types";
import type { Command } from "../shared/commands";
import { idleSession, isBusy } from "../shared/initial";
import { selectWater } from "../features/waters";
import {
  chooseBait,
  tune,
  consumeBait,
  resupply,
  attraction,
  biteDelay,
} from "../features/tackle";
import { prepareCast, tickSession, strike } from "../features/fishing";
import { landCatch, releaseCatch } from "../features/collection";
import { claimReward } from "../features/challenges";
import { applyAwayCost } from "../features/fishing/lib/away";
import { useLineClip, useSpareBait } from "../features/fishing/lib/rescue";

export function gameReducer(state: Workspace, c: Command): Workspace {
  const { doc, session: s } = state;
  const busy = isBusy(s);
  switch (c.type) {
    case "spot":
      return busy
        ? state
        : { ...state, doc: selectWater(doc, c.id), saveStep: "checkpoint" };
    case "bait":
      return busy
        ? state
        : { ...state, doc: chooseBait(doc, c.id), saveStep: "checkpoint" };
    case "power":
      return {
        ...state,
        doc: tune(doc, "power", c.value),
        saveStep: "checkpoint",
      };
    case "drag":
      return busy
        ? state
        : { ...state, doc: tune(doc, "drag", c.value), saveStep: "checkpoint" };
    case "resupply":
      return busy
        ? state
        : {
            ...state,
            doc: resupply(doc),
            notice: "鱼饵已补给，带上好心情出发。",
            saveStep: "checkpoint",
          };
    case "charge-start":
      return s.phase === "ready" && doc.stock[doc.bait] > 0
        ? {
            ...state,
            session: {
              ...idleSession(),
              phase: "charging",
              message: "再次点击，把鱼饵抛向水面。",
            },
            saveStep: "checkpoint",
          }
        : state;
    case "cast": {
      if (s.phase !== "charging") return state;
      const consumed = consumeBait(doc);
      if (!consumed) return state;
      const cast = prepareCast(
        doc,
        s.charge,
        attraction(doc.spot, doc.bait),
        (r) => biteDelay(doc.bait, r),
      );
      return {
        ...state,
        doc: {
          ...consumed,
          seed: cast.seed,
          stats: { ...doc.stats, casts: doc.stats.casts + 1 },
        },
        session: cast.session,
        // 抛竿即关键边界：鱼饵已扣，必须尽快落盘，刷新也不返还。
        saveStep: "cast",
      };
    }
    case "strike":
      return { ...state, session: strike(s), saveStep: "checkpoint" };
    case "reel":
      return s.phase === "fighting"
        ? {
            ...state,
            session: { ...s, reeling: c.held },
            saveStep: "checkpoint",
          }
        : state;
    case "tick": {
      const next = tickSession(s, doc, Math.min(0.1, Math.max(0, c.dt)));
      if (next === s) return state;
      let updated = doc;
      let step: Workspace["saveStep"] = "checkpoint";
      if (next.phase === "landed" && s.phase !== "landed") {
        // 上岸是不可重复的资源结果：幂等保护 + 独立步骤标记。
        updated = landCatch(doc, next, Date.now());
        step = "landed";
      }
      if (next.phase === "escaped" && s.phase !== "escaped") {
        updated = {
          ...doc,
          stats: { ...doc.stats, escapes: doc.stats.escapes + 1 },
        };
        step = "escaped";
      }
      return { ...state, doc: updated, session: next, saveStep: step };
    }
    case "next":
      return s.phase === "landed" || s.phase === "escaped"
        ? { ...state, session: idleSession(), saveStep: "cleared" }
        : state;
    case "release":
      return {
        ...state,
        doc: releaseCatch(doc, c.id),
        saveStep: "checkpoint",
      };
    case "claim":
      return {
        ...state,
        doc: claimReward(doc, c.id),
        saveStep: "checkpoint",
      };
    case "return": {
      if (!busy) return state;
      const elapsed = Math.max(0, c.elapsed);
      // 救援意图在代价结算前校验：道具不足或本竿已用则拒绝整次操作，
      // 避免先扣代价/脱钩才告知玩家无法救援。
      if (c.rescue === "clip") {
        const check = useLineClip(doc, s);
        if (!check.ok)
          return { ...state, notice: check.reason ?? "现在无法使用稳线夹。" };
      }
      if (c.rescue === "bait") {
        const check = useSpareBait(doc, s);
        if (!check.ok)
          return { ...state, notice: check.reason ?? "现在无法使用备用饵。" };
      }
      // 备用饵救援会立即换上新饵，浸泡饵失效导致的脱钩被阻止。
      const resumed = applyAwayCost(s, elapsed, c.rescue === "bait");
      let workingDoc = doc;
      let workingSession = resumed;
      let step: Workspace["saveStep"] = "checkpoint";
      if (c.rescue === "clip") {
        const r = useLineClip(workingDoc, workingSession);
        if (!r.ok)
          return { ...state, notice: r.reason ?? "现在无法使用稳线夹。" };
        workingDoc = r.doc;
        workingSession = r.session;
        step = "rescue";
      }
      if (c.rescue === "bait") {
        const r = useSpareBait(workingDoc, workingSession);
        if (!r.ok)
          return { ...state, notice: r.reason ?? "现在无法使用备用饵。" };
        workingDoc = r.doc;
        workingSession = r.session;
        step = "rescue";
      }
      const escapedNow =
        workingSession.phase === "escaped" && s.phase !== "escaped";
      if (escapedNow) {
        workingDoc = {
          ...workingDoc,
          stats: {
            ...workingDoc.stats,
            escapes: workingDoc.stats.escapes + 1,
          },
        };
        step = "escaped";
      }
      return {
        ...state,
        doc: workingDoc,
        session: workingSession,
        saveStep: step,
      };
    }
    case "rescue-clip": {
      const result = useLineClip(doc, s);
      if (!result.ok)
        return { ...state, notice: result.reason ?? "现在无法使用稳线夹。" };
      // 扣料与对抗效果在同一状态更新内原子完成，并立即标记为救援步骤。
      return {
        ...state,
        doc: result.doc,
        session: result.session,
        saveStep: "rescue",
      };
    }
    case "rescue-bait": {
      const result = useSpareBait(doc, s);
      if (!result.ok)
        return { ...state, notice: result.reason ?? "现在无法使用备用饵。" };
      return {
        ...state,
        doc: result.doc,
        session: result.session,
        saveStep: "rescue",
      };
    }
    case "abandon":
      if (!busy) return state;
      return {
        ...state,
        session: {
          ...idleSession(),
          message: "已放弃这一竿，消耗的鱼饵与道具不会返还。",
        },
        notice: "已放弃本次垂钓，已消耗的鱼饵与道具不返还。",
        saveStep: "cleared",
      };
  }
}

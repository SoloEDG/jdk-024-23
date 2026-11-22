import type { GameDocument, Session } from "../../../shared/types";
import { CLIP_TENSION_CAP } from "../../../shared/types";
import { clamp } from "../../../shared/random";

export interface RescueResult {
  doc: GameDocument;
  session: Session;
  ok: boolean;
  reason?: string;
}

/** 稳线夹：仅搏鱼阶段，每竿限用一次，把张力压到安全上限以内。 */
export function useLineClip(doc: GameDocument, s: Session): RescueResult {
  if (s.phase !== "fighting")
    return { doc, session: s, ok: false, reason: "稳线夹只能在搏鱼时使用。" };
  if (s.rescue.clip)
    return { doc, session: s, ok: false, reason: "这一竿已经用过稳线夹。" };
  if (doc.gear.lineClips < 1)
    return { doc, session: s, ok: false, reason: "稳线夹已经用完了。" };
  const nextDoc: GameDocument = {
    ...doc,
    gear: { ...doc.gear, lineClips: doc.gear.lineClips - 1 },
  };
  const nextSession: Session = {
    ...s,
    tension: Math.min(s.tension, CLIP_TENSION_CAP),
    overload: 0,
    rescue: { ...s.rescue, clip: true },
    message: "稳线夹已夹住线组，张力被压回安全区；本竿已标记为辅助。",
  };
  return { doc: nextDoc, session: nextSession, ok: true };
}

/** 备用饵：等待/咬钩/搏鱼阶段，每竿限用一次，恢复浸泡饵效力并缓和局面。 */
export function useSpareBait(doc: GameDocument, s: Session): RescueResult {
  if (!["waiting", "bite", "fighting"].includes(s.phase))
    return { doc, session: s, ok: false, reason: "现在还不需要换备用饵。" };
  if (s.rescue.spareBait)
    return { doc, session: s, ok: false, reason: "这一竿已经换过备用饵。" };
  if (doc.gear.spareBaits < 1)
    return { doc, session: s, ok: false, reason: "备用饵已经用完了。" };
  const nextDoc: GameDocument = {
    ...doc,
    gear: { ...doc.gear, spareBaits: doc.gear.spareBaits - 1 },
  };
  const base: Session = {
    ...s,
    soak: 1,
    rescue: { ...s.rescue, spareBait: true },
  };
  let nextSession: Session;
  if (s.phase === "waiting") {
    // 重新给鱼一个咬钩窗口，避免换上新饵却永远等不到咬钩。
    const biteAt = s.clock + 3 + s.castPower * 2;
    nextSession = {
      ...base,
      biteAt,
      message: "备用饵已换好，浸泡效力恢复满格；本竿已标记为辅助。",
    };
  } else if (s.phase === "bite") {
    nextSession = {
      ...base,
      message: "备用饵让咬口更稳，赶紧提竿；本竿已标记为辅助。",
    };
  } else {
    nextSession = {
      ...base,
      tension: clamp(s.tension - 0.25, 0, 0.6),
      overload: 0,
      message: "备用饵重新吸引住鱼，张力缓和了一截；本竿已标记为辅助。",
    };
  }
  return { doc: nextDoc, session: nextSession, ok: true };
}

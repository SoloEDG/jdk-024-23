import type { GameDocument, Session, RescueState } from "./types";
export function emptyRescue(): RescueState {
  return { clip: false, spareBait: false };
}
export function newDocument(): GameDocument {
  return {
    version: 1,
    spot: "reed",
    bait: "worm",
    power: 0.6,
    drag: 0.4,
    seed: 48127,
    stock: { worm: 24, corn: 20, fly: 16 },
    gear: { lineClips: 3, spareBaits: 3 },
    bag: [],
    journal: {},
    stats: { casts: 0, catches: 0, escapes: 0, released: 0, cleanCatches: 0 },
    claimed: [],
  };
}
export function idleSession(): Session {
  return {
    id: "",
    phase: "ready",
    clock: 0,
    charge: 0,
    castPower: 0,
    spot: "reed",
    bait: "worm",
    fish: null,
    weight: 0,
    biteAt: 2,
    progress: 0,
    tension: 0.35,
    energy: 1,
    slackTime: 0,
    overload: 0,
    peak: 0,
    reeling: false,
    duration: 0,
    message: "深呼吸，把时间交给湖面。",
    soak: 1,
    awayTotal: 0,
    rescue: emptyRescue(),
  };
}
export function isBusy(s: Session) {
  return ["charging", "waiting", "bite", "fighting"].includes(s.phase);
}
/** 续战中的阶段：离开页面也不会结束，而是暂停等待返回。 */
export function isResumable(s: Session) {
  return isBusy(s);
}

import type { BaitId, SpotId } from "./types";
export type Command =
  | { type: "spot"; id: SpotId }
  | { type: "bait"; id: BaitId }
  | { type: "power"; value: number }
  | { type: "drag"; value: number }
  | { type: "resupply" }
  | { type: "charge-start" }
  | { type: "cast" }
  | { type: "strike" }
  | { type: "reel"; held: boolean }
  | { type: "tick"; dt: number }
  | { type: "next" }
  | { type: "release"; id: string }
  | { type: "claim"; id: string }
  /**
   * 从后台/刷新返回，携带本次离开的真实秒数，用于结算免费暂停之外的代价。
   * 可附带救援意图：在代价结算前校验道具，备用饵可阻止浸泡饵失效导致的脱钩。
   */
  | { type: "return"; elapsed: number; rescue?: "clip" | "bait" }
  /** 消耗稳线夹救援（仅搏鱼阶段，每竿一次）。 */
  | { type: "rescue-clip" }
  /** 消耗备用饵救援（等待/咬钩/搏鱼阶段，每竿一次）。 */
  | { type: "rescue-bait" }
  /** 放弃本竿：已消耗的鱼饵与道具不返还，直接回到空闲。 */
  | { type: "abandon" };

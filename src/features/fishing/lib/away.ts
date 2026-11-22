import type { Session } from "../../../shared/types";
import {
  FREE_AWAY_SECONDS,
  SOAK_DURATION_SECONDS,
} from "../../../shared/types";
import { clamp } from "../../../shared/random";

export interface AwayPreview {
  /** 本次离开秒数。 */
  elapsed: number;
  /** 同一竿免费暂停额度剩余（秒）。 */
  freeLeft: number;
  /** 真正计入代价的秒数（超出累计免费额度的部分）。 */
  charged: number;
  /** 本竿累计离开后总额度使用情况。 */
  awayAfter: number;
  /** 鱼将恢复的体力（仅搏鱼阶段）。 */
  energyGain: number;
  /** 浸泡饵损失的效力比例。 */
  soakLoss: number;
  soakAfter: number;
  /** 饵是否完全失效（等待/咬钩阶段意味着鱼离去）。 */
  soakedOut: boolean;
  willEscape: boolean;
}

/**
 * 免费暂停额度按“同一竿累计离开”计算：反复短退会持续累计，
 * 不会因为刷新页面而重新获得 60 秒。
 */
export function previewAway(s: Session, elapsed: number): AwayPreview {
  const safe = Math.max(0, elapsed);
  const freeLeft = Math.max(0, FREE_AWAY_SECONDS - s.awayTotal);
  const charged = Math.max(0, safe - freeLeft);
  // 蓄力阶段饵尚未入水，不存在浸泡衰减。
  const soakLoss = s.phase === "charging" ? 0 : charged / SOAK_DURATION_SECONDS;
  const soakAfter = clamp(s.soak - soakLoss);
  const energyGain =
    s.phase === "fighting" ? Math.min(charged * 0.03, 1 - s.energy) : 0;
  const soakedOut = soakAfter <= 0 && s.phase !== "charging";
  // 鱼还没咬实（等待/咬钩）时饵失效，鱼直接散去；搏鱼阶段鱼已在钩上。
  const willEscape =
    soakedOut && (s.phase === "waiting" || s.phase === "bite");
  return {
    elapsed: safe,
    freeLeft,
    charged,
    awayAfter: s.awayTotal + safe,
    energyGain,
    soakLoss,
    soakAfter,
    soakedOut,
    willEscape,
  };
}

/**
 * 结算一次离开：
 * - 累计离开的前 60 秒完全暂停，对抗时钟不前进、鱼不动作；
 * - 超出部分：搏鱼中的鱼恢复体力，浸泡饵按 120 秒线性失效；
 * - 等待/咬钩阶段饵完全失效则鱼散去，记为脱钩（备用饵救援可阻止）；
 * - 来不及记录的“最后松手”不做猜测：恢复后 reeling 一律为 false。
 */
export function applyAwayCost(
  s: Session,
  elapsed: number,
  preventEscape = false,
): Session {
  if (!(elapsed > 0)) return { ...s, reeling: false };
  const p = previewAway(s, elapsed);
  const awayTotal = p.awayAfter;
  const reeling = false;
  if (p.willEscape && !preventEscape) {
    return {
      ...s,
      awayTotal,
      soak: 0,
      reeling,
      phase: "escaped",
      message: "离开得太久，浸泡的饵已经失效，鱼儿散去了。",
    };
  }
  const next: Session = {
    ...s,
    awayTotal,
    soak: p.soakAfter,
    reeling,
    energy:
      s.phase === "fighting" ? clamp(s.energy + p.energyGain) : s.energy,
  };
  if (p.charged <= 0) {
    next.message = "湖面的时间为你暂停，这一竿可以继续。";
    return next;
  }
  const parts: string[] = [];
  if (p.energyGain > 0)
    parts.push(`鱼趁这段时间恢复了约 ${Math.round(p.energyGain * 100)}% 体力`);
  if (p.soakLoss > 0)
    parts.push(`浸泡饵效力降至 ${Math.round(p.soakAfter * 100)}%`);
  next.message = parts.length
    ? `免费暂停额度已用完，${parts.join("，")}。可继续，或使用道具救援。`
    : "湖面的时间为你暂停，这一竿可以继续。";
  return next;
}

/**
 * 关页路径的纯结算（无 reducer、无 React）：用于 pagehide 时同步把已经
 * 发生的离开时长写进现场，避免“确认中再关页”绕过免费额度与代价。
 * 不处理救援：救援只能由玩家在弹窗里显式确认。
 */
export function settleAway(
  s: Session,
  elapsed: number,
): { session: Session; escaped: boolean } {
  const before = s.phase;
  const session = applyAwayCost(s, elapsed);
  return { session, escaped: session.phase === "escaped" && before !== "escaped" };
}

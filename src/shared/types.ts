export type SpotId = "reed" | "brook" | "deep";
export type BaitId = "worm" | "corn" | "fly";
export type FishId = "crucian" | "perch" | "carp" | "trout" | "bass" | "pike";
export type Phase =
  | "ready"
  | "charging"
  | "waiting"
  | "bite"
  | "fighting"
  | "landed"
  | "escaped";
/** 同一竿允许免费暂停的累计离开时长（秒），超出部分才结算代价。 */
export const FREE_AWAY_SECONDS = 60;
/** 浸泡饵完全失效所需的计费离开时长（秒）。 */
export const SOAK_DURATION_SECONDS = 120;
/** 稳线夹能压住的张力上限。 */
export const CLIP_TENSION_CAP = 0.82;
export interface FishSpecies {
  id: FishId;
  name: string;
  latin: string;
  color: string;
  rarity: string;
  min: number;
  max: number;
  strength: number;
  waters: SpotId[];
  baits: BaitId[];
  note: string;
}
export interface Catch {
  id: string;
  fish: FishId;
  weight: number;
  spot: SpotId;
  bait: BaitId;
  time: number;
  duration: number;
  peakTension: number;
  /** 本竿是否使用过稳线夹或备用饵等辅助救援；无救援挑战不计入辅助鱼。 */
  assisted: boolean;
}
export interface JournalEntry {
  count: number;
  best: number;
  first: number;
}
/** 本竿已经使用过的救援道具，用于标记辅助与重复使用限制。 */
export interface RescueState {
  clip: boolean;
  spareBait: boolean;
}
export interface GameDocument {
  version: 1;
  spot: SpotId;
  bait: BaitId;
  power: number;
  drag: number;
  seed: number;
  stock: Record<BaitId, number>;
  /** 续战救援道具库存：稳线夹与备用饵。 */
  gear: { lineClips: number; spareBaits: number };
  bag: Catch[];
  journal: Partial<Record<FishId, JournalEntry>>;
  /** cleanCatches 为全程未使用任何救援的标准捕获数。 */
  stats: {
    casts: number;
    catches: number;
    escapes: number;
    released: number;
    cleanCatches: number;
  };
  claimed: string[];
}
export interface Session {
  id: string;
  phase: Phase;
  clock: number;
  charge: number;
  castPower: number;
  spot: SpotId;
  bait: BaitId;
  fish: FishId | null;
  weight: number;
  biteAt: number;
  progress: number;
  tension: number;
  energy: number;
  slackTime: number;
  overload: number;
  peak: number;
  reeling: boolean;
  duration: number;
  message: string;
  /** 浸泡饵剩余效力 0~1，离线超过免费暂停时长后逐渐失效。 */
  soak: number;
  /** 本竿累计离开时长（秒），反复短退持续累计、不会刷新免费额度。 */
  awayTotal: number;
  /** 本竿救援使用情况；任意一次救援都会让该竿被标记为辅助。 */
  rescue: RescueState;
}
/** 成功落盘的内容类型，用于向玩家说明“已经保存到哪一步”。 */
export type SaveStep =
  | "none"
  | "cast"
  | "checkpoint"
  | "rescue"
  | "landed"
  | "escaped"
  | "cleared";
/** 完整现场：可重放的对抗过程（session）与不可重复的资源结果（doc）原子打包。 */
export interface GameEnvelope {
  format: 2;
  doc: GameDocument;
  session: Session | null;
  savedAt: number;
  step: SaveStep;
}
export interface Workspace {
  doc: GameDocument;
  session: Session;
  notice: string;
  /** 最近一次状态变化对应的现场保存步骤，供节流落盘时标记。 */
  saveStep: SaveStep;
}

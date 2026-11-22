import { newDocument } from "../shared/initial";
import { fishCatalog } from "../shared/catalog";
import type {
  GameDocument,
  GameEnvelope,
  SaveStep,
  Session,
  BaitId,
} from "../shared/types";

const key = "stillwater-jdk024-v1";
const spots = ["reed", "brook", "deep"];
const baits = ["worm", "corn", "fly"];
const phases = [
  "ready",
  "charging",
  "waiting",
  "bite",
  "fighting",
  "landed",
  "escaped",
];
const steps: SaveStep[] = [
  "none",
  "cast",
  "checkpoint",
  "rescue",
  "landed",
  "escaped",
  "cleared",
];

function num(v: unknown) {
  return typeof v === "number" && Number.isFinite(v);
}
function int(v: unknown) {
  return typeof v === "number" && Number.isInteger(v);
}

export function validDoc(d: unknown): d is GameDocument {
  if (!d || typeof d !== "object") return false;
  const v = d as GameDocument;
  const fishIds = fishCatalog.map((f) => f.id);
  return (
    v.version === 1 &&
    spots.includes(v.spot) &&
    baits.includes(v.bait) &&
    num(v.power) &&
    v.power >= 0.15 &&
    v.power <= 0.95 &&
    num(v.drag) &&
    v.drag >= 0.15 &&
    v.drag <= 0.95 &&
    int(v.seed) &&
    !!v.stock &&
    baits.every((b) => {
      const id = b as BaitId;
      return int(v.stock[id]) && v.stock[id] >= 0;
    }) &&
    !!v.gear &&
    int(v.gear.lineClips) &&
    v.gear.lineClips >= 0 &&
    int(v.gear.spareBaits) &&
    v.gear.spareBaits >= 0 &&
    !!v.stats &&
    [
      "casts",
      "catches",
      "escapes",
      "released",
      "cleanCatches",
    ].every((k) => int(v.stats[k as keyof typeof v.stats]) && v.stats[k as keyof typeof v.stats] >= 0) &&
    Array.isArray(v.claimed) &&
    v.claimed.every((c) => typeof c === "string") &&
    Array.isArray(v.bag) &&
    v.bag.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        fishIds.includes(c.fish) &&
        spots.includes(c.spot) &&
        baits.includes(c.bait) &&
        [c.weight, c.time, c.duration, c.peakTension].every(num) &&
        typeof c.assisted === "boolean",
    ) &&
    !!v.journal &&
    Object.entries(v.journal).every(
      ([id, e]) =>
        fishIds.includes(id as (typeof fishIds)[number]) &&
        e &&
        int(e.count) &&
        e.count > 0 &&
        num(e.best) &&
        num(e.first),
    )
  );
}

export function validSession(s: unknown): s is Session {
  if (!s || typeof s !== "object") return false;
  const v = s as Session;
  return (
    typeof v.id === "string" &&
    phases.includes(v.phase) &&
    spots.includes(v.spot) &&
    baits.includes(v.bait) &&
    (v.fish === null || fishCatalog.some((f) => f.id === v.fish)) &&
    [
      v.clock,
      v.charge,
      v.castPower,
      v.weight,
      v.biteAt,
      v.progress,
      v.tension,
      v.energy,
      v.slackTime,
      v.overload,
      v.peak,
      v.duration,
      v.soak,
      v.awayTotal,
    ].every(num) &&
    typeof v.reeling === "boolean" &&
    typeof v.message === "string" &&
    !!v.rescue &&
    typeof v.rescue.clip === "boolean" &&
    typeof v.rescue.spareBait === "boolean"
  );
}

/** 只校验信封外壳与手记部分，现场单独校验，便于“丢现场、保留手记”。 */
function validEnvelopeShell(v: unknown): v is GameEnvelope {
  if (!v || typeof v !== "object") return false;
  const e = v as GameEnvelope;
  return (
    e.format === 2 &&
    validDoc(e.doc) &&
    (e.session === null || typeof e.session === "object") &&
    int(e.savedAt) &&
    steps.includes(e.step)
  );
}

/** 旧版（v1 纯手记）迁移：只保留资源结果，从全新的空闲一竿开始。 */
function migrateLegacy(raw: unknown): { doc: GameDocument; notice: string } {
  const legacy = raw as Partial<GameDocument>;
  const base = newDocument();
  const doc: GameDocument = {
    ...base,
    ...(legacy as GameDocument),
    gear: legacy.gear ?? base.gear,
    stats: {
      ...base.stats,
      ...(legacy.stats ?? {}),
      cleanCatches:
        legacy.stats?.cleanCatches ?? legacy.stats?.catches ?? 0,
    },
    bag: Array.isArray(legacy.bag)
      ? legacy.bag.map((c) => ({ ...c, assisted: c.assisted ?? false }))
      : [],
  };
  if (!validDoc(doc)) throw new Error("legacy document invalid");
  return {
    doc,
    notice:
      "检测到旧版手记，已按原方式继承图鉴与背包，并从新的一竿开始；进行中的垂钓不做续战。",
  };
}

export interface LoadResult {
  doc: GameDocument;
  session: Session | null;
  notice: string;
  savedStep: SaveStep;
  savedAt: number;
  /** 存档不可读：保留原手记数据不覆盖，本次仅临时游玩且暂停自动保存。 */
  recovery?: true;
  /** 信封读取成功，但其中的现场已损坏被丢弃，只保留手记部分。 */
  droppedSession?: true;
}

export function loadGame(): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return {
      doc: newDocument(),
      session: null,
      notice: "无法读取本地手记，已暂停自动保存，本次可以临时游玩。",
      savedStep: "none",
      savedAt: 0,
      recovery: true,
    };
  }
  if (!raw)
    return {
      doc: newDocument(),
      session: null,
      notice: "",
      savedStep: "none",
      savedAt: 0,
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      doc: newDocument(),
      session: null,
      notice: "无法读取本地手记，已暂停自动保存，本次可以临时游玩。",
      savedStep: "none",
      savedAt: 0,
      recovery: true,
    };
  }
  const value = parsed as { format?: number };
  // 旧版纯手记：迁移后从新竿开始，不尝试恢复现场。
  if (!value || typeof value !== "object" || value.format !== 2) {
    try {
      const { doc, notice } = migrateLegacy(parsed);
      return { doc, session: null, notice, savedStep: "none", savedAt: 0 };
    } catch {
      return {
        doc: newDocument(),
        session: null,
        notice: "本地手记格式或版本无法读取，已保留原手记并开启临时游玩。",
        savedStep: "none",
        savedAt: 0,
        recovery: true,
      };
    }
  }
  if (!validEnvelopeShell(parsed)) {
    return {
      doc: newDocument(),
      session: null,
      notice: "本地手记格式或版本无法读取，已保留原手记并开启临时游玩。",
      savedStep: "none",
      savedAt: 0,
      recovery: true,
    };
  }
  // 信封整体有效，但现场部分单独损坏时丢弃现场、保留手记。
  if (parsed.session && !validSession(parsed.session)) {
    return {
      doc: parsed.doc,
      session: null,
      notice: "上次的垂钓现场无法识别，已保留手记并从新的一竿开始。",
      savedStep: parsed.step,
      savedAt: parsed.savedAt,
      droppedSession: true,
    };
  }
  return {
    doc: parsed.doc,
    session: parsed.session,
    notice: "",
    savedStep: parsed.step,
    savedAt: parsed.savedAt,
  };
}

export interface SaveOutcome {
  ok: boolean;
  step: SaveStep;
  at: number;
}

/**
 * 原子写入完整现场（doc + session 打包为一份 JSON）。
 * 写入失败时旧信封保持不变，调用方必须如实告知玩家保存到了哪一步。
 */
export function saveGame(
  doc: GameDocument,
  session: Session | null,
  step: SaveStep,
): SaveOutcome {
  const at = Date.now();
  const envelope: GameEnvelope = { format: 2, doc, session, savedAt: at, step };
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
    return { ok: true, step, at };
  } catch {
    return { ok: false, step, at };
  }
}

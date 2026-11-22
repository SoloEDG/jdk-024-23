import { useEffect, useReducer, useRef, useState } from "react";
import { idleSession, isBusy } from "../shared/initial";
import { gameReducer } from "./gameReducer";
import { loadGame, saveGame } from "./storage";
import { previewAway, settleAway } from "../features/fishing/lib/away";
import type { SaveStep } from "../shared/types";

export interface SaveInfo {
  ok: boolean;
  step: SaveStep;
  at: number;
}

/** 两次完整现场保存之间的最小间隔（毫秒）。 */
const SAVE_INTERVAL_MS = 1000;

export function useGame() {
  const loaded = useRef<ReturnType<typeof loadGame> | null>(null);
  if (!loaded.current) loaded.current = loadGame();
  const initialLoaded = loaded.current;
  const [state, send] = useReducer(
    gameReducer,
    initialLoaded,
    (initial) => ({
      doc: initial.doc,
      session: initial.session ?? idleSession(),
      notice: initial.notice,
      saveStep: "none" as SaveStep,
    }),
  );
  const readOnly = useRef(initialLoaded.recovery === true);
  const [saved, setSaved] = useState(!readOnly.current);
  const [saveInfo, setSaveInfo] = useState<SaveInfo>(() => ({
    ok: !readOnly.current,
    step: initialLoaded.savedStep,
    at: initialLoaded.savedAt,
  }));

  // 刷新/重开后的首次离开时长：以最后成功落盘的 savedAt 为起点。
  const initialElapsed = (() => {
    const s = initialLoaded.session;
    if (!s || !isBusy(s) || !initialLoaded.savedAt) return null;
    const elapsed = (Date.now() - initialLoaded.savedAt) / 1000;
    return elapsed > 0 ? elapsed : null;
  })();
  const [awayElapsed, setAwayElapsed] = useState<number | null>(
    initialElapsed !== null &&
      previewAway(initialLoaded.session!, initialElapsed).charged > 0
      ? initialElapsed
      : null,
  );
  // 确认弹窗打开期间对抗必须暂停，避免玩家做选择时鱼继续跑。
  const awayOpen = useRef(awayElapsed !== null);

  // 最新状态引用，供页面卸载等时机同步读取，避免闭包拿到旧现场。
  const latest = useRef(state);
  latest.current = state;
  const lastSaveAt = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const hiddenSince = useRef<number | null>(null);
  // 已发生但尚未由玩家确认的离开时长（弹窗打开期间，可跨多次切走累加）。
  const pendingAway = useRef(awayElapsed ?? 0);
  const didInit = useRef(false);

  const persistNow = () => {
    if (readOnly.current) return;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const cur = latest.current;
    const outcome = saveGame(cur.doc, cur.session, cur.saveStep);
    lastSaveAt.current = outcome.at;
    setSaveInfo({ ok: outcome.ok, step: outcome.step, at: outcome.at });
    setSaved(outcome.ok);
  };

  // 状态变化后安排保存：关键步骤立即写，普通检查点节流到每秒最多一次。
  useEffect(() => {
    if (readOnly.current || state.saveStep === "none") return;
    const critical: SaveStep[] = [
      "cast",
      "rescue",
      "landed",
      "escaped",
      "cleared",
    ];
    if (critical.includes(state.saveStep)) {
      persistNow();
      return;
    }
    const wait = Math.max(
      0,
      SAVE_INTERVAL_MS - (Date.now() - lastSaveAt.current),
    );
    if (wait === 0) {
      persistNow();
      return;
    }
    // 尾触发：1 秒窗口结束后写最新现场，输入可先合并，不产生高频写入。
    if (saveTimer.current === null) {
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        persistNow();
      }, wait);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // 刷新恢复：离开只消耗免费额度时静默结算（重置残留长按、累计离开时间）；
  // 产生实际代价或导致脱钩时弹窗，由玩家选择继续、救援或放弃。
  // didInit 防止 StrictMode 双挂载时重复结算同一段离开时长。
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (readOnly.current || initialElapsed === null) return;
    if (previewAway(initialLoaded.session!, initialElapsed).charged <= 0) {
      send({ type: "return", elapsed: initialElapsed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let previous = performance.now();
    let debt = 0;
    let frame = 0;
    const step = (now: number) => {
      if (!document.hidden && !awayOpen.current) {
        debt += Math.min((now - previous) / 1000, 0.15);
        while (debt >= 0.05) {
          send({ type: "tick", dt: 0.05 });
          debt -= 0.05;
        }
      } else debt = 0;
      previous = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    // 离开：只记录时刻并立即落盘当前现场；绝不猜测最后一次松手。
    const onHide = () => {
      if (hiddenSince.current === null) hiddenSince.current = Date.now();
      persistNow();
    };
    // 返回：用真实墙钟时长结算免费暂停之外的代价，再恢复对抗。
    const onShow = () => {
      const since = hiddenSince.current;
      hiddenSince.current = null;
      if (since === null) return;
      const elapsed = (Date.now() - since) / 1000;
      const cur = latest.current;
      if (!isBusy(cur.session) || !(elapsed > 0)) return;
      // 弹窗还没处理完又离开：新段累加到同一笔待结算时长，
      // 不静默结算、不另开弹窗，避免反复切走逃避代价。
      if (awayOpen.current) {
        pendingAway.current += elapsed;
        setAwayElapsed(pendingAway.current);
        return;
      }
      // 没有超出免费额度：直接静默结算，不打断玩家。
      if (previewAway(cur.session, elapsed).charged <= 0) {
        send({ type: "return", elapsed });
        return;
      }
      pendingAway.current = elapsed;
      awayOpen.current = true;
      setAwayElapsed(elapsed);
    };
    // 关页/刷新前最后一次同步写入机会。
    // 若确认弹窗还开着，必须先把已经发生的离开时长结算进现场，
    // 否则“确认中再关页”会绕过免费额度与代价。
    const onPageHide = () => {
      const cur = latest.current;
      if (
        awayOpen.current &&
        pendingAway.current > 0 &&
        isBusy(cur.session)
      ) {
        const { session: settled, escaped } = settleAway(
          cur.session,
          pendingAway.current,
        );
        const doc = escaped
          ? {
              ...cur.doc,
              stats: {
                ...cur.doc.stats,
                escapes: cur.doc.stats.escapes + 1,
              },
            }
          : cur.doc;
        saveGame(doc, settled, escaped ? "escaped" : "checkpoint");
        return;
      }
      persistNow();
    };
    const onVisibility = () => {
      if (document.hidden) onHide();
      else onShow();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = (rescue?: "clip" | "bait") => {
    if (pendingAway.current <= 0) return;
    send({ type: "return", elapsed: pendingAway.current, rescue });
    awayOpen.current = false;
    pendingAway.current = 0;
    setAwayElapsed(null);
  };

  return {
    state,
    send,
    saved,
    saveInfo,
    awayElapsed,
    resume,
    persistNow,
    readOnly: readOnly.current,
  };
}

import { Clock, ShieldCheck, PackageOpen, FlagOff, Play } from "lucide-react";
import type { GameDocument, Session, SaveStep } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { previewAway } from "../lib/away";
import { FREE_AWAY_SECONDS } from "../../../shared/types";

const stepLabels: Record<SaveStep, string> = {
  none: "尚无现场存档",
  cast: "抛竿完成后的现场",
  checkpoint: "最近一次每秒检查点",
  rescue: "救援扣料后的现场",
  landed: "上岸结算后的现场",
  escaped: "脱钩结算后的现场",
  cleared: "清空现场后的空闲状态",
};

export function ResumeModal({
  doc,
  session,
  elapsed,
  savedStep,
  savedOk,
  onResume,
  send,
}: {
  doc: GameDocument;
  session: Session;
  elapsed: number;
  savedStep: SaveStep;
  savedOk: boolean;
  onResume: (rescue?: "clip" | "bait") => void;
  send: (c: Command) => void;
}) {
  const p = previewAway(session, elapsed);
  const clipUsable =
    session.phase === "fighting" &&
    !session.rescue.clip &&
    doc.gear.lineClips >= 1;
  const baitUsable =
    ["waiting", "bite", "fighting"].includes(session.phase) &&
    !session.rescue.spareBait &&
    doc.gear.spareBaits >= 1;
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-title"
        className="guide resume-modal"
      >
        <span className="eyebrow">WELCOME BACK</span>
        <h2 id="resume-title">这一竿还在等你。</h2>
        <p className="resume-lead">
          <Clock size={15} />
          本次离开 {Math.round(elapsed)} 秒，同一竿累计离开将满{" "}
          {FREE_AWAY_SECONDS} 秒免费暂停额度，反复短退不会刷新额度。
        </p>
        <div className="resume-cost">
          <div>
            <span>计入代价的时长</span>
            <strong>{p.charged.toFixed(1)} 秒</strong>
            <small>前 {Math.max(0, FREE_AWAY_SECONDS - session.awayTotal).toFixed(0)} 秒完全暂停</small>
          </div>
          <div>
            <span>浸泡饵剩余效力</span>
            <strong>{Math.round(p.soakAfter * 100)}%</strong>
            <small>
              {p.soakLoss > 0
                ? `下降了 ${Math.round(p.soakLoss * 100)}%`
                : "免费暂停期间不衰减"}
            </small>
          </div>
          <div>
            <span>鱼的体力恢复</span>
            <strong>
              {session.phase === "fighting"
                ? `+${Math.round(p.energyGain * 100)}%`
                : "—"}
            </strong>
            <small>
              {session.phase === "fighting"
                ? "恢复后的对抗会更吃力"
                : "当前阶段不涉及体力"}
            </small>
          </div>
        </div>
        {p.willEscape && (
          <p className="resume-warning">
            浸泡饵已经完全失效，继续后这尾鱼会散去并记为一次脱钩。
          </p>
        )}
        <div className="resume-gear">
          <button
            className="gear-choice"
            disabled={!clipUsable}
            onClick={() => onResume("clip")}
          >
            <ShieldCheck size={16} />
            <span>
              <strong>
                稳线夹救援 <b>×{doc.gear.lineClips}</b>
              </strong>
              <small>
                {session.phase !== "fighting"
                  ? "仅搏鱼阶段可用"
                  : session.rescue.clip
                    ? "本竿已使用过"
                    : doc.gear.lineClips < 1
                      ? "库存不足，无法使用"
                      : "压住张力并清空过载，标记为辅助"}
              </small>
            </span>
          </button>
          <button
            className="gear-choice"
            disabled={!baitUsable}
            onClick={() => onResume("bait")}
          >
            <PackageOpen size={16} />
            <span>
              <strong>
                备用饵救援 <b>×{doc.gear.spareBaits}</b>
              </strong>
              <small>
                {session.rescue.spareBait
                  ? "本竿已使用过"
                  : doc.gear.spareBaits < 1
                    ? "库存不足，无法使用"
                    : "恢复浸泡饵效力并缓和局面，标记为辅助"}
              </small>
            </span>
          </button>
        </div>
        <p className="resume-save-note">
          {savedOk
            ? `已保存：${stepLabels[savedStep]}。恢复以该现场为准，已扣道具与已上岸结果不会重复。`
            : "上一次写入失败，当前仍按内存中的现场继续；请留意顶部保存状态。"}
        </p>
        <div className="resume-actions">
          <button className="primary" onClick={() => onResume()}>
            <Play size={15} />
            不使用道具继续
          </button>
          <button
            className="abandon-btn"
            onClick={() => {
              onResume();
              send({ type: "abandon" });
            }}
          >
            <FlagOff size={15} />
            放弃本竿（已耗鱼饵不返还）
          </button>
        </div>
        <p className="resume-later">
          离开时长已经真实发生，关闭页面也不会免除代价；请在上方选择后再继续。
        </p>
      </section>
    </div>
  );
}

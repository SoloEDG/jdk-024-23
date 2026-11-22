import {
  Fish,
  MousePointer2,
  RotateCcw,
  Anchor,
  ShieldCheck,
  FlagOff,
} from "lucide-react";
import type { Command } from "../../../shared/commands";
import type { GameDocument, Session } from "../../../shared/types";
import { species } from "../../../shared/catalog";

function GearPill({
  label,
  stock,
  used,
  disabled,
  onClick,
  hint,
}: {
  label: string;
  stock: number;
  used: boolean;
  disabled: boolean;
  onClick: () => void;
  hint: string;
}) {
  const cant = used || stock < 1 || disabled;
  return (
    <button
      className={"gear-pill " + (used ? "used" : "")}
      disabled={cant}
      onClick={onClick}
      title={hint}
      aria-label={`${label}（库存 ${stock}）`}
    >
      <ShieldCheck size={14} />
      <span>
        {label} <b>×{stock}</b>
      </span>
      <small>{used ? "本竿已用" : hint}</small>
    </button>
  );
}

export function FishingPanel({
  doc,
  session: s,
  send,
}: {
  doc: GameDocument;
  session: Session;
  send: (c: Command) => void;
}) {
  const finish = s.phase === "landed" || s.phase === "escaped";
  const fighting = s.phase === "fighting";
  const canRescue = ["waiting", "bite", "fighting"].includes(s.phase);
  const assisted = s.rescue.clip || s.rescue.spareBait;
  return (
    <div className="fishing-controls">
      <div className="live-status" role="status">
        <span className={"status-dot " + s.phase} />
        <span>{s.message}</span>
      </div>
      {fighting && (
        <div className="fight-meters">
          <label>
            鱼线张力 <strong>{Math.round(s.tension * 100)}%</strong>
            <meter
              aria-label="鱼线张力"
              min="0"
              max="1"
              low={0.25}
              high={0.8}
              optimum={0.55}
              value={s.tension}
            />
          </label>
          <label>
            距离上岸 <strong>{Math.round(s.progress * 100)}%</strong>
            <progress aria-label="收线进度" max="1" value={s.progress} />
          </label>
          <small>
            鱼的体力 {Math.round(s.energy * 100)}% · 松线{" "}
            {s.slackTime.toFixed(1)} / 5 秒
          </small>
        </div>
      )}
      {canRescue && (
        <div className="away-strip" aria-label="续战状态">
          <span>
            浸泡饵效力 <b>{Math.round(s.soak * 100)}%</b>
          </span>
          <span>
            本竿累计离开 <b>{Math.round(s.awayTotal)}s</b> / 免费暂停 60s
          </span>
          {assisted && <em className="assisted-tag">已使用辅助救援</em>}
        </div>
      )}
      {canRescue && (
        <div className="rescue-row">
          <GearPill
            label="稳线夹"
            stock={doc.gear.lineClips}
            used={s.rescue.clip}
            disabled={s.phase !== "fighting"}
            hint={s.phase === "fighting" ? "压住张力、清空过载" : "仅搏鱼阶段可用"}
            onClick={() => send({ type: "rescue-clip" })}
          />
          <GearPill
            label="备用饵"
            stock={doc.gear.spareBaits}
            used={s.rescue.spareBait}
            disabled={false}
            hint="恢复浸泡饵效力并缓和局面"
            onClick={() => send({ type: "rescue-bait" })}
          />
          <button
            className="abandon-btn"
            onClick={() => send({ type: "abandon" })}
            title="放弃本竿，已消耗的鱼饵与道具不返还"
          >
            <FlagOff size={14} />
            放弃本竿
          </button>
        </div>
      )}
      <div className="action-row">
        <span className="control-tip">
          <MousePointer2 size={15} />
          {s.phase === "ready"
            ? "点击蓄力，再次点击抛竿"
            : s.phase === "charging"
              ? `抛竿力度 ${Math.round(s.charge * 100)}%`
              : s.phase === "fighting"
                ? "按住收线 · 松开缓解张力"
                : "享受这一刻的宁静"}
        </span>
        {s.phase === "ready" && (
          <button
            className="primary"
            disabled={!doc.stock[doc.bait]}
            onClick={() => send({ type: "charge-start" })}
          >
            <Anchor size={17} />
            开始抛竿
          </button>
        )}
        {s.phase === "charging" && (
          <button className="primary" onClick={() => send({ type: "cast" })}>
            抛竿 · {Math.round(s.charge * 100)}%
          </button>
        )}
        {s.phase === "waiting" && (
          <button className="primary" disabled>
            等待咬钩…
          </button>
        )}
        {s.phase === "bite" && (
          <button
            className="primary bite-button"
            onClick={() => send({ type: "strike" })}
          >
            <Fish size={17} />
            提竿！
          </button>
        )}
        {fighting && (
          <button
            className={"primary reel-button " + (s.reeling ? "held" : "")}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              send({ type: "reel", held: true });
            }}
            onPointerUp={() => send({ type: "reel", held: false })}
            onPointerCancel={() => send({ type: "reel", held: false })}
            onLostPointerCapture={() => send({ type: "reel", held: false })}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                send({ type: "reel", held: true });
              }
            }}
            onKeyUp={() => send({ type: "reel", held: false })}
            onBlur={() => send({ type: "reel", held: false })}
          >
            按住收线
          </button>
        )}
        {finish && (
          <button className="primary" onClick={() => send({ type: "next" })}>
            <RotateCcw size={16} />
            再抛一竿
          </button>
        )}
      </div>
      {s.phase === "charging" && (
        <progress className="charge-bar" max="1" value={s.charge} />
      )}{" "}
      {s.phase === "landed" && s.fish && (
        <div className="catch-toast">
          <Fish />
          <span>
            新收获{" "}
            <strong>
              {species(s.fish).name} · {s.weight.toFixed(2)} kg
            </strong>
            {assisted && <em className="assisted-tag">辅助捕获</em>}
          </span>
          <small>
            {assisted
              ? "已放入背包并标记辅助，不计入标准无救援挑战"
              : "已放入背包，图鉴同步记录"}
          </small>
        </div>
      )}
    </div>
  );
}

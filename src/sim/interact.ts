/**
 * Interaction runner: builds prompt candidates (interactable uses + the sitter's generic Undo + built-in
 * grab/drop/clean/tidy), runs hold / minigame / instant progress, alerts and minigame lifecycle.
 */
import type { Spot, SpotId, Vec3 } from '../shared/contracts';
import { CLEAN_TIME } from '../shared/propDefs';
import { CFG } from '../config';
import { distXZ, facingDot } from '../core/math';
import type { Mess } from '../core/types';
import type { Sim, SimChar } from './sim';
import type { InteractableDef, Use } from './interactables/types';
import { allInteractables } from './interactables/registry';
import { CLEAN_LABEL, PROP_NAME } from './labels';
import { BOT_DIFF } from './bots/difficulty';

// every interactable file self-registers on import
import.meta.glob('./interactables/*.ts', { eager: true });

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Cand {
  key: string;
  pkey: string;          // progress key
  label: string;
  ok: boolean;
  use: Use<any>;
  s: any;
  def: InteractableDef<any> | null;
  anchor: Vec3;
  range: number;
  dist: number;
  score: number;
  spot: Spot | null;
}

type UndoHooks = { onUndo?(ctx: unknown, s: unknown, ch: unknown): void };

export class Interactions {
  readonly entries: { def: InteractableDef<any>; s: any }[] = [];
  readonly progress = new Map<string, number>();
  readonly active = new Map<string, Cand>();
  private autoAlerts = new Set<string>();
  /** the interactable whose code is running right now (disaster spot + credit) */
  private current: InteractableDef<any> | null = null;
  /** cats that added progress to an interactable since its last completion, and the set at that completion */
  private workers = new Map<string, Set<string>>();
  private lastWorkers = new Map<string, Set<string>>();

  constructor(private sim: Sim) {
    for (const def of allInteractables()) this.entries.push({ def, s: def.state?.() ?? {} });
  }

  private run<T>(def: InteractableDef<any> | null, fn: () => T): T {
    const prev = this.current;
    this.current = def;
    try { return fn(); } finally { this.current = prev; }
  }

  currentSpot(): SpotId | null { return this.current?.spot ?? null; }

  /** who gets credit for a permanent landing from the running interactable's code */
  credit(): string[] {
    const id = this.current?.id;
    if (!id) return [];
    const live = this.workers.get(id);
    return [...(live?.size ? live : this.lastWorkers.get(id) ?? [])];
  }

  roundStart() {
    for (const e of this.entries) this.run(e.def, () => e.def.onRoundStart?.(this.sim.ctx, e.s));
  }

  messCleaned(m: Mess, by: SimChar) {
    for (const e of this.entries) this.run(e.def, () => e.def.onMessCleaned?.(this.sim.ctx, e.s, m, by.s));
  }

  /** a character can start/continue interactions */
  canAct(c: SimChar) {
    const st = c.s.st;
    return this.sim.phase === 'playing' && !c.s.forced && !st.stunned && !st.eating && !st.hairball && !st.dizzy && !st.slip && !st.tossed;
  }

  private sitBlocker(c: SimChar, anchor: Vec3): string | null {
    if (c.s.role !== 'sitter') return null;
    const R = CFG.interact.sitBlockRange;
    for (const o of this.sim.chars) {
      if (o.s.role !== 'cat' || !o.s.loaf || o.s.forced || distXZ(o.s.p, anchor) >= R || Math.abs(o.s.p[1] - anchor[1]) >= 0.8) continue;
      if (o.noBlock.some((b) => distXZ(b.p, anchor) < R + 0.3)) continue; // grabbed off this spot recently
      return "Someone's sitting on it";
    }
    return null;
  }

  private push(out: Cand[], c: SimChar, key: string, pkey: string, use: Use<any>, s: any, def: InteractableDef<any> | null,
    anchor: Vec3, range: number, spot: Spot | null, ignoreRange: boolean) {
    const p = c.s.p;
    const dy = Math.abs(anchor[1] - p[1]);
    const d = distXZ(p, anchor);
    if (!ignoreRange && (d > range || dy > 1.3)) return;
    const chk = use.check ? use.check(this.sim.ctx, s, c.s) : true;
    if (chk === false) return;
    let ok = chk === true;
    let label = !ok ? String(chk) : typeof use.label === 'function' ? use.label(this.sim.ctx, s, c.s) : use.label;
    const blocked = ok && !key.startsWith('grab:') ? this.sitBlocker(c, anchor) : null;
    if (blocked) { ok = false; label = blocked; }
    const face = d < 0.25 ? 1 : facingDot(c.s.yaw, p, anchor);
    const score = d * (1.4 - 0.4 * face) - (use.priority ?? 0) * 0.6 - (ok ? 0.25 : 0);
    out.push({ key, pkey, label, ok, use, s, def, anchor, range, dist: d, score, spot });
  }

  /** highest progress of a cat use (shared bar, or the best cat on a per-cat bar) */
  private useProgress(key: string): number {
    let m = 0;
    for (const [k, v] of this.progress) if (k === key || k.startsWith(`${key}@`)) m = Math.max(m, v);
    return m;
  }

  /** M6: the sitter's generic Undo for a cat use with an `undo` label */
  private undoUse(c: SimChar, def: InteractableDef<any>, s: any, use: Use<any>, catKey: string): Use<any> | null {
    const p = this.useProgress(catKey);
    if (p < 0.05 || p > 0.999) return null;
    for (const k of this.active.values()) if (k.key === catKey) return null; // a cat is on it
    const sim = this.sim;
    return {
      role: 'sitter', mode: 'hold', time: sim.sc.undo, label: use.undo!, anim: 'interact', workSpeed: false, range: use.range,
      onComplete: (ctx, st, ch) => {
        for (const k of [...this.progress.keys()]) if (k === catKey || k.startsWith(`${catKey}@`)) this.progress.set(k, 0);
        const a = use.at?.(ctx, st, ch) ?? (def.spot ? sim.spot(def.spot).pos : ch.p);
        sim.fx('poof', a);
        sim.sound('pop', a);
        sim.stat(c.s.id, 'undos', 1);
        const hooks = use as Use<any> & UndoHooks;
        if (hooks.onUndo) hooks.onUndo(ctx, st, ch);
        else use.onProgress?.(ctx, st, ch, 0);
      },
    };
  }

  candidates(c: SimChar, ignoreRange = false, builtins = true): Cand[] {
    const out: Cand[] = [];
    const sim = this.sim;
    const role = c.s.role;
    for (const { def, s } of this.entries) {
      const spot = def.spot ? sim.level.spots.find((x) => x.id === def.spot) ?? null : null;
      def.uses.forEach((use, i) => {
        const key = `i:${def.id}:${i}`;
        if (use.role !== role) {
          if (role !== 'sitter' || !use.undo) return;
          const undo = this.undoUse(c, def, s, use, key);
          const anchor = undo && (use.at ? use.at(sim.ctx, s, c.s) : spot?.pos ?? null);
          if (undo && anchor) this.push(out, c, `u:${def.id}:${i}`, `u:${def.id}:${i}`, undo, s, def, anchor, use.range ?? spot?.radius ?? CFG.interact.range, spot, ignoreRange);
          return;
        }
        const anchor = use.at ? use.at(sim.ctx, s, c.s) : spot?.pos ?? null;
        if (!anchor) return;
        this.push(out, c, key, use.shared ? key : `${key}@${c.s.id}`, use, s, def, anchor, use.range ?? spot?.radius ?? CFG.interact.range, spot, ignoreRange);
      });
    }
    if (!builtins || role !== 'sitter') return out;

    if (c.s.holding) {
      const held = sim.byId.get(c.s.holding);
      const use: Use<any> = { role, mode: 'instant', label: `Put ${held?.s.name ?? 'the cat'} down`, priority: -2, onComplete: () => sim.releaseHeld(c.s) };
      this.push(out, c, 'drop', 'drop', use, null, null, c.s.p, 9, null, true);
      return out;
    }
    for (const o of sim.chars) {
      if (o.s.role !== 'cat' || o.s.grabbedBy || o.s.st.caged || o.s.st.fight) continue;
      const d = distXZ(c.s.p, o.s.p);
      if (d > CFG.grab.range || Math.abs(o.s.p[1] - c.s.p[1]) > 1.4) continue;
      // cone against the camera look direction (players aim with the camera), fallback body yaw
      const ly = Math.atan2(c.s.look[0], c.s.look[2]);
      const half = Math.cos(((CFG.grab.coneDeg / 2) * Math.PI) / 180);
      if (d > 0.5 && facingDot(ly, c.s.p, o.s.p) < half && facingDot(c.s.yaw, c.s.p, o.s.p) < half) continue;
      const immune = (o.s.st.grabImmune ?? 0) > 0;
      const use: Use<any> = {
        role, mode: 'instant', priority: 3, label: `Grab ${o.s.name}`,
        check: () => (immune ? 'Too slippery' : true),
        onComplete: () => sim.grab(c, o),
      };
      this.push(out, c, `grab:${o.s.id}`, `grab:${o.s.id}`, use, null, null, o.s.p, CFG.grab.range + 0.2, null, ignoreRange);
    }
    for (const m of sim.mess.values()) {
      const use: Use<any> = {
        role, mode: 'hold', time: CLEAN_TIME[m.kind], label: CLEAN_LABEL[m.kind], anim: m.kind === 'poop' ? 'scoop' : 'clean',
        face: m.kind === 'poop' ? 'gag' : undefined, workSpeed: false,
        onComplete: () => sim.cleanMess(m.id, c),
      };
      this.push(out, c, `clean:${m.id}`, `clean:${m.id}`, use, null, null, m.p, CFG.interact.cleanRange, null, ignoreRange);
    }
    for (const pr of sim.props.values()) {
      if (!pr.fallen || pr.special) continue;
      const use: Use<any> = {
        role, mode: 'hold', time: CFG.props.tidyTime, label: `Put the ${PROP_NAME[pr.kind]} back`, anim: 'clean', workSpeed: false,
        onComplete: () => sim.tidyProp(pr.id, c),
      };
      this.push(out, c, `tidy:${pr.id}`, `tidy:${pr.id}`, use, null, null, pr.p, CFG.interact.cleanRange, null, ignoreRange);
    }
    return out;
  }

  best(c: SimChar): Cand | null {
    if (!this.canAct(c)) return null;
    let best: Cand | null = null;
    for (const k of this.candidates(c)) if (!best || k.score < best.score) best = k;
    return best;
  }

  private find(c: SimChar, key: string): Cand | null {
    return this.candidates(c).find((k) => k.key === key) ?? null;
  }

  /** work speed: cat buffs, or the panicking sitter's clean / tidy / undo (M7) */
  workMul(c: SimChar, use: Use<any>, key = ''): number {
    if (c.s.role === 'sitter') return c.s.st.panic && /^(clean|tidy|u):/.test(key) ? CFG.panic.mul : 1;
    if (use.workSpeed === false) return 1;
    const st = c.s.st, b = CFG.buffs;
    let m = 1;
    if (st.fed) m *= b.fedWork;
    if (st.catnip) m *= b.catnipWork;
    if (st.focused) m *= b.focusedWork;
    if (this.sim.isDark()) m *= CFG.blackout.catWorkMul;
    return m;
  }

  /** M1: disaster work (cat uses that alert the sitter or can be undone) takes longer with more cats.
   *  ADDENDUM 3.3: cat bots work slower on easier difficulties. */
  private scaleMul(c: SimChar, use: Use<any>) {
    if (c.s.role !== 'cat') return 1;
    const bot = c.brain ? 1 / (BOT_DIFF[this.sim.cfg.botDifficulty]?.work ?? 1) : 1;
    return (use.alert || use.undo ? 1 / this.sim.sc.work : 1) * bot;
  }

  start(c: SimChar, key: string): boolean {
    const cur = this.active.get(c.s.id);
    if (cur?.key === key) return true;
    if (cur) this.stop(c, false);
    if (!this.canAct(c)) return false;
    const k = this.find(c, key);
    if (!k || !k.ok) return false;
    const sim = this.sim, ctx = sim.ctx;
    if (k.use.mode === 'instant') {
      this.run(k.def, () => { k.use.onStart?.(ctx, k.s, c.s); k.use.onComplete(ctx, k.s, c.s); });
      return true;
    }
    this.active.set(c.s.id, k);
    const yaw = k.spot && !k.use.at ? k.spot.facing : Math.atan2(k.anchor[0] - c.s.p[0], k.anchor[2] - c.s.p[2]);
    c.s.work = { key, label: k.label, progress: this.progress.get(k.pkey) ?? 0, mode: k.use.mode, anim: k.use.anim, face: k.use.face, yaw };
    this.run(k.def, () => k.use.onStart?.(ctx, k.s, c.s));
    if (k.use.mode === 'minigame' && !c.s.bot && k.use.minigame) {
      sim.emit({ e: 'mgOpen', key, kind: k.use.minigame, data: k.use.minigameData?.(ctx, k.s, c.s) }, c.s.id);
    }
    return true;
  }

  stop(c: SimChar, completed: boolean) {
    const k = this.active.get(c.s.id);
    if (!k) return;
    this.active.delete(c.s.id);
    c.s.work = null;
    if (!completed && k.use.keepProgress === false) this.progress.set(k.pkey, 0);
    if (k.use.mode === 'minigame' && !c.s.bot) this.sim.emit({ e: 'mgClose', key: k.key }, c.s.id);
    this.run(k.def, () => k.use.onStop?.(this.sim.ctx, k.s, c.s, completed));
  }

  stopAll() {
    for (const id of [...this.active.keys()]) {
      const c = this.sim.byId.get(id);
      if (c) this.stop(c, false);
    }
  }

  /** minigame progress from a player */
  mg(c: SimChar, key: string, delta: number) {
    const k = this.active.get(c.s.id);
    if (!k || k.key !== key || k.use.mode !== 'minigame') return;
    this.add(c, k, Math.max(0, Math.min(0.25, delta)) * this.workMul(c, k.use, k.key) * this.scaleMul(c, k.use));
  }

  private add(c: SimChar, k: Cand, d: number) {
    if (k.def && c.s.role === 'cat' && d > 0) {
      const w = this.workers.get(k.def.id) ?? new Set<string>();
      this.workers.set(k.def.id, w.add(c.s.id));
    }
    const p = Math.min(1, (this.progress.get(k.pkey) ?? 0) + d);
    this.progress.set(k.pkey, p);
    this.run(k.def, () => k.use.onProgress?.(this.sim.ctx, k.s, c.s, p));
    if (p >= 1) this.complete(k, c);
  }

  private complete(k: Cand, c: SimChar) {
    this.progress.set(k.pkey, 0);
    if (k.def && k.use.role === 'cat') {
      this.lastWorkers.set(k.def.id, new Set([...(this.workers.get(k.def.id) ?? []), c.s.id]));
      this.workers.delete(k.def.id);
    }
    // everyone sharing this bar finishes together
    for (const [id, other] of [...this.active]) {
      if (other.pkey !== k.pkey) continue;
      const oc = this.sim.byId.get(id);
      if (oc) this.stop(oc, true);
    }
    this.run(k.def, () => k.use.onComplete(this.sim.ctx, k.s, c.s));
  }

  tick(dt: number) {
    const sim = this.sim;
    const alerts = new Set<string>();
    for (const [id, k0] of [...this.active]) {
      const c = sim.byId.get(id);
      if (!c) { this.active.delete(id); continue; }
      if (this.active.get(id) !== k0) continue; // completed by a co-worker this tick
      const k = this.canAct(c) ? this.find(c, k0.key) : null;
      if (!k || !k.ok) { this.stop(c, false); continue; }
      k0.anchor = k.anchor;
      if (k.use.mode === 'hold' || (k.use.mode === 'minigame' && c.s.bot)) {
        this.add(c, k0, (dt / Math.max(0.05, k.use.time ?? 1)) * this.workMul(c, k.use, k.key) * this.scaleMul(c, k.use));
      }
      if (c.s.work && this.active.get(id) === k0) c.s.work.progress = this.progress.get(k0.pkey) ?? 0;
      if (k.use.alert && this.active.get(id) === k0) {
        const aid = `w:${k.def?.id ?? k.key}`;
        alerts.add(aid);
        sim.alert(aid, true, typeof k.use.alert === 'string' ? k.use.alert : k.label, k.anchor, this.progress.get(k0.pkey) ?? 0);
      }
    }
    for (const a of this.autoAlerts) if (!alerts.has(a)) sim.alert(a, false);
    this.autoAlerts = alerts;
    for (const e of this.entries) this.run(e.def, () => e.def.tick?.(sim.ctx, e.s, dt));
  }
}

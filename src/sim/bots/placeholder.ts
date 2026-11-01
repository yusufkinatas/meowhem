/**
 * Placeholder brains: a cat that wanders, knocks things off surfaces, pokes at interactables and
 * poops when it has to, and a sitter that strolls around. Real brains register with a higher priority.
 */
import type { Vec3 } from '../../shared/contracts';
import { distXZ, yawTo } from '../../core/math';
import { registerBotBrain, type BotBrain, type BotIntent, type BotWorldView, type BotBrainOpts } from './types';
import { findPath } from './nav';

const MASH_RATE = { kitten: 3, houseCat: 5, feral: 8 };
const CALM = { kitten: 0.7, houseCat: 0.5, feral: 0.3 };

class Walker {
  path: Vec3[] = [];
  i = 0;
  target: Vec3 | null = null;
  stuck = 0;
  lastD = Infinity;
  jumpTick = false;

  go(v: BotWorldView, target: Vec3) {
    this.target = target;
    this.path = findPath(v.nav, v.self.p, target, { role: v.self.role, doorOpen: (id) => v.doorOpen(id) });
    if (!this.path.length) this.path = [target];
    this.i = 0;
    this.stuck = 0;
    this.lastD = Infinity;
  }

  /** returns true when arrived */
  step(v: BotWorldView, dt: number, out: BotIntent, arrive = 0.45): boolean {
    const me = v.self.p;
    if (!this.target) return true;
    let wp = this.path[this.i];
    while (wp && this.i < this.path.length - 1 && distXZ(me, wp) < 0.35 && Math.abs(wp[1] - me[1]) < 0.4) wp = this.path[++this.i];
    if (!wp) return true;
    const last = this.i >= this.path.length - 1;
    const d = distXZ(me, wp);
    if (last && d < arrive && Math.abs(wp[1] - me[1]) < 0.5) return true;
    out.moveTo = wp;
    // jump up onto things
    if (this.jumpTick) this.jumpTick = false;
    else if (wp[1] > me[1] + 0.25 && d < 1.1 && v.self.g) { out.jump = true; this.jumpTick = true; }
    if (d < this.lastD - 0.05) { this.lastD = d; this.stuck = 0; } else this.stuck += dt;
    if (this.stuck > 1.2 && v.self.g && !this.jumpTick) { out.jump = true; this.jumpTick = true; }
    if (this.stuck > 3) { this.target = null; return true; }
    return false;
  }
}

class WanderCat implements BotBrain {
  w = new Walker();
  goal: { kind: 'prop' | 'option' | 'wander' | 'loaf'; key?: string; propId?: number; t: number } | null = null;
  swipeT = 0;
  constructor(private o: BotBrainOpts) {}

  private pickGoal(v: BotWorldView) {
    const me = v.self;
    if (me.poop >= 0.8) {
      const box = v.options.find((x) => x.interactable === 'litterBox' && x.ok);
      if (box) { this.goal = { kind: 'option', key: box.key, t: 14 }; this.w.go(v, box.at); return; }
    }
    // placeholder cats are mostly lazy; difficulty sets how often they get up to something
    if (v.rng() < CALM[v.difficulty]) {
      if (v.rng() < 0.5) { this.goal = { kind: 'loaf', t: 3 + v.rng() * 5 }; this.w.target = null; return; }
      const n = v.nav.nodes[Math.floor(v.rng() * v.nav.nodes.length)];
      if (n) { this.goal = { kind: 'wander', t: 10 }; this.w.go(v, n.pos); return; }
    }
    if (v.rng() < 0.7) {
      const props = v.props.filter((p) => !p.fallen && !p.special && p.home[1] > 0.3);
      const p = props[Math.floor(v.rng() * props.length)];
      if (p) { this.goal = { kind: 'prop', propId: p.id, t: 14 }; this.w.go(v, p.p); return; }
    }
    const opts = v.options.filter((x) => x.ok && x.label !== 'Go right here' && x.interactable !== 'scratchPost');
    const o = opts[Math.floor(v.rng() * opts.length)];
    if (o) { this.goal = { kind: 'option', key: o.key, t: 16 }; this.w.go(v, o.at); }
  }

  think(v: BotWorldView, dt: number): BotIntent {
    const me = v.self;
    const out: BotIntent = {};
    if (me.forced) { out.mash = v.rng() < MASH_RATE[v.difficulty] * dt; return out; }
    if (me.frozen) return out;
    // anywhere goes
    const here = v.options.find((x) => x.label === 'Go right here' && x.ok);
    if (here && !me.work) { out.interact = here.key; return out; }
    if (me.work) {
      if (this.goal?.kind === 'option' && (this.goal.t -= dt) > 0) return out;
      out.interact = null;
    }
    // treats: hard to resist
    const sitter = v.chars.find((c) => c.role === 'sitter');
    if (me.st.treat && sitter && v.rng() < 0.5) { this.goal = { kind: 'wander', t: 4 }; this.w.go(v, sitter.p); }
    if (!this.goal || (this.goal.t -= dt) <= 0) this.pickGoal(v);
    const g = this.goal;
    if (!g) return out;
    if (g.kind === 'loaf') { out.loaf = true; return out; }
    const arrived = this.w.step(v, dt, out, g.kind === 'prop' ? 0.5 : 0.35);
    if (!arrived) { out.sprint = me.stamina > 0.5 && v.rng() < 0.02 ? true : undefined; return out; }
    if (g.kind === 'prop') {
      const p = v.props.find((x) => x.id === g.propId);
      if (!p || p.fallen) { this.goal = null; return out; }
      out.faceYaw = yawTo(me.p, p.p);
      out.moveTo = distXZ(me.p, p.p) > 0.45 ? p.p : null;
      if ((this.swipeT -= dt) <= 0) { out.swipe = true; this.swipeT = 0.6; if (v.rng() < 0.3) out.meow = true; }
    } else if (g.kind === 'option') {
      const o = v.options.find((x) => x.key === g.key);
      if (!o || !o.ok) { this.goal = null; return out; }
      out.interact = o.key;
    } else this.goal = null;
    return out;
  }
}

class StrollSitter implements BotBrain {
  w = new Walker();
  t = 0;
  think(v: BotWorldView, dt: number): BotIntent {
    const out: BotIntent = {};
    if (v.self.frozen) return out;
    if ((this.t -= dt) <= 0 || this.w.step(v, dt, out)) {
      const floor = v.nav.nodes.filter((n) => n.pos[1] < 0.3);
      const n = floor[Math.floor(v.rng() * floor.length)];
      if (n) this.w.go(v, n.pos);
      this.t = 8;
    }
    return out;
  }
}

registerBotBrain('cat', (o) => new WanderCat(o), 0);
registerBotBrain('sitter', () => new StrollSitter(), 0);

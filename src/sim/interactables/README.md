# Interactables

One file per interactable in this folder. Every `*.ts` file here is imported eagerly by
`src/sim/interact.ts` (`import.meta.glob('./interactables/*.ts', { eager: true })`), so adding a
file is all it takes. Never edit a shared list. Everything runs on the **host** only; clients see
the results through the snapshot (world keys, mess, props, statuses) and events (fx, sound, toasts).

Types: `types.ts`. Registration: `defineInteractable()` from `registry.ts`.

## Model

- An `InteractableDef` has an `id`, an anchor `spot` (a `SpotId` from the level), optional per-round
  `state()`, and a list of `uses`. Each use belongs to one role (`cat` or `sitter`).
- The prompt a player sees (`[E] Scratch the sofa`) is the best in-range use (distance, facing,
  `priority`). Built-ins compete with yours: grab (priority 3), put down, clean mess, tidy props.
- `check()` returns `true` (available), `false` (hidden) or a string (shown greyed out with that
  reason, e.g. `'The box is full'`).
- Modes:
  - `hold`: progress += dt / `time` x work multiplier while E is held and the char stays in range.
  - `minigame`: the player gets `minigame` opened (DOM overlay, pointer unlocked); its
    `host.progress(delta)` calls feed the bar (x work multiplier). Bots progress at 1 / `time` per
    second. Esc / moving away stops it.
  - `instant`: `onComplete` runs on the E press.
- Progress is **kept** when interrupted (set `keepProgress: false` to reset). `shared: true` makes
  every worker add into one bar; all of them complete together.
- Work speed multipliers (cats): fed x1.25, catnip x1.25, focused x1.15, dark x1.15. Disable with
  `workSpeed: false`.
- Interrupted automatically when the char is grabbed, caged, hypnotized, fighting, stunned, eating,
  hacking a hairball, dizzy, or leaves the range (`range`, default `spot.radius`, and 1.3 m height).
- `alert: true | 'Label'` puts a sitter HUD alert (room name, direction arrow, pulsing marker through
  walls) up while anyone works on it. For ongoing hazards (flood, delivery) call `ctx.alert(id, on)`.
- **Sit on it**: a loafing cat (F) within 0.55 m of a sitter use's anchor blocks it
  ("Mochi is sitting on it") until the cat is moved.
- `at(ctx, s, ch)` replaces the spot with a dynamic anchor (a dropped salmon prop, or `ch.p` for
  "anywhere"). Return `null` to hide the use.

## SimContext (what `ctx` gives you)

| Area | API |
|---|---|
| time | `time`, `timeLeft`, `rng()` |
| level | `level`, `spot(id)`, `roomAt(p)`, `roomName(room)` |
| chars | `chars(role?)`, `char(id)`, `give(ch, status, sec)`, `clear(ch, status)`, `teleport(ch, p, yaw?)`, `cancelWork(ch)`, `workMul(ch)`, `sitterSees(ch)`, `lineOfSight(a, b)`, `stat(id, key, n)` |
| carried items | `setItem(ch, kind \| null)`, `dropItem(ch)` (spawns it as a prop; done automatically when grabbed, sprayed or in a fight) |
| cats | `cage(cat, sec)`, `uncage(cat)`, `hypnotize(cat, sec, lookAt)`, `releaseHeld(sitter)` |
| mess + meter | `addMess(kind, p, { by, scale, mul, yaw })` (snaps to the surface below, rug x2 for hairballs), `removeMess(id)`, `messes()`, `addPermanent(points, label, by?)`, `setPenalty(key, points)` |
| world | `setWorld(key, value)`, `world(key)`, `isDark()`, `setDoor(id, open)`, `doorOpen(id)` |
| props | `spawnProp(kind, p, rotY?)` (p = resting contact point), `removeProp(id)`, `props(kind?)`, `moveProp(id, p, rotY?)` |
| feedback | `fx(kind, p, opts)`, `sound(name, p?, opts)`, `loop(id, name, on, p?)`, `toast(text, to?, tone?)`, `popup(text, to?, color?)`, `text(text, p, color?)`, `alert(id, on, label?, p?)` |
| progress | `progress(key)`, `setProgress(key, v)` (keys: `i:<id>:<useIndex>`, plus `@<charId>` when not shared) |

Characters (`Char`) are plain state objects (`p`, `yaw`, `role`, `st` statuses, `poop`, `item`,
`holding`, `grabbedBy`, `ammo`...). Read freely; write through `ctx` where a method exists.
Statuses (`st`): stunned, wet, hypnotized, fed, catnip, zoomies, grabImmune, dizzy, crown, eating,
caged, focused, flehmen, hairball, fight, treat, tired, sleep, limp, gag, smug, panic, stink, hidden.

World visual keys are listed in DESIGN.md section 11. Unknown keys are ignored by the level, so you
can also use them to feed the HUD (e.g. `tv.cd`).

## Full example: bathtub faucet (timers, multi-step state, puddles over time, alerts)

```ts
// src/sim/interactables/tubFaucet.ts
import { defineInteractable } from './registry';

defineInteractable({
  id: 'tubFaucet',
  spot: 'tubFaucet',
  state: () => ({ running: false, water: 0, overflow: 0, puddleT: 0, flooded: false }),
  onRoundStart(ctx) {
    ctx.setWorld('tub.running', false);
    ctx.setWorld('tub.water', 0);
    ctx.setWorld('flood', 0);
  },
  tick(ctx, s, dt) {
    if (!s.running) return;
    s.water = Math.min(1, s.water + dt / 20);           // fills in 20 s
    ctx.setWorld('tub.water', Math.round(s.water * 50) / 50);
    if (s.water < 1) return;
    s.overflow += dt;
    ctx.setWorld('flood', Math.min(1, s.overflow / 20));
    if ((s.puddleT -= dt) <= 0) {                        // a puddle every 4 s
      s.puddleT = 4;
      const sp = ctx.spot('tubFaucet');
      ctx.addMess('puddle', [sp.pos[0] + (ctx.rng() - 0.5) * 3, 0, sp.pos[2] + ctx.rng() * 3]);
    }
    if (s.overflow >= 20 && !s.flooded) {
      s.flooded = true;
      s.running = false;
      ctx.setWorld('tub.running', false);
      ctx.loop('tub', 'waterRun', false);
      ctx.alert('flood', false);
      ctx.addPermanent(15, 'FLOOD');
    }
  },
  uses: [
    {
      role: 'cat', mode: 'minigame', minigame: 'faucet', time: 8, alert: 'Bathtub', anim: 'interact',
      label: 'Turn on the tap',
      check: (ctx, s) => !s.running && !s.flooded,
      onComplete(ctx, s) {
        s.running = true;
        ctx.setWorld('tub.running', true);
        ctx.loop('tub', 'waterRun', true, ctx.spot('tubFaucet').pos);
        ctx.alert('flood', true, 'Tub is running', ctx.spot('tubFaucet').pos);
      },
    },
    {
      role: 'sitter', mode: 'hold', time: 1.5, anim: 'interact', label: 'Turn off the tap',
      check: (ctx, s) => s.running,
      onComplete(ctx, s) {
        s.running = false;
        ctx.setWorld('tub.running', false);
        ctx.loop('tub', 'waterRun', false);
        ctx.alert('flood', false);
      },
    },
  ],
});
```

Other patterns, all supported by the API:

- **Carried item** (salmon): cat use `onComplete` -> `ctx.removeProp(id); ctx.setItem(ch, 'salmon')`.
  The sim drops it as a prop when the cat is grabbed / sprayed / fights. A sitter use with
  `at: (ctx) => droppedSalmon?.p ?? null` puts it back with `ctx.moveProp(id, spot.pos)`.
  The `hideout` use checks `ch.item === 'salmon'`, then `ctx.setItem(ch, null)` + `addPermanent(10, ...)`.
- **Delivery**: laptop `onComplete` sets `s.deliveryT = 15`; `tick` counts down, then
  `ctx.sound('doorbell')`, `ctx.spawnProp('package', frontDoorPos)`, `ctx.alert('delivery', true, ...)`.
- **Repeatable with cooldown** (pillow): store `s.readyAt = ctx.time + 45` and
  `check: (ctx, s) => ctx.time >= s.readyAt || 'Still warm'`.
- **Restoring on clean** (fish): `onMessCleaned(ctx, s, mess)` -> if `mess.kind === 'fish'` refill the tank.
- **Bored cat slides out** (hideout): in `tick`, track time per cat near the spot and
  `ctx.teleport(ch, outsidePos)` after 6 s.

Samples in this folder: `litterBox.ts` (poop / poop anywhere / scoop, penalty), `sofa.ts` (shared
3-stage hold), `sink.ts`, `carrier.ts` (jail / unlatch), `fuseBox.ts` (blackout / reset), `tv.ts`
(Cat TV / sit on the remote), `plant.ts` (dig, reset on clean), `doors.ts` (three doors from one file).

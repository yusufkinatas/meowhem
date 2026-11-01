# MEOWHEM brainstorm: party-game + systems lens

Goal: the game is a blast for people who don't care about cats. Slapstick physics, faces that do a lot, clip moments, friends trolling friends, feedback you can read from across the room. Cat-owner jokes stay a quiet second layer.

Cost scale: **S** ≈ half a day for one agent, **M** ≈ 1-2 days, **L** ≈ 3+ days.
Model tags (the user's rule: no hand-built object geometry, ever):
- `none`: behavior, animation, FX or UI only.
- `v1`: object already in the v1 level/prop list.
- `raw: <name> (<pack>)`: already downloaded in `assets-raw/`, needs conversion + manifest entry.
- `source`: needs a CC0/CC-BY GLB found online. **If no model fits the art family, cut the idea. Do not build it in code.**

---

## 0. TL;DR (priority order)

1. **4 cats currently win in ~1:00-1:30.** Clutter is too cheap and scales linearly with cat count. Add the per-cat-count scaling table (§2.5). Biggest single fix.
2. **Grab is too weak** (14 mashes ≈ 1.6 s, the carrier only works if you grab in the kitchen). Alternating A/D, 20 presses, add **Toss**. Then spray → grab → toss/cage becomes the sitter's real combo.
3. **Progress-kept with no counter** means a lone cat always finishes every disaster by retrying. Give the sitter a **Reset** verb (hold E 1.5 s on a half-done disaster).
4. Too many mash QTEs (grab, carrier, TV, fight). Give each a different verb: wiggle rhythm, headbutt, look away, tug of war.
5. The sitter is a **wrangler and a cover-up artist**, not a janitor: Toss, HEY!, cucumber, bath dunk, towel burrito, sweep it under the rug, bodge jobs.
6. Onboarding = spawn placement + 2-word world prompts + a Goose-style to-do list. No text walls.
7. Minigames play in **3D close-up on the real downloaded model** with a thin keycap overlay, never full-screen 2D drawings.
8. End show = freeze-frame, cat-height owner reveal, the **Damage Receipt** and the **fridge of polaroids**.

---

## 1. Funny moments, interactions, visual gags

### Physics slapstick

**1. Slow push.** Tap LMB = gentle nudge (prop slides 3-5 cm). Hold and release = full swipe. A cat can stare at the sitter while inching a glass to the edge, and eye contact turns the fall into a ×2 event. The most famous cat move, readable with zero text, made for clips.
**S** · Fit: in the sim swipe handler, impulse = lerp(nudge, full, holdTime / 0.3 s) on `CFG.props.swipeSpeed`. Eye-contact check already exists. Model: none.

**2. Sitter slip.** A jogging sitter who steps on a puddle, hairball, fish, toy mouse or yarn does a full pratfall: legs up, lands on their back, 1.2 s down. A carried cat gets launched in an arc and lands on its feet with a tiny bounce. Walking never slips, so it punishes panic sprints and teaches itself. Cats will start leaving hairballs in doorways on purpose.
**M** · Fit: sim checks the sitter (jogging, grounded) against the mess list within 0.35 m. Add `'slip'` to `SitterVisualState.anim`. Release the carried cat with an impulse. 4 s slip immunity afterwards. Model: none.

**3. Fight cloud as a wrecking ball.** The hiss-fight dust ball drifts across the floor at ~0.8 m/s and knocks over every prop it rolls into. Random nearby props visibly pop out of it. The sitter can spray it to end the fight (both cats wet). Chaos the players caused but can't steer.
**S-M** · Fit: host moves the cloud center and applies impulses to props within 0.6 m. `fightCloud` FX follows a dummy Object3D. Model: none.

**4. Book dominoes.** Upright books in rows on the bookshelf and office shelf topple in a chain when the first falls. Free Rapier comedy.
**S** · Fit: level prop placement only (`book` prop). Model: v1.

**5. Tablecloth yank.** The dining table has a tablecloth. A cat hangs on a corner (hold E 2 s) and everything on the table slides off at once. Very rarely (perfect timing) everything stays standing and nobody is impressed.
**M** · Fit: new spot `tablecloth`, the sim gives all props on the table one shared horizontal impulse, world key `tablecloth.pulled`. Model: raw: `tableCloth` (Kenney Furniture Kit).

**6. Wet shake-off.** F while wet: the cat shakes violently (droplet ring), ends wet early (5 s → 2 s) but leaves a small puddle and splashes anyone within 1.2 m. A sitter who gets splashed sees droplets on screen for 1 s. A real choice: stay slow, or make mess.
**S** · Fit: procedural high-frequency body yaw in `models/cat.ts`, `splash` FX, `puddle` mess. Model: none.

**7. Carrier hops.** A caged cat headbutting the door makes the carrier hop 4 cm per bump. Given enough rage, the carrier hops out of the kitchen. Rescuers can unlatch it wherever it ended up.
**S-M** · Fit: carrier becomes a special dynamic prop (or world key `carrier.offset`). Model: v1.

**8. Washing machine walkabout.** A cat starts the spin cycle (see new minigame `washer`). The unbalanced machine walks across the bathroom, shoving props and leaking puddles, possibly ending in the doorway where it blocks the sitter.
**M** · Fit: new spot + scripted lerp of the machine mesh, world key `washer.walk` 0..1. Model: raw: `Bathroom_WashingMachine` (Quaternius Ultimate House Interior).

### Cat behavior (funny to anyone, recognized by owners)

**9. Hat cat.** A cat that pounces onto the sitter's head from above (shelf, counter, fridge) sits there up to 3 s. The sitter's screen fills with fur belly and a swishing tail, the sitter flails. Top-tier clip.
**M** · Fit: optional `headAnchor` on `SitterModelApi`, new CatAnim `'perch'`, sitter vision overlay (allowed as an overlay). Balance: perched cat can't act, 20 s cooldown, sitter E shakes it off. Model: none.

**10. Petting trap.** Sitter presses E on a loafing cat without grabbing = pet. Pets 1-2: purr, hearts, the cat gets a small Fed buff. Pet 3: the cat bites, sitter flinches 0.5 s with the shock face, cat bolts. The player cat can bite early with R. Real petting-induced aggression, never captioned.
**S-M** · Fit: interaction branch on the cat entity, `hearts` FX, sitter `stunned` (short). Model: none.

**11. Box magnet.** Cats sitting in the empty delivery box are hidden (no name tag, no alert) and regen stamina ×3. But the sitter can lift the whole box with every cat inside (E 1 s) and carry 1-3 cats at once to the carrier. Greed versus comfort.
**M** · Fit: `package` is already special. Cat state "in box", sitter carry variant. Model: raw: `cardboardBoxOpen` / `cardboardBoxClosed` (Kenney Furniture Kit).

**12. Golden hour.** The sun patch slides across the floor and the light warms over the round: a diegetic clock. At 1:00 left every cat gets **evening zoomies** (ears back, +20% move, 15 s). Cats really are most chaotic at dusk.
**S** · Fit: world key `sun.t` 0..1 drives light direction and sun patch center (make `sunPatches` centers mutable). Buff in sim. Model: none.

**13. The treat bag stops everything.** On a shake, every cat's head snaps to the sitter, mid-jump and mid-fight. The fight cloud pauses and two heads poke out of it.
**S** · Fit: `lookAt` already in `CatVisualState`, pause flag on the fight. Model: none.

**14. Mirror rival.** A cat facing the bathroom mirror within 0.8 m puffs up at its reflection. Hiss twice and you fight yourself (always a draw, both dizzy). Easter egg, no gameplay.
**S** · Fit: facing check against a mirror anchor from the level. Model: v1 / raw: `Bathroom_Mirror1` (Quaternius).

**15. Phone in the toilet.** The sitter's phone sits on the coffee table. Knock it into the toilet or a full tub and the next blackout has no flashlight. Found by accident first, used as a strategy forever after.
**S-M** · Fit: trigger volume sets world key `phone.dunked`, the sim forces `flashlight: false`. Model: v1 (`phone`).

**16. Poop in the shoe.** A desperate cat that poops at the shoe rack poops into the sitter's sneaker. It counts like normal poop but is drawn inside the shoe (only the stink FX gives it away). The end show reveals it.
**S** · Fit: poop event within the `shoes` spot radius sets a flag and parents the mess to the shoe. Model: v1.

**17. Sock hoard.** Socks (carry type `sock` already exists) can be dragged under the bed. Each hoarded sock counts +0.5 while hidden and shows up on the receipt.
**S** · Fit: hideout drop-off + counter. Model: v1.

**18. Liquid cat.** While grabbed, hold Space: the cat stretches to 1.4× length, legs dangling long. Wiggles count 1.5× while liquid, but you can't hiss.
**S** · Fit: procedural spine scale driven by `wiggle` in `models/cat.ts`. Model: none.

**19. Rubber duck.** When the tub fills, a rubber duck floats up. Cats in the bathroom stare at it. Pure flavor that makes the flood disaster look intentional.
**S** · Fit: float on `tub.water`. Model: raw: `ducky` (Tiny Treats Bubbly Bathroom).

### Sitter wrangling (details in §3)

**20. Toss.** LMB while carrying = lob the cat 3-4 m. It twists mid-air, lands on its feet, bounces on beds and sofas. Toss into the bathroom + close the door = instant time-out anywhere.
**S** · Fit: release with impulse, owner obeys host flag, existing `fall`/`land`. Model: none.

**21. Cucumber.** The sitter takes the cucumber from the fridge and places it on the floor. The first cat that comes within 1 m without having it in view does a 1.2 m vertical startle leap (legs splayed, puffed), drops whatever it carries, stunned 1 s. A cat that spots it first can swipe it away. One per house, reusable.
**S-M** · Fit: `cucumber` PropKind already exists, trigger check in sim, new CatAnim `'startle'`. Model: source (not in current packs, and PropKind already needs one).

**22. Bath dunk.** If the tub has water (from the cats' own faucet disaster), the sitter can drop a carried cat in: soaked 15 s (max wet, can't jump onto counters). The cats' disaster becomes the sitter's weapon.
**S** · Fit: reuse `wet`, check `tub.water > 0.3`. Model: v1.

**23. Double carry.** Grab a second cat with the free hand. Both held up like evidence, 0.3 s slow-mo on the second grab, carry speed ×0.75, each cat escapes at half the presses.
**M** · Fit: optional `holdAnchor2` on `SitterModelApi`, grab supports two. Model: none.

**24. HEY!** Sitter R (unused today): a sharp "Hey!" Cats within 5 m and line of sight flinch, ears flat, and any hold/minigame in progress is interrupted (they must press E again). Bots stare at the sitter for a beat, then go right back to it. 6 s cooldown.
**S** · Fit: action message, interrupt flag, `anger` FX. Model: none.

### Social trolling + presentation

**25. Reaction cam.** When a permanent disaster lands, every cat sees a 2 s picture-in-picture of the sitter's face (despair). Cheap, hilarious, everyone screenshots it.
**M** · Fit: client renders a small scissor viewport from a camera at the sitter's head. Faces already exist. Model: none.

**26. Empty spray.** At 0 ammo: click, click, a sad dribble. Nearby cats switch to the smug face.
**S** · Fit: client-side on the spray action, `smug` face. Model: none.

**27. Owner photo requests.** Every ~90 s the owners text "pic?" and the sitter has 20 s to photograph a cat (aim, E). Good photo: −3 mess ("they're reassured"). Cats can turn their back on purpose, which earns a dry text from the owners instead. Every photo goes on the fridge in the end show.
**M** · Fit: sitter-only HUD event, frustum + facing check on cats, render-target capture. Model: none.

**28. Polaroid auto-capture.** The client snaps 4-6 moments during the round (first disaster, eye contact, biggest shatter, double carry, hat cat, slip) from a small director camera near the event. They become the results screen.
**M** · Fit: client-only, triggered by existing reliable fx/popup events, 320×240 render target. Model: none.

**29. Diegetic arrival.** 0:30 headlights sweep the living-room ceiling, 0:10 car door, 0:03 keys jingle and every cat's ears swivel to the door. Bots trot to the door to greet.
**S-M** · Fit: level light cookie + `carArrive`/`door` sounds + `lookAt`. Model: none.

**30. Sweep it under the rug / bodge job.** Sitter cover-ups that are faster than doing it properly and get exposed in the end show (rules in §2.6).
**M** · Fit: rug lump world key, duct-tape decal. Model: none (decal/FX).

---

## 2. Balance review

### 2.1 The mess economy in numbers

Values from DESIGN.md and `src/config.ts`. Level counts are estimates until the level lands, so treat the outputs as direction, not truth.

| Input | Value |
|---|---|
| Permanent pool | 77 (laptop 12, flood 15, TP 8, sofa 12, salmon 10, tank 10, curtains 10) |
| Props | ~70, assume ~35 breakable |
| Avg value of one knocked breakable | ~2.5 (≈70% shatter on hard floor at 3, the rest lie intact at ~1.2) |
| Breakable pool | ~85 points, finite (cleaned shards remove the prop) |
| Cat knock rate | `swipeCooldown` 0.45 s, ~1 prop / 1.5 s along a counter, **~0.8 pts/s per cat** averaged with travel |
| Sitter clean rate | shards 2 s + ~1.5 s travel per 3 pts ≈ **0.85 pts/s at best**. Tidy ≈ 0.3 pts/s. Poop is the best clean (6 pts / ~4 s) |
| Grab carry window | 14 presses at ~9/s ≈ 1.6 s + 0.8 s limp ≈ 2.4 s × 2.7 m/s ≈ **6 m** (5 m with the hiss bonus) |

**vs 4 cats:** 3.2 pts/s produced vs 0.85 cleaned. Every breakable is gone in ~30 s and the meter sits at ~55-65% before a single disaster. With shared progress, laptop takes ~6 s and curtains/TP ~5 s each. **Cats reach 100% around 1:00-1:30.** The sitter has no chance. Grabbing doesn't help: the carrier is only reachable if you grab within ~6 m of the kitchen, and a teammate unlatches in 2.5 s anyway.

**vs 1 cat:** clutter is roughly break-even (0.8 vs 0.85), but the sitter can't clean and guard at once. Because progress is kept forever, a lone cat finishes any disaster by retrying: the sitter's interruption costs it 4-8 s and never sets it back. My read: a competent lone cat wins most 6:00 rounds, and the sitter plays whack-a-mole. Closer to fair than 4 cats, but the sitter has no proactive tools.

### 2.2 Mechanic-by-mechanic verdicts

| Mechanic | Verdict | Change |
|---|---|---|
| Clutter (knocked props, shards) | **Too cheap, scales linearly with n.** The main problem. | Clutter weight multiplier by cat count (§2.5). Cat-side feel stays the same: popups still show "+3", just in scaled units. |
| Grab | **Too weak.** Escape is trivial for a masher, the carrier is out of reach from most rooms. | `escapePresses` 14 → 20 and they must **alternate A/D** (same key twice doesn't count). `limp` 0.8 → 1.0. `carryMul` 0.9 → 1.0, no jogging while carrying. Carry window ≈ 3.5-4 s ≈ 10 m. Add **Toss** so a grab pays off anywhere. |
| Carrier | Decent vs 1 cat, **useless vs 4** (2.5 s unlatch in the busiest room). | Time and unlatch scale with n (§2.5). Max mash cut = 40% of the time-out instead of a flat 8 s. The sitter gets an alert when an unlatch starts. Capacity 2 at 3-4 cats (two cats squished in one carrier is a gag in itself). |
| Spray | Strong but fine: spray hit → guaranteed grab is the sitter's skill expression. Becomes the kill combo once grab is buffed. | `stun` 1.0 → 0.7. Keep `wet` 5 s / ×0.6. Sprayed cats can't loaf for 6 s (they're shaking off). Ammo scales with n. |
| Cat TV | **Annoying, not strategic.** vs humans it's a 1.5 s mash plus a camera yank (feels bad). vs bots, 15 s is OP. Hits everyone in a huge radius. | Only hits cats **facing** the TV (view · dirToTV > 0.3) with LOS within 9 m. Max 8 s. Escape = **look away**: pull the camera off the screen for 1.5 s total, as a tug of war (replaces mash 10). Bots 4/7/10 s by difficulty (Kitten falls longest). Backfire: 3+ hypnotized cats paw at the screen and after 6 s the TV tips over: +6 permanent. Blackout kills the TV (no power), so cats get a counter. |
| Treat bag | Good design (player choice, bots fall for it), but today the grab after it is free for the cat. | Keep. With the grab buff the 1.2 s freeze becomes a real gamble. Cooldown scales with n. |
| Sit on it | **Degenerate loop:** loaf on the litter-box or faucet spot, get grabbed, escape, re-loaf. | A cat grabbed off a spot can't block that spot again for 15 s. Sprayed cats can't loaf for 6 s. |
| Progress kept | Right call (interrupting matters), but there's no counter, so attrition always wins. | Sitter **Reset**: hold E 1.5 s at a disaster with unbanked progress → back to 0, dust poof. Banked stages (sofa) stay. A choice: reset here, or go chase. |
| Salmon + hideout | Near-guaranteed once under the bed (5 s eat, sitter can't reach). | **Cats can't open doors with their mouth full.** A closed bedroom door blocks salmon runs unless a teammate opens it, which turns the salmon into a teamwork play. The sitter can put recovered salmon in the fridge (gone for 60 s). |
| Faucet / flood | Good: a disaster you rarely finish but that pulls the sitter away. | Soft alert when the tub starts running, loud alert on overflow. Pairs nicely with "sit on the faucet". |
| Blackout | Fair, good team play. | Keep. Add the phone-in-toilet combo (#15) and "blackout = TV off". |
| Eye contact ×2 | Great hidden rule. Risky with 4 cats sweeping a counter. | Keep. Cap the bonus at +6 per cat per 10 s. |
| Poop anywhere | Viable strategy (accept −20% speed for 15 s, poop on the bed for 6). Fine because poop is the sitter's most efficient clean. | Keep. Box capacity scales with n. |
| Hairball input | Double-tap R collides with hiss and the fight trigger, and nobody discovers it. | **Hold R 0.6 s** = hairball, tap R = hiss. The prompt appears only when standing on a rug and off cooldown, which hints at the rug ×2 without explaining it. |
| Fights | Consent-based (both must hiss), +2 fur for 4 s is weaker than swiping, so no farming. | Keep. Make the cloud roll (#3). |
| Laptop + delivery | Slowest disaster solo (0.55 pts/s) but gives a team buff. Strong 4-cat opener. | Keep. Covered by the disaster-work multiplier. |

### 2.3 Stalling

- **Cats can't stall.** The clock is the sitter's ally.
- **Sitter guarding** isn't stalling because mess comes from cats, and clutter keeps pressure on. Vs 1 cat, "shadowing" (following the cat everywhere) works only until the cat starts swiping, then the sitter has to stop and clean. That's the 1v1 duel working as intended.
- **Degenerate loops to close:**
  - Sit-on-it chain → fixed above.
  - Hideout loop → keep the 6 s cap, plus a 10 s re-entry cooldown.
  - Carrier camping → capacity 2 and unlatch alerts. Camping protects one jailed cat while three others wreck the house, so it punishes itself.
  - Doors → 2 s hang is fine.
- **Late-round plateau** (both sides passive, meter flat at 70%) is the real boredom risk. Golden hour + evening zoomies + arrival cues + overtime (§2.6) push action into the last minute.

### 2.4 Target curves (what "fair" means)

- Win rate 45-55% at every cat count, equal skill.
- Median meter at half-time: 45-60%.
- At least 35% of rounds decided in the last 60 s (including overtime).
- No cat win before 2:30 on a 6:00 round between equal-skill sides.

### 2.5 Scaling by cat count

Add `CFG.scale[n]`. Every value is a starting point for the bot sim.

| Knob | 1 cat | 2 cats | 3 cats | 4 cats |
|---|---|---|---|---|
| Clutter weight × (all cleanable mess + fallen props) | 1.0 | 0.75 | 0.6 | 0.5 |
| Disaster work × (hold times + minigame units) | 0.85 | 1.0 | 1.15 | 1.3 |
| Carrier time-out | 18 s | 20 s | 22 s | 25 s |
| Carrier unlatch hold | n/a | 3.0 s | 3.5 s | 4.0 s |
| Carrier capacity | 1 | 1 | 2 | 2 |
| Sitter walk / jog (m/s) | 3.0 / 5.2 | 3.0 / 5.2 | 3.1 / 5.4 | 3.2 / 5.5 |
| Spray ammo | 6 | 8 | 10 | 10 |
| Cat TV cooldown | 90 s | 75 s | 65 s | 60 s |
| Treat bag cooldown | 45 s | 40 s | 35 s | 30 s |
| Litter box capacity | 4 | 4 | 5 | 6 |

Cats stay faster than the sitter at every n (zoomies 5.8). With 4 cats the breakable pool drops from ~85 to ~42 meter points, so cats must land disasters to win. Expected effect: 4-cat rounds stop ending before 2:00. Whether they land at 4:00-6:00 is for the sim to show.

**How to validate (S-M):** a dev-only balance log on the host (meter every 5 s, every mess/disaster/grab event, winner, end time). Run bot cats (Feral) vs the bot sitter at 4× time scale, 20 rounds per n, compare against §2.4, tune, then human playtest.

### 2.6 Comeback mechanics

**Cats behind**
- **Evening zoomies** (#12): at 1:00 left, if the meter is < 70%, all cats get +20% move for 15 s. Telegraphed by the golden-hour light.
- **Overtime ("parking")**: if the meter is ≥ 90% at 0:00, the owners take up to 15 s to come up the stairs (footsteps, keys). Overtime ends the moment the meter drops below 90 or hits 100. Diegetic, and the best clutch moment a party game can have.

**Sitter behind**
- **Panic mode**: meter ≥ 80% → clean speed +25%, sweat FX, panic face, tense music. Visible on the sitter, so it reads as a character beat, not a hidden rubber band.

**Sitter cover-ups** (available any time, paid off in the end show)
- **Sweep it under the rug**: in rooms with a rug, stuff a mess under it in 0.6 s. It counts 30% of its weight and the rug grows a visible lump. A cat can dig a lump out in 1 s: the mess pops back at full weight with a small "found" pop. Every hidden item is revealed in the end show.
- **Bodge job**: each permanent disaster can be bodged once (hold 6 s), refunding 40% of its value. The fix stays visible (duct tape on the curtain rod, the sofa turned to hide the shred), and the owners notice it in the end show.

---

## 3. The sitter's fun

**Identity:** the sitter is the lead in a farce, a cat wrangler and a frantic cover-up artist. Cleaning is the fallback, not the job.

### Verbs

| Family | Verbs |
|---|---|
| Wrangle | grab, **toss**, **double carry**, **box carry**, **bath dunk**, **towel burrito** (new minigame), carrier |
| Deny | doors, **HEY!**, **cucumber**, **Reset** a disaster, Cat TV, treats, return to sender, fuse reset, turn off faucet |
| Cover up | clean (with flow chain), **sweep under the rug**, **bodge**, **photo for the owners** |
| Be a person | hop, faces, pet (and get bitten), slip |

### Combos (learned by players, never shown as a list)

1. Treat bag → cat freezes eating → grab → towel burrito.
2. Spray → grab → toss into the bathroom → close the door.
3. Cat TV → two hypnotized cats → double carry.
4. Cucumber next to the salmon → startled cat drops it → salmon into the fridge.
5. Cats flood the tub → bath dunk with their own water.
6. Let the delivery arrive → cats pile into the box → carry the box to the carrier.
7. HEY! during a butt-wiggle charge → the pounce cancels.

### Payoffs and juice

- **Hitstop** 80 ms + camera punch on grab and spray hit. 0.3 s slow-mo on a double grab.
- **Cleaning flow**: consecutive cleans within 2 s chain, each +15% speed up to ×1.6, with a rising "ding" ladder and sparkle. A chain of 5 flashes a brief room sparkle.
- **Area tidy**: E near several intact fallen props tidies all within 1.2 m in one 1 s scoop. Cuts the worst chore.
- Fur and litter clean in 0.6 s instead of 1.0 s.
- The cats' reactions are the sitter's reward: the face pressed against carrier bars, the soaked droopy cat, the burrito glare. All visible to everyone.
- Alerts show each disaster's progress ring and value, so the sitter makes decisions instead of following a route.
- Scoreboard stats that read like trophies: cats wrangled, sprays landed, fights broken up.
- End show: the owners' tip envelope and a review card (§6).
- Optional, only if a CC0 model fits: a **vacuum** (sucks small mess in a cone, cats within 3 m flee puffed, a sock jams it for 2 s). Model: source, nothing in current packs. Cut otherwise.

---

## 4. Onboarding with zero text walls

Rules: every verb has (1) a reason to use it within 10 s, (2) a world prompt at the moment it becomes possible, (3) feedback that obviously pays. Prompts are at most 2 words, to-do items at most 4 words. Keycap glyphs come from a CC0 pack (source: Kenney Input Prompts), not drawn in code.

**Lobby warmup (the real tutorial).** Players spawn in the house while the lobby fills (nothing counts, props reset at start). Ready up by doing a verb: cats **loaf on the doormat** (F), the sitter **takes the spray bottle off the hook** (E). The ready check teaches the first verb.

**Countdown (3 s).** A role card: silhouette plus 3 keycaps with one word each. Cat: LMB Swipe · Space Jump · E Paw. Sitter: LMB Spray · E Grab · Q Treats.

**Cat, first 30 s**
- Spawn on the kitchen counter facing a row of mugs at the edge, with a ghost LMB keycap on the nearest mug. First swipe → shatter → "+3" flies into the meter. Everyone gets their first laugh within ~2 s.
- A Space keycap appears at the landing spot when the cat faces a reachable higher surface.
- **To-do list** (Untitled Goose Game style, handwritten, top-left). Three items visible, more unlock as you enter rooms: "Order something online", "Run a bath", "Dinner", "Unroll the toilet paper", "Take down the curtains", "Go fishing", "Sharpen claws (sofa)". Items cross off with a scribble. An item shimmers while you're in its room.
- Spots invite you: the TP end flutters, the laptop cursor blinks, the fish follow you along the glass, the curtain tassel sways.
- Hold-E prompts are rings that fill. First time grabbed: A and D keycaps rock under the dangling cat.
- Left for players to discover: eye contact, rug ×2 hairballs, phone in the toilet, poop in the shoe, the mirror.

**Sitter, first 30 s**
- Spawn in the hallway facing the owners' sticky note on the door: "Back at 6. Feed them. Not on the counter." One line, no instructions.
- The LMB keycap shows when a cat is within 3.5 m in view. The E keycap shows on a cat in grab range and on mess in clean range.
- The first alert gets a big arrow and the room name for 3 s. Later alerts are small.
- After 20 s without a grab, a soft E keycap floats over the nearest cat in range. Q shows the first time 2+ cats are within 14 m.

**Feedback teaches the score.** Every mess pops its value in the meter's color. Permanent disasters stamp the meter ("+10 CURTAINS"). The meter shows permanent mess as solid and cleanable mess as striped, so the sitter sees what can still be fixed. The Damage Receipt (§6) teaches the whole system in hindsight.

**Returning players.** A "verbs used" bitset in localStorage (try/catch, works without it) hides hints already learned.

---

## 5. Minigames

### Shared rules

- **Presentation:** on open, the camera cuts to a close-up of the spot (`spot.pos` / `spot.facing`). The real downloaded model and the cat's real animation (`type`, `climb`, `knead`...) do the acting. The DOM overlay stays thin: keycaps, one timing element, bottom third of the screen. No full-screen 2D drawings of objects, they'd look as cheap as code-built 3D.
- **Exit:** Esc or any WASD. Progress is kept. Mistakes cost time, never progress.
- **Danger sense:** two cat-ear icons at the top of the overlay turn toward the sitter when they're within 8 m. At 4 m the screen edge pulses. Diegetic and cat-like.
- **Sessions** last at most ~12 s. Long jobs (laptop) take several.
- **Shared progress:** the overlay shows "×2" paws when teammates are working too.
- **Bots:** simulated rate = base × difficulty (Kitten 0.6, House Cat 0.8, Feral 1.0).
- **Accessibility:** timing windows ≥ 150 ms, no color-only cues, every input is keyboard.

### The ten in `contracts.ts`

**laptop** (25 units ≈ 22 s solo, in ~10 s sessions)
- Controls: three beats. (a) Keysmash: any letter keys. The search bar fills with your actual keysmash ("jjjjkk;;;;") and every 6 keys a random product card appears. (b) "Are you human?": a 3×3 picture grid, "select all squares with birds", keys 1-9 then Enter. Picking the cucumber makes the cat flinch and costs 1 s. (c) Checkout: hold Space 1 s and the cat lies down on the keyboard. Order placed.
- Visual: screen texture on the real laptop model. Captcha pictures are thumbnails rendered from our own 3D models at load (`animal-parrot`, `animal-fish`, cucumber, box).
- Why funny: a cat beating a captcha and paying by lying on the keyboard.

**faucet** (~8 s)
- Controls: Space to jump and grab the lever, then A/D in time with the swing (pendulum). Each full swing pushes the lever down a notch: drip, trickle, full blast. Off-beat presses only wobble.
- Visual: the cat dangling from the tap. At full blast the water hits its face: shock face, sneeze, drop.
- Why funny: the cat hates water and does it anyway, then gets splashed.

**tpSpin** (~10 s)
- Controls: tap Space when the paper seam passes under the paw. Good taps speed up the roll and the windows come faster. A mistimed tap tangles the paw for 0.5 s.
- Visual: paper streams down and a pile grows until it buries the cat to the ears. Model: raw: `Bathroom_ToiletPaperPile` (Quaternius), scaled with `tp.unrolled`.
- Why funny: slot-machine acceleration and the burial.

**fishing** (3 fish, ~3-4 s each)
- Controls: A/D slide the paw along the tank rim, Space dips. Dip when a fish's shadow is under the paw.
- Visual: overhead close-up of the tank. A caught fish flips out of the tank in world space and becomes a flopping `fish` mess everyone can see. Duds: the castle ornament, or a snail that sticks to the paw for a second. Model: raw: `animal-fish` (Kenney Cube Pets) or `fish` (Kenney Food Kit).
- Why funny: fish arcing out of the tank, flopping on the floor, the sitter stuffing them back in.

**climb** (~10 s)
- Controls: alternate A/D (left paw, right paw). The same paw twice = slip down with a zipper-scratch sound. Pressing at the sway's extremes gives a bonus.
- Visual: curtain rings pop off one by one as you climb (the progress bar is in the world). At the top the cat sits on the rod, proud, for 1 s. Then the rod creaks and collapses, and the cat wiggles out of a curtain burrito. Model: raw: `Curtains_Single` / `Curtains_Double` (Quaternius).
- Why funny: triumph, then collapse.

**knead** (~8 s, repeatable)
- Controls: beat dots slide toward two paw icons, A for left and D for right on the beat. The tempo follows the purr.
- Visual: a streak raises bliss. Eyes close, purr gets louder, and at an 8-streak a single drool drop falls. A miss snags a claw in the pillowcase.
- Why funny: the cat's face is the score.

**escape**
- Grabbed (~3.5-4 s): alternate A/D and the body swings in 3D. Sync with the swing builds the arc, and at max arc Space twists out (the liquid stretch). Tap R once to hiss (+4). No panel: keycaps hover under the dangling cat, and the sitter sees the same wiggle meter, so both sides feel the tension.
- Caged (scaled time-out): W headbutts the carrier door. Each bump shortens the time (cap 40%) and hops the carrier 4 cm (#7).
- Why funny: a carrier hopping across the kitchen by itself.

**fight** (4 s, both cats)
- Controls: tug of war. Alternating A/D pushes a fur-ball marker toward the opponent. Once per fight, R when a "!" flashes over the opponent stuns their input for 0.4 s.
- Visual: one horizontal bar in both cats' colors. Real nearby props fly out of the cloud. The winner gets a crown for 10 s, the loser is dizzy for 1.5 s.
- Why funny: the cloud, the props flying out, the crown.

**openBox** (~4 s, shared)
- Controls: alternate A/D to drag the claw along the tape. The tape peels in 3D (`scratchMarks`).
- Visual: at 100% the cat dives in headfirst, butt and tail wiggling in the air, pops up with the item... then sits in the box and ignores the item for a beat. Model: raw: `cardboardBoxClosed` → `cardboardBoxOpen` (Kenney Furniture Kit).
- Why funny: butt in the air, and the box wins over the contents.

**birdWatch** (~10 s)
- Controls: red light, green light. Hold S to stalk (butt wiggle) while the bird looks away, release when it turns. If it catches you moving, it flutters off and returns after 1.5 s.
- Visual: jaw chatter (`chatter`) gets more intense as you close in. Success: the cat lunges and bonks into the glass, face squished, slides down. Still counts as a success (Focused buff). Model: raw: `animal-parrot` / `animal-chick` (Kenney Cube Pets).
- Why funny: the bonk.

### Five new minigames

**burrito** (sitter, ~3 s)
- When: carrying a cat at the laundry or towel rail.
- Controls: press the shown arrows in order (←, →, ↓) to fold the towel corners. The cat's wiggle input shuffles the next arrow.
- Result: the cat is a burrito for 10 s. Only its head sticks out, it rolls slowly at 1.5 m/s, and it can't jump, swipe or interact. Then it pops out. Model: raw: `Bathroom_Towel` (Quaternius) / `towel_blue` (Tiny Treats).
- Why funny: an outraged face in a towel, rolling. Vets really do this.

**washer** (cat, ~8 s, +10 permanent)
- Controls: 4 buttons light up in sequence (keys 1-4), then hold Space to sit on the lid while it ramps to spin.
- Result: the machine walks across the bathroom (#8). The sitter turns it off with E (1.5 s), possibly after it has parked in the doorway.
- Why funny: a walking appliance with a cat riding it.

**fridgeRaid** (cat, shared, ~6 s)
- Controls: hang on the handle and swing sideways (A/D pendulum, like the faucet) until the door pops, then A/D + Space knocks items off the shelves.
- Result: 3 food messes. The open door leaks cold fog, and +6 permanent if it stays open for 20 s. The sitter shuts it with a hip bump. Model: raw: KayKit Restaurant fridge with separate `fridge_A_door_top` / `fridge_A_door_bottom`.
- Why funny: a tiny cat swinging a huge door. Also makes "salmon in the fridge" a two-step heist.

**phoneCall** (cat, ~6 s, +5 permanent)
- Controls: unlock the sitter's phone by tracing the 4-step pattern hinted by smudged paw prints (arrow keys).
- Result: the phone rings the owners and the sitter gets an alert. The end show has the owners asking why the cat called. Model: v1 (`phone`).
- Why funny: a cat calling the owners on the sitter.

**mirror** (cat, ~5 s, easter egg)
- Controls: press R on the beat when your reflection hisses.
- Result: always a draw, both dizzy, no effect. Model: raw: `Bathroom_Mirror1` (Quaternius).
- Why funny: zero reward.

Conditional sixth, only if a CC0 robot vacuum model turns up: **roombaRide**. Steer the vacuum with a cat on top and bump into furniture.

---

## 6. The end-of-round show

### Timeline

1. **1:30** golden hour: lower, warmer light, the sun patch slides.
2. **0:30** headlights sweep across the living-room ceiling, a distant car, the tense music layer comes in.
3. **0:10** car door. **0:05** footsteps. **0:03** keys jingle, every cat's ears swivel to the door, bots trot over.
4. **0:00 (or 100%)**: the door opens, 0.5 s slow-mo, then freeze. Everyone is frozen in their exact pose (the sitter mid-slip holding a cat, a cat on top of the fridge). White flash and shutter sound: that frame is the first polaroid.
5. **Owner reveal at cat height:** two pairs of legs and a grocery bag in the doorway. The sitter model recolored, framed from the knees down, so the low camera hides the reuse. Classic cartoon framing.
6. **Walkthrough** (skippable with Space): 3-5 cuts of 1.2 s each, ordered by damage. Each cut frames one disaster (curtains on the floor, empty tank, TP mountain, the shoe) with an owner text bubble, lowercase and short: "the curtains?", "where are the fish", "why is the tub full", "who ordered this".
7. **The greeting:** every cat trots to the owners, tails up, rubs their legs, slow-blinks at the camera.
   - Cats win: the sitter stands in the background holding a hairball, and the owners turn to look at them.
   - Sitter wins: the owners pet the cats and hand the sitter an envelope, while the cats watch from the sofa, unimpressed.
8. **Headline**, short and dry:
   - Cats win: "The owners have questions."
   - Sitter win, by meter: < 25 "Spotless. Suspiciously spotless." · 25-60 "Nobody noticed the plant." · 60-90 "They noticed the plant." · 90-99 "That was close."

### Results board: the fridge door

- **Damage Receipt**: itemized, dotted leaders, totals. It teaches the scoring. Hidden cover-ups are listed last.
  ```
  Curtains ................. 10.0
  Sofa (antique), 3 ........ 12.0
  Hairball (rug) x2 ......... 6.0
  Under the rug, 4 items .... 3.4
  Socks, under bed ......... 3.0
  Scratching post ........... 0.0
  ```
  "Scratching post 0.0" is on every receipt. If anyone ever used it, the line reads "1 use" and the "Good Cat" award appears.
- **Polaroids** under magnets: the auto-captured moments (#28), the sitter's owner photos (#27), and the freeze-frame.
- **Award sticky notes**, 3-4 of the most extreme stats:
  - Cats: Most Wanted (most mess), Repeat Offender (most times caged), Accomplice (most rescues and doors opened), Eye Contact (most ×2 knocks), Professional Napper (most loaf time), Good Cat (least mess, or used the post).
  - Sitter: Grip Strength (most grabs), Aim (spray accuracy as a plain %).
- **Sitter review card**: 1-5 stars plus one dry line picked by meter band (e.g. 5★ "Would book again.", 2★ "The cats seemed happy."). Generic app look, no real brand.
- **Again** button. Option: Most Wanted becomes the next sitter.

### Architecture

- The show runs client-side from the `end` reliable event plus an optional `EndSummary` payload: per-player stats, disasters with timestamps, hidden-mess list (rug lumps, shoe poop, socks), polaroid triggers.
- Costs: freeze + headline S, owner legs M, walkthrough camera M, receipt S, polaroids M, awards S.

---

## 7. Contract additions this implies (all additive)

- `SpotId`: `'tablecloth' | 'washer' | 'fridge' | 'mirror'`. The phone stays a prop.
- `CatAnim`: `'perch' | 'shake' | 'startle' | 'burrito'`.
- `SitterVisualState.anim`: `'slip' | 'toss' | 'photo'`.
- `SitterModelApi`: optional `headAnchor`, optional `holdAnchor2`.
- `MinigameKind`: `'burrito' | 'washer' | 'fridgeRaid' | 'phoneCall' | 'mirror'`.
- World keys: `sun.t`, `tablecloth.pulled`, `phone.dunked`, `washer.walk`, `carrier.offset`, `rug.lumps`, `fridge.open`.
- Optional `EndSummary` type for the end show.
- `CFG.scale[n]` table and the grab / carrier / TV / spray changes from §2.

**Models to source** (cut the idea if no CC0/CC-BY fit is found, never build it in code): cucumber (already required by `PropKind`), keycap glyphs (Kenney Input Prompts), optional vacuum / robot vacuum.

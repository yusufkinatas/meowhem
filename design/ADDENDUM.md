# MEOWHEM v2 ADDENDUM (binding)

This file overrides DESIGN.md wherever they conflict. The two brainstorms in `design/` are background only and are not binding. Anything not mentioned here stays as DESIGN.md v1 says.

## 0. Ground rules for this pass

- **Asset rule (from the user, absolute).** Every object in the 3D world is a downloaded model (CC0 first, CC-BY with `CREDITS.md`). Never build an object out of boxes, cylinders, lathes or CSS shapes. If no model fits, the feature is cut. Allowed procedural work: architecture, water sheets, FX, decals and canvas textures on existing surfaces (notes, stickers, scratches, smudges), UI chrome (panels, bars, keycaps, rings). Minigame art comes from the Fluent Emoji set already in `src/minigames/assets` (MIT). New sprites must come from that same set (for example `potable_water` for the faucet). The existing `paw()` in `kit.ts` stays.
- Every MUST item below names its asset need. "none" means no new model. Models marked `raw:` are already downloaded in `assets-raw/` and need conversion plus a manifest entry.
- **Progress never goes down.** Minigames and holds never send negative deltas. A mistake costs time (an input lock of 0.3 to 0.8 s), never progress. The sitter's **Undo** verb (§2.1 M6) is the only way progress returns to 0.
- **Work packages.** Five agents, one package each, and each agent edits only its own files:

| Package | Owns |
|---|---|
| **P1 Rules** | `src/shared/*` (additive only), `src/config.ts`, `src/core/**`, `src/sim/sim.ts`, `src/sim/interact.ts`, `src/sim/awards.ts`, `src/sim/labels.ts`, `src/net/**` |
| **P2 Content + bots** | `src/sim/interactables/**`, `src/sim/bots/**` |
| **P3 Minigames** | `src/minigames/**`, `preview/minigames.*` |
| **P4 Characters + world** | `src/models/**`, `src/world/**`, `public/models/**`, `src/assets/**`, `CREDITS.md` |
| **P5 Client + audio** | `src/client/**`, `src/main.ts`, `index.html`, `src/style.css`, `src/audio/**`, `public/sounds/**`, `src/fx/**` |

- P1 lands the contract additions (§2.0) first. Everyone else codes against them.
- Build order inside each package follows the order of its list. If time runs out, the tail is what slips.

---

## 1. Tone guide

### 1.1 Voice

- Short, dry, a little deadpan. Sentence case. A period or nothing at the end, **never an exclamation mark**, never "?!", never "...".
- ALL CAPS is reserved for the big centered popups (EYE CONTACT, disaster stamps, BLACKOUT). Nowhere else.
- Prompts are 1 to 4 words, imperative: "Run a bath". Greyed reasons are 1 to 3 words: "Mouth full".
- Show the behavior, never caption it. The cat does the thing and the UI says nothing about it.
- At most one pun per screen, and the title MEOWHEM uses that slot on the title screen. Everywhere else: zero puns.
- Owner speech (end show only) is lowercase with almost no punctuation, like a text message.
- Status chips are one plain word plus seconds: `Fed 22`, `Catnip 9`, `Zoomies 4`, `Focused 15`, `Wet 3`.
- No em dashes in game text.

### 1.2 Approved subtle references, and exactly where each one lives

| # | Reference | Where it appears | Text on screen |
|---|---|---|---|
| 1 | The expensive scratching post nobody uses | Price sticker decal on the post base (P4). Bots never use it (P2). Receipt line "Scratching post 0" (P5). Award **Good Cat** (P1). | Only the receipt line and the award |
| 2 | Hairball aimed at the rug | Rug ×2 (v1). The hacking cat creeps forward and can steer (P1). Bots steer toward the rug (P2). Award **Aim**. | "on the rug" floating text (v1), award line |
| 3 | Sitting on exactly what you need | v1 sit-on-it, award **Load-Bearing** | Greyed reason "Someone's sitting on it" |
| 4 | The box beats the contents | v1 empty box hides the name tag | none |
| 5 | Treat bag summons everyone | v1 | none |
| 6 | Yowling at a door, then not using it | Bot doorman behavior (P2), award **Doorman** | Award line only |
| 7 | The half-empty bowl counts as empty | Cat eat prompt greyed "Empty" while kibble is visibly in the bowl. Sitter can shake it (P2, P4). | "Empty", "Shake the bowl" |
| 8 | Owners' note on the fridge | One handwritten decal on the fridge (P4), readable only up close | The 3 lines in §1.6 |
| 9 | "They will tell you they didn't" eat | Fridge note line 1, plus the sitter-win end shot where the cats yell at the bowl and the owner asks "did they eat?" | Those two strings |
| 10 | Going boneless and purring when held | Noodle (P1, P4), award **Boneless** | Award line only |
| 11 | The slow push while staring at you | Slow push (P1, P4), award **Patience** | Award line only |
| 12 | Cats hear the car first | Every cat's head and ears turn to the front door at 0:08 (P2) | none |
| 13 | Evening zoomies | All cats get Zoomies at 1:00 as the light turns orange (P2, P4) | Status chip only |
| 14 | Using the box right after you scoop it | Fresh box window (P2) | none |
| 15 | Off the counter the moment you walk in | Bot counter innocence (P2) | none |
| 16 | Staring at nothing in the corner | Bot idle (P2) | none |
| 17 | Human names for cats | Bot names (P2), list in §1.6 | Names |
| 18 | Flehmen face at the shoes | v1 | none |
| 19 | The shopping cart already knows | Laptop site: cart holds "Lint roller refills (6)", "Recently viewed: Cat tree, 5 levels" (P3) | Those strings |
| 20 | Nose prints on the window | Each bird-watch bonk leaves a smudge on the 3D window glass (P2, P4) | none |
| 21 | The carrier song | Each meow while caged plays 4% lower in pitch, down to 0.75 (P1) | none |
| 22 | The staredown that never turns into a fight | Fight standoff (P1, P3), award **Standoff** | Award line only |
| 23 | Cat TV | v1 parody shows. Never name the originals. | v1 subtitles |

### 1.3 Banned (applies to every string, toast, award, prompt, bubble, the laptop site and the TV)

- **Puns:** purrfect, pawsome, meow-velous, cat-astrophe, hiss-terical, clawsome, fur-real, litter-ally, purr-chase, feline good, paw-sitively, purr-fessional, "think outside the box".
- **Lolspeak and old memes:** I CAN HAZ, ceiling cat, longcat, keyboard cat, nyan, grumpy cat, OwO, UwU, nya, heckin, smol, hooman, "if it fits I sits", mlem.
- **Influencer words:** kitties, fur babies, floofs, furry friends, feline friends, purr-sonality.
- **Captioning the behavior:** "ZOOMIES!", "Biscuits!", "Noodle mode!", "Slow blink = trust", "Cats love boxes".
- **Explaining hidden rules** in a tutorial, tooltip, toast or loading screen: eye contact, rug ×2, noodle, standoff, half-empty bowl, fresh box, slow push, overtime threshold. Players find them.
- **Trivia:** "Fun fact: cats sleep 16 hours a day".
- **Hype:** AMAZING, EPIC, COMBO, "You're on fire", "Unstoppable", MEGA MESS, "Let the chaos begin", TOTAL CHAOS.
- **AI copy:** "embark", "unleash", "dive into", "mischievous adventure", "chaos ensues", "the ultimate", "In a world where", lists of three adjectives, sparkle emoji.
- **Emoji in text** (toasts, awards, buttons, names, chat). Fluent sprites used as art inside minigames are fine.
- **Cutesy filler:** "Oops", "Uh oh", "Whoopsie", fake-suspense ellipses.
- **Narrated endings:** "The cats have won! The house is a mess and the owners are FURIOUS!"
- **A talking mascot or narrator.** Cats only ever "say" `mrrp` and `MEOW` in bubbles (v1).
- **Nine-lives jokes** in modes, menus or awards.
- **Real brands and shows** on the laptop, the TV, the receipt or anywhere else.
- **Harm played as a joke:** cats in washers or dryers, the cucumber scare as a sitter tool, bath dunking, injuries, declawing, "spray bottles train cats".
- **Pun names:** Mr. Whiskers, Sir Meows-a-lot, Captain Purrington, Catrick Swayze.

### 1.4 Current strings to replace (P1, P2)

| Where | Now | v2 |
|---|---|---|
| `sim.ts` end popup | `TOTAL CHAOS` / `THE OWNERS ARE HOME` | no popup (the end show carries it). Keep `ROUND OVER` for forfeits. |
| `awards.ts` | Gravity Researcher, Rug Sniper, Box Critic, Professional Loaf, Will Work for Treats, Regular, Scruff Specialist, Time-Out Enforcer | full list in §5.4 |
| `awards.ts` sitter headlines | 25 to 60 "Nothing a candle can't fix." 60+ "They'll notice. Eventually." | see §5.3 (adds "Technically a win.") |
| `carrier.ts` toast | "Time-out. Mash to rattle the door." | "Time-out. A / D to rattle the door." |
| `sofa.ts` permanent labels | "Sofa scratched", "Sofa: ruined" | "SOFA 1/3", "SOFA 2/3", "SOFA 3/3" |

### 1.5 Thirty example strings (copy this voice)

Cat prompts
1. Order something
2. Run a bath
3. Unroll it
4. Scratch the sofa
5. Climb the curtains
6. Make biscuits
7. Take dinner
8. Free Mochi
9. Sniff the shoes

Sitter prompts
10. Grab Gerald
11. Shake the bowl
12. Flip the cushion
13. Close the laptop
14. Return to sender

Greyed reasons
15. Empty
16. Mouth full
17. Someone's in the way
18. Someone's sitting on it

Toasts and alert labels
19. Package at the front door
20. Mochi is in the carrier
21. The tub is running
22. Someone's opening the carrier
23. Out of water. Refill at the kitchen sink.

Popups
24. EYE CONTACT
25. CARD CHARGED  +12%

Headlines and HUD
26. The owners have questions.
27. Technically a win.
28. They're looking for their keys.

Awards
29. Aim: "3 hairballs. 3 on the rug."
30. Doorman: "Opened 7 doors. 2 were used."

### 1.6 Fixed copy

**Disaster popups** (format `LABEL  +N%`, color `#e05a47`): laptop `CARD CHARGED`, flood `FLOOD`, TP `THE WHOLE ROLL`, sofa `SOFA 1/3`, `SOFA 2/3`, `SOFA 3/3`, salmon `DINNER`, tank `EMPTY TANK`, curtains `CURTAINS`. Other popups: `EYE CONTACT`, `BLACKOUT`. No others.

**Fridge note** (P4, handwritten, three lines, nothing else on it):
> They ate at 5. They will tell you they didn't.
> Litter box once a day, they are very particular.
> Scratching post is new!!

The double "!!" belongs to the owner's handwriting. It is the one exclamation mark in the game, and it is not UI.

**Role card** (P5, during the 3 s countdown):
- Cat: keycaps `LMB` Swipe · `Space` Jump · `E` Paw. Line: "Get it to 100% before the owners are home."
- Sitter: keycaps `LMB` Spray · `E` Grab · `R` Clap. Line: "Keep it under 100% until the owners are home."

**Cat to-do list** (P5, handwritten, top-left): Order something online · Run a bath · Unroll the toilet paper · Scratch the good sofa · Dinner · Go fishing · Take down the curtains.

**Owner bubbles** (end show, lowercase): laptop "did someone order something" · flood "why is the floor wet" · TP "that was a new roll" · sofa "the sofa." · salmon "where's dinner" · tank "where are the fish" · curtains "the curtains?" · clutter fallback "what happened in here" · sitter win "did they eat?"

**Bot names** (P2, about half human, half real cat names, never a player's name): Gerald, Linda, Kevin, Susan, Dennis, Brenda, Gary, Pam, Mochi, Bean, Pickle, Toast, Olive, Miso, Tofu, Pumpkin, Biscuit, Noodle.

**Laptop store** (P3): the store is called "boxbox". Orders from `host.data.order`: `catnip` gives "Catnip, 5 kg". `wetFood` gives "Wet food, salmon, 48 cans". The cart already holds "Lint roller refills (6)". Recently viewed: "Cat tree, 5 levels". Shipping line: "Arrives today".

---

## 2. Scope

### 2.0 Contract additions (P1, first, all additive)

`src/shared/contracts.ts`
- `CatAnim` += `'tap' | 'groom'`
- `CatVisualState` += `noodle?: boolean` (held and gone boneless) and `tossed?: boolean` (airborne after a toss or a slip launch)
- `SitterVisualState['anim']` += `'slip' | 'toss' | 'clap'`
- `SoundName` += `'clap' | 'keys' | 'shutter'`
- `MinigameHost` += `danger?(): number` (0 = no sitter threat, 1 = sitter within 2.5 m)

`src/core/types.ts`
- `StatusKey` += `'noodle' | 'tossed' | 'slip' | 'slipImmune' | 'noLoaf' | 'pushMode'`
- `CharState['cd']` += `'clap'`
- `Action` += `{ a: 'toss'; dir: Vec3 } | { a: 'clap' } | { a: 'push'; on: boolean }`
- `Alert` += `progress?: number` (0..1, the disaster's progress ring)
- `Snapshot` += `overtime: number` (seconds of overtime left, 0 = none)
- `Stats` += `escapes, noodleTime, blockTime, slowPushes, scratchPostUses, standoffs, treatsIgnored, doorsOpened, doorsUsed, carryTime, tosses, slips, undos` (all numbers, 0 by default)
- `Results` += `receipt: { label: string; value: string }[]`, `disasters: { key: string; label: string; points: number; spot: SpotId | null }[]`, `overtime: boolean`

`src/sim/interactables/types.ts`
- `Use` += `undo?: string` (the label of the sitter's Undo for this cat use, see M6)

`src/config.ts`
- `CFG.scale` indexed by cat count 1..4 (§3.2), plus the v2 values in §3.1.

New world visual keys (`level.setVisual`): `time.dusk` 0..1 · `owners.headlights` bool (a rising edge triggers one sweep) · `window.smudges` 0..8 · `foodBowl.shaken` bool · `done.<spotId>` bool for `laptop`, `tubFaucet`, `tpRoll`, `sofa`, `salmon`, `fishTank`, `curtains` (set when that disaster's permanent lands).

### 2.1 MUST: P1 Rules

**M1. Cat-count scaling.** `n` = number of cats in the round, bots included, fixed at round start. Apply `CFG.scale[n]` (§3.2): the clutter multiplier on every cleanable mess weight and every fallen-prop weight (passed as `mul` in `addMess`, and in the fallen-prop meter sum). The disaster work multiplier divides hold progress and minigame deltas. The other rows are plain values. Popups and floating text show the scaled value rounded to 0.5. Assets: none.

**M2. Grab rework + Noodle.**
- Limp 1.0 s. Escape = 20 wiggles. A press of A or D (or ← →) counts 1 if it differs from the previous press, 0.25 if it repeats it. Hiss while held adds +4, **once per grab**.
- Carrying: sitter moves at walk speed ×1.0, and sprint is disabled while holding a cat.
- **Noodle:** after the limp ends, a held cat that sends no wiggle for 2.0 s gets status `noodle` until its next wiggle. While noodling: the cat's visual has `noodle: true` and `talk: 'purr'`, the `purr` loop plays at the cat, the sitter carry speed drops to ×0.6, and the sitter face is `happy` (overrides neutral and angry, never panic). The first wiggle that ends a noodle counts 4. Stat `noodleTime += dt`.
- Escape gives 3 s grab immunity (v1) and `escapes += 1`. Escape input comes from the `escape` strip (§4).
- Assets: none.

**M3. Toss.** Sitter LMB while holding a cat throws it (spray is disabled while holding). Release the cat via the existing `push` event with v = horizontal camera forward × 4.5 + up 3.2 m/s. Aim pitch clamped −10°..+30° adds up to +1.5 m/s vertical. Flat range is about 3.5 m. The cat gets status `tossed` until grounded (visual `tossed: true`, anim `fall`). On landing it plays `land`, is `stunned` 0.3 s, `grabImmune` 3 s (counted from release) and `noLoaf` 4 s. Landing on a collider tagged `soft` (bed, sofa) gives one bounce of vy 2.5. The sitter plays anim `toss` 0.4 s and sound `whoosh`. The cat plays `meowShort` at pitch 1.2 mid-air. `tosses += 1`. Intended combo: toss into a room, close the door, and the cat has to hang on the handle (2 s) to get out. Assets: none.

**M4. Sitter slip.** A grounded sitter sprinting faster than 4.0 m/s whose feet come within 0.35 m of a `puddle`, `hairball`, `fish`, `food` or `catnip` mess, or of a fallen `toyMouse` or `yarn` prop, slips:
- status `slip` 1.2 s: frozen, anim `slip`, face `shock`, FX `stars` above the head for 1.2 s, sound `whoosh` then `thud` at +0.25 s.
- A held cat is launched with v = forward 2.5 + up 3.5 (same `tossed` landing as M3).
- `slipImmune` 4 s afterwards. Walking never slips. Slipping on a hairball smears it (scale ×1.3, same weight). `slips += 1`.
- Assets: none.

**M5. Clap (sitter R).** Cooldown `CFG.scale[n].clap`. Anim `clap` 0.5 s, positional sound `clap`. It affects every cat within 6 m with line of sight that is not loafing, held, caged or hypnotized:
- cancels its current hold or minigame (progress kept, the minigame closes)
- cancels a pounce charge
- face `shock` 0.5 s + FX `exclaim`
- Loafing cats ignore the clap completely.
- Bots on raised surfaces react with Counter Innocence (M18).
- Assets: sound `clap` (P5).

**M6. Undo (generic sitter verb).** `interact.ts` gives the sitter a hold use for every cat use that has an `undo` label:
- hold time `CFG.scale[n].undo`, range = that use's range
- offered while its progress is between 0.05 and 0.999, no cat is working it, and nobody is sitting on it
- on complete: progress back to 0, FX `poof`, sound `pop`, `undos += 1`
- It never touches banked stages: sofa undo resets only the current stage. Labels come from P2 (M17).
- Assets: none.

**M7. Sitter juice.**
- **Panic:** while the meter is ≥ 80 (it ends below 78), the sitter has status `panic`: clean, tidy and undo speed ×1.25, default face `panic`, FX `sweat` every 2.5 s.
- **Empty spray:** LMB at 0 ammo plays `spray` at pitch 0.55 and volume 0.35 with FX `splash` at scale 0.25 on the nozzle, and hits nothing. Cats within 6 m inside the sitter's 60° front cone get `smug` for 2 s. The existing toast fires at most once per 10 s.
- Spray stun 0.7 s. A sprayed cat gets `noLoaf` for 6 s.
- Assets: none.

**M8. Slow push.** A cat holding LMB for ≥ 0.25 s enters push mode (`{a:'push', on:true}`, status `pushMode`). Releasing ends it. A release before 0.25 s is the normal v1 swipe. In push mode:
- move speed ×0.3
- every 0.45 s a paw tap: the prop the swipe rule would target gets horizontal linvel 0.4 m/s along the cat's forward (a slide of 4 to 5 cm), cat anim `tap`, sound `clink` at volume 0.25 on hard props
- if `sitterSees(cat)`, the cat's `lookAt` = the sitter's head (feet + 1.6 m) between taps
- a prop that falls off a surface within 2 s of a tap counts as this cat's knock, so the eye contact ×2 rule applies as usual. `slowPushes += 1` per such prop.
- Assets: none.

**M9. Hairball.**
- Input: hold R for 0.6 s. Tap R (released before 0.6 s) = hiss on release. Cooldown 90 s.
- The hack lasts 2.0 s. Sound `hairball` plays once non-positionally at volume 0.7 for everyone, plus positionally at full volume within 6 m.
- During the hack the cat moves forward on its own at 0.3 m/s, A/D steer at 100°/s, and it can't jump. This needs the owner's controller to honor `hairball` status as creep (P1 owns `src/core`).
- Grabbed mid-hack: the hack continues, the hairball spawns 0.3 m in front of the **sitter's** feet, and the sitter shows face `gag` for 1.5 s.
- Rug ×2 and the "on the rug" text stay.
- Assets: none.

**M10. Fight: standoff + rolling cloud.** The lock stays 4 s: a 1.5 s staredown, then a 2.5 s brawl.
- If neither cat sends fight input during the staredown, the fight is called off: both are released, both play `groom` for 1.5 s, there's no fur and no crown, and both get `standoffs += 1`.
- Any input during the staredown is a flinch: that cat's brawl presses count ×0.75. The host knows by timestamping the `mg` actions it receives.
- **Brawl:** the cloud center drifts at 0.8 m/s, picks a new random heading every 0.8 s and reflects off colliders. Both cats' forced positions follow it. Each prop within 0.6 m gets linvel 2.5 outward + 1.5 up, once per prop. Those props count as knocked by both cats (shatter allowed, no eye contact). One `fur` spawns at brawl start and one at the end position.
- A sitter spray that hits the cloud ends the fight: both cats wet, no winner. Otherwise v1 applies (crown 10 s, loser dizzy 1.5 s).
- Assets: none.

**M11. Overtime + end flow.**
- When `timeLeft` hits 0 with the meter ≥ 90, overtime runs for up to 15 s (`snapshot.overtime` counts down). It ends when the meter reaches ≥ 100 (cats win), drops below 90 (sitter wins at once) or 15 s pass (sitter wins). The `keys` sound plays at the front door every 3 s. `Results.overtime = true`.
- At the end: play `door` (not `carArrive`), emit the results immediately (`CFG.round.endDelay` 0.2), and show no popup.
- Assets: sound `keys` (P5).

**M12. Small rule fixes.**
- Eye contact ×2 at most 3 times per cat per rolling 10 s (later ones count ×1, still no popup).
- A cat grabbed off a spot it was sitting on can't block that same spot again for 15 s.
- While caged, each meow plays at pitch × 0.96 per meow (floor 0.75).
- Escape-strip input arrives as `mash` with `n` = wiggle units: grab /20, caged −0.25 s each (cap 40% of the time-out), TV /8.

**M13. Stats, awards, results.** Track the new stats exactly as defined in §5.4. Rewrite `awards.ts` to §5.4. Build `Results.receipt` (§5.2) and `Results.disasters` (one entry per permanent in landing order, `key` = spot id, `label` = the receipt label).

**M14. Balance log (dev only, last).** With the URL flag `?balance=1`, the host prints one JSON line per round end: `{n, difficulty, winner, endTime, overtime, meterAt: {60,120,180,240,300}, permanents:[...], grabs, jails, undos}`. Plus a `?timeScale=4` flag if the loop allows it. Used to tune §3.2.

### 2.2 MUST: P2 Content + bots

**M15. Evening timeline.** New file `src/sim/interactables/evening.ts` (an interactable with no uses, only `tick`). Times are time-left values and the same for every round length:
- **1:30 → 0:30:** `time.dusk` = clamp((90 − timeLeft) / 60, 0, 1).
- **1:00:** every cat gets `zoomies` 10 s (v1 ×1.3). No text.
- **0:30:** `owners.headlights` = true. Sound `carArrive` at volume 0.45, non-positional.
- **0:10:** sound `door` at pitch 0.75 and volume 0.6 at the front door (the car door).
- **0:08:** every cat's `lookAt` = front door spot + (0, 1.0, 0) for 1.0 s. Head only, players included, no control loss.
- **0:05:** `step` ×4 at the front door, 0.45 s apart, volume 0.5.
- **0:03:** `keys` at the front door.
- Assets: none (sounds from P5).

**M16. Half-empty bowl** (`foodBowl.ts`).
- Fill starts at 1.0. Each cat meal takes −0.25.
- Cat "Eat" is OK while fill > 0.5 or the bowl is `shaken`. Otherwise it's greyed "Empty".
- Sitter uses: "Shake the bowl" (hold 0.6 s, offered when 0 < fill ≤ 0.5 and not shaken) sets `foodBowl.shaken` = true and plays sound `treatShake` at pitch 0.8. "Refill the bowl" (hold 1.5 s) sets fill to 1.
- A meal while shaken: fill −0.25 and shaken = false.
- Assets: none (visual in P4).

**M17. Interactable fixes.**
- **Undo labels** (`undo` on the cat use): laptop "Close the laptop" · tubFaucet "Tighten the tap" · tpRoll "Roll the paper back" · curtains "Straighten the curtains" · sofa "Flip the cushion" (current stage only) · plant "Pat the soil down" · pillow "Fluff the pillow" · frontDoor openBox "Tape it back up". Never undoable: fishTank, salmon, fuseBox, litterBox, foodBowl, sink, window, laundry, shoes, tv.
- **Done keys:** set `done.<spotId>` when each permanent lands (sofa at stage 3, tubFaucet on FLOOD).
- **Popup labels** exactly as in §1.6.
- **litterBox:** when a scoop completes, the box is fresh for 10 s. A poop during the fresh window gives zoomies 7 s instead of 5. Capacity `CFG.scale[n].litter`.
- **doors:**
  - A door can't close while any cat capsule overlaps its sweep (greyed "Someone's in the way").
  - A cat carrying an item can't hang on a handle (greyed "Mouth full").
  - The sitter opening a closed door while a cat is within 2.5 m of the hinge adds `doorsOpened += 1`. If a cat then passes through within 5 s, add `doorsUsed += 1`.
- **tv:**
  - Hypnosis 8 s for players. Bot durations are in §3.3.
  - It only hits cats within 9 m with line of sight AND (in the living room OR facing the TV with dot > 0.3).
  - Escape takes 8 wiggles.
  - During a blackout the TV switches off and can't be turned on.
  - Cooldown `CFG.scale[n].tv`.
- **carrier:** capacity, time-out and unlatch hold from `CFG.scale`. The unlatch use has the alert "Someone's opening the carrier". Rattling = escape strip wiggles.
- **scratchPost:** hold 2 s, `scratchPostUses += 1`. On the first use in a round, every bot within 10 m stops and looks at that cat for 1.0 s.
- **hideout:** keep the v1 6 s cap, plus a 10 s re-entry cooldown.
- **window:** each bird-watch completion and each early pounce adds `window.smudges` +1 (max 8).
- **treats:** a treat prompt that expires on a cat that didn't eat (not caged or held) adds `treatsIgnored += 1`. Cooldown `CFG.scale[n].treats`.

**M18. Bots.** Probabilities and rates per difficulty are in §3.3.

Cat bots:
- **Counter innocence:** a bot on a raised node (y > 0.5 m) in the kitchen, office or living room reacts when the sitter enters the same room, comes within 5 m with line of sight, or claps within 6 m. It drops to the nearest floor node within 2 m, plays `sit` with face `neutral` facing the sitter, and stays while the sitter is in the room or within 6 m. 2 to 4 s after the sitter leaves, it jumps back to the same node and resumes. Never during a disaster it is working on (it flees as usual).
- **Fresh box rush:** a bot with poop ≥ 0.5 goes to the box during the fresh window. That outranks everything except escaping.
- **Doorman:** a bot that wants a room behind a closed door goes to it and meows at it every 3 s. When the door opens, it sits 1.5 to 2.5 s looking at the doorway, then: 40% walk away to a new goal, 30% step into the doorway and stand inside the sweep for 3 s (the door can't close), 30% walk in.
- **Staring at nothing:** an idle bot (no goal for ≥ 2 s) has a 12% chance per idle decision to look at an empty upper corner of its room (room max corner, y 2.3) for 3 s. The point drifts 0.4 m sideways during that time. Another idle bot within 4 m joins at the same point with 50% chance.
- **Hairball:** bots hack only within 3 m of a rug (Gremlin: anywhere) and steer toward the rug center during the hack.
- **Slow push:** when `sitterSees(self)` and a non-special prop in reach sits within 0.12 m of a surface edge, the bot slow-pushes (chance per difficulty) until the prop falls, for at most 5 s.
- **Grabbed:** noodles for 2 to 4 s (chance per difficulty), then wiggles at the difficulty rate. It hisses once at 50% escape progress.
- **Fight:** flinches in the staredown per difficulty, then mashes at the difficulty rate.
- **Bowl:** if not Fed, the bowl reads Empty and the sitter is within 12 m: 25% per decision to sit 0.8 m from the bowl facing the sitter and meow every 2.5 s, for up to 8 s.
- **0:08:** 50% of bots drop any non-minigame task, walk to the hallway and sit facing the front door.
- **1:00 evening zoomies:** bots sprint between two random rooms for 10 s and swipe whatever is in their path.
- **Names:** from §1.6.

Sitter bot:
- Holding a cat with the carrier more than 8 m away: toss it into the nearest room with a door (bathroom > office > bedroom), then close the door.
- Clap when a cat within 6 m is working a disaster (Kitten never claps).
- Undo when a disaster's progress is > 0.3, no cat is within 4 m, and it is within 6 m.
- Feral walks over mess, Kitten sprints carelessly (and slips).
- Shake the bowl when passing within 3 m of it while it reads Empty.

### 2.3 MUST: P3 Minigames

**M19.** Implement §4 for all ten `MinigameKind`s, plus the presentation rules in §4.0 (docked panel, slim strip, danger indicator). Assets: Fluent sprites already in `src/minigames/assets`, plus `potable_water` from the same Fluent set (add it to `LICENSE.txt` coverage, MIT).

### 2.4 MUST: P4 Characters + world

**M20. Cat model.**
- `tap`: one front paw reaches forward low and slow (0.45 s cycle), toe beans show as it lifts, the body stays still, the head follows `lookAt`.
- `groom`: sit, lick a raised front paw, wipe the face once (1.5 s cycle).
- `noodle`: spine stretched 1.25×, legs straight down and loose, front paws knead the air alternately at 1.4 Hz, eyelids half closed, slow tail sway.
- `tossed`: one forward flip spread over the airborne time, finished upright before landing, legs splayed, face `shock`. Snap upright within 0.08 s on ground contact.
- Ears rotate up to ±40° toward `lookAt` whenever it is set (this shows the car at 0:08 and the treat bag).
- Assets: none (the existing downloaded cat).

**M21. Sitter model.**
- `slip` 1.2 s: 0 to 0.25 s feet shoot forward and the arms windmill. At 0.25 s the back hits the floor (squash 0.85). 0.25 to 0.9 s legs kick in the air. 0.9 to 1.2 s scramble upright.
- `toss` 0.4 s: an underarm lob with the holding arm.
- `clap` 0.5 s: both mittens up in front of the face, two claps at 0.15 s and 0.3 s, mitten squash on contact.
- Face `happy` while told so (holding a noodled cat). `panic` as the default face during panic.
- Owners in the end show use the same model with two new `SitterLook`s (§5.1).
- Assets: none.

**M22. World visuals.**
- **`time.dusk`:** the key light lerps from `#fff3df` to `#ffae6b` and its intensity from ×1 to ×0.75. The hemisphere sky lerps from `#dfe9ff` to `#ffcfa8`. Window light shafts and sun-patch decals take the same tint.
- **`owners.headlights`:** on the rising edge, a non-shadow spotlight (or a light-cookie plane) sweeps across the living-room ceiling from the front-window side in 2.5 s, then switches off. Still only one shadow-casting light in the scene.
- **`window.smudges`:** 8 preset nose-print decal spots on the living-room window glass at 0.25 to 0.4 m height. Show the first n. Two faint smudges on that window and one on the oven door from round start.
- **Decals** (canvas textures on planes, surface detail only):
  - the fridge note (§1.6) on a 0.12 × 0.16 m paper with a handwriting font file (OFL or CC0) in `public/fonts/`, credited in `CREDITS.md`
  - a "$89.99" price sticker on the scratch post base (white, orange border, one peeled corner)
  - claw scratches on the bottom 0.3 m of the bedroom door (both sides) and the bathroom door
- **Rubber duck:** `raw: ducky` (Tiny Treats Bubbly Bathroom, CC0). It floats on the tub water and follows `tub.water` (hidden at 0, bobs ±1 cm at 0.6 Hz, drifts slowly).
- **Book dominoes:** on the living-room bookshelf and the office shelf, `book` props stand upright in rows of 6, about 3 cm apart. Tune the spacing in Rapier until one swipe topples at least 4.
- **Food bowl:** fill > 0.5 shows a full mound. Fill ≤ 0.5 shows kibble only as a ring at the rim, with the bowl floor visible. `foodBowl.shaken` shows a thin even layer. Kibble is a texture on a fill disc or ring (surface detail), or instanced downloaded food bits. No hand-modeled kibble.
- **Collider tags:** bed and sofa seat colliders get tag `soft`.
- **Spawns:**
  - cats[0] on the kitchen counter, facing a row of 3 mugs at the counter edge
  - cats[1] on the sofa, facing the coffee table props
  - cats[2] in the bathroom near the TP
  - cats[3] on the office desk
  - the sitter in the hallway, facing the living room
- **End-show props:** `raw: bag` + `raw: loaf-baguette` (Kenney Food Kit, CC0) as manifest keys `groceryBag` and `baguette` (the baguette sticks out of the bag).

### 2.5 MUST: P5 Client + audio

**M23. Spot cam, hitstop, danger.**
- **Spot cam:** when a minigame opens for the local cat (not `escape`, not `fight`), the camera eases over 0.35 s (smoothstep) to position = spot.pos − fwd(spot.facing) × 1.25 + (0, 0.95, 0), looking at spot.pos + fwd × 0.35 + (0, 0.35, 0). Per-spot overrides (back, up, target height):

  | Spot | Back | Up | Target |
  |---|---|---|---|
  | tubFaucet | 0.9 | 1.1 | 0.6 |
  | curtains | 2.2 | 1.0 | 1.3 |
  | fishTank | 0.6 | 1.35 | tank center |
  | window | 1.2 | 0.8 | window center (y 0.9) |
  | laptop | 0.9 | 0.85 | screen |

  Normal wall collision applies. Ease back over 0.25 s on close. The real downloaded models react through the world keys (`laptop.*`, `tub.*`, `tp.unrolled`, `curtains.climb`, `pillow.knead`, `tank.fish`, `window.birds`) and the cat plays its anim.
- **Hitstop:** on your own grab success or spray hit, and on being grabbed or sprayed, freeze local animation and interpolation time for 80 ms with a 2° FOV punch.
- **`MinigameHost.danger()`:** computed from the snapshot. d = distance from your cat to the sitter. danger = clamp((8 − d) / 5.5, 0, 1). It is 0 while the sitter is stunned, slipping or holding another cat.
- Translate escape-strip progress to `mash` with `n` = delta × 20.

**M24. Onboarding HUD.**
- **Role card** during the countdown (§1.6).
- **Cat to-do list:** top-left, handwritten font, all 7 items visible from the start. Each item is crossed out with a scribble when its `done.*` key turns true. The item for your current room wobbles slightly. Hidden while a minigame is open.
- **Sitter alerts** show the `progress` ring.
- **Overtime:** the timer shows 0:00 pulsing, with the subline "They're looking for their keys."
- Music `tense` also plays during overtime.

**M25. Audio.**
- Add `clap`: a CC0 recording of a double clap. Fallback synth: two 8 ms noise bursts through a 1.8 kHz bandpass, 90 ms apart.
- Add `keys`: a CC0 recording of a key-ring jingle, about 0.6 s. Fallback: `clink` ×3 at pitch 1.4, staggered 60 ms.
- Add `shutter`: a CC0 recording or a synth click.
- Update `public/sounds/SOURCES.md`.
- Honor non-positional plays (no `pos`) at the given volume.

**M26. End show + results board.** Exactly §5.

### 2.6 SHOULD (next pass, in priority order)

1. **Fur on the hoodie:** the sitter's shirt material blends in fur specks in the colors of the cats carried (0..1 by carry time), shown in the end show. P4. Assets: none.
2. **Polaroids:** the client snaps 4 moments (first disaster, first eye contact, first toss, first slip) into a 320×240 render target, pinned to the results fridge. P5.
3. **Belly Trap:** double-tap F flops belly-up (5 s, cooldown 25 s). A grab on a belly-up cat fails into a 1.2 s bunny-kick that stuns the sitter. New anims `bellyUp`, `bunnyKick`.
4. **Ankle Ambush:** a pounce charged ≥ 70% that lands within 0.6 m of the sitter's legs from behind makes the sitter stumble 0.8 s. Cooldown 20 s per cat, 6 s stumble immunity.
5. **Carrier Starfish:** a carried cat within 1.2 m of the carrier splays all four legs, and jailing it takes a 0.6 s hold.
6. **Climb height in 3D:** during `climb` the host positions the cat at spot + (0, progress × 1.9, 0) against the curtain.
7. **Towel burrito:** a sitter minigame at the towel rail. Assets: `raw: Bathroom_Towel` / `towel_blue`.
8. **Hat cat:** a cat pounces onto the sitter's head (3 s, the sitter's screen fills with belly fur). Needs `headAnchor`.
9. **Double carry:** `holdAnchor2`, carry ×0.75, each cat escapes at half the wiggles.
10. **Tablecloth yank:** `raw: tableCloth`. Hold 2 s and everything on the dining table slides off.
11. **Poop in the shoe:** a poop event at `shoes` parents the mess into the shoe and reveals it in the end show.
12. **Phone in the toilet:** a knocked `phone` prop entering the toilet volume disables the flashlight at the next blackout.
13. **Mirror rival:** `raw: Bathroom_Mirror1`. Hissing twice at the mirror gives a draw fight with yourself.
14. **Slow blink:** hold Q while standing still. If the sitter looks back and stands still for 1 s, cat face `love`, sitter face `happy`, one heart.
15. **Cat polish:** dusk pupils, dream twitches while sleeping, a chest lick after a hard bonk.
16. **Sun patch slides** (`sun.t`, mutable `sunPatches` centers).
17. **Portrait frames** showing the players' real cats (render-to-texture).
18. **Wet shake-off:** F while wet ends wet in 2 s and leaves a puddle.
19. **Gifts** (sock and toy mouse carried to the sitter, muffled yowl). Only once those prop models exist.
20. **If it fits:** extra loaf targets (sink basin, fruit bowl built from the downloaded `bowl` + `apple`/`banana` models).
21. **TV escape by looking away** instead of wiggling.
22. **Carrier hops** (headbutts move it 4 cm).
23. **Sweep it under the rug** (a mess counts 30% with a visible lump).
24. **Pspsps** on a sitter emote key (T).
25. Lobby warmup in the house. Kenney Input Prompts (CC0) keycap glyphs.

### 2.7 CUT (with reasons)

- **Robot vacuum, vacuumRide, roombaRide:** large effort and no verified redistributable model.
- **Cucumber as a sitter weapon:** cat-welfare optics, since the real trend stresses cats. The cucumber stays a plain prop and a TV parody.
- **Bath dunk:** humor at the cat's real expense. The cat is never the victim.
- **Washer walkabout, `washer` minigame:** new spot, a lot of work, and washers + cats is a real-harm association.
- **`fridgeRaid`:** the salmon heist already covers food theft.
- **`phoneCall`:** text-heavy and hard to read at a glance.
- **Owner photo requests:** a sideshow for the sitter.
- **Bodge job:** needs a fix visual per disaster. Undo covers the counter-play.
- **Box carry:** low frequency and a new carry type.
- **Petting trap:** conflicts with E = grab on cats.
- **Liquid cat on Space while held:** merged into Noodle.
- **Sock hoard.**
- **Dinner clock:** no clock model in hand, and the timeline already covers the late-round beat.
- **Tail sticking out from behind the curtain.**
- **Review card and tip envelope:** they duplicate the headline.
- **To-do items that unlock by room:** all items are visible from the start instead.
- **Every proposed new MinigameKind** (hairball, groom, bunnyKick, squeeze, doorHang, sinkDrink, scoop, mirror, washer, fridgeRaid, phoneCall). The hairball stays in-world.
- **Laptop captcha grid, caps-lock flips, drawn tail sweep:** the tail would be drawn art.
- **Treat bag pausing a fight.**
- **Evening zoomies conditional on the meter:** they are unconditional.
- **Meow escalation at doors:** v1 complaining is enough.

---

## 3. Balance

### 3.1 v1 → v2 changes

| Knob | v1 | v2 | Why |
|---|---|---|---|
| grab.limp | 0.8 s | 1.0 s | Part of the carry window below. |
| grab.escape | 14 presses, any key | 20 wiggles, alternating A/D (a repeated key counts 0.25) | The v1 carry window was ~2.4 s × 2.7 m/s ≈ 6 m, so the carrier was only reachable from the kitchen. v2: 20 at ~7/s ≈ 2.9 s + 1.0 s ≈ 3.9 s × 3.0 ≈ 11.7 m (≈ 9.9 m with the hiss). Toss adds ~3.5 m. |
| grab.hissBonus | +4 per hiss | +4 once per grab | Stops hiss spam. |
| grab.carryMul | ×0.9, can sprint | ×1.0, no sprint | Carrying reads as a walk. Net distance is the same or better than v1. |
| noodle | n/a | after 2 s idle, carry ×0.6, the exit wiggle counts 4 | Lets a cat stall instead of escape. Toss still counters it. |
| spray.stun | 1.0 s | 0.7 s | A jogging sitter still closes 2.1 m in 0.4 s, so spray → grab stays a skill combo, not a lock. |
| spray, no loaf after a hit | n/a | 6 s | Breaks the loaf, grab, re-loaf loop. |
| sit-on-it | n/a | 15 s re-block cooldown per spot after being grabbed off it | Same loop. |
| tv.duration | 15 s | 8 s for players, bots per §3.3 | At 15 s on a 75 s cooldown, a living-room cat lost 20% of the round. |
| tv.mash | 10 | 8 wiggles | |
| tv targets | everyone in the room or within 9 m LOS | 9 m LOS AND (living room OR facing it) | |
| tv in a blackout | n/a | off | Gives cats a counter. |
| carrier.mashMaxCut | 8 s | 40% of the time-out | Scales with the time-out. |
| hairball.cooldown | 60 s | 90 s | At 60 s, 4 cats × 6 hairballs × 3–6 pts was a big hidden clutter source. 90 s keeps it a moment, not a spam. |
| hairball input | double-tap R | hold R 0.6 s | Double-tap collided with hiss and fights, and nobody discovered it. |
| eye contact ×2 | unlimited | 3 per cat per rolling 10 s | 4 cats sweeping a counter in view doubled everything. |
| hideout | 6 s cap | + 10 s re-entry cooldown | Stops loop camping. |
| foodBowl | empties after 4 meals | −0.25 per meal, ≤ 0.5 reads empty, a shake restores one meal | Turns Fed into something the sitter manages. |
| poop zoomies in a fresh box | 5 s | 7 s | Small reward for the joke. |
| fight | 4 s mash | 1.5 s staredown + 2.5 s brawl, rolling cloud | The fight becomes a hazard to the house. |
| evening zoomies | n/a | 10 s at 1:00 | Pushes action into the last minute. |
| panic | n/a | meter ≥ 80: clean, tidy and undo ×1.25 | A visible comeback for the sitter. |
| overtime | n/a | meter ≥ 90 at 0:00, up to 15 s | A clutch finish. |
| round.endDelay | 3 s | 0.2 s | The show plays client-side, so results are needed right away. |

### 3.2 Scaling by cat count (`CFG.scale[n]`)

| Knob | 1 cat | 2 cats | 3 cats | 4 cats |
|---|---|---|---|---|
| Clutter weight × (all cleanable mess + fallen props) | 1.0 | 0.75 | 0.6 | 0.5 |
| Disaster work time × (holds + minigame deltas) | 0.85 | 1.0 | 1.2 | 1.4 |
| Carrier time-out | 18 s | 20 s | 22 s | 25 s |
| Carrier unlatch hold | n/a | 3.0 s | 3.5 s | 4.0 s |
| Carrier capacity | 1 | 1 | 2 | 2 |
| Sitter walk / jog (m/s) | 3.0 / 5.2 | 3.0 / 5.2 | 3.1 / 5.4 | 3.2 / 5.5 |
| Spray ammo | 6 | 8 | 10 | 10 |
| Cat TV cooldown | 90 s | 75 s | 65 s | 60 s |
| Treat bag cooldown | 45 s | 40 s | 35 s | 30 s |
| Clap cooldown | 6 s | 6 s | 5 s | 4 s |
| Undo hold | 2.0 s | 2.0 s | 1.5 s | 1.5 s |
| Litter box capacity | 4 | 4 | 5 | 6 |

Permanent points never scale, so popups and receipts read the same at every n. Time is what the sitter fights.

**Reasoning (v1 numbers from DESIGN.md and config):**
- A cat sweeping a counter produces ~0.8 meter pts/s. The sitter cleans ~0.85 pts/s at best. With 4 cats in v1 that was 3.2 vs 0.85, the breakable pool (~85 pts) was gone in ~30 s, and the cats hit 100% around 1:00–1:30.
- At ×0.5, 4 cats produce ~1.6 scaled pts/s and the clutter pool caps around ~60 scaled points. Cats now **need** permanents (pool 77) to win, and those take 1.4× as long while the sitter has Undo, clap, toss and a 2-cat carrier.
- 1 cat: clutter is roughly break-even with cleaning. Without Undo a lone cat always finishes every disaster by retrying. With Undo (2.0 s) and the 0.85 work multiplier, the lone cat has to pick moments when the sitter is far away. Danger ears and alerts make that a readable duel.
- The cats stay faster than the sitter at every n (zoomies 5.8 vs a 5.5 jog).

**Targets:**
- Win rate 45–55% at every n for equal skill.
- Median meter at half-time 45–60%.
- At least 35% of rounds decided in the last 60 s or in overtime.
- No cat win before 2:30 on a 6:00 round.

**Tuning:**
- Run `?balance=1&timeScale=4` with Feral bots vs the Feral bot sitter, 20 rounds per n.
- Tune only the clutter and work rows first, one row at a time.

### 3.3 Bot difficulty

| | Kitten | House Cat | Feral |
|---|---|---|---|
| Minigame / hold time × (on `Use.time`) | 1.4 | 1.15 | 1.0 |
| Reaction delay | 0.8 s | 0.5 s | 0.25 s |
| Flee when the sitter approaches within | 3 m | 4.5 m | 6 m |
| Falls for treats | 85% | 60% | 35% |
| TV hypnosis | 10 s | 7 s | 4 s |
| Noodle when grabbed | 50% | 30% | 10% |
| Escape wiggles per second | 4 | 6 | 7.5 |
| Staredown flinch | 85% | 70% | 50% |
| Brawl presses per second | 4 | 6 | 8 |
| Counter innocence | 100% | 80% | 50% |
| Slow push when watched | 20% | 40% | 70% |
| **Sitter bot:** grab success in range | 50% | 70% | 90% |
| **Sitter bot:** spray aim error | 12° | 7° | 3° |
| **Sitter bot:** uses Undo / Clap / Toss | no / no / yes | yes / yes / yes | yes / yes / yes |

---

## 4. Minigames

### 4.0 Shared rules (P3)

- **Docked panel.** `kit.frame` fits the 860×580 stage into the bottom 50% of the viewport: scale = min(1.15, w × 0.92 / 860, h × 0.5 / 580), anchored bottom-center 12 px from the edge, panel background cream at 94% opacity. The top half is the live 3D spot cam (M23).
- **Slim strip.** `escape` uses `frame(..., { slim: true })`: a 860×150 strip with only keycaps and one meter, no stage art, no spot cam.
- **Danger indicator.** Top-right of the panel, driven by `host.danger?.()`:
  - below 0.35: nothing
  - 0.35–0.75: the `cat_face` sprite
  - ≥ 0.75: the `weary_cat` sprite shaking, and the panel border pulses orange at 2 Hz
  - No sound and no text.
- **Paw language.** A = left paw, D = right paw (arrow keys mirror) in climb, knead, openBox and escape. Space = the big action. Esc exits every minigame. The host also closes it when the cat is grabbed, sprayed or clapped.
- **Progress.** Totals are 1.0. The host applies work speed and `CFG.scale[n].work`.
  - "Nominal" below means a competent human at 1× work. "Bot" is the `Use.time` at Feral.
  - Input is capped by an event-rate limit, so macros don't help.
  - Mistakes lock input for the given time and never subtract.
- **Art.** Fluent sprites named per game, the kit's `paw()`, CSS backgrounds as textures (fabric, glass, cardboard). Never CSS-drawn objects.
- **Success shows in the world** (spot cam + world keys), never as a "SUCCESS" stamp. The kit's `done` state just dims the panel for 0.4 s before close.

### 4.1 laptop (nominal 12 s, bot 15 s, shared)

- **Screen:** the "boxbox" store. A search bar, the cart badge (it already holds "Lint roller refills (6)"), product cards from `herb`, `canned_food`, `package`, `bed`, a "Recently viewed: Cat tree, 5 levels" strip, and the CSS keycap deck below.
- **Beat 1, search (0 → 0.6):** roll your hand across the letters. Each letter keydown adds +0.0045. If 3 or more letter keys are held at that keydown ("paw contact"), it adds +0.009. The same single key repeated adds +0.0015. Cap 14 keydowns/s. The search bar shows your actual keysmash ("kjjjj;;ll"), then autocomplete politely swaps it for the order name.
- **Beat 2, checkout (0.6 → 0.85):** hold Space (the cat lies on the keyboard). +0.125/s while held. The quantity spins up toward 48, and shipping flips to "Arrives today".
- **Beat 3, confirm (0.85 → 1.0):** three Enter presses, +0.05 each, 0.4 s apart. The dialogs say "Place order?", "48 of them?", "Arrives today. Confirm?".
- **Fail and fun:** an Enter before its dialog appears does nothing. 6 or more keys held at once floods the search bar with "jjjjjjjj" (still counts at the chord rate).
- **Sounds:** `typing` loop while keys move, `pop` per dialog, `ding` + `buzz` (card) at 1.0.
- **World:** `laptop.screen` 'hacking' → 'ordered', `laptop.progress`.

### 4.2 faucet (nominal 7 s, bot 8 s)

- **Screen:** the `potable_water` sprite large at the top, `bathtub_empty` below, one big paw (`paw('beans')`) reaching up from the bottom edge.
- **Controls:** tap Space (or LMB) to bat the handle. +0.025 per tap, taps counted at most every 0.12 s. With no tap for 0.8 s the handle drops back visually, and the next tap only re-catches it (no progress, `clink` at pitch 0.7).
- **Milestones:**
  - 0.4: a `droplet` sprite forms on the spout and wobbles
  - 0.7: a sputter splashes droplets over the panel and the paw flinches (0.3 s lock)
  - 1.0: gush, the paw yanks back with a shake
- **Sounds:** `clink` per tap with pitch rising with progress, `splash` at 0.7, `waterRun` at 1.0.
- **World:** `tub.running`.

### 4.3 tpSpin (nominal 9 s, bot 11 s, shared)

- **Screen:** the `roll_of_paper` sprite large, a paper streamer (CSS strip textured as paper) cascading into a pile that grows past the bottom of the panel. Teammates show as extra paws.
- **Controls:** S, ↓ or mouse wheel (either sign, events throttled to 60 ms) = pull. Each pull adds +2.2 rad/s of spin (cap 14). Friction −3 rad/s². Progress += spin × 0.011 per second, so steady pulls beat frantic ones.
- **Rip:** two pulls within 0.12 s tear a chunk: +0.03, `paperRip`, at most once per second.
- **Fun:** at 1.0 the bare tube rolls off-panel. The pile is obviously bigger than any roll.
- **Sounds:** `paperRip` on rips, a soft `whoosh` while spin > 8.
- **World:** `tp.unrolled`, `tp.avalanche`.

### 4.4 fishing (nominal 12 s, bot 14 s)

- **Screen:** a top-down tank (CSS glass and water texture), 3 to 4 swimming sprites (`fish`, `tropical_fish`, one `blowfish`), `bubbles`, a `spiral_shell` on the floor, the paw hovering above with its shadow on the water.
- **Controls:** A/D or mouse x moves the paw along the rim (1.6 tank widths/s). Space dips (0.35 s).
- **Catch:** a fish whose center is within 60% of the paw width at the bottom of the dip is caught. It arcs out of the panel, +0.334, and the host spawns the `fish` mess at 1/3, 2/3 and 1.
- **Miss:** the fish scatter for 0.8 s and the paw shakes droplets (0.5 s lock), every time.
- **Blowfish:** a dip on it does nothing. The paw slides off and the blowfish just stares (0.6 s lock).
- **Three misses in a row:** a big disgusted paw-flick (1 s, cosmetic).
- **Sounds:** `splash` per dip, `plop` on a catch, `pop` on the blowfish.
- **World:** `tank.fish`.

### 4.5 climb (nominal 9 s, bot 11 s)

- **Screen:** a vertical fabric texture (CSS curtain-colored folds) scrolling down as you rise, two paws gripping (`paw('back')` with class `claws`), a height bar on the side, a sway gauge on top.
- **Controls:** alternate A/D. +0.04 per correct alternation, cap 4/s.
- **Sway:** the curtain sways with a 2.4 s period. While the sway gauge is in an extreme (|sway| > 0.8, two ~0.5 s windows per period), hold Space to hang on.
- **Slip:** the same key twice, or A/D during an extreme without Space, is a slip: a 0.6 s lock, a ~5% visual slide that recovers during the lock (progress unchanged), sound `scratch` at pitch 1.3.
- **Fun:** at 1.0 the paws stop, a single small `meowShort` at pitch 1.4 plays, a 0.5 s pause, then the panel shakes and drops out of view.
- **World:** `curtains.climb` → `curtains.down`.

### 4.6 knead (nominal 8.4 s, bot 10 s, repeatable)

- **Screen:** a soft cream pillow surface filling the stage (CSS texture), two big bean-side paws pressing into it, and a beat marker pulsing between them.
- **Controls:** 100 BPM (0.6 s). Odd beats are left (A), even beats right (D). The right key within ±150 ms of the beat adds +1/14.
- **Off-beat or wrong key:** no progress, the paws freeze and a side-glance wobble plays (0.4 s lock), the streak resets.
- **Two presses inside one beat:** claws out and a thread snag (cosmetic, `scratch`), the streak resets.
- **Streak:** at 8, a single drool drop (`droplet` sprite) falls and the purr gets louder.
- **No input for 2 s:** dozing (`zzz` sprite). The next press only wakes it.
- **Sounds:** `purr` loop with volume 0.3 + 0.08 × streak (cap 1.0), a soft `pop` per good beat.
- **World:** `pillow.knead`.

### 4.7 escape (slim strip, no spot cam)

- **Grabbed:**
  - The strip shows A and D keycaps (the expected one lit), the `pinching_hand` sprite over a grip meter, and the R keycap greyed after its one use.
  - A correct alternation reports progress 1/20, a repeat 0.25/20, the hiss 4/20.
  - No input for 2 s → noodle: the strip dims and a slow `revolving_hearts` sprite pulses. The first key afterwards reports 4/20 and shakes the strip.
  - Nominal ~3 to 4 s including the limp.
- **Caged:** the same strip with a time-left bar. Each wiggle reports 1/20 (the host converts it to −0.25 s, capped at 40%). Meows get sadder (M12).
- **Hypnotized:** the same strip. 8 wiggles total.
- **Sounds:** `hiss` on R, `cageOpen` at pitch 1.5 as the rattle on caged wiggles, `purr` during noodle (the host plays it).

### 4.8 fight (both cats, 4 s fixed)

- **Screen:** the docked panel with the opponent's name, two `pouting_cat` sprites facing each other, and a tug bar in both fur colors with a fur-ball marker.
- **Staredown (1.5 s):** a growl bar rises and the Space keycap is greyed with no label. Any key reports progress 0.001 (a flinch marker for the host). If neither player presses, the host calls the fight off (M10). Both sprites turn away and the panel closes.
- **Brawl (2.5 s):** the Space keycap lights up. Each press reports 0.025 (the host applies ×0.75 for flinchers and compares totals). Use `collision` and `anger_symbol` bursts on presses. At the end show `crown` on the winner's side and `dizzy` on the loser's.
- **Sounds:** `hiss` at the staredown start, the `fight` loop during the brawl, `ding` for the winner.

### 4.9 openBox (nominal 4 s, bot 5 s, shared)

- **Screen:** the `package` sprite large, three tape strips across it (CSS tape texture on the sprite), claw scratch lines appearing as the tape tears. Teammates show as extra paws.
- **Controls:** alternate A/D to rip, +1/12 per correct alternation (4 per strip), cap 6/s. Space = chew the corner: no progress, a burst of cardboard-colored bits (fun only).
- **Fun:** at 1.0 the flaps pop and a `herb` or `canned_food` sprite bounces out. The paw ignores it.
- **Sounds:** `paperRip` per strip, `crunch` on chews, `pop` at 1.0.

### 4.10 birdWatch (nominal 8.5 s, bot 10 s)

- **Screen:** a window frame (CSS glass texture) with a `deciduous_tree` branch outside, a target `bird` plus a `dove` that never leaves and stares, and `leaf_fluttering_in_wind` drifting by. No drawn cat parts on this screen.
- **Controls:** hold W to creep (butt wiggle): +0.16/s while the bird looks away.
- **The bird turns** every 1.5 to 3.0 s after a 0.35 s tell (a head bob + a small `?`) and looks for 1.0 to 1.6 s. Creeping while it looks makes it flutter off and come back after 1.5 s. Releasing W in time is safe.
- **Space = pounce now:** at ≥ 0.85 it completes. Below that it's a bonk: the panel squishes against the glass, the birds scatter for 1.5 s, +0. Either way the host adds a smudge.
- **At 1.0:** automatic pounce, a bonk on the glass, success (Focused).
- **Sounds:** `chatter` loop while creeping, `thud` on the bonk, `whoosh` on the flutter.
- **World:** `window.birds`, `window.smudges`.

---

## 5. End show (P5) and awards (P1)

### 5.1 Sequence (client-side, from `phase: 'ended'` + `results`; skippable with Space or a click after 1.2 s)

1. **Freeze, 0.0–1.2 s.** All character visuals hold their exact pose (animation time stops). At 0.3 s, play `shutter` with a 120 ms white flash. The camera stays put. No text.
2. **Owner reveal, 1.2–3.0 s.** Cut to the hallway at 0.3 m height, 1.1 m inside the front door, pitch 0. `frontDoor.open` goes 0 → 1 over 1.0 s. Two owners stand in the doorway, framed from about the hips down:
   - two sitter models: look A `{skin '#e8b894', hair '#3b2a20', shirt '#6a8caf'}`, look B `{skin '#c98e62', hair '#1e1a17', shirt '#c46a4a'}`, anim `idle`
   - B holds `groceryBag` with the `baguette` in the hold anchor
3. **Cats win:**
   - **Walkthrough, 3.0–7.5 s.** Up to 3 cuts × 1.5 s: the top `Results.disasters` by points (ties: the later one). Camera at spot.pos − fwd(facing) × 2.2 + (0, 1.4, 0), looking at spot.pos + (0, 0.5, 0). Exceptions: flood from the bathroom doorway, curtains from 3.0 back and 1.5 up with target y 1.0.
   - Each cut shows its owner bubble (§1.6) bottom-left, typed at 40 chars/s starting 0.2 s in.
   - No permanents (the win came from clutter): one cut of the room with the most mess weight, bubble "what happened in here".
   - **Tableau, 7.5–9.5 s.** A wide hallway shot. Every cat (visual override, no physics) sits in a row 1.5 m from the door facing it, anim `sit`, face `happy`. The sitter stands behind them in `despair`, face `panic`.
4. **Sitter wins: tableau, 3.0–5.5 s.** A kitchen shot. Every cat sits in a row by the food bowl facing the owners, face `sad`, with `talk: 'meow'` staggered every 0.7 s and `meow` sounds. The sitter stands behind them in `celebrate`, face `smug`. Bubble: "did they eat?"
5. **Results board.** A DOM fridge door: cream panel, magnets, handwritten-font sticky notes.
   - Top: the headline (§5.3) + sub.
   - Left: the Damage receipt (§5.2).
   - Right: up to 6 award sticky notes (§5.4), each with the player's name and the stat line.
   - Buttons: "Again" (host only) and "Lobby".
   - Forfeit: skip straight to the board.

Music: `tense` cuts at the freeze. `win` or `lose` (v1) plays when the board appears.

### 5.2 Damage receipt (`Results.receipt`, built by P1)

Monospace on a paper strip, dotted leaders, values = the actual meter contribution at the end, rounded to 0.5. Line order:
1. Permanents in landing order, labels: `Card charged` · `Flood` · `The whole roll` · `Sofa (n of 3)` (one line, summed) · `Dinner` · `Fish tank` · `Curtains`.
2. Cleanable mess still present, grouped: `Shards ×4`, `Hairball ×2 (rug)` (rug and non-rug as separate lines), `Poop ×1`, `Fur ×3` …
3. `Things on the floor ×7` (fallen intact props).
4. `Litter box, full` (if the penalty is active).
5. `Scratching post` with value `0`, or `1 use` / `n uses` if it was used (it never adds).
6. A rule line, then `Total` with the meter %.

```
DAMAGES
Card charged ............. 12
Flood .................... 15
Sofa (3 of 3) ............ 12
Shards x4 ................. 6
Hairball x2 (rug) ......... 6
Things on the floor x7 .. 5.5
Litter box, full .......... 4
Scratching post ........... 0
-----------------------------
Total .................. 100%
```

### 5.3 Headlines

- Cats win: **"The owners have questions."** Sub: "Mess hit 100% with 2:14 left." In overtime: "Mess hit 100% while they looked for their keys."
- Sitter wins, by meter:
  - < 25: **"Spotless. Suspiciously spotless."**
  - 25–60: **"Nothing a candle can't fix."**
  - 60–90: **"They'll notice. Eventually."**
  - ≥ 90: **"Technically a win."**
  - Sub: "The owners got home to 47% mess."
- Forfeit: keep the v1 lines.

### 5.4 Awards (`awards.ts`)

Format: a name of 1 to 3 words, plus one dry stat line. `{v}` is the value rounded. `m:ss` for times ≥ 60 s, otherwise "N s". Distances ≥ 1000 m show as "1.1 km".

| # | Award | Role | Value (stat formula) | Min | Stat line |
|---|---|---|---|---|---|
| 1 | Good Cat | cat | `scratchPostUses` | 1 | 1: "Used the scratching post. Once." n: "Used the scratching post. {v} times." |
| 2 | Insurance Claim | cat | `disasterPoints` | 10 | "{v} points of permanent damage" |
| 3 | Eye Contact | cat | `eyeContacts` | 2 | "{v} things knocked off. Maintained eye contact." |
| 4 | Aim | cat | `rugHairballs` | 1 | "{hairballs} hairballs. {rugHairballs} on the rug." |
| 5 | Patience | cat | `slowPushes` | 2 | "{v} things pushed off, slowly" |
| 6 | Liquid | cat | `escapes` | 2 | "Escaped {v} times" |
| 7 | Boneless | cat | `noodleTime` | 6 | "Went limp for {t}" |
| 8 | Load-Bearing | cat | `blockTime` | 10 | "{t} sitting on things that needed cleaning" |
| 9 | Box Optional | cat | `poopsOutside` | 1 | "{v} outside the box" |
| 10 | 3 A.M. | cat | `zoomDist` | 60 | "{d} at full speed" |
| 11 | Standoff | cat | `standoffs` | 1 | 1: "1 fight that never happened" n: "{v} fights that never happened" |
| 12 | Undisputed | cat | `fightsWon` | 2 | "{v} fights won" |
| 13 | Unbribable | cat | `treatsIgnored` | 3 | "Ignored {v} treat bags" |
| 14 | Frequent Detainee | cat | `timeCaged` | 15 | "{t} in the carrier" |
| 15 | Loaf | cat | `loafTime` | 30 | "{t} as a loaf" |
| 16 | Vocal Range | cat | `meows` | 20 | "{v} meows" |
| 17 | Wrangler | sitter | `catsGrabbed` | 3 | "{v} cats picked up" |
| 18 | Underarm | sitter | `tosses` | 2 | "Threw {v} cats. All landed on their feet." |
| 19 | Water Policy | sitter | `sprayHits` | 3 | "{v} direct hits" |
| 20 | Time-Out | sitter | `catsJailed` | 2 | "{v} cats sent to the carrier" |
| 21 | Damage Control | sitter | `undos` | 2 | "{v} disasters undone" |
| 22 | Doorman | sitter | `doorsOpened − doorsUsed` | 2 | "Opened {doorsOpened} doors. {doorsUsed} were used." |
| 23 | Footwork | sitter | `slips` | 1 | 1: "Slipped once" n: "Slipped {v} times" |
| 24 | Fur Coat | sitter | `carryTime` | 20 | "Carried cats for {t}" |
| 25 | Tidy Hands | sitter | `cleaned + tidied` | 10 | "{v} things cleaned or put back" |

**Stat definitions (P1 tracks them):**
- `escapes`: grab escapes by wiggling (not tosses or releases).
- `noodleTime`: seconds in `noodle`.
- `blockTime`: seconds loafing while the loaf blocks a mess or a spot.
- `slowPushes`: props that fell within 2 s of this cat's push tap.
- `scratchPostUses`: completed scratch-post holds.
- `standoffs`: fights called off in the staredown.
- `treatsIgnored`: treat prompts that expired uneaten (M17).
- `doorsOpened` / `doorsUsed`: M17.
- `carryTime`: seconds holding a cat.
- `tosses`, `slips`, `undos`: counts.
- v1 stats keep their meaning. `disasterPoints` = permanent points credited via `by`. Shared disasters credit every cat that worked it, split evenly.

**Selection:**
- For each award, the top player of its role wins (ties go to the earlier player in the roster), and only if value ≥ min.
- Score = value / min. Good Cat gets an infinite score. Loaf, Vocal Range and Tidy Hands get ×0.5 (filler).
- Pick by score, descending: at most 6 awards, at most 2 per player, and the sitter's best eligible award is always included. Bots can win.

---

## 6. Acceptance checks (each package, before handing back)

- `npx tsc --noEmit` is clean on your own paths.
- **P1:** a solo host round with bots ends with populated `receipt`, `disasters` and at least 3 awards. A noodle → toss → slip sequence works via the debug console. Overtime triggers when you force the meter to 92 at 0:05.
- **P2:**
  - bots visibly hop off the counter when the sitter walks in and climb back after
  - the bowl at 0.5 reads "Empty"
  - clap cancels a bot's minigame
  - the evening timeline fires every beat in a 3:00 round
- **P3:** `preview/minigames.html` shows all 10 minigames docked at 1280×800 and 1920×1080. Each is completable with the keyboard only in its nominal time ±30%. The danger indicator responds to a fake `danger()`.
- **P4:** screenshots show dusk at 0 and 1, a headlights sweep frame, the fridge note readable up close, the duck on the water, the rim-only bowl, the slip/toss/clap poses, and the noodle and tossed cat. Book dominoes chain ≥ 4 in a real swipe.
- **P5:** a screenshot of the spot cam with the docked panel at the laptop, the to-do list with one item crossed out, the owner reveal frame, one walkthrough cut with a bubble, and the results board with the receipt and awards. The new sounds are listed in `SOURCES.md`.

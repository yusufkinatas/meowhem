# MEOWHEM — design + architecture (v1)

A browser party game. One **Catsitter** keeps a house tidy until the owners get home. Up to **four Cats** turn it into a crime scene. First-person. Inspired by *Who's Your Daddy* (1 caretaker vs chaos agent, hazards, a clock), with the balance problem fixed: the sitter cannot win by stalling, because mess accumulates on its own.

Read this whole file before writing code. `src/shared/contracts.ts` is the binding interface between modules. `src/shared/toon.ts` is the shared look. `src/shared/propDefs.ts` holds prop physics + mess weights.

---

## 1. Tone

- **Funny AND cute, for everyone.** Non-cat people laugh at slapstick physics, expressive faces, a panicking human, things falling off tables. Cat people get a second layer of quiet recognition.
- **Cat-owner references stay subtle.** Show behavior, don't caption it. Good: hairballs count double on the rug, cats ignore the toy and sit in the delivery box, poop zoomies, butt wiggle before a pounce, a cat sitting exactly on the thing the sitter needs to clean, the treat bag summoning everyone from across the house, cats screaming at a closed door and not entering when it opens. **Bad (cringe, feels AI-made):** pun overload ("purrfect", "meow-velous", "cat-astrophe" in every string), meme captions ("I CAN HAZ"), lolspeak, emoji spam, explaining the joke. At most one pun per screen. UI copy is short, dry, a little deadpan.
- **Expressive like PEAK.** Big readable faces, squash and stretch, wobbly secondary motion, exaggerated poses. Not hyper-detailed, not flat low-poly: smooth rounded toy-like shapes with soft toon shading and warm outlines.

## 2. Core loop and win condition

- Round length: **6:00** (lobby options 3 / 6 / 9). 3 s countdown.
- **Mess meter 0–100%.** `mess = permanent + Σ(active cleanable mess weights) + litterBoxPenalty`, clamped.
  - **Cleanable mess** (knocked props on the floor, shards, poop, hairballs, soil, fur, puddles, TP streamers, flopping fish): each adds its weight while it exists. The sitter removes it by holding E (see `CLEAN_TIME`), knocked-over intact props are "tidied" (E 1 s, poof back to their home spot).
  - **Permanent disaster points** from big multi-step pranks. Can never be cleaned.
- **Cats win** the instant the meter hits 100%. **Sitter wins** if the owners arrive (timer 0) below 100%.
- Ending: owners' car pulls up (sound + headlights), front door opens, freeze-frame, results screen with awards. Cats-win headline vs sitter-win headline (short, dry: e.g. "The owners have questions." / "Spotless. Suspiciously spotless.").
- **Eye contact bonus**: if a cat knocks a prop off a surface while the sitter is looking at that cat (sitter camera forward · dir-to-cat > 0.9, within 12 m, line of sight), the resulting mess counts **×2** and a popup "EYE CONTACT" appears. Never explained in a tutorial, players discover it.

## 3. Roles and controls

Desktop, keyboard + mouse, pointer lock, first-person camera for both roles (the eye rides the character's collision capsule).

| Key | Cat | Sitter |
|---|---|---|
| WASD | move | move |
| Shift | zoomies (sprint, stamina) | jog (sprint, stamina) |
| Space | jump; **hold** = butt-wiggle charge → pounce (longer, higher) | small hop |
| LMB | paw swipe (knock props, poke cats) | spray bottle |
| E (hold/tap) | context interact | context interact (grab cat, clean, tidy, fix) |
| Q | meow | shake treat bag |
| R | hiss | — |
| F | loaf / sit (lie on the spot you're on) | — |
| Tab | scoreboard | scoreboard |
| Esc | leave minigame / menu | menu |

Cats: small (≈0.45 m tall incl. head), fast, jump onto sofa, tables, counters, beds, the bathtub rim; chain jumps to reach shelves / fridge top. Can go under the bed (`hideout`), sitter can't.
Sitter: ≈1.75 m, slower, stronger.

### v1 tuning (put in `src/config.ts`, playtest later)
- Cat: walk 3.2 m/s, zoomies 5.8 m/s (4 s stamina, regen 1/s after 1 s), jump v 4.8 (~1.15 m), pounce charge 0.8 s → up to v 6 + 3.5 m/s forward.
- Sitter: walk 3.0, jog 5.2 (5 s stamina), hop 0.4 m.
- Grab: range 1.4 m, 60° front cone. Grabbed cat goes limp for 0.8 s (real scruff reflex), then can wiggle: 14 key presses to escape (hiss once = +4). Sitter carry speed ×0.9. After escape/release: 3 s grab immunity.
- Carrier ("time-out"): put a carried cat in → caged 20 s. Another cat unlatches it with 2.5 s hold. Bars rattle while the caged cat mashes (mashing shortens by 0.25 s/press, max −8 s).
- Spray bottle: 8 shots, cone 3.5 m / 25°, hit = stunned 1.0 s + wet 5 s (−40% speed, droopy wet model). Refill at kitchen `sink` (2 s hold).
- Cat TV (sitter, at `tv`): cooldown 75 s. Cats in the living room or within 9 m with line of sight get **hypnotized** up to 15 s, sit facing the TV, camera pulls toward it. Mash 10 to snap out. Shows parody content (see §9).
- Treat bag (sitter, Q anywhere): cooldown 40 s. Every cat within 14 m gets a "treats?" prompt for 6 s and its head snaps toward the sitter. Cats that walk within 1.5 m get a treat (Fed buff 20 s) and are frozen eating for 1.2 s, which is exactly enough to get grabbed. Player cats choose, bots fall for it often. (Real thing: the bag sound summons cats from anywhere.)
- Doors: sitter can close/open bathroom, bedroom, office doors (E). Cats open a closed door by jumping and hanging on the handle (hold E 2 s, `hangDoor` anim). Cats near a closed door complain (`yowl`), bots sometimes walk away right after opening it.
- Poop need: fills over 50–70 s per cat (random). At 100% the cat is "gotta go": −20% speed until it poops. Pooping only works at `litterBox` (hold E 2 s, squat anim + plop + post-poop **zoomies buff** 5 s: +30% speed). Box capacity **4**. When the box is **full** (or the cat has been desperate for 15 s without reaching it), the cat may poop anywhere: big mess 6 + stink cloud. Full box itself = +4 mess while full. Sitter scoops it (hold E 2.5 s, gag face).
- Hairball: each cat can hack one every 60 s (hold E nowhere-in-particular? No: dedicated key-less: it's an action on the radial? keep simple: **double-tap R** while not near another cat). 2 s hack-hack animation, then a hairball mess (3, **×2 if on a rug**).
- Blackout (`fuseBox`): a cat flips the breaker (hold 1.5 s). All house lights off until the sitter resets it (hold 2 s). Sitter sees darkness + a phone flashlight cone. Cats see in the dark (subtle cat-vision: slightly desaturated teal, brighter). Breaker cooldown 45 s after reset. Cat work speed +15% in the dark.
- Buffs: **Fed** (food bowl 4 s eat, or treats) +25% work speed 30 s; **Catnip** (delivery) +25% move & work speed 25 s, derpy faces, wobbly camera, rainbow tint, faster meows; **Zoomies** (post-poop) +30% move 5 s; **Sun patch** stamina regen ×3 while standing in it.
- **Sit on it**: a cat that loafs (F) on top of a mess or on an interactable spot blocks the sitter from using/cleaning it until the cat is moved (grab). Cats' natural law: they sit on exactly what you need.

## 4. Interactables (spots + mechanics)

`mode`: hold = progress while holding E at 1/holdTime per second; minigame = progress comes from the minigame overlay (bots: simulated rate); instant.
Work speed multipliers stack multiplicatively (fed, catnip, dark). Multiple cats on a `shared` interactable add their progress.
**Progress is kept** when interrupted (no decay), so interrupting buys time but the sitter must also *guard*.
The sitter gets an **alert** (HUD icon + room name + pulsing marker visible through walls) whenever a disaster interactable is being worked on, and while flooding / blackout / delivery is active.

| Spot | Room | Who | What | Mode | Result |
|---|---|---|---|---|---|
| `laptop` | office | cat | Paw-typing online order | minigame `laptop`, 25 units ≈ 22 s solo | **+12 permanent** ("card charged"), delivery 15 s later at `frontDoor` with doorbell. Shared. |
| `frontDoor` | hallway | cat / sitter | Delivery package | cat: minigame `openBox` (≈4 s, shared). sitter: hold 3 s "return to sender" | Opened: random **Catnip party** (all cats Catnip buff + catnip mess +2) or **Wet food** (all cats Fed). Empty box stays as a prop cats can sit in (hiding: name tag hidden). |
| `tubFaucet` | bathroom | cat / sitter | Turn on the tap | cat: minigame `faucet` (≈8 s). sitter: hold 1.5 s to turn off | Tub fills 20 s → overflow: puddle every 4 s in bathroom/hallway. 20 s of overflow → **+15 permanent "FLOOD"**, faucet auto-stops. |
| `tpRoll` | bathroom | cat | Spin the toilet paper | minigame `tpSpin` (≈10 s), shared | **+8 permanent**, TP avalanche visual + 3 tp mess (cleanable). |
| `sofa` | living | cat | Scratch the antique sofa | hold, 3 stages × 6 s, shared | **+4 permanent per stage**, shred visual stages. |
| `scratchPost` | living | cat | Scratch the scratching post | hold | nothing. It exists. Cats ignore it (bots never use it). Cat people will get it. |
| `salmon` | kitchen | cat | Steal the owner's dinner | hold 1 s to pick up → carried in mouth (−10% speed). Drops if grabbed/sprayed. Sitter picks dropped salmon back to counter (E 1 s). | Eat at `hideout` (under the bed, hold 5 s) → **+10 permanent**. |
| `fishTank` | living | cat | Paw-fishing | minigame `fishing`: catch 3 fish | each fish = flopping `fish` mess on the floor (sitter puts it back: cleans it and restores a fish). 3 caught at once → **+10 permanent** (tank empty). |
| `curtains` | living | cat | Climb the curtains | minigame `climb` (≈10 s) | Rod collapses: **+10 permanent**. |
| `pillow` | bedroom | cat | Make biscuits on the owner's pillow | minigame `knead` | 2 fur mess on the bed + pillow visual. Repeatable every 45 s. |
| `plant` | living | cat | Dig in the big plant | hold 3 s | soil mess ×2. Repeatable after sitter cleans. |
| `litterBox` | bathroom | cat / sitter | poop / scoop | hold 2 s / hold 2.5 s | see poop rules. Kicking litter adds 1 `litter` mess per poop 50% of the time. |
| `foodBowl` | kitchen | cat / sitter | eat / refill | hold 4 s / hold 1.5 s | Fed buff. Bowl empties after 4 meals until refilled. |
| `fuseBox` | hallway | cat / sitter | blackout / reset | hold 1.5 s / hold 2 s | see blackout. |
| `carrier` | kitchen | cat / sitter | unlatch friend / jail cat | hold 2.5 s / instant while carrying | see carrier. |
| `tv` | living | sitter / cat | Cat TV on / cat sits on remote | sitter instant / cat hold 2 s turns it off | see Cat TV. |
| `sink` | kitchen | sitter / cat | refill spray / drink from the tap | hold 2 s / hold 2 s | cats: tiny "Fed" 10 s. They prefer the tap over the bowl. |
| `shoes` | hallway | cat | Sniff the sitter's shoes | hold 1 s | flehmen face (mouth open, disgusted-stunned) for 2 s. No gameplay. Easter egg. |
| `window` | living | cat | Watch birds | minigame `birdWatch` | chattering; success = "Focused" +15% work speed 20 s. |
| `laundry` | bedroom | cat | Nap in the clean laundry | hold 3 s | fur ×2 on the laundry. Cat curls up (`sleep`) until it moves. |
| `hideout` | bedroom | cat | under the bed | — | salmon eating spot; sitter can't reach, must lure (treats / TV) or wait. Max 6 s hide before you get bored (cat slides out). |
| doors | — | both | see Doors | | |

Small-mess sources without spots: knocking props (swipe, charging through), breakables shatter on hard floor impact (→ `breaksInto` mess, prop removed), hiss fights (fur ×2), poop outside box, hairballs, flood puddles.

**Meow / hiss / fights**: Q = meow (random pitch, speech-bubble "mrrp"/"MEOW" text FX, head tilt). Spamming meow near the sitter makes the sitter's face go tired (pure flavor). R = hiss: puffed fur, arched back, ears flat. If two cats hiss within 2 m of each other within 1.5 s → **fight**: both locked in a cartoon dust cloud (paws, stars, fur flying) for 4 s, minigame `fight` (mash duel). Winner gets a tiny crown FX for 10 s, loser dizzy 1.5 s. +2 fur mess. Meaningless, funny. Hissing at the sitter while grabbed adds +4 escape.

## 5. Cleanable mess

Weights in `MESS_WEIGHTS`, clean times in `CLEAN_TIME` (`src/shared/propDefs.ts`). Fallen intact props use `PROP_DEFS[k].fallenMess`. Every mess entity has an id, kind, position, yaw, scale. Mess on a rug (living room rug, bedroom rug) is flagged `onRug` (hairball ×2).

## 6. Bots (single player)

Cat bots (1–4 fill empty slots) with personalities: **Chaos Goblin** (disasters first), **Gremlin** (knocks props, poops in weird places), **Sleepy** (slow, loafs on stuff, blocks cleaning), **Opportunist** (does whatever the sitter is far from). Difficulty: Kitten / House Cat / Feral (work rate, reaction, how often they flee the sitter, fall for treats/TV). They use the nav graph, jump links, flee when the sitter approaches with intent, regroup to unlatch caged friends, meow at closed doors, fight each other occasionally for comedy. A simple **bot sitter** exists too so cats can be tested solo (patrols alerts, grabs nearest cat, cleans highest-weight mess, scoops box, turns off faucet, resets fuse).

## 7. Level: one house

Single floor, ≈ 18 m × 12 m, walls 2.6 m, cozy lived-in apartment, warm daylight through windows. Rooms: **hallway** (front door, shoe rack, fuse box, coat hooks), **living room** (big: sofa, coffee table, TV + stand, rug, bookshelf, big plant, fish tank on a cabinet, curtains on a big window with sun patch, scratching post nobody uses, side tables with lamps/frames), **kitchen** (counters with sink + stove, fridge, cutting board with salmon, mugs/plates/glasses/wine/cereal, dining table, food bowls on floor, cat carrier), **bathroom** (bathtub with faucet, toilet + TP roll, sink with mirror, litter box, washing machine), **bedroom** (bed with pillows, nightstands, wardrobe, rug, laundry basket, under-bed hideout gap), **office** (desk with laptop, chair, shelf with books/trophy, plant). Interior doors on bathroom, bedroom, office.

Many knockable props on every surface at cat-jump heights (coffee table 0.45, side tables 0.6, desk 0.75, counter 0.92, shelves 1.2–1.8 reachable by chaining). ~70 props total.

**Nav graph**: hand-placed waypoints on floors and surfaces (sofa seat, counter, desk, bed, tub rim, shelves...), `walk` links on the same level, `jump` links between levels (cats only for >0.5 m rise), door links tagged by door id, `catOnly` for under-bed. Every spot links to its nearest node.

## 8. Visual style

- **All objects come from real downloaded 3D models** (furniture, props, appliances, the cat, the sitter). Hand-built code geometry for objects looks bad and is not allowed. Only architecture (walls, floors, ceilings, door frames, window panes), water/flood sheets, FX, and small overlays (e.g. expressive eye decals on a downloaded cat head, speech bubbles) may be procedural.
- Sources must allow redistribution in a game: prefer **CC0** (Kenney, Quaternius, KayKit, Poly Pizza CC0 items), CC-BY is OK with attribution in `CREDITS.md`. No login-walled or non-commercial assets. GLB/glTF preferred (FBX/OBJ only if converted). Keep the total under ~40 MB.
- Assets live in `public/models/<category>/...` with `public/models/manifest.json` describing each: key, file, license, author, source URL, scale to meters, y-offset, forward-axis fix, animation clip names. Loaded once at startup by an async preloader, then cloned (`SkeletonUtils.clone` for rigged).
- Style consistency matters more than fidelity: pick one or two families of assets that look like they belong together (similar shading, rounded, colorful). Re-material them with `toon()` if that unifies the look, or keep their PBR/vertex colors if they already look good under our lighting. Decide by screenshots.
- `toon()` materials + `addOutline()` from `src/shared/toon.ts`. Warm palette: honey wood floors, cream/sage/terracotta walls, pastel furniture, white trims. Soft warm hemisphere + key directional light (soft shadows, 2048 map, covers the house), slight fog-free. ACES tone mapping, sRGB.
- Characters dominate silhouettes: thicker outlines (0.012–0.02) than furniture (0.006–0.01 or none on big walls).
- **Cat**: chibi proportions, head ≈ 45% of height. Huge eyes with highlights, pupils dilate (focus/pounce/catnip) and slit (angry). Eyelids for blinks and moods. Small pink nose, ω mouth, whiskers, triangle ears that rotate (flat when hissing, perk when interested), fluffy springy tail (chain with lag), stubby legs, **pink toe beans** visible under the paws when they lift (swipe, grabbed dangling, loaf stretch). Procedural animation: gait, body bob, squash/stretch on jump/land, ear twitches, random blinks, tail swish, idle → loaf after 6 s, random blep, groom paw-lick idle. Grabbed by scruff: limp, legs straight down, tail curled, `unimpressed` face. Wet: smaller fluff, darker, droopy ears. Puffed: big spiky silhouette, arched back. Customization: pattern + colors + eyes + accessory + chonk.
- **Sitter**: PEAK-style chunky, bean body, large head, simple big eyes + brows + mouth that do a LOT (panic, gag, smug, tired), noodle arms swinging, mitten hands, hoodie + sneakers. Carries the cat at arm's length by the scruff, held up like evidence. Spray pose, despair pose when a disaster lands, celebrate.
- FX: cartoon (sprites/billboards/instanced low-count meshes), never particle soup. Fight cloud is a big rolling dust ball with paws and stars poking out.

## 9. Cat TV shows (canvas animation, easter eggs, ~10–15 s loops)

`birds` (the actual cat TV: birds hopping, squirrel), `rickAndMeowty` (scientist cat with a drool line, nervous sidekick kitten, green portal, burp subtitle, never names the original), `planetMearth` (nature doc: a cat watching a cat watching a laser dot, calm subtitles), `cucumber` (cooking show: chef places a cucumber behind a cat, cut to black "Viewer discretion advised"), `laserDot` (just a red dot, high production value), `cookingShow` (tuna can opening in slow motion, the sound would wake any cat). Subtitles small, deadpan.

## 10. Audio

All synthesized with WebAudio (no files). Meows: formant/pitch sweeps with variation per cat (pitch per player). Hiss: filtered noise. Purr: low AM rumble. Short UI blips. Light background music: cozy lo-fi/jazzy loop, tense layer when mess > 75% or under 60 s, wobbly variant when catnip. Positional audio for world sounds.

## 11. Architecture

TypeScript + Vite + three.js + @dimforge/rapier3d-compat + peerjs. No other runtime deps.

### Authority model
- The **host** runs the authoritative sim: game rules, Rapier world with dynamic props, mess, interactables, bots, timer, mess meter. Single player = a host with no peers (loopback transport). One code path.
- **Character motion is owner-simulated**: whoever owns a character (host for its own player + bots, a client for its player) runs that character's kinematic controller locally against a local Rapier world (static level + kinematic prop proxies) for zero-latency movement, and sends its transform to the host at 30 Hz. The host moves a kinematic proxy so the character still pushes props and is in range for grabs/interactions.
- Everything else (swipes, interactions, minigame progress, grabs, sprays, meows) is an **action message** to the host, which validates and applies.
- When the host forces a character state (grabbed, caged, hypnotized, stunned, teleport on release), the owner obeys the host flags: controller frozen or positioned from host data.
- Host → clients: **snapshot** at 20 Hz (characters, moving props, mess list delta or full, game state, world visual keys, alerts, progress) + **reliable events** (fx, sound, toast, popup, minigame open/close, end). Clients interpolate other entities ~100 ms behind.
- Transport: `PeerJS` DataConnections. Host peer id `meowhem-<CODE>` with a 4-letter room code (no ambiguous letters). Clients connect to it. Loopback transport for local player on host.

### Module map and ownership
- `src/shared/*` — contracts, toon look, prop defs (shared, edit only additively)
- `src/main.ts`, `src/config.ts`, `src/core/**`, `src/net/**`, `src/sim/**`, `src/client/**`, `index.html`, `src/style.css` — foundation (engine, sim, net, client view, camera, input, HUD, menus)
- `src/registry.ts` — the ONLY place that imports concrete asset modules (models, level, fx, audio, tv, minigames). Foundation starts it with placeholders from `src/dev/**`; integration swaps to real modules.
- `src/sim/interactables/*.ts` — one file per interactable, self-registering (loaded via `import.meta.glob`, eager). Adding content never edits a shared list.
- `src/sim/bots/**` — bots
- `public/models/**`, `public/models/manifest.json`, `src/assets/loader.ts`, `CREDITS.md` — downloaded 3D assets + the loader:
  `loadAssets(onProgress?): Promise<void>`, `hasModel(key): boolean`, `cloneModel(key): THREE.Group` (a wrapper group already scaled to meters, origin at feet / collider center for props, facing +Z; rigged models cloned with SkeletonUtils), `getClips(key): THREE.AnimationClip[]`, `modelInfo(key): ManifestEntry | undefined`.
- `src/models/cat.ts`, `src/models/sitter.ts`, `src/models/props.ts` — wrappers that turn loaded models into the contract APIs (animation mixer + procedural expressiveness on top). `props.ts` also exports `createMessMesh`.
- `src/world/**` — level geometry, furniture, nav, world visual keys
- `src/fx/**`, `src/audio/**`, `src/tv/**`, `src/minigames/**`
- `preview/*.html` + `preview/*.ts` — standalone dev pages per module (dev server only), used for screenshots.

### Asset factory signatures (registry)
```ts
preloadAssets(onProgress?: (p01: number) => void): Promise<void>  // must resolve before any factory below is called
createCatModel(look: CatLook): CatModelApi
createSitterModel(look: SitterLook): SitterModelApi
buildLevel(): LevelData
createPropMesh(kind: PropKind): THREE.Object3D   // origin = collider center
createMessMesh(kind: MessKind): THREE.Object3D   // origin = floor contact point
createFx(scene: THREE.Scene): FxApi
createAudio(): AudioApi
createCatTv(): CatTvApi
openMinigame(kind: MinigameKind, host: MinigameHost): MinigameApi
```

### World visual keys (`snapshot.world`, applied via `level.setVisual`)
`lights` bool · `fuse.flipped` bool · `tub.running` bool · `tub.water` 0..1 · `flood` 0..1 (bathroom + hallway water sheet) · `sofa.shred` 0..3 · `tp.unrolled` 0..1 · `tp.avalanche` bool · `tank.fish` 0..3 · `curtains.climb` 0..1 · `curtains.down` bool · `litter.fill` 0..1 · `litter.stink` bool · `laptop.screen` 'off'|'idle'|'hacking'|'ordered' · `laptop.progress` 0..1 · `pillow.knead` 0..1 · `plant.dug` 0..1 · `carrier.closed` bool · `carrier.occupied` bool · `tv.on` bool · `foodBowl.fill` 0..1 · `window.birds` bool · `frontDoor.open` 0..1 (owners arriving at the end).

## 12. Conventions for every agent

- Units meters, Y up, yaw 0 faces +Z, model roots at feet (props: collider center).
- Strict TypeScript, no `any` leaks across module boundaries (internal `any` is OK if pragmatic). No new npm dependencies.
- Only edit files you own (see module map). If you need something from another module, code against `contracts.ts`; never import another in-progress module directly except through `registry.ts`.
- Performance target: 60 fps on a MacBook Air in Chrome. Share geometries/materials, ≤ 1 shadow-casting light, instancing for repeated small things, no per-frame allocations in hot paths.
- Verify your own work: `npx tsc --noEmit` filtered to your files, and screenshots through the `agent-browser` skill against your own Vite dev server on your assigned port (`npx vite --port <PORT> --strictPort`, run it in the background and kill it when done).
- Keep comments short. Mark deliberate corner-cuts with `// ponytail: <ceiling>, <upgrade path>`.

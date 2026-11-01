# MEOWHEM brainstorm: the cat-owner insider lens

Design only, no code. Every idea below is a real thing cats do. Each one has to work on two levels: a cat owner recognizes it instantly, and someone who has never had a cat still sees a cute or funny animal doing something. Nothing gets captioned. The only popup text in the game stays "EYE CONTACT" (DESIGN.md §2).

**Subtlety scale**
- **Invisible**: only cat owners notice it. Everyone else sees normal cat animation.
- **Quiet**: anyone can see it, nothing explains it.
- **Loud**: a visible mechanic, still never named on screen.

**Cost scale** (within the current architecture)
- **S**: an hour or two. One interactable file, a bot rule, a procedural pose, an FX call, a world visual key.
- **M**: about half a day. Touches 2–3 modules (sim + model + bots), or needs a new `CatAnim` member (allowed, the union is additive).
- **L**: a day or more. New entity type, new net state, or a new downloaded asset that has to be found, licensed and styled.

**Asset rule (from the user):** any idea that needs a new object needs a **downloaded** model (CC0 first, CC-BY with `CREDITS.md`). If no fitting model turns up, cut the idea. Never build the object from boxes and cylinders. Decals on existing models (nose smudges, scratches, a sticker, a paper note) are surface detail, not objects, and are fine.

---

## 0. Build these first (best laugh per hour)

1. **Noodle Mode** (#1): go limp and purr while carried, the sitter slows down. A new way to fight back by being cute.
2. **Hork Alarm + Rug Seeker** (#14): the hairball sound carries across the whole house and the hacking cat drifts toward the rug.
3. **The Half-Empty Bowl** (#16): a bowl with its center showing counts as empty.
4. **Hears the Car First** (#21): every cat's ears turn to the front door a few seconds before the owners arrive.
5. **Counter Innocence** (#17): bots hop off the counter when the sitter walks in and jump straight back up when they leave.
6. **Fridge note + sticker still on the post** (#11, #8): two decals that set up the whole house.
7. **The staredown that doesn't end in a fight** (fight minigame): the most realistic cat fight is no fight at all.
8. **Roll your hand across the keyboard** (laptop minigame): the player physically becomes a cat on a keyboard.
9. **Awards with dry stat lines** (§3): "3 hairballs. 3 on the rug."

---

## 1. Principles for this lens

- **The cat is never wrong.** The joke always lands on the house or the human, never on the cat being dumb.
- **Show the behavior, never the label.** No "Zoomies!" popup. The zoomies are the label.
- **Every insider joke still needs a surface joke.** The hairball-on-the-rug joke only works because hacking is also a funny animation.
- **Cuteness as a weapon needs a cooldown.** The cats stall the sitter by being adorable (Noodle Mode, Floor Bunt, Belly Trap, Gift). Every one gets a cooldown and a counter so the sitter player feels charmed, not robbed.
- **No real harm to cats, ever.** Cartoon spray stuns are fine. Washing machines, dryers, cucumber jump scares as a mechanic, and injuries are not.

---

## 2. Ideas (39)

### A. Cuteness as a weapon

#### 1. Noodle Mode
- **Real:** some cats give up struggling, go boneless and start purring when held. Some knead the air.
- **In game:** a grabbed cat that presses nothing for 2.5 s after the limp reflex switches to purring. Eyes half-closed, front paws knead the air, `talk: 'purr'`. While it purrs, the sitter's carry speed drops from ×0.9 to ×0.65 and the sitter's face drifts to `happy`. Any wiggle input ends it. Players now choose between escaping (mash) and stalling (purr) so their friends get more time elsewhere.
- **Why it lands:** the sitter is clearly melting while trying to stay strict. Air biscuits are adorable even if you have never seen them.
- **Subtlety:** Quiet. No prompt and no tutorial. Players find it by accident when they stop mashing.
- **Cost:** M. Sim rule in the grab/carry state, a `knead` variant while `grabbed` in cat.ts, sitter face blend.

#### 2. Floor Bunt
- **Real:** the moment you crouch to clean something, a cat walks over and head-butts your face.
- **In game:** a cat taps E on a sitter who is in the `clean` or `scoop` pose. The cat bunts the sitter's head: cleaning progress pauses for 1.2 s (progress is kept), `hearts` FX, sitter face `happy`. Cooldown 12 s per cat, and the sitter can't be bunted again for 3 s.
- **Why it lands:** the cats are helping. They are not helping.
- **Subtlety:** Quiet.
- **Cost:** S–M. Cat-side interaction against a character instead of a spot, a short head-push pose.

#### 3. Belly Trap
- **Real:** the cat rolls over and shows its belly. You touch it, it grabs your arm with all four legs and bunny-kicks.
- **In game:** double-tap F means flop on your side, belly up (max 5 s, cooldown 25 s). If the sitter tries to grab a belly-up cat, the grab fails: the cat hugs the arm and bunny-kicks for 1.2 s, the sitter plays `stunned` + `shock` face + `sweat` FX, then the cat runs off with the normal 3 s grab immunity. Counterplay: wait 5 s, or spray it.
- **Why it lands:** it's a trap everyone falls for, cat people included, in real life.
- **Subtlety:** Loud as a mechanic, but nothing tells you. Sitter players learn it the hard way, once.
- **Cost:** M. New `CatAnim` members `bellyUp` + `bunnyKick`, grab-validation rule on the host.

#### 4. Slow Blink
- **Real:** a slow blink means "I trust you". Owners slow-blink back.
- **In game:** cat holds Q while standing still means a slow blink instead of a meow (eyelids close over 0.8 s, reopen). If the sitter is looking at that cat (reuse the eye-contact check) and stands still for 1 s, both faces go soft: cat `love`, sitter `happy`, one small heart. No gameplay effect at all.
- **Why it lands:** two players in a grudge match sharing one quiet moment, then going right back to war.
- **Subtlety:** Invisible to non-owners (it's just a blink), and a little moment for those who know.
- **Cost:** S. Eyelid control already exists in the cat face spec.

#### 5. Underfoot
- **Real:** figure-eights around your ankles while you prepare food. You shuffle so you don't step on anyone.
- **In game:** when the sitter refills the bowl, carries the salmon back or is within 1.5 m of the food bowl, bots within 1 m weave between the sitter's legs. Any cat (player or bot) under the sitter's feet while the sitter **jogs** causes a 0.4 s stumble: arms windmill, no fall. Walking through cats only slows the sitter (×0.6). Counter: just walk.
- **Why it lands:** pure physical comedy, and every owner has done the shuffle.
- **Subtlety:** Quiet.
- **Cost:** M. Bot weave path (orbit target), sitter stumble pose, host check on capsule overlap at jog speed.

#### 6. Gifts
- **Real:** cats bring you "prey" (a toy mouse, a sock) and drop it at your feet or in your shoe. At night they carry a sock around the house making a strange muffled yowl.
- **In game:** cats pick up `toyMouse` or `sock` (carryMouth and `carrying` already exist). While carrying, Q becomes a muffled, low, lowpassed yowl instead of a meow. Dropping it within 1 m of the sitter: the sitter's face goes `happy` for 1 s (control is kept), the item stays on the floor as small mess (0.5). Dropping a sock at the `shoes` spot puts it into the sitter's shoe (counter for the Provider award, nothing else).
- **Why it lands:** the cat is so proud. The sock yowl is one of the strangest sounds a cat makes and owners know it the second they hear it.
- **Subtlety:** Invisible (the sock yowl) to Quiet (the gift).
- **Cost:** M. Pickup for small props, the sound variant (meow with lowpass + pitch down), drop rule.

### B. The house tells on the cats (environment)

#### 7. Nose Prints
- **Real:** windows and the oven door have nose smudges at exactly cat height.
- **In game:** a few faint smudge decals on the living room window and the oven glass at 0.25–0.35 m. Every time a cat bonks the window in the birdWatch minigame (see minigames), a new smudge appears where it hit, and it stays for the round.
- **Why it lands:** the house keeps a quiet record of what happened.
- **Subtlety:** Invisible.
- **Cost:** S. Decal planes on existing glass, a world visual key `window.smudges` 0..n.

#### 8. The Sticker Is Still On the Post
- **Real:** the expensive scratching post sits there untouched. Cats scratch the sofa.
- **In game:** the scratch post (already an interactable that does nothing) keeps its shop sticker as a decal on the base. If a player ever actually scratches it, every bot stops and looks at that cat for 1 s, once per round.
- **Why it lands:** the post is pristine and the sofa is shredded right next to it. The bots staring is a joke you only get if you try the post.
- **Subtlety:** Invisible (sticker), Quiet (stare).
- **Cost:** S. Decal + one bot reaction rule.
- **Optional pair:** an unused plush cat bed next to it, but **only** if a CC0/CC-BY cat bed model turns up. The search so far only found marketplace models (CGTrader, Coohom) with licenses that don't fit. No bed is fine.

#### 9. Door Scratches
- **Real:** the bottom of a door a cat screams at every night is scratched up.
- **In game:** scratch decal at the bottom of the bedroom door, cat side only. The bathroom door gets fresher scratches when cats yowl at it during the round.
- **Why it lands:** it tells you this happens every night.
- **Subtlety:** Invisible.
- **Cost:** S.

#### 10. Fur on the Hoodie
- **Real:** cat owners' dark clothes are permanently covered in fur.
- **In game:** every second the sitter carries a cat adds fur specks to the hoodie (a speck texture blended into the shirt material, 0..1). The specks take the colors of the cats that were carried, so an orange cat leaves orange fur on a dark hoodie. The end screen shows the sitter in that state.
- **Why it lands:** you can see who got carried the most by looking at the sitter.
- **Subtlety:** Quiet.
- **Cost:** S–M. Shader mix on the sitter's shirt material, per-cat color accumulation.

#### 11. The Fridge Note
- **Real:** owners leave the sitter long notes on the fridge.
- **In game:** one handwritten paper note decal on the fridge, readable only when you walk right up to it. Three lines max. Proposed copy:
  > Half a pouch each at 6. They will lie.
  > Litter: scoop once a day, they are very particular.
  > Scratching post is new!!
- **Why it lands:** it reads like a real owner wrote it. Each line gets contradicted by the game (the lying, the box, the post) without anyone pointing it out.
- **Subtlety:** Quiet. Never shown in a popup or the tutorial. Most players never read it, and that's fine.
- **Cost:** S. Canvas texture on a plane against the downloaded fridge.

#### 12. Every Photo Is of the Cats
- **Real:** owners' photos are all of the cat.
- **In game:** the `frame` props and a wall frame show the players' actual cats, rendered once at round start (render-to-texture of each player's downloaded cat model, posed sitting, in their customization). One frame shows a cat wearing the cone.
- **Why it lands:** you knock your own portrait off the shelf.
- **Subtlety:** Quiet.
- **Cost:** M. Offscreen render of the cat models into textures, applied to the picture plane of the downloaded frame model.

#### 13. The Water Bowl Nobody Uses
- **Real:** cats ignore their water bowl and drink from the tap or your glass. They also drop toys into the water bowl.
- **In game:** a full, untouched water bowl (existing `bowl` prop) sits next to the food bowl all round. Bots never drink from it. A cat that drops a `toyMouse` into it makes a splash and a `puddle` mess.
- **Why it lands:** it's the scratch post joke for water, and the drowned mouse is a classic.
- **Subtlety:** Invisible.
- **Cost:** S.

### C. Behaviors as mechanics

#### 14. Hork Alarm + Rug Seeker
- **Real:** the hairball hack ("hork hork hork") wakes owners from deep sleep. They sprint across the house to lift the cat off the rug, and the cat walks forward while hacking, toward the rug.
- **In game:** (extends §3 hairball) during the 2 s hack the cat creeps forward at ~0.3 m/s and the player can steer. Bots steer toward the nearest rug. The `hairball` sound is positional but audible across the whole house at 70%. If the sitter grabs a cat mid-hack, the hairball still happens, in the air, and lands at the sitter's feet (`gag` face). The sitter saved the rug, lost the shoes.
- **Why it lands:** the sound alone makes owners flinch. Non-owners get a frantic race against a gross noise.
- **Subtlety:** Invisible (the steering) to Loud (the race).
- **Cost:** S. Movement during the hairball state, a sound range override, grab rule.

#### 15. Fresh Box Rush
- **Real:** the moment you finish scooping the litter box, a cat walks in and uses it.
- **In game:** after a scoop, the box is "fresh" for 10 s. Bots with poop need above 50% head straight to it. Pooping in a fresh box gives 7 s of zoomies instead of 5. The sitter hears the scratching just as they walk away.
- **Why it lands:** perfect timing, every time.
- **Subtlety:** Invisible.
- **Cost:** S. A timestamp on the litterBox interactable and a bot weight.

#### 16. The Half-Empty Bowl
- **Real:** the bowl still has food around the edges, but the center is visible, so as far as the cat is concerned it's empty.
- **In game:** at `foodBowl.fill` ≤ 0.5 the level shows kibble only around the rim. Cats treat that as empty: eating gives nothing, and bots sit next to the bowl and meow at the sitter. The sitter can tap E at the bowl to shake it (0.5 s), which covers the center, and the bowl counts as full again for one meal.
- **Why it lands:** the owner recognition here is huge. For everyone else, the sitter shakes a bowl and the cats are happy again, which is cute and a bit absurd.
- **Subtlety:** Invisible (the rule), Quiet (the shake).
- **Cost:** S–M. Bowl visual state (kibble uses the downloaded food mess model or a kibble texture on the fill surface), one sitter action.

#### 17. Counter Innocence
- **Real:** the cat jumps off the counter the moment you walk in, sits on the floor looking innocent, and is back up the second you leave.
- **In game:** bots on a counter, table or desk drop to the floor and sit with a `neutral` face when the sitter enters the room or comes within 5 m. They jump back up 2–4 s after the sitter leaves.
- **Why it lands:** the sitter player turns around and the cat is back up. Comedy timing done by the AI.
- **Subtlety:** Quiet.
- **Cost:** S–M. Bot behavior using existing room data and nav jump links.

#### 18. The Slow Push
- **Real:** tap, tap, tap the glass toward the edge, while looking you in the eye.
- **In game:** holding LMB (instead of tapping) on a prop near a surface edge makes the cat do small paw taps (0.4 s each, ~4 cm per tap, toe beans visible). If the sitter is visible, the cat's head turns to look at the sitter between taps (`lookAt`). It stacks naturally with the existing EYE CONTACT ×2.
- **Why it lands:** it's the most famous cat behavior there is, and here you perform it yourself, on purpose, at your own pace.
- **Subtlety:** Loud (it's the meme), but nothing labels it.
- **Cost:** M. Small impulses on the host, a tap pose, a head-look in cat.ts.

#### 19. Ankle Ambush
- **Real:** cats hide behind doors and corners and attack your ankles as you walk by.
- **In game:** a pounce charged to at least 70% that lands within 0.6 m of the sitter's legs, from behind or from a hiding spot (under the bed, behind the sofa, the box), makes the sitter stumble for 0.8 s (arms windmill, `shock` face). The cat clings for 0.5 s, then bounces off. Cooldown 20 s per cat. The sitter can't be stumbled again for 6 s.
- **Why it lands:** the butt wiggle pays off. Hiding and waiting for the human is very cat.
- **Subtlety:** Loud.
- **Cost:** M. Host hit test on pounce landing vs the sitter capsule, a cling pose.

#### 20. Doorman
- **Real:** the cat screams at a closed door. You open it. The cat sits and looks at it. Or it walks halfway through and stops, so you can't close the door.
- **In game:** (extends §3 doors) yowling at a closed door escalates every 3 s, and the cat lies down and reaches one paw under the door, visible from the other side. When the door opens, bots sit and look at the opening for 2 s, then 40% walk away and 30% stop halfway through with their tail in the doorway. A door won't close while a cat is in the doorway.
- **Why it lands:** the paw under the door is cute to everyone. The sitter opening doors for nothing is a running gag that pays off in the Doorman award.
- **Subtlety:** Quiet.
- **Cost:** S–M. Bot rule, a `reachUnder` pose (front leg extended) on the rigged cat, door-blocking check.

#### 21. Hears the Car First
- **Real:** cats know the owner's car. They run to the door before the humans hear anything.
- **In game:** 8 s before the timer hits 0, every cat's ears rotate toward the front door and their heads snap that way for 1 s. Bots drop what they're doing and trot toward the hallway. The sitter hears the car at 4 s (existing `carArrive`).
- **Why it lands:** the cats know before you do. It also gives the ending a beat of buildup.
- **Subtlety:** Invisible to most players on the first round. Sitter players start watching for it.
- **Cost:** S. One timed event, `lookAt` on every cat, a bot override.

#### 22. The Sun Patch Moves
- **Real:** the sun patch crawls across the floor through the day and the cat scoots along with it.
- **In game:** the living room sun patch slides about 3 m across the floor over the round (world key `sun.t` 0..1, the sim updates the patch center). Cats loafing in it do a small scoot every so often to stay inside. Bots re-loaf to follow it.
- **Why it lands:** the cat looks like it's shuffling along with the light.
- **Subtlety:** Invisible.
- **Cost:** M. `sunPatches` is static in `LevelData` today, so the light decal has to move and the sim has to update the center from the same key.

#### 23. Dusk
- **Real:** cats are most active at dusk and dawn. The house goes wild when the light turns orange.
- **In game:** in the last 90 s the window light warms toward orange (world key `time.dusk` 0..1). Cats' pupils dilate and they get +10% move speed. No HUD buff icon, the light is the cue. It also sets up the owner's headlights at the end.
- **Why it lands:** the round's last minute feels different and nobody tells you why.
- **Subtlety:** Invisible.
- **Cost:** S–M. Light color lerp in the level, a pupil-size parameter, a speed multiplier.

#### 24. Cat Stack
- **Real:** two cats, one bed, so one sleeps on top of the other. The bottom one looks resigned.
- **In game:** pressing F on top of a loafing cat loafs on it. Bottom cat face `unimpressed`, top cat `happy`. Both count as "sit on it", so the sitter has to grab twice. Max 2 high.
- **Why it lands:** the bottom cat's face.
- **Subtlety:** Quiet.
- **Cost:** M. Top cat position follows the bottom cat (both controllers are frozen while loafing, so net is simple), stack exit rules.

#### 25. The Tail Gives It Away
- **Real:** the cat "hides" behind the curtain. The tail sticks out at the bottom and swishes.
- **In game:** loafing behind the living room curtains hides your name tag (like the empty box). The downloaded curtain model covers the cat but not the tail, which hangs out underneath and swishes. Bots and sitter players can spot it.
- **Why it lands:** the cat thinks it's invisible.
- **Subtlety:** Quiet.
- **Cost:** S–M. A hide volume behind the curtain, name-tag hide (already exists for the box), a tail swish that keeps going while loafing.

#### 26. If It Fits
- **Real:** cats loaf in anything roughly cat-sized. Bowls, boxes, sinks.
- **In game:** extra loaf targets besides the box and laundry: the bathroom sink basin, the fruit bowl on the dining table, a shoebox by the shoe rack. The cat curls into the container (loaf + squash to fit). At chonk ≥ 0.7 it squashes less and the belly hangs over the rim. Loafing in any container gives ×2 stamina regen, like a small sun patch.
- **Why it lands:** a chonky cat overflowing a fruit bowl is funny to absolutely everyone.
- **Subtlety:** Quiet.
- **Cost:** S. Loaf anchors on the containers. **Asset:** fruit bowl and shoebox must be downloaded (Kenney/Quaternius/Poly Pizza CC0); the open cardboard box already exists for the delivery.

#### 27. The Throne
- **Real:** the top of the fridge or the wardrobe is where the cat watches you from, one paw dangling, out of reach.
- **In game:** the highest perches (fridge top, wardrobe top, bookshelf top) are out of the sitter's grab reach. A cat loafing there gets one front paw hanging over the edge, a `sleepy` or `smug` face and a tail hanging down and swishing. The sitter has to spray or lure it down.
- **Why it lands:** it reads as royalty.
- **Subtlety:** Quiet.
- **Cost:** S. A pose variant when loafing on a node flagged `high`, a grab reach check.

#### 28. The Misjudged Jump
- **Real:** sometimes a cat comes up a little short, grabs the edge with its front paws and scrambles with its back legs. Then it acts like it meant to.
- **In game:** if the jump apex lands within 15 cm below a ledge, the cat catches the edge with its front paws and the back legs pedal for 0.5 s. Holding W pulls it up, letting go slides it off.
- **Why it lands:** this is PEAK. Struggling to climb something is the funniest thing in that game.
- **Subtlety:** Quiet.
- **Cost:** M. A ledge check in the controller, a new `CatAnim` `scramble`.

#### 29. Bonk, Then Groom
- **Real:** after falling off something, the cat sits down and licks its chest like nothing happened.
- **In game:** after hitting a wall at zoomies speed or a clumsy landing from more than 1 m, the next time the player stops giving input, the cat plays one quick chest lick (0.6 s, interrupted by any input). It never takes control away.
- **Why it lands:** dignity, restored.
- **Subtlety:** Invisible.
- **Cost:** S. A flag on the cat state, a groom idle that already exists in the cat spec.

#### 30. Pspsps
- **Real:** humans go "pspsps". Cats acknowledge it with one ear and nothing else.
- **In game:** the sitter's R key (currently unused) makes a whispered "pspsps" sound, no cooldown. Cats within 10 m twitch one ear toward the sitter and do nothing else. Bots walk over 10% of the time and sit 1.6 m away, just out of grab range.
- **Why it lands:** the sitter will spam it, it will never work, and the bot that sits just out of reach is the punchline.
- **Subtlety:** Quiet.
- **Cost:** S. Synth sound (filtered noise bursts), an ear-turn parameter, one bot rule.

#### 31. Staring at Nothing
- **Real:** cats stare intently at an empty corner of the ceiling.
- **In game:** now and then in their idle time, bots stare at an empty upper corner for 3 s, ears forward, head slowly tracking something that isn't there. If two bots are nearby, sometimes they both stare at the same corner.
- **Why it lands:** sitter players will turn around and look too. Mildly spooky, mostly funny.
- **Subtlety:** Invisible.
- **Cost:** S. Bot idle behavior, `lookAt` on a moving point.

#### 32. Dream Twitches
- **Real:** sleeping cats twitch their paws and whiskers and make tiny chirps.
- **In game:** cats in `sleep` (laundry, Sleepy bots) twitch a paw or whiskers every few seconds and let out a small `chirp` at low volume.
- **Why it lands:** pure cute. Makes waking them (grabbing) feel a bit mean.
- **Subtlety:** Invisible.
- **Cost:** S.

#### 33. Carrier Starfish
- **Real:** a cat that sees the vet carrier spreads all four legs and braces them against the door frame.
- **In game:** a carried cat within 1.2 m of the carrier splays all four legs. Putting it in now takes a 0.6 s hold for the sitter instead of being instant, and wiggling during the starfish counts double toward escape.
- **Why it lands:** it's a starfish. It's also the most relatable moment for any owner.
- **Subtlety:** Quiet.
- **Cost:** S–M. A `starfish` pose (leg bones spread on the rig), one sim timing rule.

#### 34. Groom a Wet Friend, Then Bite Them
- **Real:** cats groom each other, and the grooming often ends with a sudden bite.
- **In game:** E on a wet friend grooms them: they dry 2× faster, both purr. 25% of the time the groom ends with a bite: a tiny 1.5 s `fightCloud` with no minigame, +0.5 fur.
- **Why it lands:** a sweet moment that turns into a fight for no reason.
- **Subtlety:** Quiet.
- **Cost:** M. Cat-on-cat interaction, the bite roll, a short FX.

#### 35. The Dinner Clock
- **Real:** cats know dinner time to the minute and will tell you about it.
- **In game:** a kitchen wall clock counts toward the owners' return (also handy as an in-world timer). When it hits "6" (around 2:00 left), if the food bowl is empty or half-empty (#16), bots follow the sitter around meowing in chorus, and every cat gets +10% work speed until someone refills the bowl. If the bowl was full, nothing happens.
- **Why it lands:** a parade of yelling cats behind the sitter.
- **Subtlety:** Quiet. The cats tell you, no HUD text.
- **Cost:** S–M. Timed event + bot follow. **Asset:** the wall clock must be downloaded (CC0 search on Kenney/Quaternius/Poly Pizza), and the clock hands rotate on the downloaded model.

#### 36. Human Names for Cats
- **Real:** people give cats human names, and it's funny every time.
- **In game:** default bot names mix human names (Gerald, Linda, Kevin, Susan, Dennis, Brenda) with real cat names (Mochi, Bean, Pickle, Toast, Olive, Miso, Noodle, Tofu, Pumpkin). Never "Mr. Whiskers", "Sir Fluffington" or puns.
- **Why it lands:** "Gerald knocked the vase off" is a funny sentence.
- **Subtlety:** Quiet.
- **Cost:** S. A name list.

#### 37. The End Freeze-Frame
- **Real:** when the owner gets home, the cats run to the door with their tails up, acting like perfect angels. Or they yell as if they haven't eaten in days.
- **In game:** cats win: the front door opens and the camera pans over the disaster, and every cat strikes a tail-up sit facing the door with a `happy` face (one is still in mid-air next to a falling glass). Sitter wins: the house is spotless and every cat meows at the owners in chorus, while the sitter holds one cat by the scruff like evidence.
- **Why it lands:** either the house is wrecked and the cats are angels, or the house is clean and the cats are telling on the sitter.
- **Subtlety:** Quiet.
- **Cost:** M. End camera + pose override for each cat.

#### 38. The Glass on the Nightstand
- **Real:** cats drink from your water glass: head in the glass, or a paw dipped in and licked.
- **In game:** the owner's water glass on the bedroom nightstand (existing `glass` prop). E near it for 1.5 s: the cat dips a paw and licks it, then puts its head in the glass. Half the time the glass gets knocked over on the way out.
- **Why it lands:** drinking from everything except your own bowl.
- **Subtlety:** Invisible.
- **Cost:** S. A prop-level interaction (no new `SpotId` needed if it targets the `glass` prop near the nightstand).

#### 39. Robot Vacuum (big, asset-dependent)
- **Real:** cats flee from the vacuum. Some ride the robot vacuum. And every robot-vacuum owner with a cat has a story about it running over poop.
- **In game:** a robot vacuum docked in the hallway. The sitter taps E on the dock and it cleans one room for 30 s, slowly picking up fur/litter/food/soil in its path. Cats within 1.5 m puff and hop away (bots flee, players just get the `shock` face). A cat that jumps on top rides it: it stops cleaning and drives randomly, bumping props off things. If it drives over poop, the poop turns into three smears along its path (three small `poop` messes, higher total weight).
- **Why it lands:** a cat riding a vacuum is cute to everyone. The poop smear is a niche horror that owners will scream at.
- **Subtlety:** Loud (the ride), Invisible (the smear).
- **Cost:** L. New entity on nav, host-owned motion, rider attachment, cleaning logic. **Asset:** needs a downloaded low-poly robot vacuum. One lead: "Robot Vacuum Low-Poly" by pawsgineer on itch.io (glTF, ~1.7k tris, real-world size). Check its license before using it. If no redistributable model fits the style, cut the whole feature.

---

## 3. End-screen awards

Format: one to three words, a dry stat line under it, never a sentence with an exclamation mark. An award with nothing to report doesn't show up.

| Award | Goes to | Stat line example |
|---|---|---|
| **Load-Bearing** | most seconds sitting on something the sitter needed | "52 s on things that needed cleaning" |
| **Eye Contact** | most mess knocked off while watched | "6 items, maintained eye contact" |
| **Aim** | hairballs on rugs | "3 hairballs. 3 on the rug." |
| **Liquid** | most grab escapes | "Escaped 5 times" |
| **Fits** | most time in containers | "1:40 in boxes, bowls and sinks" |
| **3 A.M.** | most distance at zoomies speed | "1.1 km at full speed" |
| **Provider** | most gifts delivered | "2 socks, 1 mouse, all for you" |
| **Unbribable** | ignored the most treat bags in range | "Ignored 4 treat bags" |
| **Express Shipping** | most laptop progress | "Ordered 2 packages" |
| **Good Cat** | used the scratching post at all | "Once." |
| **Doorman** (sitter) | opened doors for cats | "Opened 7 doors. 2 were used." |
| **Fur Coat** (sitter) | carried cats the longest | "Carried cats for 1:42" |

Headlines (already in DESIGN.md) stay: "The owners have questions." / "Spotless. Suspiciously spotless."

---

## 4. Minigames for the existing MinigameKinds

**Rendering note.** Following the user's asset rule, a minigame shouldn't draw cats, fish or taps out of DOM boxes. Best option: the overlay is a see-through HUD (key prompts, meters, a progress ring) on top of a close-up camera on the real spot, with the real downloaded models. That needs one optional host hook (foundation's call, e.g. `host.data.focus = spotId`). Fallback: the minigame renders a small three.js view using `cloneModel()` from the loader. Any 2D art that's truly needed (a toe-bean paw cursor, droplets) should be clean SVG icons, not drawings of whole objects.

Shared conventions: Esc always exits, progress is kept, bots get a simulated rate, and success is shown by what happens in the world, never by a "SUCCESS!" stamp.

### laptop (paw typing, ~12 s per visit, 22 s solo total)
- **Controls:** roll your hand across the keyboard. Every letter keydown types, and holding 3+ keys at once ("paw contact") counts ×2. Holding 6+ keys means the cat is sitting on the keyboard: still counts, and the screen floods with "jjjjjjjj". Step 2: hold Space (sitting on Enter) and the quantity climbs. Step 3: move the mouse in small circles (kneading the trackpad) to press "Buy now". Ignore Meta/Ctrl/Alt and `preventDefault` everything else, so nobody closes the tab by accident.
- **Visuals:** a plain shopping site. The search box fills with paw clusters like "kjjjjj;;;;ll". Autocomplete politely turns it into the order from `host.data.order` ("Catnip, 2 kg" or "Wet food, salmon, 48 cans"). Quantity spins up to 48. Shipping switches itself to "Arrives today". The cart already contains "Lint roller refills (6)", and "Recently viewed" shows a five-level cat tree. Every ~5 s the cat's tail sweeps across a third of the screen (soft blur in the cat's fur color) and covers the button.
- **Fail / fun:** caps lock flips randomly and the typing goes ALL CAPS (no penalty). Mashing one key alone barely counts, because a cat has never pressed exactly one key.
- **The joke:** the cat has no idea what it's doing and it works anyway. Players will literally put their hand flat on the keyboard and laugh at themselves.

### faucet (turn the bathtub tap, ~8 s)
- **Controls:** tap LMB (or Space) at 3–4 per second to bap a lever handle up from below. It falls back slowly if you stop. At 40% a single drop forms and wobbles, and pressing E when it falls bats it (optional +10%).
- **Visuals:** close-up of the tap, the cat's paw coming in from below with toe beans, the cat's eyes following the drop.
- **Fail / fun:** too slow and the lever clunks back down. At 70% a sputter splashes the camera with droplets and the cat flinches.
- **The joke:** at 100% the water gushes, the cat's ears go flat and it jumps back in shock at what it just did. Then it sits on the rim and watches the tub fill, fascinated.

### tpSpin (spin the toilet paper, ~10 s, shared)
- **Controls:** mouse wheel or two-finger scroll in either direction spins the roll (direction only changes which way it spins, because Mac natural scrolling flips the sign). Fallback: alternate W/S. The roll has momentum, so steady strokes beat frantic ones.
- **Visuals:** the roll spinning, paper cascading into a pile that ends up much bigger than any roll could hold, pupils dilating as the pile grows. A second cat shows up as a second paw.
- **Fail / fun:** a sharp reversal tears off a big chunk at once (bonus, `paperRip`). When it's done, the cat bats the bare cardboard tube and it rolls off out of view.
- **The joke:** the pile is too big for the roll, and the cat's face says it was worth it.

### fishing (catch 3 fish, ~12 s)
- **Controls:** the paw hovers above the water and follows the mouse sideways. Click to dip. A fish under the paw gets hooked, then mash for 1 s to pull it out before it wriggles free.
- **Visuals:** the real tank with the real fish models. One big, slow fish just stares back. After every dip the cat shakes its paw dry, droplets flying.
- **Fail / fun:** a miss scatters the fish to the corners for a moment. Going for the big fish fails: the paw slides off, it's too heavy and it doesn't care. Three misses in a row and the cat flicks its paw in exaggerated disgust.
- **The joke:** the paw shake. Every dip, no matter what.

### climb (climb the curtains, ~10 s)
- **Controls:** alternate A and D (left paw, right paw). The same key twice in a row means a slip: slide down a bit with a claw squeak. When the curtain sways (a small sway indicator), hold Space to hang on.
- **Visuals:** close-up of the fabric, the cat climbing, a trail of little claw-hole puckers in the cloth. The rod at the top bends more the higher you get.
- **Fail / fun:** too many slips and you drop to the floor, landing on your feet (progress kept, it's a cat).
- **The joke:** at the top the cat stops, looks down, realizes this was never a plan and meows once, small and helpless. Then the rod gives way and the whole curtain comes down with a cat-shaped lump inside.

### knead (make biscuits on the pillow, ~10 s)
- **Controls:** alternate A/D (or LMB/RMB) to a slow, steady purr beat, around 100 BPM. Consistency fills the meter, speed doesn't.
- **Visuals:** two paws pressing into the pillow with toe beans showing, the pillow dimpling. With each good beat the eyes close a bit more, and at the peak a tiny drool drop appears and the purr gets louder.
- **Fail / fun:** too fast and the claws come out and pull threads (fur mess still happens). Off-beat and the eyes open and the cat looks around suspiciously, then goes back to it. Stop pressing and the cat falls asleep mid-knead with its paws still on the pillow (`zzz`, no progress).
- **The joke:** the face. Perfect rhythm gets you peak bliss.

### escape (wiggle out of the scruff or the carrier, ~5–8 s)
- **Controls:** alternate A/D to wiggle. A proper alternation counts 1, mashing the same key counts 0.3. R hiss is +4 (as specced). New: stop pressing for 1.5 s and the cat goes full noodle, the body stretches long and the sitter's grip slips 20% in one burst (and that's also Noodle Mode, #1, if you keep it up).
- **Visuals (scruff):** the cat dangling, getting visibly longer with every wiggle. The grip meter is the sitter's hand.
- **Visuals (carrier):** bars rattling, one paw reaching through toward the latch. Q meows get lower and sadder with each press, the carrier song every owner knows from the drive to the vet.
- **The joke:** long cat. The cat just keeps getting longer.

### fight (hiss-duel cloud, ~4 s, both cats)
- **Controls:** phase 1, **staredown** (1.5 s): both players see the other cat's face, ears flat, growl rising. Press anything and you flinched (−25% mash power). If **neither** player presses anything, the fight is off: both cats look away and walk off grooming. No cloud, no crown, no fur. Phase 2, **brawl** (2.5 s): mash, tug bar.
- **Visuals:** the rolling dust ball with paws and stars sticking out (FX spec). Afterwards both cats sit down and groom right away, as if nothing happened.
- **Fail / fun:** bots flinch 70% of the time, so fights with bots usually happen.
- **The joke:** the most realistic cat fight is a long stare and nothing else. Two patient players discover this on their own.

### openBox (claw open the delivery, ~4 s, shared)
- **Controls:** hold LMB and drag along the tape line to rip one strip per full pass, three strips in all. Space chews the corner of the box: no progress, cardboard bits, very satisfying.
- **Visuals:** the box seen from above, tape strips tearing, claw marks. Other cats' strokes show up as other paws.
- **Fail / fun:** dragging the wrong way only scuffs the cardboard.
- **The joke:** the box pops open and the contents (catnip bag or cans) bounce out. The camera stays on the box, and the cat climbs inside. The box was the prize.

### birdWatch (chatter at birds, ~8 s)
- **Controls:** birds hop around on a branch outside. Move your stare (mouse) to track one and hold LMB to chatter (jaw trembling, `chatter` sound), which fills Focus while you're on target. When a bird turns to look at you, let go or it flies off.
- **Visuals:** the window view, a pigeon that never leaves and stares back, tail tip twitching at the bottom of the screen.
- **Fail / fun:** Space is pounce. The cat bonks the glass, slides down, every bird scatters, a little progress is lost, and a new nose print appears on the window for the rest of the round (#7).
- **The joke:** the bonk and the smudge it leaves behind.

---

## 5. New cat-behavior minigames (proposals)

### hairball ("hork", ~3 s, best done in-world without an overlay)
- **Controls:** press Space on each of three heaves as the body pumps forward, harder each time. Steer with A/D while the cat creeps forward.
- **Visuals:** the downloaded cat squashing and stretching through the three heaves.
- **Fail / fun:** a missed beat adds a fourth heave. Perfect timing makes a bigger hairball (scale 1.3).
- **The joke:** you are steering toward the rug, and you know exactly why.

### groom (dry off after a spray, ~6 s)
- **Controls:** a cat outline shows wet spots as droplet icons. Click each spot to lick it (tongue rhythm).
- **Fail / fun:** licking one spot too long leaves the tongue stuck out (`blep`) for a second.
- **The joke:** the cat ends up drier and twice as fluffy as before, puffed for 2 s. A groom on a friend can end in the bite (#34).

### bunnyKick (wrestle the sock, ~6 s)
- **Controls:** hold Space to hug the sock with the front paws, alternate A/D fast for back-leg kicks.
- **Fail / fun:** let go of Space and the sock flies off.
- **The joke:** once the sock is "dead", the cat picks it up with a proud face and starts the Gift loop (#6). Sock yowl included.

### squeeze (if it fits, ~5 s)
- **Controls:** hold S to compress, wiggle A/D to settle in. Chonk makes it harder.
- **Fail / fun:** under 100% fit, one leg hangs over the rim and the cat stays like that anyway. Still counts.
- **The joke:** liquid cat. Result: hidden name tag + container stamina regen (#26).

### doorHang (open a door by its handle, ~3 s, replaces the plain 2 s hold)
- **Controls:** a jump arc and a handle marker. Press Space at the top of the arc to catch the handle, then swing A/D to pull it down with body weight.
- **Fail / fun:** a miss slides you down the door with a claw squeak (and adds a scratch decal, #9).
- **The joke:** the door creaks open, the cat drops, sits and looks at the open doorway. Bots then walk away (#20).

### sinkDrink (drink from the tap, ~4 s)
- **Controls:** a thin stream from the kitchen tap. Click when the tongue is out to catch droplets.
- **Fail / fun:** too many misses and a splash hits the face (`shock`, head shake, droplets).
- **The joke:** a full water bowl sits two meters away (#13). Gives the small Fed buff.

### vacuumRide (ride the robot vacuum, ~10 s, only if #39 ships)
- **Controls:** A/D to stay balanced as it bumps into furniture.
- **Fail / fun:** falling off means landing on your feet with a puffed tail. Every bump can knock a prop off a low table.
- **The joke:** the regal, unbothered face the whole ride.

### scoop (sitter, optional, ~3 s, replaces the 2.5 s hold)
- **Controls:** move the mouse side to side to sift, hold Space to hold your breath. Let go of Space and the sitter breathes in and gags (`gag` face, sifting pauses for 0.5 s).
- **The joke:** everyone who has ever scooped a litter box knows the breath-hold.

---

## 6. Cringe list: never ship these

1. **Puns in UI strings:** "Purrfect!", "Pawsome", "Meow-velous", "Cat-astrophe", "Hiss-terical", "Clawsome", "Fur-real", "Litter-ally", "Purr-chase", "Feline good". The title MEOWHEM is the one pun on its screen.
2. **Lolspeak and old memes:** "I CAN HAZ", "Ceiling Cat", "Longcat is long", "Keyboard Cat", "Nyan", "Grumpy Cat", "OwO", "UwU", "nya~", "heckin", "smol".
3. **Pet-influencer words:** "kitties", "fur babies", "floofs", "furry friends", "feline friends", "purr-sonality", "hooman".
4. **Captioning the behavior:** "ZOOMIES ACTIVATED!", "If it fits, I sits!", "Mlem!", "Cats love boxes!", "Slow blink = trust". The behavior is the caption.
5. **Did-you-know trivia:** "Fun fact: cats sleep 16 hours a day" on loading screens or tooltips. No trivia anywhere.
6. **Tutorials explaining insider jokes:** never a hint like "Cats prefer to drink from the tap!" or "Tip: hairballs count double on rugs". Let players find them.
7. **Hype copy:** "AMAZING!", "EPIC COMBO!", "You're on fire!", "Unstoppable!", "Let the chaos begin!", "Get ready to rumble!", "MEGA MESS!".
8. **AI-sounding copy:** "Embark on a journey", "Unleash your inner cat", "Dive into the chaos", "mischievous adventure", "chaos ensues", "In a world where...", "The ultimate cat experience", "cozy, chaotic, and cute" (three-adjective lists), sparkles ✨ and dash-heavy sentences.
9. **Emoji in game text:** 😹🐾🐟💩 in toasts, awards, buttons or chat presets.
10. **Award names that are sentences or puns:** "Most Likely To Knock Things Over", "Paw-sitively Destructive", "Purr-fessional Napper". Awards are one to three dry words plus a stat.
11. **Narrated endings:** "The cats have won! The house is a total mess and the owners are FURIOUS!" Use "The owners have questions."
12. **A talking cat narrator or mascot:** "Meow meow! Press E to interact!" Cats only ever say "mrrp" and "MEOW" in bubbles.
13. **Cutesy filler:** "Oops!", "Uh oh!", "Whoopsie!", "Wait... is that... a CUCUMBER?!" (fake-suspense ellipses and ?!).
14. **Nine-lives overuse:** "Nine Lives mode", "8 lives left", "Cat Nap" as a menu pun.
15. **Naming the parody sources:** the TV shows never say Rick and Morty, Planet Earth or a real brand. Likewise no real store names on the laptop.
16. **Harm played as a joke:** cat in the washing machine or dryer, the cucumber jump scare as a sitter tool, injuries, declawing, "spray bottles are how you train cats".
17. **Pun cat names:** "Sir Meows-a-lot", "Mr. Whiskers", "Captain Purrington", "Catrick Swayze". Use Gerald, Linda, Mochi, Bean.

---

### Sources (asset leads, licenses not yet verified)
- [Robot Vacuum Low-Poly (pawsgineer, itch.io)](https://pawsgineer.itch.io/robot-vacuum-low-poly): lead for #39, check the license before using.
- [Cat accessories (CGTrader)](https://www.cgtrader.com/3d-models/furniture/other/cat-accessories) and [Wicker Cat Bed pack (CGTrader)](https://www.cgtrader.com/3d-models/furniture/bed/wicker-cat-bed-d-model-pack): marketplace licenses, probably not redistributable in a web game. Listed so nobody uses them by accident. Prefer CC0 or skip the cat bed.

# Sound sources

Every recorded sound here is CC0 1.0 (public domain). No attribution is legally required, credits are listed anyway.
Files were trimmed, high-passed, faded, loudness-normalized and re-encoded (mono 44.1 kHz MP3, 96 kbps).
Loop files (`purr`, `typing`, `scratch`, `waterRun`) have a crossfaded seamless loop of 6 s / 3 s with 0.1 s wrap padding on both ends.

Synthesized at runtime with WebAudio (no files): `countdown`, `go`, `win`, `lose`, `alarm`, and all music (`menu`, `game`, `tense`, `catnip`).

Round 2 additions (ADDENDUM M25):
- `clap`: synthesized at runtime, two 8 ms noise bursts through a 1.8 kHz bandpass, 90 ms apart (the addendum's fallback). No file.
- `keys`: built at runtime from the CC0 Kenney clinks above (`clink1`-`clink3`), three copies at pitch 1.4 staggered 60 ms. No new file.
- `shutter`: synthesized at runtime, a sharp bandpassed click, a short whirr, a second click. No file.
CC0 recordings were not added this round because the sound sites were not reachable from the build machine. Dropping a CC0 `clap1.mp3` / `keys1.mp3` / `shutter1.mp3` into this folder and adding `f: [...]` to its entry in `src/audio/audio.ts` replaces the fallback.

| File | Source | Author | License | URL |
|---|---|---|---|---|
| `meow1.mp3` | "cat meow" | tuberatanka | CC0 1.0 | https://freesound.org/people/tuberatanka/sounds/110011/ |
| `meow2.mp3` | "cat meow short" | skymary | CC0 1.0 | https://freesound.org/people/skymary/sounds/412017/ |
| `meow3.mp3` | "Cat meow" | TRNGLE | CC0 1.0 | https://freesound.org/people/TRNGLE/sounds/362652/ |
| `meow4.mp3` | "Cat Meowing" | lextrack | CC0 1.0 | https://freesound.org/people/lextrack/sounds/333916/ |
| `meow5.mp3` | "Meow Cat 3" (#1891) | Joseph Sardin | CC0 1.0 | https://bigsoundbank.com/meow-cat-3-s1891.html |
| `meowShort1.mp3` | "Cat Meow" | Mafon2 | CC0 1.0 | https://freesound.org/people/Mafon2/sounds/436541/ |
| `meowShort2.mp3` | "Little Meow Of A Cat" (#0494) | Joseph Sardin | CC0 1.0 | https://bigsoundbank.com/little-meow-of-a-cat-s0494.html |
| `meowShort3.mp3` | "Little Meow Of A Cat 2" (#1472) | Joseph Sardin | CC0 1.0 | https://bigsoundbank.com/little-meow-of-a-cat-2-s1472.html |
| `meowLong1.mp3` | "Meow Cat 12" (#1900) | Joseph Sardin | CC0 1.0 | https://bigsoundbank.com/meow-cat-12-s1900.html |
| `meowLong2.mp3` | "Meow Cat 2" (#1890) | Joseph Sardin | CC0 1.0 | https://bigsoundbank.com/meow-cat-2-s1890.html |
| `mrrp1.mp3` | "Cat trills shortly (calm/quiet)" | CatPhony | CC0 1.0 | https://freesound.org/people/CatPhony/sounds/850104/ |
| `chirp1.mp3` | "Chatter and Trill" | CatPhony | CC0 1.0 | https://freesound.org/people/CatPhony/sounds/850103/ |
| `chatter1.mp3` | "Loud chatter" | CatPhony | CC0 1.0 | https://freesound.org/people/CatPhony/sounds/850110/ |
| `yowl1.mp3` | "Siamese Cat Yowls" | tcurless | CC0 1.0 | https://freesound.org/people/tcurless/sounds/826683/ |
| `yowl2.mp3` | "Siamese Cat Yowls" | tcurless | CC0 1.0 | https://freesound.org/people/tcurless/sounds/826683/ |
| `yowl3.mp3` | "Siamese Cat Yowls" | tcurless | CC0 1.0 | https://freesound.org/people/tcurless/sounds/826683/ |
| `hiss1.mp3` | "catHisses1.wav" | Zabuhailo | CC0 1.0 | https://freesound.org/people/Zabuhailo/sounds/146963/ |
| `hiss2.mp3` | "hiss2.wav" | Reitanna | CC0 1.0 | https://freesound.org/people/Reitanna/sounds/343927/ |
| `fight1.mp3` | "Cats Fighting Amplified and Noise removed" | Rudmer_Rotteveel | CC0 1.0 | https://freesound.org/people/Rudmer_Rotteveel/sounds/316916/ |
| `hairball1.mp3` | "Cat Coughing.wav" | har2h | CC0 1.0 | https://freesound.org/people/har2h/sounds/561726/ |
| `purr.mp3` | "Cat purr.wav" | Trautwein | CC0 1.0 | https://freesound.org/people/Trautwein/sounds/260881/ |
| `shatter1.mp3` | "Glass Break" | unfa | CC0 1.0 | https://freesound.org/people/unfa/sounds/221528/ |
| `shatter2.mp3` | "Glass Smash.wav" | chewiesmissus | CC0 1.0 | https://freesound.org/people/chewiesmissus/sounds/244238/ |
| `shatter3.mp3` | "Picture frame dropped on wood floor, shatters.wav" | SpliceSound | CC0 1.0 | https://freesound.org/people/SpliceSound/sounds/156578/ |
| `thud1.mp3` | Kenney "impact-sounds" pack: `impactWood_heavy_000.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `thud2.mp3` | Kenney "impact-sounds" pack: `impactWood_heavy_002.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `thud3.mp3` | Kenney "impact-sounds" pack: `impactSoft_heavy_000.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `clink1.mp3` | Kenney "impact-sounds" pack: `impactGlass_light_000.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `clink2.mp3` | Kenney "impact-sounds" pack: `impactGlass_light_002.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `clink3.mp3` | Kenney "impact-sounds" pack: `impactPlate_light_000.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `plop1.mp3` | "PlopEnhanced.wav" | edschaefer | CC0 1.0 | https://freesound.org/people/edschaefer/sounds/343097/ |
| `spray1.mp3` | "Spray Bottle" | OwlStorm | CC0 1.0 | https://freesound.org/people/OwlStorm/sounds/212178/ |
| `spray2.mp3` | "Spray Bottle" | OwlStorm | CC0 1.0 | https://freesound.org/people/OwlStorm/sounds/212178/ |
| `spray3.mp3` | "Spray Bottle" | OwlStorm | CC0 1.0 | https://freesound.org/people/OwlStorm/sounds/212178/ |
| `doorbell.mp3` | "DoorBell Shortened" | jwheeler91 | CC0 1.0 | https://freesound.org/people/jwheeler91/sounds/442280/ |
| `typing.mp3` | "Keyboard Typing" | Trollarch2 | CC0 1.0 | https://freesound.org/people/Trollarch2/sounds/331656/ |
| `scratch.mp3` | "Scratching Couch" | HogantheLogan | CC0 1.0 | https://freesound.org/people/HogantheLogan/sounds/466790/ |
| `splash1.mp3` | "Big Water Splash" | qubodup | CC0 1.0 | https://freesound.org/people/qubodup/sounds/442773/ |
| `splash2.mp3` | "SPLASH.wav" | petenice | CC0 1.0 | https://freesound.org/people/petenice/sounds/9508/ |
| `waterRun.mp3` | "Tap Water 1" | OwlStorm | CC0 1.0 | https://freesound.org/people/OwlStorm/sounds/212177/ |
| `flush.mp3` | "Toilet Flushing" | lorenzgillner | CC0 1.0 | https://freesound.org/people/lorenzgillner/sounds/274448/ |
| `pickup1.mp3` | Kenney "rpg-audio" pack: `cloth1.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| `drop1.mp3` | Kenney "rpg-audio" pack: `dropLeather.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| `whoosh1.mp3` | "Whoosh" | qubodup | CC0 1.0 | https://freesound.org/people/qubodup/sounds/60013/ |
| `ding.mp3` | "Ding Ding Small Bell" | JohnsonBrandEditing | CC0 1.0 | https://freesound.org/people/JohnsonBrandEditing/sounds/173932/ |
| `buzz.mp3` | Kenney "interface-sounds" pack: `error_006.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `breaker.mp3` | "Kill Switch (Large Breaker Switch) .WAV" | EchoCinematics | CC0 1.0 | https://freesound.org/people/EchoCinematics/sounds/131599/ |
| `tvOn.mp3` | "tv click on or off.flac" | TRP | CC0 1.0 | https://freesound.org/people/TRP/sounds/576959/ |
| `treatShake.mp3` | "shake popcorn bag2.wav" | Reitanna | CC0 1.0 | https://freesound.org/people/Reitanna/sounds/264168/ |
| `crunch1.mp3` | "Crunchy cookie eating.wav" | Morgan169 | CC0 1.0 | https://freesound.org/people/Morgan169/sounds/362024/ |
| `cageClose.mp3` | "Gate Latch" | mhtaylor67 | CC0 1.0 | https://freesound.org/people/mhtaylor67/sounds/126041/ |
| `cageOpen.mp3` | Kenney "rpg-audio" pack: `metalLatch.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| `paperRip1.mp3` | "tearing paper4.wav" | keweldog | CC0 1.0 | https://freesound.org/people/keweldog/sounds/181773/ |
| `paperRip2.mp3` | "Tearing paper" | ludde44 | CC0 1.0 | https://freesound.org/people/ludde44/sounds/170311/ |
| `dig1.mp3` | "Kitty Litter Scrape 02.wav" | Glitchedtones | CC0 1.0 | https://freesound.org/people/Glitchedtones/sounds/322409/ |
| `dig2.mp3` | "Kitty Litter Scrape 02.wav" | Glitchedtones | CC0 1.0 | https://freesound.org/people/Glitchedtones/sounds/322409/ |
| `dig3.mp3` | "Kitty Litter Scrape 02.wav" | Glitchedtones | CC0 1.0 | https://freesound.org/people/Glitchedtones/sounds/322409/ |
| `step1.mp3` | Kenney "impact-sounds" pack: `footstep_wood_000.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `step2.mp3` | Kenney "impact-sounds" pack: `footstep_wood_001.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `step3.mp3` | Kenney "impact-sounds" pack: `footstep_wood_002.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `step4.mp3` | Kenney "impact-sounds" pack: `footstep_wood_003.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `land1.mp3` | Kenney "impact-sounds" pack: `impactSoft_medium_000.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `land2.mp3` | Kenney "impact-sounds" pack: `impactSoft_medium_001.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| `uiClick.mp3` | Kenney "interface-sounds" pack: `click_001.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `uiHover.mp3` | Kenney "interface-sounds" pack: `tick_001.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `carArrive.mp3` | "CarArriveAndStop.wav" | jmdh | CC0 1.0 | https://freesound.org/people/jmdh/sounds/136536/ |
| `pop1.mp3` | "Pop sound" | deraj | CC0 1.0 | https://freesound.org/people/deraj/sounds/202230/ |
| `gulp1.mp3` | "Cartoon - Gulp!" | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/450624/ |
| `door1.mp3` | Kenney "rpg-audio" pack: `doorOpen_1.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
| `door2.mp3` | Kenney "rpg-audio" pack: `doorClose_1.ogg` | Kenney | CC0 1.0 | https://kenney.nl/assets/rpg-audio |

Kenney packs: impact-sounds, interface-sounds, rpg-audio, by Kenney (www.kenney.nl), CC0 1.0.
BigSoundBank license page: https://bigsoundbank.com/droit.html (CC0 1.0).
Freesound sounds were downloaded as the official HQ previews of CC0-licensed uploads.

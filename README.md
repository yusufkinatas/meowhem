# MEOWHEM

A browser party game in 3D. One catsitter has to keep a house tidy until the owners get home. Up to four cats try to turn it into a crime scene first. The mess meter decides it: cats win the moment it reaches 100%, the sitter wins if the owners walk in below that.

Inspired by *Who's Your Daddy*. Built with TypeScript, three.js, Rapier physics and PeerJS.

## Run it

You need Node.js 20 or newer.

```
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173) in Chrome, Edge or Firefox. Click into the game to capture the mouse. Esc frees it again.

`npm run build` makes a static build in `dist/` that any web server can host.

## Playing solo

On the title screen:

- **Play as the catsitter**: you against four bot cats.
- **Play as a cat**: you and three bot cats against a bot sitter.

**Bots** sets the difficulty of your opponents (Kitten, House Cat, Feral). Bot teammates always play House Cat. **Round** sets the length (3, 6 or 9 minutes, 6 is the tuned default).

## Playing online

1. One player clicks **Host online game**. The lobby shows a four-letter room code.
2. Everyone else types the code under **Code** on the title screen and clicks **Join**.
3. Each player picks Sitter or Cat in the lobby. "Fill empty cat slots with bots" keeps the house at four cats.
4. The host clicks **Start**.

The connection is peer to peer (WebRTC) and uses the free public PeerJS broker to find each other, so it needs an internet connection. Some strict networks (corporate firewalls, some mobile hotspots) block WebRTC. If joining hangs, try another network.

## Controls

| Key | Catsitter | Cat |
|---|---|---|
| WASD | walk | walk |
| Shift | jog | zoomies |
| Space | hop | jump, hold to wiggle and pounce |
| Mouse | look | look |
| Left click | spray bottle, or throw the cat you hold | swipe, hold to slowly push something |
| E | grab a cat, clean, tidy, fix (hold) | interact with whatever is nearby |
| Q | shake the treat bag | meow |
| R | clap | hiss, hold for a hairball |
| F | | loaf |
| Tab | scoreboard | scoreboard |
| Esc | free the mouse, pause in solo | leave a minigame, pause in solo |

A grabbed cat goes in the carrier in the kitchen (E while holding it) or gets thrown. The TV in the living room has Cat TV. A grabbed cat wiggles free with A and D.

## URL flags

Add these to the address to skip the menus:

- `?autostart=sitter` or `?autostart=cat` starts a solo round right away
- `?bots=N` sets how many bot cats join a solo round
- `?difficulty=kitten`, `houseCat` or `feral` sets bot difficulty
- `?time=SECONDS` sets the round length, for example `?time=180`

Example: `http://localhost:5173/?autostart=sitter&bots=4&difficulty=feral&time=180`

## Credits

Every model, sound, font and image comes from CC0, CC-BY or MIT sources. The full list with authors and licenses is in [CREDITS.md](CREDITS.md).

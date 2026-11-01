# Cross-package requests (round 2)

Agents append requests here when they need something from a file they don't own.
Format: `- [ ] (FROM -> TO) what, why, where` . The owner checks this file regularly, implements, and ticks `[x]` with a one-line note.
Owners: P1 rules (sim.ts/interact.ts/core/net/config), P2 content+bots (interactables/bots), P3 minigames, P4a cat model, P4b sitter model, P4c level layout (+manifest/assets/CREDITS), P4d world visuals (+props.ts, fonts), P5 client+audio+fx.

## Open

- [ ] (P2 -> P1) `?autobot=1`: the local player's character is driven by the registered bot brain for its role, so all-bot balance rounds can run with `?balance=1&timeScale=4`.

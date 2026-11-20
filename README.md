# Table Fleet

**A naval battle on the coffee table.** Voxel naval combat for two players on one device, or against the computer. English and French.

▶ **Play:** https://mathieubernard.github.io/table-fleet/

Built for my daughter, 30 minutes before a 13-hour flight, so we could play on the iPad with no wifi.

## What's in it

- A little voxel living room: a coffee table, a sleeping cat, a cup of coffee, dice, books and lamps.
- Each fleet sits in its own case, laid flat. The target board stands up like the real box and hides the other player.
- **Two players, one device**: the screen blurs when you pass it, so nobody peeks.
- **Against the computer**: three levels, Deckhand, Captain and Admiral. Each was tuned by simulating 400 games, and they take 64, 50 and 45 shots on average to win.
- Sunk ships burn on the board.
- A cozy background soundtrack, generated in code (no audio files).
- Installable and fully playable offline.

## Play offline on iPad

1. Open https://mathieubernard.github.io/table-fleet/ in Safari while online.
2. Share → **Add to Home Screen**.
3. Launch it once with internet. After that it works without any network, even on a plane.

## Language

English by default. Use the FR/EN button in the menu, or add `?lang=fr` / `?lang=en` to the URL.

## Run it locally

Built with three.js, Vite and TypeScript.

```bash
npm install
npm run dev     # http://localhost:5240
npm run build   # production build in dist/
```

Every push to `main` builds and publishes the game to GitHub Pages (`.github/workflows/pages.yml`).

## Controls

On touch screens:
- **Placing your fleet:** drag on the sea and lift to place a ship, tap a ship to pick it up again, and use the Rotate button.
- **Aiming:** drag on the target board to aim, then press Fire.
- **Camera:** drag beside the boards to turn the view, and pinch to zoom.

| Action | Mouse | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Move the cursor | hover | arrows, WASD/ZQSD | d-pad, left stick |
| Place, fire, confirm | click | Enter, Space | A |
| Rotate a ship | right click | R | Y |
| Switch ship | list | Tab, Shift+Tab | LB, RB |
| Random placement | button | F | X |
| Pick a ship up again | click it | Backspace | B |
| Confirm the fleet | button | V, or Enter once complete | Start, or A once complete |
| Speed up the action | click | Space, Enter | A |
| Camera (while aiming; fixed while placing) | drag, wheel | Q/E (A/E on AZERTY), PgUp/PgDn, +/− | right stick, triggers |
| Recenter the camera | | C | Y while aiming, L3/R3 |
| Mute | button | M | Select |

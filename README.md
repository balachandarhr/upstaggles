# UPSTAGGLES – 3D Adventure: run, jump, climb and fight

**Play:** https://balachandarhr.github.io/upstaggles/

A complete browser game with 250 stages: 10 worlds × 25 levels, and a boss in every 25th level. It is built with Three.js (bundled locally in `lib/`). All art is original low-poly geometry made from primitives, the music is procedural, and it uses no external assets. It runs on phones (touch controls) and desktops.

## Features
- **250 levels in 10 worlds.** Levels 1–5 are handcrafted. Levels 6–250 come from a deterministic, physics-checked generator. Each world has five mechanic bands, matching the design doc:
  Beginner Valley · Mystery Forest · Desert Kingdom · Frozen Mountains · Volcano Island · Cyber City · Ocean Secrets · Sky Kingdom · Shadow Castle · Ultimate Universe.
- **Mechanics:** moving and rotating platforms, lifts, bounce mushrooms, sinking sand, ice, conveyors, crumbling bridges, rolling rocks, lasers, fireballs, wind, currents, underwater swimming physics, invisible glass platforms, teleport pads, low-gravity zones, timed escape levels, and enemies.
- **10 bosses:** Giant Stone Guardian, Forest Monster, Desert Scorpion, Ice Dragon, Lava Titan, Mega Robot, Sea Serpent, Thunder Eagle, Shadow King, and Ultimate Staggle Emperor. Each has telegraphed attacks: slam rings, projectile volleys, charges, rain, sweeping beams, and minions. Boss attacks get harder from world to world. A boss can only be hurt while it is dizzy (SPIN, DASH or STOMP it).
- **Feel:** coin magnet (coins fly to you when you are near), double jump, dash/roll, squash and stretch, dust and landing puffs, camera shake, combos, PBR lighting, soft shadows, and bloom.
- **Progression:**
  - World map and per-world level select, with stars and boss tiles.
  - Finale screen after level 250.
  - Characters:

    | Character | Cost | Stats |
    | --- | --- | --- |
    | Staggle Hero | free | balanced |
    | Shadow Ninja | 2 500 coins | +15 % speed, 2 air dashes |
    | Golden Titan | 5 000 coins | 4 hearts, regenerating shield |

  - **Coin shop:** extra heart, super magnet, shield bubble, coin doubler. Purchases are used automatically on your next level.
  - **Skip:** any level can be skipped for 500 coins.
  - **Daily reward:** a 7-day cycle.
  - **Settings:** sound, music and SFX volume, graphics quality, camera sensitivity, FPS counter, and reset progress.
  - **Rewards:** a first clear pays the full reward, scaled by coins collected, plus 300 for a boss. Replays pay 20 % of that, with a minimum of 10.
  - **No real money and no ads.** Coin packs, VIP and rewarded ads are placeholders only.

## Controls
| Action | Touch | Keyboard / mouse |
| --- | --- | --- |
| Move | Virtual joystick (left thumb) | WASD / arrow keys |
| Jump / double jump (hold = higher) | JUMP | Space |
| Spin attack | SPIN | E or J |
| Dash / roll | DASH | Shift or K |
| Camera | Drag on the right side | Mouse drag, Z / X |
| Pause | ❚❚ | Esc / P |

## Run locally
`python3 -m http.server` in this folder, then open http://localhost:8000/. Add `?q=low|medium|high` to force a graphics tier.

## Files
- `index.html`, `style.css`: all screens (home, map, levels, characters, shop, daily, settings, HUD, pause, fail, victory, finale)
- `js/game.js`: engine (physics, player, camera, enemies, bosses, input, UI, economy, save)
- `js/gen.js`: level generator (reachability-checked jump links, rewards, timers)
- `js/worlds.js`: the 10 world themes, mechanic bands and bosses
- `js/levels.js`: handcrafted levels 1–5
- `js/audio.js`: procedural music and sound effects
- `lib/three.min.js`: Three.js r186 (MIT)

## Testing
The headless Chrome tests (Playwright) check that:
- all 250 levels load with no console errors;
- every jump link on the route can be completed with the real physics (no double jump needed);
- the goal is reachable on every level, and every timer is achievable;
- a bot beats all 10 bosses;
- the economy and UI work: rewards, replay reduction, skip, continue, daily reward, characters, shop, settings, map, and finale.

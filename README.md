# UPSTAGGLES – Beginner Valley prototype

Playable browser prototype of **UPSTAGGLES** (3D adventure: run, jump, climb and fight), covering
**World 1 · Beginner Valley, levels 1–5**. Built with Three.js (bundled locally in `lib/`), with original low-poly art made from primitives. There are no external assets.

## Play
Open `index.html` through any static web server (e.g. `python3 -m http.server`) and play it on a phone or desktop browser.

## Controls
| Action | Touch (Android) | Keyboard / mouse |
| --- | --- | --- |
| Move | Virtual joystick (left thumb, appears where you touch) | WASD / arrow keys |
| Jump (hold = higher) | JUMP button | Space |
| Spin-bonk / action | ACTION button | E or J |
| Camera | Drag on right side of screen | Mouse drag, Z / X |
| Climb | Walk into green vines | same |
| Pause | ❚❚ button | Esc / P |

## Levels
1. **First Steps**: walking, small ledges, first coins
2. **Hop Along**: stepping stones, stairs, variable-height jumps
3. **Vine Climb**: climbable vine walls, floating stones, hidden bonus perch
4. **Drifting Meadow**: moving platforms, a lift, first Grumble enemies (spin-bonk or stomp)
5. **Valley Summit**: everything combined, 4 Grumbles, summit portal

Each level has checkpoints (flags), fall-off respawn, 3 hearts, and a goal portal.
Victory gives 1–3 stars (finish / 60% coins / all coins; each bonked enemy = 3 coins) and a 50–200 coin reward.
Progress (unlocks, stars, wallet, sound) is saved in `localStorage`.

## Files
- `index.html`, `style.css`: screens (splash, home, level select, HUD, pause, victory)
- `js/game.js`: engine: physics, player, camera, enemies, input, UI, save
- `js/levels.js`: handcrafted level data
- `lib/three.min.js`: Three.js r186 (MIT) bundled

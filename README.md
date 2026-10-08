# First Touch

An original, playable **11-a-side football game** built with Nuxt 4, Three.js, Blender, and Tailwind CSS. Play an exhibition at The Common Ground or take Northside through a 20-club, 38-matchday league season.

## Run

Use Node 22.21+ or Node 24 LTS.

```sh
npm ci
npm run dev
```

Open the local URL printed by Nuxt. No database, account, external asset service, or environment secrets are needed.

## Play

- **WASD / arrows** — move. Northside attacks the right goal.
- **Shift** — sprint, consuming stamina; release to recover.
- **J** — pass, selecting a teammate in the direction you face; control follows the receiver after the first touch.
- **Space** — hold to charge, release to shoot. Hold W/S on release to aim at the far/near post.
- **X / J held** — pursue and challenge the opponent ball carrier.
- **L** — lofted cross toward a supporting attacker.
- **K** — standing tackle when close to the ball.
- **Q / Tab** — select the closest defender to the opposing ball carrier, or switch while the ball is loose/in flight. Switching is locked while your team controls the ball.
- **C** — toggle follow and wide cameras.
- **Esc** — pause/resume. Switching away from the window also pauses play.
- Touchscreens show a movement pad and pass/shoot/tackle/switch buttons.

Choose a 3-, 5-, or 8-minute match and Casual, Club, or Pro difficulty. Difficulty can also be changed in the pause menu without restarting; your last choice is remembered in this browser. The displayed 90-minute clock is compressed to that duration. Stadium sound starts at kickoff after a browser interaction; mute it in the top-right corner or adjust volume in the pause menu. Controller-only starts may require one click on the pitch to unlock browser audio.

Choose **League** in the top navigation for a Premier League-style season. Each of 20 fictional clubs plays every other club home and away over 38 matchdays. Play Northside’s fixture each round while the other nine results are simulated; the standings update at full time using three points for a win, one for a draw, then goal difference and goals scored as tie-breakers. Fixtures and season progress are saved in this browser. Start a new season after the final matchday.

## Scope

This is an arcade prototype: 22 players, 4-4-2 formations, team AI, goalkeepers, possession, passing, shooting, tackles, goals, throw-ins, corners, goal kicks, match statistics, and full-time/rematch. Offside, careless/late tackle fouls, free kicks, penalties, and arranged corners are included. Dead-ball setup uses a short repositioning cut. The league tracks a local season table; it does not yet include transfers, cups, promotion/relegation, online multiplayer, or cloud saves. No Postgres integration is needed for local play.

## Controller

Connect an Xbox, PlayStation, or other standard-mapped gamepad over USB/Bluetooth, focus the page, then press a button. Detection and hints update automatically.

- Left stick / D-pad — move (analog deadzone prevents drift).
- A / Cross — pass in possession; hold to pressure while defending. Holding Xbox X also pressures.
- X / Square — hold and release to shoot; stick vertical axis aims at a post.
- B / Circle — cross in possession; tackle while defending.
- LB / L1 or Y / Triangle — switch while defending or chasing a loose ball. Flick the right stick to select in that direction. Your ball carrier stays selected during possession.
- RT / R2 (or RB / R1) — sprint.
- View / Share — change camera.
- Start / Options — kick off, pause/resume, or rematch at full time.

Disconnecting the active controller pauses the match. Held buttons are edge-detected so pause/pass do not repeat. Browsers need a secure context (localhost or HTTPS) and a standard mapping; unmapped devices show an explanatory status. See the [Gamepad API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API). Input mapping is covered by automated tests; physical hardware behavior still depends on the browser/controller.

## Structure

- `app/game/simulation.ts` — deterministic fixed-step match logic, independent of rendering.
- `app/game/rules.ts` — offside geometry, foul classification, and restart formations.
- `app/game/audio.ts` — synthesized ambience and force-sensitive kicks, recorded referee whistles, plus a locally bundled CC BY 4.0 football goal recording for goals.
- `app/game/renderer.ts` — Three.js stadium, lights, animated footballers, ball, and camera.
- `app/components/FootballGame.vue` — input, audio, lifecycle, and the animation loop.
- `app/app.vue` — match setup, scoreboard, radar, controls, pause/full-time UI.
- `app/assets/css/main.css` — Tailwind CSS 4 plus the game's visual styles.
- `tools/create-player.py` — reproducible Blender authoring/export script.
- `assets/footballer.blend` — editable player model.
- `public/models/footballer.glb` — player asset loaded by the game.

## Blender workflow

The original player is made in Blender with shaped anatomy, kit geometry, facial details, hands, boots, and named shoulder, elbow, hip, knee, and ankle pivots. The runtime applies lightweight running animation and team materials to clones of the exported GLB. The stadium is procedural Three.js geometry with 7,200 instanced spectators, textured turf, and a broadcast camera. This remains an original prototype, not AAA scanned character art or motion-captured animation.

```sh
blender --background --python tools/create-player.py
```

This regenerates the `.blend` and `.glb` files. Blender is only needed when editing/regenerating assets; it is not a runtime dependency.

## Gameplay behavior

Short passes lead a moving teammate. The receiver keeps running, and a gold ring marks the target. Control transfers on the first touch rather than at pass release. Manual selection is available while the ball travels; a neutral selected receiver assists toward the incoming ball. Receiving and dribbling use a bounded, smooth ball follow instead of resetting its position. Kicks preserve the current ball position, use rolling deceleration, and ignore immediate contact with the kicker. Fast shots can be blocked rather than being captured instantly by every outfield player.

Difficulty applies to the opponent's running speed, number of pressing players, anticipation, tackle reaction, decision speed, shooting error, goalkeeper speed, and reach. The chosen level is displayed next to the clock. Casual creates more time and space; Pro presses with two players and attacks more quickly. Settings take effect at kickoff/rematch.

## Performance

The simulation runs at 60 Hz with bounded catch-up and interpolated positions. Camera and player rotation use time-based smoothing. Rendering stays outside Vue reactivity; HUD snapshots update at about 12 Hz. Footballer body parts and stadium seats use GPU instancing, field markings share one line mesh, pixel ratio is capped, and all geometries/materials/listeners are disposed on teardown. Performance mode disables shadow maps and renders at 1x pixel ratio; Balanced uses 1.5x and High uses up to 2x. Actual FPS depends on the device and viewport.

## Development checks

```sh
npm run format       # Oxfmt
npm run lint         # Oxlint
npm run typecheck
npm test             # Node's built-in test runner
npm run check        # format check, lint, types, tests, production build
npm run preview      # serve the production build locally
npm run generate     # static website output in .output/public
```

The automated tests cover match rules plus complete pass/reception sequences, moving receivers, continuous first touches, possession-locked switching and pass reception, shot trajectories, full-match difficulty differences, controller mappings, deadzones, and button edges.

## Dependency audit

The initial registry audit reports inherited Nuxt tooling advisories (including `simple-git`, `node-forge`, and `braces`). Nuxt DevTools is disabled and the dev server binds only to loopback. Do not expose the development server to the internet. Review upstream patched releases before public deployment; no forced downgrade to Nuxt 3 is applied. The static export does not deploy the development toolchain.

## Tempo, keepers, and match view

Matches fill the browser viewport; the in-match expand button also requests system fullscreen. Normal running is 5.2 m/s, sprinting with the ball 6.8 m/s, and off-ball sprinting 7.8 m/s, with gradual acceleration. Forward support runners can overtake the dribbler, wingers keep width, and extra defenders close down around their box.

Keepers have difficulty-dependent reaction delays (0.38/0.27/0.18 seconds), bounded movement and reach, committed dives, and recovery after hard-shot parries. A clean catch inside their own penalty area is protected possession: attackers retreat outside the box, teammates spread, and the ball is held at chest height. The CPU waits at least three seconds and for the box to clear, distributing by six seconds. Your keeper can pass with J/A/Cross or kick long with L/B/Circle after settling; automatic distribution prevents stalling at six seconds. A parry remains a live, contestable rebound.

Design references: EA's [FC 26 gameplay deep dive](https://www.ea.com/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-gameplay-deep-dive) describes authentic tempo, trajectory reading, and deflections; Konami's [eFootball controls](https://www.konami.com/efootball/en-us/page/new_controls) distinguish pressure and defensive positioning. These inspire the behavior; all simulation formulas and tuning here are original prototype choices.

## Controls and restarts

A 650 ms action buffer accepts a pass, cross, or shot just before the receiver controls the ball. Inputs expire, are cleared by pause or lost possession, and execute once. Keyboard and gamepad commands use their current aim direction. A quick shot tap has usable power; holding adds power. Receiving the ball selects its new owner; all switch inputs are ignored while your team has possession. Clicking match controls restores pitch focus.

Corners position a winger at the corner arc, runners at the near post, central and far-post areas, a short option, opposing markers, and covering defenders. Players stay in place until the kick. Cross delivers into the box; Pass provides a short option. Set-piece commands entered during the 1.2-second setup are queued for the whistle. CPU restarts take about three seconds; unattended home restarts release at twelve seconds. The match clock pauses during setup.

For penalties, all other outfield players remain behind the spot and outside the penalty area/arc, with the keeper on the goal line. Aim with W/S or the stick and release Shoot. Free kicks have a defensive wall and can be passed, crossed, or shot.

Offside positions are recorded when a teammate kicks, using the ball and second-last opponent. Receiving/touching the ball in an offside position triggers an indirect free kick; deliberate defensive possession resets the check, while parries and blocks do not. Direct corner, goal-kick and throw-in receptions are exempt. Support runners try to hold the offside line. This prototype uses player-center positions and ball contact; detailed limb-level judgements and goalkeeper line-of-sight obstruction are not simulated.

Fouls currently cover body-first/late tackles based on contact geometry, including AI challenges. A foul in the offender’s own penalty area becomes a penalty; other careless challenges award a direct free kick. Clean ball-first challenges remain legal. Fouls and offsides are counted in the pause/full-time statistics.

The rule references are IFAB [Law 11](https://www.theifab.com/laws/latest/offside/), [Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/), [Law 14](https://www.theifab.com/laws/latest/the-penalty-kick/), and [Law 17](https://www.theifab.com/laws/latest/the-corner-kick/). Implemented gameplay is a scoped approximation, not a complete officiating engine.

## Sound troubleshooting and corner practice

Use **Test sound** in setup or the pause menu. It unlocks browser audio and plays a whistle even when the match is paused. In Pause, use Sound preview to audition the goal celebration, foul call, soft pass, cross, or powerful shot. Kick timbre and volume follow the kick type and actual ball speed; goals play a seven-second recording of a real Brentford goal, cut to begin at the crowd eruption and bundled locally under CC BY 4.0 (see `public/audio/CREDITS.md`). Sound events that arrive while the audio context is starting are queued rather than discarded; the crowd mix is normalized and the default master volume is 45%. The pause-menu meter measures the app's output signal after its limiter. A moving meter confirms signal generation, not that a browser tab, OS output device, or speakers are unmuted. Pause intentionally fades stadium ambience.

**Practice corners** creates an actual corner using the same restart logic as an exhibition. The taker stands outside the corner facing the ball and pitch. Five runners attack the near-post, central, and far-post spaces with defenders marking goal-side; one teammate offers a short option and others cover a counterattack. The practice corner waits for your input so you can inspect it. Use **Other side** to inspect the opposite corner or **Reset corner** to try the delivery again. Press Cross (L / B / Circle) or Pass (J / A / Cross) to take it.

### Contact decisions and throw-ins

Standing tackles award a foul only when the close challenge intersects the opponent before reaching the ball. A nearby miss or ordinary shoulder-to-shoulder pressure is not enough. Assisted pressure waits for a clean ball challenge. Explicit body-first or late tackles still award a free kick (or a penalty inside the defender's area). The restart card names the player and reason; offside and double-touch calls explicitly identify an indirect free kick. This remains a simplified contact model, not a complete referee system.

Throw-ins use the touchline exit location, including near the corners. The thrower stands outside the line, facing the pitch, with the ball overhead. Nearby teammates offer three passing options; opponents stay at least two metres away. Pass throws short, Cross selects a longer target, and Shoot also throws rather than kicking from the sideline. **Practice throw-ins** in setup lets you inspect, take, reset, and switch the side of the throw.

Reference: [IFAB Law 15](https://www.theifab.com/laws/latest/the-throw-in/). Goal recording: [Football-crowd-GOAL.wav by paulw2k](https://freesound.org/people/paulw2k/sounds/196461/) (CC BY 4.0).

Goalkeepers hold slower balls and manageable central shots when they have time to react and are set. Hard shots, stretching saves, and late reactions still produce parries; protected possession and distribution apply after a catch. Full time plays a distinct three-blast whistle once, with a longer final blast. Both the goal recording and full-time whistle can be auditioned in Pause → Sound preview.

Referee whistles now use [Pablo-F’s football referee whistle recording](https://freesound.org/people/Pablo-F/sounds/90743/) (CC BY 3.0), at its original pitch. Restarts play one blast, fouls a long-short call, and full time three blasts with a longer final blast. The small MP3 is preloaded and decoded after audio unlock; early events wait for the recording, and a load failure is shown in the audio status rather than silently substituting a synthetic tone. Source attribution and processing details are in `public/audio/CREDITS.md` and the pause menu.

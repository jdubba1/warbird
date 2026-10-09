# Flight reference and calibration

The target is WARDOGS Little Bird handling with assists off. Reference footage is [Hieb's flight guide](https://www.youtube.com/watch?v=sarU96OHVMI), uploaded September 15, 2026, and [settings guide](https://www.youtube.com/watch?v=5zEtQHaFtLA), uploaded September 12.

`reference/hieb-landings.json` contains manually read HUD samples and keyboard transitions from two landing sequences. No video or screenshots are included. `scripts/fit-reference.mjs` compares a conditional fit against these samples:

```sh
node scripts/fit-reference.mjs
```

The diagnostic does not apply its candidate coefficients. Previous reports are retained in `reference/`.

## Limits

- Key transitions are sampled at 10 Hz, about +/-0.1 s. The overlay and HUD may not be synchronized.
- HUD speed and altitude are rounded and subject to compression and manual reading error.
- Raw mouse motion, entry attitude, rates and rotor state are unknown.
- Chase camera heading and horizon motion do not uniquely identify aircraft attitude.
- Multiple coefficient sets can reproduce portions of the footage. These reports do not establish physics parity or a uniquely identified model.

## Current handling

The simulation steps at 120 Hz. Quaternion attitude rotates the rotor thrust direction into world space; velocity retains its own momentum. Tilt redirects lift, and gravity continues acting independently. Drag and powered disc resistance use body-relative velocity. Pitch/roll inertia, filtered inputs and rotor lag provide weight; yaw has separately tuned authority and speed attenuation.

Stock handling includes stronger above-neutral collective, responsive yaw, reduced lateral drag for drifting turns, and a provisional cruise drag transition around 79 km/h. These are playtest choices, not measurements of WARDOGS coefficients.

Collective springs back to powered idle on release, rather than latching the last commanded value. Idle can cause sustained upright climb, so repeated down taps fight restored thrust. Hold mode and older profiles remain selectable. Custom saved settings are preserved when stock profiles migrate.

For controlled capture and held-out validation, see [RESEARCH.md](RESEARCH.md). Useful clips isolate one axis with known inputs and show the game build, settings, aircraft, assists, camera and HUD.

## Miniguns (v0.14)

The guns are fixed to the airframe. The pilot's right-seat origin and raised reflex sight define a shared aim ray in both views; the guns do not follow the cursor or snap to a surface. The initial level-flight zero is 30 m, with 50 and 100 m options. Bullet launch velocity includes helicopter velocity, and gravity stays in world space when banking.

[ProLosco's aiming guide](https://www.youtube.com/watch?v=ZsMP9uBVn9U) describes aiming the whole aircraft and notes that Early Access numbers are approximate. A [trainer's guide](https://wardogsflightsim.com/drills/gun-run/) attributes a roughly 30 m crossing point to that video, citing the developer. This distance has not been independently confirmed from footage; caption retrieval was blocked. The default is provisional, not a parity claim.

The 800 m/s speed, 50 rounds/s per gun, fixed mounting offsets and zero-drop compensation are trainer estimates. There is no dispersion, penetration, damage, ammunition limit or recoil model yet. Impact marks use the visible world triangles, including instanced trees, rather than the smaller aircraft obstacle cores. Marks use a 2,048-slot ring buffer and persist until overwritten or reset.

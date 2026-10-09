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

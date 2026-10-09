# WARDOGS flight research and calibration

Research date: 2026-10-08. Target aircraft: Little Bird, assists off. The exact game build is not recorded. The current game has had flight changes since the closed beta, so old settings and footage are not automatically representative.

## Evidence

1. [BULKHEAD Steam announcements, Season 1 changelog](https://steamcommunity.com/app/1867240/announcements/?l=finnish): the developer states input damping applies to every device and describes a Lakota pitch correction. This establishes the presence of damping and aircraft-specific handling. It gives no numerical transfer function, mass, inertia, drag or thrust coefficients. The localized listing contains English patch text.
2. [Steam community helicopter controls FAQ](https://steamcommunity.com/app/1867240/discussions/0/588436698284822212/): a player-authored Closed Beta 02 guide dated September 3 documents independent collective, cyclic and yaw, mouse-axis mapping, inversion, W/S collective and A/D yaw layouts, and the existence of flight assists. Its beta bugs and sensitivity suggestions are not treated as verified current behavior.
3. [FAA Helicopter Flying Handbook](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/helicopter_flying_handbook): primary reference for physical concepts and a starting point for a plausible rotorcraft model. Real helicopter behavior does not prove which effects WARDOGS implements. FAA concepts are not a source for game tuning coefficients.
4. Search surfaced several unofficial browser trainers and creator-guide aggregators. These demonstrate similar projects exist, but their claims of WARDOGS fidelity were not independently validated. Their coefficients and supposed measured thresholds were not imported.

No verified source found here publishes the actual WARDOGS physics parameters. This prototype's numbers are chosen for coherent handling and deliberately exposed for calibration. It should never be represented as physics-matched until validated on held-out footage.

## Most useful capture

The user's own controlled capture is more informative than unrelated footage. Match aircraft, build, assist state, bindings, camera, FOV, mouse DPI, sensitivity and axis isolation. Save the original 60 fps or higher recording with HUD values legible. Display input timing and, if possible, normalized analog axes and collective. A normal key overlay reports key press state, not the game's filtered control signal or analog mouse motion.

Use open, level terrain, no wind if selectable, and consistent mass/loadout. Begin with assists off if that is how the user actually plays. Record each isolated axis in both directions, with three repetitions. Never infer physical mass and force independently from a video when only their ratio is observable.

| Test | Inputs and initial state | Observable fit targets |
| --- | --- | --- |
| Hover roll | Stable hover; roll key 0.5 s; release 3 s; reverse direction on next run | Input lag, angular acceleration, peak bank rate, rate decay |
| Hover pitch | Same protocol for pitch | Pitch acceleration/decay, camera lag separately |
| Hover yaw | Same protocol for yaw | Heading change, yaw acceleration/decay |
| Collective step | Level hover; up 2 s, neutral 3 s, down 2 s | Vertical acceleration, thrust lag, neutral behavior |
| Forward run | Hold observed nose-down attitude 10 s; stable collective | Acceleration and drag versus speed |
| Coast/flare | Known initial speed, level or flare to observed angle | Drag, braking distance, height gain |
| Fast yaw | Repeat yaw test around 150 km/h | Speed-dependent tail authority |
| Coordinated turn | Known entry speed; fixed roll/pitch/yaw timing | Held-out turn radius and height loss |

Also test collective release on the ground. Does it return to neutral, keep position, or directly command lift only while held? This input mapping matters as much as physics.

## Extraction and fitting

1. Mark each input transition by frame. Record HUD airspeed, altitude and heading at 10–20 Hz. OCR can accelerate this, but manually verify digits and units; unwrap heading across 0/360 degrees. Smooth noisy data before differentiating, and keep the original samples.
2. Estimate attitude from an attitude instrument if present. A chase camera horizon measures aircraft attitude mixed with camera tracking, stabilization and perspective. Fit camera lag separately, or use a cockpit view with known FOV. Third-person motion alone cannot uniquely recover the dynamics.
3. Fit keyboard pulse responses first. Full key presses avoid the unknown analog mouse signal. Use angular angle/rate curves and vertical speed directly when available, rather than noisy second derivatives.
4. Fit effective acceleration, damping and input lag. Then fit rotor lag/lift and the drag curve using level steps and straight runs. Fit yaw speed scaling last. Use bounded least squares; include measured latency and confidence intervals. Exclude ground contact, camera switches and damaged states from initial fits.
5. Only then calibrate mouse mapping with DPI plus raw deltas or measured motion. Account for OS acceleration, browser pointer-lock units, in-game sensitivity and response curve. A copied percentage is not a conversion factor.
6. Keep a turn/flare/landing sequence out of the fit. Compare heading, airspeed, altitude, turn radius, stopping distance and input-to-attitude delay on that held-out run. Report numerical errors rather than calling it matched by feel.

The browser records its own inputs and state at 20 Hz, including coefficients used in each sample. Controlled pulse tests supply an identical timed command on every run. Feel-based tuning can produce an enjoyable prototype, but remains subjective and cannot establish game fidelity.

## Questions that change calibration

- Which helicopter and game build?
- Collective keys and release behavior?
- All flight assists, including stability, hover and turn coordination?
- Cockpit or chase camera, with FOV?
- DPI, mouse pitch/roll sensitivity, vehicle multiplier, inversion and isolation?

A 2–3 minute recording of isolated tests plus a settings screen is a good first calibration batch. More research cannot substitute for these measurements.

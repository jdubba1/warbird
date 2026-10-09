# Warbird

[Fly it](https://warbird.jimbo.sh) · [Issues](https://github.com/jdubba1/warbird/issues) · [Contributing](CONTRIBUTING.md)

A free browser helicopter playground inspired by WARDOGS. Fly a Little Bird over a mountainous world with independent collective, cyclic and yaw, cockpit and chase cameras, and Doodle or Natural rendering. Warbird uses graphite lines on cool paper, orange flight cues and monospaced instruments.

The handling is an approximation tuned from footage and playtesting. It is not a physics match or an official WARDOGS project.

## Run locally

Requires Node.js 22 or newer. No dependencies to install and no build step.

```sh
git clone https://github.com/jdubba1/warbird.git
cd warbird
npm run dev
```

Open http://localhost:5173. Click to capture the mouse; Escape opens controls, rebinding, challenges and tuning.

| Input | Action |
| --- | --- |
| W / S | Raise / lower collective |
| A / D | Yaw left / right |
| Q / E | Roll left / right |
| Mouse left / right | Roll left / right |
| Mouse up / down | Pitch down / up |
| Space / Left Ctrl | Pitch up / down |
| Left mouse / F | Fire miniguns (F in mouse-drag mode) |
| C | Switch cockpit / chase |
| R | Reset |
| Escape | Pause menu |

Twin miniguns fire from fixed mounts toward a provisional 30 m zero. Choose 30 / 50 / 100 m under **Zero** in the pause menu. Close impacts sit below the sight and apart; beyond the zero the streams cross and rise relative to the sight until drop takes over. Rounds inherit helicopter momentum. Orange surface marks clear on reset. Bullet speed and rate are estimates, not measured WARDOGS values.

## Contribute

Issues and PRs are welcome. Physics feedback is especially useful with the handling settings, camera view, inputs and a short clip. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

```sh
npm run check
```

This runs syntax checks and the Node behavior tests. Tests cover flight dynamics, controls, camera/render isolation, terrain and collisions. They do not replace a browser check for visual or pointer-lock changes. Optional offline GLSL compilation: `python3 scripts/check-shaders.py`, with `glslc` installed.

## Code map

- `dist/physics.js`: 120 Hz flight model, quaternion attitude, rotor response and world-space momentum.
- `dist/controls.js`: keyboard, mouse capture and rebinding.
- `dist/world.js`, `dist/terrain.js`: mountains, obstacles, helicopter and cockpit geometry.
- `dist/camera.js`, `dist/rendering.js`, `dist/palette.js`: chase/cockpit cameras, doodle postprocessing and unshaded aircraft overlay.
- `dist/weapons.js`: twin fixed guns, ballistic rounds, visible-surface collision index and bounded orange impact marks.
- `dist/main.js`: HUD, pause menu, challenges and calibration.
- `tests/`: Node tests; `reference/`: manually sampled public flight data and diagnostic fits.

The app serves `dist/` directly. Three.js and fonts are vendored, so play does not fetch third-party assets. Settings are saved locally; calibration CSVs export from browser memory.

[REFERENCE.md](REFERENCE.md) describes the footage and tuning limits. [RESEARCH.md](RESEARCH.md) has a controlled capture protocol. The model omits blade flapping, vortex ring state, autorotation, engine limits, torque coupling, wind and individual rotor/skid collisions.

## Credits and license

Doodle shader adapted from [Evan Milenko's Doodle Shooter](https://doodleshooter.vercel.app/) ([@EvanMilenko](https://x.com/EvanMilenko)).

The exterior uses [AnirudhRao's MH-6 Little Bird](https://sketchfab.com/3d-models/mh-6-little-bird-d6ec6eeb84b240789f54923bdedafc86), adapted under CC BY 4.0. [Hieb's flight guide](https://www.youtube.com/watch?v=sarU96OHVMI) informed the handling experiments.

Warbird code is [MIT licensed](LICENSE). Third-party assets retain their own licenses, including the aircraft geometry under CC BY 4.0, Three.js under MIT, and fonts under SIL OFL 1.1. See [CREDITS.md](CREDITS.md).

No WARDOGS code, recordings or artwork are included. WARDOGS belongs to its respective owners.

## Hosting

Vercel can deploy this repo using the included `vercel.json`: run the checks, then serve `dist/`. No environment variables or backend are required.

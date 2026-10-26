# Cuber

[Open Cuber](https://giantneuralnet.github.io/cuber/)

A browser-based, mobile-friendly editor for blocky 3D artwork. Build connected cubes, paint pixel textures, create expressions and animate your model. Projects stay in your browser until you download them.

## Create

- **Build:** attach cubes, move and resize parts, edit joint pivots and rotation axes. Mirror on X, Y or Z and snap to a shared pixel grid.
- **Paint:** brush, fill, erase, pick colors, preview mirrored strokes, and paint opacity, emission and metalness. Transparent pixels show a checkerboard. Overlay frames support animated expressions.
- **Animate:** pose connected child branches, create multiple animation clips, and select expression frames at keyframes.
- **File:** name and download your project, open a saved ZIP, or start a new project.

Undo/redo and browser-local autosave are included. Download ZIPs regularly for portable backups; browser data can be cleared independently.

Desktop paint shortcuts: **B** brush, **F** fill, **I** eyedropper, **E** erase. Drag empty space to orbit; pinch to zoom and use two fingers to pan. Tap the view cube for an orthographic view; double-tap to recenter.

## Download format

```text
My_Model.zip
├── README.txt
├── project/                 Editable model, atlas, overlays and material sources
├── Roblox/
│   ├── My_Model.fbx         All original joints
│   ├── My_Model_fused.fbx   Static joints merged across all clips
│   ├── animations/
│   │   ├── unfused/         Matching KeyframeSequences and binding helper
│   │   └── fused/
│   ├── textures/            Nearest-neighbor upscales through 1024px
│   └── README.txt
└── Godot/
    ├── My_Model.glb         Embedded textures, fused skeleton and native clips
    ├── animation-settings.json
    └── README.txt
```

Each engine folder is self-contained. Animated texture projects also include texture event data; Godot receives precomposited frame textures and `texture_player.gd`. Follow that folder's README to attach the helper to an inherited GLB scene. Motion remains native AnimationPlayer playback. Expressions switch discretely to the active clip's frame during animation blends.

The Godot GLB uses Y-up, -Z forward, and one Godot unit per Cuber unit. It includes nearest-neighbor sampling, transparency, emission and metallic/roughness maps where painted. Set clip looping in Godot's Advanced Import Settings from `animation-settings.json`; the texture helper sets looping automatically when present. Godot's default animation optimizer can simplify small movements; disable it in Advanced Import Settings if exact authored motion is required. Collision shapes are left to the destination game.

Open the **whole ZIP** in Cuber to continue editing. Older flat ZIP bundles and legacy project files remain supported. FBX and GLB are interchange outputs, not editable Cuber source projects.

## Run locally

No package installation or build is required. Libraries are vendored.

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. The editable HTML, CSS and JavaScript live in `dist/`.

## Test

Requires Node.js 22 or newer:

```sh
node --test tests/*.test.mjs
```

Tests cover joint hierarchy, constraints, mirroring, snapping, pixel atlases, RGBA/material maps, legacy and organized ZIP round-trips, FBX fusion, Roblox animation coordinates, and GLB skinning/UVs/root motion. Optional independent FBX validation uses ufbx via `FBX_INSPECTOR` (see `tests/fbx-inspect.c`).

Godot exports have also been checked with the Khronos glTF validator and imported in Godot 4.5.1. Browser checks cover mobile downloads, reopening the exported ZIP, and dropdown layout.

## Source layout

- `dist/app.js`, `dist/style.css`: editor UI and interactions.
- `dist/model-ops.js`, `dist/build-editing.js`, `dist/rig-physics.js`: editing and posing.
- `dist/atlas-layout.js`, `dist/paint-*.js`: texture atlas, layers and materials.
- `dist/export.js`, `dist/asset-project.js`: download bundles and project loading.
- `dist/fbx-export.js`, `dist/fbx-fusion.js`: FBX writing and static-joint fusion.
- `dist/godot-export.js`: GLB writing, material conversion and texture helper generation.
- `dist/roblox-animation-export.js`: native KeyframeSequences and texture markers.

## License

Cuber is released under the [MIT License](LICENSE). You can use, modify and redistribute it, including commercially, while retaining the license notice.

Third-party library licenses are retained in `dist/vendor/`. Exported artwork belongs to its creator.

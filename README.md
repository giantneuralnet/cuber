# Cube Studio

A static, mobile-first cube modeler. Build connected cubes, paint their shared texture atlas, and pose a gravity-free articulated rig in keyframes.

## Run

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. All libraries are vendored; no package installation or build is required.

- Tap a face to attach a cube; Erase removes a cube and its descendant branch.
- Mirror X/Y/Z switches stay available in every mode. Build mirrors placement onto existing opposite surfaces, and mirrors moving, resizing, and erasing matching cubes. The same switches control Paint mirroring and reflected physical posing in Animate.
- Drag empty space to orbit. Use Orbit to rotate from anywhere. Pinch to zoom and use two fingers to pan. On desktop, scroll to zoom and right-drag to pan.
- Use the arrow tool to select a cube. Drag it along its connected face, or drag its corner handles to resize it. Attached branches and all saved keyframes follow the new size and joint pivots. The root slides along the ground plane. Build’s Grid control sets placement, block sliding, joint sliding, and resizing to None, 0.05, 0.1, 0.2, or 0.25 studs. None disables snapping and hides the floor grid. Drag a joint dot with the arrow tool to reposition its pivot within the contacting faces without moving the rest blocks.
- Tap a joint dot in arrow or Animate mode to choose Omni, X, Y, or Z rotation in the parent cube’s local axes. Axis changes constrain existing keyframes as well as physical dragging.
- A 3D line shows the chosen joint rotation axis; Omni shows all three. The floor is transparent while the grid remains visible.
- Paint with a raycast brush or fill one face. Toggle X, Y, and Z mirroring separately or together; the mirror planes cross the root cube’s center and paint matching existing surfaces, including hidden faces. All faces occupy separately packed rectangles of one shared atlas. Pixels use nearest-neighbor sampling and solid integer brush stamps. Each face gets the same texels per stud (including non-square faces); the common density reduces only if the whole model exceeds atlas capacity. Resizing stretches the existing paint across each new face with nearest-neighbor resampling; the atlas still allocates the same texels per stud. Paint’s Texture control sets its resolution to 256, 512, or 1024 pixels square. Resizing preserves paint and supports undo; project and bundle exports retain the chosen resolution.
- In Animate, tap a cube to pin/unpin it. Drag an unpinned cube to pose the connected rig. Add a keyframe to duplicate the pose, then drag to edit it. Frame edits save when the drag ends. Parts do not collide, and joint endpoints are projected into exact alignment on every simulation frame.
- Use + Row for a separate animation. Each row has its own playback and keyframes, and exports as a separate KeyframeSequence. The scrollable timeline shows one and a half rows, with + Row and joint visibility beside Mirror. Tap a frame to select it; tap the selected frame to toggle its Time, Copy, Paste, Reset pose, and Delete menu. Reset pose restores that frame to the built pose; copy/paste also works across rows. Paste preserves the destination time.
- Undo/redo covers topology, moving, resizing, painting, joint axes, pins, keyframes, paste, and project import. The current project, atlas, keyframes, grid, and mode save automatically to localStorage and restore on page load. Undo history is session-only. The folder menu still saves portable .cube copies.
- Export creates a ZIP with model.rbxmx, a shared PNG atlas, local-space OBJ meshes, the editable project, and import instructions. Roblox asset uploading and in-game testing remain a later step.

## Implementation

`dist/app.js` owns the editor, pointer gestures, shared atlas, patch-based undo, and Cannon point-to-point joint simulation. `dist/model-ops.js` contains rest-shape edits, constrained pose projection, reflection math, and clipboard pose adaptation. `dist/export.js` produces Roblox XML and dimensioned OBJ meshes. Project format v3 preserves animation rows and packed atlas layouts; v1/v2 projects migrate automatically with their paint and keyframes. Preview playback interpolates relative joint rotations, retaining connected pivots. The exported rig adds an invisible anchored RigRoot so movement of the authored root is also represented as Motor6D animation. Authoring pins are metadata rather than anchored animated Parts.

No server, account data, telemetry, or external runtime requests are used by the editor.

The UI uses a dark palette throughout. Text selection and browser double-tap zoom are disabled; the canvas retains its custom pinch zoom and two-finger pan.

## Validation

Mobile UI checks at 390×844 and 320×740 cover building, brush painting, fill, undo, pose dragging, anchoring, timeline playback, export, and save/reopen. WebMCP mode changes, readback, undo, and invalid mode input were exercised. Export was checked for valid archive/XML structure, shared atlas dimensions, mesh UVs, references, and numerical reconstruction of saved keyframe poses:

```sh
node tests/model-ops.test.mjs
node tests/pointer-input.test.mjs
node tests/rig-editing.test.mjs
node tests/settings-save.test.mjs
node tests/animation-atlas.test.mjs
python3 tests/check-export.py /path/to/cube-model.zip
```

The expanded controls were checked at 390×844 and 320×740. Tests cover resize/slide with connected branches and existing poses, local X/Y/Z hinge projection, combined mirror reflections, keyframe copy/paste and undo, version 1/2 project import, and sized mesh/rig exports. An actual exported atlas was inspected to confirm matching brush paint on hidden opposite faces.

Actual Roblox Studio import, asset uploads, animation publication, and live-game playback have not been tested.

Pointer lifecycle regressions cover stale touches, interrupted captures, release outside the canvas, two-finger to single-finger transitions, and toolbar recovery. Portrait browser checks confirm persistent mirror toggles, mirrored placement, visible axis guides, and pose dragging. Physical phone touch testing remains outstanding.

Rig regressions exercise 960 drag frames across Omni/X/Y/Z constraints, checking coincident joint endpoints and zero collision contacts on every frame. Snapped movement, joint overlap bounds, and edited pivot preservation are covered. Legacy 2048/4096-pixel projects load with their atlas downsampled to the new 1024 maximum. Texture undo history has a 128 MiB budget (always retaining the newest action).

Paint’s Texture button switches between the 3D model and its shared atlas. Direct atlas painting shares the same brush, fill, mirroring, and undo operations. Pinch/scroll to zoom and enable Orbit to pan the atlas; Fit frames its occupied faces. Body damping, relative joint angular damping, and a smoothed grab target add resistance during posing.

Autosave is debounced by 250 ms and flushes after active gestures when the page hides. Storage failures show a save-copy message and retain the last complete stored project. Checks cover all grid values, local-save debounce/failure recovery, browser reloads with painted/posed projects, a 256-pixel bundle export, and legacy texture downsampling.

Canvas touchstart/touchmove handlers actively prevent native long-press behavior alongside WebKit selection/callout CSS. The iOS magnifier fix still needs validation on a physical iPhone. Regression coverage includes XYZ mirrored poses with exact joint connections, independent animation rows, atlas packing and constant density for 128 boxes at all resolutions, and integer brush stamps.

The v3 UI was checked at 390×844 and 320×740 for multi-row copy/paste, timing edits, reset/delete/undo, autosave reload, mirrored physical drag, resizing, and atlas painting. An exported two-animation bundle reconstructs all three saved poses with error below 5e-9; its painted face contains only the exact base and brush colors, with no antialiased edge pixels.

In Paint, the folder beside Texture imports or exports the shared atlas as PNG. Export keeps the current resolution and exact atlas layout. Import replaces that atlas, scaling a square PNG to the selected resolution with nearest-neighbor sampling; cube geometry and UV layout are unchanged. Import supports undo/redo and local autosave. Files are decoded locally, with a 16 MB / 4096-pixel input limit.

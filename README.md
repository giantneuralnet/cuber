# Cuber

A static, mobile-first cube modeler. Build connected cubes, paint their shared texture atlas, and pose a gravity-free articulated rig in keyframes.

## Run

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. All libraries are vendored; no package installation or build is required.

The editable HTML, CSS, and JavaScript source lives in `dist/`; it can be served directly by any static web server. The browser title currently uses Cube Studio.

Run the automated checks with Node.js 22 or newer:

```sh
node --test tests/*.test.mjs
```

- Tap a face to attach a cube; Erase removes a cube and its descendant branch.
- Mirror X/Y/Z switches stay available in every mode. Build mirrors placement onto existing opposite surfaces, and mirrors moving, resizing, and erasing matching cubes. The same switches control Paint mirroring and reflected physical posing in Animate.
- Drag empty space to orbit in every mode. A paint stroke starts on a cube and can continue across face edges and gaps; a drag starting on empty space stays a camera gesture. Use Orbit to rotate from anywhere. Pinch to zoom and use two fingers to pan. On desktop, scroll to zoom and right-drag to pan.
- Use the arrow tool to select a cube. Drag it along its connected face, or drag its corner handles to resize it. Attached branches and all saved keyframes follow the new size and joint pivots. The root slides along the ground plane. Build’s Grid control sets placement, block sliding, joint sliding, and resizing to None, 0.05, 0.1, 0.2, or 0.25 studs. None disables snapping and hides the floor grid. Drag a joint dot with the arrow tool to reposition its pivot within the contacting faces without moving the rest blocks.
- Tap a joint dot in arrow or Animate mode to choose Omni, X, Y, or Z rotation in the parent cube’s local axes. Axis changes constrain existing keyframes as well as physical dragging.
- A 3D line shows the chosen joint rotation axis; Omni shows all three. The floor is transparent while the grid remains visible.
- Paint with a raycast brush or fill one face. Toggle X, Y, and Z mirroring separately or together; the mirror planes cross the root cube’s center and paint matching existing surfaces, including hidden faces. All faces occupy separately packed rectangles of one shared atlas. Pixels use nearest-neighbor sampling and solid integer brush stamps. Each face gets the same texels per stud (including non-square faces); the common density reduces only if the whole model exceeds atlas capacity. Resizing stretches the existing paint across each new face with nearest-neighbor resampling; the atlas still allocates the same texels per stud. Paint’s Texture control sets its resolution to 256, 512, or 1024 pixels square. Resizing preserves paint and supports undo; project and bundle exports retain the chosen resolution.
- In Animate, tap a cube to pin/unpin it. Drag an unpinned cube to pose the connected rig. Add a keyframe to duplicate the pose, then drag to edit it. Frame edits save when the drag ends. Parts do not collide, and joint endpoints are projected into exact alignment on every simulation frame.
- Use + Row for a separate animation. Each row has its own playback and keyframes, and exports as a separate KeyframeSequence. The scrollable timeline shows one and a half rows, with + Row and joint visibility beside Mirror. Tap a frame to select it; tap the selected frame to toggle its Time, Copy, Paste, Reset pose, and Delete menu. Reset pose restores that frame to the built pose; copy/paste also works across rows. Paste preserves the destination time.
- Undo/redo covers topology, moving, resizing, painting, joint axes, pins, keyframes, paste, and project import. The current project, atlas, keyframes, grid, and mode save automatically to localStorage and restore on page load. Undo history is session-only. The folder menu still saves portable .cube copies.
- Export creates cube-asset.zip containing asset.json (parts, joints, all animation rows, local geometry and UVs), atlas.png, model.cube, and a format guide. The asset description uses explicit Roblox coordinates and quaternion conventions. A later importer can construct the rig directly in Roblox; no model XML is generated.

## Implementation

`dist/app.js` owns the editor, pointer gestures, shared atlas, patch-based undo, and Cannon point-to-point joint simulation. `dist/model-ops.js` contains rest-shape edits, constrained pose projection, reflection math, and clipboard pose adaptation. `dist/export.js` produces the versioned JSON asset description and texture bundle. Project format v3 preserves animation rows and packed atlas layouts; v1/v2 projects migrate automatically with their paint and keyframes. Preview playback interpolates relative joint rotations, retaining connected pivots. The asset description specifies an invisible anchored RigRoot so movement of the authored root is also represented as joint animation. Authoring pins are metadata rather than anchored animated Parts.

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

Project > Open project uses a directly tappable native file input without extension filtering, so mobile Files pickers can select .cube documents. The selected file is validated before replacing the editor; canceled or invalid imports retain the current project, and the same file can be reopened. New project creates a blank root cube and texture with a fresh animation row; Undo restores the previous model, paint, and animations. Both operations autosave.

## Asset bundle format

The primary export is a data-only ZIP: `asset.json`, `atlas.png`, `model.cube`, and `README.txt`. It replaces the former model XML/OBJ bundle. The editable project format and Open project behavior remain unchanged.

The versioned description includes box sizes and rest poses, hierarchy, both joint bind frames, authoring axis constraints and pins, every animation row with joint-local transforms, and indexed local geometry with exact shared-atlas UVs. All asset coordinates use +Y up and −Z forward, in studs, with normalized XYZW quaternions. The editor-to-asset Y half-turn is applied consistently once to parts, joints, animation, mesh vertices, and normals. UVs retain their original painted faces. The embedded guide defines transform composition, index and UV conventions, and how to reconstruct the hierarchy. Actual Roblox uploading and rig creation are separate later work.

`node tests/asset-export.test.mjs` checks the data schema, XYZ hinges, signed leg swing, joint connectivity, rotated rest poses, geometry winding and UVs, animation rows, exact texture bytes, and editable backup preservation. `python3 tests/check-export.py /path/to/cube-asset.zip` independently rebuilds every world pose from the JSON hierarchy and compares it to the source project. The supplied six-part, four-animation project reconstructs all 13 keyframes with maximum error below 4e-16.

Earlier XML validation notes above describe historical releases. Current exports are JSON asset bundles and have not been imported into Roblox yet.


## Selection, paint and views

Build's arrow tool clears the selection when tapping empty space; dragging still orbits. Changing Grid snaps every part center to the nearest world-grid position (None leaves positions alone), rebinding both joint endpoints and updating all animation rows. Sizes and rotations are preserved. Undo restores the grid and original positions together.

Paint has icon-only Brush, Fill and Pick color tools. Pick color samples the atlas's exact pixel, without lighting, and selects the matching palette swatch. If no swatch matches, it replaces the final swatch and selects it. Custom swatches and the active color autosave. Large brush stamps rasterize onto visible texels across multiple faces and neighboring cubes, with nearest-surface occlusion and exact integer pixel colors. Mirroring applies to each painted texel. Exploded view sits beside Mirror and separates displayed cubes with a gap so internal faces can be reached. It never changes model geometry, pivots, keyframes or exported transforms; mirrored strokes use the underlying assembled coordinates. Toggle it off to reassemble. Toggling keeps the current camera position, target, zoom and projection unchanged.

The upper-left view cube is present in every mode. Tap a face for an orthographic plane view; drag the cube to orbit to other faces. Orbiting restores perspective; there is no additional button beside the cube. Zoom and pan also work in orthographic views. From the texture atlas, selecting a cube face returns to the corresponding 3D plane view.

The export popup has an Asset name field. Opening the popup leaves the field unfocused and does not select its contents. The saved name is included in asset.json and model.cube and supplies both ZIP and project-copy filenames; unsafe filename characters are replaced. Blank names use cube-asset.

`node tests/editor-geometry.test.mjs` covers grid snap and all-frame connectivity, exploded offsets, pixel-center multi-face/multi-cube brush coverage and occlusion. Portrait browser checks cover deselection, grid/paint Undo, exact color sampling, front/top orthographic views, the 320px paint layout, a brush crossing a face edge, and unfocused named exports. A named bundle downloaded while exploded reconstructs the original model coordinates correctly. Physical iOS device validation remains outstanding.


## Build controls update

Build opens with Select active, including new and restored projects. Adding a cube copies its parent's dimensions and centers it on the tapped face. Six face-center handles replace corner handles; hidden rear handles do not intercept touches. Selected cubes show only their incoming joint and immediate child joints. The floor remains transparent, and scene fog is disabled.

A view-cube tap changes the orthographic view immediately. A second tap within the double-tap interval recenters that view. A camera-aligned X/Y/Z indicator sits below the cube. Enabled mirror axes also resize both opposing faces of a cube lying on that mirror plane, including the root.

Shape drags use a lightweight rest-rig preview, keeping existing UVs so paint stretches live. Atlas packing, base/overlay resampling, and saved-pose projection happen once on release. UV buffers are updated in place; meshes and geometry are not rebuilt. Autosave waits until the drag commits. Undo restores geometry, all animation rows, and paint layers together. Browser checks at 390×844 and 320×740 cover these controls and verify zero PNG encodes or atlas/geometry rebuilds during a resize of a 254-keyframe project. Physical iPhone verification remains outstanding.

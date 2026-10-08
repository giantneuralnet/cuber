# Cube Studio

A static, mobile-first cube modeler. Build connected cubes, paint their shared texture atlas, and pose a gravity-free articulated rig in keyframes.

## Run

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. All libraries are vendored; no package installation or build is required.

- Tap a face to attach a cube; Erase removes a cube and its descendant branch.
- Drag empty space to orbit. Use Orbit to rotate from anywhere. Pinch to zoom and use two fingers to pan. On desktop, scroll to zoom and right-drag to pan.
- Use the arrow tool to select a cube. Drag it along its connected face, or drag its corner handles to resize it. Attached branches and all saved keyframes follow the new size and joint pivots. The root slides along the ground plane.
- Tap a joint dot in arrow or Animate mode to choose Omni, X, Y, or Z rotation in the parent cube’s local axes. Axis changes constrain existing keyframes as well as physical dragging.
- Paint with a raycast brush or fill one face. Toggle X, Y, and Z mirroring separately or together; the mirror planes cross the root cube’s center and paint matching existing surfaces, including hidden faces. All faces occupy separate cells of a single 2048×2048 atlas.
- In Animate, tap a cube to pin/unpin it. Drag an unpinned cube to pose the connected rig. Add a keyframe to duplicate the pose, then drag to edit it. Frame edits save when the drag ends.
- Tap a keyframe, choose Copy, then tap a destination keyframe and Paste. Paste replaces the destination pose and preserves its time.
- Undo/redo covers topology, moving, resizing, painting, joint axes, pins, keyframes, paste, and project import. Save an editable .cube project before closing the page; projects are not automatically stored.
- Export creates a ZIP with model.rbxmx, a shared PNG atlas, local-space OBJ meshes, the editable project, and import instructions. Roblox asset uploading and in-game testing remain a later step.

## Implementation

`dist/app.js` owns the editor, pointer gestures, shared atlas, patch-based undo, and Cannon point-to-point joint simulation. `dist/model-ops.js` contains rest-shape edits, constrained pose projection, reflection math, and clipboard pose adaptation. `dist/export.js` produces Roblox XML and dimensioned OBJ meshes. Project format v2 preserves box sizes and joint axes; original v1 projects remain supported. Preview playback interpolates relative joint rotations, retaining connected pivots. The exported rig adds an invisible anchored RigRoot so movement of the authored root is also represented as Motor6D animation. Authoring pins are metadata rather than anchored animated Parts.

No server, account data, telemetry, or external runtime requests are used by the editor.

The UI uses a dark palette throughout. Text selection and browser double-tap zoom are disabled; the canvas retains its custom pinch zoom and two-finger pan.

## Validation

Mobile UI checks at 390×844 and 320×740 cover building, brush painting, fill, undo, pose dragging, anchoring, timeline playback, export, and save/reopen. WebMCP mode changes, readback, undo, and invalid mode input were exercised. Export was checked for valid archive/XML structure, shared atlas dimensions, mesh UVs, references, and numerical reconstruction of saved keyframe poses:

```sh
node tests/model-ops.test.mjs
python3 tests/check-export.py /path/to/cube-model.zip
```

The expanded controls were checked at 390×844 and 320×740. Tests cover resize/slide with connected branches and existing poses, local X/Y/Z hinge projection, combined mirror reflections, keyframe copy/paste and undo, version 1/2 project import, and sized mesh/rig exports. An actual exported atlas was inspected to confirm matching brush paint on hidden opposite faces.

Actual Roblox Studio import, asset uploads, animation publication, and live-game playback have not been tested.

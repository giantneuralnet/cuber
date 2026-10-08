# Cube Studio

A static, mobile-first cube modeler. Build connected cubes, paint their shared texture atlas, and pose a gravity-free articulated rig in keyframes.

## Run

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. All libraries are vendored; no package installation or build is required.

- Tap a face to attach a cube; Erase removes a cube and its descendant branch.
- Drag empty space to orbit. Use Orbit to rotate from anywhere. Pinch to zoom and use two fingers to pan. On desktop, scroll to zoom and right-drag to pan.
- Paint with a raycast brush or fill one face. All faces occupy separate cells of a single 2048×2048 atlas.
- In Animate, tap a cube to pin/unpin it. Drag an unpinned cube to pose the connected rig. Add a keyframe to duplicate the pose, then drag to edit it. Frame edits save when the drag ends.
- Undo/redo covers topology, painting, pins, keyframes, and project import. Save an editable .cube project before closing the page; projects are not automatically stored.
- Export creates a ZIP with model.rbxmx, a shared PNG atlas, local-space OBJ meshes, the editable project, and import instructions. Roblox asset uploading and in-game testing remain a later step.

## Implementation

`dist/app.js` owns the editor, pointer gestures, shared atlas, patch-based undo, and Cannon point-to-point joint simulation. `dist/export.js` produces Roblox XML and OBJ meshes. Preview playback interpolates relative joint rotations, retaining connected pivots. The exported rig adds an invisible anchored RigRoot so movement of the authored root is also represented as Motor6D animation. Authoring pins are metadata rather than anchored animated Parts.

No server, account data, telemetry, or external runtime requests are used by the editor.

## Validation

Mobile UI checks at 390×844 and 320×740 cover building, brush painting, fill, undo, pose dragging, anchoring, timeline playback, export, and save/reopen. WebMCP mode changes, readback, undo, and invalid mode input were exercised. Export was checked for valid archive/XML structure, shared atlas dimensions, mesh UVs, references, and numerical reconstruction of saved keyframe poses:

```sh
python3 tests/check-export.py /path/to/cube-model.zip
```

Actual Roblox Studio import, asset uploads, animation publication, and live-game playback have not been tested.

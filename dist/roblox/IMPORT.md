# Import a Cuber asset into Roblox

Use the included preparation script and native-Part importer. They read the exported data directly; there is no need to copy out the geometry or reconstruct the model manually. This workflow creates **block Parts joined by Motor6Ds**, never MeshParts, SpecialMeshes, or an FBX/OBJ mesh import.

## Included files

- `asset.json`, `atlas.png`, and optional `paint-layer/*.png`: the editable source asset. Keep these intact so the ZIP can still open in Cuber.
- `roblox/prepare_cuber.py`: Python 3 preparation tool; standard library only. No network access or uploads.
- `roblox/CuberImporter.lua`: Studio import ModuleScript.
- `roblox/CuberAnimationPlayer.client.lua`: generic visual animation player; install once per experience.
- `README.txt`: the source format, coordinates, joints, and texture-layer contract.

These files contain no game-specific image IDs, world positions, NPC behavior, or account credentials. They do not automatically upload, publish, or modify a game.

## 1. Prepare the ZIP locally

Extract the `roblox` folder, then run the preparer against the original asset ZIP:

```sh
python3 roblox/prepare_cuber.py "Your-Asset.zip" --out prepared-asset
```

It writes `PreparedAsset.lua`, `ImageFiles.json`, `atlas.png`, and any nontransparent paint-frame PNGs. Its output lists the animation names. Preparation reads `asset.json` programmatically and prints a short summary; the full JSON does not need to be displayed. Original animation precision and keyframes are preserved. Empty animation rows remain available as rest-pose selections; duplicate names receive unique suffixes.

The preparer supports the Cuber v2 six-face box layout and checks its UV orientation. It uses the exported face normals, corrects image rotation for top/bottom faces, and keeps thin faces at least one pixel wide. Other mesh types and manually rotated/mirrored UV layouts need their own mapping; do not guess or silently substitute meshes.

## 2. Upload the textures

Upload the PNGs listed in `prepared-asset/ImageFiles.json` with Studio or an available upload integration, using the correct experience/account permissions. Record the image content IDs returned by the upload. Preserve the original image dimensions and transparency. If an image has not finished processing or cannot be used by the experience, resolve that before judging the texture mapping.

`PaintFrames` keys are the **original zero-based layer-frame indices**, not a new sequential list of uploaded files. A nontransparent frame 0 must be supplied as `[0]`. A frame whose source `file` is null is transparent; it needs no upload or image entry. The base atlas is always displayed separately.

## 3. Install the reusable scripts

In Studio **Edit mode**:

1. Put `CuberImporter.lua` in a ModuleScript named `CuberImporter` in `ReplicatedStorage`.
2. Put generated `PreparedAsset.lua` in a ModuleScript named `PreparedAsset` in `ReplicatedStorage`. Use a separate module name for each prepared asset if importing several.
3. For animated assets, put `CuberAnimationPlayer.client.lua` in a LocalScript named `CuberAnimationPlayer` in `StarterPlayer > StarterPlayerScripts`. Install only one copy. Static rest-pose props do not need the player.

The importer creates animation ModuleScripts, so it must run from Studio's Command Bar or another permitted Studio editing context. It is not a normal gameplay server script. If using a Studio/MCP integration, use its available file/script tools to transfer these same files; no particular MCP tool names or local file-access capability are assumed.

## 4. Create the model

Select the intended open place. Substitute the uploaded image IDs and the desired name, parent, placement, and uniform scale, then run this in Studio's Command Bar in Edit mode:

```lua
local importer = require(game.ReplicatedStorage.CuberImporter)
local data = require(game.ReplicatedStorage.PreparedAsset)

local model = importer.Import(data, {
    Name = data.name,
    Atlas = "rbxassetid://YOUR_ATLAS_IMAGE_ID",
    -- Include every entry from ImageFiles.json.paintFrames, with its original index:
    PaintFrames = {
        -- [0] = "rbxassetid://YOUR_FRAME_0_IMAGE_ID",
        -- [1] = "rbxassetid://YOUR_FRAME_1_IMAGE_ID",
    },
    Parent = workspace,
    CFrame = CFrame.new(0, 0, 0),
    Scale = 1,
    CanCollide = false,
    -- Animation = "Walk", -- Use a name printed by the preparer.
})
```

Omit `PaintFrames` for assets without painted overlay frames. Omit `Animation` to choose Idle when present, otherwise the first animation name alphabetically. Set `Animation = ""` for the rig's unanimated rest pose. `CFrame` places the **authored asset origin**, not its bounding-box bottom; adjust placement if the author modeled above or below the origin. A new model is created on each import. Existing models are not deleted or replaced.

All geometry is already in Roblox coordinates: right-handed, +Y up, -Z forward, studs. Do not apply another axis flip. Quaternions are `[x,y,z,w]`; they are not Euler angles. The importer preserves `c0`, `c1`, joint hierarchy, and the invisible anchored RigRoot. The visible Parts remain unanchored and massless, connected to that root. Collisions are off by default.

The `mesh` field is only reference geometry/UV information. Painting uses six SurfaceGuis per Part, cropped ImageLabels, pixelated resampling, and a separate selected overlay. The painted atlas is not multiplied by `baseColor`. Surfaces use normal depth occlusion, not AlwaysOnTop. This approach can be UI-heavy for many complex assets; profile the target game before populating large scenes.

## 5. Play animations and move the visual rig

Enter Play mode to run the LocalScript. On the server, select or restart a clip with:

```lua
model:SetAttribute("Animation", "Walk")
model:SetAttribute("AnimationRate", 1)
model:SetAttribute("AnimationStarted", workspace:GetServerTimeNow())
```

The player interpolates joint translations/rotations and holds the selected paint-layer frame until the next keyframe. Non-looping clips hold their final pose and final paint frame. Empty rows reset the joints to rest. `AnimationRate` is nonnegative; setting 0 samples the start pose, not a pause-at-current-time control. Do not attach a competing Animator or another script that drives the same Motor6Ds.

The importer sets PrimaryPart to RigRoot. To place the authored origin at a new world CFrame from a server script:

```lua
local placement = CFrame.new(10, 0, 20)
model:PivotTo(placement * model:GetAttribute("RootOffset"))
```

Set the scale during import. If changing it later, update both animation translation scaling and the saved root offset as well. Root motion contained in a clip remains relative to this placement; locomotion clips may be authored in place.

This is a visual rig and client-side animation playback, not a Humanoid, player-controller, NPC AI, navigation system, or server-authoritative animated hitbox. Game code owns travel, physics, and any animation-event effects. Optional event metadata is preserved but **not executed**. For example, a laying clip does not itself spawn an egg. Animation IDs do not need publishing for this data-driven player; a separate conversion is needed for Roblox's uploaded Animation/Animator workflow.

## 6. Verify in the intended experience

- Expect one visible native Part per `asset.json.parts` entry, plus RigRoot, and one Motor6D per joint. There should be no MeshParts or SpecialMeshes.
- Compare the imported asset with Cuber from all six sides. Check recognizable asymmetric details, especially front/back and top/bottom, for mirroring or rotation.
- Verify the bind pose, connected pivots, and authored forward direction. X-axis hinges must still rotate about X.
- Test every animation, the final frame of non-looping clips, and every painted/transparent overlay frame, including index 0 if used.
- Check placement, scale, texture permissions, and client playback in Play mode. Visual animation does not imply server hitbox animation.

This toolkit is based on the supplied native-Part importer and has local preparation/export checks. Roblox rendering, asset permissions, and runtime integration must also be verified in the target Studio experience.

## Roblox API references

- Parts and joints: https://create.roblox.com/docs/reference/engine/classes/Part and https://create.roblox.com/docs/reference/engine/classes/Motor6D
- Face images: https://create.roblox.com/docs/reference/engine/classes/SurfaceGui and https://create.roblox.com/docs/reference/engine/classes/ImageLabel
- Model placement/scaling: https://create.roblox.com/docs/reference/engine/classes/Model

New exports preserve PNG alpha. When textureAlpha is set by the preparer, the native Part backing is transparent and its SurfaceGui images supply visible pixels. Existing bundles without that flag retain their original backing. Atlas sizes from 32 through 1024 pixels are supported.

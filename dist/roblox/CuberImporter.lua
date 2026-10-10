-- ModuleScript for Studio's Command Bar. Creates native Parts and Motor6Ds.
local HttpService = game:GetService("HttpService")
local CollectionService = game:GetService("CollectionService")
local Importer = {}

local function frame(t)
    local p, q = t.position, t.rotation
    local x, y, z, w = q[1], q[2], q[3], q[4]
    return CFrame.new(p[1], p[2], p[3],
        1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w),
        2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w),
        2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y))
end

local function longString(s)
    local equals = "="
    while string.find(s, "]" .. equals .. "]", 1, true) do equals ..= "=" end
    return "[" .. equals .. "[" .. s .. "]" .. equals .. "]"
end

function Importer.Import(data, options)
    options = options or {}
    assert(data.version == 1, "Use the bundled prepare_cuber.py")
    local scale = options.Scale or 1
    assert(type(scale) == "number" and scale > 0, "Scale must be positive")
    assert(type(options.Atlas) == "string", "Supply the uploaded atlas rbxassetid")
    for index in (data.images and data.images.paintFrames) or {} do
        assert(type((options.PaintFrames or {})[tonumber(index)]) == "string",
            "Supply the uploaded image for paint frame " .. index)
    end
    local animationName = options.Animation
    if animationName == nil then
        if data.animations.Idle then animationName = "Idle"
        else
            local names = {}
            for name in data.animations do table.insert(names, name) end
            table.sort(names)
            animationName = names[1] or ""
        end
    end
    assert(animationName == "" or data.animations[animationName], "Unknown animation name")
    local first = data.animations[animationName] and data.animations[animationName].frames[1]
    local initialPaint = first and first.paint or 0
    local model = Instance.new("Model")
    model.Name = options.Name or data.name
    local root = Instance.new("Part")
    root.Name = "RigRoot"
    root.Size = Vector3.new(.2, .2, .2)
    root.Anchored = true
    root.Transparency = 1
    root.CanCollide, root.CanQuery, root.CanTouch = false, false, false
    root.CFrame = frame(data.rigRoot.restTransform)
    root.Parent = model
    local parts = {}
    local count = 0
    for _, part in data.parts do
        local block = Instance.new("Part")
        block.Name = part.name
        block.Size = Vector3.new(table.unpack(part.size))
        block.CFrame = frame(part.restTransform)
        block.Color = Color3.fromHex(part.baseColor)
        block.Material = Enum.Material.SmoothPlastic
        block.Shape = Enum.PartType.Block
        block.Anchored = false
        block.Massless = true
        block.CanTouch = false
        block.CanQuery = true
        block.CanCollide = options.CanCollide == true
        block.TopSurface, block.BottomSurface = Enum.SurfaceType.Smooth, Enum.SurfaceType.Smooth
        block:SetAttribute("CuberPartId", part.id)
        block.Parent = model
        parts[part.id] = block
        for _, face in part.faces do
            local r = face.rect
            local gui = Instance.new("SurfaceGui")
            gui.Name = "Paint_" .. face.face
            gui.Face = Enum.NormalId[face.face]
            gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize
            gui.CanvasSize = Vector2.new(r[3], r[4])
            gui.LightInfluence = 1
            gui.AlwaysOnTop = false
            gui.ClipsDescendants = true
            gui.Parent = block
            local image = Instance.new("ImageLabel")
            image.Name = "BaseAtlas"
            image.Size = UDim2.fromScale(1, 1)
            image.AnchorPoint = Vector2.new(.5, .5)
            image.Position = UDim2.fromScale(.5, .5)
            image.Rotation = face.rotation or 0
            image.ImageColor3 = Color3.new(1, 1, 1)
            image.BackgroundTransparency = 1
            image.BorderSizePixel = 0
            image.Image = options.Atlas
            image.ImageRectOffset = Vector2.new(r[1], r[2])
            image.ImageRectSize = Vector2.new(r[3], r[4])
            image.ResampleMode = Enum.ResamplerMode.Pixelated
            image.Parent = gui
            for index, textureId in options.PaintFrames or {} do
                local overlay = image:Clone()
                overlay.Name = "PaintFrame_" .. index
                overlay:SetAttribute("PaintFrame", index)
                overlay.Image = textureId
                overlay.Visible = index == initialPaint
                overlay.ZIndex = 2
                overlay.Parent = gui
            end
        end
        count += 1
        if count % 40 == 0 then task.wait() end
    end
    for _, joint in data.joints do
        local motor = Instance.new("Motor6D")
        motor.Name = "Joint_" .. joint.id
        motor:SetAttribute("CuberJointId", tostring(joint.id))
        -- A parent ID of zero is valid in Luau.
        motor.Part0 = joint.parentPartId ~= nil and parts[joint.parentPartId] or root
        motor.Part1 = parts[joint.childPartId]
        motor.C0, motor.C1 = frame(joint.c0), frame(joint.c1)
        motor.Parent = motor.Part0
    end
    local animations = Instance.new("Folder")
    animations.Name = "CuberAnimationData"
    animations.Parent = model
    for name, animation in data.animations or {} do
        local module = Instance.new("ModuleScript")
        module.Name = name
        module.Source = 'return game:GetService("HttpService"):JSONDecode(' ..
            longString(HttpService:JSONEncode(animation)) .. ')'
        module.Parent = animations
    end
    model.WorldPivot = CFrame.identity
    model:ScaleTo(scale)
    model:SetAttribute("AnimationScale", scale)
    model:SetAttribute("CuberJointCount", #data.joints)
    model:SetAttribute("CuberAnimationCount", #animations:GetChildren())
    local paintCount = 0
    for _ in options.PaintFrames or {} do paintCount += 1 end
    model:SetAttribute("CuberPaintLabelCount", #data.parts * 6 * paintCount)
    model:SetAttribute("RootOffset", root.CFrame)
    local placement = options.CFrame or CFrame.identity
    model:PivotTo(placement)
    model.PrimaryPart = root
    model:SetAttribute("Animation", animationName)
    model:SetAttribute("AnimationRate", 1)
    model:SetAttribute("AnimationStarted", workspace:GetServerTimeNow())
    model.Parent = options.Parent or workspace
    CollectionService:AddTag(model, "CuberAnimatedAsset")
    return model
end

return Importer

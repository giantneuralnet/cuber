-- Install once as a LocalScript in StarterPlayerScripts.
-- Visual playback only: movement, collisions, gameplay events and AI belong to the game.
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local TAG = "CuberAnimatedAsset"
local actors, pending = {}, {}

local function transform(t, scale)
    local x, y, z, w = t[4], t[5], t[6], t[7]
    return CFrame.new(t[1]*scale, t[2]*scale, t[3]*scale,
        1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w),
        2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w),
        2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y))
end

local function interval(animation, time)
    local frames = animation.frames
    if #frames == 0 then return nil, nil, 0 end
    if time <= frames[1].t then return frames[1], frames[1], 0 end
    if time >= frames[#frames].t then return frames[#frames], frames[#frames], 0 end
    for i = 1, #frames-1 do
        if time < frames[i+1].t then
            return frames[i], frames[i+1], (time-frames[i].t)/(frames[i+1].t-frames[i].t)
        end
    end
end

local function add(model)
    if actors[model] or pending[model] then return end
    local ticket = {}
    pending[model] = ticket
    local root = model:WaitForChild("RigRoot", 15)
    local folder = model:WaitForChild("CuberAnimationData", 15)
    if not root or not folder then
        if pending[model] == ticket then pending[model] = nil end
        return
    end
    local actor = {motors={}, paint={}, animations={}, frame=-1}
    local deadline = os.clock()+15
    local expected = model:GetAttribute("CuberJointCount") or 0
    while pending[model] == ticket do
        local motors, count, paintCount = {}, 0, 0
        for _, instance in model:GetDescendants() do
            if instance:IsA("Motor6D") then
                local id = instance:GetAttribute("CuberJointId")
                if id then motors[id] = instance count += 1 end
            elseif instance:IsA("ImageLabel") and instance:GetAttribute("PaintFrame") ~= nil then
                paintCount += 1
            end
        end
        if count >= expected and #folder:GetChildren() >= (model:GetAttribute("CuberAnimationCount") or 0)
            and paintCount >= (model:GetAttribute("CuberPaintLabelCount") or 0) then
            actor.motors = motors break
        end
        if os.clock() >= deadline then
            pending[model] = nil
            warn("Cuber: incomplete rig " .. model.Name)
            return
        end
        task.wait(.1)
    end
    if pending[model] ~= ticket then return end
    for _, module in folder:GetChildren() do
        if module:IsA("ModuleScript") then
            local ok, result = pcall(require, module)
            if ok then actor.animations[module.Name] = result
            else warn("Cuber: cannot load animation " .. module.Name) end
        end
    end
    for _, instance in model:GetDescendants() do
        if instance:IsA("ImageLabel") and instance:GetAttribute("PaintFrame") ~= nil then
            table.insert(actor.paint, instance)
        end
    end
    if pending[model] ~= ticket then return end
    pending[model] = nil
    if not model:IsDescendantOf(workspace) or not CollectionService:HasTag(model, TAG) then return end
    actors[model] = actor
    model:SetAttribute("CuberAnimationReady", true)
end

local function remove(model)
    pending[model] = nil
    local actor = actors[model]
    if actor then
        for _, motor in actor.motors do motor.Transform = CFrame.identity end
    end
    actors[model] = nil
    model:SetAttribute("CuberAnimationReady", false)
end

for _, model in CollectionService:GetTagged(TAG) do task.spawn(add, model) end
CollectionService:GetInstanceAddedSignal(TAG):Connect(function(model) task.spawn(add, model) end)
CollectionService:GetInstanceRemovedSignal(TAG):Connect(remove)

-- Transform is applied after PreSimulation; it is intentionally client-local.
RunService.PreSimulation:Connect(function()
    local now = workspace:GetServerTimeNow()
    for model, actor in actors do
        if not model:IsDescendantOf(workspace) then remove(model) continue end
        local name = model:GetAttribute("Animation") or ""
        local animation = actor.animations[name]
        local first, last, alpha
        if animation then
            local start = model:GetAttribute("AnimationStarted") or now
            local rate = math.max(0, model:GetAttribute("AnimationRate") or 1)
            local time = math.max(0, now-start)*rate
            if animation.loop and animation.duration > 0 then time %= animation.duration
            else time = math.min(time, animation.duration) end
            first, last, alpha = interval(animation, time)
        end
        local scale = model:GetAttribute("AnimationScale") or 1
        for id, motor in actor.motors do
            local one = first and first.p[id]
            local two = last and last.p[id]
            motor.Transform = one and transform(one, scale):Lerp(
                two and transform(two, scale) or transform(one, scale), alpha) or CFrame.identity
        end
        -- Zero is a real overlay index; a null-file frame simply has no label.
        local paint = first and first.paint or 0
        if actor.frame ~= paint then
            actor.frame = paint
            for _, label in actor.paint do label.Visible = label:GetAttribute("PaintFrame") == paint end
        end
    end
end)

// Shared by FBX skeletons and Roblox KeyframeSequence poses.
export const fbxPartName=part=>`${part.name}_${part.id}`;
export const fbxBoneName=part=>`Joint_${fbxPartName(part)}`;

struct ChannelMap {
    propertyHash: u32,
    channelIndex: u32,
    entityOffset: u32,
    keyframeCount: u32,
}

struct Params {
    channelCount: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var<storage, read> states: array<f32>;
@group(0) @binding(1) var<storage, read> channelMaps: array<ChannelMap>;
@group(0) @binding(2) var<storage, read> entityIndexByEntry: array<u32>;
@group(0) @binding(3) var<storage, read> channelIndexByEntry: array<u32>;
@group(0) @binding(4) var<uniform> params: Params;
@group(0) @binding(5) var<storage, read_write> outSearchTimes: array<f32>;
@group(0) @binding(6) var<storage, read_write> outKeyframeOffsets: array<u32>;
@group(0) @binding(7) var<storage, read_write> outKeyframeCounts: array<u32>;
@group(0) @binding(8) var<storage, read_write> outOutputIndices: array<u32>;

@compute @workgroup_size(64)
fn expandEntries(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let entryIndex = global_id.x;
    if (entryIndex >= arrayLength(&channelMaps)) {
        return;
    }

    let map = channelMaps[entryIndex];
    outKeyframeOffsets[entryIndex] = map.entityOffset;
    outKeyframeCounts[entryIndex] = map.keyframeCount;

    let entityIndex = entityIndexByEntry[entryIndex];
    let channelIndex = channelIndexByEntry[entryIndex];

    let stateBase = entityIndex * 4u;
    let timelineTime = states[stateBase + 1u];
    outSearchTimes[entryIndex] = timelineTime;

    outOutputIndices[entryIndex] = entityIndex * params.channelCount + channelIndex;
}

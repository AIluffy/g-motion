struct ChannelMap {
    propertyHash: u32,
    channelIndex: u32,
    entityOffset: u32,
    keyframeCount: u32,
}

@group(0) @binding(0) var<storage, read> channelMaps: array<ChannelMap>;
@group(0) @binding(1) var<storage, read> searchTimes: array<f32>;
@group(0) @binding(2) var<storage, read> blockStartOffsets: array<u32>;
@group(0) @binding(3) var<storage, read> blockStartTimes: array<f32>;
@group(0) @binding(4) var<storage, read_write> outKeyframeOffsets: array<u32>;
@group(0) @binding(5) var<storage, read_write> outKeyframeCounts: array<u32>;

const BLOCK_SIZE: u32 = 8u;
const WINDOW_BLOCKS: u32 = 2u;

fn ceilDiv(n: u32, d: u32) -> u32 {
    return (n + d - 1u) / d;
}

fn findBlockIndex(base: u32, blocks: u32, t: f32) -> u32 {
    var left = 0u;
    var right = blocks;
    while (left + 1u < right) {
        let mid = (left + right) / 2u;
        let v = blockStartTimes[base + mid];
        if (t < v) {
            right = mid;
        } else {
            left = mid;
        }
    }
    return left;
}

@compute @workgroup_size(64)
fn computeSearchWindow(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let entryIndex = global_id.x;
    if (entryIndex >= arrayLength(&channelMaps)) {
        return;
    }

    let map = channelMaps[entryIndex];
    let count = map.keyframeCount;

    if (count <= BLOCK_SIZE * WINDOW_BLOCKS) {
        outKeyframeOffsets[entryIndex] = map.entityOffset;
        outKeyframeCounts[entryIndex] = count;
        return;
    }

    let blocks = ceilDiv(count, BLOCK_SIZE);
    let base = blockStartOffsets[entryIndex];
    let t = searchTimes[entryIndex];
    let blockIndex = findBlockIndex(base, blocks, t);

    let startInEntry = blockIndex * BLOCK_SIZE;
    let endInEntry = min(count, (blockIndex + WINDOW_BLOCKS) * BLOCK_SIZE);
    outKeyframeOffsets[entryIndex] = map.entityOffset + startInEntry;
    outKeyframeCounts[entryIndex] = endInEntry - startInEntry;
}


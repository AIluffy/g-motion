struct StringSearchResult {
    index: u32,
    found: u32,
    _pad0: u32,
    _pad1: u32,
}

@group(0) @binding(0) var<storage, read> text: array<u32>;
@group(0) @binding(1) var<storage, read> pattern: array<u32>;
@group(0) @binding(2) var<storage, read_write> result: array<StringSearchResult>;

@compute @workgroup_size(64)
fn findSubstring(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gid = global_id.x;
    if (gid > 0u) {
        return;
    }

    let textLen = arrayLength(&text);
    let patLen = arrayLength(&pattern);

    var res: StringSearchResult;
    res.index = 0u;
    res.found = 0u;
    res._pad0 = 0u;
    res._pad1 = 0u;

    if (patLen == 0u || textLen == 0u || patLen > textLen) {
        result[0] = res;
        return;
    }

    for (var i = 0u; i <= textLen - patLen; i = i + 1u) {
        var matched = true;
        for (var j = 0u; j < patLen; j = j + 1u) {
            if (text[i + j] != pattern[j]) {
                matched = false;
                break;
            }
        }
        if (matched) {
            res.index = i;
            res.found = 1u;
            result[0] = res;
            return;
        }
    }

    result[0] = res;
}

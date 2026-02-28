// Output format types
const FORMAT_FLOAT: u32 = 0u;       // Raw float value
const FORMAT_COLOR_RGBA: u32 = 1u;  // RGBA color (0-255 packed into u32)
const FORMAT_COLOR_NORM: u32 = 2u;  // Normalized color (0-1 floats)
const FORMAT_ANGLE_DEG: u32 = 3u;   // Angle in degrees
const FORMAT_ANGLE_RAD: u32 = 4u;   // Angle in radians
const FORMAT_PERCENT: u32 = 5u;     // Percentage (0-100)
const FORMAT_MATRIX_2D: u32 = 6u;   // 2D transform matrix (6 floats)
const FORMAT_MATRIX_3D: u32 = 7u;   // 3D transform matrix (16 floats)
const FORMAT_PACKED_HALF2: u32 = 8u; // Two f16 packed into u32, bitcast to f32

struct OutputFormatParams {
    usedRawValueCount: u32,
    rawStride: u32,
    outputStride: u32,
    _pad: u32,
}

// Output channel descriptor
struct OutputChannel {
    sourceIndex: u32,   // Index in raw interpolation output
    formatType: u32,    // Output format type
    minValue: f32,      // For clamping/normalization
    maxValue: f32,      // For clamping/normalization
}

@group(0) @binding(0) var<storage, read> rawOutputs: array<f32>;
@group(0) @binding(1) var<storage, read> channels: array<OutputChannel>;
@group(0) @binding(2) var<storage, read_write> formattedOutputs: array<f32>;
@group(0) @binding(3) var<uniform> params: OutputFormatParams;

// Convert float to packed RGBA
fn floatToPackedRGBA(r: f32, g: f32, b: f32, a: f32) -> u32 {
    let ri = u32(clamp(r * 255.0, 0.0, 255.0));
    let gi = u32(clamp(g * 255.0, 0.0, 255.0));
    let bi = u32(clamp(b * 255.0, 0.0, 255.0));
    let ai = u32(clamp(a * 255.0, 0.0, 255.0));
    return (ri << 24u) | (gi << 16u) | (bi << 8u) | ai;
}

fn floatToHalfBits(value: f32) -> u32 {
    let fbits = bitcast<u32>(value);
    let sign = (fbits >> 16u) & 0x8000u;
    let exp = (fbits >> 23u) & 0xffu;
    var mantissa = fbits & 0x7fffffu;
    if (exp == 0xffu) {
        if (mantissa != 0u) {
            return sign | 0x7e00u;
        }
        return sign | 0x7c00u;
    }
    var exponent = i32(exp) - 127 + 15;
    if (exponent <= 0) {
        if (exponent < -10) {
            return sign;
        }
        mantissa = (mantissa | 0x800000u) >> u32(1 - exponent);
        return sign | (mantissa >> 13u);
    }
    if (exponent >= 31) {
        return sign | 0x7c00u;
    }
    return sign | (u32(exponent) << 10u) | (mantissa >> 13u);
}

fn packHalfs(a: f32, b: f32) -> u32 {
    let ha = floatToHalfBits(a) & 0xffffu;
    let hb = floatToHalfBits(b) & 0xffffu;
    return ha | (hb << 16u);
}

// Normalize value to 0-1 range
fn normalize(value: f32, minVal: f32, maxVal: f32) -> f32 {
    let range = maxVal - minVal;
    if (range <= 0.0) {
        return 0.0;
    }
    return clamp((value - minVal) / range, 0.0, 1.0);
}

// Convert degrees to radians
fn degToRad(deg: f32) -> f32 {
    return deg * 3.14159265 / 180.0;
}

// Convert radians to degrees
fn radToDeg(rad: f32) -> f32 {
    return rad * 180.0 / 3.14159265;
}

fn linearToSRGB(c: f32) -> f32 {
    if (c <= 0.0031308) {
        return 12.92 * c;
    }
    return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn sRGBToLinear(c: f32) -> f32 {
    if (c <= 0.04045) {
        return c / 12.92;
    }
    return pow((c + 0.055) / 1.055, 2.4);
}

// Format single output value
@compute @workgroup_size(64)
fn formatOutputs(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    let rawStride = params.rawStride;
    let outputStride = params.outputStride;
    let usedRawValueCount = params.usedRawValueCount;

    if (rawStride == 0u || outputStride == 0u) {
        return;
    }

    let usedEntityCount = usedRawValueCount / rawStride;
    let usedOutputCount = usedEntityCount * outputStride;

    if (index >= usedOutputCount) {
        return;
    }

    let channelIndex = index % outputStride;
    let entityIndex = index / outputStride;
    let rawEntityBase = entityIndex * rawStride;
    let channel = channels[channelIndex];
    let rawIndex = rawEntityBase + channel.sourceIndex;
    if (rawIndex >= usedRawValueCount) {
        return;
    }
    let rawValue = rawOutputs[rawIndex];

    var formattedValue = rawValue;

    switch (channel.formatType) {
        case FORMAT_FLOAT: {
            // Raw float, optionally clamped
            if (channel.minValue < channel.maxValue) {
                formattedValue = clamp(rawValue, channel.minValue, channel.maxValue);
            }
        }
        case FORMAT_COLOR_RGBA: {
            if (rawEntityBase + channel.sourceIndex + 3u >= usedRawValueCount) {
                formattedOutputs[index] = 0.0;
                return;
            }
            let r0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 0u], channel.minValue, channel.maxValue);
            let g0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 1u], channel.minValue, channel.maxValue);
            let b0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 2u], channel.minValue, channel.maxValue);
            let a0 = normalize(rawOutputs[rawEntityBase + channel.sourceIndex + 3u], channel.minValue, channel.maxValue);

            let r = linearToSRGB(clamp(r0, 0.0, 1.0));
            let g = linearToSRGB(clamp(g0, 0.0, 1.0));
            let b = linearToSRGB(clamp(b0, 0.0, 1.0));
            let a = clamp(a0, 0.0, 1.0);

            let packed = floatToPackedRGBA(r, g, b, a);
            formattedValue = bitcast<f32>(packed);
        }
        case FORMAT_COLOR_NORM: {
            // Normalize to 0-1
            formattedValue = normalize(rawValue, channel.minValue, channel.maxValue);
        }
        case FORMAT_ANGLE_DEG: {
            // Convert to degrees if needed, wrap to 0-360
            formattedValue = rawValue % 360.0;
            if (formattedValue < 0.0) {
                formattedValue = formattedValue + 360.0;
            }
        }
        case FORMAT_ANGLE_RAD: {
            // Convert to radians, wrap to 0-2π
            let twoPi = 6.28318530;
            formattedValue = rawValue % twoPi;
            if (formattedValue < 0.0) {
                formattedValue = formattedValue + twoPi;
            }
        }
        case FORMAT_PERCENT: {
            formattedValue = normalize(rawValue, channel.minValue, channel.maxValue);
        }
        case FORMAT_MATRIX_2D: {
            formattedValue = rawValue;
        }
        case FORMAT_MATRIX_3D: {
            formattedValue = rawValue;
        }
        case FORMAT_PACKED_HALF2: {
            if (rawEntityBase + channel.sourceIndex + 1u >= usedRawValueCount) {
                formattedOutputs[index] = 0.0;
                return;
            }
            var a = rawOutputs[rawEntityBase + channel.sourceIndex + 0u];
            var b = rawOutputs[rawEntityBase + channel.sourceIndex + 1u];
            if (channel.sourceIndex == 2u) {
                a = a % 360.0;
                if (a < 0.0) {
                    a = a + 360.0;
                }
                b = clamp(b, 0.0, 10.0);
            } else if (channel.sourceIndex == 4u) {
                a = clamp(a, 0.0, 10.0);
                b = clamp(b, 0.0, 1.0);
            }
            let packed = packHalfs(a, b);
            formattedValue = bitcast<f32>(packed);
        }
        default: {
            formattedValue = rawValue;
        }
    }

    formattedOutputs[index] = formattedValue;
}

import { describe, it, expect } from 'vitest';
import { crc32 } from '../src/stream/crc32';
import {
  encodePackedFrame,
  PackedStreamDecoder,
  type PackedFrame,
} from '../src/stream/packed-stream';

function toBytes(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i) & 0xff;
  }
  return arr;
}

describe('PackedStream', () => {
  it('computes crc32 for known input', () => {
    const bytes = toBytes('hello');
    const v = crc32(bytes);
    expect(v).toBe(0x3610a686);
  });

  it('encodes and decodes single frame', () => {
    const payload = toBytes('payload-01');
    const encoded = encodePackedFrame(payload, { flags: 1, sequence: 7 });
    const decoder = new PackedStreamDecoder();
    decoder.push(encoded);
    const frame = decoder.nextFrame();
    expect(frame).not.toBeNull();
    if (!frame) return;
    expect(frame.header.flags).toBe(1);
    expect(frame.header.sequence).toBe(7);
    expect(frame.header.length).toBe(payload.length);
    expect(frame.payload).toEqual(payload);
    const none = decoder.nextFrame();
    expect(none).toBeNull();
  });

  it('parses frames from fragmented chunks', () => {
    const payload = toBytes('fragmented');
    const encoded = encodePackedFrame(payload, { sequence: 1 });
    const decoder = new PackedStreamDecoder();
    const mid = Math.floor(encoded.length / 3);
    decoder.push(encoded.subarray(0, mid));
    expect(decoder.nextFrame()).toBeNull();
    decoder.push(encoded.subarray(mid, encoded.length));
    const frame = decoder.nextFrame();
    expect(frame).not.toBeNull();
    if (!frame) return;
    expect(frame.header.sequence).toBe(1);
    expect(frame.payload).toEqual(payload);
  });

  it('skips corrupted bytes until valid magic', () => {
    const payload = toBytes('valid');
    const encoded = encodePackedFrame(payload, { sequence: 1 });
    const corrupted = new Uint8Array(encoded.length + 3);
    corrupted.set(encoded, 3);
    corrupted[0] = 0xff;
    corrupted[1] = 0x00;
    corrupted[2] = 0x01;
    const decoder = new PackedStreamDecoder();
    decoder.push(corrupted);
    const frame = decoder.nextFrame();
    expect(frame).not.toBeNull();
    if (!frame) return;
    expect(frame.payload).toEqual(payload);
  });

  it('detects checksum mismatch and resyncs', () => {
    const payload = toBytes('checksum');
    const encoded = encodePackedFrame(payload, { sequence: 1 });
    const corrupted = encoded.slice();
    const last = corrupted.length - 1;
    corrupted[last] ^= 0xff;
    const decoder = new PackedStreamDecoder();
    decoder.push(corrupted);
    const frame = decoder.nextFrame();
    expect(frame).toBeNull();
  });

  it('enforces increasing sequence numbers', () => {
    const payload1 = toBytes('a');
    const payload2 = toBytes('b');
    const f1 = encodePackedFrame(payload1, { sequence: 1 });
    const f2 = encodePackedFrame(payload2, { sequence: 3 });
    const decoder = new PackedStreamDecoder();
    decoder.push(f1);
    decoder.push(f2);
    const first = decoder.nextFrame();
    expect(first).not.toBeNull();
    expect(first && first.header.sequence).toBe(1);
    expect(() => decoder.nextFrame()).toThrow();
  });

  it('decodes multiple frames in one stream', () => {
    const payloads = ['p1', 'p2-long', 'p3-xxx'].map(toBytes);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < payloads.length; i++) {
      chunks.push(encodePackedFrame(payloads[i], { sequence: i + 1 }));
    }
    const combinedLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(combinedLength);
    let offset = 0;
    for (const c of chunks) {
      combined.set(c, offset);
      offset += c.length;
    }
    const decoder = new PackedStreamDecoder();
    decoder.push(combined);
    const frames: PackedFrame[] = [];
    for (;;) {
      const f = decoder.nextFrame();
      if (!f) break;
      frames.push(f);
    }
    expect(frames.length).toBe(3);
    expect(frames[0].payload).toEqual(payloads[0]);
    expect(frames[1].payload).toEqual(payloads[1]);
    expect(frames[2].payload).toEqual(payloads[2]);
  });
});

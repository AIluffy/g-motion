import { crc32 } from '../data-integrity/crc32';

const MAGIC = 0x504b4453;
const VERSION = 1;

const HEADER_SIZE = 4 + 1 + 1 + 4 + 4 + 4;

export interface PackedFrameHeader {
  magic: number;
  version: number;
  flags: number;
  sequence: number;
  length: number;
  checksum: number;
}

export interface PackedFrame {
  header: PackedFrameHeader;
  payload: Uint8Array;
}

// Re-export crc32 for backward compatibility
export { crc32 } from '../data-integrity/crc32';

export function encodePackedFrame(
  payload: Uint8Array,
  options?: { flags?: number; sequence?: number },
): Uint8Array {
  const flags = options?.flags ?? 0;
  const sequence = options?.sequence ?? 0;
  const checksum = crc32(payload);
  const total = HEADER_SIZE + payload.length;
  const buffer = new Uint8Array(total);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  view.setUint32(offset, MAGIC);
  offset += 4;
  view.setUint8(offset, VERSION);
  offset += 1;
  view.setUint8(offset, flags);
  offset += 1;
  view.setUint32(offset, sequence);
  offset += 4;
  view.setUint32(offset, payload.length);
  offset += 4;
  view.setUint32(offset, checksum);
  offset += 4;
  buffer.set(payload, offset);
  return buffer;
}

export class PackedStreamDecoder {
  private readonly buffer: Uint8Array;
  private writeOffset = 0;
  private readOffset = 0;
  private expectedSequence: number | null = null;

  constructor(capacity = 1024 * 1024) {
    this.buffer = new Uint8Array(capacity);
  }

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    if (this.writeOffset + chunk.length > this.buffer.length) {
      this.compact();
      if (this.writeOffset + chunk.length > this.buffer.length) {
        throw new Error('PackedStreamDecoder buffer overflow');
      }
    }
    this.buffer.set(chunk, this.writeOffset);
    this.writeOffset += chunk.length;
  }

  private compact(): void {
    if (this.readOffset === 0) return;
    if (this.readOffset === this.writeOffset) {
      this.readOffset = 0;
      this.writeOffset = 0;
      return;
    }
    this.buffer.copyWithin(0, this.readOffset, this.writeOffset);
    this.writeOffset -= this.readOffset;
    this.readOffset = 0;
  }

  nextFrame(): PackedFrame | null {
    while (true) {
      const available = this.writeOffset - this.readOffset;
      if (available < HEADER_SIZE) {
        return null;
      }
      const view = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset + this.readOffset,
        this.buffer.byteLength - this.readOffset,
      );
      let offset = 0;
      const magic = view.getUint32(offset);
      if (magic !== MAGIC) {
        this.readOffset += 1;
        continue;
      }
      offset += 4;
      const version = view.getUint8(offset);
      offset += 1;
      if (version !== VERSION) {
        this.readOffset += 1;
        continue;
      }
      const flags = view.getUint8(offset);
      offset += 1;
      const sequence = view.getUint32(offset);
      offset += 4;
      const length = view.getUint32(offset);
      offset += 4;
      const checksum = view.getUint32(offset);
      offset += 4;
      const required = HEADER_SIZE + length;
      if (available < required) {
        return null;
      }
      const start = this.readOffset + HEADER_SIZE;
      const end = start + length;
      const slice = this.buffer.subarray(start, end);
      const computed = crc32(slice);
      if (computed !== checksum) {
        this.readOffset += 1;
        continue;
      }
      if (this.expectedSequence !== null) {
        const expected = this.expectedSequence + 1;
        if (sequence !== expected) {
          const error = new Error('Packed frame sequence mismatch');
          (error as any).expected = expected;
          (error as any).received = sequence;
          throw error;
        }
      }
      this.expectedSequence = sequence;
      const header: PackedFrameHeader = {
        magic,
        version,
        flags,
        sequence,
        length,
        checksum,
      };
      const payload = new Uint8Array(length);
      payload.set(slice);
      this.readOffset += required;
      return { header, payload };
    }
  }
}

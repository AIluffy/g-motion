/**
 * CRC32 checksum calculation
 *
 * Computes the CRC32 (Cyclic Redundancy Check) checksum for the given bytes.
 * This is a standard 32-bit CRC using the IEEE 802.3 polynomial (0xedb88320).
 *
 * @param bytes - The data to compute checksum for
 * @returns The CRC32 checksum as an unsigned 32-bit integer
 *
 * @example
 * ```typescript
 * const data = new Uint8Array([0x31, 0x32, 0x33]); // "123"
 * const checksum = crc32(data);
 * console.log(checksum.toString(16)); // "0xcbf43926"
 * ```
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

import { deflateRawSync } from "node:zlib";

/**
 * Minimal, dependency-free ZIP writer (STORE/DEFLATE) for the Data Trust Gate
 * client-data export (T4). The project deliberately avoids new runtime deps for
 * now (no archiver/jszip), and the existing whole-DB backup route must remain
 * untouched. This produces a spec-compliant ZIP that standard unzip tools and
 * the test harness can read.
 *
 * Usage:
 *   const buf = buildZip([
 *     { name: "manifest.json", data: Buffer.from(json, "utf8") },
 *     { name: "requirements.csv", data: csvBuff },
 *   ]);
 */

export type ZipEntry = {
  name: string; // path inside the archive, e.g. "requirements.csv"
  data: Buffer | string;
  mtime?: Date;
  // false → STORE (no compression). Defaults to DEFLATE. Binary attachments are
  // not bundled in this phase (manifest only), but STORE is available if needed.
  store?: boolean;
};

// ── CRC-32 (IEEE 802.3, zlib polynomial 0xEDB88320) ─────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

// Local file header + central directory entry references.
type CdRef = {
  name: string;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  time: number;
  date: number;
  offset: number;
  externalAttrs: number;
};

export function buildZip(entries: ZipEntry[], opts?: { compressionLevel?: number }): Buffer {
  const localParts: Buffer[] = [];
  const cdRefs: CdRef[] = [];
  let offset = 0;
  const compressionLevel = opts?.compressionLevel ?? 9;

  for (const entry of entries) {
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const nameBuf = Buffer.from(entry.name, "utf8");
    const method = entry.store ? 0 : 8;
    const data = entry.store ? raw : deflateRawSync(raw, { level: compressionLevel });

    const { time, date } = dosDateTime(entry.mtime ?? new Date());
    const crc = crc32(raw);

    const header = Buffer.concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed (v2.0)
      u16(0), // flags
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length), // compressed size
      u32(raw.length), // uncompressed size
      u16(nameBuf.length), // filename length
      u16(0), // extra field length
      nameBuf,
      data,
    ]);

    localParts.push(header);
    cdRefs.push({
      name: entry.name,
      crc,
      compressedSize: data.length,
      uncompressedSize: raw.length,
      method,
      time,
      date,
      offset,
      externalAttrs: entry.store ? 0 : 0,
    });
    offset += header.length;
  }

  const cdStart = offset;
  const cdParts: Buffer[] = [];
  for (const ref of cdRefs) {
    const nameBuf = Buffer.from(ref.name, "utf8");
    const cd = Buffer.concat([
      u32(0x02014b50), // central directory file header signature
      u16(0x0314), // version made by (Unix, 2.0)
      u16(20), // version needed
      u16(0), // flags
      u16(ref.method),
      u16(ref.time),
      u16(ref.date),
      u32(ref.crc),
      u32(ref.compressedSize),
      u32(ref.uncompressedSize),
      u16(nameBuf.length), // filename length
      u16(0), // extra field length
      u16(0), // comment length
      u16(0), // disk number start
      u16(0), // internal file attributes
      u32(ref.externalAttrs), // external file attributes
      u32(ref.offset), // relative offset of local header
      nameBuf,
    ]);
    cdParts.push(cd);
  }
  const cdSize = cdParts.reduce((a, b) => a + b.length, 0);

  const eocd = Buffer.concat([
    u32(0x06054b50), // EOCD signature
    u16(0), // number of this disk
    u16(0), // disk with central directory
    u16(cdRefs.length), // entries on this disk
    u16(cdRefs.length), // total entries
    u32(cdSize), // central directory size
    u32(cdStart), // central directory offset
    u16(0), // comment length
  ]);

  return Buffer.concat([...localParts, ...cdParts, eocd]);
}

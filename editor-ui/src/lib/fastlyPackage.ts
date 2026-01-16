/**
 * Fastly Compute package builder
 * Creates the tar.gz format required by the Fastly API for package uploads
 *
 * Package structure (like Fastly CLI creates):
 * package-name/
 * ├── fastly.toml
 * └── bin/
 *     └── main.wasm
 */

import pako from 'pako'

// Import the base64-encoded WASM binary
import vceEngineB64 from '../assets/vce-engine.wasm.b64?raw'

const VCE_ENGINE_NAME = 'visual-compute-engine'
const VCE_ENGINE_DESCRIPTION = 'Visual Compute Engine - Edge rules processing'

type TarEntry = {
  name: string
  content?: Uint8Array  // undefined for directories
  isDirectory?: boolean
}

/**
 * Create a tar archive from entries (files and directories)
 * TAR format: 512-byte header + file content (padded to 512 bytes) for each entry
 */
function createTarArchive(entries: TarEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const encoder = new TextEncoder()

  for (const entry of entries) {
    // Create TAR header (512 bytes)
    const header = new Uint8Array(512)

    // File name (100 bytes, null-terminated)
    // For directories, name should end with /
    const name = entry.isDirectory && !entry.name.endsWith('/')
      ? entry.name + '/'
      : entry.name
    const nameBytes = encoder.encode(name)
    header.set(nameBytes.slice(0, 99), 0)

    // File mode (8 bytes, octal, null-terminated)
    // 0755 for directories, 0644 for files
    const mode = entry.isDirectory ? '0000755\0' : '0000644\0'
    header.set(encoder.encode(mode), 100)

    // Owner UID (8 bytes, octal)
    header.set(encoder.encode('0000000\0'), 108)

    // Owner GID (8 bytes, octal)
    header.set(encoder.encode('0000000\0'), 116)

    // File size (12 bytes, octal, null-terminated) - 0 for directories
    const size = entry.content?.length ?? 0
    const sizeOctal = size.toString(8).padStart(11, '0') + '\0'
    header.set(encoder.encode(sizeOctal), 124)

    // Modification time (12 bytes, octal)
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0'
    header.set(encoder.encode(mtime), 136)

    // Checksum placeholder (8 spaces initially)
    header.set(encoder.encode('        '), 148)

    // Type flag (1 byte) - '5' for directory, '0' for regular file
    header[156] = entry.isDirectory ? 53 : 48 // ASCII '5' or '0'

    // Link name (100 bytes) - empty for regular files/directories
    // Already zeros

    // USTAR magic (6 bytes) - "ustar" followed by null
    header.set(encoder.encode('ustar\0'), 257)

    // USTAR version (2 bytes) - "00"
    header.set(encoder.encode('00'), 263)

    // Owner name (32 bytes)
    header.set(encoder.encode('root'), 265)

    // Group name (32 bytes)
    header.set(encoder.encode('root'), 297)

    // Calculate checksum (sum of all bytes in header, treating checksum field as spaces)
    let checksum = 0
    for (let i = 0; i < 512; i++) {
      checksum += header[i]
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 '
    header.set(encoder.encode(checksumOctal), 148)

    chunks.push(header)

    // File content (only for files, not directories)
    if (entry.content && entry.content.length > 0) {
      chunks.push(entry.content)

      // Padding to 512-byte boundary
      const padding = 512 - (entry.content.length % 512)
      if (padding < 512) {
        chunks.push(new Uint8Array(padding))
      }
    }
  }

  // End of archive marker (two 512-byte zero blocks)
  chunks.push(new Uint8Array(1024))

  // Combine all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const tar = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    tar.set(chunk, offset)
    offset += chunk.length
  }

  return tar
}

/**
 * Generate fastly.toml manifest content
 * No static backends needed - VCE uses dynamic backends defined in rules
 */
function generateFastlyToml(serviceName: string): string {
  return `authors = ["Fastly"]
description = "${VCE_ENGINE_DESCRIPTION}"
language = "rust"
manifest_version = 3
name = "${serviceName}"
`
}

/**
 * Decode base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Remove any whitespace/newlines from the base64 string
  const cleanBase64 = base64.replace(/\s/g, '')
  const binaryString = atob(cleanBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Sanitize service name for use as directory name
 */
function sanitizePackageName(serviceName: string): string {
  return serviceName
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'package'
}

/**
 * Build a Fastly Compute package (tar.gz) for the VCE engine
 * @param serviceName Name for the service
 * @returns Base64-encoded tar.gz package ready for upload
 */
export async function buildVcePackage(serviceName: string): Promise<string> {
  const encoder = new TextEncoder()
  const pkgName = sanitizePackageName(serviceName)

  // Generate fastly.toml (no static backends - using dynamic backends from rules)
  const fastlyToml = generateFastlyToml(serviceName)
  const fastlyTomlBytes = encoder.encode(fastlyToml)

  // Decode the WASM binary
  const wasmBytes = base64ToUint8Array(vceEngineB64)

  // Create tar archive with required structure:
  // pkgName/
  // ├── fastly.toml
  // └── bin/
  //     └── main.wasm
  const entries: TarEntry[] = [
    { name: `${pkgName}/`, isDirectory: true },
    { name: `${pkgName}/fastly.toml`, content: fastlyTomlBytes },
    { name: `${pkgName}/bin/`, isDirectory: true },
    { name: `${pkgName}/bin/main.wasm`, content: wasmBytes },
  ]

  const tar = createTarArchive(entries)

  // Compress with gzip
  const gzipped = pako.gzip(tar)

  // Convert to base64 for API upload
  let binary = ''
  const len = gzipped.length
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(gzipped[i])
  }
  return btoa(binary)
}

/**
 * Get the VCE engine info
 */
export function getVceEngineInfo() {
  return {
    name: VCE_ENGINE_NAME,
    description: VCE_ENGINE_DESCRIPTION,
    wasmSize: base64ToUint8Array(vceEngineB64.replace(/\s/g, '')).length,
  }
}

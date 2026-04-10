/**
 * Minimal yEnc decoder.
 * Handles single-part and multi-part yEncoded articles.
 */

const YDOT = 0x2e  // '.'
const YCR  = 0x0d  // '\r'
const YLF  = 0x0a  // '\n'

export function yEncDecode(data: Buffer): Buffer {
  const lines = data.toString('binary').split(/\r?\n/)

  let inData = false
  let foundBegin = false
  const parts: Buffer[] = []

  for (const line of lines) {
    if (line.startsWith('=ybegin')) { inData = true; foundBegin = true; continue }
    if (line.startsWith('=yend'))   { inData = false; continue }
    if (!inData) continue

    const decoded = decodeLine(line)
    if (decoded.length > 0) parts.push(decoded)
  }

  if (!foundBegin) {
    throw new Error('yEnc decode failed: no =ybegin found in article (malformed or non-yEnc data)')
  }

  return Buffer.concat(parts)
}

function decodeLine(line: string): Buffer {
  const out: number[] = []
  let i = 0

  while (i < line.length) {
    let byte = line.charCodeAt(i)
    i++

    if (byte === 0x3d) { // '=' escape
      if (i >= line.length) break
      byte = (line.charCodeAt(i) - 64) & 0xff
      i++
    }

    out.push((byte - 42) & 0xff)
  }

  return Buffer.from(out)
}

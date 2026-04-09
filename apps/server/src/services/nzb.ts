import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '_' })

export interface NzbSegment {
  messageId: string
  bytes: number
  number: number
}

export interface NzbFile {
  subject: string
  groups: string[]
  segments: NzbSegment[]
  bytes: number
}

export interface NzbData {
  files: NzbFile[]
}

export function parseNzb(xml: string): NzbData {
  const parsed = parser.parse(xml)

  // Detect newznab/NZBGeek API error responses
  const errorCode = parsed?.error?._code ?? parsed?.error?._description
  if (errorCode || parsed?.error) {
    const desc = parsed?.error?._description ?? 'unknown error'
    const code = parsed?.error?._code ?? ''
    throw new Error(`Indexer error${code ? ` (${code})` : ''}: ${desc}`)
  }

  const nzb = parsed?.nzb ?? parsed?.NZB
  if (!nzb) throw new Error('Invalid NZB file')

  const filesRaw = nzb.file ?? []
  const filesArr = Array.isArray(filesRaw) ? filesRaw : [filesRaw]

  const files: NzbFile[] = filesArr.map((f: any) => {
    const groups = f.groups?.group ?? []
    const groupsArr: string[] = Array.isArray(groups) ? groups : [groups]

    const segsRaw = f.segments?.segment ?? []
    const segsArr = Array.isArray(segsRaw) ? segsRaw : [segsRaw]

    const segments: NzbSegment[] = segsArr.map((s: any) => ({
      messageId: typeof s === 'string' ? s : (s['#text'] || s._text || String(s)),
      bytes: parseInt(s._bytes ?? '0') || 0,
      number: parseInt(s._number ?? '0') || 0,
    }))

    const bytes = segments.reduce((acc, s) => acc + s.bytes, 0)

    return {
      subject: f._subject ?? '',
      groups: groupsArr,
      segments,
      bytes,
    }
  })

  return { files }
}

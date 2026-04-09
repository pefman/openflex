import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

// Use bundled ffmpeg binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string)
}

interface ProbeResult {
  codec: string | null
  resolution: string | null
  container: string | null
  duration: number | null
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      const format = metadata.format

      const codec = videoStream?.codec_name ?? null
      const width = videoStream?.width
      const height = videoStream?.height
      const resolution = width && height ? `${width}x${height}` : null
      const container = format?.format_name?.split(',')[0] ?? null
      const duration = format?.duration ? Number(format.duration) : null

      resolve({ codec, resolution, container, duration })
    })
  })
}

export async function extractSubtitles(filePath: string, outputDir: string): Promise<string[]> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve([])

      const subtitleStreams = metadata.streams.filter((s) => s.codec_type === 'subtitle')
      if (!subtitleStreams.length) return resolve([])

      const outputPaths: string[] = []
      const promises = subtitleStreams.map((stream, i) => {
        const lang = (stream.tags as any)?.language ?? `sub${i}`
        const outPath = `${outputDir}/${lang}_${i}.vtt`
        outputPaths.push(outPath)

        return new Promise<void>((res) => {
          ffmpeg(filePath)
            .outputOptions([`-map 0:s:${i}`, '-f webvtt'])
            .output(outPath)
            .on('end', () => res())
            .on('error', () => res())
            .run()
        })
      })

      Promise.all(promises)
        .then(() => resolve(outputPaths))
        .catch(() => resolve([]))
    })
  })
}

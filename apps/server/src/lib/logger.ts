export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  ts: string       // ISO timestamp
  level: LogLevel
  source: string   // e.g. "scheduler", "grabber"
  message: string
}

const MAX_ENTRIES = 500
const entries: LogEntry[] = []
let seq = 0

export function log(level: LogLevel, source: string, message: string) {
  const entry: LogEntry = { id: ++seq, ts: new Date().toISOString(), level, source, message }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(`[${source}] ${message}`)
}

export function getLogs(limit = 200): LogEntry[] {
  return entries.slice(-limit)
}

export function clearLogs() {
  entries.splice(0, entries.length)
}

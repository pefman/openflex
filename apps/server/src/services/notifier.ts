import { db } from '../db/client.js'
import { log } from '../lib/logger.js'

export async function notify(
  event: 'grab' | 'complete' | 'failed',
  title: string,
  detail?: string
): Promise<void> {
  let endpoints: Array<{
    id: number; name: string; type: string; url: string; token: string | null;
    chatId: string | null; enabled: boolean; events: string
  }>
  try {
    endpoints = await db.notificationEndpoint.findMany({ where: { enabled: true } })
  } catch {
    return // table may not exist in older DBs
  }

  for (const ep of endpoints) {
    let events: string[]
    try { events = JSON.parse(ep.events ?? '[]') } catch { events = [] }
    if (!events.includes(event)) continue

    try {
      if (ep.type === 'discord') {
        const color = event === 'complete' ? 0x22c55e : event === 'failed' ? 0xef4444 : 0x3b82f6
        await fetch(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [{ title, description: detail ?? event, color }] }),
        })
      } else if (ep.type === 'telegram') {
        const text = `*${title}* — ${detail ?? event}`
        await fetch(`https://api.telegram.org/bot${ep.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: ep.chatId, text, parse_mode: 'Markdown' }),
        })
      } else if (ep.type === 'gotify') {
        await fetch(`${ep.url}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': ep.token ?? '' },
          body: JSON.stringify({ title, message: detail ?? event, priority: event === 'failed' ? 8 : 5 }),
        })
      } else {
        // Generic webhook
        await fetch(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, title, detail, timestamp: new Date().toISOString() }),
        })
      }
      log('info', 'notifier', `sent ${ep.type} notification for ${event}: "${title}"`)
    } catch (err) {
      log('warn', 'notifier', `failed to send ${ep.type} notification to "${ep.name}": ${err}`)
    }
  }
}

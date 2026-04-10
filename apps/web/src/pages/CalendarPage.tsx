import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { showsApi } from '../api/index.ts'
import { slugify, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const statusCls: Record<string, string> = {
  downloaded: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  downloading: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  wanted:      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  missing:     'bg-red-500/20 text-red-400 border-red-500/30',
}

type CalEvent = {
  showId: number
  showTitle: string
  showSlug: string
  showPoster: string | null
  seasonNumber: number
  episodeNumber: number
  episodeTitle: string | null
  status: string
  monitored: boolean
}

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed

  const { data: shows = [] } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list })

  // Build a map: dateStr (YYYY-MM-DD) → CalEvent[]
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const show of shows) {
      for (const season of show.seasons) {
        for (const ep of season.episodes) {
          if (!ep.airDate) continue
          const existing = map.get(ep.airDate) ?? []
          existing.push({
            showId: show.id,
            showTitle: show.title,
            showSlug: slugify(show.title),
            showPoster: show.posterPath,
            seasonNumber: season.seasonNumber,
            episodeNumber: ep.episodeNumber,
            episodeTitle: ep.title,
            status: ep.status,
            monitored: ep.monitored,
          })
          map.set(ep.airDate, existing)
        }
      }
    }
    return map
  }, [shows])

  // Build the grid: first day of month, pad to Monday
  const firstDay = new Date(year, month, 1)
  // getDay(): 0=Sun 1=Mon … convert to Mon-first: (day + 6) % 7
  const startPad = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7

  const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' })
  const todayStr = today.toISOString().slice(0, 10)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()) }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold flex-1">Calendar</h1>
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-semibold w-40 text-center">{monthName}</span>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-border rounded-lg overflow-hidden">
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - startPad + 1
          const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth
          const dateStr = isCurrentMonth
            ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
            : null
          const isToday = dateStr === todayStr
          const events = dateStr ? (eventsByDate.get(dateStr) ?? []) : []
          // Sort: downloaded last, wanted first; then by show name
          const sorted = [...events].sort((a, b) => {
            const order: Record<string, number> = { wanted: 0, missing: 1, downloading: 2, downloaded: 3 }
            return (order[a.status] ?? 4) - (order[b.status] ?? 4)
          })

          return (
            <div
              key={i}
              className={cn(
                'border-r border-b border-border min-h-[100px] p-1.5',
                !isCurrentMonth && 'bg-muted/20',
              )}
            >
              {isCurrentMonth && (
                <>
                  <div className={cn(
                    'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                  )}>
                    {dayNum}
                  </div>

                  <div className="space-y-0.5">
                    {sorted.slice(0, 4).map((ev, idx) => (
                      <Link
                        key={idx}
                        to={`/shows/${ev.showSlug}?season=${ev.seasonNumber}`}
                        className={cn(
                          'flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded border truncate',
                          'hover:brightness-125 transition-all',
                          statusCls[ev.status] ?? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
                          !ev.monitored && 'opacity-50',
                        )}
                        title={`${ev.showTitle} S${String(ev.seasonNumber).padStart(2,'0')}E${String(ev.episodeNumber).padStart(2,'0')}${ev.episodeTitle ? ` · ${ev.episodeTitle}` : ''}`}
                      >
                        <span className="truncate font-medium">{ev.showTitle}</span>
                        <span className="shrink-0 opacity-70">
                          {`E${ev.episodeNumber}`}
                        </span>
                      </Link>
                    ))}
                    {sorted.length > 4 && (
                      <p className="text-[10px] text-muted-foreground px-1">+{sorted.length - 4} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

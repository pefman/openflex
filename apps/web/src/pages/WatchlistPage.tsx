import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { watchlistApi } from '../api/index.ts'
import { moviePath, slugify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, BookmarkMinus, RefreshCw } from 'lucide-react'

export default function WatchlistPage() {
  const qc = useQueryClient()
  const [imdbUrl, setImdbUrl] = useState('')

  const { data: items = [], isLoading } = useQuery({ queryKey: ['watchlist'], queryFn: watchlistApi.list })
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['imdb-subscriptions'],
    queryFn: watchlistApi.listImdbSubscriptions,
  })

  const removeMutation = useMutation({
    mutationFn: ({ movieId, showId }: { movieId?: number; showId?: number }) => {
      if (movieId) return watchlistApi.removeMovie(movieId)
      if (showId) return watchlistApi.removeShow(showId)
      return Promise.resolve({} as any)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist'] }); toast.success('Removed from watchlist') },
  })

  const importMutation = useMutation({
    mutationFn: () => watchlistApi.importImdbList(imdbUrl),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      toast.success(`IMDb import done: +${result.addedMovies} movies, +${result.addedShows} shows`)
    },
    onError: (err) => toast.error(String(err)),
  })

  const createSubscriptionMutation = useMutation({
    mutationFn: () => watchlistApi.createImdbSubscription({ url: imdbUrl, syncIntervalHours: 6, enabled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      qc.invalidateQueries({ queryKey: ['imdb-subscriptions'] })
      toast.success('IMDb sync subscription saved')
    },
    onError: (err) => toast.error(String(err)),
  })

  const syncSubscriptionMutation = useMutation({
    mutationFn: (id: number) => watchlistApi.syncImdbSubscription(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      qc.invalidateQueries({ queryKey: ['imdb-subscriptions'] })
      if (result.skipped) {
        toast.info(`Sync skipped: ${result.reason ?? 'already running'}`)
      } else {
        toast.success('IMDb subscription synced')
      }
    },
    onError: (err) => toast.error(String(err)),
  })

  const updateSubscriptionMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      watchlistApi.updateImdbSubscription(id, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imdb-subscriptions'] })
    },
    onError: (err) => toast.error(String(err)),
  })

  const removeSubscriptionMutation = useMutation({
    mutationFn: (id: number) => watchlistApi.removeImdbSubscription(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imdb-subscriptions'] })
      toast.success('IMDb subscription removed')
    },
    onError: (err) => toast.error(String(err)),
  })

  const canSubmitImdbUrl = imdbUrl.trim().length > 0

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Watchlist</h1>

      <div className="mb-8 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold mb-3">IMDb Lists</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Import once or subscribe for auto-sync every 6 hours. Supported URLs: /chart/top/, /chart/moviemeter/, /list/ls...
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={imdbUrl}
            onChange={(e) => setImdbUrl(e.target.value)}
            placeholder="https://www.imdb.com/chart/top/"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <div className="flex gap-2">
            <Button
              disabled={!canSubmitImdbUrl || importMutation.isPending}
              onClick={() => importMutation.mutate()}
              variant="secondary"
            >
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import Once'}
            </Button>
            <Button
              disabled={!canSubmitImdbUrl || createSubscriptionMutation.isPending}
              onClick={() => createSubscriptionMutation.mutate()}
            >
              {createSubscriptionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe + Sync'}
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">List</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Last Sync</th>
                <th className="py-2 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptionsLoading ? (
                <tr>
                  <td colSpan={4} className="py-3 text-muted-foreground">
                    Loading subscriptions...
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-muted-foreground">
                    No IMDb sync subscriptions yet.
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-b">
                    <td className="py-2 pr-2">
                      <a href={sub.externalUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {sub.externalListId}
                      </a>
                    </td>
                    <td className="py-2 pr-2">
                      {sub.enabled ? 'Enabled' : 'Disabled'}
                      {sub.lastSyncStatus === 'error' && sub.lastSyncError ? (
                        <span className="ml-2 text-xs text-red-500">({sub.lastSyncError})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">{sub.lastSyncedAt ? new Date(sub.lastSyncedAt).toLocaleString() : 'Never'}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => syncSubscriptionMutation.mutate(sub.id)}
                          disabled={syncSubscriptionMutation.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync now
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateSubscriptionMutation.mutate({ id: sub.id, enabled: !sub.enabled })}
                          disabled={updateSubscriptionMutation.isPending}
                        >
                          {sub.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeSubscriptionMutation.mutate(sub.id)}
                          disabled={removeSubscriptionMutation.isPending}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🔖</p>
          <p>Your watchlist is empty. Add movies or shows to it from their detail pages.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
          {items.map((item) => {
            const media = item.movie ?? item.show
            if (!media) return null
            const href = item.movie ? moviePath(item.movie.title, item.movie.id) : `/shows/${slugify(item.show!.title)}-${item.show!.id}`
            return (
              <div key={item.id} className="group relative">
                <Link to={href}>
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted">
                    {media.posterPath ? (
                      <img src={media.posterPath} alt={media.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">{media.title}</div>
                    )}
                    <div className="absolute top-1 left-1 text-xs bg-black/60 rounded px-1 py-0.5 text-white">
                      {item.movie ? '🎬' : '📺'}
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs font-medium truncate text-muted-foreground group-hover:text-foreground">{media.title}</p>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 bg-black/60 hover:bg-black/80"
                  onClick={() => removeMutation.mutate({ movieId: item.movie?.id, showId: item.show?.id })}
                  title="Remove from watchlist"
                >
                  <BookmarkMinus className="h-3.5 w-3.5 text-white" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

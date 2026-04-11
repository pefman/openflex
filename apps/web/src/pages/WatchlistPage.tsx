import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { watchlistApi } from '../api/index.ts'
import { slugify } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Loader2, BookmarkMinus } from 'lucide-react'

export default function WatchlistPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useQuery({ queryKey: ['watchlist'], queryFn: watchlistApi.list })

  const removeMutation = useMutation({
    mutationFn: ({ movieId, showId }: { movieId?: number; showId?: number }) => {
      if (movieId) return watchlistApi.removeMovie(movieId)
      if (showId) return watchlistApi.removeShow(showId)
      return Promise.resolve({} as any)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist'] }); toast.success('Removed from watchlist') },
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Watchlist</h1>

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
            const href = item.movie ? `/movies/${item.movie.id}` : `/shows/${slugify(item.show!.title)}`
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

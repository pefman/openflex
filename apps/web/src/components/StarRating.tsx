import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  rating: number           // 0-5, 0 = no rating
  onRate?: (rating: number) => void  // called when user clicks a star (0 = remove)
  readonly?: boolean
  size?: 'sm' | 'default'
}

export default function StarRating({ rating, onRate, readonly = false, size = 'default' }: StarRatingProps) {
  const [hover, setHover] = useState(0)
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'

  return (
    <div className={cn('flex items-center gap-0.5', readonly ? '' : 'cursor-pointer')} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || rating) >= n
        return (
          <Star
            key={n}
            className={cn(iconSize, 'transition-colors', filled ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/40', !readonly && 'hover:text-yellow-400')}
            onMouseEnter={() => !readonly && setHover(n)}
            onClick={() => {
              if (readonly || !onRate) return
              // Clicking the same star again removes the rating
              onRate(rating === n ? 0 : n)
            }}
          />
        )
      })}
    </div>
  )
}

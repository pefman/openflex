import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// kept in same file for convenience — also exported from @/lib/utils
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function moviePath(title: string, id: number): string {
  return `/movies/${slugify(title)}-${id}`
}

export function playerPath(label: string, mediaFileId: number): string {
  return `/player/${slugify(label)}-${mediaFileId}`
}

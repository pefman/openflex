import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import type { ReactNode } from 'react'
import { LayoutDashboard, Film, Tv2, ArrowDownToLine, Crosshair, HeartPulse, ScrollText, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useQuery } from '@tanstack/react-query'
import { downloadsApi } from '../api/index.ts'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/shows', label: 'TV Shows', icon: Tv2 },
  { to: '/downloads', label: 'Downloads', icon: ArrowDownToLine },
  { to: '/wanted', label: 'Wanted', icon: Crosshair },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const ACTIVE_STATUSES = new Set(['queued', 'downloading', 'importing'])

function useActiveDownloadCount() {
  const { data = [] } = useQuery({
    queryKey: ['downloads'],
    queryFn: downloadsApi.list,
    refetchInterval: 3000,
    staleTime: 2000,
  })
  return data.filter((d) => ACTIVE_STATUSES.has(d.status)).length
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const activeDownloads = useActiveDownloadCount()
  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-56 flex-shrink-0 flex flex-col border-r bg-sidebar border-sidebar-border">
        <div className="h-14 flex items-center px-5">
          <span className="text-xl font-bold tracking-tight">
            Open<span className="text-primary">Flex</span>
          </span>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="flex-1 p-2 space-y-0.5 pt-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/downloads' && activeDownloads > 0 && (
                <span className="ml-auto min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                  {activeDownloads > 99 ? '99+' : activeDownloads}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <Separator className="bg-sidebar-border" />

        <div className="p-3 flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {user?.name && (
              <p className="text-xs font-medium truncate text-foreground">{user.name}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
            onClick={logout}
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

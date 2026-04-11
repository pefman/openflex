import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import type { ReactNode } from 'react'
import { LayoutDashboard, Film, Tv2, ArrowDownToLine, Zap, Crosshair, CalendarDays, HeartPulse, ScrollText, Settings, LogOut, BarChart2, Menu, BookMarked, Search as SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useQuery } from '@tanstack/react-query'
import { downloadsApi, logsApi } from '../api/index.ts'
import GlobalSearch from './GlobalSearch.tsx'

const navGroups = [
  {
    label: 'Library',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/movies', label: 'Movies', icon: Film },
      { to: '/shows', label: 'Shows', icon: Tv2 },
      { to: '/watchlist', label: 'Watchlist', icon: BookMarked },
    ],
  },
  {
    label: 'Activity',
    items: [
      { to: '/downloads', label: 'Downloads', icon: ArrowDownToLine },
      { to: '/wanted', label: 'Wanted', icon: Crosshair },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/stats', label: 'Stats', icon: BarChart2 },
      { to: '/optimization', label: 'Optimization', icon: Zap },
      { to: '/health', label: 'Health', icon: HeartPulse },
      { to: '/logs', label: 'Logs', icon: ScrollText },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
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

function useErrorLogCount() {
  const { data = 0 } = useQuery({
    queryKey: ['logs', 'error-count'],
    queryFn: logsApi.errorCount,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
  return data
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const activeDownloads = useActiveDownloadCount()
  const errorLogCount = useErrorLogCount()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?'

  const closeSidebar = () => setSidebarOpen(false)

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const sidebarContent = (
    <>
      <div className="h-14 flex items-center px-5 gap-2">
        <span className="text-xl font-bold tracking-tight flex-1">
          Open<span className="text-primary">Flex</span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground md:hidden"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex-1 p-2 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <Separator className="bg-sidebar-border my-1" />}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 pt-3 pb-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={closeSidebar}
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
                  {item.to === '/logs' && errorLogCount > 0 && (
                    <span className="ml-auto min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                      {errorLogCount > 99 ? '99+' : errorLogCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="p-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="hidden md:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </button>
      </div>

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
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-12 flex items-center px-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button variant="ghost" size="icon" className="h-8 w-8 mr-2" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-base font-bold tracking-tight flex-1">
          Open<span className="text-primary">Flex</span>
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearchOpen(true)}>
          <SearchIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar — always visible on md+, slide-in overlay on mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 flex flex-col border-r bg-sidebar border-sidebar-border transition-transform duration-200',
          'md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {sidebarContent}
      </aside>

      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">{children}</main>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={(path) => { navigate(path); setSearchOpen(false) }} />
    </div>
  )
}

import Link from 'next/link'
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Battle' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/analysis', label: 'Analysis' },
]

export function AppNav() {
  const router = useRouter()

  return (
    <nav className="flex items-center justify-center gap-5 sm:gap-8">
      {navItems.map((item) => {
        const active = item.href === '/'
          ? router.pathname === '/'
          : router.pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative py-2 text-sm font-medium text-black/45 transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:text-black active:scale-[0.98]',
              active && 'text-black'
            )}
          >
            <span>{item.label}</span>
            <span
              className={cn(
                'absolute inset-x-0 bottom-0.5 mx-auto h-1 w-7 origin-center scale-x-0 rounded-full border border-zinc-300 bg-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-transform duration-200 ease-out group-hover:scale-x-100',
                active && 'scale-x-100'
              )}
              aria-hidden="true"
            />
          </Link>
        )
      })}
    </nav>
  )
}

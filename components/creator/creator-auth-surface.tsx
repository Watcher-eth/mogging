import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Clapperboard, CircleDollarSign, Users } from 'lucide-react'

const MeshGradient = dynamic(
  () => import('@paper-design/shaders-react').then((module) => module.MeshGradient),
  { ssr: false },
)
const colors = ['#ffffff', '#eeeeef', '#fafafa', '#e4e5e7', '#ffffff']
const features = [
  { label: 'Accounts', icon: Users },
  { label: 'Submissions', icon: Clapperboard },
  { label: 'Payouts', icon: CircleDollarSign },
]

export function CreatorAuthSurface({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return (
    <section className="creator-portal relative isolate flex w-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#fafafa] px-5 py-12 text-center sm:py-20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#eeeeef,transparent_65%)]">
        <MeshGradient width="100%" height="100%" colors={colors} distortion={0.65} swirl={0.25} grainMixer={0} grainOverlay={0.035} speed={reducedMotion !== false || !visible ? 0 : 0.12} maxPixelCount={1000000} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.95),rgba(255,255,255,0.4)_55%,transparent)]" />
      </div>

      <div className="relative w-full max-w-lg px-6 py-10 sm:px-10 sm:py-12">
        <Image src="/favicon.png" alt="Mogging" width={76} height={76} className="mx-auto rounded-[20px]" priority />
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6e6e73]">Mogging</p>
        <h1 className="mt-3 text-[2rem] font-semibold leading-[1.08] tracking-[-0.055em] text-[#1d1d1f] sm:text-[2.8rem]">Creator portal</h1>
        <p className="mx-auto mt-5 max-w-xs text-[15px] leading-6 text-[#6e6e73]">Manage your accounts, submissions, and payouts in one place.</p>
        <div className="mt-8 flex justify-center">{children}</div>
      </div>

      <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs font-medium text-[#6e6e73]">
        {features.map(({ label, icon: Icon }) => <li key={label} className="flex items-center gap-2"><Icon className="size-3.5" aria-hidden="true" />{label}</li>)}
      </ul>
    </section>
  )
}

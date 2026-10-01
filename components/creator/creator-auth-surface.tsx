import Image from 'next/image'
import type { ReactNode } from 'react'
import { CreatorIcon, type CreatorIconName } from './creator-icon'

const features: ReadonlyArray<{ label: string; icon: CreatorIconName }> = [
  { label: 'Accounts', icon: 'accounts' },
  { label: 'Submissions', icon: 'submissions' },
  { label: 'Payouts', icon: 'payouts' },
]

export function CreatorAuthSurface({ children }: { children: ReactNode }) {
  return (
    <section className="creator-portal relative isolate flex w-full flex-1 flex-col items-center justify-center overflow-hidden bg-white px-5 py-12 text-center sm:py-20">
      <div className="relative w-full max-w-lg px-6 py-10 sm:px-10 sm:py-12">
        <Image src="/favicon.png" alt="Mogging" width={76} height={76} className="mx-auto rounded-[20px]" priority />
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#73777d]">Mogging</p>
        <h1 className="mt-3 text-[2rem] font-medium leading-[1.12] tracking-[-0.055em] text-[#181a1d] sm:text-[2.8rem]">Creator portal</h1>
        <p className="mx-auto mt-5 max-w-xs text-[15px] leading-6 text-[#73777d]">Manage your accounts, submissions, and payouts in one place.</p>
        <div className="mt-8 flex justify-center">{children}</div>
      </div>

      <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs font-medium text-[#73777d]">
        {features.map(({ label, icon }) => <li key={label} className="flex items-center gap-2"><CreatorIcon name={icon} className="size-6" />{label}</li>)}
      </ul>
    </section>
  )
}

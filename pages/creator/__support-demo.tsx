import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, PanelRight } from 'lucide-react'
import { CreatorSupportChat } from '@/components/creator/support/support-chat'
import { CreatorSupportLauncher } from '@/components/creator/support/support-launcher'
export default function CreatorSupportDemo() {
  return <div className="creator-portal min-h-dvh w-full bg-[#f7f8f9] px-3 pb-3 sm:px-8"><header className="mx-auto flex h-[76px] max-w-[960px] items-center justify-between"><div className="flex items-center gap-2.5"><Image src="/favicon.png" alt="" width={29} height={29} className="rounded-lg" /><span className="text-xs font-semibold tracking-[-.02em]">Creator Studio<span className="mx-3 text-zinc-300">/</span><span className="font-normal text-zinc-500">Support</span></span></div><div className="flex items-center gap-4"><CreatorSupportLauncher demo><button type="button" aria-label="Preview Mogging Support side drawer" title="Preview side drawer" className="inline-flex min-h-10 items-center gap-1.5 text-[10px] text-zinc-500"><PanelRight size={13} /><span className="hidden sm:inline">Preview side drawer</span></button></CreatorSupportLauncher><Link href="/creator" className="inline-flex min-h-10 items-center gap-1.5 text-[10px] text-zinc-500">Open portal<ArrowUpRight size={12} /></Link></div></header><CreatorSupportChat demo /></div>
}
export function getServerSideProps() { return process.env.NODE_ENV === 'production' || process.env.CREATOR_SUPPORT_LOCAL_DEMO !== '1' ? { notFound: true } : { props: {} } }

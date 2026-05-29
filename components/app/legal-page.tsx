import Link from 'next/link'
import { motion } from 'motion/react'
import { ArrowUpRight, Mail, ShieldCheck } from 'lucide-react'
import { SeoHead } from '@/components/app/seo-head'
import { cn } from '@/lib/utils'

export type LegalSection = {
  id: string
  label: string
  title: string
  body: Array<string | { items: string[] }>
}

type LegalPageProps = {
  eyebrow: string
  title: string
  description: string
  updated: string
  path: string
  sections: LegalSection[]
  contactHref?: string
  contactLabel?: string
}

const supportHref = 'mailto:support@mogging.app'

export function LegalPage({
  eyebrow,
  title,
  description,
  updated,
  path,
  sections,
  contactHref = supportHref,
  contactLabel = 'support@mogging.app',
}: LegalPageProps) {
  return (
    <>
      <SeoHead title={`${title} | Mogging`} description={description} path={path} />
      <main className="min-h-[calc(100vh-4rem)] overflow-hidden bg-white text-black sm:min-h-[calc(100vh-5rem)]">
        <div className="pointer-events-none fixed inset-x-0 top-16 h-px bg-zinc-200/70 sm:top-20" aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-[1580px] grid-cols-1 border-x border-zinc-200/70 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-zinc-200/70 bg-white/95 px-5 py-4 backdrop-blur-xl lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:border-b-0 lg:border-r lg:px-8 lg:py-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              className="lg:space-y-10"
            >
              <div className="hidden lg:block">
                <p className="font-mono text-xs uppercase tracking-normal text-zinc-500">{eyebrow}</p>
                <p className="mt-3 max-w-40 text-sm leading-6 text-zinc-500">Updated {updated}</p>
              </div>

              <nav aria-label={`${title} sections`} className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:overflow-visible lg:px-0">
                <div className="flex min-w-max gap-2 lg:block lg:min-w-0 lg:space-y-1">
                  {sections.map((section, index) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className={cn(
                        'group flex items-center border border-zinc-200 bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-normal text-zinc-500 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:text-black lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:py-4 lg:hover:translate-y-0',
                        index === 0 ? 'text-black lg:border-zinc-300' : 'lg:border-transparent'
                      )}
                    >
                      <span className="truncate">{section.label}</span>
                      <span className="ml-3 hidden h-px flex-1 origin-left scale-x-0 bg-zinc-300 transition-transform duration-200 group-hover:scale-x-100 lg:block" />
                    </a>
                  ))}
                </div>
              </nav>
            </motion.div>
          </aside>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-[8%] hidden w-px bg-zinc-100 xl:block" aria-hidden="true" />
            <section className="px-5 py-10 sm:px-10 sm:py-14 lg:px-20 xl:px-28">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
                className="max-w-5xl"
              >
                <p className="font-mono text-xs uppercase tracking-normal text-zinc-500 lg:hidden">{eyebrow} · Updated {updated}</p>
                <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.9] tracking-normal text-black sm:text-7xl lg:text-8xl">
                  {title}
                </h1>
                <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-500 sm:text-2xl sm:leading-10">
                  {description}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-black px-5 text-sm font-medium text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    Open Mogging
                    <ArrowUpRight className="ml-2 size-4" aria-hidden="true" />
                  </Link>
                  <a
                    href={contactHref}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-black transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-zinc-50 active:scale-[0.98]"
                  >
                    <Mail className="mr-2 size-4" aria-hidden="true" />
                    {contactLabel}
                  </a>
                </div>
              </motion.div>

              <div className="mt-14 max-w-4xl space-y-20 sm:mt-20 sm:space-y-28">
                {sections.map((section, index) => (
                  <motion.section
                    key={section.id}
                    id={section.id}
                    initial={{ opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-120px' }}
                    transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.18), ease: [0.23, 1, 0.32, 1] }}
                    className="scroll-mt-32"
                  >
                    <div className="mb-5 flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                      </span>
                      <p className="font-mono text-xs uppercase tracking-normal text-zinc-500">{section.label}</p>
                    </div>
                    <h2 className="text-4xl font-semibold leading-tight tracking-normal text-black sm:text-5xl">
                      {section.title}
                    </h2>
                    <div className="mt-7 space-y-5 text-lg leading-8 text-zinc-500 sm:text-xl sm:leading-9">
                      {section.body.map((block, blockIndex) => {
                        if (typeof block === 'string') {
                          return <p key={blockIndex}>{block}</p>
                        }

                        return (
                          <ul key={blockIndex} className="ml-5 list-[square] space-y-2 marker:text-zinc-400">
                            {block.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )
                      })}
                    </div>
                  </motion.section>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}

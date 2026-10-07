import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import dynamic from "next/dynamic";
import { useLandingTracking } from "@/components/landing/use-landing-tracking";
import type { GetServerSideProps } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import {
  ScanPreview,
  CameraPreview,
  EvaluationPreview,
  ProtocolPreview,
  LeaderboardPreview,
} from "@/components/landing/mobile-preview";
import { AnimatePresence, LazyMotion, domAnimation, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { WebCheckout } from "@/components/landing/web-checkout";
import { EvaluationStats } from "@/components/landing/evaluation-stats";
import { useState } from "react";
import { SeoHead } from "@/components/app/seo-head";
import { appStoreUrl, siteUrl } from "@/lib/seo";
import {
  createLandingAssignment,
  isActiveLandingAssignment,
  LANDING_COOKIE,
  landingArms,
  parseLandingAssignment,
  serializeLandingAssignment,
  type LandingAssignment,
} from "@/lib/analytics/landing";

const LegacyHomepage = dynamic(() => import("@/components/landing/legacy-homepage"));

type Props = { assignment: LandingAssignment; preview: boolean };

export default function HomePage(props: Props) {
  const locale = useRouter().locale;
  return (!locale || locale === "en") && props.assignment.arm === "homepage_a" ? <LegacyHomepage {...props} /> : <NewHomepage {...props} />;
}

function NewHomepage({ assignment, preview }: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const entrance = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : .75, ease: [.16, 1, .3, 1] as [number, number, number, number] } };
  const { sections, trackDestination } = useLandingTracking(assignment, preview);

  function downloadButton(placement: string, compact = false) {
    return (
      <a
        href={appStoreUrl}
        onClick={() => trackDestination("app_store", placement)}
        className={`inline-flex items-center justify-center gap-3 rounded-full bg-[#09090b] font-semibold text-white transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.035] active:scale-[0.98] motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black ${compact ? "h-12 px-5 text-sm" : "h-14 w-full px-7 text-base sm:w-auto"}`}
      >
        <AppleMark />
        {t(compact ? "landing.get" : "landing.download")}
      </a>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <SeoHead
        title={t("seo.title")}
        description={t("seo.description")}
        path="/"
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${siteUrl}/#website`,
              name: "Mogging",
              url: `${siteUrl}/`,
            },
            {
              "@type": "Organization",
              "@id": `${siteUrl}/#organization`,
              name: "Mogging",
              url: `${siteUrl}/`,
              logo: `${siteUrl}/favicon.png`,
              sameAs: [appStoreUrl],
            },
          ],
        }}
      />
      <main
        className="overflow-hidden bg-white text-zinc-950"
      >
        <m.section {...entrance} initial={false} className="mx-auto grid max-w-6xl items-center px-6 pb-14 pt-6 sm:px-10 lg:min-h-[730px] lg:grid-cols-2 lg:gap-24 lg:py-12">
          <div className="text-center lg:text-left">
            <p className="mb-4 hidden text-xs font-medium uppercase tracking-[0.16em] text-zinc-400 lg:block">
              {t("landing.tagline")}
            </p>
            <h1 className="mx-auto max-w-[650px] text-balance text-[clamp(2.5rem,5.5vw,4.75rem)] font-semibold leading-[1.04] tracking-[-0.055em] lg:mx-0">
              {t("landing.title")}
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-zinc-500 sm:text-lg lg:mx-0">
              {t("landing.description")}
            </p>
            <div className="mt-7">{downloadButton("hero")}</div>
            <p className="mt-3 text-xs text-zinc-400">
              {t("landing.availability")}
            </p>
            <Link
              href="/analysis" prefetch={false}
              onClick={() => trackDestination("web_analysis", "hero")}
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black"
            >
              {t("landing.browser")}{" "}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-10 flex justify-center lg:mt-0 lg:justify-end">
            <div className="w-full max-w-[350px]">
              <ScanPreview priority />
            </div>
          </div>
        </m.section>

        <div ref={sections}>
          <m.section {...entrance}
            data-landing-section="features"
            aria-labelledby="features-title"
            className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-20"
          >
            <div className="mb-14 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
              {t("landing.introduction")}
            </p>
              <h2
                id="features-title"
                className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em] sm:text-5xl"
              >
                {t("landing.planTitle")}
              </h2>
            </div>
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
              <div className="flex justify-center lg:justify-start">
                <EvaluationPreview />
              </div>
              <div className="mx-auto w-full text-center lg:mx-0 lg:text-left">
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              {t("landing.evaluation")}
            </p>
                <h3 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em]">
                  {t("landing.scoreTitle")}
                </h3>
                <p className="mt-5 text-lg leading-8 text-zinc-500">
              {t("landing.scoreDescription")}
            </p>
                <EvaluationStats />
              </div>
            </div>
            <div className="mt-24 grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
              <div className="order-2 mx-auto w-full text-center lg:order-1 lg:mx-0 lg:text-left">
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              {t("landing.protocol")}
            </p>
                <h3 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em]">
                  {t("landing.directionTitle")}
                </h3>
                <p className="mt-5 text-lg leading-8 text-zinc-500">
              {t("landing.protocolDescription")}
            </p>
                <div className="mt-7">{downloadButton("features")}</div>
              </div>
              <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
                <ProtocolPreview />
              </div>
            </div>
          </m.section>

          <m.section {...entrance}
            data-landing-section="how_it_works"
            aria-labelledby="how-title"
            className="bg-[#f7f7f8] py-14 sm:py-20"
          >
            <div className="mx-auto max-w-6xl px-6 sm:px-10">
              <h2
                id="how-title"
                className="text-center text-4xl font-semibold tracking-[-0.045em] sm:text-5xl"
              >
              {t("landing.howTitle")}
            </h2>
              <div className="mt-12 grid items-start gap-12 lg:grid-cols-3 lg:gap-8">
                {[
                  {
                    number: "01",
                    title: t("landing.photoTitle"),
                    description:
                      t("landing.photoDescription"),
                    Preview: CameraPreview,
                  },
                  {
                    number: "02",
                    title: t("landing.scanTitle"),
                    description: t("landing.scanDescription"),
                    Preview: ScanPreview,
                  },
                  {
                    number: "03",
                    title: t("landing.dailyTitle"),
                    description:
                      t("landing.dailyDescription"),
                    Preview: ProtocolPreview,
                  },
                ].map(({ number, title, description, Preview }) => (
                  <div key={number} className="mx-auto w-full max-w-[350px]">
                    <Preview />
                    <div className="mt-7">
                      <span className="text-xs font-medium tracking-widest text-zinc-400">
                        {number}
                      </span>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight">
                        {title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-500">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-12 text-center">
                {downloadButton("how_it_works")}
              </div>
            </div>
          </m.section>

          <m.section {...entrance} data-landing-section="leaderboard" aria-labelledby="leaderboard-title" className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-2 lg:gap-24">
            <div className="flex justify-center lg:justify-start"><LeaderboardPreview /></div>
            <div className="text-center lg:text-left">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              {t("landing.leaderboard")}
            </p>
              <h2 id="leaderboard-title" className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-.045em] sm:text-5xl">{t("landing.friendsTitle")}</h2>
              <p className="mt-5 text-lg leading-8 text-zinc-500">
              {t("landing.friendsDescription")}
            </p>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
              {t("landing.publicChoice")}
            </p>
              <div className="mt-7">{downloadButton("leaderboard")}</div>
            </div>
          </m.section>
          <m.section {...entrance} data-landing-section="web_analysis" aria-labelledby="web-title" className="border-y border-zinc-100 bg-[#f7f7f8] py-14 sm:py-20">
            <div className="mx-auto max-w-6xl px-6 sm:px-10">
              <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                <div className="max-w-xl">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">
              {t("landing.webEyebrow")}
            </p>
                  <h2 id="web-title" className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
              {t("landing.webTitle")}
            </h2>
                  <p className="mt-4 text-base leading-7 text-zinc-500">
              {t("landing.webDescription")}
            </p>
                </div>
                <Link href="/analysis" prefetch={false} onClick={() => trackDestination("web_analysis", "web_section")} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black">{t("landing.withoutApp")} <ArrowRight className="size-4" /></Link>
              </div>
              <WebCheckout embedded preview={preview} />
            </div>
          </m.section>

          <LandingFaq />
          <m.section {...entrance}
            data-landing-section="final_cta"
            className="mx-auto max-w-6xl px-6 pb-20 pt-6 text-center sm:px-10"
          >
            <h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              {t("landing.finalTitle")}
            </h2>
            <p className="mb-7 mt-4 text-zinc-500">
              {t("landing.finalDescription")}
            </p>
            {downloadButton("footer")}
          </m.section>
        </div>

      </main>
    </LazyMotion>
  );
}

function LandingFaq() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const reduced = useReducedMotion();
  return (
          <m.section initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: reduced ? 0 : .65, ease: [.16, 1, .3, 1] }}
            data-landing-section="faq"
            aria-labelledby="faq-title"
            className="mx-auto max-w-6xl border-t border-zinc-100 px-6 py-14 sm:px-10"
          >
            <h2
              id="faq-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {t("landing.faqTitle")}
            </h2>
            <div className="mt-6 max-w-3xl divide-y divide-zinc-100">
              {[
                [
                  t("faq.free.question"),
                  t("faq.free.answer"),
                ],
                [
                  t("faq.evaluation.question"),
                  t("faq.evaluation.answer"),
                ],
                [
                  t("faq.public.question"),
                  t("faq.public.answer"),
                ],
                [
                  t("faq.devices.question"),
                  t("faq.devices.answer"),
                ],
              ].map(([question, answer], index) => (
                <div key={question} className="py-5">
                  <button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} id={`faq-question-${index}`} className="flex w-full items-center justify-between gap-6 text-left text-base font-medium focus-visible:outline focus-visible:outline-offset-4">
                    {question}<m.span animate={{ rotate: openFaq === index ? 45 : 0 }} transition={{ duration: reduced ? 0 : .35, ease: [.16, 1, .3, 1] }}><Plus className="size-5 text-zinc-400" /></m.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === index && <m.div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : .4, ease: [.16, 1, .3, 1] }} className="overflow-hidden"><p className="max-w-2xl pt-3 text-sm leading-7 text-zinc-500">{answer}</p></m.div>}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </m.section>
  );
}

function AppleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M17.05 12.54c.03 3.12 2.74 4.16 2.77 4.17-.02.07-.43 1.48-1.42 2.93-.86 1.25-1.76 2.5-3.16 2.53-1.38.03-1.82-.82-3.4-.82-1.58 0-2.07.8-3.38.85-1.35.05-2.38-1.36-3.24-2.61-1.77-2.56-3.12-7.24-1.3-10.4A5.04 5.04 0 0 1 8.18 6.6c1.34-.03 2.6.9 3.4.9.79 0 2.28-1.11 3.84-.95.65.03 2.5.26 3.7 2.02-.1.07-2.21 1.29-2.07 3.97ZM14.5 4.88c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.24 1.98-1.08 3.14 1.14.09 2.3-.58 3.01-1.43Z" />
    </svg>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  req,
  res,
  query,
  locale,
}) => {
  const previewArm =
    process.env.NODE_ENV !== "production" &&
    typeof query.landing_preview === "string" &&
    landingArms.includes(query.landing_preview as (typeof landingArms)[number])
      ? query.landing_preview
      : null;
  const localizedPreview = Boolean(locale && locale !== "en");
  const automated = /bot\b|crawler|spider|slurp|facebookexternalhit|bingpreview|headlesschrome|lighthouse/i.test(req.headers["user-agent"] ?? "");
  const saved = parseLandingAssignment(req.cookies[LANDING_COOKIE]);
  const existing = isActiveLandingAssignment(saved) ? saved : null;
  const assignment = localizedPreview ? { id: crypto.randomUUID(), arm: "homepage_b" as const } : previewArm
    ? { id: crypto.randomUUID(), arm: previewArm as LandingAssignment["arm"] }
    : automated ? { id: crypto.randomUUID(), arm: "homepage_b" as const } : (existing ?? createLandingAssignment(crypto.randomUUID()));
  // Render the assigned content on the server: no variant flash or client-side fetch.
  res.setHeader("Cache-Control", "private, no-store");
  if (!localizedPreview && !previewArm && !automated && !existing)
    res.setHeader(
      "Set-Cookie",
      `${LANDING_COOKIE}=${serializeLandingAssignment(assignment)}; Path=/; Max-Age=7776000; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  return { props: { assignment, preview: localizedPreview || Boolean(previewArm) || automated } };
};

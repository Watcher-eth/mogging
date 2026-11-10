import { useDesktop } from '@/components/landing/use-desktop'
import { EvaluationChoices } from "@/components/landing/evaluation-choices";
import { useHomepageEntrance } from '@/components/landing/use-homepage-entrance'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, AccordionChevron } from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import dynamic from "next/dynamic";
import { useLandingTracking } from "@/components/landing/use-landing-tracking";
import type { GetServerSideProps, NextApiRequest, NextApiResponse } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/ui/mogging-glyphs";
import {
  EvaluationPreview,
  ProtocolPreview,
  ProgressPreview,
} from "@/components/landing/mobile-preview";
import { LazyMotion, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { WebCheckout } from "@/components/landing/web-checkout";
import { AnalysisStory } from "@/components/landing/analysis-story";
import { EvaluationStats } from "@/components/landing/evaluation-stats";
import { SeoHead } from "@/components/app/seo-head";
import { FooterLinks, PublicFooter } from "@/components/app/public-footer";
import { appStoreUrl, siteUrl } from "@/lib/seo";
import { phonePwaEntryPath } from '@/lib/homepage-routing';
import { isPhoneUserAgent } from '@/lib/analysis/phone-layout';
import { usePhoneLayout } from '@/hooks/use-phone-layout';
import footerStyles from '@/components/landing/landing-footer.module.css';
import {
  createLandingAssignment,
  DEFAULT_LANDING_ARM,
  isActiveLandingAssignment,
  LANDING_COOKIE,
  landingArms,
  parseLandingAssignment,
  serializeLandingAssignment,
  type LandingAssignment,
} from "@/lib/analytics/landing";

const DesktopMemberPreview = dynamic(() => import('@/components/landing/desktop-member-preview').then(module => module.DesktopMemberPreview))
const LegacyHomepage = dynamic(() => import("@/components/landing/legacy-homepage"));

type Props = { assignment: LandingAssignment | null; preview: boolean; phoneEntry: boolean };

export default function HomePage(props: Props) {
  if (props.assignment?.arm === landingArms[0]) {
    return <><LegacyHomepage assignment={props.assignment} preview={props.preview} /><PublicFooter /></>;
  }
  return <NewHomepage {...props} />;
}

function NewHomepage({ assignment, preview, phoneEntry }: Props) {
  const { locale } = useRouter();
  const { t } = useTranslation();
  const entrance = useHomepageEntrance();
  const desktop = useDesktop();
  const phone = usePhoneLayout(phoneEntry);
  const { sections, trackDestination } = useLandingTracking(assignment, preview);

  function downloadButton(placement: string) {
    return <EvaluationChoices showDesktopDownload={placement === "hero" || placement === "footer"} track={destination => trackDestination(destination, placement)} />;
  }

  return (
    <LazyMotion features={domAnimation}>
      <SeoHead
        title={locale === "en" || !locale ? "Mogging App | Face Analysis & Personalized Routines" : t("seo.title")}
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
      <div ref={sections} className="[--feature-spacing:88px] lg:[--feature-spacing:104px]">
        <main
          className="overflow-hidden bg-white text-zinc-950"
        >
          <m.section {...entrance} initial={false} className="mx-auto grid max-w-[var(--page-max)] content-center items-center px-6 pb-14 pt-6 sm:px-10 lg:min-h-[730px] lg:grid-cols-2 lg:gap-12 lg:py-12">
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
              {!desktop && <p className="mt-3 text-xs text-zinc-400">{t("landing.availability")}</p>}
            </div>
            <div className="mt-10 flex justify-center lg:mt-0">
              <div className="w-full max-w-[320px] lg:max-w-[clamp(270px,25vw,330px)]">
                <EvaluationPreview playback="still" />
              </div>
            </div>
          </m.section>

          <AnalysisStory />
          <m.section {...entrance}
            data-landing-section="features"
            aria-labelledby="features-title"
            className="mx-auto max-w-[var(--page-max)] px-6 pb-[var(--feature-spacing)] pt-12 sm:px-10 sm:pt-20"
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
                <ProgressPreview />
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
            <div className="mt-[calc(2*var(--feature-spacing))] grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
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
              <div className={desktop ? "order-2 min-h-0 self-stretch overflow-auto [contain:size]" : "order-1 flex justify-center lg:order-2 lg:justify-end"}>
                {desktop ? <DesktopMemberPreview view="protocol" compact /> : <ProtocolPreview />}
              </div>
            </div>
          </m.section>

          <m.section {...entrance} data-landing-section="progress" aria-labelledby="progress-title" className="mx-auto grid max-w-[var(--page-max)] items-center gap-10 px-6 py-[var(--feature-spacing)] sm:px-10 lg:grid-cols-2 lg:gap-24">
            <div className={desktop ? "min-h-0 self-stretch overflow-auto [contain:size]" : "flex justify-center lg:justify-start"}>{desktop ? <DesktopMemberPreview view="progress" compact /> : <ProgressPreview />}</div>
            <div className="text-center lg:text-left">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              {t("landing.progress")}
            </p>
              <h2 id="progress-title" className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-.045em] sm:text-5xl">{t("landing.progressTitle")}</h2>
              <p className="mt-5 text-lg leading-8 text-zinc-500">
              {t("landing.progressDescription")}
            </p>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
              {t("landing.progressPrivacy")}
            </p>
              <div className="mt-7">{downloadButton("progress")}</div>
            </div>
          </m.section>
          {!phone && <m.section {...entrance} data-landing-section="web_analysis" aria-labelledby="web-title" className="bg-[#f7f7f8] py-[var(--feature-spacing)]">
            <div className="mx-auto max-w-[var(--page-max)] px-6 sm:px-10">
              <WebCheckout embedded preview={preview} intro={
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">{t("landing.webEyebrow")}</p>
                  <h2 id="web-title" className="mt-4 text-balance text-3xl font-semibold tracking-[-.04em] sm:text-5xl">{t("landing.webTitle")}</h2>
                  <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-zinc-500">{t("landing.webDescription")}</p>
                  <Link href="/analysis" prefetch={false} onClick={() => trackDestination("web_analysis", "web_section")} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-black">{t("landing.withoutApp")} <ArrowRight className="size-4" aria-hidden="true" /></Link>
                </div>
              } />
            </div>
          </m.section>}
        </main>
        <LandingFooter actions={downloadButton("footer")} />
      </div>
    </LazyMotion>
  );
}

function LandingFooter({ actions }: { actions: ReactNode }) {
  const { t } = useTranslation();
  const entrance = useHomepageEntrance();
  return (
    <footer className={footerStyles.footer}
      onPointerMove={event => {
        if (event.pointerType !== "mouse") return;
        const footer = event.currentTarget;
        const { left, top } = footer.getBoundingClientRect();
        footer.style.setProperty("--cursor-x", `${event.clientX - left}px`);
        footer.style.setProperty("--cursor-y", `${event.clientY - top}px`);
        footer.dataset.cursor = "active";
      }}
      onPointerLeave={event => { delete event.currentTarget.dataset.cursor; }}
    >
      <div aria-hidden="true" className={footerStyles.tiles} />
      <div className="mx-auto max-w-[var(--page-max)] px-6 sm:px-10">
        <div className={footerStyles.content}>
          <LandingFaq />
          <m.section {...entrance} data-landing-section="final_cta" aria-labelledby="final-cta-title" className="text-center">
            <h2 id="final-cta-title" className="text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">{t("landing.finalTitle")}</h2>
            <p className="mb-6 mt-4 text-pretty text-zinc-500">{t("landing.finalDescription")}</p>
            {actions}
          </m.section>
        </div>
        <div className={footerStyles.resources}>
          <span className="text-lg font-semibold tracking-tight text-zinc-950">Mogging</span>
          <FooterLinks className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-zinc-600" />
        </div>
      </div>
    </footer>
  );
}

function LandingFaq() {
  const { t } = useTranslation();
  const entrance = useHomepageEntrance();
  return (
          <m.section {...entrance}
            data-landing-section="faq"
            aria-labelledby="faq-title"
          >
            <h2
              id="faq-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {t("landing.faqTitle")}
            </h2>
            <Accordion className="mt-4 divide-y divide-zinc-200/80">
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
                <AccordionItem key={question} value={index} className="py-4">
                  <h3><AccordionTrigger className="flex w-full items-center justify-between gap-6 text-left text-base font-medium"><span>{question}</span><AccordionChevron /></AccordionTrigger></h3>
                  <AccordionContent><p className="max-w-2xl pt-3 text-sm leading-7 text-zinc-500">{answer}</p></AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </m.section>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  req,
  res,
  query,
  locale,
}) => {
  const requestedPreview = query.landing_preview;
  const previewMatch = process.env.NODE_ENV !== "production" && typeof requestedPreview === "string"
    ? /^homepage(?:_v[34])?_([ab])$/.exec(requestedPreview)
    : null;
  const previewArm = previewMatch ? landingArms[previewMatch[1] === 'a' ? 0 : 1] : null;
  const localized = Boolean(locale && locale !== "en");
  const automated = /bot\b|crawler|spider|slurp|facebookexternalhit|bingpreview|headlesschrome|lighthouse/i.test(req.headers["user-agent"] ?? "");
  const phoneEntry = !automated && isPhoneUserAgent(req.headers['user-agent'] ?? '', req.headers['sec-ch-ua-mobile']?.toString());
  const handoff = phonePwaEntryPath(query);
  const redirect = phoneEntry && !previewArm && handoff !== '/analysis';
  const cookie = req.cookies[LANDING_COOKIE];
  const saved = parseLandingAssignment(cookie);
  let assignment: LandingAssignment | null = null;

  if (previewArm && !localized) {
    assignment = { id: crypto.randomUUID(), arm: previewArm };
  } else if (!previewArm && !automated && !redirect) {
    if (phoneEntry && !localized) {
      assignment = isActiveLandingAssignment(saved) ? saved : createLandingAssignment(crypto.randomUUID());
    } else {
      assignment = saved?.arm === DEFAULT_LANDING_ARM ? saved : { id: crypto.randomUUID(), arm: DEFAULT_LANDING_ARM };
    }
  }

  res.setHeader("Cache-Control", "private, no-store");
  if (assignment && !previewArm) {
    const cookieValue = serializeLandingAssignment(assignment);
    if (cookie !== cookieValue) {
      res.setHeader(
        "Set-Cookie",
        `${LANDING_COOKIE}=${cookieValue}; Path=/; Max-Age=7776000; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
    }
  }
  if (typeof query.attribution_token === 'string') {
    const { resolveCreatorAttribution, setCreatorAttributionCookie } = await import('@/lib/creator/attribution');
    const referral = await resolveCreatorAttribution({ req: req as NextApiRequest, token: typeof query.attribution_token === 'string' ? query.attribution_token : null });
    if (referral?.creatorSlug) {
      setCreatorAttributionCookie(res as NextApiResponse, referral.token);
    }
  }
  if (redirect) return { redirect: { destination: handoff, permanent: false } };
  return { props: { assignment, preview: Boolean(previewArm) || automated, phoneEntry } };
};

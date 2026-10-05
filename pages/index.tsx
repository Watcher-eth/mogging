import type { GetServerSideProps } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SeoHead } from "@/components/app/seo-head";
import { appStoreUrl, siteUrl } from "@/lib/seo";
import {
  flushWebAnalytics,
  setLandingAnalytics,
  trackWebEvent,
} from "@/lib/analytics/client";
import {
  createLandingAssignment,
  LANDING_COOKIE,
  landingArms,
  landingProperties,
  parseLandingAssignment,
  serializeLandingAssignment,
  type LandingAssignment,
} from "@/lib/analytics/landing";

const heroCopy = {
  a: {
    title: "Ascend to your true potential.",
    description:
      "Better skin. A stronger look. More confidence. Discover what’s holding your looks back—and start ascending with a Mogging evaluation and a Protocol built for you.",
  },
  b: {
    title: "Find your potential. Start mogging.",
    description:
      "Your next level starts with knowing what to improve. Evaluate your jawline, eyes, skin, and more, then build a stronger look with your personalized Mogging Protocol.",
  },
};

type Props = { assignment: LandingAssignment; preview: boolean };

export default function HomePage({ assignment, preview }: Props) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const entrance = { initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .12 }, transition: { duration: reduced ? 0 : .75, ease: [.16, 1, .3, 1] as [number, number, number, number] } };
  const heroButton = useRef<HTMLAnchorElement>(null);
  const sections = useRef<HTMLDivElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const copy = heroCopy[assignment.arm === "hero_b" ? "b" : "a"];

  useEffect(() => {
    // Preserve links from older Stripe receipts; activation has one owner.
    if (
      router.query.checkout === "success" &&
      typeof router.query.session_id === "string"
    ) {
      void router.replace(
        `/app/handoff?session_id=${encodeURIComponent(router.query.session_id)}`,
      );
    } else if (router.query.checkout === "cancelled") {
      toast.error(
        "Checkout was cancelled. You can try again when you are ready.",
      );
    }
  }, [router]);

  useEffect(() => {
    if (preview) return;
    setLandingAnalytics(assignment);
    let exposed = false;
    const expose = () => {
      if (exposed || document.visibilityState !== "visible") return;
      exposed = true;
      trackWebEvent("landing_viewed", {
        ...landingProperties(assignment),
        path: "/",
        surface: "landing",
      });
    };
    expose();
    document.addEventListener("visibilitychange", expose);
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!exposed || document.visibilityState !== "visible") return;
        for (const entry of entries) {
          const section = (entry.target as HTMLElement).dataset.landingSection;
          if (!entry.isIntersecting || !section || seen.has(section)) continue;
          seen.add(section);
          trackWebEvent("landing_section_viewed", {
            ...landingProperties(assignment),
            path: "/",
            surface: "landing",
            placement: section,
          });
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 },
    );
    sections.current
      ?.querySelectorAll("[data-landing-section]")
      .forEach((section) => observer.observe(section));
    return () => {
      document.removeEventListener("visibilitychange", expose);
      observer.disconnect();
    };
  }, [assignment, preview]);

  useEffect(() => {
    if (assignment.arm !== "download_b" || !heroButton.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Show only after the hero CTA has passed above the viewport, never before it.
      setStickyVisible(
        !entry.isIntersecting && entry.boundingClientRect.bottom < 0,
      );
    });
    observer.observe(heroButton.current);
    return () => observer.disconnect();
  }, [assignment.arm]);

  function trackDestination(
    destination: "app_store" | "web_analysis",
    placement: string,
  ) {
    if (preview) return;
    const properties = {
      ...landingProperties(assignment),
      path: "/",
      surface: "landing",
      destination,
      placement,
    };
    trackWebEvent("landing_cta_clicked", properties);
    if (destination === "app_store")
      trackWebEvent("app_store_redirected", properties);
    void flushWebAnalytics();
  }

  function downloadButton(placement: string, compact = false) {
    return (
      <a
        ref={placement === "hero" ? heroButton : undefined}
        href={appStoreUrl}
        onClick={() => trackDestination("app_store", placement)}
        className={`inline-flex items-center justify-center gap-3 rounded-full bg-[#09090b] font-semibold text-white transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.035] active:scale-[0.98] motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black ${compact ? "h-12 px-5 text-sm" : "h-14 w-full px-7 text-base sm:w-auto"}`}
      >
        <AppleMark />
        {compact ? "Get Mogging" : "Download for iPhone"}
      </a>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <SeoHead
        title="Mogging | Face Analysis & Your Personalized Glow-Up Plan"
        description="Understand your facial features, get a personalized Protocol, and track your progress with Mogging for iPhone. Prefer the web? Start a facial analysis in your browser."
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
        className={`overflow-hidden bg-white text-zinc-950 ${assignment.arm === "download_b" ? "pb-24" : ""}`}
      >
        <m.section {...entrance} initial={false} className="mx-auto grid max-w-6xl items-center px-6 pb-14 pt-6 sm:px-10 lg:min-h-[730px] lg:grid-cols-2 lg:gap-24 lg:py-12">
          <div className="text-center lg:text-left">
            <p className="mb-4 hidden text-xs font-medium uppercase tracking-[0.16em] text-zinc-400 lg:block">
              Your face. Your potential.
            </p>
            <h1 className="mx-auto max-w-[650px] text-[clamp(2.5rem,5.5vw,4.75rem)] font-semibold leading-[1.04] tracking-[-0.055em] lg:mx-0">
              {copy.title}
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-zinc-500 sm:text-lg lg:mx-0">
              {copy.description}
            </p>
            <div className="mt-7">{downloadButton("hero")}</div>
            <p className="mt-3 text-xs text-zinc-400">
              Available on the App Store · In-app purchases
            </p>
            <Link
              href="/analysis" prefetch={false}
              onClick={() => trackDestination("web_analysis", "hero")}
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black"
            >
              Prefer your browser? Start an analysis{" "}
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
                This is Mogging
              </p>
              <h2
                id="features-title"
                className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em] sm:text-5xl"
              >
                Your potential.
                <br />A daily plan to reach it.
              </h2>
            </div>
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
              <div className="flex justify-center lg:justify-start">
                <EvaluationPreview />
              </div>
              <div className="mx-auto w-full text-center lg:mx-0 lg:text-left">
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  01 / Your evaluation
                </p>
                <h3 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em]">
                  See more than
                  <br />a score.
                </h3>
                <p className="mt-5 text-lg leading-8 text-zinc-500">
                  Your jawline, eyes, proportions, and symmetry. Understand your
                  features across 10 categories and 40+ feature metrics, then keep every report to
                  follow your progress.
                </p>
                <EvaluationStats />
              </div>
            </div>
            <div className="mt-24 grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
              <div className="order-2 mx-auto w-full text-center lg:order-1 lg:mx-0 lg:text-left">
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                  02 / Your Protocol
                </p>
                <h3 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-0.045em]">
                  Less guesswork.
                  <br />
                  More direction.
                </h3>
                <p className="mt-5 text-lg leading-8 text-zinc-500">
                  Stop guessing how to improve your looks. Your personalized
                  Protocol turns your evaluation into daily steps for your skin,
                  posture, grooming, and more. Build the habits that help you ascend.
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
                Your next move is simple.
              </h2>
              <div className="mt-12 grid items-start gap-12 lg:grid-cols-3 lg:gap-8">
                {[
                  {
                    number: "01",
                    title: "Start with a photo.",
                    description:
                      "Line up your face and capture your starting point.",
                    Preview: CameraPreview,
                  },
                  {
                    number: "02",
                    title: "Get a comprehensive Evaluation.",
                    description: "Watch your scan map your facial geometry.",
                    Preview: ScanPreview,
                  },
                  {
                    number: "03",
                    title: "Your personalized Protocol to ascend.",
                    description:
                      "Follow your personalized Protocol, one day at a time.",
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
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">03 / Your leaderboard</p>
              <h2 id="leaderboard-title" className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-.045em] sm:text-5xl">See where you stand.<br />Bring your friends.</h2>
              <p className="mt-5 text-lg leading-8 text-zinc-500">Explore the Global rankings or compare with your friends. Open public evaluations, follow your progress, and make your next move together.</p>
              <p className="mt-4 text-sm leading-6 text-zinc-400">Joining is your choice. Make your profile public to appear, and change it anytime in Settings.</p>
              <div className="mt-7">{downloadButton("leaderboard")}</div>
            </div>
          </m.section>
          <m.section {...entrance} data-landing-section="web_analysis" aria-labelledby="web-title" className="border-y border-zinc-100 bg-[#f7f7f8] py-14 sm:py-20">
            <div className="mx-auto max-w-6xl px-6 sm:px-10">
              <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                <div className="max-w-xl">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">Prefer to pay in your browser?</p>
                  <h2 id="web-title" className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Choose Pro here. Continue in the app.</h2>
                  <p className="mt-4 text-base leading-7 text-zinc-500">Choose your plan, pay securely with Stripe, then activate your access in Mogging. Your evaluations and Protocol stay together.</p>
                </div>
                <Link href="/analysis" prefetch={false} onClick={() => trackDestination("web_analysis", "web_section")} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black">Want an analysis without the app? <ArrowRight className="size-4" /></Link>
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
              Find your starting point.
            </h2>
            <p className="mb-7 mt-4 text-zinc-500">
              Unlock your potential. Build your look. Start mogging.
            </p>
            {downloadButton("footer")}
          </m.section>
        </div>
        {stickyVisible && (
          <aside
            aria-label="Download Mogging"
            className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4 border-t border-zinc-200 bg-white/95 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:rounded-[1.5rem] sm:border sm:pb-3 sm:shadow-[0_8px_40px_#00000012]"
          >
            <div className="flex items-center gap-3">
              <Image
                src="/app-store-icon.png"
                alt=""
                width={40}
                height={40}
                className="rounded-xl"
              />
              <div>
                <p className="text-sm font-semibold">Mogging</p>
                <p className="text-xs text-zinc-500">Your face. Your plan.</p>
              </div>
            </div>
            {downloadButton("persistent", true)}
          </aside>
        )}
      </main>
    </LazyMotion>
  );
}

function LandingFaq() {
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
              Before you start.
            </h2>
            <div className="mt-6 max-w-3xl divide-y divide-zinc-100">
              {[
                [
                  "Is Mogging free to download?",
                  "Yes. Downloading the app is free. Evaluations and Pro features require a purchase; you can review the available plans in the app.",
                ],
                [
                  "What does my evaluation include?",
                  "10 detailed categories with 40+ feature metrics covering your eyes, jawline, proportions, symmetry, and more. You also get a personalized Protocol and saved evaluations to follow your progress.",
                ],
                [
                  "Will my photos appear on the leaderboard?",
                  "Joining the leaderboard is optional. You choose whether to make your profile public, and can change that choice in Settings.",
                ],
                [
                  "Can I use Mogging without an iPhone?",
                  "You can start a paid facial analysis in your browser. The mobile app is available for iPhone, with an Android app coming soon.",
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
}) => {
  const previewArm =
    process.env.NODE_ENV !== "production" &&
    typeof query.landing_preview === "string" &&
    landingArms.includes(query.landing_preview as (typeof landingArms)[number])
      ? query.landing_preview
      : null;
  const existing = parseLandingAssignment(req.cookies[LANDING_COOKIE]);
  const assignment = previewArm
    ? { id: crypto.randomUUID(), arm: previewArm as LandingAssignment["arm"] }
    : (existing ?? createLandingAssignment(crypto.randomUUID()));
  // Render the assigned content on the server: no variant flash or client-side fetch.
  res.setHeader("Cache-Control", "private, no-store");
  if (!previewArm && !existing)
    res.setHeader(
      "Set-Cookie",
      `${LANDING_COOKIE}=${serializeLandingAssignment(assignment)}; Path=/; Max-Age=7776000; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  return { props: { assignment, preview: Boolean(previewArm) } };
};

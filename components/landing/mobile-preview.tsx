import { useTranslation } from "react-i18next";
import type { resources } from "@/lib/i18n/catalogs";
import Image from "next/image";
import reportDemo from "./report-demo.json";
import { RubricVisual } from "@/components/analysis/v2/rubric-visual";
import useSWRImmutable from "swr/immutable";
import { apiGet } from "@/lib/api/client";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Images,
  ScanFace,
  ClipboardList,
  X,
  ChartColumn,
  Smile,
  Triangle,
  Ruler,
  Sparkles,
  Scissors,
  Ear,
  FlipHorizontal2,
  UserRound,
  type LucideIcon,
  Share,
  Signal,
  Wifi,
  BatteryFull,
} from "lucide-react";
import type { ResolvedPrimitive } from "@/lib/creator/mobile-overlay-engine/resolve";
import { resolvePreviewOverlay } from "./overlay";
import { processingOverlayPresets } from "./scan-presets";
import { reportOverlayPresets } from "@/lib/creator/mobile-overlay-engine/report-presets";
import styles from "./mobile-preview.module.css";

function Frame({
  children,
  label,
  height = 844,
  dark = false,
}: {
  children: (active: boolean) => ReactNode;
  label: string;
  height?: number;
  dark?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = ref.current!;
    let visible = false;
    const update = () =>
      setActive(
        visible && document.visibilityState === "visible" && !motion.matches,
      );
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const resize = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / 390),
    );
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0.15 },
    );
    // Defer below-the-fold preview trees and images until they approach the viewport.
    const preload = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setReady(true);
      preload.disconnect();
    }, { rootMargin: "300px" });
    preload.observe(element);
    resize.observe(element);
    intersection.observe(element);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      preload.disconnect();
      resize.disconnect();
      intersection.disconnect();
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={styles.frame}
      style={{ aspectRatio: `390 / ${height}` }}
      role="group"
      aria-label={label}
    >
      <div
        className={styles.stage}
        data-active={active}
        data-dark={dark}
        style={{ height, transform: `scale(${scale})` }}
      >
        <div className={styles.status} aria-hidden="true">
          <span>9:41</span>
          <i />
          <span className={styles.statusIcons}>
            <Signal size={14} fill="currentColor" />
            <Wifi size={14} />
            <BatteryFull size={18} />
          </span>
        </div>
        {ready && children(active)}
      </div>
    </div>
  );
}

export function Primitive({ primitive }: { primitive: ResolvedPrimitive }) {
  const style = {
    animationDelay: `${primitive.animation?.delay ?? 0}ms`,
    animationDuration: `${primitive.animation?.duration ?? 1000}ms`,
  };
  if (primitive.kind === "label") return null;
  if (primitive.kind === "point")
    return (
      <g className={styles.point} style={style}>
        <circle
          cx={primitive.point.x}
          cy={primitive.point.y}
          r={primitive.radius ?? 3.2}
          fill="rgba(255,255,255,.16)"
          stroke="none"
        />
        <circle
          cx={primitive.point.x}
          cy={primitive.point.y}
          r={primitive.radius ?? 3.2}
          strokeDasharray="2.1 3.8"
          stroke="rgba(255,255,255,.72)"
          strokeWidth={1}
          className={
            primitive.animation?.pulse ? styles.pulse : styles.pointScale
          }
          style={
            primitive.animation?.pulse
              ? {
                  animationDelay: `${(primitive.animation.delay ?? 0) + (primitive.animation.duration ?? 500)}ms`,
                }
              : style
          }
        />
        <circle
          cx={primitive.point.x}
          cy={primitive.point.y}
          r={2.2}
          fill="white"
          stroke="none"
        />
      </g>
    );
  let d: string;
  if (primitive.kind === "box") {
    const { x, y, width: w, height: h } = primitive.rect;
    const c = Math.max(4, Math.min(w, h) * (primitive.cornerLength ?? 0.18));
    d = `M${x},${y + c}V${y}H${x + c} M${x + w - c},${y}H${x + w}V${y + c} M${x + w},${y + h - c}V${y + h}H${x + w - c} M${x + c},${y + h}H${x}V${y + h - c}`;
  } else {
    const points =
      primitive.kind === "line"
        ? [primitive.fromPoint, primitive.toPoint]
        : primitive.pixelPoints;
    d =
      points
        .map((point, i) => `${i ? "L" : "M"}${point.x},${point.y}`)
        .join(" ") +
      (primitive.kind === "region" ||
      (primitive.kind === "polyline" && primitive.closed)
        ? " Z"
        : "");
  }
  return (
    <path
      d={d}
      pathLength={1}
      className={styles.draw}
      style={style}
      fill={
        primitive.kind === "region"
          ? `rgba(255,255,255,${primitive.fillOpacity ?? 0.08})`
          : "none"
      }
      stroke={`rgba(255,255,255,${primitive.opacity ?? 0.88})`}
      strokeWidth={primitive.strokeWidth ?? 0.36}
    />
  );
}

// Use the actual image viewport: scaling a 390px overlay into this card made
// strokes too thin and put text in a different coordinate system from the face.
const scannerWidth = (390 - 36) * 0.76;
const scannerHeight = scannerWidth / 0.68;
const scanGeometry = processingOverlayPresets.map((preset) =>
  resolvePreviewOverlay(preset, scannerHeight, scannerWidth),
);
const captureGeometry = resolvePreviewOverlay(reportOverlayPresets.overall, 844);
const overallGeometry = resolvePreviewOverlay(
  reportOverlayPresets.overall,
  464,
);

const overlayLabelKeys = {
  "Eye alignment": "demo.eyeAlignment",
  "Spacing & tilt": "demo.spacingTilt",
  "Nose proportions": "demo.noseProportions",
  "Bridge & width": "demo.bridgeWidth",
  "Chin profile": "demo.chinProfile",
  "Length & projection": "demo.lengthProjection",
  "Skin analysis": "demo.skinAnalysis",
  "Tone & texture": "demo.toneTexture",
  "Facial symmetry": "demo.facialSymmetry",
  "Left / right balance": "demo.leftRight",
  "Jawline definition": "demo.jawDefinition",
  "Angle & chin support": "demo.angleSupport",
  "Lip proportions": "demo.lipProportions",
  "Width & fullness": "demo.widthFullness",
  "PSL score": "demo.psl",
  "Symmetry": "demo.symmetry"
} as const;

function formatPreviewScore(score: string, locale: string) {
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
  return score.replace(/\d+\.\d+/g, value => number.format(Number(value)));
}

function PreviewLabel({
  label,
  width = scannerWidth,
  height = scannerHeight,
}: {
  label: Extract<ResolvedPrimitive, { kind: "label" }>;
  width?: number;
  height?: number;
}) {
  const { t, i18n } = useTranslation();
  const right =
    label.align === "right" ||
    (label.align !== "left" && label.point.x >= width / 2);
  const left = label.align
    ? right
      ? width - 118 + 33
      : -33
    : Math.min(label.point.x, width - 128);
  return (
    <div
      className={styles.overlayLabel}
      style={{
        left,
        top: Math.max(
          10,
          Math.min(height - 54, label.point.y - (label.align ? 16 : 0)),
        ),
      }}
    >
      {[label.title, label.value].filter((text): text is string => Boolean(text)).map((text, index) => (
        <span
          key={index}
          style={
            {
              "--label-x": `${right ? 42 : -42}px`,
              animationDelay: `${(label.animation?.delay ?? 0) + index * 150}ms`,
              animationDuration: `${Math.max(680, Math.min(label.animation?.duration ?? 720, 980))}ms`,
            } as CSSProperties
          }
        >
          {overlayLabelKeys[text as keyof typeof overlayLabelKeys] ? t(overlayLabelKeys[text as keyof typeof overlayLabelKeys]) : formatPreviewScore(text, i18n.language)}
        </span>
      ))}
    </div>
  );
}

function ScanContent({ active, priority }: { active: boolean; priority: boolean }) {
  const { t } = useTranslation();
  const [scene, setScene] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(
      () => setScene((current) => (current + 1) % scanGeometry.length),
      2800,
    );
    return () => clearInterval(timer);
  }, [active]);
  return (
    <div className={styles.scanning}>
      <header>
        <h3>{t("demo.scan")}</h3>
        <p>{t("demo.anchoring")}</p>
      </header>
      <div className={styles.scannerCard}>
        <Image
          src="/model2.png"
          alt={t("demo.scanAlt")}
          fill
          sizes="242px"
          priority={priority}
          className={styles.photo}
        />
        <svg
          className={styles.overlay}
          viewBox={`0 0 ${scannerWidth} ${scannerHeight}`}
          aria-hidden="true"
        >
          <path
            d={`M${scannerWidth * 0.3} 0V${scannerHeight} M${scannerWidth * 0.7} 0V${scannerHeight} M0 ${scannerHeight * 0.46}H${scannerWidth}`}
            stroke="rgba(255,255,255,.16)"
            strokeWidth="1"
          />
        </svg>
        <AnimatePresence initial={false}>
          <m.div
            key={scene}
            className={styles.scanScene}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: active ? 0.76 : 0 } }}
            transition={{ duration: active ? 0.52 : 0 }}
            aria-hidden="true"
          >
            <svg
              className={styles.overlay}
              viewBox={`0 0 ${scannerWidth} ${scannerHeight}`}
            >
              {scanGeometry[scene].map((primitive) => (
                <Primitive key={primitive.id} primitive={primitive} />
              ))}
            </svg>
            {scanGeometry[scene].map((primitive) =>
              primitive.kind === "label" ? (
                <PreviewLabel key={primitive.id} label={primitive} />
              ) : null,
            )}
          </m.div>
        </AnimatePresence>
        <div className={styles.scanTrack}>
          <div className={styles.scanLine} />
        </div>
      </div>
      <div className={styles.scanStatusSlot}>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={scene}
            className={styles.scanStatus}
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 22, opacity: 0 }}
            transition={{
              duration: active ? 0.54 : 0,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            {
              t(([
                "demo.eyeStatus",
                "demo.noseStatus",
                "demo.chinStatus",
                "demo.skinStatus",
                "demo.jawStatus",
                "demo.symmetryStatus",
                "demo.lipStatus",
                "demo.balanceStatus",
              ] as const)[scene])
            }
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
export const ScanPreview = memo(function ScanPreview({ priority = false }: { priority?: boolean }) {
  const { t } = useTranslation();
  return (
    <Frame dark label={t("demo.scanFrame")}>
      {(active) => <ScanContent active={active} priority={priority} />}
    </Frame>
  );
});
export const CameraPreview = memo(function CameraPreview() {
  const { t } = useTranslation();
  return (
    <Frame dark label={t("demo.cameraFrame")}>
      {(active) => <CameraContent active={active} />}
    </Frame>
  );
});
function CameraContent({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [captured, setCaptured] = useState(false);
  const [flash, setFlash] = useState(0);
  const played = useRef(false);
  function capture() {
    played.current = true;
    setCaptured(true);
    setFlash((current) => current + 1);
  }
  useEffect(() => {
    if (!active || played.current) return;
    const timer = setTimeout(capture, 2400);
    return () => clearTimeout(timer);
  }, [active]);
  return (
    <div className={styles.camera}>
      <div className={styles.cameraImage}>
        <Image
          src="/model2.png"
          alt={t("demo.captureAlt")}
          fill
          sizes="350px"
          className={styles.photo}
        />
        <svg className={`${styles.overlay} ${styles.captureMask}`} viewBox="0 0 390 844" aria-hidden="true">
          {captureGeometry.filter(primitive => primitive.kind !== "label").map(primitive => <Primitive key={primitive.id} primitive={primitive} />)}
        </svg>
      </div>
      <div className={styles.cameraShade} />
      <div className={styles.captureHeader}>
        <h3>{t("demo.capture")}</h3>
        <span>{t("demo.faceCapture")}</span>
      </div>
      <div className={styles.captureInstruction}>
        <span>{t("demo.frontImage")}</span>
        <b>{t(captured ? "demo.aligned" : "demo.align")}</b>
      </div>
      <div className={styles.captureControls}>
        <span className={styles.roundControl}>
          <Images size={25} />
        </span>
        <button
          onClick={capture}
          type="button"
          aria-label={t("demo.takePhoto")}
          className={captured ? styles.scanButton : styles.shutter}
        >
          {captured ? (
            <>
              <ScanFace size={21} />
              {t("demo.scanButton")}
            </>
          ) : (
            <span />
          )}
        </button>
        <span className={styles.roundControl}>
          <X size={22} />
        </span>
      </div>
      {flash > 0 && <div key={flash} className={styles.flash} />}
    </div>
  );
}

const reportIcons: Record<string, LucideIcon> = {
  overall: ChartColumn,
  jaw: Triangle, cheeks: Smile, face: UserRound, proportions: Ruler,
  symmetry: FlipHorizontal2, skin: Sparkles, hair: Scissors, ears: Ear,
};
function ReportCategoryIcon({ id }: { id: string }) {
  const symbol = { eyes: "eye.fill", nose: "nose.fill", mouth: "mouth.fill" }[id as "eyes" | "nose" | "mouth"];
  if (symbol) return <i className={styles.nativeSymbol} style={{ "--symbol": `url("/creator-icons/protocol/${symbol}.png")` } as CSSProperties} aria-hidden="true" />;
  if (id === "brows") return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 14 Q7 8 11 12 M13 12 Q17 8 21 14" /></svg>;
  const Icon = reportIcons[id] ?? ChartColumn;
  return <Icon size={18} strokeWidth={1.8} aria-hidden="true" />;
}

export const EvaluationPreview = memo(function EvaluationPreview() {
  const { t, i18n } = useTranslation();
  const [completed, setCompleted] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("overall");
  const [categoryMenu, setCategoryMenu] = useState(false);
  const reportScroll = useRef<HTMLDivElement>(null);
  const category = reportDemo.find(item => item.id === categoryId);
  const currentScore = category?.score ?? 7.2;
  const potentialScore = category?.potential ?? 8.5;
  const priorities = category?.priorities ?? [
    { id: "overall.skin", title: t("demo.skinQuality"), detail: t("demo.skinRoutine"), score: 7 },
    { id: "overall.definition", title: t("demo.definition"), detail: t("demo.followProtocol"), score: 7.4 },
  ];
  const overallRubrics = [
    { id: "overall.psl", label: t("demo.psl"), value: "5.8/8", visual: "Orbit", positions: [5.8 / 8], grade: null },
    { id: "overall.symmetry", label: t("demo.symmetry"), value: "7.3/10", visual: "Orbit", positions: [.73], grade: null },
    { id: "overall.eyes", label: t("demo.eyeArea"), value: "7.8/10", visual: "Text", positions: [], grade: null },
    { id: "overall.jaw", label: t("demo.jawChin"), value: "7.4/10", visual: "Text", positions: [], grade: null },
    { id: "overall.cheeks", label: t("demo.cheekbones"), value: "7.1/10", visual: "Text", positions: [], grade: null },
    { id: "overall.skin", label: t("demo.skinQuality"), value: "7.0/10", visual: "Rail", positions: [], grade: 7 },
  ];
  const categoryCards = (category?.rubrics ?? overallRubrics).map(rubric => ({ rubric, full: rubric.visual === "Capsule" || rubric.value.length > 22 }));
  const pairedCards = categoryCards.filter(card => !card.full);
  if (pairedCards.length % 2) pairedCards[0].full = true;
  const orderedCards = [...categoryCards.filter(card => card.full), ...categoryCards.filter(card => !card.full)];
  const geometry = categoryId === "overall" ? overallGeometry : resolvePreviewOverlay(reportOverlayPresets[categoryId === "face" ? "face-shape" : categoryId] ?? reportOverlayPresets.overall, 464);
  const selectCategory = (id: string) => {
    setCategoryId(id);
    setCategoryMenu(false);
    reportScroll.current?.scrollTo({ top: 0 });
  };
  const toggleTask = (task: string) => setCompleted(current => current.includes(task) ? current.filter(item => item !== task) : [...current, task]);
  return (
    <Frame label={t("demo.evaluationFrame")}>
      {() => (
        <>
          <div
            className={styles.evaluationContent}
            ref={reportScroll}
            tabIndex={0}
            aria-label={t("demo.scrollEvaluation")}
          >
            <div className={styles.reportPortrait}>
              <Image
                src="/model2.png"
                alt={t("demo.portraitAlt")}
                fill
                sizes="350px"
                className={styles.photo}
              />
              <svg
                className={styles.overlay}
                viewBox="0 0 390 464"
                aria-hidden="true"
              >
                {geometry.map((p) => (
                  <Primitive key={p.id} primitive={p} />
                ))}
              </svg>
              {geometry.map((primitive) =>
                primitive.kind === "label" ? (
                  <PreviewLabel
                    key={primitive.id}
                    label={categoryId === "overall" ? { ...primitive, value: "[ 5.8 / 8 ]" } : primitive}
                    width={390}
                    height={464}
                  />
                ) : null,
              )}
              <div className={styles.fade} />
            </div>
            <div className={styles.report}>
              <div className={styles.scores}>
                <div>
                  <small>{category?.title ?? t("demo.overallScore")}</small>
                  <strong>
                    {formatPreviewScore(`${currentScore}`, i18n.language)}<em>/ 10</em>
                  </strong>
                </div>
                <div>
                  <small>{t("demo.potential")}</small>
                  <strong className={styles.potentialScore}>
                    {formatPreviewScore(`${potentialScore}`, i18n.language)}<em>/ 10</em>
                  </strong>
                </div>
              </div>
              {category ? <div className={styles.categoryHeading}><span>{category.title}</span><strong>{formatPreviewScore(`${category.score}/10`, i18n.language)}</strong></div> : null}
              <div className={styles.categories} key={categoryId}>
                {orderedCards.map(({ rubric, full }) => (
                  <div key={rubric.id} className={`${styles.category} ${rubric.visual === "Orbit" ? styles.dialCard : ""} ${full ? styles.fullCard : ""}`}>
                    <span>{rubric.label}</span>
                    {rubric.visual !== "Text" ? <RubricVisual kind={rubric.visual} scale={categoryId === "overall" ? "quality" : "range"} positions={rubric.positions} grade={rubric.grade} /> : null}
                    <strong>{category ? rubric.value : formatPreviewScore(rubric.value, i18n.language)}</strong>
                  </div>
                ))}
              </div>
              <div className={styles.growth}>
                <h4>{t("demo.growth")}</h4>
                <div className={styles.opportunity}>
                  <div>
                    <strong>{t("demo.potentialScore")}</strong>
                    <b>{formatPreviewScore(`${potentialScore}/10`, i18n.language)}</b>
                  </div>
                  <div className={styles.potentialTrack} aria-hidden="true">
                    <i style={{ width: `${potentialScore * 10}%` }} /><span style={{ left: `${currentScore * 10}%` }} /><span style={{ left: `${potentialScore * 10}%` }} />
                  </div>
                  <div className={styles.potentialLegend}>
                    <span>{formatPreviewScore(`${currentScore}`, i18n.language)} · {category?.title ?? t("demo.overallScore")}</span>
                    <span>{formatPreviewScore(`${potentialScore}`, i18n.language)} · {t("demo.potential")}</span>
                  </div>
                </div>
                <div className={styles.opportunity}>
                  <div>
                    <span>
                      <ClipboardList size={18} />
                    </span>
                    <strong>{t("demo.priorities")}</strong>
                    <ChevronUp size={18} color="#71717a" />
                  </div>
                  <p>
                    {t("demo.priorityDescription")}
                  </p>
                  {priorities.map(task => (
                    <div key={task.id} className={styles.priority} data-completed={completed.includes(task.id)}>
                      <div>
                        <button type="button" className={styles.todo} aria-label={task.detail} aria-pressed={completed.includes(task.id)} onClick={() => toggleTask(task.id)}>{completed.includes(task.id) ? <Check size={14} /> : null}</button>
                        <strong>{task.title}</strong>
                        <span>{formatPreviewScore(`${task.score}/10`, i18n.language)}</span>
                      </div>
                      <p>{task.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className={styles.reportChrome}>
            <button type="button" className={styles.categoryTrigger} aria-label="Choose report category" aria-expanded={categoryMenu} aria-controls="landing-report-categories" onClick={() => setCategoryMenu(open => !open)}>
              <ReportCategoryIcon id={categoryId} />
              {category?.title ?? t("demo.overall")}
              <ChevronDown size={15} />
            </button>
            {categoryMenu ? <div id="landing-report-categories" className={styles.categoryMenu} aria-label="Report categories">
              {[{ id: "overall", title: t("demo.overall") }, ...reportDemo].map(item => <button key={item.id} type="button" aria-pressed={categoryId === item.id} onClick={() => selectCategory(item.id)}><ReportCategoryIcon id={item.id} /><span>{item.title}</span>{categoryId === item.id ? <Check size={14} /> : null}</button>)}
            </div> : null}
            <span className={styles.reportClose} aria-hidden="true"><X size={21} strokeWidth={2} /></span>
          </div>
          <div className={styles.shareDock}>
            <div className={styles.share}>
              <Share size={19} />
              {t("demo.share")}
            </div>
          </div>
        </>
      )}
    </Frame>
  );
});

type PreviewTask = { title: keyof typeof resources.en.translation; detail: keyof typeof resources.en.translation; color: string; icon: string; hour: number };
const protocolTasks: PreviewTask[] = [
  { title: "demo.chinTask", detail: "demo.chinDetail", color: "#32c48d", icon: "figure.stand", hour: 7 },
  { title: "demo.mewingTask", detail: "demo.mewingDetail", color: "#ff6f9f", icon: "mouth.fill", hour: 12 },
  { title: "demo.cleanseTask", detail: "demo.cleanseDetail", color: "#58bdff", icon: "drop.fill", hour: 8 },
  { title: "demo.spfTask", detail: "demo.spfDetail", color: "#ffc45e", icon: "sun.max.fill", hour: 10 },
  { title: "demo.hairTask", detail: "demo.hairDetail", color: "#c09aff", icon: "scissors", hour: 16 },
  { title: "demo.eveningTask", detail: "demo.eveningDetail", color: "#58bdff", icon: "sparkles", hour: 18 },
];
const protocolDays = [[2, 3, 4], [0, 1, 5], [2, 1, 4], [0, 3, 5], [2, 1, 5], [0, 3, 4], [2, 3, 5], [0, 1, 4]].map(indices => indices.map(index => protocolTasks[index]));

export const ProtocolPreview = memo(function ProtocolPreview() {
  const { t } = useTranslation();
  return (
    <Frame label={t("demo.protocolFrame")}>
      {(active) => <ProtocolContent active={active} />}
    </Frame>
  );
});
function ProtocolContent({ active }: { active: boolean }) {
  const { t, i18n } = useTranslation();
  const [selectedDay, setSelectedDay] = useState(1);
  const [completion, setCompletion] = useState<number[]>(() =>
    Array(8).fill(0),
  );
  const completed = completion[selectedDay];
  const played = useRef(false);
  useEffect(() => {
    if (!active || played.current || selectedDay !== 1) return;
    const timeout = setTimeout(() => {
      played.current = true;
      setCompletion((current) =>
        current.map((value, day) => (day === 1 ? value | 1 : value)),
      );
    }, 3400);
    return () => clearTimeout(timeout);
  }, [active, selectedDay]);
  return (
    <>
      <header className={styles.protocolHeader}>
        <h3>{t("demo.protocol")}</h3>
        <div className={styles.protocolActions}>
          <span key={completed} className={styles.protocolScore}>
            <i
              className={styles.nativeSymbol}
              style={
                {
                  "--symbol":
                    'url("/creator-icons/protocol/checkmark.seal.fill.png")',
                } as CSSProperties
              }
            />
            {protocolDays[selectedDay].reduce((score, _, index) => score + (completed & (1 << index) ? 5 : 0), 0)}
          </span>
          <i
            className={styles.nativeSymbol}
            style={
              {
                "--symbol": 'url("/creator-icons/protocol/gearshape.png")',
              } as CSSProperties
            }
          />
        </div>
      </header>
      <div className={styles.calendar}>
        {Array.from({ length: 8 }, (_, index) => index === 1 ? t("demo.today") : new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, index + 3)))).map(
          (day, index) => (
            <button
              type="button"
              key={index}
              aria-label={t("demo.showDate", { date: new Intl.DateTimeFormat(i18n.language, { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, index + 3))) })}
              aria-pressed={selectedDay === index}
              data-today={index === 1}
              data-selected={selectedDay === index}
              onClick={() => setSelectedDay(index)}
            >
              <span>{day}</span>
              <b>{completion[index] === (1 << protocolDays[index].length) - 1 ? <Check size={15} /> : index + 3}</b>
              <i />
            </button>
          ),
        )}
      </div>
      <div
        className={styles.scheduleScroll}
        tabIndex={0}
        aria-label={t("demo.scrollProtocol")}
      >
        <div key={selectedDay} className={styles.schedule}>
          {Array.from({ length: 14 }, (_, index) => (
            <div key={index} className={styles.hour}>
              {String(index + 6).padStart(2, "0")}:00
            </div>
          ))}
          {protocolDays[selectedDay].map(({ title, detail, color, icon, hour }, index) => {
            const done = Boolean(completed & (1 << index));
            return (
              <div
                key={title}
                className={`${styles.taskEntry} ${done ? styles.completed : ""}`}
                style={
                  {
                    top: (hour - 6) * 54 + 8,
                    animationDelay: `${480 + index * 360}ms`,
                    "--task-color": color,
                  } as CSSProperties
                }
              >
                <div className={styles.task}>
                  <div className={styles.taskTop}>
                    <span className={styles.taskIcon}>
                      <i
                        className={styles.nativeSymbol}
                        style={
                          {
                            "--symbol": `url("/creator-icons/protocol/${icon}.png")`,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <strong>{t(title)}</strong>
                    <button
                      type="button"
                      role="checkbox"
                      aria-label={t(done ? "demo.undo" : "demo.complete", { task: t(title) })}
                      aria-checked={done}
                      onClick={() => {
                        played.current = true;
                        setCompletion((current) =>
                          current.map((value, day) =>
                            day === selectedDay ? value ^ (1 << index) : value,
                          ),
                        );
                      }}
                    >
                      {done && <X size={14} />}
                    </button>
                  </div>
                  <p>{t(detail)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

type PreviewRanking = { id: string; rank: number; name: string | null; imageUrl: string; displayRating: number };
const friendExamples: PreviewRanking[] = [
  { id: "you", rank: 1, name: "You", imageUrl: "/model2.png", displayRating: 2140 },
  { id: "friend-1", rank: 2, name: "Your friend", imageUrl: "/model5.png", displayRating: 2086 },
  { id: "friend-2", rank: 3, name: "Your friend", imageUrl: "/model3.png", displayRating: 1972 },
  { id: "friend-3", rank: 4, name: "Your friend", imageUrl: "/model7.png", displayRating: 1894 },
  { id: "friend-4", rank: 5, name: "Your friend", imageUrl: "/model9.png", displayRating: 1832 },
  { id: "friend-5", rank: 6, name: "Your friend", imageUrl: "/model4.png", displayRating: 1765 },
];
const rankingRating = (person: PreviewRanking, locale: string) => Math.round(person.displayRating).toLocaleString(locale);

export const LeaderboardPreview = memo(function LeaderboardPreview() {
  const { t } = useTranslation();
  return <Frame label={t("demo.leaderboardFrame")}>{active => <LeaderboardContent active={active} />}</Frame>;
});

function LeaderboardContent({ active }: { active: boolean }) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState("Global");
  // Mount near the viewport; fetch once and share the cache across visits.
  const { data, error } = useSWRImmutable<{ items: PreviewRanking[] }>(
    "/api/leaderboard/photos?limit=6&photoType=face&sort=rating&gender=all", apiGet,
    { shouldRetryOnError: false, dedupingInterval: 60000 },
  );
  const entries = scope === "Global" ? data?.items ?? [] : friendExamples.map(person => ({ ...person, name: t(person.id === "you" ? "demo.you" : "demo.friend") }));
  return <div className={styles.leaderboard}>
    <h3>Leaderboard</h3>
    <div className={styles.leaderboardTabs} role="tablist" aria-label={t("demo.scope")}>
      <m.span className={styles.leaderboardIndicator} animate={{ x: scope === "Global" ? "0%" : "100%" }} transition={{ duration: active ? .42 : 0, ease: [.16, 1, .3, 1] }} aria-hidden="true" />
      {["Global", "Friends"].map(tab => <button key={tab} type="button" role="tab" aria-selected={scope === tab} onClick={() => setScope(tab)}><strong>{t(tab === "Global" ? "demo.global" : "demo.friends")}</strong></button>)}
    </div>
    <AnimatePresence mode="wait">
      <m.div key={scope} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: active ? .42 : 0, ease: [.16, 1, .3, 1] }}>
        {entries.length ? <>
          <div className={styles.podium}>
            {[1, 0, 2].map(place => {
              const person = entries[place];
              if (!person) return null;
              const color = ["#8854f6", "#f5a124", "#36aeed"][place];
              return <m.div key={person.id} initial={{ opacity: active ? 0 : 1, y: active ? 22 : 0 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: active ? .75 : 0, delay: active ? place * .18 : 0, ease: [.16, 1, .3, 1] }}>
                <p>{person.name || "Mogger"}</p>
                <div className={styles.podiumAvatar} style={{ borderColor: color, width: place === 0 ? 82 : 70, height: place === 0 ? 82 : 70 }}>
                  <Image src={person.imageUrl} alt={person.name || t("demo.publicProfile")} fill sizes="82px" /><b>{rankingRating(person, i18n.language)}</b>
                </div>
                <div className={styles.podiumColumn} style={{ height: [155, 112, 88][place], background: `linear-gradient(${color}cc, ${color}55 60%, transparent)` }}><i style={{ background: color }} /><strong>{new Intl.NumberFormat(i18n.language).format(place + 1)}</strong></div>
              </m.div>;
            })}
          </div>
          <p className={styles.rankingHeading}>{t("demo.rankings")} <span>{t("demo.battleRating")}</span></p>
          {entries.slice(3).map(person => <div className={styles.rankingRow} key={person.id}><span>{person.rank}</span><Image src={person.imageUrl} alt="" width={44} height={44} /><strong>{person.name || "Mogger"}</strong><b>{rankingRating(person, i18n.language)}</b></div>)}
        </> : <p className={styles.rankingStatus} role="status">{t(error ? "demo.rankingUnavailable" : data ? "demo.rankingEmpty" : "demo.rankingLoading")}</p>}
      </m.div>
    </AnimatePresence>
    <p className={styles.rankingDisclaimer}>{t(scope === "Global" ? "demo.rankingDisclaimer" : "demo.friendsExample")}</p>
  </div>;
}

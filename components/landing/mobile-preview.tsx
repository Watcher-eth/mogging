import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import type { resources } from "@/lib/i18n/catalogs";
import Image from "next/image";
import { AnimatePresence, useReducedMotion } from "motion/react";
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
  ChevronUp,
  Images,
  ScanFace,
  X,
  Signal,
  Wifi,
  BatteryFull,
} from "lucide-react";
import type { ResolvedPrimitive } from "@/lib/creator/mobile-overlay-engine/resolve";
import { previewPortrait, resolvePreviewOverlay } from "./overlay";
import { processingOverlayPresets } from "./scan-presets";
import { reportOverlayPresets } from "@/lib/creator/mobile-overlay-engine/report-presets";
import styles from "./mobile-preview.module.css";

function Frame({
  children,
  label,
  dark = false,
  priority = false,
  chrome = true,
}: {
  children: (active: boolean) => ReactNode;
  label: string;
  dark?: boolean;
  priority?: boolean;
  chrome?: boolean;
}) {
  const height = 844;
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
    <div className={styles.iphone} data-preview-device role="group" aria-label={label}>
      <div ref={ref} className={styles.frame}>
        <div
          className={styles.stage}
          data-active={active}
          data-dark={dark}
          style={{ height, transform: `scale(${scale})` }}
        >
          {chrome && <div className={styles.status} aria-hidden="true">
            <span>9:41</span>
            <span className={styles.statusIcons}>
              <Signal size={14} fill="currentColor" />
              <Wifi size={14} />
              <BatteryFull size={18} />
            </span>
          </div>
          }
          {ready && children(active)}
        </div>
      </div>
      <div data-preview-popout className={styles.popout} style={{ transform: `scale(${scale})` }} />
      <Image
        src="/creator-devices/iphone-16-pro.png"
        alt=""
        aria-hidden="true"
        width={1350}
        height={2760}
        sizes="350px"
        priority={priority}
        className={styles.iphoneHardware}
      />
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
      <m.div className={styles.scannerCard}>
        <Image
          src={previewPortrait.src}
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
      </m.div>
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
// The same portrait carries the visitor from measurement to the finished report.
const scanPreviewDuration = 8400;

export const ScanReportPreview = memo(function ScanReportPreview() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"scan" | "report">("scan");
  const report = reduced || phase === "report";
  return (
    <div>
        <Frame priority chrome={!report} dark={!report} label={`${t("demo.scanFrame")} · ${t("demo.evaluationFrame")}`}>
          {active => <ScanReportContent active={active} phase={report ? "report" : "scan"} onPhaseChange={setPhase} reduced={Boolean(reduced)} />}
        </Frame>
    </div>
  );
});

function ScanReportContent({ active, phase, onPhaseChange, reduced }: {
  active: boolean; phase: "scan" | "report"; onPhaseChange: (phase: "scan" | "report") => void; reduced: boolean;
}) {
  useEffect(() => {
    if (!active || reduced || phase !== "scan") return;
    const timer = setTimeout(() => onPhaseChange("report"), scanPreviewDuration);
    return () => clearTimeout(timer);
  }, [active, phase, onPhaseChange, reduced]);
  return <AnimatePresence initial={false}>
    <m.div key={phase} className={styles.journeyScene} data-preview-phase={phase}
      initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.3 }}>
      {phase === "scan" ? <ScanContent active={active} priority /> : <EvaluationContent active={active} />}
    </m.div>
  </AnimatePresence>;
}

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
          src={previewPortrait.src}
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

const EvaluationContent = dynamic(() => import('./report-preview').then(module => module.ReportPreview), { ssr: false });
const ProgressContent = dynamic(() => import('@/components/creator/progress-preview').then(module => module.ProgressDemo), { ssr: false });

export const EvaluationPreview = memo(function EvaluationPreview({ startAt = 0 }: { startAt?: number }) {
  const { t } = useTranslation();
  return <Frame chrome={false} label={t("demo.evaluationFrame")}>{active => <EvaluationContent active={active} startAt={startAt} />}</Frame>;
});

export const ProgressPreview = memo(function ProgressPreview() {
  return <Frame dark chrome={false} label="Progress dashboard example">{active => <ProgressContent active={active} />}</Frame>;
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

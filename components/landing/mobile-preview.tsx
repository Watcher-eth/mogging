import Image from "next/image";
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
  ArrowUpRight,
  ClipboardList,
  X,
  ChartColumn,
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

function Primitive({ primitive }: { primitive: ResolvedPrimitive }) {
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

function PreviewLabel({
  label,
  width = scannerWidth,
  height = scannerHeight,
}: {
  label: Extract<ResolvedPrimitive, { kind: "label" }>;
  width?: number;
  height?: number;
}) {
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
      {[label.title, label.value].filter(Boolean).map((text, index) => (
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
          {text}
        </span>
      ))}
    </div>
  );
}

function ScanContent({ active, priority }: { active: boolean; priority: boolean }) {
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
        <h3>Facial scan</h3>
        <p>Anchoring detected landmarks</p>
      </header>
      <div className={styles.scannerCard}>
        <Image
          src="/model2.png"
          alt="Example face being scanned"
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
              [
                "Mapping eye region",
                "Tracing nose axis",
                "Measuring chin profile",
                "Reading skin texture",
                "Tracing jawline definition",
                "Checking symmetry",
                "Mapping lip proportions",
                "Measuring facial balance",
              ][scene]
            }
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
export const ScanPreview = memo(function ScanPreview({ priority = false }: { priority?: boolean }) {
  return (
    <Frame dark label="Mogging Facial scan screen">
      {(active) => <ScanContent active={active} priority={priority} />}
    </Frame>
  );
});
export const CameraPreview = memo(function CameraPreview() {
  return (
    <Frame dark label="Mogging guided face capture demonstration">
      {(active) => <CameraContent active={active} />}
    </Frame>
  );
});
function CameraContent({ active }: { active: boolean }) {
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
          alt="A person lining up their face in the camera"
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
        <h3>Capture</h3>
        <span>FACE CAPTURE</span>
      </div>
      <div className={styles.captureInstruction}>
        <span>[ 001 ] FRONT IMAGE</span>
        <b>{captured ? "FACE ALIGNED" : "ALIGN FACE"}</b>
      </div>
      <div className={styles.captureControls}>
        <span className={styles.roundControl}>
          <Images size={25} />
        </span>
        <button
          onClick={capture}
          type="button"
          aria-label="Take an example photo"
          className={captured ? styles.scanButton : styles.shutter}
        >
          {captured ? (
            <>
              <ScanFace size={21} />
              Scan
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

export const EvaluationPreview = memo(function EvaluationPreview() {
  return (
    <Frame label="Live example of the Mogging evaluation screen">
      {() => (
        <>
          <div
            className={styles.evaluationContent}
            tabIndex={0}
            aria-label="Scroll the example evaluation"
          >
            <div className={styles.reportPortrait}>
              <Image
                src="/model2.png"
                alt="Example evaluation portrait"
                fill
                sizes="350px"
                className={styles.photo}
              />
              <svg
                className={styles.overlay}
                viewBox="0 0 390 464"
                aria-hidden="true"
              >
                {overallGeometry.map((p) => (
                  <Primitive key={p.id} primitive={p} />
                ))}
              </svg>
              {overallGeometry.map((primitive) =>
                primitive.kind === "label" ? (
                  <PreviewLabel
                    key={primitive.id}
                    label={{ ...primitive, value: "[ 5.8 / 8 ]" }}
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
                  <small>OVERALL SCORE</small>
                  <strong>
                    7.2<em>/ 10</em>
                  </strong>
                </div>
                <div>
                  <small>POTENTIAL</small>
                  <strong className={styles.potentialScore}>
                    8.5<em>/ 10</em>
                  </strong>
                </div>
              </div>
              <div className={styles.categories}>
                {[
                  ["Eye area", "7.8/10"],
                  ["Jaw & chin", "7.4/10"],
                  ["Cheekbone structure", "7.1/10"],
                  ["PSL score", "5.8/8"],
                  ["Symmetry", "7.3/10"],
                  ["Skin quality", "7.0/10"],
                ].map(([name, score], index) => (
                  <div
                    key={name}
                    className={styles.category}
                    style={{ animationDelay: `${260 + index * 35}ms` }}
                  >
                    <span>{name}</span>
                    <strong>{score}</strong>
                  </div>
                ))}
              </div>
              <div className={styles.growth}>
                <h4>Growth Opportunities</h4>
                <div className={styles.opportunity}>
                  <div>
                    <span>
                      <ArrowUpRight size={17} />
                    </span>
                    <strong>Potential Score</strong>
                    <b>8.5/10</b>
                  </div>
                  <i>
                    <b />
                  </i>
                </div>
                <div className={styles.opportunity}>
                  <div>
                    <span>
                      <ClipboardList size={18} />
                    </span>
                    <strong>Your priorities</strong>
                    <ChevronUp size={18} color="#71717a" />
                  </div>
                  <p>
                    Start with the first priority. These steps come from your
                    category recommendations, ordered by score.
                  </p>
                  <div className={styles.priority}>
                    <div>
                      <b>1.</b>
                      <strong>Skin quality</strong>
                      <span>7.0/10</span>
                    </div>
                    <p>Build a consistent routine around your skin goals.</p>
                  </div>
                  <div className={styles.priority}>
                    <div>
                      <b>2.</b>
                      <strong>Definition</strong>
                      <span>7.4/10</span>
                    </div>
                    <p>
                      Follow your Protocol and track changes with future
                      evaluations.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.reportChrome}>
            <span>
              <ChartColumn size={16} strokeWidth={2} />
              Overall
              <ChevronDown size={15} />
            </span>
            <span>×</span>
          </div>
          <div className={styles.shareDock}>
            <div className={styles.share}>
              <Share size={19} />
              Share your score
            </div>
          </div>
        </>
      )}
    </Frame>
  );
});

type PreviewTask = { title: string; detail: string; color: string; icon: string; hour: number };
const protocolTasks: PreviewTask[] = [
  { title: "10 controlled chin tucks", detail: "Sit tall with relaxed shoulders. Slide your chin straight back, hold 3 seconds, release, and repeat 10 times.", color: "#32c48d", icon: "figure.stand", hour: 7 },
  { title: "Mewing: pressure-free rest", detail: "Find a relaxed tongue resting position. Keep your teeth apart and avoid pressing or straining.", color: "#ff6f9f", icon: "mouth.fill", hour: 12 },
  { title: "Cleanse & moisturize", detail: "Use a gentle cleanser, then moisturize to keep your skin routine consistent.", color: "#58bdff", icon: "drop.fill", hour: 8 },
  { title: "Daily SPF", detail: "Apply your sunscreen as directed before heading outdoors.", color: "#ffc45e", icon: "sun.max.fill", hour: 10 },
  { title: "Frame your face", detail: "Try your recommended hair styling direction and check how it frames your face.", color: "#c09aff", icon: "scissors", hour: 16 },
  { title: "Evening skin routine", detail: "Gently cleanse and moisturize before bed. Keep your routine simple and consistent.", color: "#58bdff", icon: "sparkles", hour: 18 },
];
const protocolDays = [[2, 3, 4], [0, 1, 5], [2, 1, 4], [0, 3, 5], [2, 1, 5], [0, 3, 4], [2, 3, 5], [0, 1, 4]].map(indices => indices.map(index => protocolTasks[index]));

export const ProtocolPreview = memo(function ProtocolPreview() {
  return (
    <Frame label="Interactive Mogging Protocol calendar and daily tasks">
      {(active) => <ProtocolContent active={active} />}
    </Frame>
  );
});
function ProtocolContent({ active }: { active: boolean }) {
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
        <h3>Protocol</h3>
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
        {["Sat", "Today", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
          (day, index) => (
            <button
              type="button"
              key={index}
              aria-label={`Show ${day}, October ${index + 3}`}
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
        aria-label="Scroll the example Protocol"
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
                    <strong>{title}</strong>
                    <button
                      type="button"
                      role="checkbox"
                      aria-label={`${done ? "Undo" : "Complete"} ${title}`}
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
                  <p>{detail}</p>
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
const rankingRating = (person: PreviewRanking) => Math.round(person.displayRating).toLocaleString("en-US");

export const LeaderboardPreview = memo(function LeaderboardPreview() {
  return <Frame label="Mogging public leaderboard">{active => <LeaderboardContent active={active} />}</Frame>;
});

function LeaderboardContent({ active }: { active: boolean }) {
  const [scope, setScope] = useState("Global");
  // Mount near the viewport; fetch once and share the cache across visits.
  const { data, error } = useSWRImmutable<{ items: PreviewRanking[] }>(
    "/api/leaderboard/photos?limit=6&photoType=face&sort=rating&gender=all", apiGet,
    { shouldRetryOnError: false, dedupingInterval: 60000 },
  );
  const entries = scope === "Global" ? data?.items ?? [] : friendExamples;
  return <div className={styles.leaderboard}>
    <h3>Leaderboard</h3>
    <div className={styles.leaderboardTabs} role="tablist" aria-label="Leaderboard scope">
      <m.span className={styles.leaderboardIndicator} animate={{ x: scope === "Global" ? "0%" : "100%" }} transition={{ duration: active ? .42 : 0, ease: [.16, 1, .3, 1] }} aria-hidden="true" />
      {["Global", "Friends"].map(tab => <button key={tab} type="button" role="tab" aria-selected={scope === tab} onClick={() => setScope(tab)}><strong>{tab}</strong></button>)}
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
                  <Image src={person.imageUrl} alt={person.name || "Public profile"} fill sizes="82px" /><b>{rankingRating(person)}</b>
                </div>
                <div className={styles.podiumColumn} style={{ height: [155, 112, 88][place], background: `linear-gradient(${color}cc, ${color}55 60%, transparent)` }}><i style={{ background: color }} /><strong>{["1st", "2nd", "3rd"][place]}</strong></div>
              </m.div>;
            })}
          </div>
          <p className={styles.rankingHeading}>RANKINGS <span>BATTLE RATING</span></p>
          {entries.slice(3).map(person => <div className={styles.rankingRow} key={person.id}><span>{person.rank}</span><Image src={person.imageUrl} alt="" width={44} height={44} /><strong>{person.name || "Mogger"}</strong><b>{rankingRating(person)}</b></div>)}
        </> : <p className={styles.rankingStatus} role="status">{error ? "Global rankings are temporarily unavailable." : data ? "Public rankings will appear here." : "Loading public rankings…"}</p>}
      </m.div>
    </AnimatePresence>
    <p className={styles.rankingDisclaimer}>{scope === "Global" ? "Public rankings · Battle rating" : "Example friends leaderboard"}</p>
  </div>;
}

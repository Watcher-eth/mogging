import { RenderTimeRemaining } from '@/components/creator/render-time-remaining'
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ArrowRight } from "lucide-react";
import {
  prepareSculptureRenderer,
  type SculptureRenderer,
} from "@/lib/creator/sculpture-renderer";
import {
  sculptureFeatures,
  sculptureModels,
  sculptureModelLabels,
  sculptureMaterialLabels,
  sculptureFinishes,
  sculptureLabels,
  sculptureTreatments,
  sculptureSchema,
  sculpturePrimitiveVariation,
  type SculptureStudy,
} from "@/lib/creator/cephra-study";
import {
  sculptureScripts,
  sculptureRecording,
  sculptureScriptDuration,
  sculptureScriptFrame,
} from "@/lib/creator/cephra-scripts";
import {
  prepareSculptureReport,
  type SculptureReport,
} from "@/lib/creator/sculpture-report";
import { drawSculptureScript } from "@/lib/creator/sculpture-script-renderer";
import {
  exportCephraDemo,
  exportCephraScript,
} from "@/lib/creator/cephra-export";
import styles from "@/components/creator/cephra-preview.module.css";

export default function CephraPreview() {
  const abort = useRef<AbortController | undefined>(undefined);
  const canvas = useRef<HTMLCanvasElement>(null),
    renderer = useRef<SculptureRenderer | undefined>(undefined),
    position = useRef(0),
    busy = useRef(false);
  const [study, setStudy] = useState<SculptureStudy>(() =>
      sculptureSchema.parse({
        feature: "jaw-width",
        from: 0,
        to: 0.65,
        view: "three-quarter",
      }),
    ),
    [playing, setPlaying] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [time, setTime] = useState(0),
    [progress, setProgress] = useState<number | null>(null);
  const [remainingSeconds,setRemainingSeconds] = useState<number|null>(null);
  const narration = useRef<HTMLAudioElement>(null);
  const [report, setReport] = useState<SculptureReport>();
  const [scriptId, setScriptId] = useState("");
  const [variation, setVariation] = useState(0);
  const script = sculptureScripts.find((s) => s.id === scriptId);
  const duration = script ? sculptureScriptDuration(script) : 6500;
  const recording = script ? sculptureRecording(script) : undefined;
  const displayStudy = script
    ? sculptureScriptFrame(script, time, variation).study
    : study;
  useEffect(() => {
    let disposed = false;
    setReport(undefined);
    if (script)
      void prepareSculptureReport(script)
        .then((value) => {
          if (!disposed) setReport(value);
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    return () => {
      disposed = true;
    };
  }, [script]);
  useEffect(() => {
    const audio = narration.current;
    if (!audio || !recording) return;
    if (playing) void audio.play().catch((e) => {
      if (e.name !== "AbortError") setError(e.message);
    });
    else audio.pause();
    return () => audio.pause();
  }, [playing, recording]);

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduced(query.matches);
      if (query.matches) setPlaying(false);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    let disposed = false;
    void prepareSculptureRenderer()
      .then((r) => {
        if (disposed) r.dispose();
        else {
          renderer.current = r;
          setError("");
          setReady(true);
        }
      })
      .catch((e) => {
        setPlaying(false);
        setError(
          /creating WebGL context/.test(e.message)
            ? "3D graphics are disabled in this browser. Open the preview in a regular browser, or fully restart Codex."
            : e.message,
        );
      });
    return () => {
      disposed = true;
      renderer.current?.dispose();
      renderer.current = undefined;
      setReady(false);
    };
  }, []);
  const pausedTime = playing ? null : time;
  useEffect(() => {
    const controller = new AbortController();
    let id = 0,
      disposed = false,
      last = performance.now(),
      lastPaint = 0;
    const paint = async (now: number) => {
      if (disposed) return;
      if (busy.current) {
        id = requestAnimationFrame(paint);
        return;
      }
      if (playing && now-lastPaint < 1000/30) { id = requestAnimationFrame(paint); return; }
      lastPaint = now;
      if (playing) {
        position.current =
          recording && narration.current
            ? narration.current.currentTime * 1000
            : (position.current + Math.min(100, now - last)) % duration;
        setTime(position.current);
      }
      last = now;
      if (renderer.current) {
        busy.current = true;
        try {
          const shot = script
            ? sculptureScriptFrame(script, position.current, variation)
            : undefined;
          if (!shot?.report)
            await renderer.current.seek(
              shot?.study ?? study,
              shot?.time ?? position.current,
              shot?.duration ?? duration,
              reduced,
              controller.signal,
              shot?.previous,
            );
          else if (shot.previous && shot.reportTime < 1100)
            await renderer.current.seek(
              shot.previous.study,
              shot.previous.time,
              shot.previous.duration,
              reduced,
              controller.signal,
            );
          if (!disposed) {
            const c = canvas.current;
            if (c) {
              const ctx = c.getContext("2d")!;
              if (script)
                drawSculptureScript(
                  ctx,
                  renderer.current,
                  report,
                  script,
                  position.current,
                  c.width,
                  c.height,
                  reduced,
                  variation,
                );
              else renderer.current.draw(ctx, c.width, c.height);
            }
          }
        } catch (e) {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error ? e.message : "Could not render the sculpture",
            );
        } finally {
          busy.current = false;
        }
      }
      if (!disposed && playing) id = requestAnimationFrame(paint);
    };
    id = requestAnimationFrame(paint);
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(id);
    };
  }, [
    study,
    script,
    variation,
    duration,
    reduced,
    playing,
    ready,
    report,
    recording,
    pausedTime,
  ]);
  const update = (key: keyof SculptureStudy, value: string) => {
    setScriptId("");
    position.current = 0;
    setTime(0);
    setStudy(() =>
      sculptureSchema.parse({
        ...displayStudy,
        from: 0,
        to: 0.55,
        showGuides: true,
        showMeasurements: true,
        restore: true,
        triggerMs: 650,
        [key]: value,
        ...(key === "model" && value !== "classical" && displayStudy.material === "chrome" ? {material:"matte"} : {}),
        ...(key === "treatment" &&
        ["angle", "fold-ratio", "profile-plane"].includes(value)
          ? {
              view: /jaw|chin|gonial|nose|midface|forehead/.test(
                displayStudy.feature,
              )
                ? "profile"
                : "front",
            }
          : {}),
      }),
    );
  };
  async function download() {
    if (!renderer.current) return;
    setPlaying(false);
    setProgress(0);
    setRemainingSeconds(null);
    try {
      abort.current = new AbortController();
      if (script)
        await exportCephraScript(
          script,
          setProgress,
          abort.current.signal,
          variation,
          setRemainingSeconds,
        );
      else await exportCephraDemo(study, setProgress, abort.current.signal, setRemainingSeconds);
    } catch (e) {
      if (!abort.current?.signal.aborted) setError(e instanceof Error ? e.message : "Could not export");
    } finally {
      setProgress(null);
    }
  }
  return (
    <main className={styles.page}>
      <header>
        <span>CREATOR STUDIO · MATERIAL STUDIES</span>
        <h1>Cephra, in our language.</h1>
        <p>Facial anatomy, perspective and proportions.</p>
      </header>
      <div className={styles.workspace}>
        <section>
          <canvas
            ref={canvas}
            width={1080}
            height={1920}
            aria-label="Cephra-style sculptural face study"
          />
          {recording && (
            <audio
              key={scriptId}
              ref={narration}
              src={recording.audio}
              onEnded={() => setPlaying(false)}
              preload="auto"
            />
          )}
          <div className={styles.player}>
            <button
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range"
              min="0"
              max={duration}
              value={time}
              onChange={(e) => {
                setPlaying(false);
                position.current = Number(e.target.value);
                if (narration.current)
                  narration.current.currentTime = position.current / 1000;
                setTime(position.current);
              }}
              aria-label="Study time"
            />
            <span>{(time / 1000).toFixed(1)}s</span>
          </div>
        </section>
        <aside>
          <label>
            Preview
            <select
              aria-label="Preview"
              value={scriptId}
              onChange={(e) => {
                setScriptId(e.target.value);
                const selected = sculptureScripts.find(
                  (s) => s.id === e.target.value,
                );
                if (selected)
                  setStudy(sculptureScriptFrame(selected, 0, variation).study);
                else
                  setStudy((current) =>
                    sculptureSchema.parse({
                      ...current,
                      from: 0,
                      to: 0.55,
                      restore: true,
                      showGuides: true,
                      showMeasurements: true,
                    }),
                  );
                position.current = 0;
                setTime(0);
                setPlaying(!reduced);
              }}
            >
              <option value="">Primitive study</option>
              {sculptureScripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.title}
                </option>
              ))}
            </select>
          </label>
          {script && (
            <p className={styles.note}>
              {recording
                ? "Recorded narration · observed word timing"
                : "Voiceover pending · estimated timing"}{" "}
              · {sculptureScriptFrame(script, time, variation).section.role}
            </p>
          )}
          <label>
            Figure
            <select
              aria-label="Figure"
              value={displayStudy.model}
              onChange={(e) => update("model", e.target.value)}
            >
              {sculptureModels.map(model => <option key={model} value={model}>{sculptureModelLabels[model]}</option>)}
            </select>
          </label>
          <label>
            Feature
            <select
              aria-label="Feature"
              value={displayStudy.feature}
              onChange={(e) => update("feature", e.target.value)}
            >
              {sculptureFeatures.map((f) => (
                <option key={f} value={f}>
                  {sculptureLabels[f]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Composition
            <select
              aria-label="Composition"
              value={displayStudy.treatment}
              onChange={(e) => update("treatment", e.target.value)}
            >
              {sculptureTreatments.map((t) => (
                <option key={t} value={t}>
                  {t === "bone-window" ? "Regional bone window" : t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Material
            <select
              aria-label="Material"
              value={displayStudy.material}
              onChange={(e) => update("material", e.target.value)}
            >
              {sculptureFinishes(displayStudy.model).map(finish => <option key={finish} value={finish}>{sculptureMaterialLabels[finish]}</option>)}
            </select>
          </label>
          <label>
            Camera motion
            <select
              aria-label="Camera motion"
              value={displayStudy.camera}
              onChange={(e) => update("camera", e.target.value)}
            >
              {["hold", "push", "orbit", "pullback", "turn", "pan"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label>
            View
            <select
              aria-label="View"
              value={displayStudy.view}
              onChange={(e) => update("view", e.target.value)}
            >
              <option value="front">Front</option>
              <option value="three-quarter">Three-quarter</option>
              <option value="profile">Profile</option>
            </select>
          </label>
          <label>
            Background
            <select
              aria-label="Background"
              value={displayStudy.background}
              onChange={(e) => update("background", e.target.value)}
            >
              {["none", "tracking-frame", "checker"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Measurement instrument
            <select
              aria-label="Measurement instrument"
              value={displayStudy.instrument}
              onChange={(e) => update("instrument", e.target.value)}
            >
              {["none", "auto", "linear", "arc", "dial"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Overlay accent
            <select
              aria-label="Overlay accent"
              value={displayStudy.accent}
              onChange={(e) => update("accent", e.target.value)}
            >
              {["none", "surface-net", "contour", "section-scan"].map(
                (accent) => (
                  <option key={accent}>{accent}</option>
                ),
              )}
            </select>
          </label>
          {displayStudy.treatment === "bone-window" && (
            <label>
              Reveal area
              <select
                aria-label="Reveal area"
                value={displayStudy.revealRegion}
                onChange={(e) => update("revealRegion", e.target.value)}
              >
                {["feature", "cheek", "jaw", "nose"].map((region) => (
                  <option key={region}>{region}</option>
                ))}
              </select>
            </label>
          )}
          <button
            className={styles.variation}
            onClick={() => {
              position.current = 0;
              setTime(0);
              const next = variation + 1;
              setVariation(next);
              if (!script) setStudy(sculpturePrimitiveVariation(study, next));
            }}
          >
            <RotateCcw size={16} />
            Variation
          </button>
          <button
            className={styles.download}
            disabled={
              !ready ||
              progress !== null ||
              (!!script && (!recording || !report))
            }
            onClick={() => void download()}
          >
            {progress !== null
              ? progress===0 ? "Preparing lighting…" : `Rendering ${(progress * 100).toFixed(progress<.01?2:0)}%`
              : "Render study MP4"}
            <ArrowRight size={16} />
          </button>
          {progress !== null ? <RenderTimeRemaining seconds={remainingSeconds}/> : null}
          {progress !== null ? (
            <button onClick={() => abort.current?.abort()}>
              Cancel render
            </button>
          ) : null}
          <p role="status">
            {error ||
              (!ready
                ? "Preparing the studio…"
                : "")}
          </p>
        </aside>
      </div>
      <section className={styles.scripts}>
        <h2>Script drafts</h2>
        <p>
          Viewer-led scripts, continuous feature demonstrations and populated
          app-report endings.
        </p>
        {sculptureScripts.map((script) => (
          <details key={script.id}>
            <summary>
              {script.title}
              <span>
                {script.voice} · {script.model}
              </span>
            </summary>
            <p className={styles.direction}>{script.delivery}</p>
            {script.sections.map((section) => (
              <div key={section.id ?? section.text}>
                <small>
                  {section.role} · {section.treatment}
                </small>
                <p>{section.text}</p>
                <p className={styles.direction}>{section.action}</p>
              </div>
            ))}
          </details>
        ))}
      </section>
    </main>
  );
}
export function getServerSideProps() {
  return process.env.NODE_ENV === "development"
    ? { props: {} }
    : { notFound: true };
}

import { drawSpecimenFrame } from "./portrait-instruments";
import { sculptureEase, type SculptureStudy } from "./cephra-study";

const checkers = new Map<string, HTMLCanvasElement>();
function checkerTexture(darker: boolean, theme: "light" | "dark") {
  const key = `${theme}:${darker}`;
  const cached = checkers.get(key);
  if (cached) return cached;
  const checker = document.createElement("canvas");
  checker.width = 600;
  checker.height = 800;
  const ctx = checker.getContext("2d")!,
    image = ctx.createImageData(600, 800);
  for (let y = 0; y < 800; y++)
    for (let x = 0; x < 600; x++) {
      const radius = Math.hypot((x - 300) / 300, (y - 400) / 400);
      const fringe =
        Math.sin(x * 0.11 + y * 0.07) * 0.025 +
        Math.sin(x * 0.33 - y * 0.23) * 0.015;
      const fade = 1 - sculptureEase((radius - 0.55 + fringe) / 0.42);
      const index = (y * 600 + x) * 4,
        shade =
          (Math.floor(x / 24) + Math.floor(y / 24)) % 2
            ? darker
              ? 216
              : 231
            : darker
              ? 242
              : 247;
      image.data[index] =
        image.data[index + 1] =
        image.data[index + 2] =
          theme === "dark" ? (255 - shade) * 0.8 + 20 : shade;
      image.data[index + 3] = Math.round(fade * 180);
    }
  ctx.putImageData(image, 0, 0);
  checkers.set(key, checker);
  return checker;
}

export function drawSculptureBackdrop(
  ctx: CanvasRenderingContext2D,
  study: SculptureStudy,
  bounds: { x: number; y: number; width: number; height: number },
  time: number,
  reduced: boolean,
  theme: "light" | "dark" = "light",
) {
  if (study.background === "none") return;
  const progress = reduced ? 1 : sculptureEase(time / 850);
  ctx.save();
  ctx.globalAlpha *= progress;
  if (study.background === "checker") {
    const pad = bounds.width * 0.18;
    ctx.drawImage(
      checkerTexture(study.variant % 3 === 1, theme),
      bounds.x - pad,
      bounds.y - pad,
      bounds.width + pad * 2,
      bounds.height + pad * 2,
    );
  } else drawSpecimenFrame(ctx, bounds, time, reduced, "#5c5a57");
  ctx.restore();
}

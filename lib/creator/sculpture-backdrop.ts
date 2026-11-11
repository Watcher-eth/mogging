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
  } else if (study.background === "tracking-frame") {
    drawSpecimenFrame(ctx, bounds, time, reduced, "#5c5a57");
  } else {
    drawBackdropPattern(ctx, study.background, bounds, reduced ? 0 : time / 1000);
  }
  ctx.restore();
}

function drawBackdropPattern(
  ctx: CanvasRenderingContext2D,
  pattern: SculptureStudy["background"],
  bounds: {x: number; y: number; width: number; height: number},
  seconds: number,
) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const drift = Math.sin(seconds*.65);
  const x = w*.5, y = Math.max(h*.38, Math.min(h*.53, bounds.y+bounds.height*.45));
  const unit = w / 1080;
  function bloom(cx: number, cy: number, rx: number, ry: number, color: string) {
    ctx.save();
    ctx.translate(cx,cy);
    ctx.scale(rx,ry);
    const colorField = ctx.createRadialGradient(0,0,0,0,0,1);
    colorField.addColorStop(0,`rgba(${color},.44)`);
    colorField.addColorStop(.5,`rgba(${color},.18)`);
    colorField.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle = colorField;
    ctx.fillRect(-1,-1,2,2);
    ctx.restore();
  }
  if (pattern === "mesh" || pattern === "studio-halo") {
    bloom(x + drift*w*.05, y, w*.68, h*.38, "217,222,227");
    if (pattern === "mesh") {
      bloom(w*.17,y+h*.14,w*.52,h*.31,"223,220,214");
      bloom(w*.84,y-h*.12,w*.43,h*.28,"210,214,221");
    }
    return;
  }
  const radius = Math.min(w*.49, bounds.width*1.12);
  const gap = 35*unit;
  const extent = Math.ceil(radius/gap);
  const offset = drift*gap*.45;
  const fade = (distance: number) => .34 * (1-sculptureEase(distance/radius));
  const stroke = (alpha: number) => {
    ctx.strokeStyle = `rgba(113,119,128,${alpha})`;
    ctx.lineWidth = unit;
    ctx.stroke();
  };
  if (pattern === "interference") {
    for (let i=1;i<=9;i++) {
      ctx.beginPath();
      ctx.ellipse(x+offset,y,gap*i,gap*i*.72,-.22,0,Math.PI*2);
      stroke(fade(gap*i)*.7);
    }
    return;
  }
  for (let i=-extent;i<=extent;i++) {
    if (pattern === "dot-field") {
      for (let j=-extent;j<=extent;j++) {
        const alpha=fade(Math.hypot(i,j)*gap);
        if (alpha < .02) continue;
        ctx.fillStyle=`rgba(105,112,121,${alpha})`;
        ctx.beginPath(); ctx.arc(x+i*gap+offset,y+j*gap,1.8*unit,0,Math.PI*2); ctx.fill();
      }
    } else if (pattern === "depth-grid") {
      const horizon = y - 2*gap, base = y+5*gap;
      ctx.beginPath();
      ctx.moveTo(x+i*gap*.32,horizon); ctx.lineTo(x+i*gap*1.22+offset,base);
      stroke(fade(Math.abs(i)*gap));
      if (i>0) {
        const row=horizon+(base-horizon)*Math.pow(i/extent,1.8);
        const half=radius*(.32+.68*i/extent);
        ctx.beginPath(); ctx.moveTo(x-half,row); ctx.lineTo(x+half,row);
        stroke(fade(i*gap)*.85);
      }
    } else {
      const d=i*gap, half=Math.sqrt(Math.max(0,radius*radius-d*d));
      if (!half) continue;
      ctx.beginPath();
      ctx.moveTo(x+d+offset,y-half); ctx.lineTo(x+d+offset,y+half);
      ctx.moveTo(x-half,y+d); ctx.lineTo(x+half,y+d);
      stroke(fade(Math.abs(d))*(i%4===0 ? .88 : .53));
    }
  }
}

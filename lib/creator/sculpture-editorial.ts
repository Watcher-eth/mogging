import { sculptureCutawaySurface, sculptureEase, sculptureFeatureConfig, type SculptureStudy } from "./cephra-study";

type Point = {x: number; y: number; visible?: boolean};
type Frame = {x: number; y: number; width: number; height: number};
type Effect = SculptureStudy["editorial"];

export function sculptureEditorialUsesBaseline(effect: Effect) {
  return effect === "matched-crops" || effect === "rolling-comparison";
}

export function drawSculptureEditorial(
  ctx: CanvasRenderingContext2D,
  study: SculptureStudy,
  point: (key: string) => Point,
  frame: Frame,
  image: CanvasImageSource,
  baseline: CanvasImageSource | undefined,
  w: number,
  h: number,
  age: number,
  reduced: boolean,
  theme: "light" | "dark",
) {
  const effect = study.editorial;
  if (!effect || (!reduced && age <= 0)) return;
  const u = w / 1080, tau = Math.PI * 2;
  const enter = (delay = 0, span = 480) => reduced ? 1 : sculptureEase((age - delay) / span);
  const ink = study.material === "chrome" || theme === "dark" ? "248,249,250" : "57,60,64";
  const rgba = (alpha: number) => `rgba(${ink},${alpha})`;
  const { anchor, measure } = sculptureFeatureConfig[study.feature];
  const [a, b] = measure.map(point);
  const focus = point(anchor);
  if (focus.visible === false || !Number.isFinite(focus.x) || !Number.isFinite(focus.y)) return;
  const line = (start: Point, end: Point, delay = 0, dashed = false, opacity = .75) => {
    const t = enter(delay);
    if (!t || start.visible === false || end.visible === false) return;
    ctx.strokeStyle = rgba(opacity);
    ctx.setLineDash(dashed ? [4*u, 6*u] : []);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(start.x+(end.x-start.x)*t, start.y+(end.y-start.y)*t);
    ctx.stroke();
  };
  const mark = (p: Point, delay = 0, radius = 4) => {
    if (p.visible === false) return;
    ctx.fillStyle = rgba(.92 * enter(delay));
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * u, 0, tau);
    ctx.fill();
  };
  const arc = (p: Point, r: number, start: number, span: number, delay = 0) => {
    const t = enter(delay, 650);
    if (!t) return;
    ctx.setLineDash([3*u, 6*u]);
    ctx.strokeStyle = rgba(.72);
    ctx.beginPath();
    ctx.arc(p.x,p.y,r*u,start,start+span*t,span<0);
    ctx.stroke();
  };
  const xy = (x: number, y: number): Point => ({x,y});
  const bracket = (from: Point, to: Point, delay: number) => {
    const angle = Math.atan2(to.y-from.y,to.x-from.x) + Math.PI/2;
    const dx = Math.cos(angle)*9*u, dy = Math.sin(angle)*9*u;
    line(from,to,delay);
    for (const p of [from,to]) line(xy(p.x-dx,p.y-dy),xy(p.x+dx,p.y+dy),delay+180);
  };
  const angles = (start: Point, pivot: Point, end: Point) => {
    const heading = Math.atan2(start.y-pivot.y,start.x-pivot.x);
    const delta = Math.atan2(end.y-pivot.y,end.x-pivot.x)-heading;
    return [heading,Math.atan2(Math.sin(delta),Math.cos(delta))] as const;
  };
  ctx.save();
  ctx.lineWidth = 1.8*u;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (effect) {
    case "datum-drop": {
      const brow = point("glabella");
      mark(brow);
      line(brow,xy(brow.x,Math.max(brow.y+70*u,focus.y+32*u)),110,true);
      break;
    }
    case "offset-bridge": {
      const datum = point("glabella");
      const projection = xy(datum.x,focus.y);
      line(datum,projection,0,true,.48);
      bracket(projection,focus,340);
      mark(focus,520);
      break;
    }
    case "cupid-fork": {
      const base = point("noseBase"), lip = point("upperLip");
      const spread = Math.abs(point("mouthRight").x-point("mouthLeft").x)*.13;
      mark(base);
      for (const [i,side] of [-1,1].entries()) {
        const peak = xy(lip.x+side*spread,lip.y);
        line(base,peak,180+i*110,true);
        mark(peak,360+i*110,3);
      }
      break;
    }
    case "length-transfer": {
      if (a.visible === false || b.visible === false) break;
      const offset = Math.max(a.x,b.x)+38*u;
      line(a,xy(offset,a.y),0,true,.48);
      line(b,xy(offset,b.y),90,true,.48);
      bracket(xy(offset,a.y),xy(offset,b.y),260);
      break;
    }
    case "eye-level-reference": {
      const left = point("innerCanthus"), right = point("outerCanthus");
      mark(left); mark(right,120);
      line(xy(Math.min(left.x,right.x)-22*u,left.y),xy(Math.max(left.x,right.x)+36*u,left.y),250,true,.6);
      break;
    }
    case "tilt-wedge": {
      const left = point("innerCanthus"), right = point("outerCanthus");
      const level = xy(right.x,left.y), t = enter(250);
      if (!t || left.visible === false || right.visible === false) break;
      ctx.fillStyle = rgba(.12*t);
      ctx.beginPath();
      ctx.moveTo(left.x,left.y); ctx.lineTo(level.x,level.y); ctx.lineTo(right.x,right.y); ctx.closePath(); ctx.fill();
      line(left,level,0,true);
      line(level,right,250);
      break;
    }
    case "cheek-coordinate": {
      const eye = point("eyeRight");
      const corner = xy(focus.x,eye.y);
      line(eye,corner,0,true,.48);
      line(corner,focus,240,true);
      mark(focus,460);
      break;
    }
    case "width-transfer": {
      const left = study.feature.includes("cheek") ? point("cheekOpposite") : a;
      const right = study.feature.includes("cheek") ? point("cheek") : b;
      if (left.visible === false || right.visible === false) break;
      const top = Math.min(left.y,right.y)-24*u;
      for (const endpoint of [left,right]) line(endpoint,xy(endpoint.x,top),0,true,.55);
      bracket(xy(left.x,top),xy(right.x,top),240);
      break;
    }
    case "hinge-lock": {
      const pivot = point("jaw"), ear = point("ear"), chin = point("chin");
      mark(pivot,0,6);
      for (const end of [ear,chin]) {
        const d = Math.atan2(end.y-pivot.y,end.x-pivot.x);
        line(pivot,xy(pivot.x+Math.cos(d)*36*u,pivot.y+Math.sin(d)*36*u),150);
      }
      arc(pivot,13,0,tau,350);
      break;
    }
    case "arc-envelope": {
      const pivot = point("jaw");
      const [start, span] = angles(point("ear"),pivot,point("chin"));
      arc(pivot,57,start,span,230);
      arc(pivot,65,start,span,340);
      break;
    }
    case "cutaway-edge": {
      const { contour } = sculptureCutawaySurface(study);
      const path = Array.from({length: 48}, (_, index) => point(`${contour}:${index}`));
      if (path.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) break;
      const travel = enter(100,1120)*(path.length-1);
      for (let i=0; i<path.length-1; i++) {
        const light = Math.max(0,1-Math.abs(travel-i)/6);
        if (!light) continue;
        line({...path[i],visible:true},{...path[i+1],visible:true},0,false,.8*light);
      }
      break;
    }
    case "focal-reticle": {
      const size = (34-13*enter())*u;
      for (const sx of [-1,1]) for (const sy of [-1,1]) {
        const corner=xy(focus.x+sx*size,focus.y+sy*size);
        line(xy(corner.x-sx*9*u,corner.y),corner);
        line(xy(corner.x,corner.y-sy*9*u),corner);
      }
      break;
    }
    case "perspective-frustum": {
      const left = point("eyeLeft"), right = point("eyeRight"), nose=point("nose");
      for (const [i,p] of [left,right].entries()) {
        const outer=xy(p.x+(i ? 1 : -1)*58*u,p.y-33*u);
        mark(outer, i*90, 3);
        line(outer,nose,160+i*90,true,.43);
      }
      break;
    }
    case "matched-crops":
    case "rolling-comparison": {
      if (!baseline || !(image instanceof HTMLCanvasElement) || !image.width || !image.height) break;
      const size = 192*u, side = focus.x > w*.55 ? -1 : 1;
      const x = Math.min(w*.83-size,Math.max(w*.085,focus.x+side*179*u-size/2));
      const y = Math.min(h*.65,Math.max(h*.29,focus.y+60*u));
      const crop = Math.min(image.width,image.height)*.25;
      const sx = Math.max(0,Math.min(image.width-crop,(focus.x-frame.x)/frame.width*image.width-crop/2));
      const sy = Math.max(0,Math.min(image.height-crop,(focus.y-frame.y)/frame.height*image.height-crop/2));
      const split = enter(190,940);
      const rolling = effect === "rolling-comparison";
      if (!rolling) {
        const gap = 9*u, half = (size-gap)/2;
        line(focus,xy(x+size/2,y+half/2),0,true,.48);
        for (const [i,source] of [baseline,image].entries()) {
          ctx.save();
          ctx.globalAlpha *= enter(100+i*230);
          const cardX = x+i*(half+gap), cardY = y+(1-enter(100+i*230))*12*u;
          ctx.beginPath(); ctx.roundRect(cardX,cardY,half,half,9*u);
          ctx.clip(); ctx.drawImage(source,sx,sy,crop,crop,cardX,cardY,half,half);
          ctx.restore();
          ctx.strokeStyle=rgba(.46*enter(100+i*230));
          ctx.beginPath(); ctx.roundRect(cardX,cardY,half,half,9*u); ctx.stroke();
        }
        break;
      }
      line(focus,xy(x+size/2,y+size/2),0,true,.48);
      ctx.globalAlpha *= enter(90);
      ctx.shadowColor="rgba(20,23,28,.21)"; ctx.shadowBlur=20*u;
      ctx.fillStyle="#fff";
      ctx.beginPath(); ctx.roundRect(x,y,size,size,14*u); ctx.fill();
      ctx.shadowBlur=0; ctx.clip();
      ctx.drawImage(baseline,sx,sy,crop,crop,x,y,size,size);
      const boundary = x+size*split;
      ctx.beginPath(); ctx.rect(boundary,y,size,size); ctx.clip();
      ctx.drawImage(image,sx,sy,crop,crop,x,y,size,size);
      ctx.fillStyle="rgba(255,255,255,.93)";
      ctx.fillRect(boundary,y,2*u,size);
      break;
    }
    case "support-lattice": {
      const region = [focus, point("noseBase"), point("upperLip"), point("cheek")].filter(p=>p.visible!==false);
      for (const [i,p] of region.entries()) {
        mark(p,i*100,3);
        for (let j=0;j<i;j++) line(region[j],p,120+i*90,true,.38);
      }
      break;
    }
  }
  ctx.restore();
}

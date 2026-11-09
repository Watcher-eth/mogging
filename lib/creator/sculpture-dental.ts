import { sculptureEase, type SculptureStudy } from "./cephra-study";

export function drawDentalStudy(
  ctx: CanvasRenderingContext2D,
  study: SculptureStudy,
  time: number,
  width: number,
  height: number,
  reduced: boolean,
) {
  const stage = study.demo;
  if (stage !== "arch" && stage !== "bite" && stage !== "crowding" && stage !== "smile") return;
  const at = (ms: number, span = 520) => reduced ? 1 : sculptureEase((time - ms) / span);
  const alpha = at(stage==="smile"?0:study.narrationTriggerMs ?? 0, 400);
  const change = at(study.guideEndMs ?? (study.narrationTriggerMs ?? 0) + 520, 730);
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(width / 2, height * .46);
  const scale = width / 700;
  ctx.scale(scale, scale);
  ctx.globalAlpha *= alpha;
  if (stage !== "smile") {
    ctx.fillStyle = "#fcfcfa";
    ctx.fillRect(-350, -height * .46 / scale, 700, height / scale);
  }

  const enamel = (x: number, y: number, w: number, h: number, rotation: number, inverted: boolean, posterior = false) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (inverted) ctx.scale(1, -1);
    const fill = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    fill.addColorStop(0, "#d1cdc6");
    fill.addColorStop(.4, "#f7f5ee");
    fill.addColorStop(.76, "#f5f3ee");
    fill.addColorStop(1, "#c3c0ba");
    ctx.shadowColor = "#38322f47";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-w * .42, -h * .40);
    ctx.quadraticCurveTo(-w * .03, -h * .62, w * .37, -h * .43);
    ctx.quadraticCurveTo(w * .57, -h * .24, w * .48, h * .34);
    ctx.quadraticCurveTo(w * .30, h * .54, -w * .31, h * .46);
    ctx.quadraticCurveTo(-w * .55, h * .39, -w * .42, -h * .40);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (posterior) {
      ctx.strokeStyle = "#b0a99e85";
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(-w*.20,-h*.08);
      ctx.quadraticCurveTo(-w*.03,h*.02,w*.19,-h*.12);
      ctx.moveTo(-w*.02,h*.21);
      ctx.quadraticCurveTo(w*.09,-h*.03,w*.02,-h*.22);
      ctx.stroke();
    }
    ctx.restore();
  };
  const gum = (path: () => void, top: number, bottom: number) => {
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, "#d7d2c9");
    fill.addColorStop(.42, "#f1ede5");
    fill.addColorStop(1, "#a9a196");
    ctx.fillStyle = fill;
    ctx.shadowColor = "#37332e36";
    ctx.shadowBlur = 23;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    path();
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
  };
  const points = (x: number, y: number, targetX: number, targetY: number) => {
    ctx.strokeStyle = "#62605a";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(targetX,targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#4f4d47";
    ctx.beginPath();
    ctx.arc(x,y,3.5,0,Math.PI*2);
    ctx.fill();
  };

  if (stage === "arch") {
    const tip = 35 * change;
    gum(() => {
      ctx.moveTo(-188,112); ctx.bezierCurveTo(-194,-32,-142,-150-tip,0,-166-tip);
      ctx.bezierCurveTo(142,-150-tip,194,-32,188,112);
      ctx.quadraticCurveTo(182,147,137,141);
      ctx.quadraticCurveTo(0,112,-137,141); ctx.quadraticCurveTo(-182,147,-188,112);
    }, -180, 145);
    ctx.strokeStyle = "#a39a8b50";
    ctx.lineWidth = 1.2;
    for(let i=0;i<5;i++){
      const y = -92+i*10-tip*.65;
      ctx.beginPath();ctx.moveTo(-58+i*3,y+13);ctx.quadraticCurveTo(-29,y-12,0,y+2);
      ctx.quadraticCurveTo(29,y-12,58-i*3,y+13);ctx.stroke();
    }
    for (const side of [-1,1]) for (const [i,[x,y]] of [[20,-147],[58,-137],[93,-114],[121,-80],[143,-41],[151,3],[156,49],[157,98]].entries()) {
      enamel(side*(x - (9-i)*change*1.8),y-tip*(1-i/9),i<2?36:39,i<3?43:46,side*(-i*.14),false,i>=3);
    }
    if (change > 0) points(-106,-62-tip,106,-62-tip);
  } else if(stage==="bite"){
    const shift=change*49;
    ctx.scale(study.variant % 2 ? 1 : -1,1);
    for(const row of [1,-1]){
      ctx.save();ctx.scale(1,row);ctx.translate(row===1?-shift:0,0);
      gum(()=>{
        ctx.moveTo(-155,-55);ctx.bezierCurveTo(-170,-99,-103,-126,-45,-104);
        ctx.quadraticCurveTo(21,-90,138,-107);ctx.quadraticCurveTo(161,-69,135,-46);
        ctx.bezierCurveTo(45,-44,10,-57,-42,-40);ctx.quadraticCurveTo(-100,-36,-155,-55);
      },-124,-28);
      enamel(55,-35,63,77,row===1?-.08:.08,false,true);
      ctx.restore();
    }
    if(change>.12){
      points(55-shift,-12,55-shift-42,-22);
      points(55,18,55+52,37);
    }
    ctx.restore();ctx.save();ctx.translate(width/2,height*.46);ctx.scale(scale,scale);ctx.globalAlpha*=alpha;
    ctx.textAlign="center";ctx.fillStyle="#5c5a55";ctx.font="11px monospace";
    ctx.fillText(change>.7?"UPPER CUSP INSIDE LOWER":"POSTERIOR CROSS-SECTION",0,131);
  } else {
    const smile = stage === "smile", spacing = smile ? 30 : 43;
    const gap = smile ? 18 + change * 18 : 14;
    if (smile) {
      ctx.translate(0,114);
      ctx.scale(.67,.55);
      gum(() => {
        ctx.moveTo(-190,0);ctx.bezierCurveTo(-125,-52,125,-52,190,0);
        ctx.bezierCurveTo(128,91,-128,91,-190,0);
      },-65,80);
      ctx.fillStyle="#5c524b";
      ctx.beginPath();ctx.ellipse(0,12,169,32,0,0,Math.PI*2);ctx.fill();
    } else {
      for(const side of [-1,1]){
        ctx.save();ctx.scale(1,side);
        gum(()=>{
          ctx.moveTo(-218,-26);ctx.quadraticCurveTo(-202,-123,0,-110);
          ctx.quadraticCurveTo(201,-125,218,-27);ctx.quadraticCurveTo(0,20,-218,-26);
        },-125,-9);
        ctx.restore();
      }
    }
    for (const row of [1,-1]) {
      for(let i=-4;i<=4;i++){
        const overlap=stage==="crowding" && row===1 && Math.abs(i)<=1 ? change : 0;
        const x=i*spacing + overlap*(i===0?10:-i*6);
        const y=row===1 ? -gap/2+Math.abs(i)**2*(smile?.95:1.65) : gap/2+9-Math.abs(i)*1.4;
        if (!smile || row===1 || Math.abs(i)<3)
          enamel(x,y,spacing*(Math.abs(i)>2?.88:.98),smile?29:54,i*.044+(i===0?-.28:i*.13)*overlap,row===-1,Math.abs(i)>2);
      }
    }
    if(stage==="crowding"&&change>.1)points(10,3,63,87);
    if(smile){
      ctx.strokeStyle="#f8f5eecc";ctx.lineWidth=2.4;
      points(-148+change*14,11,-181,35);points(148-change*14,11,181,35);
    }
  }
  if (stage !== "smile") {
    const step = stage === "arch" ? 1 : stage === "bite" ? 2 : 3;
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillStyle="#33332f";ctx.font="500 18px system-ui";
    ctx.fillText(stage === "arch" ? "Upper arch" : stage === "bite" ? "Posterior bite" : "Incisor crowding",0,194);
    for(let i=1;i<=3;i++){
      ctx.fillStyle=i<=step?"#3b3b37":"#eae9e4";
      ctx.beginPath();ctx.arc((i-2)*32,229,i===step?10.5:9,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=i<=step?"#fff":"#555";ctx.font="10px monospace";
      ctx.fillText(String(i),(i-2)*32,229);
    }
  }
  ctx.restore();
}

// Mirrors the native Progress screen's viewport, gauge and area mosaic. The
// homepage, editor preview and exports all use this painter.
export const mockProgressSize = { width: 390, height: 844 };
export type ProgressMetric = {
    id: string;
    title: string;
    score: number;
    maximum: number;
    color: string;
};
export type MockProgress = {
    score: number;
    date: string;
    metrics: ProgressMetric[];
    scroll: number;
};
export const sampleProgress: MockProgress = {
    score: 7.2, date: 'October 28', scroll: 0,
    metrics: [
        { id: 'skin', title: 'Skin', score: 7, maximum: 10, color: '#bca1db' },
        { id: 'eyes', title: 'Eyes', score: 7.8, maximum: 10, color: '#e4ad59' },
        { id: 'jaw', title: 'Jaw & chin', score: 7.4, maximum: 10, color: '#91c5a1' },
        { id: 'brows', title: 'Brows', score: 7.1, maximum: 10, color: '#ff6800' },
        { id: 'cheeks', title: 'Cheekbones', score: 7.3, maximum: 10, color: '#a58bef' },
        { id: 'symmetry', title: 'Symmetry', score: 7.5, maximum: 10, color: '#e4ad59' },
    ],
};
const font = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const ink = '#f6f7fa', muted = '#848b97';
const clamp = (value: number, max = 10) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
export function progressHistory(metric: Pick<ProgressMetric, 'score' | 'maximum'>) {
    return [0.9, 0.94, 0.93, 0.98, 1].map(factor => Math.round(clamp(metric.score * factor, metric.maximum) * 10) / 10);
}
export const mockProgressScrollMax = 890;
export function drawMockProgress(ctx: CanvasRenderingContext2D, data: MockProgress, width: number, height: number, time: number, entryTime: (id: string, top: number, height: number) => number = () => time) {
    const w = 390, h = 844;
    const revealAt = (id: string, top: number, height: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, entryTime(id, top, height)) / 1200), 3);
    ctx.save();
    ctx.scale(width / w, height / h);
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 49, w, h - 136);
    ctx.clip();
    ctx.translate(0, -clamp(data.scroll, mockProgressScrollMax));
    text(ctx, 'Progress', 22, 65, 30, 700);
    box(ctx, 292, 63, 76, 38, 19, '#1a1d22');
    text(ctx, 'New', 324, 75, 14, 700);
    stroke(ctx, [[305, 82], [315, 82]], ink);
    stroke(ctx, [[310, 77], [310, 87]], ink);
    drawProgressGauge(ctx, clamp(data.score) * revealAt('overall', 126, 270), 22, 126, 346);
    text(ctx, `Last Evaluation: ${data.date}`, 24, 408, 12, 400, '#767f8b');
    text(ctx, '↗', 352, 408, 14, 500, '#737b85');
    ctx.strokeStyle = '#ffffff1d';
    ctx.lineWidth = .7;
    ctx.beginPath();
    ctx.moveTo(22, 450);
    ctx.lineTo(368, 450);
    ctx.stroke();
    text(ctx, 'Your face', 22, 479, 21, 600);
    const y = 522;
    let cursor = y;
    data.metrics.forEach((metric, index) => {
        const position = index % 6, wide = position === 2 || position === 5;
        const x = wide ? 22 : position === 1 || position === 4 ? 201 : 22;
        const cardWidth = wide ? 346 : 167, cardHeight = position === 5 ? 140 : 226;
        const reveal = revealAt(`metric:${index}`, cursor + (position === 5 ? 56 : 130), position === 5 ? 62 : 90);
        ctx.save();
        box(ctx, x, cursor, cardWidth, cardHeight, 22, '#0c0f12', `${metric.color}1c`);
        ctx.beginPath();ctx.roundRect(x, cursor, cardWidth, cardHeight, 22);ctx.clip();
        const glow = ctx.createRadialGradient(x, cursor + cardHeight, 0, x, cursor + cardHeight, Math.min(cardWidth, cardHeight) * .9);
        glow.addColorStop(0, `${metric.color}58`);glow.addColorStop(.3, `${metric.color}18`);glow.addColorStop(1, `${metric.color}00`);
        ctx.fillStyle = glow;ctx.fillRect(x, cursor, cardWidth, cardHeight);
        text(ctx, metric.title, x + 18, cursor + 18, 14, 500);
        text(ctx, clamp(metric.score, metric.maximum).toFixed(1), x + 18, cursor + 48, 40, 500);
        text(ctx, `/ ${metric.maximum}`, x + 83, cursor + 72, 11, 500, '#9daab5');
        const history = progressHistory(metric), change = history.at(-1)! - history[0];
        text(ctx, `+${change.toFixed(1)} from baseline`, x + 18, cursor + 96, 11, 400, '#9daab5');
        if (position === 0 || position === 3) {
            const centerX = x + cardWidth * (position === 0 ? .66 : .5), centerY = cursor + 220;
            ctx.strokeStyle = `${metric.color}65`;ctx.lineWidth = .8;
            for (const radius of position === 0 ? [24,45,66,87] : [35,51,64]) {
                ctx.beginPath();ctx.arc(centerX, centerY, radius, Math.PI, Math.PI * (position === 0 ? 3 : 2));ctx.stroke();
            }
            const angle = Math.PI + (metric.score / metric.maximum) * Math.PI * reveal, radius = 64;
            const point = [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
            stroke(ctx, [[centerX, centerY], point], metric.color);
            ctx.fillStyle = metric.color;ctx.beginPath();ctx.arc(point[0],point[1],4,0,Math.PI*2);ctx.fill();
        } else if (position === 1) {
            history.forEach((score, index) => {
                const bar = (16 + score * 7) * reveal;
                box(ctx, x + 18 + index * 24, cursor + 210 - bar, 12, bar, 4, index === 4 ? '#c9b8d9' : '#a795c460');
            });
        } else if (position === 5) {
            drawTrend(ctx, history, x + 173, cursor + 56, cardWidth - 191, 62, metric.color, reveal, metric.maximum);
        } else {
            drawTrend(ctx, history, x + 18, cursor + 130, cardWidth - 36, 70, metric.color, reveal, metric.maximum);
        }
        text(ctx, '↗', x + cardWidth - 30, cursor + 22, 13, 400, muted);
        ctx.restore();
        if (wide || position === 1 || position === 4)
            cursor += cardHeight + 12;
    });
    cursor += 22;
    text(ctx, 'Your routine', 22, cursor, 21, 600);
    text(ctx, 'Small steps. Lasting progress.', 22, cursor + 34, 14, 400, muted);
    box(ctx, 22, cursor + 68, 346, 54, 27, '#1a1d22');
    text(ctx, 'Open your Protocol  →', 92, cursor + 85, 14, 600);
    ctx.restore();
    // The current native tab bar: no retired Battle or Leaderboard destinations.
    box(ctx, 8, 758, 374, 66, 33, '#15181de8', '#ffffff18');
    const tabs = ['Courses', 'Progress', 'Protocol', 'Evaluation'];
    tabs.forEach((title, i) => { const x = 14 + i * 93; if (i === 1)
        box(ctx, x, 764, 88, 54, 27, '#2a2e34'); drawTabIcon(ctx, i, x + 32, 770, i === 1 ? '#fff' : '#8a929e'); text(ctx, title, x + 44, 801, 10, 600, i === 1 ? '#fff' : '#8a929e', true); });
    text(ctx, '9:41', 33, 19, 15, 600);
    box(ctx, 133, 11, 124, 36, 18, '#000');
    for (let i = 0; i < 4; i++)
        box(ctx, 299 + i * 4, 30 - i * 3, 3, 4 + i * 3, 1, ink);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6;
    for (const radius of [4, 8, 12]) {
        ctx.beginPath();
        ctx.arc(333, 33, radius, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
    }
    ctx.strokeRect(350, 22, 23, 11);
    box(ctx, 352, 24, 18, 7, 1, ink);
    box(ctx, 374, 25, 2, 5, 1, ink);
    box(ctx, 128, 832, 134, 5, 3, '#fff');
    ctx.restore();
}
export function drawProgressGauge(ctx: CanvasRenderingContext2D, score: number, x: number, y: number, size: number) {
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i <= 50; i++) {
        const a = (144 + i / 50 * 252) * Math.PI / 180, outer = size * .43, inner = outer - size * (i % 5 === 0 ? .065 : .032);
        ctx.strokeStyle = i / 50 <= score / 10 ? '#dce2e8' : '#64707c';
        ctx.lineWidth = size * .005;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(size / 2 + Math.cos(a) * inner, size * .47 + Math.sin(a) * inner);
        ctx.lineTo(size / 2 + Math.cos(a) * outer, size * .47 + Math.sin(a) * outer);
        ctx.stroke();
    }
    const angle = (144 + score / 10 * 252) * Math.PI / 180;
    ctx.strokeStyle = '#d9ba8d';
    ctx.lineWidth = size * .012;
    ctx.beginPath();
    ctx.moveTo(size / 2 + Math.cos(angle) * size * .355, size * .47 + Math.sin(angle) * size * .355);
    ctx.lineTo(size / 2 + Math.cos(angle) * size * .445, size * .47 + Math.sin(angle) * size * .445);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(angle) * size * .456, size * .47 + Math.sin(angle) * size * .456, size * .006, 0, Math.PI * 2);
    ctx.fill();
    const scoreSize = size * 65 / 365, unitSize = size * 19 / 365;
    ctx.font = `500 ${scoreSize}px ${font}`;
    const scoreWidth = ctx.measureText(score.toFixed(1)).width;
    ctx.font = `400 ${unitSize}px ${font}`;
    const groupWidth = scoreWidth + 7 + ctx.measureText('/ 10').width;
    text(ctx, score.toFixed(1), (size - groupWidth) / 2, size * .34, scoreSize, 500);
    text(ctx, '/ 10', (size - groupWidth) / 2 + scoreWidth + 7, size * .34 + scoreSize - unitSize - 2, unitSize, 400, '#8d98a6');
    text(ctx, 'Overall score', size / 2, size * .34 + size * 75 / 365 + 4, size * 15 / 365, 400, '#9ba5b2', true);
    ctx.restore();
}
function drawTrend(ctx: CanvasRenderingContext2D, points: number[], x: number, y: number, w: number, h: number, color: string, reveal: number, max: number) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 3, y - 3, (w + 6) * reveal, h + 6);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    points.forEach((score, i) => { const px = x + i / (points.length - 1) * w, py = y + h - score / max * h; if (i === 0)
        ctx.moveTo(px, py);
    else {
        const prev = y + h - points[i - 1] / max * h, mid = px - w / (points.length - 1) / 2;
        ctx.bezierCurveTo(mid, prev, mid, py, px, py);
    } });
    ctx.stroke();
    ctx.restore();
}
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = .8;
    ctx.stroke();
} }
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, weight = 500, color = ink, center = false) { ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = center ? 'center' : 'left'; ctx.fillText(value, x, y); ctx.textAlign = 'left'; }
function stroke(ctx: CanvasRenderingContext2D, points: number[][], color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
}
function drawTabIcon(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    if (index === 0) {
        stroke(ctx, [[2, 3], [10, 3], [12, 5], [14, 3], [22, 3], [22, 20], [14, 20], [12, 22], [10, 20], [2, 20], [2, 3]], color);
        stroke(ctx, [[12, 5], [12, 22]], color);
    }
    if (index === 1) {
        stroke(ctx, [[2, 2], [2, 21], [23, 21]], color);
        stroke(ctx, [[5, 15], [10, 10], [15, 13], [22, 4]], color);
    }
    if (index === 2)
        for (let row = 0; row < 2; row++)
            for (let col = 0; col < 2; col++) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(2 + col * 12, 2 + row * 12, 8, 8, 2);
                ctx.stroke();
            }
    if (index === 3) {
        stroke(ctx, [[5, 1], [16, 1], [21, 6], [21, 23], [5, 23], [5, 1]], color);
        stroke(ctx, [[16, 1], [16, 6], [21, 6]], color);
        stroke(ctx, [[9, 12], [17, 12]], color);
        stroke(ctx, [[9, 17], [17, 17]], color);
    }
    ctx.restore();
}

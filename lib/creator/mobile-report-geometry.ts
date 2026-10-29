// Geometry and style selection from mogging-mobile/src/lib/metric-timeline.ts.
export type RubricVisual = { kind: string; scale?: string; positions: number[]; grade: number | null; maximum?: number; axis?: { maximum: number; unit: '%' }; triangulation?: import('./mobile-overlay-engine/triangulation').Triangulation };
import { triangulationDefinition } from './mobile-overlay-engine/triangulation';

export type TimelineStyle = 'linear' | 'arc' | 'balanced' | 'segmented' | 'sparse' | 'sparse-arc' | 'psl' | 'triangulation' | 'dial' | 'tapered';
export type TimelineRailStyle = Exclude<TimelineStyle, 'triangulation'>;
export const timelinePalette = { ink: '#171d23', muted: '#83909d', accent: '#32b1ed', warm: '#ed982b' };

export function timelineStyle(metricId: string, label = '', orbit = false): TimelineStyle {
  const description = `${metricId} ${label}`.toLowerCase();
  if (/psl/.test(description)) return 'psl';
  if (metricId === 'overall.eyes') return 'arc';
  if (['cheeks.height', 'symmetry.eyes-height', 'skin.texture', 'jaw.height', 'eyes.opening'].includes(metricId)) return 'dial';
  if (['cheeks.midface', 'symmetry.chin-axis', 'face.frame', 'brows.length'].includes(metricId)) return 'tapered';
  if (triangulationDefinition(metricId)) return 'triangulation';
  if (metricId === 'symmetry.eyes-opening') return 'sparse-arc';
  if (metricId === 'symmetry.brows-shape' || metricId === 'symmetry.lip-contour') return 'arc';
  if (metricId === 'symmetry.nose-wings') return 'segmented';
  if (metricId === 'skin.tone') return 'sparse';
  if (metricId === 'skin.under-eye-contrast') return 'balanced';
  if (/symmetr|balance|harmon|spacing|ratio|alignment|angle.coordination/.test(description)) return 'balanced';
  if (/jaw.angle|brow.arch|projection/.test(description)) return 'sparse-arc';
  if (/angle|tilt|rotation|slope|convex|corner.position/.test(description)) return 'arc';
  if (/width|proportion|facial thirds/.test(description)) return 'balanced';
  if (/cheek|zygomatic/.test(description)) return 'balanced';
  if (/skin|texture|smooth|tone|condition|hair|density|coverage|groom/.test(description)) return 'segmented';
  if (/height|length|distance|opening/.test(description)) return 'linear';
  if (/jaw|chin|taper/.test(description)) return 'sparse-arc';
  if (/brow|eye|lid|curv/.test(description)) return 'arc';
  if (/overall score|potential/.test(description) || metricId === 'overall') return 'sparse';
  return orbit ? 'arc' : 'linear';
}

export function timelinePositions(visual: RubricVisual, locked = false, style?: TimelineStyle): number[] {
  if (locked) return [];
  const positions = visual.kind === 'Rail'
    ? visual.grade === null ? visual.positions : [visual.grade / 10]
    : visual.positions;
  const valid = positions.filter(Number.isFinite).map(position => Math.max(0, Math.min(1, position)));
  return style === 'psl' ? valid.filter(position => position >= 1 / 8).map(position => (position * 8 - 1) / 7) : valid;
}

export function timelinePoint(position: number, width: number, style: TimelineRailStyle) {
  'worklet';
  const usable = Math.max(0, width - 20);
  if (style === 'dial') {
    const radius = Math.max(0, width / 2 - 14);
    const angle = Math.PI * (.75 + position * 1.5);
    return {
      x: width / 2 + Math.cos(angle) * radius,
      y: radius + 14 + Math.sin(angle) * radius,
      rotation: angle + Math.PI / 2,
    };
  }
  const curved = style === 'arc' || style === 'sparse-arc';
  if (!curved) return { x: 10 + usable * position, y: 16, rotation: 0 };
  const sweep = style === 'sparse-arc' ? 1.1 : 1.85;
  const angle = (position - .5) * sweep;
  const radius = usable / 2 / Math.sin(sweep / 2);
  return {
    x: width / 2 + Math.sin(angle) * radius,
    y: 14 + (1 - Math.cos(angle)) * radius * .65,
    rotation: Math.atan2(.65 * Math.sin(angle), Math.cos(angle)),
  };
}

export function timelineGeometry(width: number, style: TimelineRailStyle) {
  const sparse = style === 'sparse' || style === 'sparse-arc' || style === 'psl' || style === 'tapered' || style === 'dial';
  const curved = style === 'arc' || style === 'sparse-arc';
  const count = style === 'psl' ? 14 : style === 'dial' ? 40 : style === 'tapered' ? 20 : sparse || style === 'segmented' ? 10 : 20;
  const majorLength = style === 'dial' ? Math.min(28, width * .09) : curved ? 25 : 32;
  const ticks = Array.from({ length: count + 1 }, (_, index) => {
    const point = timelinePoint(index / count, width, style);
    const major = style === 'dial' ? index % 4 === 0 : sparse ? index % 2 === 0 : index % (count / 10) === 0;
    if (style === 'psl' || style === 'tapered') {
      const length = 11 + Math.pow(1 - index / count, .8) * 21;
      return { ...point, start: { x: point.x, y: 48 - length - (major ? 4 : 0) },
        end: { x: point.x, y: 48 + (major ? 5 : 0) }, weight: 2.8 };
    }
    const length = major ? majorLength : majorLength * .48;
    const start = style === 'balanced' ? -length / 2 + majorLength / 2 : 0;
    const end = start + length;
    return {
      ...point,
      start: { x: point.x - Math.sin(point.rotation) * start, y: point.y + Math.cos(point.rotation) * start },
      end: { x: point.x - Math.sin(point.rotation) * end, y: point.y + Math.cos(point.rotation) * end },
      weight: style === 'dial' ? 2.6 : sparse || style === 'segmented' ? 3.4 : 2.2,
    };
  });
  return { ticks, majorLength, sparse, height: Math.ceil(Math.max(...ticks.flatMap(tick => [tick.start.y, tick.end.y])) + 14) };
}

export function timelineAxisLabels(width: number, style: TimelineRailStyle, visual: RubricVisual) {
  if (style === 'psl') return Array.from({ length: 8 }, (_, index) => ({
    text: String(index + 1), x: timelinePoint(index / 7, width, style).x, y: 59,
  }));
  const geometry = timelineGeometry(width, style);
  const maximum = visual.axis?.maximum ?? (visual.scale === 'quality' ? visual.maximum ?? 10 : 1);
  const divisions = style === 'dial' ? 5 : visual.axis ? 5 : maximum === 8 ? 4 : geometry.sparse ? 5 : 10;
  return Array.from({ length: divisions + 1 }, (_, index) => {
    const position = index / divisions;
    const point = timelinePoint(position, width, style);
    return {
      text: `${Number((position * maximum).toFixed(2))}${visual.axis?.unit ?? ''}`,
      x: point.x - Math.sin(point.rotation) * (geometry.majorLength + (style === 'dial' ? 14 : 0)),
      y: point.y + Math.cos(point.rotation) * (geometry.majorLength + (style === 'dial' ? 14 : 0)) + (style === 'dial' ? -5 : 5),
    };
  });
}

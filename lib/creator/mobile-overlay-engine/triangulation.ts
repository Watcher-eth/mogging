export type Triangulation = {
  maximum: number;
  unit: '/10' | '%' | '×';
  axes: { id: string; label: string; value: number | null }[];
};

const structure = {
  source: 'grade', maximum: 10, unit: '/10',
  axes: [{ id: 'cheeks.height', label: 'Height' }, { id: 'cheeks.width', label: 'Width' }, { id: 'cheeks.midface', label: 'Midface' }],
} as const;
const symmetry = {
  source: 'value', maximum: 5, unit: '%',
  axes: [{ id: 'symmetry.chin-axis', label: 'Midline' }, { id: 'symmetry.jaw-outline', label: 'Jaw' }, { id: 'symmetry.cheek-outline', label: 'Cheeks' }],
} as const;
const widths = {
  source: 'value', maximum: 1, unit: '×',
  axes: [{ id: 'face.forehead-width', label: 'Forehead' }, { id: 'jaw.width', label: 'Jaw' }, { id: 'face.temple-width', label: 'Temples' }],
} as const;

export function triangulationDefinition(metricId: string) {
  if (metricId === 'overall.cheeks') return structure;
  if (metricId === 'symmetry.cheek-outline' || metricId === 'symmetry.jaw-outline') return symmetry;
  if (metricId === 'proportions.width-hierarchy') return widths;
  return null;
}

export function reportTriangulation(metricId: string, entries?: ReadonlyMap<string, { value?: unknown; grade?: unknown }>): Triangulation | undefined {
  const definition = triangulationDefinition(metricId);
  if (!definition) return undefined;
  const axes = definition.axes.map(axis => {
    const value = entries?.get(axis.id)?.[definition.source];
    return { ...axis, value: typeof value === 'number' && Number.isFinite(value) && value >= 0 && (definition.source !== 'grade' || value <= 10) ? value : null };
  });
  if (entries && axes.some(axis => axis.value === null)) return undefined;
  const maximum = Math.max(definition.maximum, ...axes.map(axis => Math.ceil((axis.value ?? 0) / definition.maximum) * definition.maximum));
  return { axes, maximum, unit: definition.unit };
}

export function triangulationValue(value: number, unit: Triangulation['unit']) {
  return `${value.toFixed(unit === '×' ? 2 : 1)}${unit === '/10' ? ' /10' : unit}`;
}

const triangleScale = .76;
const triangleInset = 64;
const triangleTop = 64;
const readoutGap = 24;
const readoutHeight = 48;
export const triangulationLayout = {
  aspectRatio: 2 / (Math.sqrt(3) * triangleScale),
  paddingBottom: Math.ceil(triangleTop + readoutGap + readoutHeight - triangleInset * triangleScale * Math.sqrt(3) / 2),
};

export function triangulationGeometry(width: number) {
  const radius = Math.max(0, (width - triangleInset) / Math.sqrt(3)) * triangleScale;
  const center = { x: width / 2, y: triangleTop + radius };
  const vertices = [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6].map(angle => ({
    x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius,
  }));
  const ticks = vertices.flatMap(vertex => {
    const delta = { x: vertex.x - center.x, y: vertex.y - center.y };
    const length = Math.max(1, Math.hypot(delta.x, delta.y));
    return Array.from({ length: 5 }, (_, index) => {
      const position = (index + 1) / 5;
      const point = { x: center.x + delta.x * position, y: center.y + delta.y * position };
      const half = index === 4 ? 5 : 2.5;
      return {
        start: { x: point.x - delta.y / length * half, y: point.y + delta.x / length * half },
        end: { x: point.x + delta.y / length * half, y: point.y - delta.x / length * half },
      };
    });
  });
  const readoutTop = triangleTop + radius * 1.5 + readoutGap;
  return { center, vertices, ticks, readoutTop, height: Math.ceil(readoutTop + readoutHeight) };
}

const pointStart = .16;
const pointStagger = .18;
const pointTravel = 1 - pointStart - pointStagger * 2;

export function triangulationEntry(progress: number, index: number) {
  'worklet';
  return Math.max(0, Math.min(1, (progress - pointStart - index * pointStagger) / pointTravel));
}

export function triangulationPoint(center: { x: number; y: number }, vertex: { x: number; y: number }, position: number) {
  'worklet';
  const bounded = Math.max(0, Math.min(1, position));
  return { x: center.x + (vertex.x - center.x) * bounded, y: center.y + (vertex.y - center.y) * bounded };
}

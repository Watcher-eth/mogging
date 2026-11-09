import { videoThemeContext } from "./video-theme";
import {
  drawReportComponent,
  mockFeatureLayout,
  loadMockReportSymbols,
} from "./mock-report";
import { createCanvasPainter } from "./canvas-layout";
import { loadCreatorBrand, drawBrandLockup, type CreatorBrand } from "./brand";
import type { ContentSlide } from "./content-generator";
import type { SculptureScript } from "./cephra-scripts";
import { sculptureEase } from "./cephra-study";
import { reportCategories } from "./mock-report-data";
import { loadShareFont } from "./legacy-posters";

/** Select a metric discussed by the script, never the general portrait/score hero. */
export function sculptureReportMetric(categoryId: string) {
  return categoryId === "jaw"
    ? "jaw.width"
    : categoryId === "mouth"
      ? "mouth.philtrum"
      : "overall.proportions";
}
export async function prepareSculptureReport(
  script: SculptureScript,
): Promise<SculptureReport> {
  const category = reportCategories.find(
    (report) => report.id === script.categoryId,
  )!;
  const [brand] = await Promise.all([
    loadCreatorBrand(),
    loadMockReportSymbols(),
    loadShareFont(),
  ]);
  const slide: ContentSlide = {
    id: "cephra-app-proof",
    templateId: "mock-report",
    imageId: "",
    categoryId: category.id,
    eyebrow: "",
    headline: "",
    supportingCopy: "",
    metricLabel: category.title,
    metricValue: String(category.score),
    cta: "Get your face analysis.",
    currentScore: "",
    potentialScore: "",
    potentialScale: 8,
    potentialCurrentScore: undefined,
    categoryScores: [],
    mockReport: { category, scroll: 0 },
  };
  return {
    slide,
    brand,
    focusMetricId: script.reportMetricId ?? sculptureReportMetric(category.id),
  };
}
export type SculptureReport = {
  slide: ContentSlide;
  brand: CreatorBrand;
  focusMetricId: string;
};
export function drawSculptureReport(
  ctx: CanvasRenderingContext2D,
  report: SculptureReport,
  time: number,
  width: number,
  height: number,
  reduced = false,
  theme: "light" | "dark" = "light",
) {
  ctx = videoThemeContext(ctx, theme);
  const enter = reduced ? 1 : sculptureEase(time / 900);
  const focus = reduced ? 1 : sculptureEase((time - 900) / 1400);
  const category = report.slide.mockReport!.category;
  const layout = mockFeatureLayout(category);
  const focused =
    layout.tiles.find((tile) => tile.feature.id === report.focusMetricId) ??
    layout.tiles[0];
  const unit = width / 390;
  const gridTop = height * 0.19;
  const scroll = Math.max(0, (focused?.top ?? 0) - 80);
  const selectedId = focused ? `feature:${focused.feature.id ?? category.features.indexOf(focused.feature)}` : 'category-score';
  ctx.save();
  ctx.globalAlpha *= enter;
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#242424";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${width * 0.034}px -apple-system,sans-serif`;
  ctx.fillText(category.title + " · Your report", width * 0.07, height * 0.135);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, height * 0.18, width, height * 0.54);
  ctx.clip();
  const paint = createCanvasPainter((node) =>
    node.id === selectedId
      ? {
          lift: {
            amount: focus,
            viewport: {
              x: width * 0.04,
              y: height * 0.19,
              width: width * 0.92,
              height: height * 0.51,
            },
          },
          shadow: { color: `rgba(0,0,0,${focus * 0.08})`, blur: 24, y: 6 },
        }
      : node.id.startsWith("feature:") && !node.id.includes("/")
        ? { opacity: 1 - focus * 0.55 }
        : {},
  );
  // The focused native card paints last so its shared-element growth stays above its neighbours.
  if (!focused) drawReportComponent(
    ctx, report.slide, {id:'category-score',label:category.title,x:18,y:0,width:354,height:116},
    {x:18*unit,y:gridTop,width:354*unit,height:116*unit},1,paint,
  );
  const tiles = focused ? [...layout.tiles.filter((tile) => tile !== focused), focused] : [];
  for (const tile of tiles) {
    const id = `feature:${tile.feature.id ?? category.features.indexOf(tile.feature)}`;
    const region = {
      id,
      label: tile.feature.label,
      x: tile.x,
      y: tile.top,
      width: tile.width,
      height: tile.height,
      showVisual: tile.showVisual,
    };
    const frame = {
      x: tile.x * unit,
      y: gridTop + (tile.top - scroll) * unit,
      width: tile.width * unit,
      height: tile.height * unit,
    };
    drawReportComponent(
      ctx,
      report.slide,
      region,
      frame,
      reduced ? 1 : sculptureEase((time - 150) / 900),
      paint,
    );
  }
  ctx.restore();
  const fade = ctx.createLinearGradient(0, height * 0.67, 0, height * 0.76);
  fade.addColorStop(0, "rgba(250,250,250,0)");
  fade.addColorStop(1, "#fafafa");
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.67, width, height * 0.1);
  ctx.restore();
}

/** Paint after the caption blur so the app invitation remains legible. */
export function drawSculptureReportInvitation(
  ctx: CanvasRenderingContext2D,
  report: Pick<SculptureReport, "brand">,
  time: number,
  width: number,
  height: number,
  reduced = false,
  theme: "light" | "dark" = "light",
) {
  ctx = videoThemeContext(ctx, theme);
  ctx.save();
  ctx.globalAlpha *= reduced ? 1 : sculptureEase((time - 500) / 700);
  drawBrandLockup(
    ctx,
    report.brand,
    width * 0.2,
    height * 0.7,
    width * 0.6,
    "#262626",
  );
  ctx.restore();
}

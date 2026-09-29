# Desktop mock reports

Mock reports now offers iPhone and Desktop formats. Desktop generation opens a full-viewport analysis report and requests native browser fullscreen when supported; a denied or unsupported Fullscreen API keeps the full-viewport dialog usable. Escape, Back to editor and New analysis return to the editor without discarding inputs. The last generated report can be reopened.

The real analysis page and desktop mocks share `AnalysisReport`, its feature cards, category sidebar, score slab, report actions, `ReportImagePanel`, and the application header. The real page retains its API loading, sharing and privacy actions. Mock controls use local state; their privacy checkbox never updates an account. Mock Share report downloads a PNG of the rendered DOM, including the canvas overlays, and omits the editor-return control.

Desktop exposes the analysis page's Explanation field. All eleven creator categories are available in the sidebar. Randomize fills every desktop category within the selected range, preserving the PSL cap; individual values remain editable. Generating snapshots the photo and category values, so later edits apply only after regeneration.

## Verification

- TypeScript and diff whitespace checks passed. Targeted ESLint reported only the existing `no-img-element` warning in `pages/analysis.tsx`.
- 37 existing creator generator/renderer tests passed.
- Local Chrome with a bundled model photo, real local landmark detection and mocked API responses; no production API writes.
- Verified native fullscreen dimensions, automatic generation, custom score/feature/explanation values, category switching, PNG download, return to editor, reopening and native fullscreen exit.
- Simulated a rejected Fullscreen API and verified the full-viewport fallback and Escape dismissal.
- Verified switching back to iPhone generation and a 390px viewport without horizontal overflow.
- Loaded the real `/analysis?analysisId=...` saved-report flow with a correctly enveloped mock response and verified its report cards and category navigation.
- Visually inspected the desktop mock, exported PNG and real analysis route. Sample PNG export was 2880 × 2000 from a 1440 × 1000 desktop viewport.

| Before | After | Why |
| --- | --- | --- |
| iPhone-only output | iPhone and fullscreen Desktop options | Allows creators to present either report format |
| Analysis UI lived inside its page | Shared report view and app header | Keeps mock and real desktop layouts consistent |
| Random values affected one displayed report category | Desktop randomization fills all categories | Keeps sidebar reports within the selected range |

Samples: `/tmp/desktop-mock-fullscreen.png`, `/tmp/desktop-mock-export.png`, `/tmp/desktop-mock-jaw.png`, `/tmp/desktop-analysis-regression.png`. No deployment performed.

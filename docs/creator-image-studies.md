# Portrait effects and illustrative image studies

One lazy, local WebGL painter owns portrait pixel changes: lighting, selective color and liquify. The canvas annotation renderer owns crisp glass contours and callouts. There are no stacked copies of the portrait or separate gradient-light painter. Preview, seeking and export use the same explicit timeline.

## Glass annotations

Portrait contours default to thin white dotted strokes at 0.78 opacity, with a restrained dark shadow for readability. Scene JSON accepts `portraitFX.overlay` with `pattern: "solid" | "dashed" | "dotted"`, `opacity`, `markers` and `regions`. Numbered rounded markers sample and blur the photograph behind them; their leaders attach to detected contours and avoid overlapping. Marker numbers are reference identities, not scores. Region polygons use detected forehead, cheek, nose and chin anchors and remain clipped to the facial boundary. Missing anatomy is omitted, not fabricated. Projected profile guides use the same glass stroke settings.

Symmetry and overall scenes use an eye-roll-aligned midline and paired spans with detected feature contours, rather than a generic forehead triangle. Proportions use registered horizontal reference levels; face shape uses width and jaw/cheek geometry; skin uses anatomical region boundaries without implying a diagnosis. Oblique photographs suppress frontal measurement comparisons. Lines grow from a point and retract over the final 300 ms; continued editorial operations share one clock rather than restarting at each sentence. Reduced motion keeps settled geometry.

Portraits use contained framing by default, including feature explanations and liquify edits. A category name or a `detail` template is not permission to crop the head. Only a deliberate inspect operation or explicit close-up/zoom narration enables a feature crop and detail-camera tracks. Photo edits preserve the full portrait and reserve space beneath the captions. White cutout stages feather their lower viewport edge without hiding the forehead or chin.

## Estimated portrait lighting

`portraitFX.lighting` controls a light over estimated facial depth. The shader derives approximate normals from a head dome, nasal bridge, cheek surfaces and orbital depressions, registered to the detected face. A cached subject alpha matte preserves the actual hair silhouette and background. Exposure works in linear light with restrained specular response and highlight roll-off. This is **2.5D editorial relighting**, not a physically recovered face: baked-in shadows, missing detail, occlusions and true cast shadows cannot be recovered from one photograph.

Settings:
- `preset`: `spot`, `rim`, or `split`.
- `target`: whole, eyes, nose, cheeks, jaw, mouth or hair; `side`: left, right or both (image coordinates).
- `ambientEv`: −3 to 0; `intensity`: 0 to 3; `radius`: 0.1 to 1.5.
- `lightX` / `lightY`: −2 to 2; `depth`: 0.1 to 3, in face-local coordinates.
- `color`: natural, selective (retain color near the light) or split-mono (one side grayscale).

The light eases into position and exposure over 1.2 seconds, without a continuously drifting decorative pulse. Light-only scenes do not automatically add contours; author an overlay when it explains the same point. Existing Marlon and Johnson lighting chapters use the new painter.

## Cursor-driven liquify

Portrait scenes accept `photoStudy`:
```json
{
  "feature": "nose",
  "amount": 0.2,
  "mode": "pinch",
  "axis": "x",
  "cursor": true
}
```

Features: nose, cheeks, face-width, jaw, eyes, lips and brows. Tools: pinch, stretch and drag; axes: x, y or both. Amounts are bounded to ±0.25. Positive pinches narrow, positive stretches expand, positive drags move along the selected image axes; negative amounts reverse the tool. Missing mode defaults to pinch for old projects.

Compact-support texture displacement leaves pixels outside the tool region unchanged. Paired anchors are edited sequentially: the cursor approaches, presses, follows the mathematically inverted pixel displacement, releases and travels to the next anchor. The edit holds, then restores the original. Detected feature contours remain visible: every contour sample, numbered marker, region boundary and measurement anchor is mapped through the exact same inverse displacement as the edited photograph. This annotation node remains independently targetable as `overlay`; it is rendered after the photo and before the cursor. No re-detection or approximate tracking is used. Reduced motion shows a stationary variation with matching outlines and no cursor. Regions account for source pixel aspect and reject unreliable anchors or strong yaw. Metric cards remain suppressed during edits; source image bytes and report scores never change. This is a restrained 2D illustration, not a generative edit, surgical prediction or reconstructed anatomy.

The scene editor exposes glass, lighting and liquify controls. Settings survive composition JSON, project ZIP and same-script recuts. Load **Portrait effects · Light, glass and proportion** for a full example with dotted brows, numbered markers, local pinch/stretch/drag, selective light, rim light and split grayscale. No external image service is used.

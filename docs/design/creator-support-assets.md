# Creator support artwork

Generated with the built-in ImageGen tool. Source PNGs remain in the Codex generated-images folder; optimized app assets live in `public/creator/support/`.

- `avatar.png` (256 px): a friendly sculptural chrome/silver faceless head wearing a minimal pearl-white support headset, based on the Mogging favicon; rounded polished contours, gentle reflections, no eyes/mouth/text, centered three-quarter bust on white, tiny ice-blue accent. Designed to read at 40 px.
- `submissions.png` (192 px): two ivory video cards with a graphite play triangle and small silver checkmark.
- `analytics.png` (192 px): three freestanding pearl-white/gray/graphite columns and a curved upward trend, restrained sky-blue accent.
- `cta.png` (192 px): an ivory megaphone with graphite rim and sky-blue handle.
- `rewards.png` (192 px): a soft graphite wallet and two pale-gold coins.

Shared prompt for the four transparent prompt icons: match the supplied Airbnb miniature object references; softly rounded sculpted forms, matte ceramic/rubber materials, restrained details, gentle isometric three-quarter view, soft ambient contact shadow, one centered object filling about 80% of the frame, transparent background, no card/tile, text, letters or outlines. Cream/graphite palette with restrained accents; readable at 44 px.

The portraits and quick-prompt artwork are presentation assets, independent of the assistant's model and account-data access.

| Before | After | Why |
| --- | --- | --- |
| Independently fixed support/setup controls | One stacked layout and one shared 208 × 48 px pill style | Equal padding and a persistent gap, including expanded setup |
| Flat sidebar entry and no backdrop | Restrained 420 ms spring curve, faster exit, white 4 px backdrop blur | Clear spatial continuity with reduced-motion guards |
| Left-aligned identity and generic logo | Centered custom portrait/name with glass controls and blue outgoing bubbles | Messages-style hierarchy without changing rich assistant answers |
| Generic outline prompt icons | Four matching miniature 3D objects | Follow the supplied visual references |

Verification: desktop and 390 px mobile browser checks, real sample prompt → private demo API → sample submissions → rich reply, focus return, expanded setup clearance and no document overflow. TypeScript and targeted lint pass; 69 existing support tests pass when executed in separate processes to avoid their shared mock contamination. Model-generated replies require `OPENROUTER_API_KEY` and were not exercised. The private development demo uses an isolated memory allowance, never the production creator allowance ledger.

# Desktop analysis flow map

## FaceIQ Labs reference

Observed in the signed-in browser with a mock profile and synthetic portraits:

| Screen | What the user sees and does |
| --- | --- |
| Welcome | Short introduction with back and continue. |
| Discovery | Select one acquisition source. |
| Referral | Enter an optional code or skip. |
| Gender and age | Select a gender, then complete a separate date-of-birth screen. |
| Location | Pick a country and city. Animated counts narrow the comparison group. |
| Background | Multi-select a background with optional additional detail. |
| Comparison summary | Animated counts combine the preceding answers into a cohort. |
| Consent | Required biometric-processing consent and a separate optional research choice. |
| Capture introduction | A brief transition into the two-photo process. |
| Front instructions | Three lessons. A camera-distance slider animates a comparison. Two short videos show the rear-camera setup and eye-level framing. |
| Front upload | Drag or pick an image, wait for centering, then review the crop or replace it. |
| Side instructions | A still good/bad comparison, then two short videos about a full profile and camera position. |
| Side upload | Drag or pick a profile, wait for crop validation, then continue. |
| Geometry loading | Animated processing text bridges capture and setup. |
| Setup | An introduction followed by appearance frequency, goal, preferred intervention level, timeline, and area of focus. |
| Plan comparison | Basic and Pro benefits shown side by side. |
| Social proof | A before-and-after carousel before prices. |
| Plan selection | Billing cadence, promo entry, feature comparison, paid options, and a free path. |
| Dashboard | Overview with pillar cards, front and side views, report history, detail links, and limited unlocked findings. |
| Analysis | Harmony with front and side ratios, plus separate Angularity, Dimorphism, and Features tabs. |
| Plan, Simulate, FaceGPT | Pro feature introductions. Their paid interactions were gated. |
| Compare | Opens the membership gate on the free plan. |

The [public getting-started guide](https://www.faceiqlabs.com/support/getting-started) also documents optional manual landmark correction. The [public photo guide](https://www.faceiqlabs.com/support/photos) explains the capture setup. This walkthrough followed the free route.

## Mogging desktop

| Stage | Implementation |
| --- | --- |
| Profile and privacy | Profile and age share a country-level population chart with a global fallback. Background is optional and stays in page memory. Photo processing is acknowledged before capture. |
| Photo entry | The front and side guides autoplay muted. Photo tips provide an interactive camera-distance ruler, an eye-level diagram, and the side lesson. |
| Review | Required front and side slots, framing controls, and a shared 4:5 portrait. The framing guide and saved crop use the same desktop viewport. |
| Report preview | The portrait carries into the scanner and report preview. A second original clip explains the front and side landmarks. |
| Plans | A moving selection outline and Torph benefits show the selected plan. Basic, Starter, and Pro all unlock the full report. |
| Checkout and account | Desktop guests pay through Stripe, then verify and sign in. The saved draft resumes into scan loading and the report. |
| Report and workspace | Reports open on Overall. The workspace puts history and feature cards on the desktop grid, and reuses the real desktop Protocol and Progress views. The workspace links reports back to their detail. |

The development walkthrough at `/analysis?preview=desktop&walkthrough=1` uses sample results and a simulated payment confirmation. It does not create a Stripe checkout or call the analysis service.

## Web subscription catalog

All prices are in USD. Basic and Starter release one scan at a time in four windows per month anchored to subscription start. Pro refreshes its monthly allowance at once.

| Plan | Billing | Scans per month | Protocol and tracking |
| --- | --- | --- | --- |
| Basic | $8.99 weekly | 4 | No |
| Starter | $17.99 monthly | 4 | No |
| Pro | $29.99 monthly | 8 | Yes |

Closing the membership paywall can reveal a one-time Starter offer with five minutes to open discounted checkout. Stripe bills $9.99 for the first month and $17.99 per month thereafter. An eligible creator code applies 10% off the first Pro invoice. Web analysis uses separate Stripe lookup keys from the native catalog.

Run `bun scripts/setup/web-analysis-stripe.ts` for the Stripe sandbox and pass `--live` with an authorized live credential to provision and verify the production catalog. The script validates the environment, product, amount, cadence, and coupon scope.

# Hero Video

Full-bleed background video (YouTube / mp4 / Scene7) with a centered teaser
overlay: eyebrow, title, description and optional CTA buttons.

## Authoring

Name the block **Hero Video** (with a space — it normalizes to `hero-video`).
Put the content in a single column:

| Hero Video |
|---|
| `https://…/video.mp4` (or a YouTube / Scene7 URL) — the background |
| Discover — eyebrow / subtitle (optional, a plain paragraph before the title) |
| **Title** — make it a Heading (H1–H4), or type `## Title` |
| Description paragraph (optional) |
| `詳しく見る` → a real **link** (Cmd+K) — becomes a CTA button (optional) |

Notes:
- The video URL is detected automatically and pulled out as the background.
- Title must be a heading. `## Title` / `# Title` plain text is auto-promoted.
- Links become CTA buttons: 1st = solid (MH red), 2nd = outline. `[text](url)`
  markdown is auto-converted, but the reliable way is the link button (Cmd+K).

## Variants

Add in parentheses after the name, comma-separated, e.g.
`Hero Video (full-width, tall)`.

| variant | effect |
|---|---|
| `full-width` | breaks out edge-to-edge (ignores content margins) |
| `short` | shorter hero — `min-height: clamp(300px, 45vh, 460px)` |
| `tall` | taller hero — `min-height: clamp(560px, 88vh, 900px)` |
| `contain` | show the whole video frame instead of cropping to fill |

Default (no variant): content width, centered, `clamp(420px, 70vh, 720px)` tall,
video cropped to cover.

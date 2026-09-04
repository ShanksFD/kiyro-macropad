# Session Handoff

## 1. Objective

Give the "Kiyro" macro pad configurator's hardware-preview visuals (encoder
knobs and keycaps in `src/features/device/`) a genuine 3D, physical-device
look — depth, lighting, and press feedback that reads as real hardware
rather than flat MUI cards. Work was driven iteratively against a standalone
HTML mockup rather than designed blind in the real components.

## 2. Current state

**Mockup (source of truth for the visual design), fully iterated and
approved by the user:**
`C:\Users\anass\AppData\Local\Temp\claude\c--Users-anass-Desktop-Files-Work-Kiyro-kiyro-macropad\5ba01e27-4cc0-465c-9412-4a4363caaaa5\scratchpad\kiyro-3d-preview.html`
This is a **scratchpad temp file** — not part of the repo, not durable
across machines/sessions. If it's gone, its finished state is fully
transcribed into code already (see below); nothing further depends on the
file itself surviving.

**Applied to the real app, both done and matching the mockup as of this
handoff:**
- **`src/features/device/encoder-dial.tsx`** — the knob previously had *no*
  glow at all (a plain bordered circle). Rebuilt to match the mockup:
  - `104×104` stage wrapping the `76×76` face, with an absolutely-positioned
    glow ring behind it (`2px solid primary.main` border + outer bloom +
    inset glow box-shadow), opacity `0.6` at rest → `1` + stronger shadow
    while `turningCw || turningCcw`.
  - Translucent bloom layer uses CSS `color-mix(in srgb, var(--mui-palette-primary-main) N%, transparent)` — **not** MUI's `-Channel` CSS-var
    convention (`--mui-palette-primary-mainChannel`), because that couldn't
    be confirmed to exist in this MUI version/config. `color-mix` works
    directly off the `var()` reference regardless, so it sidesteps the
    question entirely.
  - Face fill is a literal `#262d37` (picked by eye in the mockup against
    this app's actual background — no existing `device.*` token landed on
    the same shade), with the mockup's four-layer box-shadow (overhead
    light, weight shadow, inner rim highlight, inner underside shadow).
  - Indicator notch changed from a plain bar to a small white dot with a
    `primary.main`-tinted glow, so it reads as part of the same light
    source as the ring.
  - Removed: the decorative dashed inner ring, and the old
    bgcolor-swap-to-`device.keycapLive` on turning — neither exists in the
    mockup, where only the outer ring communicates turning state.
- **`src/features/device/key-cap.tsx`** — reworked to a "chiclet cap" look:
  rounder corners, a hard-edged inset top highlight, a solid-colour "wall"
  offset underneath (both derived per-accent via `darken`/`alpha` off
  `deviceDark[...]` — see the CSS-vars gotcha below), no ring on
  `selected` (now reuses the pressed/settled posture + a brightness lift
  instead of lift+scale+shadow-ring), no glow bloom on live/click (press
  motion only), and a faster/flatter transition (was springy + felt
  "laggy").
  **Note:** `borderRadius` in this file changed on disk mid-session outside
  of my own edits (`radius.xl` → back to `radius.lg`) — treated as a
  deliberate user edit and left alone, not reverted. Worth eyeballing
  whether that was intentional vs. a stray revert.
- **`src/theme/theme.ts`** — exported `deviceDark` (was module-private).
  Needed because with `cssVariables: true`, `theme.palette.device.*` (and
  `vars(theme).palette.device.*` — same thing) resolves to a
  `var(--mui-palette-device-*)` **string** at runtime, not a literal hex —
  fine for CSS properties MUI resolves directly, but `darken()`/`alpha()`
  from `@mui/material/styles` can't parse a `var()` reference and throw.
  `deviceDark` holds the literal values `colorSchemes.dark` is built from,
  so it's the correct escape hatch for "I need to compute a *new* color
  from a device token." **Only safe because this app currently defines a
  single (dark) color scheme** — if a light scheme is ever added, every
  call site reading `deviceDark` directly needs to become scheme-aware.

**Not done / not asked for:** no build, lint, typecheck, or app launch was
run to verify any of this — standing project instruction
(`CLAUDE.md` → "Working preferences") is to never do that unless asked, and
it wasn't asked. All verification so far has been the user opening the
mockup HTML file directly and eyeballing the real app themselves after each
change round.

## 3. Key decisions

- **Design iterated on a disposable HTML mockup first, ported to the real
  components last** — many small back-and-forth tweaks (highlight shape,
  glow removal, opacity, border-radius, hard vs. soft edges) happened
  entirely in the scratch HTML before "implement it" moved the finished
  design into `encoder-dial.tsx`/`key-cap.tsx`. If more visual iteration is
  wanted, the fastest path is probably back in a scratch HTML file first,
  *then* port — not iterating directly against the real MUI `sx` code.
- **Selection state, on both components, deliberately has no ring/outline
  border** — user explicitly said the ring-based selected state "looks
  bad" / "remove the outlines too." Selection now reads through
  posture (pressed-down) + brightness, not a drawn border. Don't
  reintroduce a selection ring without checking this first.
- **No glow-on-click / bloom effect** — user explicitly asked to remove it
  ("remove the glow when I click"). The `live` state on keycaps is press
  motion only now, no box-shadow bloom.
- **Per-accent wall/highlight colors are computed (`darken`/`alpha`), not
  hand-authored per color** — so a fourth accent color, if one is ever
  added, gets a matching wall/highlight for free rather than needing a new
  hardcoded shadow rule.

## 4. Important discoveries

- **The CSS-vars/`darken()` incompatibility (above) is a general trap in
  this codebase**, not a one-off bug — any future code that needs to feed a
  `theme.palette.*` color into a JS color-math function (`darken`, `alpha`,
  `lighten`, manual RGB math, etc.) will hit the same
  `Cannot read properties of undefined` / `Unsupported var(...) color`
  failure sequence. The fix pattern is: export the literal
  `colorSchemes.<mode>.palette` object being built (like `deviceDark`) and
  read from that, not from `theme.palette` / `vars(theme).palette`.
- **`color-mix()` is a safe, dependency-free way to derive a translucent
  variant of any `var()`-based CSS color** directly in an `sx` box-shadow
  string, without needing to know whether MUI generated a `-Channel`
  companion variable for that token. Reach for this over the
  `rgba(var(--foo-mainChannel) / alpha)` pattern unless the channel
  variable's existence has actually been confirmed for this MUI version.

## 5. Files and artifacts

- Mockup (scratch, not in repo — see caveat in §2):
  `...\scratchpad\kiyro-3d-preview.html`
- `src/features/device/encoder-dial.tsx` — knob visuals.
- `src/features/device/key-cap.tsx` — keycap visuals.
- `src/theme/theme.ts` — `deviceDark` now exported; `DevicePalette` type
  also exported (already was).
- `src/theme/tokens.ts` — untouched, but `radius.xl` vs `radius.lg` is the
  live open question on `key-cap.tsx`'s corner rounding (see §2 note).

## 6. Risks and uncertainties

- **Real-component visual state is unverified beyond code read-through** —
  no dev server was launched by me this session (per standing instruction).
  The user has been checking the real app themselves after each round; the
  last thing said was "still missing a lot to match this html," which was
  addressed with the encoder-dial rewrite above, but that specific round
  hasn't been confirmed fixed yet by the user.
- **`key-cap.tsx`'s `borderRadius` reverted on disk mid-session** outside
  my own edit — flagged above, not resolved either way.
- **The literal `#262d37` knob-face color and the computed
  `darken(faceColor, 0.35)` wall colors are eyeballed against the mockup's
  page background**, which is a plain dark page (`#0b0e12`), not
  necessarily identical to wherever these components actually render in
  the real app (behind other chrome, different ambient background). Worth
  a real visual check, not just trusting the port was faithful.

## 7. Next action

Wait for the user to check the real app against the mockup after the
encoder-dial rewrite and report back. If more mismatches turn up, prefer
diffing the specific CSS property in the mockup's `<style>` block against
the corresponding `sx` rule in `encoder-dial.tsx`/`key-cap.tsx` rather than
re-deriving the design from scratch — the mockup already encodes every
decision the user has approved.

## 8. Suggested skills

None of the currently available skills directly cover "port a finished HTML
mockup's CSS into MUI `sx` props." If further ground-up visual design
exploration is wanted (not just porting), `artifact-design` or
`ui-ux-pro-max` could be relevant starting points, but neither was used
this session — everything here was direct CSS/`sx` editing.

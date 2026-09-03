# Kiyro

A desktop configurator for programmable macro pads, built with Next.js and
packaged as an **Electron** app — connect the device, see keys light up as you
press them, assign actions, and have them actually happen on your computer.

The first supported device is an ESP32-C3 based 12-key macro pad with two rotary
encoders (VID `0x303A`, PID `0x1001`, USB Serial/JTAG).

---

## Requirements

- Node 20+
- Windows (the native-execution layer is Windows `SendInput` today; other
  platforms are future work — see "Execution" below).

## Commands

```bash
npm install
npm run electron:dev   # the app: next dev + the Electron window together
npm run dev             # just the Next.js dev server, in a browser tab (editing only, no hardware)
npm run build           # production build of the Next.js app (also type-checks)
npm run build:electron  # compiles electron/ (main process) to dist-electron/
npm run lint            # eslint, 0 errors expected
npm run typecheck       # tsc --noEmit (renderer)
npm run typecheck:electron  # tsc --noEmit -p electron/tsconfig.json (main process)
npm test                # vitest, no hardware required
npm run format          # prettier
```

Packaging is `electron-builder`, configured in `package.json`'s `build` block
— `npm run dist:win` produces a Windows installer under `dist-installer/`. See
"Releasing and auto-updates" below for how installs then stay current.

## First run without hardware

Kiyro ships a mock firmware so the whole UI can be exercised with nothing
plugged in:

1. **Settings → Advanced → Advanced mode** → on.
2. **Start simulator** (also available from the arrow next to _Connect Device_).
3. Open the serial console (terminal icon in the top bar) and use **Simulate**
   to emit button and encoder events, or to pull the virtual cable.

The simulator only reproduces behaviour that has been observed on real firmware:
it answers `HELLO` with `READY`, `PING` with `PONG`, and emits input events. It
runs entirely inside the renderer (no real port opened), so it never conflicts
with the main process holding the real one.

## Using a real device

1. `npm run electron:dev`.
2. Plug the macro pad in and close anything else holding the port — a serial
   monitor or another app will block Kiyro, and Kiyro will block them.
3. Press **Connect Device**. Electron's main process finds the pad by USB
   vendor/product id, opens it, and runs the handshake (`HELLO → READY`,
   `PING → PONG`). Only then does the UI report _Connected_.
4. Press a key: the matching cap lights up in the UI, and — if it has a
   binding — the action actually happens on your computer.

## Architecture

```
ESP32-C3  ──USB Serial──►  electron/serial-bridge.ts     Electron main process
                             └─ electron/resolve-control.ts    event → control → binding
                                  └─ electron/native-execution.ts   real keystrokes (win-sendinput.ts)
                                       │
                             IPC (electron/preload.ts, window.kiyro)
                                       │
                             src/stores/, src/features/, src/app/   Next.js renderer (UI mirror only)
```

Execution happens entirely inside the main process, off the serial port's
`data` event — it never round-trips through the renderer or depends on React
rendering. IPC only carries state *back* to the renderer, for the UI (live
highlight, debug console, execution chip); losing that never affects whether
a binding actually runs.

Rules the codebase holds to:

- **Raw protocol strings never leave `src/lib/protocol`.** Everything above it
  consumes typed `DeviceEvent`s and semantic control ids (`button-1`,
  `encoder-2-cw`), so a firmware remap does not invalidate saved profiles.
  This layer is framework-free and is imported unchanged by both the renderer
  and Electron's main process (`electron/tsconfig.json`).
- **The renderer never touches Node, the filesystem, or the serial port
  directly.** `contextIsolation: true`, `nodeIntegration: false` — the only
  door out is the typed `window.kiyro` bridge (`electron/preload.ts`).
- **Serial traffic does not drive React directly.** Real hardware is owned and
  read by the main process alone; the renderer only mirrors what it reports
  over IPC, via `use-app-bootstrap.ts`.
- **Capabilities drive the UI.** Anything the firmware cannot do is disabled
  with an explanation instead of being faked.

### Directory map

| Path                  | Contents                                                          |
| --------------------- | ------------------------------------------------------------------ |
| `electron`            | Main process: serial ownership, native execution, IPC, profile storage |
| `src/lib/electron`    | `window.kiyro` IPC contract — the only thing shared by name between main and renderer |
| `src/app`             | App Router routes; pages are thin server components               |
| `src/theme`           | Design tokens and the MUI theme (light + dark)                    |
| `src/lib/protocol`    | Wire constants, line buffer, parser, encoder, commands (imported unchanged by `electron/`) |
| `src/lib/serial`      | Transports, `DeviceSession`, domain errors — real hardware now goes through `electron/serial-bridge.ts` instead; `DeviceSession`/`MockSerialTransport` remain for simulated mode |
| `src/lib/devices`     | Device definitions, registry, event mapping, encoder steps (imported unchanged by `electron/`) |
| `src/lib/actions`     | Action model, key catalogue, presets, Zod schemas, labels          |
| `src/lib/profiles`    | Profile model, schema, factory, import/export                     |
| `src/lib/storage`     | The configuration-repository seam: `localStorage` (tests/fallback) or the Electron bridge (real app), picked by `profile-store.ts` |
| `src/stores`          | Zustand stores: device, editor, profiles, live input, UI          |
| `src/features`        | Feature UI: device visualiser, editor, profiles, debug             |
| `tests`               | Vitest suites — no hardware needed                                 |

## How configuration works

Host-side, the same as the manufacturer's application: the pad reports input
events, Kiyro decides what they mean, and profiles are stored by the browser.

```
Factory ESP32-C3  ──USB Serial──►  Kiyro  ──►  input event  ──►  binding  ──►  ActionExecutor
                                     │
                                     └──►  profiles  ──►  browser local storage
```

- **No firmware flashing.** Kiyro speaks only `HELLO`/`PING` plus the event
  stream the factory firmware already sends. It never sends `GET_CONFIG` or any
  other command the device cannot answer.
- **Profiles are local** (`LocalConfigurationRepository`) and survive reloads,
  browser restarts, and disconnecting or reconnecting the pad. Export gives you
  a versioned JSON file; import validates it with Zod.
- **`deviceConfigProtocol: false` is not a limitation to route around.** It
  states that configuration belongs to the host. The `ConfigurationRepository`
  seam is still there for a future device that can store its own.

### Execution is a separate capability

The device definition says `executionMode: 'host'` — the computer is supposed to
perform the action. Kiyro does **not** dispatch synthetic `KeyboardEvent`s to
make this look like it works from the renderer; only Electron's main process
actually presses keys.

Two `ActionExecutor` implementations exist, and the UI is honest about which
is active:

- `BrowserSandboxExecutor` (`src/lib/execution/executor.ts`) — what the
  renderer itself would use if it tried to execute anything. Always reports
  `{ status: 'unavailable', reason: 'browser-sandbox' }`, since a web page
  cannot send keystrokes, media keys or scrolling to other applications.
- `NativeActionExecutor` (`electron/native-execution.ts`) — Electron's main
  process. Runs entirely off the serial port's `data` event handler, ported
  from the VK tables and `SendInput` struct layout in
  `host/kiyro_host/execution.py` (the original, standalone-process proof of
  concept, kept as a reference). Keyboard, hotkey, media, volume, text, mouse
  and scroll are implemented; `system`/`application` explicitly report
  `unavailable` rather than silently no-op.

`deriveExecutionAvailability()` (`src/lib/execution/executor.ts`) combines
the Electron bridge's presence and device attachment into what the
Configure/Devices pages actually render, so the "not performed" notice
disappears the moment a pad is attached.

## Adding a new device

1. Create `src/lib/devices/<model>.ts` exporting a `DeviceDefinition`: USB ids,
   layout, buttons (with firmware event codes and a `MappingConfidence`),
   encoders, capabilities and serial filters.
2. Add it to `DEVICE_REGISTRY` in `src/lib/devices/registry.ts`.

Nothing else needs to change: the visualiser, the picker and the connection flow
all read the definition. Mark anything unconfirmed as `unverified` rather than
guessing — the UI renders that state honestly.

## Adding a new action type

1. Add the variant to the `Action` union (`src/lib/actions/types.ts`).
2. Add its Zod member (`src/lib/actions/schema.ts`).
3. Add availability, a default value and a category (`catalog.ts`).
4. Add a label in `describeAction` (`format.ts`) and an icon in
   `features/editor/action-icon.tsx`.
5. Add a form branch in `features/editor/action-forms.tsx`.

`ACTION_AVAILABILITY` decides whether the UI presents the type as usable or as
planned. Set it to `planned` until something can actually execute it.

## Testing

`npm test` covers protocol parsing and chunk reassembly, event → control
mapping, encoder step normalisation, action validation and labelling, profile
import/export, and integration tests over the mock transport (a factory pad
connects on the handshake alone, no configuration command is ever written to
the port, events reach the event layer). It runs against the renderer/Vitest
project only — `electron/` has no automated tests of its own; verify it by
running `npm run electron:dev` and pressing a physically bound key.

`host/` — the original standalone Python proof of concept this app's
`electron/native-execution.ts` was ported from — keeps its own `unittest`
suite; see [`../host/README.md`](../host/README.md#running-the-tests). It is
no longer part of the running app.

## Releasing and auto-updates

Installs check Kiyro's own GitHub Releases and can update in place — nobody
needs to be sent a new installer and reinstall by hand. Checking runs
automatically in the background; **downloading and installing an update are
both things the user does explicitly** (a chip in the sidebar once one's
found, or Help → Check for Updates… to ask on demand) — see
`electron/updater.ts` for the full reasoning.

This repo is private, and a private repo's release assets need
authentication to download at all — which means shipping a read-only GitHub
token inside every copy of the app. **Two separate tokens are involved; do
not conflate them:**

| | Scope needed | Lives where |
|---|---|---|
| **Publish token** (`GH_TOKEN`) | Write access to this repo (create the release, upload assets) | Only in your own shell, only when cutting a release. Never committed, never shipped. |
| **Runtime token** (`KIYRO_UPDATE_TOKEN`) | **Read-only**, scoped to only this repo (`Contents: Read-only`, fine-grained PAT) | Baked into every build by `scripts/generate-build-secrets.mjs` at build time (writes the gitignored `electron/update-token.ts`). Ships inside the app — extractable by anyone who receives it. |

The runtime token being extractable is an accepted tradeoff of "private repo,
no update server," not a bug: GitHub has no token scope narrower than
repo-content-read that still covers release assets, so there is no way to
authorize "downloads only." Give it an expiry and rotate it (issue a new one,
cut a new release built with it) before it expires — treat this the same way
you'd treat handing trusted friends read access to the repo, because that's
effectively what it is.

To cut a release:

```bash
GH_TOKEN=<write-scoped token>              # your shell only, this session
KIYRO_UPDATE_TOKEN=<read-only token>       # gets baked into the build
KIYRO_DISCORD_CLIENT_SECRET=<see below>    # only if shipping the Discord integration too
npm run dist:win:publish
```

`dist:win:publish` builds, then runs `electron-builder --win --publish
always`, which uploads the installer and its update metadata to a GitHub
Release tagged with `package.json`'s `version` — bump that first. Existing
installs pick it up on their next background check (or immediately, via Help
→ Check for Updates…).

**For local dev/testing, `.env.local` is more convenient than pasting these
every session** (see `.env.local.example`): copy it to `.env.local` (already
gitignored), fill in the real values, then once per PowerShell terminal
window:

```powershell
. .\scripts\load-env.ps1
```

That loads them as real `$env:` variables for the rest of that terminal
session — every `npm run ...` after it (`electron:dev`, `build:electron`,
`dist:win:publish`, ...) then sees them normally. Plain `node` never
auto-loads `.env` files the way `next dev`/`next build` do, which is why this
needs its own step. For an actual release, pasting the tokens explicitly (as
above) is arguably still the better habit — it means a stale or wrong secret
can never silently sit loaded in a forgotten terminal.

## Discord integration

`discord` actions (mute, deafen, mic volume up/down) talk directly to
Discord's own local app over its RPC protocol (`electron/discord-rpc.ts`) —
not a synthesized keystroke, an actual command to whichever Discord account
is signed in. The wire protocol itself is spoken from scratch (no
`discord-rpc` npm package, which is unmaintained); see that file's own doc
comment for the full handshake → authorize → token-exchange → authenticate
flow.

**One-time setup, before this feature does anything:**

1. Create a Discord application at
   [discord.com/developers/applications](https://discord.com/developers/applications).
2. Under **OAuth2**, copy the **Client ID** (already hardcoded in
   `discord-rpc.ts` as `CLIENT_ID` — update it there if you ever recreate the
   app) and the **Client Secret**.
3. Add `http://localhost` as a **Redirect URI** under OAuth2. It's never
   actually navigated to — the authorization code comes back over the local
   IPC pipe, not a browser redirect — but Discord still requires *a*
   registered URI to accept the token exchange.
4. Build with `KIYRO_DISCORD_CLIENT_SECRET` set, same pattern as the update
   token above (baked in by `scripts/generate-build-secrets.mjs` into the
   gitignored `electron/discord-secret.ts`).

**Two things worth understanding before relying on this:**

- **The client secret ships inside the app.** Same accepted tradeoff as
  `KIYRO_UPDATE_TOKEN` above — there's no way to do the OAuth token exchange
  without it, and no scope narrow enough to avoid shipping *something*
  sensitive here. Rotate it if you're ever worried it's been extracted.
- **`rpc.voice.write` (needed for mute/deafen/mic volume) is a *restricted*
  Discord OAuth scope.** It works for your own account automatically (as the
  app's owner), but a friend running Kiyro will hit a permission error unless
  you add them individually as a tester: Developer Portal → your app →
  **App Testers**. There's a cap (currently around 25) and no full
  verification is needed for that many — but it is a manual step per person,
  not something that scales to a public release the way the rest of Kiyro's
  distribution does.

## Documentation

- [`docs/device-protocol.md`](./docs/device-protocol.md) — the wire protocol,
  what is verified, and what is deliberately not implemented.

## Status

Working today, with the stock firmware and no flashing: connection and
handshake, live input feedback for all 12 keys and both encoders, the visual
editor, keyboard / shortcut / text / media / volume / scroll actions, local
profiles with import and export, the serial console, and the device simulator.

Not yet: performing bindings on the computer (needs a host agent — see above),
RGB control, and the mouse / system / application action types, which can be
configured and exported but are marked as planned.

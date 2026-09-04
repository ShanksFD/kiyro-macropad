/**
 * Serves `out/` (Next's static export) over real HTTP, loopback-only, in
 * place of the custom `app://` protocol this used to use.
 *
 * WHY: `fetch()` to `app://...` is flatly rejected by Chromium —
 * `Fetch API cannot load app://kiyro/configure. URL scheme "app" is not
 * supported.` — even with `protocol.registerSchemesAsPrivileged`'s
 * `supportFetchAPI: true` set and registered before `app` is ready, which
 * is exactly the configuration Electron's own docs describe as sufficient.
 * That single rejected `fetch()` is what breaks *every* client-side
 * navigation: Next's App Router fetches the next route's RSC payload with
 * `fetch()`, that throws, and it silently falls back to a full document
 * reload (`doMpaNavigation`) — tearing down and rebuilting the entire React
 * tree, including the in-page title bar's View/Help menu, on every sidebar
 * click.
 *
 * `electron:dev` never hits this: it loads `http://localhost:3000` and
 * `fetch('http://...')` from an `http://` document is unremarkable. This
 * server gives the packaged build the identical transport, sidestepping
 * whatever Electron/Chromium-version-specific gap the custom scheme hits
 * rather than depending on it.
 *
 * `next.config.ts`'s `output: 'export'` still needs *some* real origin to
 * resolve its root-absolute asset paths (`/_next/static/...`) against —
 * that's what ruled out `file://` in the first place (see this file's
 * neighbour, `main.ts`'s doc comment). A real `http://` origin gives it
 * that for free, same as `localhost:3000` does in dev.
 *
 * Bound to `127.0.0.1` specifically, never `0.0.0.0`: this must not be
 * reachable from the network, only from this machine. Nothing it serves is
 * sensitive — it's the same static UI bundle every user's build already
 * ships — so another local process finding the port is a non-issue; an
 * ephemeral port (`listen(0, ...)`) is chosen mainly to avoid colliding
 * with anything already using a fixed one, not as a security boundary.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { log } from './observability';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // Next's static export writes each route's RSC payload alongside its
  // HTML as `<route>.txt` — the App Router's client-side navigation fetches
  // this on every route change and checks its content type
  // (`fetch-server-response.js`), accepting `text/x-component` or, for
  // `output: 'export'` builds specifically, `text/plain`.
  '.txt': 'text/x-component; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

/**
 * Maps a request pathname onto a file in `out/`. The static export writes
 * each route as a flat `<route>.html` (e.g. `out/configure.html`, not
 * `out/configure/index.html` — `trailingSlash` is left at its default
 * `false`), and asset paths already carry a real extension, so only
 * extension-less pathnames need `.html` appended.
 *
 * Returns every candidate worth trying, in order — see `SEGMENT_CACHE_FILE`
 * below for why there is sometimes more than one.
 */
function candidateOutPaths(pathname: string): string[] {
  const decoded = decodeURIComponent(pathname);
  if (decoded === '/' || decoded === '') return ['index.html'];

  const trimmed = decoded.replace(/^\/+/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : trimmed.slice(0, lastSlash);
  const lastSegment = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);

  const plain = lastSegment.includes('.') ? trimmed : `${trimmed}.html`;
  const candidates = [plain];

  // Next's segment cache (client-side prefetching of individual route
  // segments) requests these under a flattened name —
  // `/configure/__next.configure.__PAGE__.txt` — but the static export
  // writes the matching file NESTED, one directory level deeper:
  // `out/configure/__next.configure/__PAGE__.txt`. The URL's request
  // protocol and the export's on-disk layout simply disagree about where
  // the path separator goes; this was showing up as harmless-looking (but
  // console-spamming) 404s on every navigation, since a failed segment
  // prefetch doesn't fall back to a full reload the way a failed route
  // fetch does.
  //
  // `parts.slice(0, i).join('.')` rebuilds the "__next.<name>" directory
  // component by re-joining with dots, trying each possible split point —
  // there's exactly one route name in play here, but this doesn't assume
  // that.
  if (SEGMENT_CACHE_FILE.test(lastSegment)) {
    const parts = lastSegment.split('.');
    for (let i = 2; i < parts.length; i += 1) {
      const nestedDir = parts.slice(0, i).join('.');
      const nestedFile = parts.slice(i).join('.');
      candidates.push([dir, nestedDir, nestedFile].filter(Boolean).join('/'));
    }
  }

  return candidates;
}

/** Matches the flattened segment-cache filename pattern — see `candidateOutPaths`. */
const SEGMENT_CACHE_FILE = /^__next\..+\.[^.]+$/;

/**
 * Starts the server and resolves once it's actually listening, with the
 * port the OS handed it. Callers load `http://127.0.0.1:<port>/...` only
 * after this resolves — there is no fixed port to hardcode into the CSP or
 * anywhere else.
 */
export function startLocalServer(outDir: string): Promise<{ server: Server; port: number }> {
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');

        for (const relativePath of candidateOutPaths(url.pathname)) {
          // `path.join` alone would let a crafted `../../` pathname escape
          // `outDir`; this is the same check Node's own `http-server`-style
          // tools use. Nothing here is reachable from outside this machine
          // (loopback-only, see this file's doc comment), but there is no
          // reason to skip a one-line check that rules it out entirely.
          const filePath = path.join(outDir, relativePath);
          if (!filePath.startsWith(outDir + path.sep) && filePath !== outDir) continue;

          const fileStat = await stat(filePath).catch(() => null);
          if (!fileStat?.isFile()) continue;

          const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
          const body = await readFile(filePath);
          response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length });
          response.end(body);
          return;
        }

        response.writeHead(404).end('Not found');
      } catch (error) {
        log.error('[kiyro] local static server request failed:', error);
        response.writeHead(500).end('Internal error');
      }
    })();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Port 0: ask the OS for any free port, rather than pinning one that
    // might already be taken on someone else's machine.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('local static server has no usable address'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

#!/usr/bin/env node
/**
 * Publishes the draft release `electron-builder` just created — a separate,
 * sequential step run *after* `electron-builder --win --publish always`
 * finishes, not a config knob electron-builder itself applies mid-build.
 *
 * WHY THIS EXISTS
 * ----------------
 * `package.json`'s `build.publish` used to set `releaseType: "release"`, so
 * electron-builder would publish directly instead of drafting first. That
 * worked for the very first releases, then started intermittently producing
 * either a duplicate release for the same tag, or a release missing its
 * `latest.yml` (the file `electron-updater` needs to find an update at all)
 * — both totally silently, no error in the common case.
 *
 * The actual cause, found by reading electron-builder's own source: it
 * uploads the installer and its `.blockmap` (used for smaller "differential"
 * update downloads) as two separate, concurrent tasks — and *each* of those
 * tasks independently asks GitHub "does a release already exist for this
 * tag?" before creating one if not. On the very first upload for a version,
 * both tasks ask at the same time, both get "no," and *both* try to create
 * the release. Under the old draft-by-default behaviour this was mostly
 * harmless (GitHub allows several draft releases to share a tag, so you
 * just got a stray duplicate to clean up) — but `releaseType: "release"`
 * made electron-builder try to create it as already-published, and GitHub
 * enforces uniqueness there: the loser of the race gets rejected with
 * `422 Unprocessable Entity — already_exists`. That failure is also what
 * made `latest.yml` vanish: electron-builder cancels its still-pending
 * upload tasks (the update-info file is generated and uploaded last, after
 * the installer) as soon as it sees *any* task fail.
 *
 * `nsis.differentialPackage: false` (`package.json`) removes the second
 * concurrent upload entirely — no `.blockmap`, no race, one file, one
 * "does this exist" check. `releaseType` is back to its default (`draft`)
 * as a second layer of safety, since draft tolerates this class of race
 * gracefully even if some other concurrency shows up later. This script is
 * what makes going back to "draft first" not mean "and a human has to
 * remember to click Publish every time" again: it finds the draft
 * electron-builder just made for the current version and publishes it here,
 * safely, after every upload has already finished sequentially.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const tag = `v${pkg.version}`;

// Matches `package.json`'s `build.publish` — kept in sync by hand, same as `tag-release.mjs`.
const OWNER = 'ShanksFD';
const REPO = 'kiyro-macropad';

async function githubRequest(method, urlPath, token, body) {
  return fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      'GH_TOKEN not set — cannot publish the draft release electron-builder just created. It will stay a draft, invisible to auto-update, until you publish it by hand.',
    );
  }

  const listResponse = await githubRequest('GET', `/repos/${OWNER}/${REPO}/releases`, token);
  if (!listResponse.ok) {
    throw new Error(`Could not list releases to find ${tag} (HTTP ${listResponse.status})`);
  }

  const releases = await listResponse.json();
  const matches = releases.filter((release) => release.tag_name === tag);

  if (matches.length === 0) {
    throw new Error(
      `No release found for tag ${tag} — electron-builder should have created one as part of this build. Check its own output above for an upload failure.`,
    );
  }

  if (matches.length > 1) {
    // Deliberately not guessing which one to keep and deleting the rest —
    // assets can end up split across them, and picking wrong silently loses
    // one. This is meant to be rare now that `differentialPackage: false`
    // removes the concurrent upload that caused it in the first place; if
    // it still happens, it needs a human looking at the Releases page.
    throw new Error(
      `${matches.length} releases found for tag ${tag} (ids: ${matches.map((r) => r.id).join(', ')}) — not auto-resolving this. Check the Releases page by hand: keep whichever has all the expected assets, delete the rest, and publish it manually.`,
    );
  }

  const release = matches[0];

  if (!release.draft) {
    console.log(`[kiyro] release ${tag} is already published (id=${release.id}) — nothing to do.`);
    return;
  }

  const patchResponse = await githubRequest(
    'PATCH',
    `/repos/${OWNER}/${REPO}/releases/${release.id}`,
    token,
    { draft: false },
  );
  if (!patchResponse.ok) {
    throw new Error(`Failed to publish release ${release.id} for tag ${tag} (HTTP ${patchResponse.status})`);
  }

  console.log(`[kiyro] published release ${tag} (id=${release.id})`);
}

try {
  await main();
} catch (error) {
  console.error('[kiyro]', error instanceof Error ? error.message : error);
  process.exit(1);
}

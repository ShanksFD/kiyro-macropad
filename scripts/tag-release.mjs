#!/usr/bin/env node
/**
 * Prepares a clean tag for `electron-builder` to publish against —
 * two things, both required, not niceties:
 *
 * 1. **Creates and pushes the git tag** `v<package.json version>`. GitHub's
 *    release API treats draft and published releases differently here: a
 *    *draft* release can reference a tag that doesn't exist yet (the tag
 *    only gets created once a human clicks "Publish" in the UI), but
 *    creating an already-*published* release the same way is rejected
 *    outright — "Published releases must have a valid tag". This repo's
 *    `build.publish.releaseType: "release"` makes `electron-builder` publish
 *    in one shot rather than drafting first, which is what makes the tag
 *    need to exist *before* it runs. `electron-builder` itself never touches
 *    git tags — only the GitHub Releases API — so nothing else in this
 *    pipeline was ever going to create one.
 *
 * 2. **Deletes a stale draft sitting on that tag, if one exists.** This is
 *    the less obvious one, found by reading `electron-publish`'s own
 *    `GitHubPublisher.getOrCreateRelease()`: if *any* release already exists
 *    for a tag and it's a draft, it just returns and reuses that exact draft
 *    — unconditionally, ignoring `releaseType` entirely. Concretely: a
 *    publish that got interrupted (or was run against `releaseType: "draft"`
 *    before this config existed) leaves a stray draft behind, and every
 *    later publish for that same version silently keeps re-uploading onto
 *    that same stuck draft forever, no matter how many times you rerun it.
 *    Only a *published* release for that tag is left alone here — deleting
 *    something that's already shipped to real installs is not this script's
 *    call to make; it aborts instead, since that means the version number
 *    itself needs bumping, not a retry.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const tag = `v${pkg.version}`;

// Matches `package.json`'s `build.publish` — kept in sync by hand since this
// script runs before `electron-builder` reads that config itself, not after.
const OWNER = 'ShanksFD';
const REPO = 'kiyro-macropad';

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
}

async function githubRequest(method, urlPath, token) {
  return fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

async function deleteStaleDraft() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.warn(
      '[kiyro] GH_TOKEN not set — skipping the stale-draft check. If a draft already exists on this tag from an earlier attempt, electron-builder will silently reuse it instead of publishing a fresh release.',
    );
    return;
  }

  const listResponse = await githubRequest('GET', `/repos/${OWNER}/${REPO}/releases`, token);
  if (!listResponse.ok) {
    console.warn(
      `[kiyro] could not list releases to check for a stale ${tag} draft (HTTP ${listResponse.status}) — continuing anyway.`,
    );
    return;
  }

  const releases = await listResponse.json();
  const existing = releases.find((release) => release.tag_name === tag);
  if (!existing) return;

  if (!existing.draft) {
    throw new Error(
      `A published release already exists for tag ${tag} on GitHub. Bump the version in package.json rather than re-publishing an existing one.`,
    );
  }

  console.warn(
    `[kiyro] deleting a stale draft release on tag ${tag} (id=${existing.id}) — electron-builder reuses the first matching draft it finds regardless of "releaseType", so a leftover one here would silently poison this publish too.`,
  );
  const deleteResponse = await githubRequest(
    'DELETE',
    `/repos/${OWNER}/${REPO}/releases/${existing.id}`,
    token,
  );
  if (!deleteResponse.ok) {
    throw new Error(`Failed to delete stale draft release ${existing.id} for tag ${tag} (HTTP ${deleteResponse.status})`);
  }
}

await deleteStaleDraft();

const alreadyLocal = git(['tag', '--list', tag]) === tag;
if (alreadyLocal) {
  console.log(`[kiyro] tag ${tag} already exists locally — not re-creating it.`);
} else {
  git(['tag', tag]);
  console.log(`[kiyro] created tag ${tag}`);
}

try {
  git(['push', 'origin', tag]);
  console.log(`[kiyro] pushed tag ${tag} to origin`);
} catch (error) {
  // Re-running a publish for the same version (after an earlier step failed,
  // say) means the tag may already be on the remote too — not a problem.
  // Anything else (auth, network, a real conflict) should still stop the
  // release rather than be swallowed here.
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('already exists')) {
    console.log(`[kiyro] tag ${tag} already exists on origin — continuing.`);
  } else {
    throw error;
  }
}

#!/usr/bin/env node
/**
 * Creates and pushes the git tag `v<package.json version>` before
 * `electron-builder` runs — a required step, not a nicety.
 *
 * GitHub's release API treats draft and published releases differently
 * here: a *draft* release can reference a tag that doesn't exist yet (the
 * tag only gets created once a human clicks "Publish" in the UI), but
 * creating an already-*published* release the same way is rejected outright
 * — "Published releases must have a valid tag". `package.json`'s
 * `build.publish.releaseType: "release"` makes `electron-builder` do exactly
 * that (skip the draft step, publish in one shot), which is what makes this
 * tag need to exist *before* it runs rather than after. `electron-builder`
 * itself never touches git tags — only the GitHub Releases API — so nothing
 * else in this pipeline was ever going to create one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const tag = `v${pkg.version}`;

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
}

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

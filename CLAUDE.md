@AGENTS.md

# Working preferences

- Do not run builds, typechecks, lints, or launch the app (dev or packaged) to "verify" changes on your own initiative — this includes `npm run build`, `build:electron`, `typecheck`, `lint`, `electron:dev`, `dist:win`/`dist:mac`, or manually spawning `electron .`/`next dev`. Make the change, tell the user what to run and what to check, and let them test it. Ask first if you think a build/verification step is actually needed.

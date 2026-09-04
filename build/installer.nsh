; Custom NSIS hooks for Kiyro's installer.
;
; electron-builder includes this file automatically because it sits at
; `build/installer.nsh` — the default `buildResources` directory. There is no
; corresponding entry in package.json; adding one is not required and the
; file being found is purely a matter of this path.
;
; WHY THIS EXISTS
; ---------------
; Kiyro's "start when I sign in" setting (`electron/startup.ts`) is written at
; *runtime* by Electron's `setLoginItemSettings`, into
; `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Nothing in the
; installer put it there, so nothing in the uninstaller takes it away either —
; uninstalling Kiyro would otherwise leave a startup entry pointing at an
; executable that no longer exists. Windows keeps showing that in Task
; Manager's Startup tab indefinitely, and the user has no obvious way to
; connect it back to an app they already removed.
;
; `HKCU`, not `HKLM`, on both counts: `nsis.perMachine` is false
; (package.json), so this installs and uninstalls entirely within one user's
; profile, and that is the only hive `setLoginItemSettings` ever wrote to.

!macro customUnInstall
  ; `Kiyro` is `LOGIN_ITEM_NAME` in `electron/startup.ts` — the registry value
  ; name is pinned there specifically so it is a fixed string both sides can
  ; agree on rather than a generated AppUserModelId. Keep them in sync.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Kiyro"

  ; The separate record of a Task Manager "disable" for that same entry. If
  ; the user ever switched Kiyro off there, this value outlives the Run entry
  ; and would silently re-apply to a later reinstall — so a fresh install
  ; would come back already vetoed, with nothing in the UI explaining why.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Kiyro"
!macroend

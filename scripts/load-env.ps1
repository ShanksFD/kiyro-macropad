# Loads .env.local into this PowerShell session's real environment
# variables, so every later "npm run ..." command in this same terminal
# window picks them up normally -- same effect as pasting each
# $env:X = "..." by hand, just once instead of every session.
#
# MUST be dot-sourced, not run directly -- a plain ".\scripts\load-env.ps1"
# invocation runs in a child scope whose environment changes vanish the
# moment it exits, leaving this terminal exactly as unset as before:
#
#   . .\scripts\load-env.ps1
#
# See .env.local.example for the file this reads and what each key is.
# Plain "node" (unlike "next dev"/"next build") never auto-loads .env files
# on its own -- this stands in for that for the Node scripts and
# electron-builder invocations "npm run build:electron"/"dist:win:publish"
# chain together, since those are separate process invocations that would
# otherwise each need the same variables set independently.
#
# Kept to plain ASCII on purpose: Windows PowerShell 5.1 does not reliably
# parse a .ps1 file containing non-ASCII characters (an em dash, a curly
# quote) unless it is saved with a UTF-8 byte-order mark -- without one,
# characters like that can corrupt parsing later in the file with a
# confusing "missing terminator" error nowhere near the actual typo.

$envFile = Join-Path $PSScriptRoot '..\.env.local'

if (-not (Test-Path $envFile)) {
    Write-Warning "No .env.local found at $envFile -- copy .env.local.example to .env.local and fill it in first."
    return
}

$loaded = @()

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -lt 1) { return }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()
    if ($value -eq '') { return } # Blank in the file -- leave whatever (if anything) is already set alone.

    Set-Item -Path "env:$name" -Value $value
    $loaded += $name
}

if ($loaded.Count -eq 0) {
    Write-Warning "$envFile has no non-empty values set -- nothing loaded."
} else {
    $joined = $loaded -join ', '
    Write-Host "[kiyro] loaded from .env.local: $joined" -ForegroundColor Green
}

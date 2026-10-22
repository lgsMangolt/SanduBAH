[CmdletBinding()]
param(
    [ValidateSet('install', 'build', 'test', 'cli')]
    [string]$Action = 'cli',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CommandArguments = @()
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = Join-Path $repositoryRoot 'v3'
$bundledRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $bundledRuntime 'node\bin\node.exe' }
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$pnpmExecutable = if ($pnpmCommand) { $pnpmCommand.Source } else { Join-Path $bundledRuntime 'bin\fallback\pnpm.cmd' }

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    throw 'Node.js 20 or newer is required.'
}

$environmentNames = @('PATH', 'CI', 'PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS', 'CLAUDE_FLOW_AUTO_UPDATE', 'RUFLO_HELPERS_LOCKED', 'RUFLO_DAEMON_AUTOSTART')
$savedEnvironment = @{}
foreach ($environmentName in $environmentNames) {
    $savedEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
}

$localExecutables = Join-Path $workspaceRoot 'node_modules\.pnpm\node_modules\.bin'
$env:PATH = "$(Split-Path -Parent $nodeExecutable);$localExecutables;$env:PATH"
$env:PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS = 'false'
$packageManager = (Get-Content -LiteralPath (Join-Path $workspaceRoot 'package.json') -Raw | ConvertFrom-Json).packageManager
$commandExitCode = 1

Push-Location $workspaceRoot
try {
    switch ($Action) {
        'install' {
            if (-not (Test-Path -LiteralPath $pnpmExecutable)) {
                throw 'pnpm is required to install dependencies.'
            }
            & $pnpmExecutable dlx $packageManager install --frozen-lockfile @CommandArguments
        }
        'build' {
            if (-not (Test-Path -LiteralPath $pnpmExecutable)) {
                throw 'pnpm is required to build the workspace.'
            }
            & $pnpmExecutable dlx $packageManager -r --workspace-concurrency=1 --no-bail run build @CommandArguments
        }
        'test' {
            $env:CI = 'true'
            $env:RUFLO_DAEMON_AUTOSTART = '0'
            & $nodeExecutable (Join-Path $workspaceRoot 'node_modules\vitest\vitest.mjs') run --maxWorkers=1 --no-file-parallelism --coverage.enabled=false @CommandArguments
        }
        'cli' {
            $env:CLAUDE_FLOW_AUTO_UPDATE = 'false'
            $env:RUFLO_HELPERS_LOCKED = 'true'
            Set-Location $repositoryRoot
            if ($CommandArguments.Count -eq 0) {
                $CommandArguments = @('--help')
            }
            & $nodeExecutable (Join-Path $repositoryRoot 'bin\cli.js') @CommandArguments
        }
    }
    $commandExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
    foreach ($environmentName in $environmentNames) {
        [Environment]::SetEnvironmentVariable($environmentName, $savedEnvironment[$environmentName], 'Process')
    }
}

exit $commandExitCode

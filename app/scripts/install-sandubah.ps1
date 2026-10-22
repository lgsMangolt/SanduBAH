[CmdletBinding()]
param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$configPath = Join-Path $codexHome 'config.toml'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$desktopExecutable = Join-Path $desktopPath 'SanduBAH.exe'
$skillDirectory = Join-Path $codexHome 'skills\sandubah'
$skillPath = Join-Path $skillDirectory 'SKILL.md'
$codexExecutable = (Get-Command codex.exe -ErrorAction Stop).Source
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $runtimeRoot 'node\bin\node.exe' }
$pythonExecutable = Join-Path $runtimeRoot 'python\python.exe'
$powerShellExecutable = (Get-Process -Id $PID).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$buildDirectory = Join-Path $repositoryRoot 'build\sandubah'
$validationDirectory = Join-Path $buildDirectory ('validation-' + [Guid]::NewGuid().ToString('N'))
$builtExecutable = Join-Path $validationDirectory 'SanduBAH.exe'
$candidatePath = Join-Path $validationDirectory 'config.toml'
$originalPath = Join-Path $validationDirectory 'original.toml'
$cliEntry = Join-Path $repositoryRoot 'v3\@claude-flow\cli\bin\cli.js'
$mcpLauncher = Join-Path $PSScriptRoot 'sandubah-mcp.cjs'
$utf8 = [System.Text.UTF8Encoding]::new($false)

foreach ($requiredFile in @($configPath, $nodeExecutable, $pythonExecutable, $compiler, (Join-Path $repositoryRoot 'v3\@claude-flow\cli\dist\src\index.js'))) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) { throw "Arquivo obrigatorio ausente: $requiredFile" }
}
if (-not (Test-Path -LiteralPath $desktopPath -PathType Container)) { throw "Area de trabalho ausente: $desktopPath" }

New-Item -ItemType Directory -Path $validationDirectory -Force | Out-Null
$originalBytes = [System.IO.File]::ReadAllBytes($configPath)
[System.IO.File]::WriteAllBytes($originalPath, $originalBytes)
[System.IO.File]::WriteAllBytes($candidatePath, $originalBytes)
$originalHash = (Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash
$resourcePath = Join-Path $validationDirectory 'SanduBAH.paths'
[System.IO.File]::WriteAllText($resourcePath, "$repositoryRoot`n$powerShellExecutable`n", $utf8)
& $compiler /nologo /target:exe /platform:anycpu /optimize+ /reference:System.Windows.Forms.dll "/out:$builtExecutable" "/resource:$resourcePath,SanduBAH.paths" (Join-Path $PSScriptRoot 'SanduBAH.cs')
if ($LASTEXITCODE -ne 0) { throw "Compilacao do launcher falhou: $LASTEXITCODE" }
foreach ($smokeArgument in @('--describe', '--version', '--help')) {
    & $builtExecutable $smokeArgument
    if ($LASTEXITCODE -ne 0) { throw "Smoke do executavel falhou: $smokeArgument" }
}
& $nodeExecutable (Join-Path $PSScriptRoot 'smoke-sandubah-mcp.cjs')
if ($LASTEXITCODE -ne 0) { throw 'O handshake do MCP local falhou.' }

$savedCodexHome = $env:CODEX_HOME
try {
    $env:CODEX_HOME = $validationDirectory
    $existingJson = & $codexExecutable mcp get ruflo --json 2> (Join-Path $validationDirectory 'codex-validation.stderr.log') | Out-String
    $existingServer = if ($LASTEXITCODE -eq 0) { $existingJson | ConvertFrom-Json } else { $null }
    $needsMcpUpdate = $true
    if ($existingServer -and $existingServer.transport.command -eq $nodeExecutable -and $existingServer.transport.args.Count -eq 1 -and $existingServer.transport.args[0] -eq $mcpLauncher) {
        $serverEnvironment = $existingServer.transport.env
        $needsMcpUpdate = -not ($serverEnvironment.CLAUDE_FLOW_AUTO_UPDATE -eq 'false' -and $serverEnvironment.RUFLO_HELPERS_LOCKED -eq 'true' -and $serverEnvironment.RUFLO_DAEMON_AUTOSTART -eq '0' -and $serverEnvironment.RUFLO_MCP_SKIP_NPX -eq '1' -and $serverEnvironment.RUFLO_MCP_CLI_OVERRIDE -eq $cliEntry)
    }
    if ($needsMcpUpdate) {
        & $codexExecutable mcp add ruflo --env 'CLAUDE_FLOW_AUTO_UPDATE=false' --env 'RUFLO_HELPERS_LOCKED=true' --env 'RUFLO_DAEMON_AUTOSTART=0' --env 'RUFLO_MCP_SKIP_NPX=1' --env ("RUFLO_MCP_CLI_OVERRIDE={0}" -f $cliEntry) -- $nodeExecutable $mcpLauncher
        if ($LASTEXITCODE -ne 0) { throw 'Falha configurando a copia temporaria do MCP.' }
    }
    & $pythonExecutable (Join-Path $PSScriptRoot 'sandubah-config.py') prepare $candidatePath
    if ($LASTEXITCODE -ne 0) { throw 'O TOML temporario nao validou.' }
    & $pythonExecutable (Join-Path $PSScriptRoot 'sandubah-config.py') validate $originalPath $candidatePath $nodeExecutable $mcpLauncher $cliEntry
    if ($LASTEXITCODE -ne 0) { throw 'O instalador alteraria preferencias alheias. Nada foi aplicado.' }
    & $codexExecutable mcp get ruflo --json
    if ($LASTEXITCODE -ne 0) { throw 'O proprio Codex recusou o candidato. Nada foi aplicado.' }
}
finally {
    $env:CODEX_HOME = $savedCodexHome
}

$skillTemplate = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'sandubah-skill\SKILL.md'))
$candidateSkill = Join-Path $validationDirectory 'SKILL.md'
[System.IO.File]::WriteAllText($candidateSkill, $skillTemplate.Replace('__REPOSITORY_ROOT__', $repositoryRoot), $utf8)
if ($ValidateOnly) {
    Write-Output "VALIDATION_ONLY_OK=$validationDirectory"
    Write-Output 'Nenhuma configuracao do usuario ou arquivo da area de trabalho foi alterado.'
    exit 0
}

if ((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ne $originalHash) {
    throw 'A configuracao mudou durante os testes. Nada foi aplicado. Execute novamente.'
}
$backupDirectory = Join-Path $codexHome ("backups\sandubah\{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([Guid]::NewGuid().ToString('N').Substring(0, 8)))
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $backupDirectory 'config-original.toml'), $originalBytes)
if (Test-Path -LiteralPath $desktopExecutable) { Copy-Item -LiteralPath $desktopExecutable -Destination (Join-Path $backupDirectory 'SanduBAH.exe') }
if (Test-Path -LiteralPath $skillPath) { Copy-Item -LiteralPath $skillPath -Destination (Join-Path $backupDirectory 'SKILL.md') }
New-Item -ItemType Directory -Path $skillDirectory -Force | Out-Null
Copy-Item -LiteralPath $builtExecutable -Destination $desktopExecutable -Force
Copy-Item -LiteralPath $candidateSkill -Destination $skillPath -Force
& $desktopExecutable --version
if ($LASTEXITCODE -ne 0) { throw 'O executavel da area de trabalho falhou. A configuracao nao foi alterada.' }

$temporaryConfig = $configPath + '.sandubah-' + [Guid]::NewGuid().ToString('N') + '.tmp'
try {
    [System.IO.File]::WriteAllBytes($temporaryConfig, [System.IO.File]::ReadAllBytes($candidatePath))
    if ((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ne $originalHash) {
        throw 'A configuracao mudou antes da aplicacao. Nao sobrescrevi a outra edicao.'
    }
    [System.IO.File]::Replace($temporaryConfig, $configPath, (Join-Path $backupDirectory 'config.toml'))
}
finally {
    if (Test-Path -LiteralPath $temporaryConfig) { Remove-Item -LiteralPath $temporaryConfig }
}
& $codexExecutable mcp get ruflo --json
if ($LASTEXITCODE -ne 0) { throw "Falha na verificacao final. Backup preservado: $backupDirectory" }
$receipt = [ordered]@{
    installedAt = (Get-Date).ToString('o')
    repository = $repositoryRoot
    desktopExecutable = $desktopExecutable
    executableSha256 = (Get-FileHash -LiteralPath $desktopExecutable -Algorithm SHA256).Hash
    codexConfig = $configPath
    originalConfigSha256 = $originalHash
    installedConfigSha256 = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
    backupDirectory = $backupDirectory
    validationDirectory = $validationDirectory
    skill = $skillPath
    node = $nodeExecutable
    mcpLauncher = $mcpLauncher
    disabledPlugins = @('ruflo-core@ruflo', 'ruflo-swarm@ruflo')
    unrelatedSettingsPreserved = $true
}
$receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $repositoryRoot 'docs\customization\sandubah-installation.json') -Encoding utf8
$receipt | ConvertTo-Json -Depth 4

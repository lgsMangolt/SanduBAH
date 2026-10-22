[CmdletBinding()]
param(
    [ValidateSet('menu', 'codex', 'cli', 'build', 'test', 'test-all', 'folder', 'describe', 'help')]
    [string]$Action = 'menu',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CommandArguments = @()
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$developmentScript = Join-Path $PSScriptRoot 'dev-local.ps1'
$powerShellExecutable = (Get-Process -Id $PID).Path

function Invoke-SanduBAHAction([string]$SelectedAction, [string[]]$SelectedArguments) {
    if ($SelectedAction -in @('test', 'test-all') -and @($SelectedArguments | Where-Object { $_ -match '^--(?:maxWorkers|minWorkers|fileParallelism|file-parallelism|pool|poolOptions)(?:[.=]|$)' }).Count -gt 0) {
        throw 'SanduBAH usa um worker; argumentos que alteram workers, pool ou paralelismo nao sao permitidos.'
    }
    switch ($SelectedAction) {
        'codex' {
            $codexCommand = Get-Command codex.exe -ErrorAction Stop
            & $codexCommand.Source app $repositoryRoot | Out-Host
            return $LASTEXITCODE
        }
        'folder' {
            Start-Process explorer.exe -ArgumentList ('"{0}"' -f $repositoryRoot)
            return 0
        }
        'describe' {
            [ordered]@{
                name = 'SanduBAH'
                repository = $repositoryRoot
                mcpLauncher = Join-Path $PSScriptRoot 'sandubah-mcp.cjs'
                cliEntry = Join-Path $repositoryRoot 'v3\@claude-flow\cli\bin\cli.js'
                testWorkers = 1
            } | ConvertTo-Json | Write-Host
            return 0
        }
        'help' {
            Write-Host 'SanduBAH [menu|codex|cli|build|test|test-all|folder|describe] [argumentos]'
            Write-Host 'Exemplos: SanduBAH.exe cli --version; SanduBAH.exe test @claude-flow/cli/__tests__/arquivo.test.ts'
            return 0
        }
        'test-all' {
            foreach ($shardNumber in 1..4) {
                Write-Host "SanduBAH: lote $shardNumber/4, um worker."
                & $powerShellExecutable -NoLogo -NoProfile -File $developmentScript test "--shard=$shardNumber/4" @SelectedArguments | Out-Host
                if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
            }
            return 0
        }
        default {
            if ($SelectedAction -eq 'test' -and $SelectedArguments.Count -eq 0) {
                throw 'Informe o caminho do teste. Para a suite completa em quatro lotes, use test-all.'
            }
            & $powerShellExecutable -NoLogo -NoProfile -File $developmentScript $SelectedAction @SelectedArguments | Out-Host
            return $LASTEXITCODE
        }
    }
}

Push-Location $repositoryRoot
try {
    if ($Action -ne 'menu') {
        exit (Invoke-SanduBAHAction $Action $CommandArguments)
    }
    $Host.UI.RawUI.WindowTitle = 'SanduBAH - Ruflo local'
    do {
        Write-Host "`nSanduBAH - sua copia local do Ruflo" -ForegroundColor Yellow
        Write-Host $repositoryRoot
        Write-Host '1 Abrir projeto no Codex'
        Write-Host '2 Ajuda da CLI local'
        Write-Host '3 Compilar (sequencial)'
        Write-Host '4 Rodar um arquivo de testes (um worker)'
        Write-Host '5 Suite completa (quatro lotes, um worker)'
        Write-Host '6 Abrir pasta do codigo'
        Write-Host '0 Sair'
        $selection = Read-Host 'Opcao'
        try {
            $resultCode = switch ($selection) {
                '1' { Invoke-SanduBAHAction 'codex' @() }
                '2' { Invoke-SanduBAHAction 'cli' @('--help') }
                '3' { Invoke-SanduBAHAction 'build' @() }
                '4' {
                    $testPath = Read-Host 'Caminho do teste relativo a v3'
                    if ([string]::IsNullOrWhiteSpace($testPath)) { throw 'Nenhum teste informado.' }
                    Invoke-SanduBAHAction 'test' @($testPath)
                }
                '5' { Invoke-SanduBAHAction 'test-all' @() }
                '6' { Invoke-SanduBAHAction 'folder' @() }
                '0' { 0 }
                default { Write-Host 'Opcao invalida.'; 0 }
            }
            if ($resultCode -ne 0) { Write-Host "Comando terminou com codigo $resultCode." -ForegroundColor Red }
        }
        catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    } while ($selection -ne '0')
}
finally {
    Pop-Location
}

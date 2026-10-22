param([switch]$InstallDesktop)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $HOME '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeExecutable = Join-Path $runtimeRoot 'node\bin\node.exe'
$powerShellExecutable = Join-Path $runtimeRoot 'native\powershell\pwsh.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$buildRoot = Join-Path $repositoryRoot 'build\sandubah\gui'
$configPath = Join-Path $HOME '.codex\config.toml'
$originalHash = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
$codexExecutable = (Get-Command codex.exe -ErrorAction Stop).Source
foreach ($required in @($nodeExecutable, $powerShellExecutable, $compiler)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Dependencia local ausente: $required" }
}
if (-not $InstallDesktop) {
    & $nodeExecutable (Join-Path $PSScriptRoot 'build-sandubah-gui.cjs') $codexExecutable
    if ($LASTEXITCODE -ne 0) { throw "Build do runtime falhou: $LASTEXITCODE" }
    $resourcePath = Join-Path $buildRoot 'SanduBAH.paths'
    [System.IO.File]::WriteAllText($resourcePath, "$repositoryRoot`n$powerShellExecutable`n", [System.Text.UTF8Encoding]::new($false))
    Add-Type -AssemblyName System.Drawing
    $logoPath = Join-Path $repositoryRoot 'src\sandubah-desktop\sandubah-logo.png'
    $iconPath = Join-Path $buildRoot 'SanduBAH.ico'
    $sourceImage = [System.Drawing.Image]::FromFile($logoPath)
    $bitmap = [System.Drawing.Bitmap]::new(256, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.DrawImage($sourceImage, 0, 0, 256, 256)
    $pngStream = [System.IO.MemoryStream]::new()
    $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()
    $iconWriter = [System.IO.BinaryWriter]::new([System.IO.File]::Create($iconPath))
    try {
        $iconWriter.Write([UInt16]0); $iconWriter.Write([UInt16]1); $iconWriter.Write([UInt16]1)
        $iconWriter.Write([byte]0); $iconWriter.Write([byte]0); $iconWriter.Write([byte]0); $iconWriter.Write([byte]0)
        $iconWriter.Write([UInt16]1); $iconWriter.Write([UInt16]32)
        $iconWriter.Write([UInt32]$pngBytes.Length); $iconWriter.Write([UInt32]22); $iconWriter.Write($pngBytes)
    } finally { $iconWriter.Dispose(); $pngStream.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $sourceImage.Dispose() }
    & $compiler /nologo /target:winexe /platform:anycpu /optimize+ /reference:System.Windows.Forms.dll "/win32icon:$iconPath" "/out:$(Join-Path $buildRoot 'SanduBAH.exe')" "/resource:$resourcePath,SanduBAH.paths" (Join-Path $PSScriptRoot 'SanduBAH.cs')
    if ($LASTEXITCODE -ne 0) { throw "Compilacao do launcher falhou: $LASTEXITCODE" }
    & $nodeExecutable (Join-Path $PSScriptRoot 'brand-sandubah-runtime.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Feche apenas o SanduBAH e tente novamente preparar a identidade do aplicativo.' }
} else {
    $candidate = Join-Path $buildRoot 'SanduBAH.exe'
    $validationPath = Join-Path $repositoryRoot 'docs\customization\sandubah-gui-validation.json'
    if (-not (Test-Path -LiteralPath $candidate)) { throw 'Compile e teste a interface antes de instalar.' }
    $validation = Get-Content -LiteralPath $validationPath -Raw | ConvertFrom-Json
    if (-not $validation.passed -or $validation.executableSha256 -ne (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash) { throw 'A validacao nao corresponde a este executavel. Execute os testes novamente.' }
    if (-not $validation.sourceHashes) { throw 'A validacao precisa incluir os hashes dos fontes.' }
    foreach ($entry in $validation.sourceHashes.PSObject.Properties) {
        $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $entry.Name))
        if (-not $sourcePath.StartsWith($repositoryRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de validacao invalido.' }
        if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $entry.Value) { throw "Fonte alterado apos teste: $($entry.Name). Execute os testes novamente." }
    }
    $desktop = [Environment]::GetFolderPath('Desktop')
    $destination = Join-Path $desktop 'SanduBAH.exe'
    if (Test-Path -LiteralPath $destination) {
        $backupRoot = Join-Path $buildRoot ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        Copy-Item -LiteralPath $destination -Destination (Join-Path $backupRoot 'SanduBAH.exe')
    }
    Copy-Item -LiteralPath $candidate -Destination $destination -Force
    Write-Output "Interface instalada: $destination"
}
if ((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ne $originalHash) { throw 'A configuracao foi alterada por outro processo durante o build. Nenhuma restauracao automatica foi realizada.' }
Write-Output 'Configuracao do Codex preservada. Gateway nao acessado.'

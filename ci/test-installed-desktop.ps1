[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[0-9]{1,15}$')][string]$ReleaseId,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedSha256
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:GITHUB_REPOSITORY -ne 'lgsMangolt/SanduBAH') { throw 'This lifecycle test is restricted to the authorized GitHub-hosted Windows VM.' }
$computer = Get-CimInstance Win32_ComputerSystem
if (-not $computer.HypervisorPresent -or $computer.Model -notmatch 'Virtual') { throw 'A fresh virtual machine is required.' }
$repository = 'lgsMangolt/SanduBAH'
$appDirectory = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs/SanduBAH'))
$dataDirectory = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'SanduBAH/workspace'))
$downloadDirectory = Join-Path $env:RUNNER_TEMP 'sandubah-release-download'
$reportPath = Join-Path $env:RUNNER_TEMP ("SanduBAH-windows-vm-validation-$env:GITHUB_RUN_ID-$env:GITHUB_RUN_ATTEMPT.json")
$stage = 'preflight'
$checks = [Collections.Generic.List[string]]::new()
$report = [ordered]@{schema=1;passed=$false;installerSha256=$ExpectedSha256;version='0.1.0';workerLimit=1;modelCalls=0;environment='Fresh GitHub-hosted Windows Server 2025 VM; development tools preinstalled, application PATH isolated';runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;commit=$env:GITHUB_SHA;workflowUrl="https://github.com/$repository/actions/runs/$env:GITHUB_RUN_ID";checks=@();privateProjectsIncluded=$false;personalCredentialsIncluded=$false;windowsCodeSigned=$false}
function Invoke-GitHub([string[]]$Arguments) {
    $output = & gh @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'GitHub release transfer failed.' }
    return $output
}
function Get-ProductEntry {
    $entries = @(Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'SanduBAH*' })
    if ($entries.Count -gt 1) { throw 'Unexpected duplicate application registrations.' }
    if ($entries.Count -eq 1) { return $entries[0] }
    return $null
}
function Get-RegisteredUninstaller($Entry) {
    if ($null -eq $Entry) { throw 'Per-user uninstall registration was not created.' }
    $match = [regex]::Match([string]$Entry.UninstallString, '^"([^"]+)"')
    if (-not $match.Success) { throw 'Uninstaller command is invalid.' }
    $filename = [IO.Path]::GetFullPath($match.Groups[1].Value)
    if ([IO.Path]::GetDirectoryName($filename) -ne $appDirectory -or [IO.Path]::GetFileName($filename) -ne 'Uninstall SanduBAH.exe') { throw 'Uninstall target is outside the expected application directory.' }
    return $filename
}
function Invoke-Installer {
    Write-Host 'Starting the actual per-user NSIS installer.'
    $process = Start-Process -FilePath $script:installer -ArgumentList @('/S','/currentuser') -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(240000)) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue; throw 'Installer timed out.' }
    if ($process.ExitCode -ne 0) { throw "Installer failed with code $($process.ExitCode)." }
    if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'SanduBAH.exe'))) { throw 'Installed executable is missing.' }
    $entry = Get-ProductEntry
    $uninstaller = Get-RegisteredUninstaller $entry
    if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Registered uninstaller was not installed.' }
    if ($entry.InstallLocation -and [IO.Path]::GetFullPath($entry.InstallLocation).TrimEnd('\') -ne $appDirectory.TrimEnd('\')) { throw 'Unexpected install directory.' }
    $checks.Add('real-NSIS-install-and-HKCU-registration')
}
function Assert-Canaries {
    $fixture = Get-Content -LiteralPath (Join-Path $env:RUNNER_TEMP 'sandubah-lifecycle-fixture.json') -Raw | ConvertFrom-Json
    foreach ($file in $fixture.files) { if ((Get-FileHash -LiteralPath $file.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'Fictional project data changed during the installation lifecycle.' } }
    $checks.Add('project-and-fictional-credential-canaries-preserved')
}
function Invoke-Uninstaller {
    Write-Host 'Starting the actual registered uninstaller.'
    $entry = Get-ProductEntry
    $uninstaller = Get-RegisteredUninstaller $entry
    $process = Start-Process -FilePath $uninstaller -ArgumentList @('/S','/currentuser') -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(120000)) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue; throw 'Uninstaller timed out.' }
    if ($process.ExitCode -ne 0) { throw "Uninstaller failed with code $($process.ExitCode)." }
    for ($attempt=0; $attempt -lt 120 -and ((Test-Path -LiteralPath (Join-Path $appDirectory 'SanduBAH.exe')) -or $null -ne (Get-ProductEntry)); $attempt++) { Start-Sleep -Milliseconds 500 }
    if ((Test-Path -LiteralPath (Join-Path $appDirectory 'SanduBAH.exe')) -or $null -ne (Get-ProductEntry)) { throw 'Uninstaller did not remove program files and registration.' }
    foreach ($shortcut in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'SanduBAH.lnk'),(Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/SanduBAH.lnk'))) { if (Test-Path -LiteralPath $shortcut) { throw 'An application shortcut remained after uninstall.' } }
    $checks.Add('real-NSIS-uninstall-files-registration-and-shortcuts-removed')
    Assert-Canaries
}
function Invoke-AppCheck([string]$Mode) {
    Write-Host "Checking the installed application: $Mode."
    $savedToken = $env:GH_TOKEN
    try { Remove-Item Env:/GH_TOKEN; $output = & node (Join-Path $PSScriptRoot 'installed-desktop.cjs') $Mode; $exitCode = $LASTEXITCODE } finally { $env:GH_TOKEN = $savedToken }
    if ($exitCode -ne 0) { throw "Installed application check failed: $Mode." }
    $result = ($output | Select-Object -Last 1) | ConvertFrom-Json
    if (-not $result.passed -or $result.workerLimit -ne 1 -or $result.modelCalls -ne 0) { throw 'Application check returned an invalid receipt.' }
    foreach ($check in $result.checks) { $checks.Add($check) }
}
try {
    if ((Test-Path -LiteralPath $appDirectory) -or (Test-Path -LiteralPath $dataDirectory) -or $null -ne (Get-ProductEntry)) { throw 'VM already contains SanduBAH data; refusing to replace it.' }
    $checks.Add('fresh-VM-no-existing-application-or-project-data')
    $release = (Invoke-GitHub -Arguments @('api',"repos/$repository/releases/$ReleaseId")) | ConvertFrom-Json
    if (-not $release.draft -or $release.tag_name -ne 'v0.1.0') { throw 'Only the expected draft release can be validated.' }
    $stage = 'download-and-hash'
    Write-Host 'Downloading and verifying the audited draft assets.'
    New-Item -ItemType Directory -Path $downloadDirectory | Out-Null
    Invoke-GitHub -Arguments @('release','download','v0.1.0','--repo',$repository,'--pattern','SanduBAH-Setup-0.1.0-x64.exe','--pattern','SanduBAH-update.json','--pattern','SanduBAH-update.sig','--pattern','SanduBAH-test-controller.zip','--dir',$downloadDirectory) | Out-Null
    $controller = Join-Path $downloadDirectory 'SanduBAH-test-controller.zip'
    if ($env:SANDUBAH_TEST_TOOLS_SHA256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $controller -Algorithm SHA256).Hash.ToLowerInvariant() -ne $env:SANDUBAH_TEST_TOOLS_SHA256) { throw 'Offline test controller failed its audit hash.' }
    Expand-Archive -LiteralPath $controller -DestinationPath $env:SANDUBAH_TEST_TOOLS
    $script:installer = Join-Path $downloadDirectory 'SanduBAH-Setup-0.1.0-x64.exe'
    if ((Get-FileHash -LiteralPath $script:installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedSha256) { throw 'Downloaded installer hash does not match the audited artifact.' }
    $env:SANDUBAH_INSTALLED_DIRECTORY = $appDirectory
    $env:SANDUBAH_VM_DOWNLOAD_DIRECTORY = $downloadDirectory
    $checks.Add('actual-draft-release-installer-downloaded-and-SHA256-verified')
    $stage = 'install-and-first-launch'
    Invoke-Installer
    foreach ($shortcut in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'SanduBAH.lnk'),(Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/SanduBAH.lnk'))) { if (-not (Test-Path -LiteralPath $shortcut)) { throw 'Installer shortcut is missing.' } }
    $checks.Add('desktop-and-start-menu-shortcuts-created')
    Invoke-AppCheck 'fresh'
    $stage = 'reinstall'
    Invoke-Installer
    Assert-Canaries
    Invoke-AppCheck 'resume'
    $stage = 'uninstall'
    Invoke-Uninstaller
    $stage = 'restore-after-uninstall'
    Invoke-Installer
    Invoke-AppCheck 'resume'
    $stage = 'final-uninstall'
    Invoke-Uninstaller
    $report.passed = $true
    $report.lifecycle = @('install','normal-launch','same-version-reinstall','uninstall','install-again','restore-fictional-project','final-uninstall')
} catch {
    $report.failedStage = $stage
    $report.failure = 'Validation did not complete; inspect the workflow log. No release is authorized by this report.'
    Write-Host "Validation failed at stage: $stage"
    Write-Host $_.Exception.Message
} finally {
    $report.checkedAt = [DateTime]::UtcNow.ToString('o')
    $report.checks = @($checks.ToArray())
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8NoBOM
    Invoke-GitHub -Arguments @('release','upload','v0.1.0',$reportPath,'--repo',$repository) | Out-Null
}
if (-not $report.passed) { throw 'VM lifecycle validation failed; keep the release as a draft.' }
Write-Host 'VM lifecycle validation passed. The release remains a draft until separately published.'

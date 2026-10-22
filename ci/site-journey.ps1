$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:GITHUB_REPOSITORY -ne 'lgsMangolt/SanduBAH') { throw 'This test is restricted to the authorized fresh GitHub-hosted Windows VM.' }
$computer = Get-CimInstance Win32_ComputerSystem
if (-not $computer.HypervisorPresent -or $computer.Model -notmatch 'Virtual') { throw 'A fresh VM is required.' }
foreach ($name in @('SANDUBAH_EXPECTED_SHA256','SANDUBAH_SITE_INDEX_SHA256','SANDUBAH_SITE_APP_SHA256','SANDUBAH_PROVIDER_BOOTSTRAP_SHA256')) { if ([Environment]::GetEnvironmentVariable($name) -notmatch '^[a-f0-9]{64}$') { throw 'An expected audit hash is missing.' } }
if ($env:SANDUBAH_VISITOR_PROVIDER -notin @('codex','claude')) { throw 'An explicitly supported provider is required.' }
$directory = Join-Path $env:RUNNER_TEMP 'sandubah-visitor'
$evidence = Join-Path $directory 'evidence'
$homeDirectory = Join-Path $directory 'home'
$appDirectory = Join-Path $env:LOCALAPPDATA 'Programs/SanduBAH'
if ((Test-Path -LiteralPath $directory) -or (Test-Path -LiteralPath $appDirectory) -or (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'SanduBAH/workspace'))) { throw 'Existing application or test data would violate the clean-VM requirement.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
foreach ($folder in @('Documents','AppData/Roaming','AppData/Local','.claude','.codex')) { New-Item -ItemType Directory -Path (Join-Path $homeDirectory $folder) -Force | Out-Null }
$env:SANDUBAH_VISITOR_DIRECTORY = $directory
$env:SANDUBAH_VISITOR_HOME = $homeDirectory
$env:SANDUBAH_TEST_TOOLS = Join-Path $directory 'tools'
$stage = 'prepare-browser-controller'
$report = [ordered]@{schema=1;infrastructurePassed=$false;fullFlowPassed=$false;authenticationPerformed=$false;modelCalls=0;workerLimit=1;provider=$env:SANDUBAH_VISITOR_PROVIDER;site='https://lgsmangolt.github.io/SanduBAH/';installerSha256=$env:SANDUBAH_EXPECTED_SHA256;environment='Fresh GitHub-hosted Windows Server 2025 VM; application profile empty and isolated';runId=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;workflowUrl="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID";personalProjectsIncluded=$false;personalCredentialsIncluded=$false;installerMode='Actual NSIS per-user installation with /S /currentuser; interactive wizard and Windows reputation prompts not exercised'}
function Invoke-OwnProcess([string]$File,[string[]]$Arguments,[int]$Timeout=180000,[switch]$OriginalProfile) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $File
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.WorkingDirectory = $homeDirectory
    $info.Environment.Clear()
    foreach ($name in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','PATH','PATHEXT','OS','USERNAME','USERDOMAIN','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramW6432','GITHUB_ACTIONS','RUNNER_ENVIRONMENT','RUNNER_OS','GITHUB_REPOSITORY','RUNNER_TEMP','SANDUBAH_VISITOR_DIRECTORY','SANDUBAH_VISITOR_HOME','SANDUBAH_TEST_TOOLS','SANDUBAH_EXPECTED_SHA256','SANDUBAH_SITE_INDEX_SHA256','SANDUBAH_SITE_APP_SHA256','SANDUBAH_VISITOR_PROVIDER')) { $value = [Environment]::GetEnvironmentVariable($name); if ($value) { $info.Environment[$name] = $value } }
    $info.Environment['USERPROFILE'] = if ($OriginalProfile) { $env:USERPROFILE } else { $homeDirectory }
    $info.Environment['HOME'] = $info.Environment['USERPROFILE']
    $info.Environment['HOMEDRIVE'] = [IO.Path]::GetPathRoot($info.Environment['USERPROFILE']).TrimEnd('\')
    $info.Environment['HOMEPATH'] = $info.Environment['USERPROFILE'].Substring($info.Environment['HOMEDRIVE'].Length)
    $info.Environment['APPDATA'] = if ($OriginalProfile) { $env:APPDATA } else { Join-Path $homeDirectory 'AppData/Roaming' }
    $info.Environment['CLAUDE_CONFIG_DIR'] = Join-Path $homeDirectory '.claude'
    $info.Environment['CODEX_HOME'] = Join-Path $homeDirectory '.codex'
    $info.Environment['CODEX_NON_INTERACTIVE'] = '1'
    $info.Environment['DISABLE_AUTOUPDATER'] = '1'
    $info.Environment['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1'
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'The test-owned child process could not start.' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($Timeout)) { & "$env:SystemRoot/System32/taskkill.exe" /PID $process.Id /T /F | Out-Null; throw "The $stage test-owned child exceeded its deadline." }
    $output = $stdout.GetAwaiter().GetResult()
    $errorOutput = $stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { if ($stage -in @('install-official-provider','installed-connection-panel','official-login-boundary')) { Write-Host (($output + $errorOutput).Substring(0,[Math]::Min(5000,($output + $errorOutput).Length)).Replace($homeDirectory,'[empty VM profile]')) }; throw "The $stage child failed with code $($process.ExitCode). No raw authentication output is published." }
    return $output
}
try {
    Write-Host 'Preparing the pinned browser controller without package install scripts.'
    $archive = Join-Path $directory 'playwright-core-1.64.0.tgz'
    Invoke-WebRequest -Uri 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.0.tgz' -OutFile $archive
    $algorithm = [Security.Cryptography.SHA512]::Create()
    $integrity = 'sha512-' + [Convert]::ToBase64String($algorithm.ComputeHash([IO.File]::ReadAllBytes($archive)))
    $algorithm.Dispose()
    if ($integrity -ne 'sha512-T9r+MZkTECl2+oUcZ26YgZzTrYidTsIhYYkJix+6iDOymOb1FB2RLLSOxRGnZGv5DStt+aduIVbt+E8WygXYpg==') { throw 'Browser controller integrity failed.' }
    $packageDirectory = Join-Path $env:SANDUBAH_TEST_TOOLS 'node_modules/playwright-core'
    New-Item -ItemType Directory -Path $packageDirectory -Force | Out-Null
    & "$env:SystemRoot/System32/tar.exe" -xf $archive -C $packageDirectory --strip-components=1
    if ($LASTEXITCODE -ne 0) { throw 'Pinned browser controller extraction failed.' }
    $node = (Get-Command node).Source
    $providerJson = & $node -e 'console.log(JSON.stringify(require(process.argv[1]).providerDefinition(process.argv[2])))' (Join-Path $PSScriptRoot 'providers.cjs') $env:SANDUBAH_VISITOR_PROVIDER
    if ($LASTEXITCODE -ne 0) { throw 'Provider definition could not be loaded.' }
    $provider = $providerJson | ConvertFrom-Json
    if ($provider.bootstrapSha256 -ne $env:SANDUBAH_PROVIDER_BOOTSTRAP_SHA256) { throw 'The provider bootstrap audit hash is inconsistent.' }
    $stage = 'website-download-and-tutorial'
    Write-Host "Opening the public site, clicking Download, and following the $($provider.name) documentation link."
    Invoke-OwnProcess $node @((Join-Path $PSScriptRoot 'site-journey.cjs'),'download') 780000 | Out-Null
    $download = Get-Content -LiteralPath (Join-Path $directory 'download.json') -Raw | ConvertFrom-Json
    if (-not $download.passed -or -not $download.downloadedByBrowserClick) { throw 'The real website download did not produce a valid receipt.' }
    $stage = 'install-desktop'
    Write-Host 'Installing the exact executable downloaded through the public website.'
    $installer = Join-Path $directory 'SanduBAH-Setup-0.1.0-x64.exe'
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $env:SANDUBAH_EXPECTED_SHA256) { throw 'Downloaded installer does not match the published audit hash.' }
    Invoke-OwnProcess $installer @('/S','/currentuser') 240000 -OriginalProfile | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'SanduBAH.exe'))) { throw 'The downloaded desktop installation failed.' }
    $stage = 'install-official-provider'
    Write-Host "Installing the official native $($provider.name) CLI with default paths and an empty profile, without an account."
    if ($download.provider -ne $provider.id -or $download.bootstrapUrl -ne $provider.bootstrapUrl) { throw 'The public tutorial did not lead to the expected official provider.' }
    $bootstrap = Join-Path $directory 'provider-bootstrap.ps1'
    Invoke-WebRequest -Uri $download.bootstrapUrl -OutFile $bootstrap
    if ((Get-FileHash -LiteralPath $bootstrap -Algorithm SHA256).Hash.ToLowerInvariant() -ne $env:SANDUBAH_PROVIDER_BOOTSTRAP_SHA256) { throw 'The official provider bootstrap changed since it was inspected; execution blocked.' }
    $arguments = @('-NoProfile','-File',$bootstrap)
    if ($provider.id -eq 'codex') {
        $metadata = Invoke-RestMethod -Uri "https://releases.openai.com/codex/releases/$($provider.release)/release.json"
        $asset = $metadata.assets | Where-Object name -eq 'codex-package-x86_64-pc-windows-msvc.tar.gz'
        if ($metadata.tag_name -ne "rust-v$($provider.release)" -or $asset.digest -ne "sha256:$($provider.packageSha256)") { throw 'The pinned official Codex package metadata changed.' }
        $arguments += @('-Release',$provider.release)
    }
    Invoke-OwnProcess (Get-Command pwsh).Source $arguments 300000 | Out-Null
    $executable = if ($provider.id -eq 'codex') { Join-Path $env:LOCALAPPDATA 'Programs/OpenAI/Codex/bin/codex.exe' } else { Join-Path $homeDirectory '.local/bin/claude.exe' }
    if (-not (Test-Path -LiteralPath $executable)) { throw 'The native CLI was not placed in its documented default location.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $executable
    if ($provider.id -eq 'claude' -and ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Anthropic')) { throw 'The official provider executable signature could not be verified.' }
    $version = Invoke-OwnProcess $executable @('--version') 60000
    $match = [regex]::Match($version,'\b\d+\.\d+\.\d+\b')
    if (-not $match.Success) { throw 'The installed provider did not report a version.' }
    if ($provider.id -eq 'codex' -and $match.Value -ne $provider.release) { throw 'The installed Codex version does not match the pinned release.' }
    $report.providerVersion = $match.Value
    $report.providerWindowsSignature = [string]$signature.Status
    $report.providerBootstrapSha256 = $provider.bootstrapSha256
    $report.providerExecutableSha256 = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($provider.id -eq 'codex') { $report.providerPackageSha256 = $provider.packageSha256 }
    $stage = 'installed-connection-panel'
    Write-Host 'Checking the real MCP, empty projects, provider CLI detection and login-required state.'
    Invoke-OwnProcess $node @((Join-Path $PSScriptRoot 'site-journey-installed.cjs')) 540000 | Out-Null
    $stage = 'official-login-boundary'
    Write-Host 'Opening the official authentication boundary without entering or transferring credentials.'
    Invoke-OwnProcess $node @((Join-Path $PSScriptRoot 'site-journey.cjs'),'authentication') 180000 | Out-Null
    $authentication = Get-Content -LiteralPath (Join-Path $directory 'authentication.json') -Raw | ConvertFrom-Json
    $installed = Get-Content -LiteralPath (Join-Path $directory 'installed.json') -Raw | ConvertFrom-Json
    $report.installed = $installed
    $report.authentication = $authentication
    if (-not $authentication.passedUntilLogin -or $authentication.authenticated) { throw 'The unauthenticated boundary was not confirmed safely.' }
    if (-not $installed.passed) { $stage = 'installed-provider-integration'; throw 'The official native provider installed, but the published application did not complete its provider integration. The test is not approved.' }
    $report.infrastructurePassed = $true
    $report.boundary = 'Manual provider login required. No authenticated model response was tested.'
    $report.checks = @('public-website-opened','exact-audited-site-content','installer-downloaded-by-browser-click','installer-SHA256-matched','public-tutorial-followed','official-provider-doc-opened','actual-desktop-installed','official-native-provider-installed','provider-version-and-audited-bootstrap-verified','real-bundled-stdio-MCP-connected','zero-personal-projects','CLI-detected-with-login-required','unauthenticated-send-disabled','official-OAuth-browser-boundary-opened','no-credentials-transferred','no-model-call')
} catch {
    $report.failedStage = $stage
    $report.failure = 'This stage did not complete; the complete authenticated user journey is not approved.'
    Write-Host "Validation stopped at $stage."
    Write-Host $_.Exception.Message
} finally {
    if (Test-Path -LiteralPath (Join-Path $directory 'download.json')) { $report.download = Get-Content -LiteralPath (Join-Path $directory 'download.json') -Raw | ConvertFrom-Json }
    if (Test-Path -LiteralPath (Join-Path $directory 'installed.json')) { $report.installed = Get-Content -LiteralPath (Join-Path $directory 'installed.json') -Raw | ConvertFrom-Json }
    if (Test-Path -LiteralPath (Join-Path $directory 'authentication.json')) { $report.authentication = Get-Content -LiteralPath (Join-Path $directory 'authentication.json') -Raw | ConvertFrom-Json }
    if (Test-Path -LiteralPath (Join-Path $directory 'installed-progress.json')) { $report.installedProgress = Get-Content -LiteralPath (Join-Path $directory 'installed-progress.json') -Raw | ConvertFrom-Json }
    if (Test-Path -LiteralPath (Join-Path $directory 'authentication-progress.json')) { $report.authenticationProgress = Get-Content -LiteralPath (Join-Path $directory 'authentication-progress.json') -Raw | ConvertFrom-Json }
    $report.checkedAt = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence 'report.json') -Encoding utf8NoBOM
}
if (-not $report.infrastructurePassed) { throw 'Visitor validation did not complete up to the manual-authentication boundary.' }
Write-Host 'The website-to-installation journey passed up to manual login. Authentication and model responses remain untested.'

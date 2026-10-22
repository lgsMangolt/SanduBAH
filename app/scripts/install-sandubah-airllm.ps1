param(
  [Parameter(Mandatory=$true)][string]$Python,
  [Parameter(Mandatory=$true)][string]$Uv
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target=Join-Path $root 'build\sandubah\airllm'
$drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($target).TrimEnd('\',':'))
if($drive.Free -lt 20GB){throw 'Libere pelo menos 20 GiB antes de instalar o planejador local.'}
$cursor=$target
while($cursor.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){
  if(Test-Path -LiteralPath $cursor){if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Links em diretório de instalação não são permitidos.'}}
  if($cursor -eq $root){break}
  $cursor=[IO.Path]::GetDirectoryName($cursor)
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
$env:UV_CACHE_DIR=Join-Path $target 'uv-cache'
$env:UV_NO_CACHE='1'
$env:UV_CONCURRENT_DOWNLOADS='1'
$env:UV_CONCURRENT_INSTALLS='1'
$env:UV_CONCURRENT_BUILDS='1'
$env:UV_PYTHON_DOWNLOADS='never'
$env:PIP_DISABLE_PIP_VERSION_CHECK='1'
$env:PYTHONNOUSERSITE='1'
$environment=Join-Path $target 'venv'
if(!(Test-Path -LiteralPath (Join-Path $environment 'Scripts\python.exe'))){
  & $Uv venv --python $Python $environment
  if($LASTEXITCODE -ne 0){throw 'Não foi possível criar o ambiente Python local.'}
}
$interpreter=Join-Path $environment 'Scripts\python.exe'
& $Uv pip install --python $interpreter --no-cache --index-url https://download.pytorch.org/whl/cu128 'torch==2.7.1+cu128' 'torchvision==0.22.1+cu128'
if($LASTEXITCODE -ne 0){throw 'Instalação local do PyTorch falhou.'}
& $Uv pip install --python $interpreter --no-cache --index-url https://pypi.org/simple 'airllm==4.0.0' 'transformers==5.20.2' 'bitsandbytes==0.50.2' 'accelerate==1.15.0' 'Pillow==13.0.0' 'nvidia-ml-py'
if($LASTEXITCODE -ne 0){throw 'Instalação local do AirLLM falhou.'}
& $Uv pip freeze --python $interpreter | Set-Content -LiteralPath (Join-Path $target 'requirements.lock.txt') -Encoding utf8
& $interpreter -I -c "from importlib.metadata import version; print({name:version(name) for name in ['torch','torchvision','airllm','transformers','bitsandbytes']}); print('Pacotes instalados; importação CUDA e inferência ainda não validadas.')"
if($LASTEXITCODE -ne 0){throw 'Não foi possível verificar os metadados dos pacotes instalados.'}
Write-Output "Runtime isolado: $interpreter"

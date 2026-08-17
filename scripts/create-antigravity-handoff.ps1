[CmdletBinding()]
param(
  [string]$OutputPath = 'D:\Hassaan\Projects\personal-os-antigravity-handoff-2026-08-02.zip'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$fullRepositoryRoot = [System.IO.Path]::GetFullPath($repositoryRoot)
$fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("personal-os-antigravity-$([guid]::NewGuid().ToString('N'))")
$bundleRoot = Join-Path $temporaryRoot 'personal-os'
$success = $false

function Get-RelativePath {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Path
  )

  $rootUri = [Uri]::new(([System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'))
  $pathUri = [Uri]::new([System.IO.Path]::GetFullPath($Path))
  return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace('/', '\')
}

function Get-RelativeRepositoryPath {
  param([Parameter(Mandatory)][string]$Path)

  return Get-RelativePath -Root $fullRepositoryRoot -Path $Path
}

function Test-ExcludedPath {
  param([Parameter(Mandatory)][string]$RelativePath)

  $segments = $RelativePath -split '[\\/]'
  $excludedDirectories = @(
    '.git', 'node_modules', '.pnpm-store', '.turbo', '.next', 'dist', 'build',
    'coverage', '.expo', '.cache', 'tmp', 'temp', 'logs'
  )
  if ($segments | Where-Object { $excludedDirectories -contains $_ }) {
    return $true
  }
  if ($RelativePath -match '(^|[\\/])supabase[\\/]\.temp([\\/]|$)') {
    return $true
  }

  $name = Split-Path -Leaf $RelativePath
  if ($name -ine '.env.example' -and $name -match '(?i)^\.env(?:$|\.)') {
    return $true
  }
  if ($name -match '(?i)\.(zip|apk|aab|ipa|log|pem|key|p12|pfx|jks|keystore|tsbuildinfo)$') {
    return $true
  }
  if ($name -ieq 'db-inspect.json') {
    return $true
  }
  return $false
}

function Copy-IncludedPath {
  param([Parameter(Mandatory)][string]$RelativePath)

  $sourcePath = Join-Path $fullRepositoryRoot $RelativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Required handoff path is missing: $RelativePath"
  }

  $item = Get-Item -LiteralPath $sourcePath -Force
  $files = if ($item.PSIsContainer) {
    Get-ChildItem -LiteralPath $sourcePath -Force -File -Recurse
  } else {
    @($item)
  }
  foreach ($file in $files) {
    $relative = Get-RelativeRepositoryPath -Path $file.FullName
    if (Test-ExcludedPath -RelativePath $relative) {
      continue
    }
    $destination = Join-Path $bundleRoot $relative
    $destinationDirectory = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }
}

function Test-TextFile {
  param([Parameter(Mandatory)][string]$Path)

  $name = Split-Path -Leaf $Path
  if ($name -ieq '.env.example' -or $name -like '*.json.example' -or $name -in @('.gitignore', '.nvmrc', '.npmrc')) {
    return $true
  }
  return ([System.IO.Path]::GetExtension($Path).ToLowerInvariant() -in @(
    '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml',
    '.toml', '.sql', '.ps1', '.py', '.sh', '.cmd', '.css', '.html', '.xml'
  ))
}

function Invoke-SecretAudit {
  param([Parameter(Mandatory)][string]$Root)

  $violations = [System.Collections.Generic.List[string]]::new()
  $patterns = [ordered]@{
    'service-role-assignment' = '(?i)(?:supabase[_-]?)?(?:service[_-]?role|secret)[_-]?(?:key)?\s*[:=]\s*["'']?(?!placeholder|example|your_|<)[A-Za-z0-9._-]{20,}'
    'database-url-password' = '(?i)postgres(?:ql)?://[^\s/:]+:[^\s@]{1,}@'
    'github-token' = '(?i)\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b'
    'gitlab-token' = '(?i)\bglpat-[A-Za-z0-9_-]{20,}\b'
    'slack-token' = '(?i)\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{20,}\b'
    'google-api-key' = '\bAIza[0-9A-Za-z_-]{30,}\b'
    'openai-key' = '\bsk-[0-9A-Za-z_-]{20,}\b'
  }

  foreach ($file in Get-ChildItem -LiteralPath $Root -Force -File -Recurse) {
    $relative = (Get-RelativePath -Root $Root -Path $file.FullName).Replace('\', '/')
    if ((Test-ExcludedPath -RelativePath $relative) -or -not (Test-TextFile -Path $file.FullName)) {
      $violations.Add("$relative [forbidden-file-or-nontext]")
      continue
    }
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($entry in $patterns.GetEnumerator()) {
      if ([regex]::IsMatch($content, $entry.Value)) {
        $violations.Add("$relative [$($entry.Key)]")
      }
    }
  }

  if ($violations.Count -gt 0) {
    Write-Host 'SECRET_AUDIT_FAILED: archive was not created. Filenames and safe reason codes follow.'
    $violations | Sort-Object -Unique | ForEach-Object { Write-Host $_ }
    throw 'Secret or forbidden-file audit failed.'
  }
}

function Get-BundleRelativeFiles {
  param([Parameter(Mandatory)][string]$Root)

  return Get-ChildItem -LiteralPath $Root -Force -File -Recurse |
    ForEach-Object { (Get-RelativePath -Root $Root -Path $_.FullName).Replace('\', '/') } |
    Sort-Object
}

try {
  $repositoryPrefix = $fullRepositoryRoot.TrimEnd('\') + '\'
  if ($fullOutputPath.Equals($fullRepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $fullOutputPath.StartsWith($repositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The handoff ZIP must be outside the repository so it cannot include itself.'
  }
  if (Test-Path -LiteralPath $fullOutputPath) {
    throw "Refusing to overwrite an existing handoff archive: $fullOutputPath"
  }

  New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null
  $includePaths = @(
    '.agents', '.codex', '.github', 'apps', 'packages', 'supabase', 'scripts', 'docs',
    'AGENTS.md', 'START_HERE.md', 'README.md', 'package.json', 'pnpm-lock.yaml',
    'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.base.json', 'eslint.config.mjs',
    '.prettierrc.json', '.nvmrc', '.npmrc', '.gitignore', '.env.example'
  )
  foreach ($includePath in $includePaths) {
    Copy-IncludedPath -RelativePath $includePath
  }

  $createdAt = Get-Date -Format o
  $branch = (& git -C $fullRepositoryRoot branch --show-current).Trim()
  $commit = (& git -C $fullRepositoryRoot rev-parse HEAD).Trim()
  $nodeVersion = (& node --version).Trim()
  $pnpmVersion = (& pnpm --version).Trim()
  @(
    "creation_time=$createdAt",
    "git_branch=$branch",
    "git_commit=$commit",
    'working_tree_note=Uncommitted working-tree files are included when they are in the allowed project paths.',
    "node_version=$nodeVersion",
    "pnpm_version=$pnpmVersion"
  ) | Set-Content -LiteralPath (Join-Path $bundleRoot 'HANDOFF_CREATED_AT.txt') -Encoding utf8

  Invoke-SecretAudit -Root $bundleRoot

  $manifestPath = Join-Path $bundleRoot 'HANDOFF_MANIFEST.txt'
  $manifestFiles = @(Get-BundleRelativeFiles -Root $bundleRoot) + 'HANDOFF_MANIFEST.txt'
  $manifestFiles | Sort-Object -Unique | Set-Content -LiteralPath $manifestPath -Encoding utf8

  $hashPath = Join-Path $bundleRoot 'HANDOFF_SHA256.txt'
  @('# SHA-256 hashes for all bundle files except this self-referential hash file.') | Set-Content -LiteralPath $hashPath -Encoding utf8
  Get-BundleRelativeFiles -Root $bundleRoot |
    Where-Object { $_ -ne 'HANDOFF_SHA256.txt' } |
    ForEach-Object {
      $hash = (Get-FileHash -LiteralPath (Join-Path $bundleRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $_"
    } | Add-Content -LiteralPath $hashPath -Encoding utf8

  Compress-Archive -Path $bundleRoot -DestinationPath $fullOutputPath -CompressionLevel Optimal

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($fullOutputPath)
  try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    $requiredEntries = @(
      'personal-os/AGENTS.md',
      'personal-os/START_HERE.md',
      'personal-os/docs/antigravity/START_HERE.md',
      'personal-os/pnpm-lock.yaml',
      'personal-os/supabase/migrations/20260717000000_create_profiles.sql'
    )
    foreach ($entry in $requiredEntries) {
      if ($entries -notcontains $entry) { throw "Archive is missing required file: $entry" }
    }
    $agentEntries = @($entries | Where-Object { $_ -match '^personal-os/\.agents/agents/[^/]+/agent\.md$' })
    if ($agentEntries.Count -ne 9) { throw "Archive must contain nine custom agent definitions; found $($agentEntries.Count)." }
    $forbiddenArchiveEntries = $entries | Where-Object {
      $_ -match '(^|/)(\.git|node_modules|\.pnpm-store|\.turbo|\.next|dist|build|coverage|\.expo|\.cache|tmp|temp|logs)(/|$)' -or
      $_ -match '(^|/)supabase/\.temp(/|$)' -or
      $_ -match '(?i)\.(zip|apk|aab|ipa|log|pem|key|p12|pfx|jks|keystore)$' -or
      (($_ -match '(?i)(^|/)\.env(?:$|\.)') -and ($_ -notmatch '(?i)\.env\.example$')) -or
      $_ -match '(?i)(^|/)db-inspect\.json$'
    }
    if ($forbiddenArchiveEntries) {
      throw "Archive contains excluded paths: $($forbiddenArchiveEntries -join ', ')"
    }

    $dirtyPaths = & git -C $fullRepositoryRoot status --porcelain --untracked-files=all |
      ForEach-Object {
        if ($_.Length -lt 4) { return }
        $path = $_.Substring(3).Trim()
        if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1] }
        $path
      }
    foreach ($dirtyPath in $dirtyPaths) {
      if (-not (Test-ExcludedPath -RelativePath $dirtyPath)) {
        $expectedEntry = 'personal-os/' + $dirtyPath.Replace('\', '/')
        if ($entries -notcontains $expectedEntry) {
          throw "Archive omitted allowed dirty worktree file: $dirtyPath"
        }
      }
    }
  } finally {
    $archive.Dispose()
  }

  $fileCount = (Get-BundleRelativeFiles -Root $bundleRoot).Count
  $sizeBytes = (Get-Item -LiteralPath $fullOutputPath).Length
  Write-Output "HANDOFF_CREATED=$fullOutputPath"
  Write-Output "HANDOFF_FILE_COUNT=$fileCount"
  Write-Output "HANDOFF_SIZE_BYTES=$sizeBytes"
  $success = $true
} finally {
  if ($success -and (Test-Path -LiteralPath $temporaryRoot)) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

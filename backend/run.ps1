$ErrorActionPreference = "Stop"
$bundledMaven = Join-Path $PSScriptRoot "..\Tools\apache-maven-3.10.0\bin"
if (Test-Path (Join-Path $bundledMaven "mvn.cmd")) {
    $env:PATH = "$(Resolve-Path $bundledMaven);$env:PATH"
}

$configPath = Join-Path $PSScriptRoot ".env"
$examplePath = Join-Path $PSScriptRoot ".env.example"

if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
    throw "Apache Maven is required. Install Maven and ensure 'mvn' is on PATH."
}
if (-not (Test-Path $configPath)) {
    Copy-Item $examplePath $configPath
    Write-Host "Created backend\.env from the example. Review its MySQL settings before continuing."
}

Get-Content $configPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$env:VOLTX_WEB_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
mvn -f (Join-Path $PSScriptRoot "pom.xml") compile exec:java

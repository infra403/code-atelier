# Run from PowerShell: .\install-windows.ps1
# This script does not change PowerShell execution policy.
param([switch]$ConfigureOnly)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not $ConfigureOnly) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'Please install App Installer (winget) from Microsoft Store, or install VS Code, Node.js 24+, Python 3.13 and Go 1.27+ manually and rerun with -ConfigureOnly.'
    }
    $packages = @('Microsoft.VisualStudioCode', 'OpenJS.NodeJS.LTS', 'Python.Python.3.13', 'GoLang.Go')
    foreach ($package in $packages) {
        & winget install --exact --id $package --source winget --no-upgrade
        # Official WinGet codes: UPDATE_NOT_APPLICABLE, PACKAGE_ALREADY_INSTALLED,
        # INSTALL_ALREADY_INSTALLED and INSTALL_DOWNGRADE. Runtime versions are checked later.
        if ($LASTEXITCODE -notin @(0, -1978335189, -1978335135, -1978334963, -1978334962)) {
            throw "winget failed for $package (exit $LASTEXITCODE). Complete installation manually, reopen PowerShell, then run with -ConfigureOnly."
        }
    }
}
# Refresh PATH after MSI/user installers. Preserve this shell's custom entries.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js was not found. Reopen PowerShell and run with -ConfigureOnly.' }
& npm.cmd ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
& node scripts/setup.mjs
if ($LASTEXITCODE -ne 0) { throw 'VS Code configuration failed. See output above.' }

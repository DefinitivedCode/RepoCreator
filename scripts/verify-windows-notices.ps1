param(
    [Parameter(Mandatory)][string]$Msi,
    [Parameter(Mandatory)][string]$ReleaseDirectory
)
$ErrorActionPreference = 'Stop'
$expected = @{}
foreach ($name in @('LICENSE', 'THIRD_PARTY_NOTICES.txt')) {
    $source = Get-Item -LiteralPath $name
    $resource = Join-Path $ReleaseDirectory $name
    if ((Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $resource -Algorithm SHA256).Hash) {
        throw "Release resource differs from source notice: $name"
    }
    $expected[$name] = $source.Length
}
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase((Resolve-Path -LiteralPath $Msi).Path, 0)
$view = $database.OpenView('SELECT `FileName`, `FileSize` FROM `File`')
$view.Execute()
$found = @{}
while ($record = $view.Fetch()) {
    $name = ($record.StringData(1) -split '\|')[-1]
    if ($expected.ContainsKey($name)) {
        if ($found.ContainsKey($name) -or $record.IntegerData(2) -ne $expected[$name]) {
            throw "MSI notice entry is duplicated or has the wrong size: $name"
        }
        $found[$name] = $true
    }
}
$view.Close()
if ($found.Count -ne $expected.Count) { throw 'MSI is missing a required license or third-party notice.' }

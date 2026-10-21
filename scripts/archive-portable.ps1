param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Destination
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Destination) { throw 'Portable archive already exists.' }
$files = @(Get-ChildItem -LiteralPath $Source -File)
if ($files.Count -ne 4) { throw 'Portable archive requires executable, license, notices and instructions.' }
Compress-Archive -LiteralPath $files.FullName -DestinationPath $Destination -CompressionLevel Optimal
if (-not (Test-Path -LiteralPath $Destination)) { throw 'Portable archive was not created.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Destination).Path)
try {
    if ($archive.Entries.Count -ne $files.Count) { throw 'Portable archive has an unexpected file inventory.' }
    foreach ($file in $files) {
        $entry = $archive.GetEntry($file.Name)
        if ($null -eq $entry) { throw "Portable archive is missing $($file.Name)" }
        $stream = $entry.Open()
        $hash = [System.Security.Cryptography.SHA256]::Create()
        try {
            $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '')
            $sourceStream = [System.IO.File]::OpenRead($file.FullName)
            try {
                $expected = [BitConverter]::ToString($hash.ComputeHash($sourceStream)).Replace('-', '')
            } finally {
                $sourceStream.Dispose()
            }
            if ($actual -ne $expected) {
                throw "Portable archive content differs from source: $($file.Name)"
            }
        } finally {
            $hash.Dispose()
            $stream.Dispose()
        }
    }
} finally {
    $archive.Dispose()
}

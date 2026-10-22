$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
$source = Join-Path $projectRoot 'desktop\native\GuaguaDesktopBridge.cs'
$target = Join-Path $projectRoot 'desktop\native\GuaguaDesktopBridge.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 "/out:$target" "/reference:$framework\WPF\UIAutomationClient.dll" "/reference:$framework\WPF\UIAutomationTypes.dll" "/reference:$framework\WPF\WindowsBase.dll" /reference:System.Web.Extensions.dll $source
if ($LASTEXITCODE -ne 0) { throw '桌面桥接程序构建失败' }
Get-Item -LiteralPath $target | Select-Object FullName,Length
$notificationSource = Join-Path $projectRoot 'desktop\native\GuaguaNotifications.cs'
$notificationTarget = Join-Path $projectRoot 'desktop\native\GuaguaNotifications.exe'
$metadata = Join-Path $env:WINDIR 'System32\WinMetadata'
$runtimeFacade = Get-ChildItem -LiteralPath "$env:WINDIR\Microsoft.NET\assembly\GAC_MSIL\System.Runtime" -Recurse -Filter System.Runtime.dll | Select-Object -First 1 -ExpandProperty FullName
$tasksFacade = Get-ChildItem -LiteralPath "$env:WINDIR\Microsoft.NET\assembly\GAC_MSIL\System.Threading.Tasks" -Recurse -Filter System.Threading.Tasks.dll | Select-Object -First 1 -ExpandProperty FullName
& $compiler /nologo /target:exe /optimize+ /platform:x64 "/out:$notificationTarget" /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/reference:$runtimeFacade" "/reference:$tasksFacade" "/reference:$framework\System.Runtime.WindowsRuntime.dll" "/reference:$framework\System.Runtime.InteropServices.WindowsRuntime.dll" "/reference:$metadata\Windows.Foundation.winmd" "/reference:$metadata\Windows.UI.winmd" "/reference:$metadata\Windows.ApplicationModel.winmd" $notificationSource
if ($LASTEXITCODE -ne 0) { throw '通知桥接程序构建失败' }
Get-Item -LiteralPath $notificationTarget | Select-Object FullName,Length

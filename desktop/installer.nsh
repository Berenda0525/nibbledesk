!macro guaguaDefaultDirectory
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${StdUtils.GetParameter} $R0 "D" ""
  ${If} $0 == ""
  ${AndIf} $R0 == ""
    ${If} ${FileExists} "E:\*.*"
      StrCpy $INSTDIR "E:\${PRODUCT_FILENAME}"
    ${ElseIf} ${FileExists} "D:\*.*"
      StrCpy $INSTDIR "D:\${PRODUCT_FILENAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro guaguaDefaultDirectory
!macroend

!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    StrCpy $installMode CurrentUser
    SetShellVarContext current
    !insertmacro guaguaDefaultDirectory
    Abort
  !endif
!macroend

!macro customPageAfterChangeDir
  ; Keep the exact directory chosen by the user; the default already has an app folder.
  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif
  Function guaguaPreserveChosenDirectory
    Push $INSTDIR
    Call instFilesPre
    Pop $INSTDIR
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE guaguaPreserveChosenDirectory
!macroend

!macro customInstall
  ; Versioned icon paths let Windows refresh shortcuts after an upgrade.
  File /oname=$INSTDIR\resources\guagua-hamster-${VERSION}.ico "${UNINSTALLER_ICON}"
  ${If} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\guagua-hamster-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x2000, i 0x1005, w "$newDesktopLink", p 0)'
  ${EndIf}
  ${If} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\guagua-hamster-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x2000, i 0x1005, w "$newStartMenuLink", p 0)'
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; Retain installation-local user data and caches during upgrades and uninstall.
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  Delete "$INSTDIR\uninstallerIcon.ico"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\guagua-hamster-${VERSION}.ico"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
  Delete "$INSTDIR\resources\elevate.exe"
  RMDir /r "$INSTDIR\resources\office-runtime"
  RMDir /r "$INSTDIR\resources\speech"
  RMDir /r "$INSTDIR\resources\native"
  RMDir /r "$INSTDIR\resources\source"
  RMDir "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  RMDir "$INSTDIR"
!macroend

Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "1.0.2"
!endif
!ifndef VERSION4
  !define VERSION4 "1.0.2.0"
!endif
!ifndef APP_DIR
  !error "APP_DIR must point at the unpacked Windows app."
!endif
!ifndef OUTFILE
  !define OUTFILE "release/Downy-Downloader-${VERSION}-windows-x64-setup.exe"
!endif

Name "Downy Downloader"
BrandingText "Downy Downloader"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Downy Downloader"
InstallDirRegKey HKCU "Software\Downy Downloader" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64

VIProductVersion "${VERSION4}"
VIAddVersionKey /LANG=1033 "ProductName" "Downy Downloader"
VIAddVersionKey /LANG=1033 "FileDescription" "Downy Downloader installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "Kai Damiani"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright (C) 2026 Kai Damiani"

!define MUI_ABORTWARNING
!define MUI_ICON "../build/icon.ico"
!define MUI_UNICON "../build/icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Downy Downloader.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Downy Downloader"
!define MUI_FINISHPAGE_LINK "Downy on GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/kaidamiani985-arch/Downy-Downer"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Downy Downloader" SecMain
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}/*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortCut "$DESKTOP\Downy Downloader.lnk" "$INSTDIR\Downy Downloader.exe"
  CreateDirectory "$SMPROGRAMS\Downy Downloader"
  CreateShortCut "$SMPROGRAMS\Downy Downloader\Downy Downloader.lnk" "$INSTDIR\Downy Downloader.exe"
  CreateShortCut "$SMPROGRAMS\Downy Downloader\Uninstall Downy.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Downy Downloader" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "DisplayName" "Downy Downloader"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "Publisher" "Kai Damiani"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "DisplayIcon" "$INSTDIR\Downy Downloader.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader" "EstimatedSize" $0
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Downy Downloader.lnk"
  RMDir /r "$SMPROGRAMS\Downy Downloader"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Downy Downloader"
  DeleteRegKey HKCU "Software\Downy Downloader"
SectionEnd

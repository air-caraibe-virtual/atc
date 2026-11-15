; Installateur d'ATC — contrôle aérien pour Microsoft Flight Simulator 2024
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

!ifndef VERSION
  !define VERSION "0.1.0"
!endif
!ifndef NUMVER
  !define NUMVER "${VERSION}"
!endif
!define APPNAME "ATC"
!define APPEXE "ATC.exe"
!define PUBLISHER "ATC"
!define UNINSTEXE "Désinstaller ATC.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ATCSolo"

Name "${APPNAME}"
Caption "Installation d'ATC ${VERSION}"
BrandingText "ATC ${VERSION} — contrôle aérien pour MSFS 2024"
OutFile "..\dist\ATC-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\ATC"
InstallDirRegKey HKCU "Software\ATCSolo" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails nevershow
ShowUninstDetails nevershow

; Informations visibles dans les propriétés du fichier
VIProductVersion "${NUMVER}.0"
VIAddVersionKey /LANG=1036 "ProductName" "ATC"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation d'ATC"
VIAddVersionKey /LANG=1036 "FileVersion" "${NUMVER}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1036 "CompanyName" "${PUBLISHER}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "© 2026 ATC"

; Apparence
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "..\build\welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "..\build\welcome.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "..\build\header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "..\build\header.bmp"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Voulez-vous vraiment annuler l'installation d'ATC ?"

; Pages
!define MUI_WELCOMEPAGE_TITLE "Bienvenue dans l'installation d'ATC"
!define MUI_WELCOMEPAGE_TEXT "ATC est un contrôleur aérien vocal pour Microsoft Flight Simulator 2024.$\r$\n$\r$\nIl vous guide de la clairance jusqu'au parking : vraies fréquences, phraséologie française ou anglaise, pistes réellement en service, trafic réel et carte de votre route.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
!insertmacro MUI_PAGE_WELCOME
; Présentation d'ATC (4 pages illustrées)
Page custom Slide1
Page custom Slide2
Page custom Slide3
Page custom Slide4
!define MUI_LICENSEPAGE_TEXT_TOP "Avant d'installer, quelques informations utiles :"
!define MUI_LICENSEPAGE_BUTTON "Suivant >"
!define MUI_LICENSEPAGE_TEXT_BOTTOM "Cliquez sur Suivant pour choisir le dossier d'installation."
!insertmacro MUI_PAGE_LICENSE "avant-de-commencer.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "ATC est installé"
!define MUI_FINISHPAGE_TEXT "Lancez Microsoft Flight Simulator 2024, puis ATC. Chargez votre plan de vol SimBrief et contactez la Délivrance.$\r$\n$\r$\nBons vols !"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer ATC maintenant"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"

; ---- Pages de présentation ----
Var SlideDlg
Var SlideCtl
Var SlideImg
!macro SLIDE N TITLE SUB
Function Slide${N}
  !insertmacro MUI_HEADER_TEXT "${TITLE}" "${SUB}"
  nsDialogs::Create 1018
  Pop $SlideDlg
  ${NSD_CreateBitmap} 0 0 100% 100% ""
  Pop $SlideCtl
  File "/oname=$PLUGINSDIR\slide${N}.bmp" "..\build\slide${N}.bmp"
  ${NSD_SetStretchedImage} $SlideCtl "$PLUGINSDIR\slide${N}.bmp" $SlideImg
  nsDialogs::Show
  ${NSD_FreeImage} $SlideImg
FunctionEnd
!macroend
!insertmacro SLIDE 1 "Découvrez ATC (1/4)" "Un vrai contrôleur aérien, à la voix"
!insertmacro SLIDE 2 "Découvrez ATC (2/4)" "Le réalisme du monde réel, en ce moment"
!insertmacro SLIDE 3 "Découvrez ATC (3/4)" "Les vrais vols autour de vous"
!insertmacro SLIDE 4 "Découvrez ATC (4/4)" "Votre vol en un coup d'œil"

Function .onInit
  InitPluginsDir
FunctionEnd

; mise à jour silencieuse lancée par ATC (/S /UPDATE) : on relance ATC à la fin
Function .onInstSuccess
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  IfErrors +2 0
  Exec '"$INSTDIR\${APPEXE}"'
FunctionEnd

Section "ATC (obligatoire)" SecMain
  SectionIn RO
  nsExec::Exec 'taskkill /F /IM "${APPEXE}"'
  nsExec::Exec 'taskkill /F /IM "ATC Solo.exe"'
  ; ancienne version nommée « ATC Solo »
  RMDir /r "$LOCALAPPDATA\Programs\ATC Solo"
  Delete "$DESKTOP\ATC Solo.lnk"
  RMDir /r "$SMPROGRAMS\ATC Solo"

  SetOutPath "$INSTDIR"
  File /r "..\dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\${UNINSTEXE}"

  CreateDirectory "$SMPROGRAMS\ATC"
  CreateShortCut "$SMPROGRAMS\ATC\ATC.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0 SW_SHOWNORMAL "" "Contrôle aérien pour MSFS 2024"
  CreateShortCut "$SMPROGRAMS\ATC\Désinstaller ATC.lnk" "$INSTDIR\${UNINSTEXE}"

  ; « Programmes et fonctionnalités » de Windows
  WriteRegStr HKCU "Software\ATCSolo" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "ATC — contrôle aérien pour MSFS 2024"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${APPEXE}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\${UNINSTEXE}"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Raccourci sur le bureau" SecDesktop
  CreateShortCut "$DESKTOP\ATC.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0 SW_SHOWNORMAL "" "Contrôle aérien pour MSFS 2024"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "Le logiciel ATC et tous ses fichiers."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Ajoute une icône ATC sur le bureau."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APPEXE}"'
  Delete "$DESKTOP\ATC.lnk"
  RMDir /r "$SMPROGRAMS\ATC"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\ATCSolo"
SectionEnd

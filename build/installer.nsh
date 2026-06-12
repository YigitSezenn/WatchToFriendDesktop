; WatchToFriend — Özel NSIS kurulum scripti
; Uygulama açıkken kurulum başlatılırsa sistem hatası yerine
; kullanıcı dostu Türkçe mesaj gösterir.

!macro customInstall
  ; WatchToFriend açık mı kontrol et
  FindWindow $0 "" "WatchToFriend"
  IntCmp $0 0 wtf_notRunning

    ; Uygulama açık — kullanıcıya sor
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
      "WatchToFriend şu an açık.$\n$\nGüncellemek için uygulamanın kapatılması gerekiyor.$\nDevam etmek istiyor musun?" \
      IDOK wtf_doClose IDCANCEL wtf_cancelInstall

    wtf_doClose:
      SendMessage $0 ${WM_CLOSE} 0 0
      Sleep 2500
      Goto wtf_notRunning

    wtf_cancelInstall:
      Abort "Kurulum iptal edildi. WatchToFriend'i kapatıp tekrar deneyin."

  wtf_notRunning:
!macroend

!macro customUnInstall
  FindWindow $0 "" "WatchToFriend"
  IntCmp $0 0 wtf_unNotRunning
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 1500
  wtf_unNotRunning:
!macroend

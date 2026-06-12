# WatchToFriend Desktop — Agent Notları

## Ekran Paylaşımı

- Ekran paylaşımı 720p minimum kaliteye yükseltildi (2026-06-04)
  - CAPTURE_WIDTH: 480 → 1280
  - CAPTURE_HEIGHT: sabit 720 (aspect ratio yerine sabit boyut)
  - JPEG_QUALITY: 0.35 → 0.60
  - FRAME_INTERVAL_MS: 2000 → 1500
  - Canvas çizimi artık 1280×720 sabit boyutla yapılıyor
  - RTDB yazma non-blocking (.then().catch()) olarak korundu

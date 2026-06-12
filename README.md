# WatchToFriend Desktop

Arkadaşlarınızla aynı anda video izlemenizi sağlayan **Windows masaüstü** uygulaması. Sesli sohbet, ekran paylaşımı, gerçek zamanlı chat ve oda senkronizasyonu sunar.

🌐 **Web sitesi:** [watchtofriend.web.app](https://watchtofriend.web.app)  
📱 **Android sürümü:** [WatchToFriend](../WatchToFriend) (ayrı repo)

## Özellikler

- YouTube ve diğer kaynaklardan senkron video izleme
- Sesli sohbet (WebRTC) ve ekran paylaşımı
- Oda oluşturma / katılma, şifreli odalar, davet linkleri
- Türkçe & İngilizce arayüz, açık/koyu tema
- Discord tarzı modern arayüz

## Gereksinimler

- Node.js 20+
- Windows 10/11 (geliştirme ve kurulum)
- Firebase projesi (Auth, Firestore, Realtime Database)

## Kurulum (geliştirme)

```bash
git clone https://github.com/YOUR_USERNAME/WatchToFriendDesktop.git
cd WatchToFriendDesktop
npm install
npm run dev
```

Firebase yapılandırması `src/renderer/src/firebase/config.ts` dosyasındadır. Kendi Firebase projenizi kullanmak için bu dosyayı güncelleyin.

## Windows kurulum paketi oluşturma

```bash
npm run dist
```

Çıktılar `release/` klasöründe:

- `WatchToFriend Setup X.X.X.exe` — kurulum sihirbazı
- `win-unpacked/` — taşınabilir sürüm

## Site deploy (Firebase Hosting)

```bash
npm run deploy:hosting
```

İndirme zip dosyaları repoya **dahil edilmez**; [Firebase Hosting](https://watchtofriend.web.app/downloads/) üzerinden sunulur.

## Proje yapısı

| Klasör | Açıklama |
|--------|----------|
| `src/main/` | Electron ana süreç |
| `src/renderer/` | React arayüz |
| `src/preload/` | IPC köprüsü |
| `public/` | Web sitesi (Firebase Hosting) |
| `build/` | Uygulama ikonları |
| `scripts/` | İkon üretimi, Windows ikon gömme |

## Repoya dahil edilmeyenler

- `node_modules/`, `out/`, `release/` — build çıktıları
- `.env` — ortam değişkenleri
- `public/downloads/*.zip` — büyük kurulum dosyaları
- Firebase service account anahtarları

## Lisans

MIT — detaylar için [LICENSE](LICENSE) dosyasına bakın.

# ROTAPARK — Yayın Öncesi Kabul ve Test Takibi

Güncelleme: 2026-11-06 · Kod sürümü: 6.45

## Doğrulanmış sonuçlar

- **iPhone üzerinde bildirildi:** ROTAPARK 6.49'da kullanıcı “Konuma izin ver” düğmesine bastığında harita mevcut konuma gidiyor; kullanıcı tarafından doğrulandı (2026-11-06).
- **iPhone üzerinde bildirildi:** Otoparka “Yol tarifi” dokunulduğunda hiçbir işlem başlamaması sorunu, kullanıcı tarafından **“Düzeldi”** şeklinde doğrulandı (6.43 sonrası).
- **iPhone üzerinde bildirildi:** Araç ve yaya ulaşım modu seçenekleri arayüzde görünüyor.
- **iPhone ekran görüntüsüyle daha önce görüldü:** Haritada çizilmiş araç rotası ve navigasyon talimatı.
- **iPhone tanılama ekranında daha önce görüldü:** 5/5 servis yanıt verdi; /api/parking, /api/business-parking, /api/walking-route, genel OSRM araç rotası ve /version.json. Bu, servislerin o anda yanıt verdiğini kanıtlar; sürekli erişilebilirliği kanıtlamaz.
- **GitHub kodu:** 6.45 için index.html, version.json ve sw.js güncellendi. Cloudflare dağıtımı ayrıca doğrulanmadı.

## Kritik senaryolar ve doğrulama durumu

| Öncelik | Test | Beklenen sonuç | Durum |
| --- | --- | --- | --- |
| P0 | Otopark A için rota hesaplanırken otopark B'yi seç | İkinci otoparka navigasyon başlar | **iPhone'da kullanıcı doğruladı (2026-11-06)** |
| P0 | Otoparktan araç navigasyonu başlat | Gerçek GPS, doğru hedef, yönlendirme ve mesafe | Uçtan uca tekrar test bekliyor |
| P0 | Otoparktan yaya navigasyonu başlat | Yaya rotası çizilir, GPS takibi başlar | Test bekliyor |
| P0 | GPS iznini reddet | Uygulama donmaz, anlaşılır hata verir | Test bekliyor |
| P0 | Rota hesaplanırken bağlantıyı kes | Zaman aşımı/hata, tekrar deneme mümkün | Test bekliyor |
| P1 | Rota sürerken navigasyondan çık, başka hedef seç | Eski hedef/izleme kalmaz | Test bekliyor |
| P1 | Manuel varış adresi gir | Önceki otopark koordinatına yönlendirme yapılmaz | Test bekliyor (6.44 değişikliği) |
| P1 | GPS takibini durdur ve yeniden başlat | Harita ve talimatlar tutarlı kalır | Test bekliyor |
| P1 | Safari arka plana alıp geri dön | Eski GPS ölçümü güncelmiş gibi gösterilmez | Test bekliyor |
| P1 | Favori ekle, park yerini kaydet, sayfayı yenile | Kayıtlar korunur veya depolama hatası açıklanır | Test bekliyor |
| P2 | Filtrele, karşılaştır, arama yap | İlgili gerçek sonuçlar gösterilir | Test bekliyor |

## Üretim bağımlılıkları ve sınırlar

- Harita Leaflet CDN ve OpenStreetMap döşemelerine bağlı.
- Araç rotası kamuya açık OSRM servisine bağlı. Kullanım/kapasite garantisi yok.
- Yaya rotası /api/walking-route servisine bağlı; yanıt biçimi ve servis erişilebilirliği değişebilir.
- Adres arama ve ters adres çözümleme Nominatim'e bağlı; servis sınırları geçerlidir.
- Otopark doluluk bilgisi her otopark için canlı veya doğrulanmış değildir. Bilinmeyen doluluk “bilinmiyor” olarak sunulmalı.
- Gerçek cihaz testi yapılmadan uygulama “yayına hazır” olarak işaretlenmeyecek.

## Sürüm notları

- 6.43: Uygulama/manifest önbelleği ve sürüm kontrolü eşleştirildi.
- 6.44: Manuel varış değiştiğinde eski otopark hedefi temizleniyor; adres aramasına 10 sn zaman aşımı eklendi.
- 6.45: Yeni otopark önceki rota isteği sürerken seçilirse bekleyen navigasyon yeniden başlatılmak üzere kuyruğa alınıyor.

## Sonraki karar

Yeni küçük özellik eklemek yerine **P0 testlerini gerçek iPhone'da doğrula**. Başarısız olan senaryoların ekran görüntüsü ve durum mesajıyla kök nedeni tespit edilip tek bir düzeltme paketi hazırlanmalı.

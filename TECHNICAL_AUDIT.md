# ROTAPARK — Teknik Denetim ve Yayına Hazırlık

Tarih: 2026-11-06
Durum: Kaynak kod üzerinden ön denetim. Canlı servisler, Cloudflare dağıtımı ve iPhone Safari testi **doğrulanmadı**.

## İncelenen alan
- `index.html`: yaklaşık 100 KB tek sayfa uygulama, 87 HTML ID.
- Aynı ID'nin tekrarlandığı veya `$('id')` biçimindeki doğrudan DOM başvurularının eksik olduğu saptanmadı.
- Arayüzde otopark arama/filtreleme, karşılaştırma, kayıtlı park konumu, araç ve yaya rotası, GPS navigasyonu bulunuyor.
- `localStorage` park kaydı ve raporlar için kullanılıyor.
- İstemci tarafında harita Leaflet CDN'e bağlı.

## Kritik bağımlılıklar — doğrulama gerekiyor
1. `GET /api/parking?lat=...&lng=...`: `points` dizisi döndürmeli.
2. `GET /api/business-parking?lat=...&lng=...`: `points` dizisi döndürmeli.
3. `GET /api/walking-route?lat1=...&lng1=...&lat2=...&lng2=...`: yaya rotası için `trip.legs` ve `trip.summary` bekleniyor.
4. Araç rotası doğrudan `router.project-osrm.org` genel servisine bağlı; üretim kapasitesi/erişilebilirliği ayrıca doğrulanmalı.
5. Adres araması ve ters geocoding doğrudan `nominatim.openstreetmap.org` servisini kullanıyor; kullanım politikaları, hız sınırları ve başarısızlık senaryoları incelenmeli.

## Kod üzerinden tespitler
- Otopark arama iki API isteğini paralel yürütüyor ve biri başarısız olursa kısmi sonuç gösteriyor. İkisi de başarısız olursa hata veriyor.
- GPS için çok sayıda koruma var; daha fazla mikro optimizasyon yerine gerçek cihaz üzerinde test gerekli.
- `localStorage` yazma yardımcısında hata yakalama yok; Safari özel mod/depolama engelinde kullanıcı işlemi başarısız olabilir.
- Otopark verilerinin canlı doluluk/kapasite doğruluğu yalnızca istemci kodundan teyit edilemez.
- Navigasyon ve otopark bulma uçtan uca test edilmedi.

## Yayın öncesi öncelik sırası
### P0 — Kullanılabilirlik
- Cloudflare Pages dağıtımında üç `/api` endpoint'ini kontrol et; durum kodu, yanıt biçimi ve gerçek sonuçları doğrula.
- iPhone Safari'de konum izni, harita açılışı, otopark bulma ve seçilen otoparka yol tarifi akışını test et.
- Harita ve rota servislerinde ağ kesintisi/hata ekranlarını doğrula.

### P1 — Dayanıklılık
- `localStorage` yazma hatalarını güvenli ele al.
- Üçüncü taraf geocoding/rota servislerine timeout ve uygun kullanıcı mesajları ekle.
- Otopark verilerinin kaynağını ve canlılık/kapasite iddialarını açıkça belirt.

### P2 — Ürün kalitesi
- Arama, filtre, karşılaştırma, park yerini kaydetme ve navigasyon akışları için mobil kabul kontrol listesi oluştur.
- Gerçek test sonuçlarına göre hataları tek bir toplu sürümde düzelt.

## Kabul ölçütleri
1. Harita açılıyor ve konum izni doğru işleniyor.
2. Otopark arama gerçek sonuç gösteriyor veya açık hata mesajı veriyor.
3. Otopark seçimi detay ve yol tarifini açıyor.
4. Araç ve yaya rotası ayrı ayrı çalışıyor.
5. GPS takibi kapatılıp açılabiliyor; arka plandan dönüşte yanıltıcı durum gösterilmiyor.
6. Depolama erişimi reddedilirse uygulama çökmüyor.
7. Testler iPhone Safari üzerinde doğrulanıp kaydediliyor.

Bu dosya doğrulanmamış noktaları 'çalışıyor' olarak işaretlemez.

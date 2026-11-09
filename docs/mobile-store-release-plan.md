# ROTAPARK — iOS, Android ve Web Yayın Planı

Durum: hazırlık aşaması (9 Kasım 2026). Bu belge mağaza onayı veya cihaz testi yapıldığı anlamına gelmez.

## Mevcut temel
- Canlı web uygulaması: rotapark.com.tr
- Tek sayfalı uygulama: `index.html`
- Web manifest: `manifest.webmanifest`
- Henüz yerel iOS/Android projeleri veya Capacitor yapılandırması yok.

## Yol haritası
1. **Web sürümünü sabitle:** navigasyon, başlangıç noktası seçimi, GPS izinleri, otopark fiyat ve konum doğruluğu; gerçek iPhone ve Android cihazlarda test.
2. **Mobil mimari:** mevcut web kodunu derlenebilir `www/` çıktısına taşı; Capacitor ile iOS ve Android projelerini üret. Yerel konum izinleri ve harita/dış navigasyon bağlantılarını platform bazında doğrula. Yalnızca web sitesini açan basit bir sarmalayıcı yerine mağaza incelemesine uygun işlevsel uygulama sağla.
3. **Mağaza varlıkları:** uygulama adı, 1024x1024 ikon kaynağı, açılış görselleri, gerçek cihaz ekran görüntüleri, açıklamalar, destek adresi ve gizlilik politikası URL'si.
4. **Gizlilik ve güvenlik:** konum verisinin kullanım amacı ve saklanması, üçüncü taraf harita/veri servisleri, Apple App Privacy ve Google Play Data Safety beyanları; izin metinleri.
5. **Test ve dağıtım:** iOS için Xcode, imzalama ve TestFlight; Android için Android Studio, imzalı AAB ve Play internal testing; ardından inceleme.
6. **Yayın kapısı:** kritik navigasyon/GPS hatası sıfır, gerçek cihaz testleri tamam, doğru otopark verisi, mağaza beyanları ve varlıkları tamam, her iki platformda başarılı inceleme.

## Gerekli harici hesaplar ve araçlar
- Apple Developer Program üyeliği ve App Store Connect erişimi.
- Google Play Console geliştirici hesabı ve uygulama yayın yetkisi.
- iOS derleme ve imzalama için macOS/Xcode veya uygun macOS CI.
- Android için Android SDK/Gradle ve imzalama anahtarlarının güvenli saklanması.

## Öncelik
İlk teknik adım: web kodunu bozmadan mobil paketleme için kaynak/çıktı yapısını planlamak ve konum-navigasyon akışlarını cihaz test listesine bağlamak. Mağaza başvuruları, imzalama ve ödeme gerektiren hesap işlemleri kullanıcı onayıyla yapılır.

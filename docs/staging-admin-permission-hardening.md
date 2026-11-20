# ROTAPARK Staging — Yönetim yetkileri güvenlik incelemesi

Tarih: 2026-11-20
Dal: feature/staging-admin-permission-hardening-20261120
Kapsam: yalnızca geliştirme / Staging. Main ve canlı ROTAPARK'a dağıtım yapılmaz.

## Doğrulanmış mevcut yapı
- `supabase/migrations/20261110_rotapark_roles.sql`: `rotapark_staff_roles`, `rotapark_my_role()`, `rotapark_set_staff_role()` ve rol bazlı kontroller.
- `supabase/migrations/20261110_rotapark_role_audit.sql`: kurucunun silinmesini veya rolünün değiştirilmesini engelleyen tetikleyici, rol değişikliklerinin denetim kaydı.
- `admin/members/index.html`: üyeleri listeleyen ve rol atayan Supabase RPC çağrıları; sayfa açılışında kurucu kontrolü.
- `functions/api/admin/applications.js`: `ADMIN_TOKEN` tabanlı kimlik doğrulama.
- `functions/api/admin/issue-access.js`: `ADMIN_TOKEN` tabanlı kimlik doğrulama.
- `functions/api/admin/parking-accuracy-reports.js`: Cloudflare Access JWT veya `PARKING_REPORT_ADMIN_IDS` üzerinden erişim.
- `admin/index.html`: çok sayıda mevcut yönetim işlevi, ayrı erişim mekanizmaları.

## Güvenlik kuralı
İstemci ekranındaki görünür izinler tek başına API erişim hakkı vermez. Bütün ayrıcalıklı işlemler, sunucu tarafında doğrulanmış kullanıcı kimliği ve güncel izinlerle kontrol edilmelidir. Mevcut güvenlik mekanizmaları, eşdeğer koruma ve negatif testler hazır olmadan kaldırılmamalıdır.

## Uygulama sırası
1. Staging'de kullanılan güncel izin tablosu/RPC sözleşmesini ve SQL migration'larını doğrula; bu depodaki iki eski migration'ı güncel üretim şeması varsayma.
2. Ortak sunucu yetkilendirme katmanı tasarla: geçersiz/eksik token = 401, doğrulanmış ama yetkisiz = 403, yetki kaynağı erişilemez = fail-closed 503.
3. Her API eylemini tek bir izin anahtarıyla eşle; okuma ve yazma izinlerini ayır. Kurucuya özel rol atama ve yönetimi ayrı tut.
4. Staging'de önce salt-okunur görev ekranları ve ilgili API'leri etkinleştir; ardından mutasyon uçlarını aşamalı aç.
5. Yetki kaldırma, rol düşürme, oturum süresi dolması, doğrudan API çağrısı ve başka kullanıcının işlem yapması gibi negatif testleri çalıştır.
6. Kod incelemesi ve Staging kabul testleri bitmeden main'e birleştirme ve canlı dağıtım yapma.

## Açık sorular
- Staging'deki 8 izin hangi tablo/RPC üzerinden saklanıyor? Depodaki migration'larla karşılaştırılmalı.
- Cloudflare Access ile Supabase oturumunun aynı yönetici kimliğine nasıl bağlanacağı belirlenmeli.
- `ADMIN_TOKEN` kullanan makine/müşteri iş akışları, insan yöneticilerin oturumlarından ayrılmalı.

Bu belge tek başına yönetim API'lerini etkinleştirmez.

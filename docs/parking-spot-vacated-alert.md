# ROTAPARK — Boşalan Sokak Park Yeri Bildirimi

Durum: Geliştirme taslağı. Production/Preview değişmeyecek.

## Kullanıcı deneyimi
- "Park yerim" kartında mevcut "Park konumumu kaydet" işlemi korunur.
- İkinci işlem: "🚗 Buradan ayrıldım · Yer boşaldı".
- Önceden park yeri kaydetmeyen kullanıcı da bildirim oluşturabilir.
- Kayıtlı park konumu varsa kullanıcıya o konum sunulur; yoksa güncel ve yeterince doğru GPS konumu kullanılır. Konum doğrulanamazsa gönderim yapılmaz.
- Gönderim tamamlandığında kısa onay ve bildirimi geri alma/silme seçeneği gösterilir.
- Harita üzerinde geçici işaret, oluşturulma zamanı ve "Yol tarifi" işlemi bulunur. Yer garantisi verilmez.

## Dağıtım
- Bildirim 5 dakika sonra otomatik olarak geçersiz olur.
- Yaklaşık 1 km yarıçapındaki, konum paylaşımı ve bildirim izni bulunan uygun kullanıcılara bildirim gönderilir.
- İzin vermeyen kullanıcılar haritada mevcut duyuruları görüntüleyebilir.
- Uygulama kapalıyken bildirim için Android FCM / uygun web tarayıcılarında Web Push gerekir. Gerçek push altyapısı doğrulanmadan gönderildi denmez.

## Güvenlik ve doğruluk
- Sunucuda kimlik, konum, zaman ve hız limiti doğrulaması yapılır; kullanıcı yalnızca kendi duyurusunu silebilir.
- Aynı hesap/cihaz için tekrar bildirim kısıtlanır; koordinat ve kullanıcı kimliği herkese açık bildirim metnine konmaz.
- Alıcı hedeflemesi sunucu tarafında yapılır; konum bilgisi yalnızca bu işlev için gerekli süre ve kapsamda saklanır.
- Konumun sokak parkı olma ihtimali kontrol edilir; özel mülk veya ücretli otopark için yanıltıcı duyurular önlenir.
- Bildirim alıcıya teslim garantisi veya boş yerin hâlâ müsait olduğu garantisi verilmez.

## Uygulama sırası
1. Mevcut park konumu ve sokak bildirimi kodunu tespit et.
2. İzole dalda arayüz, geçici kayıt API'si, yetki/süre/limit kontrollerini uygula.
3. Harita işaretini ve 1 km alıcı sorgusunu test et.
4. FCM/Web Push izin ve teslimat testlerini ayrı test ortamında yap.
5. Kullanıcı onayı olmadan main/Production'a birleştirme.

# ROTAPARK SHIELD kaynak denetimi

Temel sürüm `c904c3e15660486e8cd0cf8157f9bfdd08ae6027`. Bulgular kaynak koda dayanır. Cloudflare ve Supabase canlı ayarları ile üretim verileri incelenmedi.

| Önem | Kaynak ve bulgu | Staging doğrulaması |
|---|---|---|
| Yüksek | `/api/tts` kimlik veya harcama kotası olmadan Azure isteği yapıyor. | Sağlayıcıdan önce atomik genel ve istemci kotaları, sağlayıcı tarafı bütçe alarmı. |
| Yüksek | `/api/otp-preflight` anonim isteğe e-posta engel durumunu döndürüyor ve geniş yetkili Supabase anahtarı kullanıyor. | Hassas yanıtı kaldırmadan önce engelli kullanıcı destek akışını sentetik hesapla doğrula. Pages ve doğrudan Supabase Auth sınırlarını birlikte incele. |
| Yüksek | Kurucu rolü veritabanında korunuyor ancak `rotapark_set_staff_role` mevcut kodda AAL2 istemiyor. Bazı eski yönetim yollarında ortak anahtar kullanılıyor. | SHIELD için ayrı AAL2 kapısı. Eski yolları koruyacak geçişi ve hesap kurtarmayı ayrıca test et. |
| Yüksek | WAF, origin erişimi, Supabase yedekleri ve kurtarma süreleri depodan doğrulanamıyor. | Staging kontrol düzlemi erişimi ve sentetik geri yükleme tatbikatı gerekli. |
| Orta | Staff izin tablolarında RLS ve kısıtlı RPC kapıları var. Dağıtılan grant, policy ve SECURITY DEFINER envanteri bilinmiyor. | Staging kataloglarını migration kaynaklarıyla karşılaştır. AAL1, AAL2, üye ve anonim rollerle izin matrisi çalıştır. |
| Orta | OTP ve ses uçları JSON gövdesini boyut sınırı olmadan okuyor. | Boyut sınırını içerik uzunluğu olmadan gönderilen sentetik gövdeyle de doğrula. |
| Orta | Auth yapılandırması yalnızca yayınlanabilir anahtar veya anon JWT döndürüyor. Sunucu sırlarının ortam ayrımı ve Git geçmişi taraması açık. | Sır değerlerini rapora almadan Pages secret adlarını ve yetki kapsamını doğrula. |
| Orta | Ortak olay akışı ve acil durum kontrolü kaynakta bulunmadı. | Durum değişikliği ve otomatik kota olaylarını panelde doğrula. |

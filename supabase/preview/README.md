# rotapark-preview incelemesi

İncelenen kaynak: https://github.com/OrhanDurmus/PARKIQ, main, `927080347ab2a31277ad55b2146feb0a955a8dc8`. GitHub main ağacı yerel checkout ile eşleşiyor. Erişilebilir depolar arasında ROTAPARK adlı ayrı bir depo yok. Bu sürümde `/api/occupancy-ingest` dosyası, route'u veya referansı bulunmuyor. Bu nedenle ingest için gerekli payload, upsert anahtarı, tablo, indeks ve yazıcı yetkisi doğrulanamadı. Farklı depo/branch kullanılıyorsa adresi veya commit'i gerekir. Dosya ingest kurulumu tamamlandı anlamına gelmez.

`rotapark-preview-setup.sql` doğrulanabilen Supabase kapsamını bir transaction içinde kurar. Otomatik migration klasörünün dışındadır. Varsayılan hali çalışmayı reddeder: Preview project ref bilinmiyor. Gerçek Preview ref doldurulsa bile sunucu `app.settings.api_external_url` ayarı hedefi doğrulamazsa durur. Bu ayarın Supabase ortamında mevcut olduğu doğrulanmadı; yoksa hedef kimliğini güvenilir biçimde doğrulayacak yönteme göre koruma uyarlanmalıdır. Proje görünen adı tek başına SQL ile ortam garantisi vermez. İstemci tarafından bir ayar atayıp kontrolü geçmek güvenilir hedef doğrulaması değildir.

| Tablo | İndeksler | RLS ve istemci erişimi |
| --- | --- | --- |
| rotapark_staff_roles | user_id PK; assigned_by | RLS açık; authenticated yalnızca kendi satırını okuyabilir; doğrudan yazamaz |
| rotapark_role_audit | id PK; actor_id; target_id; occurred_at DESC | RLS açık; doğrudan istemci erişimi yok; founder kontrollü listeleme RPC'si |
| rotapark_member_bans | user_id PK; blocked_by | RLS açık; doğrudan istemci erişimi yok; kendi engel durumunu/nedenini ve founder işlemlerini RPC sağlar |

Migration sırası dosya adına göre alfabetik değildir: roles → role_audit → user_lookup → members_directory → member_bans → member_ban_reasons → otp_preflight. Özellikle member_bans, list_members dönüşüne blocked eklediği için members_directory sonrasında çalışmalıdır.

RPC EXECUTE yalnızca authenticated rolüne verilir; işlevler founder/admin denetimlerini içerir. `rotapark_email_is_blocked(text)` yalnızca service_role içindir; endpoint `functions/api/otp-preflight.js` sunucu anahtarıyla çağırır. Trigger işlevlerinin PUBLIC EXECUTE yetkisi ayrıca kaldırıldı. SECURITY DEFINER işlevlerde boş search_path ve nitelikli nesne adları kaynak migration'lardan korundu. auth.users Supabase tarafından sağlanır; kopyalanmaz. Kurucu hesabı veya rol seed'i eklenmedi; yeni Preview hesabına ayrı başlangıç ataması gerekecektir.

`schema.sql` ve `migrations/*.sql` PostgreSQL/Supabase migration'ları değildir: SQLite AUTOINCREMENT, datetime('now') ve Cloudflare D1 `env.DB.prepare` kullanılır. business_applications, business_locations, business_occupancy, business_hours, business_pricing, occupancy_history ve nearby_push tabloları bu nedenle Supabase kurulumuna taşınmadı. `functions/api/business-occupancy.js` token hash ile D1 kayıtlarını günceller; `functions/api/ispark-occupancy.js` dış API/cache/KV kullanır. Bunlar eksik occupancy-ingest endpoint'inin yerine geçmez.

Kontrol kaynak kod ve statik dosya incelemesiyle sınırlıdır. Hiçbir veritabanına bağlanılmadı; yerel veritabanı dahil SQL çalıştırılmadı. Production verisi, anahtar, auth UUID veya snapshot eklenmedi. Deploy, push ve canlı yapılandırma değişikliği yapılmadı. SQL'in gerçek Preview üzerinde yürütülmesi ve ingest uyumluluğu henüz doğrulanmadı.

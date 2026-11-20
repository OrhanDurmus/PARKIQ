# ROTAPARK Yetki Merkezi — güvenlik sözleşmesi (taslak)

Bu dosya uygulama davranışını değiştirmez. Kurucu onaylı yetki matrisi uygulanmadan yeni yönetim API'leri açılmamalıdır.

## Roller
- founder: tüm yönetim yetkileri; rolü uygulama arayüzünden atanamaz, devredilemez veya kaldırılamaz.
- admin: yalnızca kurucunun etkinleştirdiği yönetici izinleri.
- moderator: yalnızca kurucunun etkinleştirdiği moderatör izinleri.
- user: hiçbir yönetim yetkisi.

## İzin anahtarları
- parking_reports.read
- parking_reports.moderate
- support.read
- support.reply
- users.block
- announcements.publish
- staff.moderators.manage
- parking_records.edit

Kurucuya ayrılmış işlemler (devredilemez): founder identity, admin assignment, permission policy edits, audit history access, security configuration.

## Yetki kontrolü
1. İstek Supabase JWT'si ile doğrulanır; token içindeki kullanıcı kimliği güvenilir biçimde doğrulanır.
2. Güncel rol ve izinler veritabanından alınır. İstemciden gönderilen rol veya izinler yetki kaynağı olamaz.
3. Her okuma/yazma API'si ve Supabase RPC'si ayrı ayrı ilgili izin anahtarını doğrular; erişim reddi varsayılandır.
4. Cloudflare Access ile korunan mevcut kurucu API'leri bu politika tamamlanmadan başka rollere açılmaz.
5. Yetki kaldırma sonraki istekte geçerli olur; rol ve izin değişiklikleri denetim kaydına yazılır.
6. Kullanıcıya özel istisnalar yalnızca kurucu tarafından yönetilir ve rol politikasını aşan kurucuya özel işlemler verilemez.
7. RLS, SECURITY DEFINER RPC ve service-role erişimleri bağımsız güvenlik incelemesinden geçer.
8. İzin değişiklikleri, yetkisiz API çağrıları ve rol yükseltme girişimleri otomatik testlerle doğrulanır.

## Aşamalar
1. Menüde yalnızca yetkili hesaplara görünen Yönetim Merkezi bağlantısı (PR #368).
2. Kurucuya özel izin tabloları, atomik RPC'ler ve RLS.
3. Kurucu yetki ayarları arayüzü.
4. Her özellik için sunucu tarafı izin kontrolleri.
5. Cloudflare Access kapsamının ayrı staff API'leri ile güvenli uyumu.
6. Yetki matrisi, hesap engeli, rol değişikliği ve negatif güvenlik testleri.

Navigasyon/GPS/kamera/araç oku/ses dosyaları bu çalışma kapsamı dışındadır.

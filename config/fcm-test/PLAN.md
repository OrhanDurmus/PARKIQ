# FCM test ortamı kurulum ve güvenlik planı

## Bu aşama: hazırlık ve dry-run

1. Başlangıç commit'ini ve yalnızca `chore/fcm-test-infrastructure` dalının
   değiştiğini doğrula.
2. Offline planı ve pasif kabuğun sözdizimini kontrol et.
3. Kişisel kasadan ortamın sağladığı `ROTAPARK_FCM_TEST_SETUP_TOKEN` ile canlı
   GET dry-run çalıştır. Token değerini veya bir parçasını gösterme.
4. Hesap ID doğrulamasının ve altı isim kontrolünün hepsi başarılı olmalı.
   Cloudflare hesap okuma ve beş kaynak ailesi listeleme yetkileri gereklidir.
   Kaynak sayısı veya token doğrulama yanıtı hesap ID doğrulaması yerine geçmez.
5. Yalnızca bu klasörü commit et ve yalnızca istenen dalı push et. PR açma,
   main'e push veya merge yapma.

## Sonraki aşama: ayrıca yetkilendirilecek oluşturma

Bu bölüm uygulanacak iş sırasını tanımlar; mevcut betik yazma yapamaz.

- Tam GET dry-run'ı yeniden çalıştır; eski envanteri kullanma. Her yeni
  oluşturmanın hemen öncesinde ilgili adı yeniden kontrol et.
- Yalnızca README'deki hesapta ve tam eşleşen altı hedefte işlem yap.
- Pages için POST `/accounts/{id}/pages/projects`; Git kaynağı, domain,
  deployment, build hook, ortam değişkeni veya binding ekleme.
- D1 için POST `/accounts/{id}/d1/database`; yalnızca ad ver. SQL çalıştırma.
- KV için POST `/accounts/{id}/storage/kv/namespaces`; yalnızca title ver.
- Queue ve DLQ için ayrı POST `/accounts/{id}/queues`; yalnızca queue_name ver.
  Producer/consumer, retry veya dead-letter binding ekleme; mesaj gönderme.
- Worker için PUT `/accounts/{id}/workers/scripts/rotapark-fcm-test`, yalnızca
  pasif kabuk modülü ve boş bindings ile multipart yükleme. Uygulama Worker'ını
  veya mevcut `wrangler.nearby-push.toml` dosyasını kullanma. Route, cron,
  consumer, secret veya workers.dev etkinleştirme isteği gönderme.

Worker PUT bir güncelleme de yapabildiği için isim kontrolü tek başına atomik
oluşturma garantisi sağlamaz. Sonraki uygulama, aynı hesapta eşzamanlı
oluşturma olmadığını sağlamalı; garanti sağlanamıyorsa Worker adımında durmalı.
Her API hatasında dur. Zaman aşımından sonra yazmayı otomatik tekrar etme;
GET ile sonucu araştır. Kısmi başarıda oluşturulan ad ve ID'leri raporla;
silerek geri alma veya mevcut kaynağı düzeltme yapma. Çakışan kaynağı sahiplenme.

Oluşturma sonrası yalnızca GET ile ad, ID ve hesap kapsamını doğrula. Yeni
kaynakların ID'lerini ayrı operasyon raporunda tut; token veya özel yanıt
gövdelerini rapora ekleme. Bu hazırlık ID uydurmaz.

## Kesin sınırlar

Production ve mevcut Preview kaynakları değiştirilemez. Mevcut veritabanları,
KV namespace'leri, Queue'lar ve uygulama kodu yeniden kullanılamaz. Secret,
migration, Supabase RPC, uygulama deploy'u, FCM bildirimi, test mesajı,
GitHub main push ve merge kapsam dışıdır. Yeni kaynaklara veri kopyalanmaz.

Bu altı boş kaynak bir FCM gönderim sistemi değildir. Firebase projesi,
servis hesabı, cihaz token'ı, kullanıcı verisi veya bildirim aboneliği eklenmez.
Sonraki işlevsel FCM testi için ayrı onaylı plan gerekir: yalnızca test Firebase
projesi ve izinli test cihazları, kontrollü tek mesaj, teslim/görüntüleme ayrımı,
saklama süresi ve durdurma koşulları önceden belirlenmelidir.

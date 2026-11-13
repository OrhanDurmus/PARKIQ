# ROTAPARK Preview hazırlığı — 13 Kasım 2026

## Doğrulanan gerçek Preview kaynağı

Cloudflare Pages API üzerinden yalnızca GET ile proje ve deployment metadata'sı okundu. `rotapark` projesinde endpoint'i içeren Preview deployment: `6550a78b-175f-4814-9c20-b2060c5815cf`, https://6550a78b.parkiq.pages.dev, 12 Kasım 2026 18:42 UTC. Git kaynağı `OrhanDurmus/PARKIQ`, dal `feature/eta-occupancy-and-smart-parking`, commit `70264e6358340caaa51fd4512aad96f7d0125d40`. Build komutu boş, kök ve çıktı dizini repo kökü. İnceleme, deployment metadata'sıyla eşlenen bu commit'in kaynak dosyalarına dayanır; derlenmiş Worker bundle'ı indirilmedi ve endpoint çağrılmadı.

En yeni Preview `33b48952`, önceki hazırlık commit'i `f4b0ff8…` üzerinden `chore/preview-supabase-setup` dalından GitHub push tetiklemesiyle otomatik kurulmuş. Bu dal feature kodunu içermiyor. Önceki “endpoint yok” bulgusu yalnızca main tabanlı bu kaynak için geçerliydi. Endpoint'in bulunması için feature dalı incelendi. Bu turda commit/push yapılmadı: mevcut Git entegrasyonunda push otomatik deployment tetikleyebiliyor.

Kaynak: [occupancy-ingest.js](https://github.com/OrhanDurmus/PARKIQ/blob/70264e6358340caaa51fd4512aad96f7d0125d40/functions/api/occupancy-ingest.js), [occupancy migration](https://github.com/OrhanDurmus/PARKIQ/blob/70264e6358340caaa51fd4512aad96f7d0125d40/supabase/migrations/20261112_occupancy_eta.sql).

## Supabase sözleşmesi

POST `/api/occupancy-ingest`, Bearer değerini `ROTAPARK_OCCUPANCY_INGEST_SECRET` ile karşılaştırır. Aynı Preview origin'inin `/api/ispark-occupancy` endpoint'ini okur. Yalnızca `verifiedLive=true`, kimliği olan, negatif olmayan tam sayı boş kapasitesi ve ±15 dakika içinde geçerli gözlem zamanı bulunan en fazla 1000 kaydı alır. Body'den keyfi snapshot kabul etmez.

| public.rotapark_occupancy_snapshots alanı | Kaynak ve kısıt |
| --- | --- |
| id | bigint GENERATED ALWAYS AS IDENTITY, PK; endpoint göndermez |
| parking_id | text NOT NULL, 1–180 karakter; `ispark:` + sağlayıcı kimliğinin en fazla 160 karakteri |
| observed_at | timestamptz NOT NULL DEFAULT now(); endpoint gerçek occupancyUpdatedAt zamanını gönderir |
| free_spaces | integer NOT NULL, >= 0; freeSpaces |
| capacity | nullable integer, >= 0 ve free_spaces <= capacity; endpoint geçersiz kapasitede NULL gönderir |
| source | text NOT NULL DEFAULT 'provider'; endpoint 'ibb_ispark' gönderir |

Tekilleştirme: UNIQUE(parking_id, observed_at, source). Sorgu indeksi: (parking_id, observed_at DESC), ayrıca PK ve UNIQUE indeksleri. Endpoint PostgREST POST ile `on_conflict=parking_id,observed_at,source` ve `resolution=ignore-duplicates,return=minimal` kullanır; UPDATE/DELETE yapmaz. `inserted` yanıtı gönderilen satır sayısıdır, duplicate'ler düşüldükten sonraki gerçek ekleme sayısı değildir.

Tabloda RLS açık; PUBLIC, anon ve authenticated doğrudan tablo/sequence erişimi kapalı. Taslak, service_role'a açık INSERT ve identity sequence USAGE verir. Supabase service_role BYPASSRLS kullanır; herkese açık INSERT politikası gerekmez. Anahtar yeni Preview projesinin service-role JWT anahtarı olmalı; kod hem apikey hem Authorization: Bearer olarak kullanıyor. Mevcut projenin varsayılan yetkilerine güvenmeden gerekli grant'ler belirtildi; gerçek DB üzerinde test yapılmadı.

GET `/api/occupancy-prediction`, Preview anon anahtarı ve oturum JWT'siyle `rotapark_predict_occupancy(p_parking_id text,p_eta_minutes integer)` RPC'sini çağırır. EXECUTE yalnızca authenticated/service_role; anon/PUBLIC kapalı. SECURITY DEFINER ve boş search_path ile güvenilir kurulum sahibinin SELECT yetkisini kullanır. Sonuç: predicted_free_spaces, latest_free_spaces, sample_count, confidence, latest_observed_at. En az 5 benzer örnek ve en fazla 30 dakikalık son gözlem gerekir; aksi halde confidence=insufficient. Kullanıcı girişleri yalnızca yeni Preview auth projesinden olmalı.

`rotapark-preview-setup.sql` önceki rol/ban/audit kurulumu üzerine bu tablo ve RPC'yi ekleyecek şekilde yerelde güncellendi. Kurulum sırası roles → role_audit → user_lookup → members_directory → member_bans → member_ban_reasons → otp_preflight → occupancy_eta. Üç eski tablonun RLS ve kontrollü RPC izinleri korunur; FK ve audit zaman indeksleri vardır. Production kullanıcısı, kurucu seed'i veya veri kopyası yok.

Kullanıcının verdiği Preview ref `dwlphvkcmvuroljxcdnq`; kök URL `https://dwlphvkcmvuroljxcdnq.supabase.co`. SQL guard bu ref'i kullanır ve sunucudaki `app.settings.api_external_url` ile eşleşme arar. Bu GUC'nin gerçek Supabase ortamında mevcut olduğu doğrulanmadı: yoksa dosya çalışmayı reddeder. Sahte bir SET ile geçilmemeli; güvenilir hedef kontrolü doğrulanmadan SQL hazır/çalıştırılabilir sayılmamalı. Kurulum mevcut uygulama tabloları varsa da durur. Hiçbir SQL çalıştırılmadı.

## Mevcut Preview yapılandırmasındaki sorunlar

İncelenen deployment ve güncel proje Preview ayarlarında SUPABASE_URL eski projeye ve `/rest/v1/` yoluna işaret ediyor. Endpoint yalnızca kök Supabase URL'sini kabul ettiğinden bu biçim 503/not_configured üretir. Doğru isim `SUPABASE_SERVICE_ROLE_KEY` (ASCII I); mevcut Preview'da `SUPABASE_SERVİCE_ROLE_KEY` (Türkçe İ) var, kod bunu okumuyor. Preview anon anahtarı görünmüyor. Ingest secret ve hatalı isimli anahtar plain_text türünde. Değerleri rapora veya taslağa alınmadı. Bunların yerine yeni Preview'a ait değerler secret_text olarak hazırlanmalı; Production değerleri kopyalanmamalı. Bu turda ayarlar değiştirilmedi.

Preview proje yapılandırmasında D1/KV/Queue bağlaması yok; deployment metadata'sı da bunları listelemiyor. Production yapılandırmasında DB, ISPARK_SNAPSHOTS ve NEARBY_PUSH_QUEUE mevcut. Production kaynak kimlikleri taslak dosyalara aktarılmadı. Verileri okunmadı.

## Ayrı D1 ve KV hazırlığı

`cloudflare-preview-plan.json` uygulanacak API payload'ı değil, kapsam ve eksikleri gösteren plandır. `wrangler.pages-preview.fragment.toml` yalnızca env.preview parçasıdır; tek başına deploy yapılandırması değildir. Dashboard/API güncellemesi yapılacaksa yalnızca deployment_configs.preview kapsamı değiştirilmelidir. Ortamlar arasında binding mirasına veya Production fallback'ine güvenilmemelidir. Mevcut Pages projesinde tüm Preview dalları Preview ayarlarını paylaşır; her dal için ayrı izolasyon istenirse ayrıca ayrı Pages projesi gerekir, bu turda oluşturulmadı.

| Binding | Yeni Preview kaynağı | Kullanım |
| --- | --- | --- |
| DB | rotapark-preview-db; kimlik henüz yok | işletme başvuruları, konum/saat/fiyat/doluluk/geçmiş ve push abonelik/delivery tabloları |
| ISPARK_SNAPSHOTS | rotapark-preview-ispark-snapshots; kimlik henüz yok | latest fallback, community raporları/limitleri/kullanıcı geçmişi, push abonelikleri ve diğer KV anahtarları |
| NEARBY_PUSH_QUEUE | şimdilik bağlanmaz | Production queue/consumer kullanılmaz; bildirim gönderimi kapalı kalır |

Ingest doğrudan D1/KV kullanmaz. Okuduğu ispark adapter'ı KV `latest` fallback'ini kullanabilir; bu fallback verifiedLive=false olduğundan ingest'e girmez. Kaynak güvenilir zaman damgası vermiyorsa sıfır kayıt beklenir; sahte tazelik zamanı üretilmez.

`d1-preview-schema.sql`, repository schema.sql ve migrations/*.sql dosyalarının verisiz D1 temel kurulum taslağıdır. Bazı destek/yönetim endpoint'leri ayrıca kendi tablolarını ilk çağrıda oluşturur; bu dosya tüm uygulama akışlarının önceden hazır olduğunu garanti etmez. Yeni D1/KV boş başlamalı; Production dump, kullanıcı geçmişi, snapshot ve push aboneleri aktarılmamalı. D1 runtime erişimi binding üzerinden olur; Supabase RLS D1/KV'ye uygulanmaz.

Push ileride test edilecekse ayrı Preview queue, DLQ, consumer Worker, D1 binding ve yeni VAPID çifti gerekir. Production nearby-push Worker'ı veya queue'su kullanılmamalı. Ses ve diğer harici servislerin Production kimlik bilgileri de kopyalanmaz; şimdilik bağlanmaz.

`wrangler.occupancy-preview.toml.example` yeni `rotapark-preview-occupancy-cron` adıyla ve açık feature Preview URL'siyle hazırlanmıştır; crons=[] ve workers_dev=false. Kaynak feature commit'indeki workers/occupancy-cron.js gerektirir; main tabanlı yerel checkout'ta bu dosya yok. Feature alias'ının doğru deployment'a yönlendiği uygulama öncesinde yeniden doğrulanmalı. Kaynak Worker URL verilmezse Production'a gider; bu nedenle Preview URL zorunlu kalmalı, gelecekte Preview-only host kontrolü de eklenmeli. Mevcut cron Worker'ı ve `.github/workflows/occupancy-ingest.yml` Production adresini hedefliyor; bu akışlar Preview testi için çalıştırılmamalı. Yeni Preview secret yalnızca yeni Pages Preview ve yeni Preview collector arasında paylaşılabilir.

## Yapılan işlemlerin sınırı

Bu turda Cloudflare'a yalnızca hesap/proje/deployment/Worker adları için GET gönderildi ve GitHub kaynakları okundu. POST/PATCH/PUT/DELETE, endpoint ingest çağrısı, DB sorgusu, SQL yürütme, kaynak oluşturma, push, deploy veya canlı ayar değişikliği yapılmadı. Tüm hazırlıklar yereldedir. Statik JSON/TOML ve hassas bilgi taraması yapıldı; gerçek Preview entegrasyon testi yapılmadı.

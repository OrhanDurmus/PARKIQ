# ROTAPARK SHIELD Staging işletim kılavuzu

## Kurulum ve erişim

1. Git dalını ayrı bir Cloudflare Pages projesine, ayrı bir test alan adına ve yalnızca sentetik verili bağımsız Supabase, D1 ve KV kaynaklarına bağla. Diğer Pages adreslerini ve doğrudan origin yollarını envantere al. Staging projesinde erişimi Cloudflare Access ile kısıtla ve Pages önizleme adreslerinin de test politikası altında olduğunu doğrula.
2. Supabase'de mevcut rol migration'ı ile SHIELD migration'ını, D1'de `migrations/staging-shield.sql` dosyasını uygula. `SHIELD_DB` bağlamasını ekle. `SHIELD_STAGE=staging`, `SHIELD_STAGING_HOST` (şemasız hostname), `SHIELD_SUPABASE_PROJECT_REF`, `SUPABASE_URL` ve `SUPABASE_ANON_KEY` değerlerini eşleştir. `SHIELD_IP_HMAC_KEY` için en az 32 karakterlik rastgele Pages secret kullan. OTP ön kontrolünün mevcut servis anahtarı, KV ve Azure anahtarı ayrı test kaynaklarına ait olmalı. Anahtar değerlerini olay kayıtlarına, CI çıktılarına ve Git'e alma.
3. Ayrı test hesabına veritabanından kurucu rolü ata. Kurucu TOTP faktörünü kaydet ve doğrula. Cloudflare ve Supabase kontrol düzlemi yöneticilerinde MFA, en az iki yetkili operatör ve kurtarma erişimi hazırla. Kurucu faktör kaybında, yetkili operatör Supabase kontrol düzleminden kimlik doğrulayıp faktör kurtarma sürecini yürütür.
4. `supabase/verification/staging-shield.sql` ile iki tabloda RLS'nin açık olduğunu, uygulama rollerinde doğrudan tablo yetkisi olmadığını ve yalnızca amaçlanan RPC grant'lerini doğrula. Bir sonraki adımda ayrı, sentetik oturumlarla davranışı kontrol et.
5. Cloudflare WAF'ta OTP, ses ve yönetim yollarını ayrı değerlendir. Önce log/izleme, sonra eşik doğrulaması ve geçici engelleme uygula. Yönetim yolları ve kimlik kurtarma için ayrı kurallar kullan. Ortak NAT'lı istemcilerden gelen yanlış pozitifleri ölç. DDoS, Bot ve Rate Limiting özellikleri için zone/plan kapsamını ve Security Events kayıtlarını doğrula. Supabase'in doğrudan Auth erişimine ayrı hız sınırı ve gerekiyorsa CAPTCHA uygula. Pages kotası doğrudan Supabase trafiğini kapsamaz.
6. D1 kotası en fazla 3.000 ses isteği ve 5.000 OTP ön kontrolü için günlük rezervasyon yapar. Başarısız sağlayıcı çağrıları da rezervasyon tüketebilir. UTC gece yarısında günlük pencere değişir. Azure sağlayıcı kotası, bütçe alarmı ve fatura bildirimi bağımsız olarak doğrulanmalıdır. D1 satır sayısı ve yazma maliyeti için sağlayıcı alarmı ekle. Her gün D1 kayıt temizliğini zamanla: `shield_quota` içinde `subject = 'global'` satırları UTC gün, diğer satırlar beş dakikalık pencere kullanır. Kota satırlarına 7 gün, `shield_signals` toplulaştırmalarına 30 gün saklama başlangıç ayarıdır. Geçerli pencereleri silme.
7. Pages sırrı envanterini ve Git geçmişini yetkili bir gizli bilgi tarayıcısıyla tara. Bir sızıntı doğrulanırsa kapsamı belirle, ilgili sırrı iptal et, yeni değeri ayrı test bağlamasına al ve bağımlı işlevi doğrula.

## Doğrulama

- Yalnızca sentetik hesaplar ve yerel/mok sağlayıcılarla çalış. `node tests/staging-shield.test.mjs` kota SQL'ini yerel SQLite üzerinde çalıştırır. Supabase işlevleri ve Cloudflare davranışı aşağıdaki kurulu ortam kontrollerini gerektirir.
- Anonim, üye, yönetici ve AAL1 kurucu SHIELD durumunu ve modu değiştirememeli. AAL2 kurucu okuyup değiştirebilmeli. Doğrudan tablo erişimi reddedilmeli. Eşzamanlı iki istemciden aynı revision ile değişiklikte tek olay eklenmeli ve diğer çağrı 409 almalı.
- Savunma geçişinde istemci kotaları daralmalı. Acil durumda ses çağrısı sağlayıcıya ulaşmamalı, OTP ön kontrolü dar kota altında devam etmeli ve kurucu kontrol API'sinden Normal moda dönebilmeli. Otomatik süre bitiminden sonra ilk istekte Normal geçerli olmalı. Süre bitimi ve kayıt görüntüleme UTC zaman damgalarıyla karşılaştırılmalı.
- Birden fazla sentetik istemciyle günlük kota sınırını sağlayıcı çağrısı üretmeden doğrula. İstek gövdesi ve başarısız bağlama durumunu kontrol et. Yönetim paneline tarayıcıdan giriş yapıp TOTP adımını, olayların en geç sonraki 15 saniyelik sorguda görünmesini ve hata durumunda doğrulanmış mod sunulmamasını doğrula.
- OTP engel durumu anonim çağırana döner. Bu yanıtı kaldıran değişiklik, engelli kullanıcı destek akışıyla birlikte ayrıca ele alınmalıdır. SHIELD MFA kapısı eski yönetim yollarını kapsamaz. Bu yollar için geçişte önce AAL2 kurtarma prova edilir.

## Olay müdahalesi

1. Olay sorumlusu UTC zamanını, etkilenen uçları, kota sayımlarını, Cloudflare olay kimliklerini ve sağlayıcı maliyetini kaydeder. Kullanıcı verisi, IP, token veya doğrulama kodu olay kaydına alınmaz.
2. Kurucu AAL2 oturumuyla Savunma'yı seçer ve yanlış pozitifleri izler. Maliyet veya erişilebilirlik riski sürüyorsa Acil Durum Güvenli Modu seçilir. Bu mod ses API'sini askıya alır. Süre bitimleri sırasıyla 60 ve 15 dakikadır. AAL2 kurucu kotalardan bağımsız kontrol yoluyla Normal'e dönebilir.
3. D1 veya kontrol düzlemi kesintisinde korunan uçlar 503 döndürür. Hazır olduğunda bağımlılıkları doğrula, Normal'e dön ve olay kayıtlarını dışa aktar. Sürenin sonunda etkin mod kendiliğinden Normal olur. D1 telemetrisi kesintisi Normal'e dönüşü engellemez.
4. Harici uyarılar için Cloudflare bildirimleri ve Azure bütçe alarmını bir test teslimatıyla doğrula. Panel açıkken kayıtları 15 saniyede bir yeniler. Panel kapalıyken teslimat harici kurulum gerektirir.

## Yedekleme ve kurtarma

- Supabase Staging için planın desteklediği zamanlanmış yedek/PITR'ı doğrula. D1 Time Travel veya düzenli dışa aktarım ve KV için ayrı şifreli, erişimi sınırlandırılmış yedek kur. Cloudflare kural ve bağlama envanteri, dağıtılan commit ve migration sürümlerini sakla. Sırları yedek SQL'e dahil etme.
- Sentetik bir kayıt ve bir SHIELD olayı hazırla, ardından yedeği boş, izole kurtarma kaynaklarına döndür. Supabase rollerini, AAL2'yi, RLS/grant'leri, D1 kotalarını ve KV verilerini karşılaştır. Gerekiyorsa yeni test sırları oluştur ve Pages bağlamalarını kurtarma projesine yönlendir.
- Kaybedilen işlem aralığı ve hizmetin geri gelme süresini ölç, RPO ve RTO sonuçlarını kaydet. Geri yüklenen savunma durumunu gözden geçir ve gerekirse AAL2 ile Normal'e al. Yedekleme ve kurtarma ancak başarıyla tamamlanan tatbikattan sonra doğrulanmış sayılır.

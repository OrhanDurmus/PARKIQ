# ROTAPARK izole FCM test altyapısı

Başlangıç commit'i: `927080347ab2a31277ad55b2146feb0a955a8dc8`.
Dal: `chore/fcm-test-infrastructure`.
Cloudflare hesap ID: `314d5902d5a9b718c76aef7ac4586150`.

Bu aşama yalnızca dry-run hazırlığıdır. Betik API yazma isteği göndermez ve
`--apply` seçeneği içermez. Kaynak oluşturma isteklerini inceleme için JSON
olarak üretir. Gerçek oluşturma ayrıca yetkilendirilecek sonraki aşamadır.

| Tür | Yeni kaynak adı |
| --- | --- |
| Pages | rotapark-fcm-test |
| Worker | rotapark-fcm-test |
| D1 | rotapark-fcm-test-db |
| KV | rotapark-fcm-test-kv |
| Queue | rotapark-fcm-test-queue |
| DLQ | rotapark-fcm-test-dlq |

## Çalıştırma

Python 3 standart kütüphanesi yeterlidir. Repo kökünden:

```sh
# Ağsız: yalnızca altı isteğin planını üretir, doğrulama yerine geçmez.
python3 config/fcm-test/prepare.py --offline

# Canlı dry-run: yalnızca api.cloudflare.com üzerinde GET kullanır.
python3 config/fcm-test/prepare.py

# Ağsız güvenlik testleri ve kabuk sözdizimi:
python3 -B -m unittest discover -s config/fcm-test -p 'test_*.py'
node --check config/fcm-test/passive-worker.mjs
```

Yalnızca ortam tarafından güvenli biçimde sağlanan
`ROTAPARK_FCM_TEST_SETUP_TOKEN` kullanılır. Token'ı komut satırına, `.env`
dosyasına, rapora veya loga kopyalamayın. Başka Cloudflare token'ına geri dönüş
yoktur. Proxy ve CA yapılandırması korunur; yönlendirmeler takip edilmez.

Canlı dry-run önce `GET /accounts/{account_id}` yanıtındaki ID'yi doğrular.
Ardından Pages, Worker, D1, KV ve Queue listelerinin tüm sayfalarını okuyup altı
adı denetler. Herhangi bir hata, eksik yetki veya isim çakışması işlemi durdurur.
Hiçbir mevcut kaynak adı veya ayrıntısı çıktıya dökülmez; yalnızca hedef adlar
raporlanır. Hesap okuma izni yoksa doğrulama atlanmaz.

Üretilen POST/PUT tanımları **çalıştırılmaz**. Pages GitHub entegrasyonu,
deployment veya binding içermez. D1 boş, KV boş, iki Queue bağımsızdır.
DLQ adı ayrılmıştır; tüketici veya dead-letter bağlantısı kurulmaz.
Worker planındaki tek kod `passive-worker.mjs` pasif kabuğudur. Kabuk hiçbir
FCM isteği göndermez, veri okumaz ve mesaj tüketmez.

Ayrıntılı sıra, yarış koşulları ve güvenlik sınırları: [PLAN.md](PLAN.md).

## Hazırlık doğrulama sonucu — 2026-11-14 UTC

Canlı GET dry-run hesap ID'sini doğruladı; altı hedef adın hiçbirinde isim
çakışması bulunmadı. Gönderilen Cloudflare yazma isteği: **0**. Beş ağsız
güvenlik testi ve pasif Worker sözdizimi kontrolü başarılı. Bu sonuç yalnızca
kontrol anını kapsar; gelecekteki oluşturma öncesinde yeniden doğrulanmalıdır.

# Staging staff capability verification — safe operator procedure

This procedure does **not** deploy anything and does not require sharing tokens in chat.

1. Deploy PR #376 to a separate Cloudflare Pages Preview/Staging environment. Never use Production.
2. In Preview environment variables confirm `SUPABASE_URL` is the Staging project URL and `SUPABASE_ANON_KEY` is its public publishable/anon key. Do not copy a service-role key into either field.
3. Verify `/api/auth-config` returns `configured:true` for Staging. This response intentionally contains only the public Supabase URL and public key.
4. Confirm the permission migration is already installed in the **Staging** Supabase project, or review and apply it there only. Do not reapply blindly; inspect current grants.
5. Open `/staff/`, then `/staff/capabilities/` using a test account. Confirm the eight permission labels appear and the count matches Founder-defined grants.
6. Repeat with a user, moderator, admin, and founder test account. An ordinary user should receive zero grants; moderator/admin must only receive explicitly enabled grants; founder receives all eight.
7. Revoke a moderator grant from Founder settings and refresh the capability page: the grant must disappear without redeploying.
8. If the auth service is unavailable or the environment variables are absent, all capability requests must fail closed. Do not use Production secrets to test failure behavior.

Endpoints: `GET /api/staff/capability?permission=support.read` (requires a user Bearer token). No mutations are exposed by this endpoint.

**Stop conditions:** Staging and Production Supabase URLs match, permission migration does not match existing schema, any ordinary user gets a grant, or any revoked permission remains granted. Stop deployment and investigate before enabling management actions.

## Görev ekranları için Staging kabulü

Temiz bir Staging kurulumunda destek listeleri için `migrations/staging-staff-support.sql` Staging D1'de, üye işlemleri için `supabase/migrations/20261121090000_staff_member_tasks.sql` Staging Supabase'de gerekir. Üye RPC'si mevcut rol, rol denetimi, engel ve görev izni migration'larına dayanır. Bir GitHub commit'i bu SQL dosyalarını uygulamaz.

- **Destek** — Genel talep ve engel itirazı listelerini açın. Salt okuma hesabında yanıt formu gizlenir. Okuma ve yanıt yetkili hesapla bir test talebini yanıtlayın. Aynı yanıtı arşivde ve talebin özgün takip ekranında kontrol edin.
- **Otopark** — Onaylı test işletmesinin adını ve adres metnini düzenleyin. Önceden açılmış ikinci sekmedeki eski form çakışma bildirmelidir. Girilen adres metni harita koordinatlarını değiştirmez.
- **Duyuru** — Yalnızca Staging'e ait olduğu doğrulanmış KV ile kısa süreli test duyurusu yayınlayın. Staging uygulamasındaki duyuruyu ve yönetici geçmişini kontrol edin.
- **Üye engelleme ve moderatör yönetimi** — Yalnızca test hesapları kullanın. Engel nedeni zorunludur. Kurucu, yönetici ve işlemi yapan hesap korunur. Yönetici ancak ilgili izni varsa moderatör atayabilir veya kaldırabilir. Kurucu mevcut tam yönetim ekranlarını da kullanabilir.


## Engelli üyeler / Engeli Kaldır — yalnızca izole Staging

**Ön koşul:** Staging Supabase proje kimliği ve URL'sini Production'dan bağımsız olarak doğrulayın. Bu kontrol başarısızsa durun. GitHub'a SQL dosyası eklenmesi migrasyonun uygulandığı anlamına gelmez.

1. Staging Supabase'de `public.rotapark_member_bans` tablosunun `user_id` ve `reason` sütunlarını; `public.rotapark_staff_roles`, `rotapark_member_blocked()` ve `rotapark_staff_has_permission(text)` imzalarını salt okunur sorgularla doğrulayın. Eşleşmiyorsa migrasyonu uygulamayın.
2. `supabase/migrations/20261121150000_staging_member_unblock.sql` dosyasını yalnızca doğrulanmış Staging projesinde, kontrollü SQL editöründen uygulayın. Audit tablosunun `anon` ve `authenticated` rollerine açık olmadığını; RPC'lerin sadece `authenticated` için çalıştırılabildiğini kontrol edin.
3. Ayrı Staging test hesapları kullanın: yetkisiz kullanıcı, `users.block` izni olmayan personel, izinli personel ve engellenecek sıradan test üyesi. Gerçek kullanıcı hesabını kullanmayın.
4. Yetkisiz kullanıcı ve izinsiz personel `rotapark_staff_blocked_members()` ve `rotapark_staff_unblock_member(text,text)` çağrılarında `42501` almalı. Anonim istekler de erişememeli.
5. İzinli test personeliyle `/staff/tasks/?task=block` sayfasını açın. Test üyesini gerekçe girerek engelleyin; listede e-posta ve engel nedeni görünsün. İşlemi iptal edin: engel devam etmeli.
6. Aynı test üyesinin engelini en az üç karakterlik açıklamayla kaldırın. Onay penceresi hedef e-postayı göstermeli. Üye listeden kalkmalı, tekrar oturum açabilmeli ve `rotapark_member_unblock_audit` tablosunda aktör, hedef, eski neden, yeni gerekçe ve zaman kaydı oluşmalı.
7. Tekrar engel kaldırma denemesi `not_blocked` ile reddedilmeli. Kurucu/personel ve işlemi yapan hesabın hedef seçilmesi reddedilmeli. Aynı test üyeyi yeniden engellemek gerekiyorsa yalnızca Staging'de yapın.
8. Migrasyon, RPC veya audit kontrolünde hata olursa kabulü durdurun; Production'dan gizli anahtar veya veri kopyalamayın.

**Kabul ölçütü:** UI, yetki reddi, işlem iptali, engelleme, engel kaldırma, audit kaydı ve test hesabının yeniden girişinin tamamı Staging üzerinde doğrulanmadan özelliği tamamlandı olarak işaretlemeyin.

-- AYRI MANUEL ONAY — otomatik çalıştırılmamalı, setup dosyasına eklenmemeli.
-- Önce README: Dashboard URL + Settings proje ref'i bağımsız doğrulanmalı.
-- Hedef yalnızca dwlphvkcmvuroljxcdnq. SQL Editor rolü postgres olmalı.
-- Varsayılan hali DURUR. Yerel kopyada aşağıdaki placeholder'a tam onay cümlesini
-- elle yazın; proje kimliği SQL'den otomatik keşfedilmiş sayılmaz.
BEGIN;
DO $manual_approval$
DECLARE
 manual_confirmation constant text := 'REPLACE_AFTER_INDEPENDENT_DASHBOARD_VERIFICATION';
BEGIN
 IF current_user <> 'postgres' OR manual_confirmation IS DISTINCT FROM
    'APPROVE PREVIEW dwlphvkcmvuroljxcdnq' THEN
  RAISE EXCEPTION 'Bağımsız Dashboard kontrolü ve ayrı manuel onay gerekli';
 END IF;
END
$manual_approval$;
-- IF NOT EXISTS yok: önceden var olan bir kontrol nesnesine sessizce güvenme.
CREATE SCHEMA rotapark_preview_control AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA rotapark_preview_control FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE rotapark_preview_control.install_approval (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
 project_ref text NOT NULL CHECK (project_ref = 'dwlphvkcmvuroljxcdnq'),
 database_oid oid NOT NULL,
 approved_by name NOT NULL CHECK (approved_by = 'postgres'),
 approved_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK (expires_at > approved_at
   AND expires_at <= approved_at + interval '30 minutes')
);
ALTER TABLE rotapark_preview_control.install_approval ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rotapark_preview_control.install_approval
 FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO rotapark_preview_control.install_approval
 (project_ref, database_oid, approved_by, approved_at, expires_at)
SELECT 'dwlphvkcmvuroljxcdnq', oid, current_user,
       statement_timestamp(), statement_timestamp() + interval '30 minutes'
FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database();
COMMIT;

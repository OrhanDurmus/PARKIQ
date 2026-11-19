#!/usr/bin/env python3
"""Repair the two public Auth bindings for the ROTAPARK Pages Preview."""
import argparse
import getpass
import json
import re
import sys
import time
import urllib.error
import urllib.request
import warnings
from urllib.parse import urlsplit

DEPLOYMENT_ID = "eec02462-2150-46ef-bc2f-1b422ee31161"
BRANCH = "fix/preview-auth-runtime-bindings-20261119"
COMMIT = "bbfabd624f60b39461012bb51244852b71277b3c"
NAMES = ("SUPABASE_URL", "SUPABASE_ANON_KEY")
PROJECT_REF = re.compile(r"[a-z0-9]{20}")
PROJECT_URL = re.compile(r"https://([a-z0-9]{20})\.supabase\.co(?:/|$)")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(label, url, method="GET", headers=None, body=None):
    request = urllib.request.Request(
        url, method=method, headers=headers or {},
        data=None if body is None else json.dumps(body).encode(),
    )
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{label}: HTTP {exc.code}.") from None
    except (OSError, ValueError):
        raise SystemExit(f"{label}: bağlantı veya JSON yanıtı hatası.") from None


def check(condition, message):
    if not condition:
        raise SystemExit(message)


def private_input(prompt):
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            return getpass.getpass(prompt).strip()
        except getpass.GetPassWarning:
            raise SystemExit("Gizli giriş için etkileşimli terminal gerekli.") from None


def verify_deployment(deployment, project):
    metadata = (deployment.get("deployment_trigger") or {}).get("metadata") or {}
    check(deployment.get("environment") == "preview"
          and deployment.get("project_id") == project["id"]
          and deployment.get("project_name") == "rotapark"
          and metadata.get("branch") == BRANCH and metadata.get("commit_hash") == COMMIT,
          "Preview ortamı, proje, branch veya PR commit’i eşleşmedi.")


def show_binding_types(label, bindings):
    types = {"plain_text", "secret_text"}
    for name in (*NAMES, "SUPABASE_SERVICE_ROLE_KEY"):
        entry = bindings.get(name)
        kind = entry.get("type") if isinstance(entry, dict) else None
        status = kind if kind in types else "eksik" if entry is None else "bilinmeyen"
        print(f"{label} / {name}: {status}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Onayla, Preview PATCH ve retry uygula.")
    args = parser.parse_args()
    account = input("Cloudflare Account ID: ").strip()
    check(re.fullmatch(r"[a-fA-F0-9]{32}", account), "Geçersiz Account ID.")
    token = private_input("Cloudflare API tokenı: ")
    check(re.fullmatch(r"[A-Za-z0-9_-]+", token), "Geçersiz API token biçimi.")
    base = f"https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/rotapark"

    def cloudflare(path="", method="GET", body=None):
        envelope = request_json(
            f"Cloudflare {method}", base + path, method,
            {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body,
        )
        check(isinstance(envelope, dict) and envelope.get("success") is True
              and isinstance(envelope.get("result"), dict),
              f"Cloudflare {method} başarılı bir sonuç döndürmedi.")
        return envelope["result"]

    def inspect_project(project):
        source = (project.get("source") or {}).get("config") or {}
        check(project.get("name") == "rotapark" and project.get("subdomain") == "parkiq.pages.dev"
              and source.get("owner", "").lower() == "orhandurmus"
              and source.get("repo_name", "").lower() == "parkiq"
              and project.get("production_branch") == "main"
              and (source.get("production_branch") or "main") == "main",
              "Cloudflare projesi, repo veya Production branch eşleşmedi.")
        configs = project.get("deployment_configs") or {}
        check(isinstance(configs.get("preview"), dict) and isinstance(configs.get("production"), dict),
              "Cloudflare ortam yapılandırmaları doğrulanamadı.")
        preview = configs["preview"]
        check(not preview.get("wrangler_config_hash"),
              "Preview yapılandırması Wrangler tarafından yönetiliyor. API yazımı durduruldu.")
        return configs

    project = cloudflare()
    configs = inspect_project(project)
    path = f"/deployments/{DEPLOYMENT_ID}"
    original = cloudflare(path)
    verify_deployment(original, project)
    check(original.get("url") == "https://eec02462.parkiq.pages.dev", "Preview URL eşleşmedi.")
    before = configs["preview"].get("env_vars") or {}
    show_binding_types("Güncel Preview", before)
    show_binding_types("Eski dağıtım", original.get("env_vars") or {})

    preview_ref = input("Ayrı Preview Supabase project ref: ").strip()
    production_ref = input("Production Supabase project ref (karşılaştırma): ").strip()
    check(PROJECT_REF.fullmatch(preview_ref) and PROJECT_REF.fullmatch(production_ref)
          and preview_ref != production_ref, "Project ref’leri geçersiz veya aynı.")
    prod_binding = (configs["production"].get("env_vars") or {}).get(NAMES[0]) or {}
    prod_url = PROJECT_URL.match(str(prod_binding.get("value") or "").strip())
    check(not prod_url or prod_url[1] == production_ref,
          "Girilen Production ref, Pages Production URL’siyle eşleşmiyor.")
    url = f"https://{preview_ref}.supabase.co"
    key = private_input("Preview Supabase publishable key: ")
    check(re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", key), "Publishable key biçimi geçersiz.")
    settings = request_json("Supabase Auth ayarları", url + "/auth/v1/settings", headers={"apikey": key})
    check(isinstance(settings, dict) and isinstance(settings.get("external"), dict),
          "Supabase Auth ayarları beklenen yanıta uymuyor.")
    print("Preview Supabase Auth, URL ve publishable key çiftini kabul etti.")
    if not args.apply:
        print("Salt okunur kontrol tamamlandı. Yazmak için --apply kullanın.")
        return

    check("SUPABASE_SERVICE_ROLE_KEY" in before and before["SUPABASE_SERVICE_ROLE_KEY"] is not None,
          "Preview OTP sunucu bağlaması eksik. Yazım durduruldu.")
    print("Mevcut Service Role bağlamasının aynı Preview projesine ait olduğunu ve diğer Preview"
          " bağlamalarının Production kaynaklarına gitmediğini doğrulayın.")
    check(input("Doğruladıysanız ve PATCH + Preview retry onaylıysa ROTAPARK-PREVIEW yazın: ")
          == "ROTAPARK-PREVIEW", "İptal edildi.")

    current_project = cloudflare()
    check(current_project.get("id") == project["id"] and inspect_project(current_project) == configs,
          "Yapılandırma kontrol sırasında değişti. Baştan çalıştırın.")
    verify_deployment(cloudflare(path), project)
    values = dict(zip(NAMES, (url, key)))
    updates = {name: {"type": "plain_text", "value": value} for name, value in values.items()
               if (before.get(name) or {}).get("value") != value}
    if updates:
        cloudflare(method="PATCH", body={"deployment_configs": {"preview": {"env_vars": updates}}})
    after = inspect_project(cloudflare())

    def without_auth(config):
        return {**config, "env_vars": {name: entry for name, entry in
                                       (config.get("env_vars") or {}).items() if name not in NAMES}}

    check(after["production"] == configs["production"]
          and without_auth(after["preview"]) == without_auth(configs["preview"]),
          "API kontrolünde beklenmeyen yapılandırma farkı görüldü. Retry durduruldu.")
    bindings = after["preview"].get("env_vars") or {}
    check(all((bindings.get(name) or {}).get("value") == value for name, value in values.items()),
          "Preview bağlamaları API üzerinden doğrulanamadı. Retry durduruldu.")
    print("Preview ayarları doğrulandı. Preview dağıtımı yeniden başlatılıyor.")

    deployment = cloudflare(path + "/retry", "POST")
    verify_deployment(deployment, project)
    new_id = deployment.get("id", "")
    check(re.fullmatch(r"[a-f0-9-]{36}", new_id) and new_id != DEPLOYMENT_ID,
          "Yeni dağıtım kimliği doğrulanamadı. Preview dağıtımlarını API üzerinden kontrol edin.")
    for _ in range(60):
        deployment = cloudflare(f"/deployments/{new_id}")
        verify_deployment(deployment, project)
        stage = deployment.get("latest_stage") or {}
        check(stage.get("status") not in {"failure", "canceled", "skipped"},
              "Preview dağıtımı tamamlanamadı.")
        if stage.get("name") == "deploy" and stage.get("status") == "success":
            break
        time.sleep(5)
    else:
        raise SystemExit("Preview dağıtımı bekleme süresini aştı. Dağıtımı Cloudflare API ile kontrol edin.")

    origin = deployment.get("url", "")
    host = urlsplit(origin)
    check(host.scheme == "https" and re.fullmatch(r"[a-f0-9]{8}\.parkiq\.pages\.dev", host.netloc)
          and not (host.path or host.query or host.fragment), "Yeni Preview URL biçimi beklenmedik.")
    print(f"Yeni Preview: {origin}")
    result = request_json("Preview auth-config", origin + "/api/auth-config")
    check(isinstance(result, dict) and result.get("configured") is True
          and result.get("url") == url and result.get("anonKey") == key
          and set(result) == {"configured", "url", "anonKey"},
          "Preview runtime auth ayarları beklenen değerlerle eşleşmedi.")
    print("configured:true. Preview URL ve publishable key runtime’da doğrulandı.")


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        sys.exit("İşlem durduruldu. Yazım başladıysa mevcut Preview ayarlarını GET ile kontrol edin.")
    except Exception:
        sys.exit("Beklenmeyen yanıt veya yerel hata. Ayrıntılar hassas veri içerebileceği için gizlendi.")

#!/usr/bin/env python3
"""Read Staging metadata and isolate the İBB connection failure phase."""
import http.client
import json
import os
import re
import socket
import ssl
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

CF_API = "https://api.cloudflare.com/client/v4"
BRANCH = "staging/rotapark-occupancy"
PAGES_PROJECT = "rotapark-staging"
IBB_HOST = "api.ibb.gov.tr"
PRODUCTION_KV = "b961f4d221e248719e76df2e9b61f31f"
STAGING_NAME = re.compile(r"(?:^|[-_])(?:staging|preview|stage|test)(?:$|[-_])", re.I)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read(url, token=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with build_opener(NoRedirect()).open(Request(url, headers=headers), timeout=12) as response:
        return json.load(response)


def cf_get(token, label, path):
    try:
        response = read(CF_API + path, token)
    except HTTPError as error:
        print(f"{label}: HTTP {error.code}")
        return None
    except (URLError, ValueError, OSError) as error:
        print(f"{label}: {type(error).__name__}")
        return None
    if not response.get("success"):
        codes = [entry.get("code") for entry in response.get("errors", [])]
        print(f"{label}: API error codes {[code for code in codes if type(code) is int]}")
        return None
    return response.get("result")


def occupancy_namespace(project, environment):
    config = (project.get("deployment_configs") or {}).get(environment) or {}
    bindings = config.get("kv_namespaces") or {}
    return (bindings.get("ISPARK_SNAPSHOTS") or {}).get("namespace_id")


def project_audit(token, account, project, production_project):
    name = project["name"]
    if project.get("production_branch") == BRANCH or project.get("production_branch") is None:
        print("Skipped Pages project without a confirmed separate production branch")
        return
    path = account + "/pages/projects/" + quote(name, safe="")
    config = project.get("deployment_configs") or {}
    preview = config.get("preview") or {}
    namespace = occupancy_namespace(project, "preview")
    production_namespace = occupancy_namespace(production_project or {}, "production")
    isolated = bool(namespace and production_namespace
                    and namespace not in {production_namespace, PRODUCTION_KV})
    print(f"Direct Pages binding check: Staging Preview present={bool(namespace)}; "
          f"Production present={bool(production_namespace)}; isolated={isolated}")
    if not isolated:
        return False
    if namespace:
        kv_path = account + "/storage/kv/namespaces/" + quote(namespace, safe="")
        details = cf_get(token, "Preview KV namespace metadata", kv_path)
        print(f"Preview KV namespace metadata visible={isinstance(details, dict)}")
        try:
            snapshot = read(CF_API + kv_path + "/values/latest", token)
            print("Preview KV latest snapshot:", {
                "collectedAt": snapshot.get("collectedAt"),
                "receivedAt": snapshot.get("receivedAt"),
                "pointCount": len(snapshot.get("points") or []),
            })
        except HTTPError as error:
            print(f"Preview KV latest snapshot: HTTP {error.code}")
        except (URLError, ValueError, OSError) as error:
            print(f"Preview KV latest snapshot: {type(error).__name__}")
    env_var = (preview.get("env_vars") or {}).get("ISPARK_UPLOAD_TOKEN") or {}
    print(f"Pages preview upload secret configured={env_var.get('type') == 'secret_text'}")

    query = urlencode({"env": "preview", "per_page": 10})
    deployments = cf_get(token, "Pages preview deployments", path + "/deployments?" + query)
    matches = [item for item in deployments or [] if item.get("environment") == "preview"
               and (item.get("deployment_trigger", {}).get("metadata") or {}).get("branch") == BRANCH]
    print(f"Pages preview deployments returned: {len(deployments or [])}; matching PR branch: {len(matches)}")
    if not matches:
        staging_previews = [item for item in deployments or [] if item.get("environment") == "preview"
                            and STAGING_NAME.search((item.get("deployment_trigger", {}).get("metadata") or {}).get("branch", ""))]
        print(f"Other Staging/Preview branch deployments in latest page: {len(staging_previews)}")
        return True
    deployment = matches[0]
    deployment_id = quote(deployment["id"], safe="")
    deployment_path = f"{path}/deployments/{deployment_id}"
    for _ in range(8):
        if (deployment.get("latest_stage") or {}).get("status") not in {"idle", "active"}:
            break
        time.sleep(5)
        updated = cf_get(token, "Pages preview deployment state", deployment_path)
        if not updated or updated.get("environment") != "preview":
            break
        deployment = updated
    stage = deployment.get("latest_stage") or {}
    print(f"Latest preview deployment stage: {stage.get('name')}, status: {stage.get('status')}")
    logs = cf_get(token, "Pages preview build logs", deployment_path + "/history/logs")
    if isinstance(logs, dict):
        lines = logs.get("data") or []
        errors = sum(bool(re.search(r"\b(?:error|failed|timeout)\b", str(line), re.I)) for line in lines)
        print(f"Preview build logs: {len(lines)} entries, {errors} error markers")

    host = urlsplit(deployment.get("url") or "").hostname or ""
    suffix = "." + name + ".pages.dev"
    if not host.endswith(suffix) or host.count(".") != suffix.count("."):
        return True
    try:
        status = read("https://" + host + "/api/ispark-status")
        keys = ("ok", "status", "parkingCount", "verifiedLiveCount", "receivedAt",
                "collectedAt", "snapshotAgeMinutes", "upstreamUnavailable")
        print("Preview occupancy status:", {key: status.get(key) for key in keys})
        diagnostic = status.get("diagnostic") or {}
        print("Preview occupancy diagnostic:", {key: diagnostic.get(key) for key in ("stage", "reason", "upstreamStatus")})
    except HTTPError as error:
        body = error.read(8192).lower()
        location = urlsplit(error.headers.get("Location") or "").hostname or ""
        access_signal = location.endswith(".cloudflareaccess.com") or b"cloudflare access" in body
        challenge_signal = error.headers.get("cf-mitigated") == "challenge"
        print(f"Preview occupancy status: HTTP {error.code}; Cloudflare Access signal={access_signal}; challenge signal={challenge_signal}")
    except (URLError, ValueError, OSError) as error:
        print(f"Preview occupancy status: {type(error).__name__}")

    return True


def workers_audit(token, account):
    workers = cf_get(token, "Workers list", account + "/workers/scripts")
    staging = [item["id"] for item in workers or [] if STAGING_NAME.search(item.get("id", ""))
               and "rotapark" in item.get("id", "").lower()]
    print(f"ROTAPARK Workers with a Staging/Preview name: {len(staging)}")
    for name in staging:
        path = account + "/workers/scripts/" + quote(name, safe="")
        settings = cf_get(token, "Staging Worker settings", path + "/settings")
        schedules = cf_get(token, "Staging Worker schedules", path + "/schedules")
        print(f"Staging Worker {name}:")
        if isinstance(settings, dict):
            bindings = [binding for binding in settings.get("bindings", [])
                        if binding.get("type") == "kv_namespace"]
            kv = [(binding.get("name"), binding.get("namespace_id") == PRODUCTION_KV) for binding in bindings]
            print(f"  KV binding / matches Production namespace: {kv}")
            print(f"  Observability enabled={bool((settings.get('observability') or {}).get('enabled'))}")
        if isinstance(schedules, dict):
            schedules = schedules.get("schedules")
        if isinstance(schedules, list):
            print(f"  Cron triggers: {len(schedules)}")


def cloudflare():
    token = os.environ.get("CLOUDFLARE_STAGING_READ_TOKEN")
    if not token:
        sys.exit("Staging Cloudflare secret missing from this workflow")
    verified = cf_get(token, "Cloudflare user-token verification", "/user/tokens/verify")
    if verified:
        status = verified.get("status")
        print(f"Cloudflare user-token status: {status if status in {'active', 'disabled', 'expired'} else 'unknown'}")
        if status != "active":
            sys.exit(1)
    accounts = cf_get(token, "Cloudflare accessible accounts", "/accounts?per_page=50")
    if not accounts:
        sys.exit("No accessible Cloudflare account found")
    confirmed = False
    for item in accounts:
        account = "/accounts/" + quote(item["id"], safe="")
        if not verified:
            account_token = cf_get(token, "Cloudflare account-token verification", account + "/tokens/verify")
            if account_token:
                print(f"Cloudflare account-token active={account_token.get('status') == 'active'}")
        pages = account + "/pages/projects/"
        staging = cf_get(token, "Direct Staging Pages project", pages + PAGES_PROJECT)
        if not staging or staging.get("name") != PAGES_PROJECT:
            continue
        production = cf_get(token, "Direct Production Pages binding metadata", pages + "rotapark")
        if production and production.get("name") != "rotapark":
            production = None
        confirmed = project_audit(token, account, staging, production) or confirmed
        workers_audit(token, account)
    if not confirmed:
        sys.exit("Staging KV isolation was not confirmed by both Pages bindings")


def ibb():
    start = time.monotonic()
    try:
        addresses = socket.getaddrinfo(IBB_HOST, 443, type=socket.SOCK_STREAM)
    except OSError as error:
        sys.exit(f"İBB DNS resolution failed: {type(error).__name__} (errno={error.errno})")
    print(f"İBB DNS: {len(addresses)} address candidates after {time.monotonic()-start:.2f}s")
    for family, label in ((socket.AF_INET, "IPv4"), (socket.AF_INET6, "IPv6")):
        candidate = next((address for address in addresses if address[0] == family), None)
        if not candidate:
            continue
        family, kind, protocol, _, endpoint = candidate
        stage = "TCP connect"
        start = time.monotonic()
        try:
            with socket.socket(family, kind, protocol) as raw:
                raw.settimeout(8)
                raw.connect(endpoint)
                print(f"İBB {label} TCP connected after {time.monotonic()-start:.2f}s")
                stage = "TLS handshake"
                with ssl.create_default_context().wrap_socket(raw, server_hostname=IBB_HOST) as tls:
                    print(f"İBB {label} TLS verified: {tls.version()}")
                    stage = "HTTP response"
                    tls.sendall(f"GET /ispark/Park HTTP/1.1\r\nHost: {IBB_HOST}\r\nAccept: application/json\r\nUser-Agent: ROTAPARK-ISPARK-audit/1.0\r\nConnection: close\r\n\r\n".encode("ascii"))
                    response = http.client.HTTPResponse(tls)
                    response.begin()
                    print(f"İBB {label} HTTP status: {response.status}")
                    if response.status == 200:
                        return
        except OSError as error:
            print(f"İBB {label} {stage} failed: {type(error).__name__} (errno={error.errno}) "
                  f"after {time.monotonic()-start:.2f}s")
    sys.exit(1)


if __name__ == "__main__":
    {"cloudflare": cloudflare, "ibb": ibb}[sys.argv[1]]()

#!/usr/bin/env python3
"""Read-only Cloudflare preflight and six-resource creation request planner.

Intentionally has no apply mode. Never sends the planned write requests.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ACCOUNT_ID = "314d5902d5a9b718c76aef7ac4586150"
TOKEN_ENV = "ROTAPARK_FCM_TEST_SETUP_TOKEN"
BASE = "https://api.cloudflare.com/client/v4"
RESOURCES = (
    ("Pages", "pages/projects", "rotapark-fcm-test", "name"),
    ("Worker", "workers/scripts", "rotapark-fcm-test", "id"),
    ("D1", "d1/database", "rotapark-fcm-test-db", "name"),
    ("KV", "storage/kv/namespaces", "rotapark-fcm-test-kv", "title"),
    ("Queue", "queues", "rotapark-fcm-test-queue", "queue_name"),
    ("DLQ", "queues", "rotapark-fcm-test-dlq", "queue_name"),
)


class PreflightError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def get_json(path, token):
    # No caller can select another origin or use a write method.
    if not path.startswith("/") or path.startswith("//"):
        raise PreflightError("Geçersiz API yolu")
    request = urllib.request.Request(
        BASE + path, headers={"Authorization": "Bearer " + token}, method="GET"
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        # Never print raw bodies, headers, request objects or credentials.
        raise PreflightError(f"GET {path}: HTTP {error.code}") from None
    except Exception:
        raise PreflightError(f"GET {path}: bağlantı veya JSON hatası") from None
    if not isinstance(data, dict) or data.get("success") is not True:
        raise PreflightError(f"GET {path}: API başarı doğrulaması başarısız")
    return data


def list_all(path, token):
    rows = []
    page = 1
    cursor = None
    seen = set()
    while page <= 10000:
        # Pages accepts a smaller page size than the other resource families.
        query = {"per_page": 10}
        query.update({"cursor": cursor} if cursor else {"page": page})
        data = get_json(path + "?" + urllib.parse.urlencode(query), token)
        batch = data.get("result")
        if not isinstance(batch, list):
            raise PreflightError(f"GET {path}: beklenmeyen liste biçimi")
        rows.extend(batch)
        info = data.get("result_info") or {}
        next_cursor = info.get("cursor")
        if next_cursor:
            if next_cursor in seen:
                raise PreflightError("Tekrarlanan sayfalama imleci")
            seen.add(next_cursor)
            cursor = next_cursor
        elif "total_pages" in info:
            if page >= info["total_pages"]:
                return rows
            page += 1
        elif len(batch) < 10:
            return rows
        elif cursor:
            return rows
        else:
            page += 1
    raise PreflightError("Sayfalama sınırı aşıldı; eksiksiz kontrol yapılamadı")


def check(token):
    prefix = "/accounts/" + ACCOUNT_ID
    account = get_json(prefix, token).get("result")
    if not isinstance(account, dict) or account.get("id") != ACCOUNT_ID:
        raise PreflightError("Hesap ID doğrulanamadı")
    inventories = {}
    collisions = []
    summary = []
    for kind, endpoint, name, field in RESOURCES:
        if endpoint not in inventories:
            inventories[endpoint] = list_all(prefix + "/" + endpoint, token)
        rows = inventories[endpoint]
        if any(not isinstance(row, dict) or not isinstance(row.get(field), str) for row in rows):
            raise PreflightError(f"{kind}: kaynak adları doğrulanamadı")
        exists = any(row[field].casefold() == name.casefold() for row in rows)
        summary.append({"type": kind, "name": name, "collision": exists})
        if exists:
            collisions.append(name + " (" + kind + ")")
    if collisions:
        raise PreflightError("İsim çakışması; DUR: " + ", ".join(collisions))
    return summary


def creation_plan():
    prefix = BASE + "/accounts/" + ACCOUNT_ID
    result = []
    for kind, endpoint, name, _ in RESOURCES:
        item = {"type": kind, "name": name, "method": "POST", "url": prefix + "/" + endpoint}
        if kind == "Worker":
            item.update(method="PUT", url=item["url"] + "/" + name,
                        multipart={"metadata": {"main_module": "passive-worker.mjs", "bindings": []},
                                   "module_file": "passive-worker.mjs", "module_type": "application/javascript+module"})
        else:
            field = "title" if kind == "KV" else "queue_name" if kind in ("Queue", "DLQ") else "name"
            item["json"] = {field: name}
            if kind == "Pages":
                item["json"]["production_branch"] = "chore/fcm-test-infrastructure"
        result.append(item)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Ağsız plan; hesap ve isim doğrulaması yapılmaz")
    args = parser.parse_args()
    try:
        if args.offline:
            checks = "NOT_VERIFIED_OFFLINE"
        else:
            token = os.environ.get(TOKEN_ENV)
            if not token:
                raise PreflightError(TOKEN_ENV + " ortamda hazır değil")
            checks = check(token)
        # Check the local shell exists before reporting a usable plan.
        Path(__file__).with_name("passive-worker.mjs").read_text()
        print(json.dumps({"mode": "dry-run", "account_id": ACCOUNT_ID,
                          "preflight": checks, "write_requests_sent": 0,
                          "creation_requests_not_executed": creation_plan()}, ensure_ascii=False, indent=2))
        return 0
    except (PreflightError, OSError) as error:
        print("DUR: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""ROTAPARK: safe, read-only İBB İSPARK connectivity probe.
Run: python3 scripts/probe_ispark_from_tr.py
No credentials, writes, or external dependencies.
"""
import json
import socket
import ssl
import time
import urllib.error
import urllib.request

URL = "https://api.ibb.gov.tr/ispark/Park"

def main():
    started = time.monotonic()
    host = "api.ibb.gov.tr"
    try:
        addresses = sorted({x[4][0] for x in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
        print("dns_resolved:", bool(addresses), "address_count:", len(addresses), flush=True)
    except OSError as exc:
        print("dns_error:", type(exc).__name__, str(exc)[:120], flush=True)
        return 2
    try:
        req = urllib.request.Request(URL, headers={"Accept": "application/json", "User-Agent": "ROTAPARK-ConnectivityProbe/1.0"})
        with urllib.request.urlopen(req, timeout=15, context=ssl.create_default_context()) as response:
            raw = response.read(5_000_001)
            if len(raw) > 5_000_000:
                print("error: payload_too_large", flush=True)
                return 3
            data = json.loads(raw)
            rows = data if isinstance(data, list) else data.get("data", data.get("parks", [])) if isinstance(data, dict) else []
            if not isinstance(rows, list):
                print("error: unexpected_json_shape", flush=True)
                return 3
            sample = rows[0] if rows else {}
            print(json.dumps({"reachable": True, "http_status": response.status,
                              "records": len(rows), "has_park_id": "parkID" in sample,
                              "has_capacity": "capacity" in sample,
                              "has_free_capacity": "emptyCapacity" in sample,
                              "has_update_timestamp": any(k in sample for k in ("lastUpdate", "updatedAt", "occupancyUpdatedAt", "updateDate")),
                              "elapsed_seconds": round(time.monotonic() - started, 2)}, ensure_ascii=False))
            return 0
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"reachable": False, "error_type": type(exc).__name__,
                          "http_status": getattr(exc, "code", None),
                          "elapsed_seconds": round(time.monotonic() - started, 2)}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())

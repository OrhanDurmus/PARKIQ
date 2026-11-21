#!/usr/bin/env python3
"""Fetch and validate an ISPARK snapshot; upload only on success."""
from datetime import datetime, timezone
from urllib.parse import urlsplit
import json, os, sys, time, urllib.request
SOURCE="https://api.ibb.gov.tr/ispark/Park"
PRODUCTION_TARGET="https://rotapark.com.tr/api/ispark-upload"

class NoUploadRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def upload_target():
    if os.environ.get("GITHUB_REF") == "refs/heads/main":
        return PRODUCTION_TARGET
    origin = os.environ.get("ISPARK_PREVIEW_ORIGIN", "")
    url = urlsplit(origin)
    if (url.scheme != "https" or not url.hostname or url.netloc != url.hostname
        or not url.hostname.endswith(".pages.dev") or len(url.hostname.split(".")) < 4
        or url.path not in ("", "/") or url.query or url.fragment):
        sys.exit("Set ISPARK_PREVIEW_ORIGIN to a branch-specific Cloudflare Pages preview origin")
    return origin.rstrip("/") + "/api/ispark-upload"

def main():
    target=upload_target()
    token_name="ISPARK_UPLOAD_TOKEN" if os.environ.get("GITHUB_REF") == "refs/heads/main" else "ISPARK_PREVIEW_UPLOAD_TOKEN"
    token=os.environ.get(token_name,"")
    if not token:
        sys.exit(f"Missing GitHub Actions secret {token_name}")
    rows=None
    collected_at=None
    for attempt in range(3):
        try:
            req=urllib.request.Request(SOURCE,headers={"Accept":"application/json","User-Agent":"ROTAPARK-ISPARK-collector/1.0"})
            with urllib.request.urlopen(req,timeout=20) as response:
                data=json.load(response)
            rows=data if isinstance(data,list) else data.get("data",data.get("parks")) if isinstance(data,dict) else None
            if not isinstance(rows,list) or len(rows)<100:
                raise ValueError("Too few source records")
            valid=[p for p in rows if isinstance(p,dict) and p.get("parkID") is not None and isinstance(p.get("parkName"),str) and p.get("lat") is not None and p.get("lng") is not None]
            if len(valid)<100:
                raise ValueError("Too few valid parking records")
            print("Validated source records:",len(valid))
            rows=valid[:2000]
            collected_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
            break
        except Exception as error:
            print("Source attempt",attempt+1,"failed:",type(error).__name__,str(error)[:150],flush=True)
            if attempt<2: time.sleep(3*(attempt+1))
    if collected_at is None:
        print("::warning title=ISPARK source unavailable::Source fetch failed after 3 attempts; existing snapshot retained. No upload performed.",flush=True)
        sys.exit(1)
    body=json.dumps({"collectedAt":collected_at,"rows":rows},ensure_ascii=False,separators=(",",":")).encode("utf-8")
    if len(body)>1500000:
        sys.exit("Snapshot exceeds upload size limit")
    req=urllib.request.Request(target,data=body,method="POST",headers={"Authorization":"Bearer "+token,"Content-Type":"application/json; charset=utf-8","Accept":"application/json"})
    uploader=urllib.request.build_opener(NoUploadRedirect())
    with uploader.open(req,timeout=25) as response:
        result=json.load(response)
    if not result.get("ok") or result.get("accepted",0)<100:
        sys.exit("Upload not accepted")
    print("Upload accepted:",result["accepted"],"at",result.get("receivedAt"))
if __name__=="__main__":
    main()

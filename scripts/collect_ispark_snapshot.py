#!/usr/bin/env python3
"""Fetch and validate an ISPARK snapshot; upload only on success."""
import json, os, sys, time, urllib.request, urllib.error
SOURCE="https://api.ibb.gov.tr/ispark/Park"
TARGET="https://rotapark.com.tr/api/ispark-upload"
def main():
    token=os.environ.get("ISPARK_UPLOAD_TOKEN","")
    if not token:
        sys.exit("Missing GitHub Actions secret ISPARK_UPLOAD_TOKEN")
    rows=None
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
            break
        except Exception as error:
            print("Source attempt",attempt+1,"failed:",type(error).__name__,str(error)[:150],flush=True)
            if attempt<2: time.sleep(3*(attempt+1))
    if not isinstance(rows,list):
        sys.exit("Source unavailable; existing snapshot retained")
    body=json.dumps(rows,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    if len(body)>1500000:
        sys.exit("Snapshot exceeds upload size limit")
    req=urllib.request.Request(TARGET,data=body,method="POST",headers={"Authorization":"Bearer "+token,"Content-Type":"application/json; charset=utf-8","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=25) as response:
        result=json.load(response)
    if not result.get("ok") or result.get("accepted",0)<100:
        sys.exit("Upload not accepted")
    print("Upload accepted:",result["accepted"],"at",result.get("receivedAt"))
if __name__=="__main__":
    main()

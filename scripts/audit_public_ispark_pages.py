#!/usr/bin/env python3
"""Inspect public parking pages and their same-origin script references."""
import concurrent.futures
import re
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PAGES = {
    "İSPARK MVY": "https://mvy.ispark.istanbul/otoparklar",
    "İSPARK catalog": "https://ispark.istanbul/otoparklarimiz/",
    "İBB APS": "https://uym.ibb.gov.tr/aps/",
    "İBB CBS docs": "https://cbsapi.ibb.gov.tr/docs",
    "İBB Şehir Haritası API": "https://sehirharitasiapi.ibb.gov.tr/developer/v1/api.html",
    "B40 İSPARK list": "https://opendata.b40cities.org/dataset/ispark-otopark-listesi-web-servisi",
}
SIGNALS = re.compile(r"boş kapasite|emptyCapacity|freeSpaces|parkID|lastUpdate|setInterval|setTimeout|occupancy|doluluk", re.I)
REFERENCES = re.compile(r"""["']((?:https?://[\w.-]+/|/)[\w./-]{2,180})["']""")
RELATED = re.compile(r"ispark|otopark|parking|occupancy|parkdetail|parkdetay|openapi|swagger", re.I)
OFFICIAL = re.compile(r"(?:^|\.)(?:ispark\.istanbul|ibb\.gov\.tr|ibb\.istanbul|b40cities\.org)$")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            src = dict(attrs).get("src")
            if src:
                self.sources.append(src)


def read(url):
    try:
        request = Request(url, headers={"User-Agent": "ROTAPARK-Public-Documentation-Audit/1.0"})
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                return "response exceeds audit limit", ""
            return f"HTTP {response.status}", body.decode(response.headers.get_content_charset() or "utf-8", "replace")
    except HTTPError as error:
        location = urlsplit(urljoin(url, error.headers.get("Location") or ""))
        if 300 <= error.code < 400 and OFFICIAL.search(location.hostname or ""):
            return f"HTTP {error.code} -> {location.hostname}{location.path}", ""
        return f"HTTP {error.code}", ""
    except (OSError, URLError) as error:
        reason = getattr(error, "reason", error)
        return type(reason).__name__, ""


def inspect(page):
    label, url = page
    state, body = read(url)
    lines = [f"{label}: {state}"]
    if not body:
        return lines
    html = Scripts()
    html.feed(body)
    lines.append(f"  HTML signals: {sorted({item.lower() for item in SIGNALS.findall(body)})}")
    references = set(REFERENCES.findall(body))
    origin = urlsplit(url).hostname
    assets = list(dict.fromkeys(urljoin(url, src) for src in html.sources))
    assets = [asset for asset in assets if urlsplit(asset).scheme == "https"
              and urlsplit(asset).netloc == origin]
    lines.append(f"  Same-origin script references: {len(assets)}")
    for asset in assets[:6]:
        status, source = read(asset)
        signals = sorted({item.lower() for item in SIGNALS.findall(source)})
        lines.append(f"  Script {urlsplit(asset).path}: {status}; signals={signals}")
        references.update(REFERENCES.findall(source))
    relevant = {urlsplit(urljoin(url, item)) for item in references}
    safe = sorted(f"{item.hostname}{item.path}" for item in relevant
                  if OFFICIAL.search(item.hostname or "") and RELATED.search(item.path))
    lines.append(f"  Public service/page path references: {safe[:20]}")
    return lines


if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for report in pool.map(inspect, PAGES.items()):
            print("\n".join(report))

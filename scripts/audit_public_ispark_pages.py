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
REQUEST_CALL = re.compile(r"""(?:fetch|jsonRpc|rpc|ajax|getJSON)\s*\(\s*["']((?:https?://[\w.-]+/|/)[\w./-]{2,180})["']""", re.I)
TIMER = re.compile(r"setInterval|setTimeout|lastUpdate", re.I)
PARKING = re.compile(r"boş kapasite|emptyCapacity|freeSpaces|parkID|occupancy|otopark", re.I)
RELATED = re.compile(r"ispark|otopark|parking|occupancy|parkdetail|parkdetay|openapi|swagger", re.I)
OFFICIAL = re.compile(r"(?:^|\.)(?:ispark\.istanbul|ibb\.gov\.tr|ibb\.istanbul|b40cities\.org)$")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []
        self.inline = []
        self.in_script = False
        self.in_style = False
        self.free_labels = 0
        self.parking_attributes = set()

    def handle_starttag(self, tag, attrs):
        self.parking_attributes.update(name for name, _ in attrs
                                       if name.startswith("data-") and PARKING.search(name))
        if tag == "style":
            self.in_style = True
        if tag == "script":
            self.in_script = True
            src = dict(attrs).get("src")
            if src:
                self.sources.append(src)

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False
        if tag == "style":
            self.in_style = False

    def handle_data(self, data):
        if self.in_script:
            self.inline.append(data)
        elif not self.in_style:
            self.free_labels += len(re.findall("boş kapasite", data, re.I))


def script_evidence(source):
    safe_paths = []
    for reference in REQUEST_CALL.findall(source):
        parsed = urlsplit(reference)
        if not parsed.netloc or OFFICIAL.search(parsed.hostname or ""):
            safe_paths.append(parsed.path)
    timers = sum(bool(PARKING.search(source[max(0, match.start()-120):match.end()+120]))
                 for match in TIMER.finditer(source))
    return f"literal request paths={sorted(set(safe_paths))[:12]}; timer/update markers near parking terms={timers}"


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
    lines.append(f"  Parking labels in HTML text: {html.free_labels}; parking data attributes: {sorted(html.parking_attributes)}")
    lines.append("  Inline scripts: " + script_evidence("\n".join(html.inline)))
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
        if source:
            lines.append("    " + script_evidence(source))
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

# PR #372 — ANPARK verified directory integration

## Source evidence (checked 20 November 2026, Europe/Istanbul)

- Official operator: https://www.anpark.com.tr/
- The site's own `ANPARK_CFG.restParksUrl`: https://www.anpark.com.tr/wp-json/anpark/v1/parks (HTTP 200; 24 records).
- BELTAŞ confirms that ANPARK is its parking brand: https://www.bel-tas.com.tr/
- Provider identifiers, coordinates, active flags and raw-response SHA-256 are retained in `data/anpark-official.json`. The provider does not publish a measurement/update timestamp in these rows. `checkedAt` is the retrieval/review date, not the date a facility opened or changed.
- 23 active records; `1096` Kale Açık Otoparkı is inactive in the directory. This is not evidence of permanent physical closure. Active `1104` Kızılcahamam is about 63 km from the specified Ankara center, outside 30 km.
- These are the operator's published facility positions, not verified vehicle entrances. No live occupancy or fee is inferred. Unknown/zero capacity is not treated as a zero-capacity parking lot.

## OSM matching and preservation

Directly inspected all 25,053 records in `data/parking-turkiye.json`, dated 17 November 2026, and calculated nearby candidates for each official facility.

Only two joins are approved on identity + name + coordinates:

| Official ID | OSM identity | Evidence | Distance |
|---|---|---|---:|
| 1118 | way/421433589 | Sıhhiye Çok Katlı Otoparkı; same named facility, public access | 86.8 m |
| 1097 | node/13025867011 | Ankara Büyükşehir Belediyesi 100. Yıl Otoparkı; municipal operator, same 100. Yıl facility | 39.8 m |

OSM source endpoints were also read: https://www.openstreetmap.org/api/0.6/way/421433589 and https://www.openstreetmap.org/api/0.6/node/13025867011.

The OSM names, IDs and coordinates are retained. The official name, position, capacity, schedule, source and operator evidence are attached separately. Name, location, operator or access changes invalidate a reviewed join; proximity alone never assigns ANPARK. Approved OSM exclusions also prevent the corresponding official identity from being reintroduced.

The other 21 active official identities are separate additions nationwide, 20 inside Ankara's 30km query. Nearby anonymous OSM areas remain unclassified: their identities have not been proven. Possible co-located duplicates are preferable to deleting or incorrectly relabeling a real record. Panora's *roadside* ANPARK entry does not make the shopping center's customer parking ANPARK; nearby hotels, universities, ANFA and district-municipality facilities retain their data.

The Geofabrik file is unchanged. The reviewed directory is merged at read time so a weekly OSM refresh cannot erase it. The stale frontend list (Armada/Altınpark) was replaced with the currently published 24 names (including Necatibey/Kızılcahamam). ANPARK membership is no longer inferred merely from an exact name match; explicit operator evidence drives the filter.

## Verification layers

### Real HTTP observations before this change

At center 39.9334,32.8597 and radius 30 km, Production and the earlier Preview 9243fb99 both returned 2,515 general records. Earlier Preview browser diagnostics showed 1 ANPARK result / 1 visible pin. This was coverage/classification, not loss of 2,514 records. Later Production requests intermittently returned HTTP 503, body `error code: 1102`; those are unavailable comparisons, never zero counts. Production is read-only and no attempted resource-limit fix is included.

### Local integration/regression results

With the committed dataset and official directory, the same API handler returns **2,535 general records, of which 22 have an official ANPARK ID**. All 2,515 original in-radius OSM IDs are preserved. Nationwide integration has 23 active official ANPARK identities (2 enriched + 21 additional). These are local results until confirmed against the new deployed Preview.

62 Node tests pass, including all 81 province centers at 3/10/20/30km, original identity preservation, inactive/out-of-radius handling, private-facility lookalikes, changed/ambiguous reviewed matches, request races, and actual directory-backed ANPARK → İSPARK → İZELMAN → ANPARK transitions. VM rendering verifies filtered count equals represented pin/cluster membership and resetting returns all regional records. VM tests are not physical-device/browser screenshots.

`node tests/rotapark-smoke.cjs`, `node scripts/check-js-syntax.cjs`, and `git diff --check` pass. The entrance test's import was changed to a file import to support the parking handler's new helper import; navigation behavior/code is unchanged.

Additional proven fixes retained in this PR: conflicting `way/866788590` (name İZELMAN, operator İSPARK) remains in general results without a contradictory corporate badge; an explicit “Tüm otoparkları göster” control restores regional records without requesting location or changing the center/radius.

## Remaining limits

- Independently surveyed entrance coordinates, current parking availability, provider timestamp and current prices remain unverified.
- Only two OSM identities are conclusively matched; the remaining official records may overlap anonymous OSM geometry but are not merged on proximity alone.
- The official snapshot requires review when the operator changes its published directory; no new scheduled job or Production configuration is introduced.
- The complete Source/API-city audit CSV is `anpark-source-audit-pr372.csv` (24 official rows; no synthetic coordinates).

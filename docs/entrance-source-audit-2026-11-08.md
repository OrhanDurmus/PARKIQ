# ROTAPARK — First-pass entrance source audit (2026-11-08)

This is a **documentary audit only**. No source below proves a surveyed, precise vehicle entrance latitude/longitude. **Do not set `entranceVerified=true` or override navigation coordinates from these addresses.**

| Parking | Evidence | Review outcome |
|---|---|---|
| Kahramanlar Katlı Otoparkı (İzmir) | İzmir Büyükşehir Belediyesi 2025 council agenda states 1424 Sokak No:21 and operator transfer to İZELMAN: https://izmir.bel.tr/YuklenenDosyalar/MeclisToplantiTutanak/11112025174232.pdf | Facility and street address corroborated; entrance coordinates **unverified** |
| Kültürpark Yeraltı Otoparkı (İzmir) | İzmir Büyükşehir Belediyesi 2025 decision states 9 Eylül Meydanı No:9/70 and İZELMAN operation: https://izmir.bel.tr/YuklenenDosyalar/MeclisKararOzetleri/18082025_103245_11.08.2025%20KARAR%20%C3%96ZET%C4%B0%20%C4%B0LANI.pdf | Facility and address corroborated; entrance coordinates **unverified** |
| Gıda Çarşısı Otoparkı (İzmir) | National OSM report identifies operator candidate; no precise entrance source verified in this audit | **Manual map/field verification required** |
| Smyrna Tam Otomatik (İzmir) | National OSM report identifies operator candidate; no precise entrance source verified in this audit | **Manual map/field verification required** |
| Tam Otomatik Alsancak (İzmir) | İzmir Büyükşehir Belediyesi historical list mentions Tam Otomatik Alsancak: https://www.izmir.bel.tr/YuklenenDosyalar/Yayinlar/270_15012026_095906_0_17022022_025421_ekim-2021.pdf | Facility corroborated historically; entrance coordinates **unverified** |
| Ankara Büyükşehir Belediyesi 100. Yıl Otoparkı | National OSM report identifies operator candidate; no precise entrance source verified in this audit | **Manual map/field verification required** |

**Safety gate:** Before enabling a vehicle entrance, require OSM object identity, an independently checked exact entrance point, appropriate road access, and an explicit reviewed/approved flag. An operator name, postal address, or parking centroid alone is not an entrance.

**Important:** Secondary parking directories disagree on Kahramanlar street number (No:24 versus the municipal No:21). Treat street numbers as address evidence, never as vehicle entrance coordinates.

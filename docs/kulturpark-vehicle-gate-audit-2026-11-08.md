# Kültürpark Yeraltı Otoparkı — vehicle entrance evidence audit

Reviewed: 2026-11-08. Parking OSM identity: `node/8500019535`.

## Grounded directional evidence

Izmir Metropolitan Municipality's historical construction announcement says vehicles visiting the underground parking were intended to enter and exit via **26 Ağustos Kapısı**:
https://www.izmir.bel.tr/tr/Haberler/kulturpark-yeralti-otoparkinda-geri-sayim-basladi/5275/156

A 2026 visitor guide repeats the 26 Ağustos gate vehicle entry/exit direction:
https://www.dijitalgaste.com/izmir-fuarina-nasil-gidilir-izban-metro-ve-otopark-rehberi

The municipal page describing **Kültürpark grounds** lists multiple pedestrian/public gates, which are **not interchangeable** with the parking's car entrance:
https://www.izmir.bel.tr/tr/BirimDetay/105

**Evidence status:** Directional gate **corroborated** (26 Ağustos); **exact vehicle-ramp coordinates and current road/turn restrictions not independently verified**. The historic municipal description alone does not establish present-day access or an entrance node.

## Road geometry candidates from the uploaded national-road-candidates.csv

| OSM road | Closest geometry node | Distance to parking centroid | Decision |
|---|---|---:|---|
| https://www.openstreetmap.org/way/915043829 | https://www.openstreetmap.org/node/14182587184 | 3.0 m | Candidate only |
| https://www.openstreetmap.org/way/915043830 | https://www.openstreetmap.org/node/14182587184 | 3.0 m | Candidate only |
| https://www.openstreetmap.org/way/915043826 | https://www.openstreetmap.org/node/8500019520 | 27.5 m | Candidate only |
| https://www.openstreetmap.org/way/915043828 | https://www.openstreetmap.org/node/274250215 | 27.7 m | Candidate only |

The first two ways share a road geometry node. **A shared node does not establish that it is the vehicle entrance or the correct inbound direction.** The nearby `highway=pedestrian` ways with `motor_vehicle=yes` are not proof of general public car access.

## Required before navigation activation

1. Confirm that 26 Ağustos Kapısı still provides **public inbound access** to the underground parking.
2. Identify the precise inbound ramp (not the outbound lane or a pedestrian gate) using operator evidence, current imagery, or field review.
3. Confirm its connection to the drivable routing graph and any one-way/turn/access restrictions.
4. Record a source-backed coordinate and explicit reviewer approval in `data/entrance-approvals-reviewed.csv`; publish only through the validated JSON process.

**Navigation status: unchanged. Entrance verified: NO.**

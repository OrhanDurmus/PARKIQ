"""Prioritize manual entrance review without asserting city or verification."""
import csv,sys
from collections import Counter
source,destination,summary=sys.argv[1:4]
with open(source,encoding='utf-8-sig',newline='') as f:
    rows=list(csv.DictReader(f))
def priority(row):
    op=row['Operator'].strip().casefold()
    lat,lng=float(row['Latitude']),float(row['Longitude'])
    # Operator names alone are insufficient: Denizli BELTAŞ is not Ankara BELTAŞ.
    istanbul=40.7<=lat<=41.7 and 27.5<=lng<=30.0
    ankara=39.4<=lat<=40.5 and 31.5<=lng<=33.8
    izmir=37.8<=lat<=39.3 and 26.0<=lng<=28.6
    if (istanbul and 'ispark' in op) or (ankara and any(x in op for x in ('anpark','beltaş','ankara büyükşehir'))) or (izmir and 'izelman' in op):
        return 1
    if op:return 2
    return 3
for row in rows:
    row['Review priority']=str(priority(row))
    row['Priority reason']='Municipal/operator name candidate; confirm legal entity and city' if priority(row)==1 else 'Operator named; confirm identity and entrance' if priority(row)==2 else 'Operator unknown; confirm identity and entrance'
rows.sort(key=lambda x:(priority(x),x['Parking name'].casefold(),x['OSM ID']))
with open(destination,'w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]))
    w.writeheader();w.writerows(rows)
counts=Counter(priority(r) for r in rows)
with open(summary,'w',encoding='utf-8') as f:
    f.write('# Nationwide parking entrance review priorities\n\n')
    f.write('These are parking centroids, **not verified vehicle entrances**. Priority is a review order, not verified corporate affiliation. City and operator identity must be independently confirmed.\n\n')
    f.write(f'- Total records: {len(rows)}\n')
    for p in (1,2,3):f.write(f'- Priority {p}: {counts[p]}\n')
print('Review queue:',len(rows),dict(counts))

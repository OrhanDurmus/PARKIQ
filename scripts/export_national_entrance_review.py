"""Export nationwide parking entrance verification queue; never infer verified entrances."""
import csv,json,sys
from collections import Counter
source,out=sys.argv[1:3]
with open(source,encoding='utf-8') as f: points=json.load(f)['points']
named=[p for p in points if p.get('name') and p['name']!='Otopark kaydı']
named.sort(key=lambda p:(not bool(p.get('operator')),p.get('name','').casefold(),str(p.get('osmId',''))))
with open(out,'w',encoding='utf-8-sig',newline='') as f:
    writer=csv.writer(f)
    writer.writerow(['OSM type','OSM ID','Parking name','Operator','Latitude','Longitude','OSM URL','Map URL','Entrance verified','Review status'])
    for p in named:
        lat,lng=p['lat'],p['lng']
        typ,oid=p['osmType'],p['osmId']
        writer.writerow([typ,oid,p['name'],p.get('operator',''),lat,lng,
            f'https://www.openstreetmap.org/{typ}/{oid}',
            f'https://www.openstreetmap.org/?mlat={lat}&mlon={lng}#map=18/{lat}/{lng}',
            'NO','MANUAL_REVIEW_REQUIRED'])
assert len(named)>0
print('National parking records:',len(points),'named entrance-review queue:',len(named))

"""Export explicitly approved entrance points keyed by OSM parking identity.

Usage: python scripts/export_approved_entrances.py reviewed.csv data/parking-entrances-approved.json
Never promote generated PENDING review rows to verified.
"""
import csv,json,math,sys
from pathlib import Path
from urllib.parse import urlparse
source,target=sys.argv[1:3]
with open(source,encoding='utf-8-sig',newline='') as f:
    reader=csv.DictReader(f)
    headers=reader.fieldnames
    rows=list(reader)
required={'Parking OSM identity','Parking centroid latitude','Parking centroid longitude','Entrance latitude (manual)','Entrance longitude (manual)','Entrance OSM URL (manual)','Connected vehicle road OSM URL (manual)','Road access checked (YES/NO)','Entrance versus exit checked (YES/NO)','Evidence source URL (manual)','Review decision (PENDING/APPROVED/REJECTED)','Entrance verified'}
if not headers or not required.issubset(headers):sys.exit('Missing review fields')
approved={}
for number,row in enumerate(rows,2):
    decision=row['Review decision (PENDING/APPROVED/REJECTED)'].strip().upper()
    verified=row['Entrance verified'].strip().upper()
    if decision not in ('PENDING','APPROVED','REJECTED') or verified not in ('YES','NO'):
        sys.exit(f'Invalid decision at row {number}')
    if decision!='APPROVED':
        if verified=='YES':sys.exit(f'Unapproved verified entrance at row {number}')
        continue
    if verified!='YES' or row['Road access checked (YES/NO)'].strip().upper()!='YES' or row['Entrance versus exit checked (YES/NO)'].strip().upper()!='YES':
        sys.exit(f'Incomplete approval at row {number}')
    identity=row['Parking OSM identity'].strip().split('/')
    if len(identity)!=2 or identity[0] not in ('node','way') or not identity[1].isdigit():
        sys.exit(f'Invalid parking OSM identity at row {number}')
    key='/'.join(identity)
    if key in approved:sys.exit(f'Duplicate approval: {key}')
    try:
        lat,lon=float(row['Entrance latitude (manual)']),float(row['Entrance longitude (manual)'])
        plat,plon=float(row['Parking centroid latitude']),float(row['Parking centroid longitude'])
    except ValueError:sys.exit(f'Invalid coordinates at row {number}')
    if not all(map(math.isfinite,(lat,lon,plat,plon))) or not (-90<=lat<=90 and -180<=lon<=180) or (lat==0 and lon==0):
        sys.exit(f'Invalid coordinates at row {number}')
    if math.hypot((lat-plat)*111320,(lon-plon)*111320*math.cos(math.radians(plat)))>500:
        sys.exit(f'Entrance too far at row {number}')
    urls=[row[k].strip() for k in ('Entrance OSM URL (manual)','Connected vehicle road OSM URL (manual)','Evidence source URL (manual)')]
    if any(urlparse(u).scheme!='https' or not urlparse(u).netloc for u in urls):
        sys.exit(f'Invalid evidence URL at row {number}')
    if not urls[0].startswith('https://www.openstreetmap.org/node/') or not urls[1].startswith('https://www.openstreetmap.org/way/'):
        sys.exit(f'Expected OSM entrance node and connected road way at row {number}')
    approved[key]={'entranceLat':lat,'entranceLng':lon,'entranceVerified':True,
                   'entranceOsmUrl':urls[0],'roadOsmUrl':urls[1],'evidenceUrl':urls[2]}
Path(target).parent.mkdir(parents=True,exist_ok=True)
Path(target).write_text(json.dumps({'schemaVersion':1,'entrances':approved},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Exported independently reviewed approved entrance points:',len(approved))

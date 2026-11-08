"""Validate manually reviewed vehicle entrances; never auto-approve OSM candidates."""
import csv,math,sys
path=sys.argv[1]
with open(path,encoding='utf-8-sig',newline='') as f: rows=list(csv.DictReader(f))
required={'Parking centroid latitude','Parking centroid longitude','Entrance latitude (manual)','Entrance longitude (manual)','Entrance OSM URL (manual)','Connected vehicle road OSM URL (manual)','Road access checked (YES/NO)','Entrance versus exit checked (YES/NO)','Evidence source URL (manual)','Review decision (PENDING/APPROVED/REJECTED)','Entrance verified'}
if rows and not required.issubset(rows[0]):sys.exit('Missing mandatory review columns')
approved=0
for n,r in enumerate(rows,2):
    decision=r['Review decision (PENDING/APPROVED/REJECTED)'].strip().upper()
    verified=r['Entrance verified'].strip().upper()
    if decision not in {'PENDING','APPROVED','REJECTED'} or verified not in {'YES','NO'}:
        sys.exit(f'Row {n}: invalid decision/verification')
    if decision!='APPROVED' and verified=='YES':
        sys.exit(f'Row {n}: unapproved entrance cannot be verified')
    if decision!='APPROVED':continue
    if verified!='YES':sys.exit(f'Row {n}: approved entrance requires explicit YES verification')
    if r['Road access checked (YES/NO)'].strip().upper()!='YES' or r['Entrance versus exit checked (YES/NO)'].strip().upper()!='YES':
        sys.exit(f'Row {n}: road access and entry direction must be reviewed')
    if not all(r[k].strip().startswith('https://') for k in ('Entrance OSM URL (manual)','Connected vehicle road OSM URL (manual)','Evidence source URL (manual)')):
        sys.exit(f'Row {n}: evidence URLs required')
    try:
        lat,lon=float(r['Entrance latitude (manual)']),float(r['Entrance longitude (manual)'])
        plat,plon=float(r['Parking centroid latitude']),float(r['Parking centroid longitude'])
    except ValueError:sys.exit(f'Row {n}: missing coordinates')
    if not all(map(math.isfinite,(lat,lon,plat,plon))) or not (-90<=lat<=90 and -180<=lon<=180):
        sys.exit(f'Row {n}: invalid coordinates')
    dist=math.hypot((lat-plat)*111320,(lon-plon)*111320*math.cos(math.radians(plat)))
    if dist>500:sys.exit(f'Row {n}: entrance >500m from parking centroid')
    approved+=1
print(f'Checked {len(rows)} entrance reviews; {approved} approved')

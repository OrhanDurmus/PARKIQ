import json, sys, datetime, math
import osmium

# Approximate Istanbul metropolitan bounding box; not a legal administrative boundary.
WEST,SOUTH,EAST,NORTH=27.8,40.7,30.0,41.7
records={}
entrance_candidates=[]
def detail(tags,lat,lon):
    fee=tags.get('fee','').lower()
    access=tags.get('access','')
    kind=tags.get('parking','')
    address=', '.join(x for x in [tags.get('addr:street',''),tags.get('addr:housenumber',''),tags.get('addr:suburb','')] if x)
    return {'lat':round(lat,6),'lng':round(lon,6),'name':tags.get('name','Otopark kaydı'),'fee':fee if fee in ('yes','no') else 'unknown','kind':kind if kind in ('surface','underground','multi-storey','street_side','lane','rooftop') else 'unknown','address':address,'access':access,'operator':tags.get('operator','')}

def inside(lat,lon):
    return SOUTH<=lat<=NORTH and WEST<=lon<=EAST
class Parking(osmium.SimpleHandler):
    def node(self,n):
        if not n.location.valid(): return
        if n.tags.get('amenity')=='parking_entrance':
            lat,lon=n.location.lat,n.location.lon
            if inside(lat,lon): entrance_candidates.append({'lat':round(lat,6),'lng':round(lon,6),'osmId':n.id})
            return
        if n.tags.get('amenity')!='parking': return
        lat,lon=n.location.lat,n.location.lon
        if inside(lat,lon): records['n'+str(n.id)]=detail(n.tags,lat,lon)
    def way(self,w):
        if w.tags.get('amenity')!='parking': return
        pts=[(n.location.lat,n.location.lon) for n in w.nodes if n.location.valid()]
        if not pts:return
        lat=sum(p[0] for p in pts)/len(pts);lon=sum(p[1] for p in pts)/len(pts)
        if inside(lat,lon):records['w'+str(w.id)]=detail(w.tags,lat,lon)
if len(sys.argv) not in (3,4):sys.exit('Usage: python scripts/import_parking.py turkey.osm.pbf data/parking.json [review.json]')
Parking().apply_file(sys.argv[1],locations=True)
points=list(records.values())
# OSM parking_entrance nodes are candidates, not independently verified vehicle entrances.
# Spatial grid avoids comparing every Istanbul parking record with every entrance node.
cell_size=0.001
grid={}
def cell(lat,lon):
    return (math.floor(lat/cell_size),math.floor(lon/cell_size))
for e in entrance_candidates:
    grid.setdefault(cell(e['lat'],e['lng']),[]).append(e)
for p in points:
    cy,cx=cell(p['lat'],p['lng'])
    nearby=[]
    # At Istanbul latitude, 0.001 longitude degrees is ~84 m. An 80 m
    # radius can cross two grid cells near cell boundaries; scan 5x5.
    for dy in range(-2,3):
        for dx in range(-2,3):
            for e in grid.get((cy+dy,cx+dx),()):
                dlat=(e['lat']-p['lat'])*111320
                dlng=(e['lng']-p['lng'])*111320*math.cos(p['lat']*math.pi/180)
                if dlat*dlat+dlng*dlng<=80*80:
                    nearby.append(e)
    if len(nearby)==1:
        p['entranceCandidate']={'lat':nearby[0]['lat'],'lng':nearby[0]['lng'],'source':'OpenStreetMap parking_entrance','osmId':nearby[0]['osmId']}
        p['entranceVerified']=False
if not points:sys.exit('No parking records found; refusing to overwrite existing data')
with open(sys.argv[2],'w',encoding='utf8') as out:
    json.dump({'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'OpenStreetMap/Geofabrik','points':points},out,ensure_ascii=False,separators=(',',':'))
if len(sys.argv)==4:
    review=[]
    grouped={}
    for p in points:
        if 'entranceCandidate' not in p:
            continue
        e=p['entranceCandidate']
        dlat=(e['lat']-p['lat'])*111320
        dlng=(e['lng']-p['lng'])*111320*math.cos(p['lat']*math.pi/180)
        item={'parkingName':p['name'],'parkingLat':p['lat'],'parkingLng':p['lng'],
              'entranceCandidate':e,'entranceVerified':False,
              'distanceMeters':round(math.hypot(dlat,dlng),1),
              'nameMissing':p['name']=='Otopark kaydı'}
        review.append(item)
        grouped.setdefault(str(e['osmId']),[]).append(item)
    unique=[]
    for osm_id,matches in sorted(grouped.items()):
        e=matches[0]['entranceCandidate']
        names=sorted({m['parkingName'] for m in matches if not m['nameMissing']})
        unique.append({'osmId':e['osmId'],'lat':e['lat'],'lng':e['lng'],
                       'matchedParkingCount':len(matches),'namedParkingMatches':names,
                       'osmUrl':'https://www.openstreetmap.org/node/'+str(e['osmId']),
                       'mapUrl':'https://www.openstreetmap.org/?mlat='+str(e['lat'])+'&mlon='+str(e['lng'])+'#map=19/'+str(e['lat'])+'/'+str(e['lng']),
                       'needsDisambiguation':len(matches)>1,
                       'reviewPriority':'high' if len(matches)==1 and len(names)==1 else 'manual',
                       'entranceVerified':False})
    report={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'status':'REVIEW_REQUIRED','candidateCount':len(review),
            'uniqueEntranceCount':len(unique),
            'duplicateMatchCount':len(review)-len(unique),
            'unnamedParkingMatchCount':sum(r['nameMissing'] for r in review),
            'boundaryNote':'Approximate bounding box only, not Istanbul administrative limits.',
            'candidates':review,'uniqueEntrances':unique}
    with open(sys.argv[3],'w',encoding='utf8') as out:
        json.dump(report,out,ensure_ascii=False,indent=2)

print('Extracted',len(points),'parking records; found',len(entrance_candidates),'OSM entrance nodes; attached',sum('entranceCandidate' in p for p in points),'unverified candidates')

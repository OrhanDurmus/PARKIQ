import json, sys, datetime
import osmium

# Approximate Istanbul metropolitan bounding box; not a legal administrative boundary.
WEST,SOUTH,EAST,NORTH=27.8,40.7,30.0,41.7
records={}
def inside(lat,lon):
    return SOUTH<=lat<=NORTH and WEST<=lon<=EAST
class Parking(osmium.SimpleHandler):
    def node(self,n):
        if n.tags.get('amenity')!='parking' or not n.location.valid(): return
        lat,lon=n.location.lat,n.location.lon
        if inside(lat,lon): records['n'+str(n.id)]={'lat':round(lat,6),'lng':round(lon,6),'name':n.tags.get('name','Otopark kaydı')}
    def way(self,w):
        if w.tags.get('amenity')!='parking': return
        pts=[(n.location.lat,n.location.lon) for n in w.nodes if n.location.valid()]
        if not pts:return
        lat=sum(p[0] for p in pts)/len(pts);lon=sum(p[1] for p in pts)/len(pts)
        if inside(lat,lon):records['w'+str(w.id)]={'lat':round(lat,6),'lng':round(lon,6),'name':w.tags.get('name','Otopark kaydı')}
if len(sys.argv)!=3:sys.exit('Usage: python scripts/import_parking.py turkey.osm.pbf data/parking.json')
Parking().apply_file(sys.argv[1],locations=True)
points=list(records.values())
if not points:sys.exit('No parking records found; refusing to overwrite existing data')
with open(sys.argv[2],'w',encoding='utf8') as out:
    json.dump({'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'OpenStreetMap/Geofabrik','points':points},out,ensure_ascii=False,separators=(',',':'))
print('Extracted',len(points),'parking records')

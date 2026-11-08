"""Extract all Turkish OSM parking features to a local static file, without live Overpass."""
import datetime,json,sys,osmium
points={}
def record(tags,lat,lng,typ,oid):
    if not (35.5<=lat<=42.5 and 25.5<=lng<=45):return
    # Existing Istanbul dataset remains the authoritative source in that region.
    if 40<=lat<=42.5 and 26<=lng<=31:return
    fee=tags.get('fee','').lower()
    kind=tags.get('parking','')
    address=', '.join(filter(None,[tags.get('addr:street',''),tags.get('addr:housenumber','')]))
    points[typ+str(oid)]={'lat':round(lat,6),'lng':round(lng,6),'name':tags.get('name','Otopark kaydı')[:160],
       'fee':fee if fee in ('yes','no') else 'unknown',
       'kind':kind if kind in ('surface','underground','multi-storey','street_side','lane','rooftop') else 'unknown',
       'address':address[:160],'operator':tags.get('operator','')[:120],
       'osmType':typ,'osmId':str(oid),'source':'OpenStreetMap/Geofabrik'}
class Handler(osmium.SimpleHandler):
    def node(self,n):
        if n.tags.get('amenity')=='parking' and n.location.valid():
            record(n.tags,n.location.lat,n.location.lon,'node',n.id)
    def way(self,w):
        if w.tags.get('amenity')!='parking':return
        coords=[(n.location.lat,n.location.lon) for n in w.nodes if n.location.valid()]
        if coords:
            record(w.tags,sum(p[0] for p in coords)/len(coords),sum(p[1] for p in coords)/len(coords),'way',w.id)
if len(sys.argv)!=3:sys.exit('Usage: python scripts/import_national_parking.py turkey.osm.pbf data/parking-turkiye.json')
Handler().apply_file(sys.argv[1],locations=True)
if len(points)<100:sys.exit('National extract suspiciously small; refusing overwrite')
with open(sys.argv[2],'w',encoding='utf-8') as f:
    json.dump({'source':'OpenStreetMap/Geofabrik (Türkiye)','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'points':list(points.values())},f,ensure_ascii=False,separators=(',',':'))
print('National parking records outside Istanbul:',len(points))

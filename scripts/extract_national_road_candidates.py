"""Find nearby drivable OSM road *review candidates* for priority-one parking.

Road geometry nodes are NOT vehicle entrances. Do not publish as navigation targets.
"""
import csv,math,sys,osmium
pbf,priority_csv,out=sys.argv[1:4]
with open(priority_csv,encoding='utf-8-sig',newline='') as f:
    parks=[r for r in csv.DictReader(f) if r['Review priority']=='1']
if not parks:sys.exit('No priority-one parking records')
for p in parks:
    p['_lat']=float(p['Latitude']);p['_lng']=float(p['Longitude'])
best={p['OSM type']+'/'+p['OSM ID']:[] for p in parks}
roads={'residential','service','unclassified','tertiary','secondary','primary','living_street','pedestrian','track'}
class Handler(osmium.SimpleHandler):
    def way(self,w):
        highway=w.tags.get('highway','')
        if highway not in roads:return
        access=w.tags.get('access','')
        motor=w.tags.get('motor_vehicle','')
        vehicle=w.tags.get('vehicle','')
        if any(v in ('no','private') for v in (access,motor,vehicle)):return
        for p in parks:
            closest=None
            for n in w.nodes:
                if not n.location.valid():continue
                lat,lng=n.location.lat,n.location.lon
                d=math.hypot((lat-p['_lat'])*111195,(lng-p['_lng'])*111195*math.cos(math.radians(p['_lat'])))
                if d<=120 and (closest is None or d<closest[0]):closest=(d,lat,lng,n.ref)
            if closest is None:continue
            d,lat,lng,node_id=closest
            key=p['OSM type']+'/'+p['OSM ID']
            best[key].append({'Parking name':p['Parking name'],'Parking OSM identity':key,
                'Road OSM URL':'https://www.openstreetmap.org/way/'+str(w.id),
                'Nearest road geometry node URL':'https://www.openstreetmap.org/node/'+str(node_id),
                'Road node latitude':round(lat,7),'Road node longitude':round(lng,7),
                'Distance from parking centroid (m)':round(d,1),
                'Highway type':highway,'Road name':w.tags.get('name',''),
                'Access':access,'Motor vehicle':motor,'Vehicle':vehicle,
                'Road connected to parking (manual)': 'NO',
                'Actual vehicle entrance identified (manual)':'NO','Entrance verified':'NO'})
Handler().apply_file(pbf,locations=True)
fields=['Parking name','Parking OSM identity','Road OSM URL','Nearest road geometry node URL','Road node latitude','Road node longitude','Distance from parking centroid (m)','Highway type','Road name','Access','Motor vehicle','Vehicle','Road connected to parking (manual)','Actual vehicle entrance identified (manual)','Entrance verified']
rows=[]
for p in parks:
    key=p['OSM type']+'/'+p['OSM ID']
    rows+=sorted(best[key],key=lambda r:r['Distance from parking centroid (m)'])[:8]
with open(out,'w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
print('Road review candidates:',len(rows),'across',sum(bool(x) for x in best.values()),'parking sites')

"""Extract OSM entrance *candidates* near priority-one nationwide parking centroids.

These points are not verified vehicle entrances. Review road connectivity and entry
direction independently before approving any candidate.
"""
import csv,math,sys
import osmium

pbf,priority_csv,output_csv=sys.argv[1:4]
with open(priority_csv,encoding='utf-8-sig',newline='') as f:
    parks=[r for r in csv.DictReader(f) if r['Review priority']=='1']
if not parks:sys.exit('No priority-one parking rows')
for p in parks:
    p['_lat']=float(p['Latitude']);p['_lng']=float(p['Longitude'])
candidates=[]
class EntranceHandler(osmium.SimpleHandler):
    def node(self,node):
        if not node.location.valid():return
        tags=node.tags
        entrance=tags.get('entrance','')
        barrier=tags.get('barrier','')
        if entrance not in ('yes','main','service','garage','vehicle','entrance') and barrier not in ('gate','lift_gate','swing_gate'):
            return
        lat,lng=node.location.lat,node.location.lon
        for p in parks:
            dy=(lat-p['_lat'])*111195
            dx=(lng-p['_lng'])*111195*math.cos(math.radians(p['_lat']))
            distance=math.hypot(dx,dy)
            if distance>80:continue
            candidates.append({
                'Parking name':p['Parking name'],
                'Parking OSM identity':p['OSM type']+'/'+p['OSM ID'],
                'Parking centroid latitude':p['Latitude'],
                'Parking centroid longitude':p['Longitude'],
                'Candidate entrance OSM URL':'https://www.openstreetmap.org/node/'+str(node.id),
                'Candidate latitude':round(lat,7),
                'Candidate longitude':round(lng,7),
                'Distance to centroid (m)':round(distance,1),
                'Entrance tag':entrance,
                'Barrier tag':barrier,
                'Motor vehicle access tag':tags.get('motor_vehicle',''),
                'Access tag':tags.get('access',''),
                'Road connection checked':'NO',
                'Vehicle entrance direction checked':'NO',
                'Entrance verified':'NO'
            })
EntranceHandler().apply_file(pbf,locations=True)
candidates.sort(key=lambda r:(r['Parking name'].casefold(),r['Distance to centroid (m)'],r['Candidate entrance OSM URL']))
fields=['Parking name','Parking OSM identity','Parking centroid latitude','Parking centroid longitude','Candidate entrance OSM URL','Candidate latitude','Candidate longitude','Distance to centroid (m)','Entrance tag','Barrier tag','Motor vehicle access tag','Access tag','Road connection checked','Vehicle entrance direction checked','Entrance verified']
with open(output_csv,'w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(candidates)
print(f'Priority-one parking: {len(parks)}; unverified OSM entrance candidates within 80m: {len(candidates)}')

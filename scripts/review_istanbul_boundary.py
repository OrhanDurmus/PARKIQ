#!/usr/bin/env python3
"""Review-only boundary classifier; does not alter live parking data."""
import csv,json,sys
from pathlib import Path
def ring_contains(x,y,ring):
    inside=False
    j=len(ring)-1
    for i in range(len(ring)):
        xi,yi=ring[i][:2];xj,yj=ring[j][:2]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:inside=not inside
        j=i
    return inside
def contains(x,y,geometry):
    polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates'] if geometry['type']=='MultiPolygon' else []
    return any(ring_contains(x,y,p[0]) and not any(ring_contains(x,y,h) for h in p[1:]) for p in polygons if p)
def main(parking_file,boundary_file,csv_file):
    points=json.loads(Path(parking_file).read_text(encoding='utf8'))['points']
    geo=json.loads(Path(boundary_file).read_text(encoding='utf8'))
    features=geo['features'] if geo['type']=='FeatureCollection' else [geo]
    features=[f for f in features if f.get('geometry') and f['geometry']['type'] in ('Polygon','MultiPolygon')]
    if len(features)<10:raise SystemExit('Insufficient district polygons')
    rows=[]
    for p in points:
        within=any(contains(p['lng'],p['lat'],f['geometry']) for f in features)
        rows.append([p['name'],p['lat'],p['lng'],'inside' if within else 'outside_or_boundary','NO' if within else 'YES'])
    if not any(r[3]=='inside' for r in rows):raise SystemExit('Boundary check failed: no inside points')
    with open(csv_file,'w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['Parking name','Latitude','Longitude','Boundary result','Review required']);w.writerows(rows)
    print('Geographic review:',sum(r[4]=='YES' for r in rows),'flagged /',len(rows))
if __name__=='__main__':main(*sys.argv[1:])

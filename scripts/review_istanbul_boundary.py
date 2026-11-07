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
def boundary_distance_m(x,y,features):
    """Approximate minimum distance to any district polygon edge (local equirectangular meters)."""
    import math
    scale_x=111320*math.cos(math.radians(y))
    scale_y=111320
    best=float('inf')
    for feature in features:
        geom=feature['geometry']
        polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
        for polygon in polys:
            for ring in polygon:
                for a,b in zip(ring,ring[1:]):
                    ax=(a[0]-x)*scale_x;ay=(a[1]-y)*scale_y
                    bx=(b[0]-x)*scale_x;by=(b[1]-y)*scale_y
                    dx=bx-ax;dy=by-ay
                    t=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
                    best=min(best,math.hypot(ax+t*dx,ay+t*dy))
    return round(best)
def main(parking_file,boundary_file,csv_file):
    points=json.loads(Path(parking_file).read_text(encoding='utf8'))['points']
    geo=json.loads(Path(boundary_file).read_text(encoding='utf8'))
    features=geo['features'] if geo['type']=='FeatureCollection' else [geo]
    features=[f for f in features if f.get('geometry') and f['geometry']['type'] in ('Polygon','MultiPolygon')]
    if len(features)<10:raise SystemExit('Insufficient district polygons')
    # Fail closed if the remote source has the wrong city or swapped coordinates.
    known_inside=[(28.9784,41.0082),(29.2618,40.8763)]  # Fatih, Pendik
    known_outside=[(29.4307,40.8028),(27.805,41.159)] # Gebze, Corlu
    if not all(any(contains(x,y,f['geometry']) for f in features) for x,y in known_inside):
        raise SystemExit('Boundary source fails Istanbul landmark checks')
    if any(any(contains(x,y,f['geometry']) for f in features) for x,y in known_outside):
        raise SystemExit('Boundary source incorrectly includes non-Istanbul landmarks')
    rows=[]
    for p in points:
        within=any(contains(p['lng'],p['lat'],f['geometry']) for f in features)
        distance=boundary_distance_m(p['lng'],p['lat'],features) if not within else 0
        priority='inside' if within else ('near_boundary' if distance<=250 else 'outside_candidate')
        rows.append([p['name'],p['lat'],p['lng'],'inside' if within else 'outside_or_boundary','NO' if within else 'YES',distance,priority])
    if not any(r[3]=='inside' for r in rows):raise SystemExit('Boundary check failed: no inside points')
    # Put actionable outside candidates first, then boundary-adjacent cases.
    # Keep inside records last as reference, never auto-exclude any record.
    order={'outside_candidate':0,'near_boundary':1,'inside':2}
    rows.sort(key=lambda r:(order[r[6]],-r[5] if r[6]=='outside_candidate' else r[5],str(r[0])))
    with open(csv_file,'w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['Parking name','Latitude','Longitude','Boundary result','Review required','Approx boundary distance (m)','Review category']);w.writerows(rows)
    # Separate review queue: no need to scroll past thousands of inside records.
    flagged_path=Path(csv_file).with_name('istanbul-boundary-flagged.csv')
    with flagged_path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f)
        w.writerow(['Parking name','Latitude','Longitude','Boundary result','Review required','Approx boundary distance (m)','Review category'])
        w.writerows(r for r in rows if r[4]=='YES')
    # Region-level counts for reviewing suspicious clusters without changing live data.
    from collections import Counter
    regions=Counter()
    for r in rows:
        if r[4]=='YES':
            # 0.1-degree grid: approximate region only, not a legal district boundary.
            cell=(round(float(r[1]),1),round(float(r[2]),1),r[6])
            regions[cell]+=1
    region_path=Path(csv_file).with_name('istanbul-boundary-region-summary.csv')
    with region_path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f)
        w.writerow(['Approx latitude grid','Approx longitude grid','Review category','Parking count'])
        for (lat,lon,category),count in sorted(regions.items(),key=lambda item:-item[1]):
            w.writerow([lat,lon,category,count])
    print('Geographic review:',sum(r[4]=='YES' for r in rows),'flagged /',len(rows))
    print('Near boundary:',sum(r[6]=='near_boundary' for r in rows),'Outside candidates:',sum(r[6]=='outside_candidate' for r in rows))
if __name__=='__main__':main(*sys.argv[1:])

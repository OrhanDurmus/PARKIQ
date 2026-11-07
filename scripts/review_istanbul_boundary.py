#!/usr/bin/env python3
"""Review-only boundary classifier; does not alter live parking data."""
import csv,json,sys
from pathlib import Path
def on_segment(x,y,a,b,epsilon=1e-10):
    """Boundary points count as inside, avoiding false exclusions at polygon edges."""
    ax,ay=a[:2]; bx,by=b[:2]
    cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
    if abs(cross)>epsilon*max(1,abs(bx-ax),abs(by-ay)):
        return False
    return min(ax,bx)-epsilon<=x<=max(ax,bx)+epsilon and min(ay,by)-epsilon<=y<=max(ay,by)+epsilon

def ring_contains(x,y,ring):
    inside=False
    j=len(ring)-1
    for i in range(len(ring)):
        xi,yi=ring[i][:2];xj,yj=ring[j][:2]
        if on_segment(x,y,ring[j],ring[i]):
            return True
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:
            inside=not inside
        j=i
    return inside

def contains(x,y,geometry):
    polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates'] if geometry['type']=='MultiPolygon' else []
    for polygon in polygons:
        if not polygon or not ring_contains(x,y,polygon[0]):
            continue
        # A point on a hole's edge is still a polygon boundary point.
        if any(any(on_segment(x,y,a,b) for a,b in zip(hole,hole[1:])) for hole in polygon[1:]):
            return True
        if not any(ring_contains(x,y,hole) for hole in polygon[1:]):
            return True
    return False
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
    # Coarse geographic groups make review manageable without assigning
    # unverified municipality or district names to coordinates.
    from collections import defaultdict
    groups=defaultdict(list)
    for r in rows:
        if r[4]=='YES':
            cell=(int(float(r[2])*10)/10,int(float(r[1])*10)/10,r[6])
            groups[cell].append(r)
    regional_path=Path(csv_file).with_name('istanbul-boundary-regions.csv')
    with regional_path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f)
        w.writerow(['Longitude cell (deg)','Latitude cell (deg)','Review category',
                    'Parking count','Minimum boundary distance (m)',
                    'Maximum boundary distance (m)','Sample parking name'])
        for (lon,lat,category),items in sorted(groups.items(),key=lambda x:(-len(x[1]),x[0])):
            distances=[r[5] for r in items]
            w.writerow([lon,lat,category,len(items),min(distances),max(distances),items[0][0]])
    # Auditable distance bands; all counts are candidates for review, not confirmed exclusions.
    bands=[('0-250 m',0,250),('251 m-1 km',251,1000),
           ('1-5 km',1001,5000),('5-10 km',5001,10000),
           ('10-20 km',10001,20000),('over 20 km',20001,float('inf'))]
    band_path=Path(csv_file).with_name('istanbul-boundary-distance-bands.csv')
    with band_path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f)
        w.writerow(['Distance band','Review candidates'])
        for name,minimum,maximum in bands:
            w.writerow([name,sum(1 for r in rows if r[4]=='YES' and minimum<=r[5]<=maximum)])
    print('Geographic review:',sum(r[4]=='YES' for r in rows),'flagged /',len(rows))
    print('Near boundary:',sum(r[6]=='near_boundary' for r in rows),'Outside candidates:',sum(r[6]=='outside_candidate' for r in rows))
if __name__=='__main__':main(*sys.argv[1:])

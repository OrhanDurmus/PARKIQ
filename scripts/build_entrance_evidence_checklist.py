"""Create a human-reviewable vehicle entrance evidence checklist from priority-one lots.

This never auto-verifies an entrance. Coordinates in the input are parking centroids.
"""
import csv,sys
source,target=sys.argv[1:3]
with open(source,encoding='utf-8-sig',newline='') as f:
    records=list(csv.DictReader(f))
required={'OSM type','OSM ID','Parking name','Latitude','Longitude','OSM URL','Review priority'}
assert records and required.issubset(records[0]),'Missing priority review columns'
rows=[]
for r in records:
    if r['Review priority']!='1':continue
    rows.append({
        'Parking name':r['Parking name'],
        'Parking OSM URL':r['OSM URL'],
        'Parking OSM identity':r['OSM type']+'/'+r['OSM ID'],
        'Parking centroid latitude':r['Latitude'],
        'Parking centroid longitude':r['Longitude'],
        'Entrance OSM URL (manual)': '',
        'Entrance latitude (manual)': '',
        'Entrance longitude (manual)': '',
        'Connected vehicle road OSM URL (manual)': '',
        'Road access checked (YES/NO)': 'NO',
        'Entrance versus exit checked (YES/NO)': 'NO',
        'Evidence source URL (manual)': '',
        'Reviewer notes': '',
        'Review decision (PENDING/APPROVED/REJECTED)': 'PENDING',
        'Entrance verified': 'NO',
    })
assert rows,'No priority-one records'
with open(target,'w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=rows[0].keys())
    writer.writeheader();writer.writerows(rows)
print('Manual vehicle entrance review checklists:',len(rows))

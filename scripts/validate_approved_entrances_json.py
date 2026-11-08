"""Validate published, independently approved entrance JSON without trusting flags alone."""
import json,math,sys
from urllib.parse import urlparse
from pathlib import Path
data=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
assert data.get('schemaVersion')==1 and isinstance(data.get('entrances'),dict)
for key,e in data['entrances'].items():
    kind,sep,oid=key.partition('/')
    assert sep and kind in ('node','way') and oid.isdigit(),f'Invalid OSM identity: {key}'
    assert isinstance(e,dict) and e.get('entranceVerified') is True,f'Unverified entry: {key}'
    lat,lng=e.get('entranceLat'),e.get('entranceLng')
    assert type(lat) in (float,int) and type(lng) in (float,int) and math.isfinite(lat) and math.isfinite(lng)
    assert -90<=lat<=90 and -180<=lng<=180 and (lat,lng)!=(0,0)
    for field,segment in (('entranceOsmUrl','/node/'),('roadOsmUrl','/way/')):
        u=urlparse(e.get(field,''))
        assert u.scheme=='https' and u.hostname=='www.openstreetmap.org' and u.path.startswith(segment),f'Invalid {field}: {key}'
    u=urlparse(e.get('evidenceUrl',''))
    assert u.scheme=='https' and u.hostname,f'Missing evidence URL: {key}'
print('Published approved vehicle entrances:',len(data['entrances']))

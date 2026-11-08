#!/usr/bin/env python3
"""Import official IZELMAN XLSX with exact parking names and explicit source date."""
import json,sys,urllib.request,re
from datetime import datetime,timezone
from io import BytesIO
from openpyxl import load_workbook
URL='https://acikveri.bizizmir.com/dataset/8863674c-c082-4f55-ab1d-dc75219aca4f/resource/b45d2e9f-f258-476e-a12d-d0ff62471ee0/download/izelman-otopark-ucretleri.xlsx'
with urllib.request.urlopen(urllib.request.Request(URL,headers={'User-Agent':'ROTAPARK-Importer/1.0'}),timeout=60) as response:
    payload=response.read()
sheet=load_workbook(BytesIO(payload),read_only=True,data_only=True).active
rows=iter(sheet.values)
headers=[str(x or '').strip() for x in next(rows)]
name_index=next((i for i,h in enumerate(headers) if 'otopark' in h.casefold() and ('fiyat' in h.casefold() or 'adı' in h.casefold())),None)
assert name_index is not None,headers
periods=[(i,h) for i,h in enumerate(headers) if re.search(r'\\d+\\s*[-–]\\s*\\d+\\s*saat|abone',h,re.I)]
assert periods,'No recognizable price columns'
records=[]
for row in rows:
    name=str(row[name_index] or '').strip()
    if not name or name.lower().startswith('toplam'):continue
    prices={key:row[i] for i,key in periods if i<len(row) and isinstance(row[i],(int,float)) and not isinstance(row[i],bool) and 0<row[i]<1000000}
    if prices:records.append({'name':name,'prices':prices})
assert len(records)>=5,'Unexpectedly small tariff sheet'
assert len({x['name'].casefold() for x in records})==len(records),'Duplicate names need review'
with open(sys.argv[1],'w',encoding='utf-8') as file:
    json.dump({'source':URL,'sourceUpdatedAt':'2026-02-16','importedAt':datetime.now(timezone.utc).isoformat(),'rows':records},file,ensure_ascii=False,separators=(',',':'))
print('Imported IZELMAN parking tariffs:',len(records))

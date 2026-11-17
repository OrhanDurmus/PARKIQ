"""Audit all 81 provincial centers in nationwide parking dataset. Run during Geofabrik refresh."""
import csv,json,math,sys,unicodedata,osmium
PROVINCES="""Adana|Adıyaman|Afyonkarahisar|Ağrı|Amasya|Ankara|Antalya|Artvin|Aydın|Balıkesir|Bilecik|Bingöl|Bitlis|Bolu|Burdur|Bursa|Çanakkale|Çankırı|Çorum|Denizli|Diyarbakır|Edirne|Elazığ|Erzincan|Erzurum|Eskişehir|Gaziantep|Giresun|Gümüşhane|Hakkâri|Hatay|Isparta|Mersin|İstanbul|İzmir|Kars|Kastamonu|Kayseri|Kırklareli|Kırşehir|Kocaeli|Konya|Kütahya|Malatya|Manisa|Kahramanmaraş|Mardin|Muğla|Muş|Nevşehir|Niğde|Ordu|Rize|Sakarya|Samsun|Siirt|Sinop|Sivas|Tekirdağ|Tokat|Trabzon|Tunceli|Şanlıurfa|Uşak|Van|Yozgat|Zonguldak|Aksaray|Bayburt|Karaman|Kırıkkale|Batman|Şırnak|Bartın|Ardahan|Iğdır|Yalova|Karabük|Kilis|Osmaniye|Düzce""".split('|')
assert len(PROVINCES)==81 and len(set(PROVINCES))==81
METROPOLITAN=set('Adana|Ankara|Antalya|Aydın|Balıkesir|Bursa|Denizli|Diyarbakır|Erzurum|Eskişehir|Gaziantep|Hatay|İstanbul|İzmir|Kahramanmaraş|Kayseri|Kocaeli|Konya|Malatya|Manisa|Mardin|Mersin|Muğla|Ordu|Sakarya|Samsun|Şanlıurfa|Tekirdağ|Trabzon|Van'.split('|'))
assert len(METROPOLITAN)==30 and METROPOLITAN<=set(PROVINCES)
ALIASES={'Kocaeli':['İzmit'],'Sakarya':['Adapazarı'],'Hatay':['Antakya'],'Mersin':['İçel'],'Kahramanmaraş':['Maraş'],'Afyonkarahisar':['Afyon']}
def norm(v):
 return ''.join(c for c in unicodedata.normalize('NFKD',v.casefold().replace('ı','i')) if not unicodedata.combining(c))
names={norm(v):p for p in PROVINCES for v in [p,*ALIASES.get(p,[])]}
class Centers(osmium.SimpleHandler):
 def __init__(self):super().__init__();self.found={}
 def node(self,n):
  if n.tags.get('place') not in ('city','town') or not n.location.valid():return
  key=norm(n.tags.get('name',''))
  if key not in names:return
  province=names[key];score=(2 if n.tags.get('place')=='city' else 1)+(1 if norm(province)==key else 0)
  if province not in self.found or score>self.found[province][0]:self.found[province]=(score,n.location.lat,n.location.lon)
def distance(a,b,c,d):
 return math.hypot((a-c)*111195,(b-d)*111195*math.cos(math.radians(c)))
centers=Centers();centers.apply_file(sys.argv[1])
with open(sys.argv[2],encoding='utf-8') as f:points=json.load(f)['points']
rows=[]
for province in PROVINCES:
 center=centers.found.get(province)
 if not center:rows.append((province,'','','','','CENTER_NOT_FOUND'));continue
 _,lat,lng=center
 if province=='İstanbul':rows.append((province,round(lat,6),round(lng,6),'','','SEPARATE_ISTANBUL_DATASET'));continue
 near=[p for p in points if distance(lat,lng,p['lat'],p['lng'])<=10000 and str(p.get('access','')).lower() not in ('private','no','customers','residents','employees','staff','permit','delivery','destination','agricultural','forestry','military')]
 rows.append((province,round(lat,6),round(lng,6),len(near),sum(p.get('name') not in (None,'','Otopark kaydı') for p in near),'NO_PARKING_IN_OSM_EXTRACT' if not near else 'OK'))
with open(sys.argv[3],'w',newline='',encoding='utf-8-sig') as f:
 w=csv.writer(f);w.writerow(['il','merkez_lat','merkez_lng','10km_otopark','isimli_otopark','durum']);w.writerows(rows)
missing=[r[0] for r in rows if r[-1]=='NO_PARKING_IN_OSM_EXTRACT']
unknown=[r[0] for r in rows if r[-1]=='CENTER_NOT_FOUND']
with open(sys.argv[4],'w',encoding='utf-8') as f:
 f.write('# ROTAPARK 81 il otopark kapsam denetimi\n\n')
 f.write('Kaynak: Geofabrik OSM PBF ve aynı çalışmada oluşturulan Türkiye otopark dosyası; merkezden 10 km.\n\n')
 f.write(f'Denetlenen: {len(rows)}; OSM otopark kaydı olmayan: {len(missing)}; merkez bulunamayan: {len(unknown)}. İstanbul ayrı veri kaynağında.\n\n')
 metro=[r for r in rows if r[0] in METROPOLITAN]
 f.write('## Öncelikli 30 büyükşehir denetimi\\n\\n')
 f.write('| Büyükşehir | 10 km kayıt | İsimli kayıt | Durum |\\n|---|---:|---:|---|\\n')
 for province,lat,lng,count,named,status in sorted(metro,key=lambda r:(r[-1]=='OK',r[3] if isinstance(r[3],int) else -1,r[0])):
  f.write(f'| {province} | {count if count!="" else "—"} | {named if named!="" else "—"} | {status} |\\n')
 f.write('\\n**Not:** İstanbul bu Türkiye dosyasında ayrı tutuluyor; büyükşehir raporunda İstanbul verisinin ayrıca kontrol edilmesi gerekir.\\n\\n')
 f.write('## OSM verisi eksik iller\n'+(', '.join(missing) if missing else 'Yok')+'\n\n')
 f.write('## Şehir merkezi bulunamayan iller\n'+(', '.join(unknown) if unknown else 'Yok')+'\n\n')
 f.write('Sıfır OSM kaydı fiziksel otopark bulunmadığı anlamına gelmez.\n')
print('81-province audit:',len(missing),'zero OSM coverage;',len(unknown),'centers unresolved')

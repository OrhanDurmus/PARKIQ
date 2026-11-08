"""Regression: an empty approval CSV still needs the required review schema."""
import csv,subprocess,sys,tempfile,json
from pathlib import Path
exporter=Path(__file__).resolve().parents[1]/'scripts/export_approved_entrances.py'
with tempfile.TemporaryDirectory() as d:
    base=Path(d)
    malformed=base/'malformed.csv'
    malformed.write_text('Parking OSM identity\n',encoding='utf-8')
    output=base/'out.json'
    bad=subprocess.run([sys.executable,str(exporter),str(malformed),str(output)],capture_output=True,text=True)
    assert bad.returncode!=0 and 'Missing review fields' in bad.stderr+bad.stdout
    assert not output.exists()
    approved=Path(__file__).resolve().parents[1]/'data/entrance-approvals-reviewed.csv'
    good=subprocess.run([sys.executable,str(exporter),str(approved),str(output)],capture_output=True,text=True)
    assert good.returncode==0,good.stderr
    result=json.loads(output.read_text(encoding='utf-8'))
    assert result['schemaVersion']==1
    assert result['entrances']=={}
    # Never promote a row marked verified without explicit approval.
    with approved.open(encoding='utf-8-sig',newline='') as src:
        headers=next(csv.reader(src))
    sample=dict.fromkeys(headers,'')
    sample.update({'Parking name':'Test parking','Parking OSM identity':'node/123',
        'Parking centroid latitude':'38.43','Parking centroid longitude':'27.15',
        'Review decision (PENDING/APPROVED/REJECTED)':'PENDING','Entrance verified':'YES'})
    unsafe=base/'unapproved.csv'
    with unsafe.open('w',encoding='utf-8',newline='') as out:
        writer=csv.DictWriter(out,fieldnames=headers);writer.writeheader();writer.writerow(sample)
    result=subprocess.run([sys.executable,str(exporter),str(unsafe),str(base/'unsafe.json')],capture_output=True,text=True)
    assert result.returncode!=0 and 'Unapproved verified entrance' in result.stdout+result.stderr
    assert not (base/'unsafe.json').exists()
    # Approved status without independent road and direction review must also fail.
    sample['Review decision (PENDING/APPROVED/REJECTED)']='APPROVED'
    with unsafe.open('w',encoding='utf-8',newline='') as out:
        writer=csv.DictWriter(out,fieldnames=headers);writer.writeheader();writer.writerow(sample)
    result=subprocess.run([sys.executable,str(exporter),str(unsafe),str(base/'unsafe.json')],capture_output=True,text=True)
    assert result.returncode!=0 and 'Incomplete approval' in result.stdout+result.stderr
    assert not (base/'unsafe.json').exists()
print('Approval CSV schema regression: OK')

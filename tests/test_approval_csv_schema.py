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
print('Approval CSV schema regression: OK')

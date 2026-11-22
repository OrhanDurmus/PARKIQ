// Recover UTF-8 text accidentally decoded as Windows-1252 by iOS Shortcuts.
const cp1252={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
export const repairName=name=>{
  if(typeof name!=='string')return name;
  let current=name;
  for(let pass=0;pass<3&&/[ÃÄÅÂ]/.test(current);pass++){
    const bytes=[];let possible=true;
    for(const ch of current){const code=ch.codePointAt(0);const byte=code<=255?code:cp1252[code];if(byte===undefined){possible=false;break;}bytes.push(byte);}
    if(!possible)break;
    try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));if(decoded===current||decoded.includes('\uFFFD'))break;current=decoded;}catch{break;}
  }
  return current;
};

export const SNAPSHOT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function measurementTime(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.test(raw)) return null;
  const iso = raw.replace(' ', 'T') + (/(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? '' : '+03:00');
  const stamp = Date.parse(iso);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}

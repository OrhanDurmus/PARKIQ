export async function onRequestPost({request,env}) {
  try {
    if(!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
      return Response.json({error:'Cloudflare ortam değişkenleri eksik: '+[!env.AZURE_SPEECH_KEY?'AZURE_SPEECH_KEY':null,!env.AZURE_SPEECH_REGION?'AZURE_SPEECH_REGION':null].filter(Boolean).join(', ')},{status:503});
    }
    let body;
    try {body=await request.json()} catch {return Response.json({error:'Geçersiz istek gövdesi'},{status:400})}
    const phrase=String(body.text||'').slice(0,200);
    if(!phrase||/[<>]/.test(phrase))return Response.json({error:'Geçersiz metin'},{status:400});
    const region=String(env.AZURE_SPEECH_REGION).trim().toLowerCase();
    if(!/^[a-z0-9-]{2,30}$/.test(region))return Response.json({error:'Azure bölge kodu geçersiz. Örnek: northeurope'},{status:503});
    const voice=body.voice==='Ahmet'?'tr-TR-AhmetNeural':'tr-TR-EmelNeural';
    const rate=body.style==='calm'?'-3%':body.style==='clear'?'0%':'0%';
    const escaped=phrase.replace(/&/g,'&amp;').replace(/([,;])\\s*/g,'$1<break time="420ms"/>').replace(/([.!?])\\s*/g,'$1<break time="650ms"/>');
    const xml='<speak version="1.0" xml:lang="tr-TR" xmlns="http://www.w3.org/2001/10/synthesis"><voice name="'+voice+'"><prosody rate="'+rate+'">'+escaped+'</prosody></voice></speak>';
    const response=await fetch('https://'+region+'.tts.speech.microsoft.com/cognitiveservices/v1',{method:'POST',headers:{'Ocp-Apim-Subscription-Key':String(env.AZURE_SPEECH_KEY).trim(),'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-16khz-32kbitrate-mono-mp3','User-Agent':'PARKIQ/1.0'},body:xml});
    if(!response.ok){
      const safeStatus={400:'Azure isteği kabul etmedi (400).',401:'Azure kimlik doğrulaması başarısız (401). Anahtar ve bölgeyi kontrol edin.',403:'Azure erişimi reddetti (403). Kaynak yetkilerini kontrol edin.',404:'Azure uç noktası bulunamadı (404). Bölgeyi kontrol edin.',429:'Azure istek sınırına ulaşıldı (429).',500:'Azure sunucu hatası (500).',503:'Azure geçici olarak kullanılamıyor (503).'};
      return Response.json({error:safeStatus[response.status]||'Azure ses servisi HTTP '+response.status,azureStatus:response.status},{status:502});
    }
    return new Response(response.body,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'private,max-age=60','X-Content-Type-Options':'nosniff'}});
  }catch(e){
    return Response.json({error:'Ses sunucusuna bağlantı kurulamadı. '+(e?.name||'Bağlantı hatası')},{status:502});
  }
}
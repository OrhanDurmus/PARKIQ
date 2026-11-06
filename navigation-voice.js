/* PARKIQ optional Azure voice adapter. Never blocks routing or parking. */
(function(){
'use strict';
let context=null,source=null,serial=0,enabled=true;
const cache=new Map();
function unlock(){try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;context=context||new AudioCtx();context.resume().catch(()=>{});const src=context.createBufferSource();src.buffer=context.createBuffer(1,1,22050);src.connect(context.destination);src.start(0)}catch(e){console.warn('Voice unlock:',e)}}
function stop(){serial++;try{source&&source.stop()}catch(e){}source=null;try{window.speechSynthesis&&speechSynthesis.cancel()}catch(e){}}
function fallback(text){try{if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text);u.lang='tr-TR';u.rate=.92;const v=speechSynthesis.getVoices().find(v=>/^tr(?:[-_]|$)/i.test(v.lang));if(v)u.voice=v;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){console.warn('Voice fallback:',e)}}
async function speak(text){if(!enabled)return false;const phrase=String(text||'').trim();if(!phrase)return false;const id=++serial;try{if(source){try{source.stop()}catch(e){}source=null}if(!context)throw Error('Audio locked');let buffer=cache.get(phrase);if(!buffer){const res=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:phrase,style:'clear'})});if(!res.ok)throw Error('TTS '+res.status);buffer=await context.decodeAudioData(await res.arrayBuffer());cache.set(phrase,buffer);if(cache.size>30)cache.delete(cache.keys().next().value)}if(id!==serial||!enabled)return true;await context.resume();if(id!==serial||!enabled)return true;const node=context.createBufferSource();node.buffer=buffer;node.connect(context.destination);source=node;node.onended=()=>{if(source===node)source=null};node.start(0)}catch(e){console.warn('Azure voice unavailable, using local voice:',e);if(id===serial&&enabled)fallback(phrase)}return true}
window.PARKIQVoice={unlock,speak,stop,setEnabled(v){enabled=!!v;if(!enabled)stop()}};
document.addEventListener('pointerdown',unlock,{capture:true,once:true});
})();
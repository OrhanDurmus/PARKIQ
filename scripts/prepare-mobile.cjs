// Create a local Capacitor web bundle without changing the deployed website.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'www');
const excluded=new Set(['.git','.github','node_modules','www','tests','docs','scripts','android','ios']);
const extensions=new Set(['.html','.css','.js','.json','.webmanifest','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.mp3','.wav','.ogg','.txt','.xml','.geojson','.csv']);
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
function copy(src,dst,depth=0){
  if(depth>12)throw new Error('Unexpected asset nesting');
  for(const entry of fs.readdirSync(src,{withFileTypes:true})){
    if(excluded.has(entry.name)||entry.name.startsWith('.'))continue;
    const from=path.join(src,entry.name),to=path.join(dst,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()){fs.mkdirSync(to,{recursive:true});copy(from,to,depth+1)}
    else if(entry.isFile()&&extensions.has(path.extname(entry.name).toLowerCase()))fs.copyFileSync(from,to);
  }
}
copy(root,out);
if(!fs.existsSync(path.join(out,'index.html')))throw new Error('Missing index.html');
console.log('ROTAPARK mobile web assets staged in www/');

// Capacitor uses a local app origin. Rewrite only local root-relative HTML assets
// in the staged copy; never modify the live website source.
for (const file of ['index.html']) {
  const target=path.join(out,file);
  let html=fs.readFileSync(target,'utf8');
  html=html.replace(/(href|src)=(["'])\/(?!\/)([^"']+)\2/g, '$1=$2./$3$2');
  // Native WebViews use a local origin; route server-backed API requests to the public backend.\n  html=html.replace(/fetch\((['"])\/api\//g, 'fetch($1https://rotapark.com.tr/api/');\n  html=html.replace(/const proxy=(['"])\/api\/walking-route/g, 'const proxy=$1https://rotapark.com.tr/api/walking-route');\n  fs.writeFileSync(target,html);
}
const mobileHtml=fs.readFileSync(path.join(out,'index.html'),'utf8');
if (!mobileHtml.includes('src="./navigation-voice.js"')) throw new Error('Mobile navigation voice asset path not rewritten');
if (mobileHtml.includes("fetch('/api/")) throw new Error('Unresolved mobile API fetch URL');\nconsole.log('ROTAPARK local assets and backend API URLs prepared for Capacitor');

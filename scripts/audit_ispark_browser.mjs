import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const origin = 'https://mvy.ispark.istanbul';
const profile = await mkdtemp(join(tmpdir(), 'ispark-public-'));
const chrome = spawn('google-chrome', ['--headless', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=0', '--user-data-dir='+profile, 'about:blank']);
let socket;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser start timed out')), 10000);
    chrome.once('error', error => {clearTimeout(timer); reject(error)});
    chrome.stderr.on('data', chunk => {
      const url = String(chunk).match(/DevTools listening on (ws:\/\/[^ ]+)/)?.[1]?.trim();
      if (url) {clearTimeout(timer); resolve(url)}
    });
  });
  const address = new URL(debuggerUrl);
  const targets = await (await fetch('http://'+address.host+'/json/list')).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });

  let sequence = 0;
  const commands = new Map();
  const requests = new Map();
  const responses = [];
  function command(method, params = {}) {
    const id = ++sequence;
    socket.send(JSON.stringify({id, method, params}));
    return new Promise((resolve, reject) => commands.set(id, {resolve, reject}));
  }
  socket.addEventListener('message', event => {
    const {id, method, params, result, error} = JSON.parse(event.data);
    const pending = commands.get(id);
    if (pending) {
      commands.delete(id);
      if (error) pending.reject(Error('DevTools command failed'));
      else pending.resolve(result);
    }
    if (method === 'Network.requestWillBeSent') {
      const url = new URL(params.request.url);
      if (url.origin === origin && /^\/jsonrpcx?\//.test(url.pathname)) {
        requests.set(params.requestId, {path:url.pathname, method:params.request.method});
      }
    }
    const request = requests.get(params?.requestId);
    if (!request) return;
    if (method === 'Network.responseReceived') request.status = params.response.status;
    if (method === 'Network.loadingFailed') request.failed = true;
    if (method === 'Network.loadingFinished' && request.status === 200) {
      responses.push(command('Network.getResponseBody', {requestId:params.requestId}).then(({body, base64Encoded}) => {
        if (base64Encoded || body.length > 2_000_000) return;
        const payload = JSON.parse(body);
        const seen = new Set();
        function visit(value, depth) {
          if (depth > 6 || !value || typeof value !== 'object') return;
          if (Array.isArray(value)) {
            for (const item of value.slice(0, 20)) visit(item, depth + 1);
          } else {
            for (const [key, item] of Object.entries(value)) {
              if (/^[\w-]{1,64}$/.test(key)) seen.add(key);
              visit(item, depth + 1);
            }
          }
        }
        visit(payload, 0);
        request.responseFieldNames = [...seen].sort().slice(0, 60);
      }).catch(() => {request.bodyInspection = 'unavailable'}));
    }
  });
  await command('Network.enable');
  await command('Page.navigate', {url:origin+'/otoparklar'});
  await delay(15000);
  await Promise.race([Promise.allSettled(responses), delay(2000)]);
  console.log('Public same-origin JSON-RPC requests observed:', JSON.stringify([...requests.values()]));
} finally {
  socket?.close();
  chrome.kill();
  await new Promise(resolve => {
    if (chrome.exitCode !== null) resolve();
    else {chrome.once('exit', resolve); setTimeout(resolve, 2000).unref()}
  });
  await rm(profile, {recursive:true, force:true, maxRetries:2});
}

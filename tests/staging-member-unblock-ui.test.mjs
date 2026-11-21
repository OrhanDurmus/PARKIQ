import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../staff/tasks/tasks.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../staff/tasks/index.html',import.meta.url),'utf8');

test('staff task module parses and is loaded as a module',async()=>{
  assert.match(html,/<script type="module" src="\.\/tasks\.mjs"><\/script>/);
  const {execFileSync}=await import('node:child_process');
  execFileSync(process.execPath,['--check',new URL('../staff/tasks/tasks.mjs',import.meta.url).pathname]);
});
test('blocked list and unblock use distinct server RPCs',()=>{
  assert.match(ui,/client\.rpc\('rotapark_staff_blocked_members'\)/);
  assert.match(ui,/client\.rpc\('rotapark_staff_unblock_member',\{p_email:member\.email,p_reason:reason\}\)/);
  assert.match(ui,/await allowed\(permission\)/);
});
test('unblock requires reason and explicit confirmation',()=>{
  assert.match(ui,/form\(card,'Engeli kaldır'/);
  assert.match(ui,/confirm\(label\+' işlemini onaylıyor musunuz\?'\)/);
  assert.match(ui,/required:true,minLength:3,maxLength:300/);
  assert.match(ui,/reason\.length<3 \|\| reason\.length>300/);
});
test('failed actions preserve form and successful block refreshes list',()=>{
  assert.doesNotMatch(ui,/catch \(error\) \{\s*panel\.replaceChildren\(\)/);
  assert.match(ui,/if \(block\) await renderBlockedMembers\(\)/);
  assert.match(ui,/Engel kaldırılamadı/);
});

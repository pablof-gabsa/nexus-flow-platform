import {test} from 'node:test';
import assert from 'node:assert/strict';
import {separateInlineFiles, digest} from './loading-trial-files.mjs';

test('trial copies verify binary content and retain task IDs, access tokens and confidentiality', async () => {
  const inline = `data:application/pdf;base64,${Buffer.from('PDF contents').toString('base64')}`;
  const source = {sharingToken:'keep-this', tasks:{visible:{rubro:'General', attachments:[{name:'file.pdf',type:'application/pdf',data:inline},{name:'external',data:'https://example.com/file'}]}, hidden:{confidential:true,attachments:[{name:'private.pdf',data:inline}]}}, assets:{asset:{image:'data:image/png;base64,aW1hZ2U=',documents:[{name:'doc',data:inline}]}}};
  const before = structuredClone(source), objects = new Map();
  const result = await separateInlineFiles(source, {save:async(key, bytes)=>objects.set(key,Buffer.from(bytes)),read:async key=>objects.get(key),urlFor:file=>`https://trial.example/${file.key}`});
  assert.deepEqual(source, before);
  assert.equal(result.data.sharingToken, source.sharingToken);
  assert.deepEqual(Object.keys(result.data.tasks), ['visible','hidden']);
  assert.equal(result.data.tasks.hidden.confidential, true);
  assert.equal(result.data.tasks.visible.attachments[0].name, 'file.pdf');
  assert.equal(result.data.tasks.visible.attachments[1].data, 'https://example.com/file');
  assert.equal(result.files.length, 4);
  assert.equal(result.files.find(f=>f.id==='hidden').sharedVisible, false);
  assert.equal(new Set(result.files.map(f=>f.key)).size, 4);
  for(const file of result.files) assert.equal(digest(objects.get(file.key)),file.hash);
});

test('failed storage verification never modifies the original inline data', async () => {
  const source = {tasks:{task:{attachments:[{data:'data:text/plain;base64,YWJj'}]}}};
  const before = structuredClone(source);
  await assert.rejects(separateInlineFiles(source,{save:async()=>{},read:async()=>Buffer.from('corrupt'),urlFor:()=>''}),/verification failed/);
  assert.deepEqual(source,before);
});

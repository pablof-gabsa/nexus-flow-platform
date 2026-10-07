// Explicit opt-in trial. Creates disposable copies, never edits the source project.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {separateInlineFiles, digest, jsonBytes} from './loading-trial-files.mjs';

const require=createRequire(new URL('../functions/package.json',import.meta.url));
const options=Object.fromEntries(process.argv.slice(3).map(value=>{const i=value.indexOf('=');return [value.slice(2,i),value.slice(i+1)];}));
const command=process.argv[2], root=fileURLToPath(new URL('../',import.meta.url));
const statePath=resolve(options.state||'.firebase/loading-trial/state.json');
const sourceId=options.source, apiBase='https://nexus-flow-6dac7.web.app';
const database='https://nexus-flow-6dac7-default-rtdb.firebaseio.com';
const firestore='https://firestore.googleapis.com/v1/projects/nexus-flow-6dac7/databases/nexus-assistants/documents';
const bucket='nexus-flow-6dac7.firebasestorage.app', localBase='http://127.0.0.1:8788';
if(!options['firebase-tools'])throw new Error('Pass --firebase-tools=<installed firebase-tools/lib/api.js path>');
const firebaseApi=require(options['firebase-tools']);
const cli=JSON.parse(readFileSync(join(homedir(),'.config/configstore/firebase-tools.json'),'utf8'));
const oauth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:firebaseApi.clientId(),client_secret:firebaseApi.clientSecret(),grant_type:'refresh_token',refresh_token:cli.tokens.refresh_token}),signal:AbortSignal.timeout(25000)});
if(!oauth.ok)throw new Error(`Authorization unavailable (${oauth.status})`);
const authorization=(await oauth.json()).access_token;
async function remote(url,method='GET',body,extra={}) {
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${authorization}`,...(body&&!(body instanceof Buffer)?{'Content-Type':'application/json'}:{}),...extra},...(body===undefined?{}:{body:body instanceof Buffer?body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Authorized ${method} failed (${response.status})`);
 return response;
}
const json=async(url,method='GET',body)=>(await remote(url,method,body)).json();
const db=(path,method='GET',body)=>json(`${database}/${path}.json`,method,body);
const readState=()=>JSON.parse(readFileSync(statePath,'utf8'));
const saveState=state=>writeFileSync(statePath,JSON.stringify(state,null,2));
const checkpoint=()=>{
 const state=readState();
 if(!/^qa_loading_[a-f0-9]{24}$/.test(state.id)||state.owner!==`${state.id}_owner`||state.prefix!==`loading-trials/${state.id}/`)throw new Error('Invalid disposable trial identity');
 return state;
};
async function shared(state,token) {
 const r=await fetch(`${apiBase}/v1/shared-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:state.id,token}),signal:AbortSignal.timeout(60000)});
 const result=await r.json();return {status:r.status,...result};
}
async function sample(state) {
 const start=performance.now();
 const response=await fetch(`${apiBase}/v1/shared-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:state.id,token:state.collaborator}),signal:AbortSignal.timeout(60000)});
 const first=performance.now(), body=await response.text(), received=performance.now();
 const data=JSON.parse(body), parsed=performance.now();
 if(response.status!==200||data.readOnly!==false)throw new Error('Trial read failed');
 return {status:response.status,totalMs:Math.round(parsed-start),firstByteMs:Math.round(first-start),downloadMs:Math.round(received-first),responseBytes:Buffer.byteLength(body),visibleTasks:Object.keys(data.data.tasks||{}).length};
}
const storageUrl=key=>`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}`;
const readObject=async key=>Buffer.from(await (await remote(`${storageUrl(key)}?alt=media`)).arrayBuffer());

if(command==='prepare') {
 if(!sourceId||!/^[A-Za-z0-9_-]{1,128}$/.test(sourceId))throw new Error('Pass the source project ID');
 try{readFileSync(statePath);throw new Error('State exists; reuse it or explicitly clean up first');}catch(error){if(error.code!=='ENOENT')throw error;}
 mkdirSync(dirname(statePath),{recursive:true});
 const source=await db(`project_data/${sourceId}`);if(!source)throw new Error('Source project missing');
 const sourceOwner=await db(`project_owners/${sourceId}`), sourceProject=await db(`users/${sourceOwner.ownerUid}/projects/${sourceId}`);
 const id=`qa_loading_${randomBytes(12).toString('hex')}`, owner=`${id}_owner`;
 const state={id,owner,sourceId,prefix:`loading-trials/${id}/`,guest:randomBytes(32).toString('hex'),collaborator:randomBytes(32).toString('hex'),sourceDigest:digest(JSON.stringify(source)),sourceTokenDigest:digest(source.sharingToken||''),sourceTasks:Object.keys(source.tasks||{}).length,sourceBytes:jsonBytes(source),createdAt:new Date().toISOString(),files:[],samples:{}};
 writeFileSync(join(dirname(statePath),'source.json'),JSON.stringify(source));
 saveState(state); // Recovery identity is durable before any cloud write.
 await db('', 'PATCH', {[`project_data/${id}`]:{...source,sharingToken:state.guest},[`project_owners/${id}`]:{ownerUid:owner},[`users/${owner}/projects/${id}`]:{owner,name:`Prueba de carga · ${sourceProject.name}`,status:'active'}});
 await json(`${firestore}/nexus_assistant_collaborator_links/${id}`,'PATCH',{fields:{ownerUid:{stringValue:owner},readTokenHash:{stringValue:digest(state.guest)},token:{stringValue:state.collaborator}}});
 console.log(JSON.stringify({prepared:true,sourceBytes:state.sourceBytes,tasks:state.sourceTasks,isolatedFromRealWorkspaces:true}));
} else if(command==='measure') {
 const state=checkpoint(), label=options.label;
 if(!['before','after'].includes(label))throw new Error('Use --label=before or --label=after');
 const samples=[];
 for(let i=0;i<3;i++){const result=await sample(state);samples.push(result);console.log(JSON.stringify({label,sample:i+1,...result}));}
 state.samples[label]=samples;saveState(state);
} else if(command==='migrate') {
 const state=checkpoint();if(state.migrated)throw new Error('Trial already migrated');
 const policy=await json(`https://storage.googleapis.com/storage/v1/b/${bucket}/iam`);
 if((policy.bindings||[]).some(b=>(b.members||[]).some(m=>m==='allUsers'||m==='allAuthenticatedUsers')))throw new Error('Bucket has public IAM access; private trial stopped');
 const source=JSON.parse(readFileSync(join(dirname(statePath),'source.json'),'utf8'));
 const uploads=[];
 const {data,files}=await separateInlineFiles(source,{
  save:async(key,bytes,type)=>{
   const objectKey=state.prefix+key;
   const response=await remote(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectKey)}&ifGenerationMatch=0&predefinedAcl=private`,'POST',bytes,{'Content-Type':type});
   const stored=await response.json();uploads.push({key:objectKey,generation:stored.generation});state.uploads=uploads;saveState(state);
  },
  read:key=>readObject(state.prefix+key),
  urlFor:file=>`${localBase}/trial-files/${encodeURIComponent(file.key)}?token=${state.guest}`
 });
 data.sharingToken=state.guest;
 state.files=files;saveState(state);
 await db(`project_data/${state.id}`,'PUT',data);
 const saved=await db(`project_data/${state.id}`);
 if(digest(JSON.stringify(saved))!==digest(JSON.stringify(data))) {
  // Firebase sorts JSON object keys; compare through the canonical encoder.
  const {canonical}=await import('../functions/src/validation.mjs');
  if(digest(canonical(saved))!==digest(canonical(data)))throw new Error('Migrated copy readback mismatch');
 }
 state.migrated=true;state.optimizedBytes=jsonBytes(saved);saveState(state);
 console.log(JSON.stringify({migratedCopy:true,files:files.length,binaryBytes:files.reduce((n,f)=>n+f.size,0),optimizedBytes:state.optimizedBytes,allFilesVerified:true}));
} else if(command==='verify') {
 const state=checkpoint();
 const editor=await shared(state,state.collaborator), visitor=await shared(state,state.guest);
 if(editor.status!==200||editor.readOnly!==false||visitor.status!==200||visitor.readOnly!==true)throw new Error('Shared role check failed');
 for(const result of [editor,visitor])for(const task of Object.values(result.data.tasks||{}))if(task.confidential||task.rubro==='Eliminado')throw new Error('Hidden task exposed');
 const [taskId,task]=Object.entries(editor.data.tasks||{}).find(([,task])=>(task.description||'').length<9500)||[];
 if(!taskId)throw new Error('No suitable task for isolated edit test');
 const mutate=async(token,expectedVersion,description)=>{
  const response=await fetch(`${apiBase}/v1/shared-project/mutate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:state.id,token,operation:'task_update',id:taskId,expectedVersion,requestId:randomBytes(16).toString('hex'),changes:{description}}),signal:AbortSignal.timeout(60000)});
  return {status:response.status,...await response.json()};
 };
 const edited=await mutate(state.collaborator,task._version,'Edición de prueba aislada');
 const readback=await db(`project_data/${state.id}/tasks/${taskId}`);
 if(edited.status!==200||!edited.saved||readback.description!=='Edición de prueba aislada')throw new Error('Collaborator trial edit did not save');
 const blocked=await mutate(state.guest,edited.version,'Visita no debe guardar');
 if(blocked.status!==403)throw new Error('Visitor trial write was not denied');
 const restored=await mutate(state.collaborator,edited.version,task.description||'');
 if(restored.status!==200||!restored.saved)throw new Error('Could not restore isolated edit');
 const source=await db(`project_data/${state.sourceId}`);
 const sourceUnchanged=digest(JSON.stringify(source))===state.sourceDigest;
 const tokenPreserved=digest(source.sharingToken||'')===state.sourceTokenDigest;
 if(!tokenPreserved)throw new Error('Source link changed externally during trial');
 const report={testedAt:new Date().toISOString(),sourceUnchanged,originalLinkPreserved:tokenPreserved,originalTaskCount:Object.keys(source.tasks||{}).length,trialTaskCount:Object.keys((await db(`project_data/${state.id}`)).tasks||{}).length,filesVerified:state.files.length,sourceBytes:state.sourceBytes,optimizedBytes:state.optimizedBytes,collaboratorEditSaved:true,visitorWriteDenied:true,hiddenTasksExcluded:true,samples:state.samples};
 state.report=report;saveState(state);writeFileSync(join(dirname(statePath),'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} else if(command==='serve') {
 const state=checkpoint();if(!state.migrated)throw new Error('Migrate the isolated copy first');
 const express=require('express'), app=express();let reads=0,fileDownloads=0;
 app.use((req,res,next)=>{if(req.get('origin')&&req.get('origin')!==localBase)return res.sendStatus(403);next();});
 app.use(express.json({limit:'30mb'}));
 app.post('/trial-api/*path',async(req,res)=>{
  const path=req.path.slice('/trial-api'.length);
  if(!['/v1/shared-project','/v1/shared-project/mutate'].includes(path)||req.body.projectId!==state.id)return res.sendStatus(403);
  const response=await fetch(apiBase+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body),signal:AbortSignal.timeout(60000)});
  if(path==='/v1/shared-project')reads++;
  res.status(response.status).type('json').send(await response.text());
 });
 app.get('/trial-files/:key',async(req,res)=>{
  const file=state.files.find(f=>f.key===req.params.key);
  if(!file||!file.sharedVisible||![state.guest,state.collaborator].includes(req.query.token))return res.sendStatus(404);
  const access=await shared(state,req.query.token);
  const item=access.data?.[file.kind]?.[file.id];
  if(access.status!==200||!item)return res.sendStatus(404);
  const url=file.field==='image'?item.image:item[file.field]?.[file.index]?.data;
  if(url!==`${localBase}/trial-files/${encodeURIComponent(file.key)}?token=${state.guest}`)return res.sendStatus(404);
  const bytes=await readObject(state.prefix+file.key);if(digest(bytes)!==file.hash)return res.sendStatus(500);
  fileDownloads++;res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).type(file.type).send(bytes);
 });
 app.get('/trial-stats',(req,res)=>res.json({projectReads:reads,fileDownloads}));
 app.get('/editor',(req,res)=>res.redirect(`/preview#/share/${state.id}?mode=edit&t=${state.collaborator}`));
 app.get('/visitor',(req,res)=>res.redirect(`/preview#/share/${state.id}?mode=readonly&t=${state.guest}`));
 const head=readFileSync(join(root,'index.html'),'utf8').split('</head>')[0]+'</head>';
 app.get('/preview',(req,res)=>res.type('html').send(head+`<body class="dark bg-slate-900"><main id="main-content"></main>
 <script>document.documentElement.classList.add('dark');window.NEXUS_ASSISTANTS_CONFIG={apiBaseUrl:'${localBase}/trial-api'};const Auth={getCurrentUser:()=>null};const NavbarComponent={render:()=>''};const App={navigateTo:hash=>location.hash=hash};</script>
 <script src="/js/utils.js"></script><script src="/js/services/assistant-api.js"></script><script src="/js/services/store.js"></script><script src="/js/components/ui.js"></script><script src="/js/components/integrations.js"></script><script src="/js/components/project.js"></script><script src="/js/components/shared.js"></script>
 <script>SharedComponent.render(document.getElementById('main-content'),'${state.id}',new URLSearchParams(location.hash.split('?')[1]));</script></body></html>`));
 app.use(express.static(root,{dotfiles:'deny'}));
 app.listen(8788,'127.0.0.1',()=>console.log('Isolated trial preview ready on 127.0.0.1:8788'));
} else if(command==='cleanup') {
 const state=checkpoint();
 for(const object of state.uploads||[]){if(!object.key.startsWith(state.prefix))throw new Error('Object outside trial prefix');await remote(`${storageUrl(object.key)}?ifGenerationMatch=${object.generation}`,'DELETE');}
 await db('', 'PATCH', {[`project_data/${state.id}`]:null,[`project_owners/${state.id}`]:null,[`users/${state.owner}`]:null});
 await remote(`${firestore}/nexus_assistant_collaborator_links/${state.id}`,'DELETE');
 const remaining=await db(`project_data/${state.id}`);if(remaining!==null)throw new Error('Disposable copy remains');
 state.cleanedAt=new Date().toISOString();saveState(state);console.log(JSON.stringify({disposableCloudDataRemoved:true,originalProjectNeverWritten:true}));
} else throw new Error('Use prepare, measure, migrate, verify, serve or cleanup');

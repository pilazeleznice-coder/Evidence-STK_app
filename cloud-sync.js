(function(){
'use strict';
const App=window.STKApp,M=window.STKSyncModel,cfg=window.STK_CLOUD_CONFIG;
if(!App||!M||!window.PZSupabase){console.warn('STK cloud components unavailable');return;}
// Same Auth storage/refresh lock as Evidence Rozvozu; database records remain separate.
const client=window.PZSupabase.createClient(cfg.url,cfg.key,{auth:{storageKey:'pzEvidenceAuthV1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:(url,init={})=>fetch(url,{...init,signal:init.signal||AbortSignal.timeout(30000)})}});
let cloudClient=client;let db,state=null,user=null,busy=false,applying=false,localVersion=0,timer,lastError='',initialized,authReady,lockPending=false;
const photoHashes=new Map();let enabled=true;try{enabled=localStorage.getItem('pila-stk-cloud-auto')!=='false';}catch{}
const uuid=()=>crypto.randomUUID();
const readyDb=new Promise((ok,no)=>{const r=indexedDB.open('pila-stk-cloud-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('photos');};r.onsuccess=()=>{db=r.result;ok();};r.onerror=()=>no(r.error);});
function tx(store,mode,fn){return new Promise((ok,no)=>{const t=db.transaction(store,mode);let out;const request=fn(t.objectStore(store));if(request)request.onsuccess=()=>out=request.result;t.oncomplete=()=>ok(out);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error||Error('Ukládání bylo přerušeno.'));});}
function save(){return tx('state','readwrite',s=>s.put(structuredClone(state),'main'));}
initialized=readyDb.then(async()=>{state=await tx('state','readonly',s=>s.get('main'))||null;}).catch(e=>{lastError='Místní úložiště cloudu není dostupné. Vozidla zůstávají v zařízení.';throw e;});
authReady=client.auth.getSession().then(({data,error})=>{if(error)throw error;user=data.session?.user||null;}).catch(()=>{lastError='Přihlášení nelze obnovit. Přihlaste se účtem Evidence.';});
client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;queueMicrotask(()=>{paint();queue();});});
async function digest(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function dataUrl(blob){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});}
function validPhoto(ref){return ref&&/^[a-f0-9]{64}$/.test(ref.hash)&&ref.path===state.owner+'/'+ref.hash&&['image/jpeg','image/png','image/webp','image/gif'].includes(ref.type)&&ref.size>0&&ref.size<=10485760;}
async function normalizePhoto(value){
 if(!value)return null;
 if(typeof value!=='string'||!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(value))throw Error('Fotografie má nepodporovaný formát. Zvolte JPEG, PNG, WebP nebo GIF.');
 if(photoHashes.has(value))return photoHashes.get(value);
 const blob=await (await fetch(value)).blob();if(blob.size>10485760)throw Error('Fotografie překračuje limit 10 MB. Zůstává v zařízení.');
 const hash=await digest(blob),ref={hash,path:state.owner+'/'+hash,type:blob.type,size:blob.size};
 const old=await tx('photos','readonly',s=>s.get(ref.path));if(!old)await tx('photos','readwrite',s=>s.put({ref,data:value,uploaded:false},ref.path));photoHashes.set(value,ref);return ref;
}
async function snapshot(){
 const out={};for(const vehicle of App.getVehicles()){
  if(!vehicle.id)throw Error('Vozidlu chybí identifikátor. Obnovte aplikaci.');
  const payload=structuredClone(vehicle);payload.photo=await normalizePhoto(vehicle.photo);out[M.key('vehicle',vehicle.id)]={kind:'vehicle',id:vehicle.id,payload};
 }return out;
}
async function capture(){if(!state)return null;for(let attempt=0;attempt<4;attempt++){const before=localVersion,map=await snapshot();if(before!==localVersion)continue;M.capture(state,map,uuid);return map;}throw Error('Data se právě mění. Synchronizace bude pokračovat za chvíli.');}
async function bind(){
 if(!user)return false;if(state&&state.owner!==user.id)throw Error('V zařízení jsou vozidla jiného účtu. Přihlaste se původním účtem; data nebyla odeslána.');
 if(!state){await tx('state','readwrite',s=>s.put({at:new Date().toISOString(),vehicles:App.getVehicles()},'before-first-sync'));state=M.empty(user.id);await capture();await save();}return true;
}
function checkOwner(){if(!user||user.id!==state?.owner)throw Error('Účet se změnil. Přihlaste se účtem vlastníka místní evidence.');}
async function uploadPhotos(){checkOwner();
 const refs=new Map();for(const op of Object.values(state.outbox)){const ref=!op.deleted&&op.payload?.photo;if(ref)refs.set(ref.path,ref);}
 for(const ref of refs.values()){
  if(!validPhoto(ref))throw Error('Neplatný odkaz na fotografii.');const entry=await tx('photos','readonly',s=>s.get(ref.path));if(entry?.uploaded)continue;
  if(!entry?.data)throw Error('Místní fotografie chybí. Otevřete zařízení s původní fotografií.');
  const blob=await (await fetch(entry.data)).blob();if(await digest(blob)!==ref.hash)throw Error('Kontrola místní fotografie selhala.');
  const {error}=await cloudClient.storage.from('stk-photos').upload(ref.path,blob,{contentType:ref.type,upsert:false});if(error&&Number(error.statusCode)!==409&&Number(error.status)!==409)throw Error('Fotografii se nepodařilo odeslat: '+error.message);
  await tx('photos','readwrite',s=>s.put({...entry,uploaded:true},ref.path));
 }
}
async function hydrate(map){
 const vehicles=[];for(const record of Object.values(map)){
  if(record.kind!=='vehicle')continue;const vehicle=structuredClone(record.payload);if(!vehicle||typeof vehicle!=='object'||vehicle.id!==record.id||typeof vehicle.name!=='string'||typeof vehicle.spz!=='string'||(vehicle.history!==undefined&&!Array.isArray(vehicle.history)))throw Error('Server vrátil neplatný záznam vozidla. Místní evidence zůstala zachovaná.');const ref=vehicle.photo;
  if(ref){if(!validPhoto(ref))throw Error('Server vrátil neplatnou fotografii.');let entry=await tx('photos','readonly',s=>s.get(ref.path));
   if(!entry){const {data,error}=await cloudClient.storage.from('stk-photos').download(ref.path);if(error)throw Error('Fotografii se nepodařilo stáhnout. Zkuste synchronizaci znovu.');if(data.size!==ref.size||await digest(data)!==ref.hash)throw Error('Kontrola stažené fotografie selhala.');entry={ref,data:await dataUrl(new Blob([data],{type:ref.type})),uploaded:true};await tx('photos','readwrite',s=>s.put(entry,ref.path));}
   vehicle.photo=entry.data;photoHashes.set(entry.data,ref);
  }else delete vehicle.photo;vehicles.push(vehicle);
 }return vehicles;
}
async function send(){
 const operations=Object.entries(state.outbox).filter(([key])=>!state.conflicts[key]).map(([,op])=>structuredClone(op));
 for(let i=0;i<operations.length;i+=30){checkOwner();const batch=operations.slice(i,i+30),{data,error}=await cloudClient.rpc('stk_sync_apply',{changes:batch});if(error)throw error;await capture();
  for(let j=0;j<batch.length;j++){const op=batch[j],answer=data?.[j];if(!answer)throw Error('Server nepotvrdil uložení změny.');if(answer.ok&&answer.row)M.acknowledge(state,op,answer.row);else state.conflicts[M.key(op.kind,op.id)]={remote:answer.row||{kind:op.kind,id:op.id,payload:null,deleted:true,revision:0}};}await save();
 }
}
async function pull(){
 checkOwner();if(App.isEditing())return false;
 for(let page=0;page<100;page++){
  const {data,error}=await cloudClient.from('stk_sync_entries').select('*').eq('user_id',state.owner).gt('revision',state.cursor).order('revision').limit(100);if(error)throw error;if(!data.length)return true;
  const map=await capture(),version=localVersion,next=structuredClone(state);M.receive(next,map,data);
  const vehicles=await hydrate(map);checkOwner();if(App.isEditing()||version!==localVersion)return false;
  const previous=state;try{applying=true;App.setVehicles(vehicles);state=next;await save();}catch(e){state=previous;throw e;}finally{applying=false;}
  if(data.length<100)return true;
 }throw Error('Na serveru je více změn. Spusťte synchronizaci znovu.');
}
async function perform(force){
 if(busy)return false;busy=true;lastError='';paint();
 try{await initialized;await authReady;const saved=await tx('state','readonly',s=>s.get('main'));if(saved)state=saved;
  if(!user){if(state){await capture();await save();}return false;}if(!await bind())return false;const auth=await client.auth.getSession();const session=auth.data?.session;if(auth.error||!session||session.user.id!==state.owner)throw Error('Přihlášení se změnilo. Přihlaste se původním účtem.');cloudClient=window.PZSupabase.createClient(cfg.url,cfg.key,{accessToken:async()=>session.access_token,global:{fetch:(url,init={})=>fetch(url,{...init,signal:init.signal||AbortSignal.timeout(30000)})}});
  await capture();await save();if(!navigator.onLine){lastError='Jste offline. Změny čekají bezpečně v zařízení.';return false;}if(!enabled&&!force)return false;
  await uploadPhotos();await capture();await save();await send();const pulled=await pull();state.lastSync=new Date().toISOString();state.waitingForForm=!pulled;await save();return Object.keys(state.outbox).length===0&&pulled;
 }catch(e){lastError=e.message||'Synchronizace se nezdařila. Změny zůstávají v zařízení.';console.warn('STK sync:',lastError);return false;}finally{busy=false;paint();}
}
async function sync(force=false){if(lockPending||busy)return false;lockPending=true;try{return navigator.locks?await navigator.locks.request('pz-stk-sync',()=>perform(force)):await perform(force);}finally{lockPending=false;}}
function queue(){if(applying)return;clearTimeout(timer);timer=setTimeout(()=>sync(),700);}
window.addEventListener('stk-local-change',()=>{if(applying)return;localVersion++;queue();paint();});
window.addEventListener('storage',e=>{if(e.key==='pila-stk-vehicles-v1'){localVersion++;if(!App.isEditing())App.reloadLocal();queue();}});window.addEventListener('online',()=>sync());
setInterval(()=>{if(!document.hidden)sync();},20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
function addButton(parent,label,fn){const b=document.createElement('button');b.type='button';b.className='btn light';b.textContent=label;b.onclick=fn;parent.append(b);return b;}
function describe(record){if(record?.deleted)return 'Odstraněno';const p=record?.payload||{};return [p.name,p.spz,p.date?'STK: '+p.date:'',p.em?'Emise: '+p.em:'',p.note].filter(Boolean).join(' · ');}
async function resolve(key,choice){
 if(busy||lockPending||App.isEditing())return;const run=async()=>{busy=true;paint();try{await initialized;checkOwner();const saved=await tx('state','readonly',s=>s.get('main'));if(saved)state=saved;const map=await capture(),before=localVersion,next=structuredClone(state);if(!M.resolve(next,map,key,choice,uuid))return;const vehicles=await hydrate(map);if(before!==localVersion)throw Error('Vozidla se mezitím změnila. Zvolte verzi znovu.');applying=true;App.setVehicles(vehicles);state=next;await save();lastError='';}catch(e){lastError=e.message;}finally{applying=false;busy=false;paint();}};
 if(navigator.locks)await navigator.locks.request('pz-stk-sync',run);else await run();queue();
}
function paint(){
 const badge=document.querySelector('header .demo');const conflicts=Object.keys(state?.conflicts||{}).length,pending=Object.keys(state?.outbox||{}).length;
 if(badge)badge.textContent=busy?'SYNCHRONIZUJI…':lastError?'CLOUD · ZKONTROLOVAT':conflicts?'CLOUD · SOUBĚŽNÁ ZMĚNA':!user?'ULOŽENO V ZAŘÍZENÍ':state?.waitingForForm?'CLOUD · ČEKÁ NA ZAVŘENÍ FORMULÁŘE':pending?'CLOUD · ČEKÁ NA ODESLÁNÍ':'CLOUD · SYNCHRONIZOVÁNO';
 const host=document.getElementById('stk-cloud-settings');if(!host)return;if(!user&&host.querySelector('.cloud-login')){const status=host.querySelector('.cloud-status');if(status&&lastError)status.textContent=lastError;return;}host.replaceChildren();const box=document.createElement('section');box.className='cloud-setting';host.append(box);
 const title=document.createElement('h2');title.textContent='Cloudová synchronizace';box.append(title);const intro=document.createElement('p');intro.textContent='Použijte stejný účet jako v Evidenci rozvozů. Vozidla, fotografie a historie STK se propojí mezi vašimi zařízeními.';box.append(intro);
 const status=document.createElement('p');status.className='cloud-status';status.textContent=lastError||(!user?'Zatím nepřihlášeno. Evidence funguje i místně.':busy?'Probíhá synchronizace…':conflicts?'Vyberte verzi souběžně upraveného vozidla níže.':pending?pending+' změn čeká na odeslání.':state?.waitingForForm?'Stažené změny se použijí po zavření formuláře.':state?.lastSync?'Naposledy synchronizováno '+new Date(state.lastSync).toLocaleString('cs-CZ'):'Připojeno k účtu.');box.append(status);
 if(!user){const form=document.createElement('form');form.className='cloud-login';form.innerHTML='<label>E-mail<input type="email" name="email" autocomplete="username" required></label><label>Heslo<input type="password" name="password" autocomplete="current-password" required></label><button class="btn" type="submit">Přihlásit a synchronizovat</button>';box.append(form);form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;const email=form.elements.email.value.trim(),password=form.elements.password.value;try{const {error}=await client.auth.signInWithPassword({email,password});form.elements.password.value='';if(error)throw Error('Přihlášení se nezdařilo. Zkontrolujte e-mail a heslo účtu Evidence.');lastError='';await sync(true);}catch(e){lastError=e.message;paint();}finally{submit.disabled=false;}};}
 else{const account=document.createElement('p');account.textContent='Přihlášený účet: '+user.email;box.append(account);const actions=document.createElement('div');actions.className='cloud-actions';box.append(actions);addButton(actions,'Synchronizovat nyní',()=>sync(true)).disabled=busy;addButton(actions,'Odhlásit účet',async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)lastError=error.message;paint();}).disabled=busy;
  const label=document.createElement('label');label.className='cloud-auto';const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=enabled;toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem('pila-stk-cloud-auto',String(enabled));}catch{}if(enabled)sync();};label.append(toggle,document.createTextNode(' Automatická synchronizace'));box.append(label);
 }
 if(state){addButton(box,'Stáhnout původní zálohu před propojením',async()=>{const checkpoint=await tx('state','readonly',s=>s.get('before-first-sync'));if(!checkpoint)return;const blob=new Blob([JSON.stringify({app:'Evidence STK',version:1,...checkpoint},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Evidence-STK-pred-cloudem.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});}
 if(conflicts){for(const [key,conflict] of Object.entries(state.conflicts)){const card=document.createElement('article');card.className='cloud-conflict';const name=document.createElement('strong');name.textContent='Souběžná změna vozidla';card.append(name);for(const [label,record] of [['Toto zařízení',state.outbox[key]],['Cloud',conflict.remote]]){const p=document.createElement('p');p.textContent=label+': '+describe(record);card.append(p);}addButton(card,'Ponechat místní verzi',()=>resolve(key,'local'));addButton(card,'Použít verzi z cloudu',()=>resolve(key,'remote'));box.append(card);}}
}
window.STKCloud={sync,paint,client};Promise.all([initialized,authReady]).then(()=>{paint();sync();}).catch(()=>paint());
})();

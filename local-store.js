/* Atomic local records for vehicles and repair parts. The legacy copy is never erased. */
(function(){
'use strict';
const LEGACY='pila-stk-vehicles-v1';
let db;
const clone=value=>structuredClone(value);
const uuid=()=>crypto.randomUUID();

function valid(data){
 if(!Array.isArray(data)||data.some(x=>!x||typeof x!=='object'||typeof x.name!=='string'||typeof x.spz!=='string'))
  throw Error('Záloha vozidel má neplatný formát. Původní data zůstala zachovaná.');
 const ids=new Set();
 return data.map(x=>{
  const v=clone(x);
  v.id=v.id||'plate-'+v.spz.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(v.id==='plate-'||ids.has(v.id))v.id=uuid();
  ids.add(v.id);
  return v;
 });
}
function validInventory(data){
 if(!data||!Array.isArray(data.parts)||!Array.isArray(data.partCategories))
  throw Error('Evidence dílů má neplatný formát. Nic nebylo přepsáno.');
 const ids=new Set(),categories=new Set();
 const partCategories=data.partCategories.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||categories.has(item.id)||
   !['machine','type'].includes(item.kind)||typeof item.name!=='string'||!item.name.trim())
   throw Error('Kategorie dílů je poškozená. Nic nebylo přepsáno.');
  categories.add(item.id);
  return clone(item);
 });
 const parts=data.parts.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||
   typeof item.name!=='string'||!item.name.trim()||typeof item.typeId!=='string'||
   !Array.isArray(item.machineIds)||item.machineIds.some(x=>typeof x!=='string')||
   !Number.isInteger(item.stock)||item.stock<0||!Number.isInteger(item.needed)||item.needed<=0||
   (item.price!=null&&(!Number.isFinite(item.price)||item.price<0))||
   !['active','ordered','unavailable','retired'].includes(item.status)||
   !Array.isArray(item.links)||item.links.some(x=>!x||typeof x.name!=='string'||typeof x.url!=='string')||
   !Array.isArray(item.barcodes)||item.barcodes.some(x=>typeof x!=='string')||
   (item.photo&&(
    typeof item.photo!=='string'||!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(item.photo)
   ))
  )throw Error('Záznam dílu je poškozený. Nic nebylo přepsáno.');
  ids.add(item.id);
  return clone(item);
 });
 return {parts,partCategories};
}
const ready=new Promise((ok,no)=>{
 const request=indexedDB.open('pila-stk-vehicles-v2',2);
 request.onupgradeneeded=()=>{
  const database=request.result;
  if(!database.objectStoreNames.contains('vehicles'))database.createObjectStore('vehicles',{keyPath:'id'});
  if(!database.objectStoreNames.contains('meta'))database.createObjectStore('meta');
  if(!database.objectStoreNames.contains('history'))database.createObjectStore('history',{autoIncrement:true});
  if(!database.objectStoreNames.contains('parts'))database.createObjectStore('parts',{keyPath:'id'});
  if(!database.objectStoreNames.contains('part_categories'))database.createObjectStore('part_categories',{keyPath:'id'});
 };
 request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();ok();};
 request.onerror=()=>no(request.error||Error('Úložiště nelze otevřít.'));
 request.onblocked=()=>no(Error('Úložiště blokuje starší okno aplikace. Zavřete ostatní okna a zkuste znovu.'));
});
function read(){
 return new Promise((ok,no)=>{
  const transaction=db.transaction(['vehicles','parts','part_categories','meta'],'readonly');
  const vehicles=transaction.objectStore('vehicles').getAll();
  const parts=transaction.objectStore('parts').getAll();
  const partCategories=transaction.objectStore('part_categories').getAll();
  const meta=transaction.objectStore('meta').get('main');
  transaction.oncomplete=()=>ok({
   vehicles:vehicles.result,parts:parts.result,partCategories:partCategories.result,
   info:meta.result||{revision:0,origin:'empty'}
  });
  transaction.onerror=()=>no(transaction.error);
  transaction.onabort=()=>no(transaction.error||Error('Čtení bylo přerušeno.'));
 });
}
function write(mode,data,expected,origin='app'){
 const incomingVehicles=mode==='vehicles'?valid(data):mode==='all'?valid(data.vehicles):null;
 const incomingInventory=mode==='inventory'||mode==='all'?validInventory(data):null;
 return new Promise((ok,no)=>{
  const transaction=db.transaction(['vehicles','parts','part_categories','meta','history'],'readwrite');
  const vehicleStore=transaction.objectStore('vehicles'),partStore=transaction.objectStore('parts');
  const categoryStore=transaction.objectStore('part_categories'),metaStore=transaction.objectStore('meta');
  const oldVehicles=vehicleStore.getAll(),oldParts=partStore.getAll();
  const oldCategories=categoryStore.getAll(),meta=metaStore.get('main');
  let received=0,info,reason;
  const apply=(store,before,after,field,at)=>{
   const old=new Map(before.map(item=>[item.id,item]));
   const next=new Map(after.map(item=>[item.id,item]));
   for(const [id,record] of old){
    if(!next.has(id)||JSON.stringify(record)!==JSON.stringify(next.get(id))){
     if(field)transaction.objectStore('history').add({at,action:next.has(id)?'edit':'remove',[field]:record});
     if(!next.has(id))store.delete(id);
    }
   }
   for(const item of after)if(JSON.stringify(old.get(item.id))!==JSON.stringify(item))store.put(item);
  };
  const finish=()=>{
   if(++received<4)return;
   const current=meta.result||{revision:0};
   if(current.revision!==expected){
    reason=Error('Evidence se změnila v jiném okně. Obnovte přehled a úpravu zopakujte.');
    transaction.abort();return;
   }
   const vehicles=incomingVehicles||oldVehicles.result;
   const parts=incomingInventory?.parts||oldParts.result;
   const categories=incomingInventory?.partCategories||oldCategories.result;
   const at=new Date().toISOString();
   apply(vehicleStore,oldVehicles.result,vehicles,'vehicle',at);
   apply(partStore,oldParts.result,parts,'part',at);
   apply(categoryStore,oldCategories.result,categories,null,at);
   info={revision:expected+1,at,count:vehicles.length,partsCount:parts.length,origin};
   metaStore.put(info,'main');
   const keys=transaction.objectStore('history').getAllKeys();
   keys.onsuccess=()=>{for(const key of keys.result.slice(0,-150))transaction.objectStore('history').delete(key);};
  };
  oldVehicles.onsuccess=finish;oldParts.onsuccess=finish;oldCategories.onsuccess=finish;meta.onsuccess=finish;
  transaction.oncomplete=()=>ok(info);
  transaction.onerror=()=>no(reason||transaction.error);
  transaction.onabort=()=>no(reason||transaction.error||Error('Zápis byl přerušen.'));
 });
}
async function load(){
 await ready;
 let current=await read();
 if(!current.info.revision){
  let raw;
  try{raw=localStorage.getItem(LEGACY)}
  catch{throw Error('Původní úložiště nelze přečíst. Nic nebylo přepsáno. Povolte úložiště pro tuto aplikaci.');}
  if(raw){
   let data;
   try{data=valid(JSON.parse(raw))}
   catch{throw Error('Původní evidence je poškozená. Nic nebylo smazáno. Stáhněte záchrannou zálohu.');}
   if(data.length){
    try{await write('vehicles',data,0,'legacy')}
    catch(e){if(!/jiném okně/.test(e.message||''))throw e;}
    current=await read();
   }
  }
 }
 return current;
}
async function history(){
 await ready;
 return new Promise((ok,no)=>{
  const transaction=db.transaction('history','readonly'),request=transaction.objectStore('history').getAll();
  transaction.oncomplete=()=>ok(request.result);
  transaction.onerror=()=>no(transaction.error);
 });
}
let channel;
try{channel=new BroadcastChannel('pila-stk-vehicles-v2')}catch{}
function notify(info){
 channel?.postMessage(info);
 try{localStorage.setItem('pila-stk-local-revision',JSON.stringify(info))}catch{}
}
if(channel)channel.onmessage=()=>window.dispatchEvent(new Event('stk-local-external'));
window.addEventListener('storage',event=>{if(event.key==='pila-stk-local-revision')window.dispatchEvent(new Event('stk-local-external'));});
window.STKLocal={
 load,read:async()=>{await ready;return read()},
 save:async(data,revision)=>{await ready;const info=await write('vehicles',data,revision);notify(info);return info;},
 saveInventory:async(data,revision)=>{await ready;const info=await write('inventory',data,revision);notify(info);return info;},
 saveAll:async(data,revision)=>{await ready;const info=await write('all',data,revision,'cloud');notify(info);return info;},
 history,valid,validInventory
};
})();

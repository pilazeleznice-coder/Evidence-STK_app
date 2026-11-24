const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sync=require('../sync-model.js');

const context={window:{addEventListener(){}},indexedDB:{open(){return {}}},BroadcastChannel:class{postMessage(){}},crypto:globalThis.crypto||require('node:crypto').webcrypto,structuredClone};
vm.runInNewContext(fs.readFileSync(require.resolve('../local-store.js'),'utf8'),context);
const inventory=context.window.STKLocal.validInventory;
function sample(){return {parts:[{id:'p1',name:'Řemen A',typeId:'type:belts',machineIds:['vehicle:v1','machine:m1'],spec:'SPA 1250',note:'',needed:2,stock:3,price:200,unit:'ks',status:'active',links:[{name:'Dodavatel',url:'https://example.com/'}],barcodes:['1234567890123'],photo:null,created:'2026-11-24T00:00:00Z'}],partCategories:[{id:'m1',kind:'machine',name:'Kompresor'}]};}
test('inventory keeps multiple machines, links and codes and rejects malformed records',()=>{
 const good=inventory(sample());assert.equal(good.parts[0].machineIds.length,2);assert.equal(good.parts[0].links[0].name,'Dodavatel');
 const bad=sample();bad.parts[0].stock=-1;assert.throws(()=>inventory(bad),/poškozený/);
 const duplicate=sample();duplicate.partCategories.push({...duplicate.partCategories[0]});assert.throws(()=>inventory(duplicate),/poškozená/);
});
test('inventory accepts fractional litres and keeps older records without a unit',()=>{
 const litres=sample();litres.parts[0].unit='l';litres.parts[0].stock=2.75;litres.parts[0].needed=0.5;
 const saved=inventory(litres);assert.equal(saved.parts[0].stock,2.75);assert.equal(saved.parts[0].unit,'l');
 const old=sample();delete old.parts[0].unit;assert.equal(inventory(old).parts[0].stock,3);
 for(const [unit,stock] of [['ks',2.5],['l',2.1234],['unknown',2]]){
  const invalid=sample();invalid.parts[0].unit=unit;invalid.parts[0].stock=stock;
  assert.throws(()=>inventory(invalid),/poškozený/);
 }
});
test('namespaced parts coexist with vehicles and resolve simultaneous edits',()=>{
 const state=sync.empty('owner'),vehicle={kind:'vehicle',id:'v1',payload:{id:'v1',name:'Traktor',spz:'A1'}},part={kind:'setting',id:'parts:part:p1',payload:sample().parts[0]},category={kind:'setting',id:'parts:category:m1',payload:sample().partCategories[0]};
 const records={[sync.key(vehicle.kind,vehicle.id)]:vehicle,[sync.key(part.kind,part.id)]:part,[sync.key(category.kind,category.id)]:category};
 let n=0;sync.capture(state,records,()=>String(++n));assert.equal(Object.keys(state.outbox).length,3);
 for(const [key,op] of Object.entries({...state.outbox}))sync.acknowledge(state,op,{...op,revision:n++});
 assert.equal(Object.keys(state.outbox).length,0);
 const partKey=sync.key(part.kind,part.id);records[partKey]={...part,payload:{...part.payload,stock:1}};sync.capture(state,records,()=>String(++n));
 const remote={...part,payload:{...part.payload,stock:9},revision:99,deleted:false};sync.receive(state,records,[remote]);assert.ok(state.conflicts[partKey]);
 assert.equal(records[sync.key(vehicle.kind,vehicle.id)].payload.name,'Traktor');
 sync.resolve(state,records,partKey,'remote',()=>String(++n));assert.equal(records[partKey].payload.stock,9);assert.equal(Object.keys(state.conflicts).length,0);
});

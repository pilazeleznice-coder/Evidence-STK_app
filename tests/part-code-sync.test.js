const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('STK produces the same CODE 128 image and eight-digit payload as Scanner-kode',()=>{
 const window={};vm.runInNewContext(read('barcode-128.js'),{window,crypto:globalThis.crypto});
 // SHA-256 of Scanner-kode's barcodeSvg('48271936') on the integration date.
 const svg=window.STKBarcode.svg('48271936');
 assert.equal(crypto.createHash('sha256').update(svg).digest('hex'),'63d2acf538313304505902d20b5947aedb5a96e920e66225d5897fe04e349769');
 assert.throws(()=>window.STKBarcode.svg('other'),/osm číslic/);
 assert.match(window.STKBarcode.randomCode(),/^\d{8}$/);
});

test('part code stores every form field as an owner-scoped scanner record',async()=>{
 let inserted;
 const db={from(table){assert.equal(table,'scanner_codes');return {
  select(){return {eq(){return {maybeSingle:async()=>({data:null,error:null})}}};},
  insert(row){inserted=row;return {select:async()=>({data:[{code:row.code}],error:null})};}
 };}};
 const window={STKBarcode:{svg:code=>'<svg>'+code+'</svg>',randomCode:()=> '12345678'},STKCloud:{client:db,scannerSession:async()=>({user:{id:'owner-1'}})}};
 vm.runInNewContext(read('part-code-sync.js'),{window,URL,Image:class{},document:{},Date});
 const part={id:'p1',scannerCode:'48271936',name:'Řemen',typeId:'type:belts',machineIds:['m1'],spec:'SPA 1250',note:'Zkontrolovat profil',needed:2,stock:4,price:210,unit:'ks',status:'active',links:[{name:'Dodavatel',url:'https://example.com'}],barcodes:['P-12'],photo:null,created:'2026-11-24T10:00:00Z'};
 assert.equal(await window.STKPartCodes.publish(part,[{id:'m1',kind:'machine',name:'Pila 1'}],[]),'48271936');
 assert.equal(inserted.owner_id,'owner-1');assert.equal(inserted.template_key,'part');
 assert.equal(inserted.part_data.name,'Řemen');assert.equal(inserted.part_data.type,'Řemeny');
 assert.deepEqual(Array.from(inserted.part_data.machines),['Pila 1']);
 assert.equal(inserted.part_data.spec,'SPA 1250');assert.equal(inserted.part_data.needed,2);
 assert.equal(inserted.part_data.stock,4);assert.equal(inserted.part_data.price,210);
 assert.equal(inserted.part_data.note,'Zkontrolovat profil');
 assert.equal(inserted.part_data.links[0].url,'https://example.com');
 assert.equal(inserted.part_data.barcodes[0],'P-12');
});

test('a pending local code clears its flag only after the scanner record is saved',async()=>{
 const part={id:'p1',scannerCode:'48271936',scannerPending:true,name:'Řemen'};
 let local={parts:[part],partCategories:[],vehicles:[]},attempts=0;
 const window={STKPartCodes:{publish:async()=>{attempts++;if(attempts===1)throw Error('offline');return '48271936';}},STKApp:{saveInventory:async data=>{local={...local,...data};return true;},storageSnapshot:async()=>local,notify(){}}};
 const document={addEventListener(){}};
 vm.runInNewContext(read('parts-module.js'),{window,document,structuredClone,navigator:{onLine:true},Intl,URL});
 window.STKParts.setSnapshot(local);
 await window.STKParts.publishPending();assert.equal(local.parts[0].scannerPending,true);
 await window.STKParts.publishPending();assert.equal(local.parts[0].scannerPending,false);
 assert.equal(attempts,2);
});

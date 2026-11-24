const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function moduleWithDom(){
 let dialog;
 const document={
  addEventListener(){},
  body:{append(){}},
  createElement(){
   dialog={innerHTML:'',open:false,scrollTop:0,dataset:{},setAttribute(){},addEventListener(){},showModal(){this.open=true;},querySelector(){return {focus(){}};}};
   return dialog;
  }
 };
 const window={};
 const code=fs.readFileSync(path.join(__dirname,'../parts-module.js'),'utf8');
 vm.runInNewContext(code,{document,window,structuredClone,Intl,URL,crypto:globalThis.crypto});
 const result={textContent:'',innerHTML:''},cards={innerHTML:''};
 const root={innerHTML:'',isConnected:false,querySelector(selector){return selector==='[data-parts-cards]'?cards:result;}};
 return {api:window.STKParts,root,cards,dialog:()=>dialog};
}

test('machine choices and filters use only categories added to the parts inventory',()=>{
 const ui=moduleWithDom();
 const vehicles=[{id:'v1',name:'Traktor STK',spz:'A1'}];
 const partCategories=[{id:'m1',kind:'machine',name:'Kompresor dílny'}];
 ui.api.setSnapshot({vehicles,partCategories,parts:[]});
 ui.api.render(ui.root);
 assert.match(ui.root.innerHTML,/Kompresor dílny/);
 assert.doesNotMatch(ui.root.innerHTML,/Traktor STK|vehicle:v1/);
 assert.match(ui.root.innerHTML,/samostatně přidaná zařízení/);
 ui.api.form();
 assert.match(ui.dialog().innerHTML,/Kompresor dílny/);
 assert.doesNotMatch(ui.dialog().innerHTML,/Traktor STK|vehicle:v1/);
});
test('litres remain selected and appear on the stock card',()=>{
 const ui=moduleWithDom();
 const part={id:'oil',name:'Hydraulický olej',typeId:'type:oils',machineIds:[],stock:2.75,needed:0.5,unit:'l',status:'active',links:[],barcodes:[]};
 ui.api.setSnapshot({parts:[part],partCategories:[],vehicles:[]});ui.api.render(ui.root);
 assert.match(ui.cards.innerHTML,/2,75 l/);assert.match(ui.cards.innerHTML,/0,5 l/);
 ui.api.form('oil');assert.match(ui.dialog().innerHTML,/<option value="l" selected>Litry \(l\)<\/option>/);
 assert.match(ui.dialog().innerHTML,/name="stock" value="2.75"[^>]*step="0.001"/);
});

test('an older vehicle link remains visible and selected only on its existing part',()=>{
 const ui=moduleWithDom();
 const part={id:'p1',name:'Řemen',typeId:'type:belts',machineIds:['vehicle:v1','m1'],stock:1,needed:1,status:'active',links:[],barcodes:[]};
 ui.api.setSnapshot({vehicles:[{id:'v1',name:'Traktor STK',spz:'A1'}],partCategories:[{id:'m1',kind:'machine',name:'Kompresor dílny'}],parts:[part]});
 ui.api.render(ui.root);
 assert.doesNotMatch(ui.root.innerHTML,/Traktor STK/);
 assert.match(ui.cards.innerHTML,/Původní vazba STK: Traktor STK/);
 ui.api.form('p1');
 assert.match(ui.dialog().innerHTML,/Starší přiřazení tohoto dílu/);
 assert.match(ui.dialog().innerHTML,/value="vehicle:v1" checked/);
});

/* Links a repair part to the existing eight-digit Scanner-kode catalogue. */
(function(){
'use strict';
const barcode=()=>window.STKBarcode;
const client=()=>window.STKCloud?.client;
const machineName=(id,categories,vehicles)=>categories.find(x=>x.kind==='machine'&&x.id===id)?.name||
 (id.startsWith('vehicle:')?vehicles.find(x=>'vehicle:'+x.id===id)?.name||'Původní vazba STK':'Dříve přiřazené zařízení');
async function smallPhoto(source){
 if(!source)return null;
 const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=source;});
 const scale=Math.min(1,360/Math.max(img.naturalWidth,img.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 const data=canvas.toDataURL('image/jpeg',.68);if(data.length>180000)throw Error('Náhled fotografie je pro evidenci kódů příliš velký.');return data;
}
async function snapshot(part,categories,vehicles){return {
 version:1,partId:part.id,name:part.name,type:categories.find(x=>x.kind==='type'&&x.id===part.typeId)?.name||({
  'type:pulleys':'Řemenice','type:belts':'Řemeny','type:pressure-switches':'Tlakové spínače',
  'type:bearings':'Ložiska','type:oils':'Oleje a maziva','type:filters':'Filtry'
 })[part.typeId]||'Nezařazeno',
 machines:part.machineIds.map(x=>machineName(x,categories,vehicles)),spec:part.spec||'',note:part.note||'',
 needed:part.needed,stock:part.stock,price:part.price,unit:part.unit||'ks',status:part.status,
 links:part.links.map(x=>({name:x.name,url:x.url})),barcodes:part.barcodes||[],
 photo:await smallPhoto(part.photo),created:part.created
};}
async function publish(part,categories,vehicles){
 if(!/^\d{8}$/.test(part.scannerCode||''))throw Error('Dílu chybí platný osmimístný kód.');
 const cloud=window.STKCloud,session=await cloud?.scannerSession();
 if(!session?.user?.id||!client())throw Error('Pro zápis do Evidence kódů se přihlaste v Nastavení STK.');
 const payload=await snapshot(part,categories,vehicles),db=client();let code=part.scannerCode;
 for(let attempt=0;attempt<8;attempt++){
  const found=await db.from('scanner_codes').select('code,template_key,part_data').eq('code',code).maybeSingle();
  if(found.error)throw found.error;
  const fields={label:part.name,note:part.note||'',barcode_svg:barcode().svg(code),part_data:payload,updated_at:new Date().toISOString()};
  if(found.data){
   if(found.data.template_key!=='part'||found.data.part_data?.partId!==part.id){code=barcode().randomCode();continue;}
   const updated=await db.from('scanner_codes').update(fields).eq('code',code).eq('owner_id',session.user.id).select('code');
   if(updated.error)throw updated.error;if(updated.data?.length!==1)throw Error('Kód se v evidenci nepodařilo aktualizovat.');return code;
  }
  const inserted=await db.from('scanner_codes').insert({code,owner_id:session.user.id,template_key:'part',validity_kind:'indefinite',...fields}).select('code');
  if(!inserted.error){if(inserted.data?.length!==1)throw Error('Evidence kódů nepotvrdila uložení.');return code;}
  if(!['23505','409'].includes(String(inserted.error.code))&&!/duplicate|unique/i.test(inserted.error.message||''))throw inserted.error;
  code=barcode().randomCode();
 }
 throw Error('Nepodařilo se vytvořit jedinečný kód. Zkuste akci opakovat.');
}
window.STKPartCodes={publish,snapshot};
})();

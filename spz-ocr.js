/* Camera frames and selected photos stay on this device. */
let stkOcrLibrary;
function loadStkOcr(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);if(stkOcrLibrary)return stkOcrLibrary;
  stkOcrLibrary=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';const timer=setTimeout(fail,30000);function fail(){clearTimeout(timer);script.remove();stkOcrLibrary=null;reject(Error('Čtečku nelze načíst. Zkontrolujte internet a zkuste to znovu.'));}script.onerror=fail;script.onload=()=>{clearTimeout(timer);window.Tesseract?resolve(window.Tesseract):fail();};document.head.append(script);});return stkOcrLibrary;
}
function stkPlateCandidates(text){
  const lines=String(text).toUpperCase().split(/[\r\n]+/).map(s=>s.replace(/[^A-Z0-9]/g,'')).filter(Boolean);
  const strip=s=>s.startsWith('CZ')&&s.length>8?s.slice(2):s;
  const valid=s=>s.length>=5&&s.length<=10&&/[0-9]/.test(s)&&/[A-Z]/.test(s);
  const joined=[];for(let i=0;i<lines.length-1;i++){const a=lines[i],b=lines[i+1];if(a.length>=2&&a.length<=4&&b.length>=2&&b.length<=6){const s=strip(a+b);if(valid(s))joined.push(s);}}
  return [...new Set([...joined,...lines.map(strip).filter(valid)])].slice(0,6);
}
function stkPlateStable(history,candidate,confidence){
  history.push(candidate||'');if(history.length>5)history.shift();
  if(!candidate)return false;
  const repeats=history.filter(v=>v===candidate).length;
  // OCR confidence can be zero with a character whitelist, even for a correct plate.
  // Low-confidence results require more independent frames, rather than being ignored.
  return repeats >= (Number(confidence)>=55?3:4);
}
function stkVideoCrop(videoRect,guideRect,width,height){
  const scale=Math.max(videoRect.width/width,videoRect.height/height);
  const ox=(width*scale-videoRect.width)/2,oy=(height*scale-videoRect.height)/2;
  return {x:Math.max(0,(guideRect.left-videoRect.left+ox)/scale),y:Math.max(0,(guideRect.top-videoRect.top+oy)/scale),w:Math.min(width,guideRect.width/scale),h:Math.min(height,guideRect.height/scale)};
}
function stkCanvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;}
// Find a connected light/yellow plate region; prefer yellow over surrounding white objects.
function stkFindPlate(source){
  const scale=Math.min(1,400/source.width),small=stkCanvas(source.width*scale,source.height*scale),ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,small.width,small.height);const {data}=ctx.getImageData(0,0,small.width,small.height),w=small.width,h=small.height,mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);
  for(let i=0;i<mask.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];const yellow=r>95&&g>85&&b<Math.min(r,g)*.77&&r<g*1.9;const white=Math.min(r,g,b)>135&&Math.max(r,g,b)-Math.min(r,g,b)<55;mask[i]=yellow?2:white?1:0;}
  let best=null;const queue=new Int32Array(w*h);
  for(let start=0;start<mask.length;start++){if(!mask[start]||seen[start])continue;let head=0,tail=1;queue[0]=start;seen[start]=1;let count=0,yellow=0,minx=w,maxx=0,miny=h,maxy=0;let tl,tr,bl,br,ms=Infinity,xs=-Infinity,md=Infinity,xd=-Infinity;
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);count++;yellow+=mask[p]===2;minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);if(x+y<ms){ms=x+y;tl={x,y};}if(x+y>xs){xs=x+y;br={x,y};}if(x-y<md){md=x-y;bl={x,y};}if(x-y>xd){xd=x-y;tr={x,y};}for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}}
    const bw=maxx-minx+1,bh=maxy-miny+1,ratio=bw/bh,fill=count/(bw*bh);if(bw<22||bh<9||ratio<.85||ratio>6.6||fill<.42||bw*bh>w*h*.88)continue;const score=count*(yellow/count>.3?5:1);if(!best||score>best.score)best={score,corners:[tl,tr,br,bl].map(p=>({x:p.x/scale,y:p.y/scale})),yellow:yellow/count>.3};
  }return best;
}
function stkPreparePlate(source, detect=true, contrast=true){
  const found=detect?stkFindPlate(source):null;let out;
  if(found){const [tl,tr,br,bl]=found.corners,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),width=(dist(tl,tr)+dist(bl,br))/2,height=(dist(tl,bl)+dist(tr,br))/2;if(width<10||height<10)return source;out=stkCanvas(960,Math.min(1000,960*height/width));const src=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height),ctx=out.getContext('2d'),dest=ctx.createImageData(out.width,out.height);for(let y=0;y<out.height;y++){const v=y/(out.height-1);for(let x=0;x<out.width;x++){const u=x/(out.width-1),sx=Math.max(0,Math.min(source.width-1,Math.round((1-u)*(1-v)*tl.x+u*(1-v)*tr.x+u*v*br.x+(1-u)*v*bl.x))),sy=Math.max(0,Math.min(source.height-1,Math.round((1-u)*(1-v)*tl.y+u*(1-v)*tr.y+u*v*br.y+(1-u)*v*bl.y))),a=(sy*source.width+sx)*4,b=(y*out.width+x)*4;dest.data[b]=src.data[a];dest.data[b+1]=src.data[a+1];dest.data[b+2]=src.data[a+2];dest.data[b+3]=255;}}ctx.putImageData(dest,0,0);
  }else{const factor=Math.min(3,1400/source.width);out=stkCanvas(source.width*factor,Math.min(1800,source.height*factor));out.getContext('2d').drawImage(source,0,0,out.width,out.height);}
  if(contrast){const ctx=out.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,out.width,out.height);for(let i=0;i<pixels.data.length;i+=4){const gray=(pixels.data[i]*.5+pixels.data[i+1]*.5-110)*1.7+128;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=Math.max(0,Math.min(255,gray));}ctx.putImageData(pixels,0,0);}out.stkYellow=!!found?.yellow;return out;
}
function stkSplitPlateRows(plate){
  const boxes=plate.stkYellow?[[.10,.04,.66,.47],[.125,.49,.825,.475]]:[[.04,.025,.92,.47],[.04,.50,.92,.475]];
  return boxes.map(([x,y,w,h])=>{const out=stkCanvas(690,310),ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(plate,plate.width*x,plate.height*y,plate.width*w,plate.height*h,35,25,620,260);return out;});
}
function bindSpzScanner(host,plateInput){
  host.innerHTML=`<div class="spz-box"><div class="spz-buttons"><button type="button" class="btn light" data-live>📷 Spustit živou čtečku</button><button type="button" class="btn light" data-gallery>Vybrat fotku</button><button type="button" class="btn light" data-camera>Vyfotit SPZ</button></div><input type="file" accept="image/*" capture="environment" data-camera-file hidden><input type="file" accept="image/*" data-gallery-file hidden><p class="spz-help">Namiřte značku do rámečku a držte telefon klidně. Po opakovaném přečtení se SPZ doplní. Nalezený text můžete také rovnou potvrdit.</p><label class="spz-layout">Tvar značky<select data-layout><option value="auto">Automaticky · jeden i dva řádky</option><option value="single">Dlouhá · jeden řádek</option><option value="double">Čtvercová · dva řádky</option></select></label><div data-live-panel hidden><div class="spz-video-wrap"><video autoplay playsinline muted data-video></video><div class="spz-guide" aria-hidden="true"></div></div><div class="spz-buttons"><button type="button" class="btn light" data-stop>Zastavit kameru</button><button type="button" class="btn light" data-torch hidden>Zapnout světlo</button></div></div><div data-editor hidden><p class="spz-help">Čtečka zkusí najít značku sama. Pokud se jí to nepovede, označte SPZ tažením prstu nebo myši.</p><canvas data-preview aria-label="Fotografie pro výběr SPZ" class="spz-preview"></canvas><div class="spz-buttons"><button type="button" class="btn" data-read>Rozpoznat SPZ z fotky</button><button type="button" class="btn light" data-reset>Celá fotka</button><button type="button" class="btn light" data-hide>Zavřít fotku</button></div></div><p data-status role="status" aria-live="polite" class="spz-help"></p><div data-result hidden><label>Zkontrolujte rozpoznanou SPZ<input data-value type="text" autocapitalize="characters" maxlength="20"></label><div data-candidates class="spz-buttons"></div><button type="button" class="btn" data-use>Použít SPZ</button></div></div>`;
  const dialog=host.closest('dialog'),panel=document.createElement('dialog');
  panel.className='spz-dialog';panel.setAttribute('aria-label','Čtečka SPZ');
  panel.innerHTML='<div class="spz-modalhead"><h2>Čtečka SPZ</h2><button type="button" class="close" data-close aria-label="Zavřít čtečku">×</button></div>'+host.innerHTML;
  host.replaceChildren();host.hidden=true;document.body.append(panel);
  const q=s=>panel.querySelector(s),canvas=q('[data-preview]'),ctx=canvas.getContext('2d'),status=q('[data-status]'),result=q('[data-result]'),video=q('[data-video]');
  const row=document.createElement('span');row.className='spz-inputrow';plateInput.parentNode.insertBefore(row,plateInput);row.append(plateInput);
  const camera=document.createElement('button');camera.type='button';camera.className='spz-inputcamera';camera.title='Načíst SPZ fotoaparátem';camera.setAttribute('aria-label','Načíst SPZ fotoaparátem');camera.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5l2-2h4l2 2h4a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';row.append(camera);plateInput.setAttribute('aria-label','SPZ');
  camera.onclick=e=>{e.preventDefault();plateInput.blur();if(!panel.open)panel.showModal();q('[data-live]').click();};
  q('[data-close]').onclick=()=>panel.close();panel.addEventListener('close',()=>stop());

  let photo,selection,anchor,worker,stream,loopTimer,requestTimer,disposed=false,mode='idle',generation=0,history=[],torch=false,frames=0;
  function message(text){if(!disposed)status.textContent=text;}
  function terminate(){const old=worker;worker=null;if(old)old.terminate().catch(()=>{});}
  function stop(reason=''){generation++;mode='idle';clearTimeout(loopTimer);clearTimeout(requestTimer);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}video.pause();video.srcObject=null;torch=false;q('[data-live-panel]').hidden=true;q('[data-torch]').hidden=true;terminate();setBusy(false);if(reason)message(reason);}
  function cleanup(){disposed=true;stop();photo=null;observer.disconnect();dialog?.removeEventListener('close',cleanup);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',cleanup);panel.remove();}
  const observer=new MutationObserver(()=>{if(!host.isConnected)cleanup();});observer.observe(dialog||document.body,{childList:true,subtree:true});dialog?.addEventListener('close',cleanup);window.addEventListener('pagehide',cleanup);
  function visibility(){if(document.hidden&&mode==='live')stop('Kamera se při přepnutí aplikace vypnula. Pro pokračování spusťte čtečku znovu.');}document.addEventListener('visibilitychange',visibility);
  function setBusy(b){q('[data-read]').disabled=b;q('[data-reset]').disabled=b;q('[data-hide]').disabled=b;q('[data-gallery]').disabled=b;q('[data-camera]').disabled=b;q('[data-live]').disabled=b;}
  async function engine(token){if(worker)return worker;const T=await loadStkOcr();if(disposed||token!==generation)throw Error('Čtení ukončeno.');const created=await T.createWorker('eng',1,{logger:m=>{if(disposed||token!==generation)return;if(m.status.includes('loading')||m.status.includes('initializ'))message('Načítám čtečku… '+Math.round((m.progress||0)*100)+' %');}});if(disposed||token!==generation){await created.terminate();throw Error('Čtení ukončeno.');}worker=created;return worker;}
  async function recognize(source,token,detect=true){const work=await engine(token);await work.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',tessedit_pageseg_mode:q('[data-layout]').value==='single'?'7':'6'});if(disposed||token!==generation)throw Error('Čtení ukončeno.');const prepared=stkPreparePlate(source,detect);
    if(q('[data-layout]').value!=='single'&&prepared.width/prepared.height<2.3){
      await work.setParameters({tessedit_pageseg_mode:'7'});const rows=[];
      for(const row of stkSplitPlateRows(prepared)){if(disposed||token!==generation)throw Error('Čtení ukončeno.');rows.push((await work.recognize(row)).data);}
      const text=rows.map(r=>r.text.trim()).join('\n');if(stkPlateCandidates(text).length)return {data:{text,confidence:Math.min(...rows.map(r=>r.confidence))}};
      await work.setParameters({tessedit_pageseg_mode:'6'});
    }
    return work.recognize(prepared);}
  function withTimeout(job,token){return Promise.race([job,new Promise((_,reject)=>{requestTimer=setTimeout(()=>{if(token===generation){stop('Čtečka nereaguje. Zkontrolujte internet a spusťte ji znovu.');reject(Error('Čtečka nereaguje. Zkontrolujte internet a spusťte ji znovu.'));}},60000);})]).finally(()=>clearTimeout(requestTimer));}
  function apply(value,automatic=false){plateInput.value=value;plateInput.dispatchEvent(new Event('input',{bubbles:true}));result.hidden=true;q('[data-editor]').hidden=true;stop();message(automatic?'SPZ automaticky načtena. Zkontrolujte ji před uložením.':'SPZ doplněna. Zkontrolujte ji před uložením.');if(panel.open)panel.close();plateInput.focus();toast('SPZ doplněna: '+value);}
  function showResult(candidates){result.hidden=false;q('[data-value]').value=candidates[0]||'';const list=q('[data-candidates]');list.replaceChildren();candidates.forEach(value=>{const b=document.createElement('button');b.type='button';b.className='btn light';b.textContent=value;b.onclick=()=>q('[data-value]').value=value;list.append(b);});}
  function guide(){const layout=q('[data-layout]').value;q('.spz-guide').style.aspectRatio=layout==='single'?'4.5':layout==='double'?'1.35':'2';}
  q('[data-layout]').onchange=()=>{history=[];guide();};guide();
  function frame(){const crop=stkVideoCrop(video.getBoundingClientRect(),q('.spz-guide').getBoundingClientRect(),video.videoWidth,video.videoHeight);const factor=Math.min(1,1400/crop.w),out=stkCanvas(crop.w*factor,crop.h*factor);out.getContext('2d').drawImage(video,crop.x,crop.y,crop.w,crop.h,0,0,out.width,out.height);return out;}
  async function tick(token){
    if(disposed||mode!=='live'||token!==generation)return;
    if(!video.videoWidth||video.readyState<2){loopTimer=setTimeout(()=>tick(token),300);return;}
    try{
      const output=await withTimeout(recognize(frame(),token,true),token);
      if(disposed||mode!=='live'||token!==generation)return;
      frames++;const candidates=stkPlateCandidates(output.data.text),candidate=candidates[0];
      if(stkPlateStable(history,candidate,output.data.confidence)){apply(candidate,true);return;}
      if(candidate){
        showResult(candidates);const count=history.filter(v=>v===candidate).length;
        message('Vidím '+candidate+' · ověřuji opakovaným čtením ('+count+'). Můžete také zvolit Použít SPZ.');
      }else message('Hledám SPZ… Přibližte ji do rámečku nebo přepněte tvar značky.');
    }catch(e){if(token===generation){stop();message(e.message||'Živé čtení se nezdařilo. Zkuste fotografii.');}return;}
    if(mode==='live'&&token===generation)loopTimer=setTimeout(()=>tick(token),250);
  }
  q('[data-live]').onclick=async()=>{stop();if(!navigator.mediaDevices?.getUserMedia){message('Živá kamera není v tomto prohlížeči dostupná. Otevřete aplikaci přes HTTPS v Chromu, nebo použijte fotografii.');return;}const token=++generation;mode='starting';message('Povoluji fotoaparát…');requestTimer=setTimeout(()=>{if(token===generation)stop('Fotoaparát se nespustil. Zkontrolujte jeho oprávnění a zkuste to znovu.');},30000);try{const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});clearTimeout(requestTimer);if(disposed||token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;video.srcObject=stream;q('[data-live-panel]').hidden=false;q('[data-editor]').hidden=true;result.hidden=true;await video.play();if(disposed||token!==generation)return;mode='live';history=[];frames=0;setBusy(true);q('[data-live]').disabled=false;q('[data-gallery]').disabled=false;q('[data-camera]').disabled=false;q('[data-live]').textContent='Restartovat kameru';const track=stream.getVideoTracks()[0];track.onended=()=>{if(mode==='live')stop('Fotoaparát byl odpojen. Spusťte čtečku znovu.');};q('[data-torch]').hidden=!track.getCapabilities?.().torch;message('Připravuji čtečku… Při prvním spuštění se stahují podklady.');q('[data-live-panel]').scrollIntoView({block:'nearest'});tick(token);}catch(e){if(token===generation){stop();const reasons={NotAllowedError:'Přístup ke kameře je zamítnutý. Povolte fotoaparát pro tuto stránku, nebo vyberte fotografii.',NotFoundError:'Fotoaparát nebyl nalezen. Použijte fotografii.',NotReadableError:'Fotoaparát používá jiná aplikace. Zavřete ji a zkuste to znovu.'};message(reasons[e.name]||'Fotoaparát nelze spustit. Zkuste fotografii nebo jiný prohlížeč.');}}};
  q('[data-stop]').onclick=()=>stop('Živá čtečka zastavena.');q('[data-torch]').onclick=async()=>{try{const track=stream?.getVideoTracks()[0];if(!track)return;await track.applyConstraints({advanced:[{torch:!torch}]});torch=!torch;q('[data-torch]').textContent=torch?'Vypnout světlo':'Zapnout světlo';}catch{message('Světlo na tomto zařízení nelze zapnout.');}};
  function draw(){if(!photo)return;ctx.drawImage(photo,0,0,canvas.width,canvas.height);if(selection){const{x,y,w,h}=selection;ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(photo,x,y,w,h,x,y,w,h);ctx.strokeStyle='#70e09c';ctx.lineWidth=3;ctx.strokeRect(x,y,w,h);}}
  function point(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};}canvas.onpointerdown=e=>{if(mode==='photo'||!photo)return;anchor=point(e);canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!anchor)return;const p=point(e);selection={x:Math.min(p.x,anchor.x),y:Math.min(p.y,anchor.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y)};draw();};canvas.onpointerup=canvas.onpointercancel=()=>{anchor=null;if(selection&&(selection.w<10||selection.h<10))selection=null;draw();};
  q('[data-reset]').onclick=()=>{selection=null;draw();};q('[data-hide]').onclick=()=>{stop();q('[data-editor]').hidden=true;photo=null;};q('[data-camera]').onclick=()=>q('[data-camera-file]').click();q('[data-gallery]').onclick=()=>q('[data-gallery-file]').click();
  async function selectPhoto(e){const file=e.target.files[0];e.target.value='';if(!file)return;stop();if(file.size>20000000){toast('Zvolte fotografii do 20 MB.');return;}const token=generation,url=URL.createObjectURL(file),image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});if(disposed||token!==generation)return;const scale=Math.min(1,2200/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);photo=stkCanvas(canvas.width,canvas.height);photo.getContext('2d').drawImage(image,0,0,photo.width,photo.height);selection=null;result.hidden=true;q('[data-editor]').hidden=false;draw();message('Fotografie je připravená. Spusťte rozpoznání, případně označte jen značku.');}catch{toast('Fotografii nelze otevřít. Zkuste JPEG nebo PNG.');}finally{URL.revokeObjectURL(url);}}
  q('[data-camera-file]').onchange=selectPhoto;q('[data-gallery-file]').onchange=selectPhoto;
  q('[data-read]').onclick=async()=>{if(!photo||mode!=='idle'||disposed)return;mode='photo';const token=++generation;setBusy(true);result.hidden=true;message('Rozpoznávám značku…');try{let source=photo;if(selection){source=stkCanvas(selection.w,selection.h);source.getContext('2d').drawImage(photo,selection.x,selection.y,selection.w,selection.h,0,0,source.width,source.height);}const output=await withTimeout(recognize(source,token,true),token);if(disposed||token!==generation)return;const candidates=stkPlateCandidates(output.data.text);showResult(candidates);message(candidates.length?'Zkontrolujte rozpoznanou SPZ. O a 0 nebo I a 1 se mohou zaměnit.':'Značku se nepodařilo přečíst. Označte výřez značky nebo použijte ostřejší fotografii.');}catch(e){if(!disposed)message(e.message||'Čtení se nezdařilo.');}finally{if(token===generation){mode='idle';setBusy(false);terminate();}}};
  q('[data-use]').onclick=()=>{const value=q('[data-value]').value.toUpperCase().replace(/[^A-Z0-9 -]/g,'').trim();if(!value){toast('Nejdřív vyplňte SPZ.');return;}apply(value);};
}

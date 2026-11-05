/* SPZ recognition runs locally in a worker; images are never uploaded. */
let stkOcrLibrary;
function loadStkOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (stkOcrLibrary) return stkOcrLibrary;
  stkOcrLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    const timer = setTimeout(() => fail(), 30000);
    function fail() { clearTimeout(timer); script.remove(); stkOcrLibrary = null; reject(new Error('OCR se nepodařilo načíst. Zkontrolujte internet a zkuste to znovu.')); }
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); window.Tesseract ? resolve(window.Tesseract) : fail(); };
    document.head.append(script);
  });
  return stkOcrLibrary;
}
function stkPlateCandidates(text) {
  const lines = text.toUpperCase().split(/[\r\n]+/).map(s => s.replace(/[^A-Z0-9]/g, ''));
  return [...new Set(lines.flatMap(s => {
    const clean = s.startsWith('CZ') && s.length > 8 ? s.slice(2) : s;
    return clean.length >= 5 && clean.length <= 9 && /[0-9]/.test(clean) ? [clean] : [];
  }))].slice(0, 6);
}
function bindSpzScanner(host, plateInput) {
  host.innerHTML = `<div style="padding:12px;border:1px solid #dce5dc;border-radius:10px;background:#f4f6f1">
    <button type="button" class="btn light" data-camera>📷 Načíst SPZ foťákem</button>
    <button type="button" class="btn light" data-gallery style="margin-top:5px">Vybrat fotku</button>
    <input type="file" accept="image/*" capture="environment" data-camera-file hidden>
    <input type="file" accept="image/*" data-gallery-file hidden>
    <p style="font-size:12px;margin:8px 0 0">Vyfoťte značku zblízka a rovně. Rozpoznání probíhá v zařízení; pro načtení čtečky je potřeba internet.</p>
    <section data-editor hidden style="margin-top:12px">
      <p style="font-size:12px">Tažením prstu nebo myši označte pouze SPZ (bez modrého proužku CZ). Potom spusťte rozpoznání.</p>
      <canvas data-preview aria-label="Fotografie pro výběr SPZ" style="width:100%;display:block;touch-action:none;border-radius:6px"></canvas>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn" data-read>Rozpoznat SPZ</button><button type="button" class="btn light" data-reset>Celá fotka</button><button type="button" class="btn light" data-hide>Zavřít čtečku</button></div>
      <p data-status role="status" aria-live="polite" style="font-size:12px"></p>
      <div data-result hidden><label>Zkontrolujte rozpoznanou SPZ<input data-value type="text" autocapitalize="characters" maxlength="20"></label><div data-candidates style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px"></div><button type="button" class="btn" data-use style="margin-top:8px">Použít SPZ</button></div>
    </section></div>`;
  const q = s => host.querySelector(s), canvas = q('[data-preview]'), ctx = canvas.getContext('2d');
  let photo, selection, anchor, busy = false, disposed = false, worker;
  const editor = q('[data-editor]'), status = q('[data-status]'), result = q('[data-result]');
  const dialog = host.closest('dialog');
  const observer = new MutationObserver(() => { if (!host.isConnected) cleanup(); });
  observer.observe(dialog || document.body, { childList: true, subtree: true });
  function cleanup() { disposed = true; photo = null; if (worker) { worker.terminate().catch(() => {}); worker = null; } observer.disconnect(); dialog?.removeEventListener('close', cleanup); }
  dialog?.addEventListener('close', cleanup);
  function draw() {
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    if (selection) { const {x,y,w,h} = selection; ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(photo,x,y,w,h,x,y,w,h);ctx.strokeStyle='#70e09c';ctx.lineWidth=3;ctx.strokeRect(x,y,w,h); }
  }
  function point(e) { const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))}; }
  canvas.onpointerdown = e => { if(busy||!photo)return;anchor=point(e);canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => { if(!anchor)return;const p=point(e);selection={x:Math.min(p.x,anchor.x),y:Math.min(p.y,anchor.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y)};draw(); };
  canvas.onpointerup = canvas.onpointercancel = () => { anchor=null;if(selection&&(selection.w<10||selection.h<10))selection=null;draw(); };
  q('[data-reset]').onclick=()=>{if(!busy&&photo){selection=null;draw();}};
  q('[data-hide]').onclick=()=>{if(!busy){editor.hidden=true;photo=null;canvas.width=1;}};
  q('[data-camera]').onclick=()=>{if(!busy)q('[data-camera-file]').click();};
  q('[data-gallery]').onclick=()=>{if(!busy)q('[data-gallery-file]').click();};
  async function selectPhoto(e) {
    const file=e.target.files[0];e.target.value='';if(!file||busy)return;
    if(file.size>20000000){toast('Zvolte fotografii do 20 MB.');return;}
    const url=URL.createObjectURL(file);const image=new Image();
    try { await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});if(disposed)return;
      const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
      photo=document.createElement('canvas');photo.width=canvas.width;photo.height=canvas.height;photo.getContext('2d').drawImage(image,0,0,photo.width,photo.height);
      selection=null;result.hidden=true;status.textContent='Označte SPZ nebo použijte celou fotku.';editor.hidden=false;draw();
    }catch{toast('Fotografii nelze otevřít. Zkuste JPEG nebo PNG.');}finally{URL.revokeObjectURL(url);}
  }
  q('[data-camera-file]').onchange=selectPhoto;q('[data-gallery-file]').onchange=selectPhoto;
  q('[data-read]').onclick=async()=>{
    if(busy||!photo||disposed)return;
    busy=true;result.hidden=true;q('[data-read]').disabled=true;
    host.querySelectorAll('[data-camera],[data-gallery],[data-reset],[data-hide]').forEach(b=>b.disabled=true);
    status.textContent='Načítám čtečku SPZ…';
    let timeout, active = true;
    try {
      const T=await loadStkOcr();if(disposed)return;
      const crop=selection||{x:0,y:0,w:canvas.width,h:canvas.height};
      const input=document.createElement('canvas'),scale=Math.min(3,1800/crop.w);input.width=Math.round(crop.w*scale);input.height=Math.round(crop.h*scale);
      const context=input.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,input.width,input.height);context.drawImage(photo,crop.x,crop.y,crop.w,crop.h,0,0,input.width,input.height);
      const job=async()=>{
        const created=await T.createWorker('eng',1,{logger:m=>{if(!disposed)status.textContent=m.status==='recognizing text'?`Čtu SPZ… ${Math.round(m.progress*100)} %`:'Připravuji rozpoznávání…';}});
        if(disposed||!active){await created.terminate();throw Error('Čtení ukončeno.');}worker=created;
        await worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',tessedit_pageseg_mode:'7'});
        return worker.recognize(input);
      };
      const output=await Promise.race([job(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Čtení trvalo příliš dlouho. Zkuste menší výřez a ověřte internet.')),90000);})]);
      if(disposed)return;
      const candidates=stkPlateCandidates(output.data.text);
      result.hidden=false;q('[data-value]').value=candidates[0]||'';
      const buttons=q('[data-candidates]');buttons.replaceChildren();
      candidates.forEach(value=>{const b=document.createElement('button');b.type='button';b.className='btn light';b.textContent=value;b.onclick=()=>q('[data-value]').value=value;buttons.append(b);});
      status.textContent=candidates.length?'Výsledek zkontrolujte a případně opravte. Písmena a číslice se mohou zaměnit.':'SPZ se nepodařilo spolehlivě přečíst. Upravte výřez, vyfoťte značku znovu nebo ji zadejte ručně.';
    }catch(e){if(!disposed)status.textContent=e.message||'Rozpoznání se nezdařilo. Zkuste to znovu nebo SPZ zadejte ručně.';}
    finally{active=false;clearTimeout(timeout);busy=false;if(worker){worker.terminate().catch(()=>{});worker=null;}if(!disposed){q('[data-read]').disabled=false;host.querySelectorAll('[data-camera],[data-gallery],[data-reset],[data-hide]').forEach(b=>b.disabled=false);}}
  };
  q('[data-use]').onclick=()=>{const value=q('[data-value]').value.toUpperCase().replace(/[^A-Z0-9 -]/g,'').trim();if(!value){toast('Nejdřív vyplňte SPZ.');return;}plateInput.value=value;plateInput.dispatchEvent(new Event('input',{bubbles:true}));editor.hidden=true;plateInput.focus();toast('SPZ doplněna. Před uložením ji zkontrolujte.');};
}

/* Local searchable copy of VehiclesDB; see THIRD_PARTY.md. */
let stkCatalogPromise;
const stkFold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function stkCatalog() {
  if (!stkCatalogPromise) stkCatalogPromise = fetch('./vehicle-catalog.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => {
    const makes = new Map(data.makes.map(m => [m[0], {slug:m[0],name:m[1],logo:m[2]}]));
    const records = data.models.map(m => ({...makes.get(m[0]),model:m[1],kind:m[2],key:stkFold(makes.get(m[0]).name+' '+m[1])}));
    return {makes,records};
  }).catch(e=>{stkCatalogPromise=null;throw e;});
  return stkCatalogPromise;
}
function stkSearchModels(records, query, type) {
  const terms=stkFold(query).split(/\s+/).filter(Boolean);if(!terms.length)return [];
  const kinds=type==='Motorka'?['motorcycle','moped']:type==='Auto'?['car','van','truck','bus']:null;
  const seen=new Set();return records.filter(r=>(!kinds||kinds.includes(r.kind))&&terms.every(t=>r.key.includes(t))).filter(r=>{if(seen.has(r.key))return false;seen.add(r.key);return true;})
    .sort((a,b)=>Number(b.key.startsWith(stkFold(query)))-Number(a.key.startsWith(stkFold(query)))||a.key.localeCompare(b.key)).slice(0,12);
}
function stkBrandBadge(x) {
  const name=x.make||'',url=x.makeLogo||'';
  if(!name)return '';
  // Only catalogue-owned logo origins are accepted, never arbitrary imported HTML/URLs.
  const safe=/^https:\/\/raw\.githubusercontent\.com\/filippofilip95\/car-logos-dataset\/master\/logos\/thumb\/[a-z0-9-]+\.png$/.test(url);
  return `<span class="manufacturer">${safe?`<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">`:''}<span>${esc(name)}</span></span>`;
}
function bindVehicleCatalog(form, existing) {
  const input=form.querySelector('[name=name]'),type=form.querySelector('[name=type]');
  const host=document.createElement('div');host.className='catalog-host';input.parentNode.append(host);
  host.innerHTML='<div class="catalog-choices" role="listbox" aria-label="Nalezené značky a modely" hidden></div><p class="catalog-help" aria-live="polite">Pište značku nebo model, například Mitsubishi L200. Název můžete zadat i ručně.</p><p class="catalog-help">Katalog: <a href="https://vehiclesdb.com" target="_blank" rel="noopener noreferrer">Vehicle data by VehiclesDB</a> · <a href="THIRD_PARTY.md" target="_blank" rel="noopener">Zdroje a licence</a></p><div class="catalog-selected"></div>';
  const list=host.querySelector('.catalog-choices'),help=host.querySelector('.catalog-help'),selected=host.querySelector('.catalog-selected');
  let chosen=existing.make?{make:existing.make,model:existing.model||'',makeSlug:existing.makeSlug||'',makeLogo:existing.makeLogo||'',catalogName:existing.catalogName||existing.name}:null;
  let timer,sequence=0,active=-1;
  const refreshSelected=()=>{selected.innerHTML=chosen?stkBrandBadge(chosen):'';};refreshSelected();
  input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;}
  function choose(r){input.value=r.name+' '+r.model;chosen={make:r.name,model:r.model,makeSlug:r.slug,makeLogo:r.logo||'',catalogName:input.value};refreshSelected();close();help.textContent='Vybraný model z katalogu. Motorizaci nebo vlastní označení můžete připsat do názvu.';input.focus();}
  async function search(){const seq=++sequence,q=input.value.trim();if(chosen&&!stkFold(q).startsWith(stkFold(chosen.catalogName))){chosen=null;refreshSelected();}if(q.length<2){close();return;}help.textContent='Hledám v katalogu vozidel…';try{const data=await stkCatalog();if(seq!==sequence||!host.isConnected)return;const rows=stkSearchModels(data.records,q,type.value);list.replaceChildren();rows.forEach((r,i)=>{const b=document.createElement('button');b.type='button';b.className='catalog-option';b.setAttribute('role','option');b.tabIndex=-1;b.innerHTML=stkBrandBadge({make:r.name,makeLogo:r.logo})+'<span>'+esc(r.model)+'</span>';b.onpointerdown=e=>e.preventDefault();b.onclick=()=>choose(r);list.append(b);});list.hidden=!rows.length;input.setAttribute('aria-expanded',String(!!rows.length));active=-1;help.textContent=rows.length?'Vyberte značku a model. Název lze upravit.':'V katalogu není shoda. Zadejte vlastní název; uložit lze i traktor, vlek nebo pracovní stroj.';}catch{close();help.textContent='Katalog teď není dostupný. Název můžete zadat ručně.';}}
  input.addEventListener('input',()=>{clearTimeout(timer);sequence++;timer=setTimeout(search,180);});type.addEventListener('change',search);
  input.addEventListener('keydown',e=>{const bs=[...list.children];if(list.hidden||!bs.length)return;if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length;bs.forEach((b,i)=>b.classList.toggle('focused',i===active));bs[active].scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&active>=0){e.preventDefault();bs[active].click();}});
  input.addEventListener('blur',()=>setTimeout(()=>{if(host.isConnected)close();},150));
  // Recheck synchronously on submit, including an edit followed immediately by Save.
  return ()=>chosen&&stkFold(input.value).startsWith(stkFold(chosen.catalogName))?{...chosen}:{make:'',model:'',makeSlug:'',makeLogo:'',catalogName:''};
}

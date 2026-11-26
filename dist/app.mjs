import {StreamBimSource,withTimeout,sourceFilesForObject} from './streambim.mjs';
import {ifcGuid} from './ifc.mjs';
import {connectEmbedded} from './embedded-connection.mjs';
import {fileViews,objectViews} from './info-view.mjs';
const $=id=>document.getElementById(id);
const state={source:null,files:[],tree:[],selected:null,metadata:new Map(),epoch:0,pick:0,selection:0,connected:false,rawObject:null};
const worker=new Worker(new URL('./ifc-worker.mjs',import.meta.url),{type:'module'});
const pending=new Map();let nextJob=0;
worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);data.error?job.reject(new Error(data.error)):job.resolve(data.result);};
worker.onerror=()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error('IFC-leseren stoppet. Oppdater widgeten og prøv igjen.'));}pending.clear();};
function work(action,key,text,guid){return new Promise((resolve,reject)=>{const id=++nextJob;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('IFC-lesingen tok for lang tid.'));},120000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,action,key,text,guid});});}
function el(tag,content,className){const e=document.createElement(tag);if(content!==undefined)e.textContent=content;if(className)e.className=className;return e;}
function message(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function errorText(error){return error?.message||error?.detail||error?.code||'Ukjent feil fra StreamBIM';}
function pretty(value){if(value===null||value===undefined||value===''||(Array.isArray(value)&&value.every(v=>v===null||v==='')))return 'Ikke angitt i kilden';return Array.isArray(value)&&value.every(v=>typeof v==='string')?value.join('\n'):typeof value==='object'?JSON.stringify(value,null,2):String(value);}
function kv(values){const dl=el('dl',undefined,'kv');for(const [key,value] of Object.entries(values)){const row=el('div',undefined,'kv-row');row.append(el('dt',key),el('dd',pretty(value),value===null||value===undefined||value===''?'missing':''));dl.append(row);}return dl;}
const infoNavigation={};let infoId=0;
function hierarchy(paths){const box=el('div',undefined,'location-tree');for(const path of paths){const list=el('ol',undefined,'hierarchy');for(const node of path.nodes){const li=el('li');li.append(el('span',node.type,'node-type'),el('span',node.name,'node-name'));list.append(li);}box.append(list);if(path.warning)box.append(el('p',path.warning,'small'));}return box;}
function infoBrowser(groups,scope){
  const box=el('div',undefined,'info-browser'),nav=el('div',undefined,'info-tabs'),content=el('div',undefined,'info-content');
  const id=`info-${++infoId}`;nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Informasjonsgruppe');
  const saved=infoNavigation[scope]||{};let active=groups.find(g=>g.name===saved.group)||groups[0];
  const buttons=groups.map((group,index)=>{const button=el('button',group.name);button.id=`${id}-tab-${index}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`${id}-content`);button.onclick=()=>{active=group;paint();};button.onkeydown=event=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?groups.length-1:(index+(event.key==='ArrowRight'?1:-1)+groups.length)%groups.length;buttons[next].click();buttons[next].focus();};nav.append(button);return button;});
  content.id=`${id}-content`;content.setAttribute('role','tabpanel');
  function paint(){
    const index=groups.indexOf(active);buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});content.setAttribute('aria-labelledby',buttons[index].id);content.replaceChildren();
    const selected=infoNavigation[scope];let current=active.pages.find(p=>selected?.group===active.name&&p.name===selected.page)||active.pages[0];
    const label=el('label','Vis','info-select'),select=el('select');select.setAttribute('aria-label','Informasjonskategori');for(const item of active.pages)select.append(new Option(item.name,item.name));select.value=current.name;label.append(select);if(active.pages.length>1)content.append(label);else content.append(el('h3',current.name,'info-caption'));
    const fields=el('div',undefined,'property-grid');content.append(fields);
    function draw(){infoNavigation[scope]={group:active.name,page:current.name};fields.replaceChildren();if(Object.keys(current.fields).length){const heading=el('div',undefined,'property-grid-heading');heading.append(el('span','Egenskap'),el('span','Verdi'));fields.append(heading,kv(current.fields));}if(current.paths?.length)fields.append(el('h3','IFC-hierarki','info-caption'),hierarchy(current.paths));if(!Object.keys(current.fields).length&&!current.paths?.length)fields.append(el('p','Ingen verdier er angitt i IFC-filen.','small'));}
    select.onchange=()=>{current=active.pages.find(p=>p.name===select.value);draw();};draw();
  }
  box.append(nav,content);paint();return box;
}
function showTab(name){for(const key of ['file','object']){const active=name===key;$(`tab-${key}`).setAttribute('aria-selected',String(active));$(`tab-${key}`).tabIndex=active?0:-1;$(`${key}-panel`).hidden=!active;}}
for(const name of ['file','object']){$(`tab-${name}`).onclick=()=>showTab(name);$(`tab-${name}`).onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'file':event.key==='End'?'object':name==='file'?'object':'file';showTab(next);$(`tab-${next}`).focus();}};}

function showWorkspace(){$('welcome').hidden=true;$('workspace').hidden=false;}
function renderTree(){
  const target=$('model-tree');const open=new Set([...target.querySelectorAll('details[open]')].map(e=>e.dataset.path));target.replaceChildren();
  const query=$('search').value.toLocaleLowerCase();
  const matches=node=>node.name.toLocaleLowerCase().includes(query)||(node.kind==='layer'&&node.children.some(matches));
  function render(nodes,container,inherited=false){for(const node of nodes){if(query&&!inherited&&!matches(node))continue;
    if(node.kind==='layer'){const d=el('details',undefined,'tree-layer');d.dataset.path=node.path;d.open=!!query||open.has(node.path);const summary=el('summary',node.name);d.append(summary);const children=el('div',undefined,'tree-children');render(node.children,children,inherited||node.name.toLocaleLowerCase().includes(query));d.append(children);container.append(d);}
    else {const button=el('button',undefined,'tree-file');button.classList.toggle('active',state.selected?.id===node.id);button.setAttribute('aria-pressed',String(state.selected?.id===node.id));button.append(el('span',node.name.includes('.')?node.name.split('.').at(-1).toUpperCase():'FIL','extension'),el('span',node.name,'name'));button.onclick=()=>selectFile(state.files.find(f=>f.id===node.id));container.append(button);}
  }}
  render(state.tree,target);if(!target.childNodes.length)target.append(el('p',query?'Ingen lag eller filer samsvarer med søket.':'Ingen modellfiler er tilgjengelige.','small'));
  $('file-count').textContent=`${state.files.length} filer`;
}
$('search').oninput=renderTree;

const isIfc=file=>/\.ifc$/i.test(file.name);
async function load(file,epoch=state.epoch){
  if(state.metadata.has(file.id))return state.metadata.get(file.id);
  const size=file.document?.attributes?.filesize;if(size>200*1024*1024)throw new Error('Filen er større enn grensen på 200 MB.');
  let text;
  try{text=file.localText??await state.source.original(file);}catch(error){throw new Error(`Originalfilen kunne ikke leses. ${errorText(error)} Filtilgang eller tillatelse til nedlasting må kontrolleres.`);}
  if(epoch!==state.epoch)throw new Error('Prosjektet ble endret mens filen ble hentet.');
  if(typeof text!=='string'||text.length>200*1024*1024)throw new Error('Filen er for stor eller har et uventet format.');
  const parsed=await work('parse',file.id,text);if(epoch!==state.epoch)throw new Error('Prosjektet ble endret.');
  for(const key of parsed.evicted)state.metadata.delete(key);
  state.metadata.set(file.id,parsed.metadata);return parsed.metadata;
}

function fileHeading(file,data){const h=el('div',undefined,'file-heading');h.append(el('div',file.layer||'Lokal fil','eyebrow'),el('h2',file.name));return h;}
function renderFile(file,data){
  const panel=$('file-panel');panel.replaceChildren(fileHeading(file,data));
  panel.append(infoBrowser(fileViews(file,data),'file'));
  if(!file.localText)panel.append(el('p','Kilde: IFC-originaldokumentet. Publisert 3D-revisjon kan avvike.','source-note'));
}
async function selectFile(file){
  const token=++state.selection,epoch=state.epoch;++state.pick;
  state.selected=file;showTab('file');renderTree();$('file-panel').replaceChildren(fileHeading(file));
  if(!isIfc(file)){$('file-panel').append(el('p','Denne filtypen har ingen IFC-header eller IFC-hierarki.'));return;}
  message(`Leser ${file.name} …`);
  try{const data=await load(file,epoch);if(token!==state.selection||epoch!==state.epoch)return;renderFile(file,data);message('Filinformasjonen er lest fra originalfilen.');}
  catch(error){if(token!==state.selection||epoch!==state.epoch)return;message(errorText(error),true);$('file-panel').append(el('p','Kunne ikke lese IFC-data. Du kan velge filen på nytt for å prøve igjen.'));}
}

async function picked(result){
  const token=++state.pick,epoch=state.epoch;const current=()=>token===state.pick&&epoch===state.epoch;
  showTab('object');const panel=$('object-panel');panel.replaceChildren();
  if(!result?.guid){panel.append(el('p','Ingen objekter er valgt i 3D.'));return;}
  panel.append(el('div','VALGT I STREAMBIM','eyebrow'),el('p','Leser objektinformasjon …'));
  try {
    const info=await state.source.object(result.guid);if(!current())return;state.rawObject=info;
    panel.replaceChildren(el('h2',info.properties?.Name||'Valgt objekt'),infoBrowser(objectViews(info),'object'));
    const guid=ifcGuid(info?.properties?.['Global Id'])||ifcGuid(result.guid)||ifcGuid(info?.guid)||ifcGuid(info?.properties?.GUID);
    if(!guid){message('Objektets IFC GlobalId kunne ikke identifiseres. Egenskapene fra StreamBIM vises.',true);return;}
    const files=sourceFilesForObject(state.files,info).filter(isIfc),matches=[],failed=[];
    // The viewer's document reference is authoritative; the manually selected file
    // is never assumed to own the object. Fall back to searching only if absent.
    for(let i=0;i<files.length;i++) {
      const file=files[i];message(`Finner objektets kildefil (${i+1}/${files.length}): ${file.name}`);
      try{await load(file,epoch);if(!current())return;const object=await work('object',file.id,undefined,guid);if(!current())return;if(object.found)matches.push({file,object});}catch(error){if(!current())return;failed.push({name:file.name,error:errorText(error)});}
    }
    if(!current())return;
    if(failed.length)panel.append(el('div',`${failed.length} kildefil(er) kunne ikke leses. Treff kan være ufullstendige.`, 'warning'));
    if(!matches.length){message('Objektet ble ikke funnet i de tilgjengelige IFC-originalfilene. Det kan skyldes filtype, filtilgang eller en annen publisert revisjon.',true);return;}
    panel.replaceChildren(el('h2',info.properties?.Name||'Valgt objekt'));
    if(failed.length)panel.append(el('div',`${failed.length} kildefil(er) kunne ikke leses. Treff kan være ufullstendige.`, 'warning'));
    if(matches.length>1)panel.append(el('div','Samme GlobalId finnes i flere filer. Treffene vises separat.','warning'));
    if(matches.length===1){state.selected=matches[0].file;renderTree();const data=state.metadata.get(state.selected.id);if(data)renderFile(state.selected,data);}
    for(const {file,object} of matches){
      const data=state.metadata.get(file.id);const box=el('section');box.append(el('p',file.name,'object-source'),infoBrowser(objectViews(info,file,data,object.paths),'object'));panel.append(box);
    }
    panel.append(el('p','Kilde: IFC-originaldokumentet. Publisert 3D-revisjon kan avvike.','source-note'));
    message(failed.length?'Objektet er lest. Enkelte filer kunne ikke kontrolleres.':'Objektets faktiske IFC-hierarki er lest.');
  } catch(error){if(current())message(errorText(error),true);}
}

async function refresh(){
  const epoch=++state.epoch;++state.pick;++state.selection;$('refresh').disabled=true;
  state.files=[];state.tree=[];state.selected=null;state.metadata.clear();await work('clear');renderTree();
  $('file-panel').replaceChildren(el('p','Velg en IFC-fil for å se informasjon.'));
  $('object-panel').replaceChildren(el('p','Velg et objekt i StreamBIM 3D for å lese hierarkiet.'));
  message('Henter modellag og filer fra det aktive prosjektet …');
  try {
    const init=await state.source.initialize();if(epoch!==state.epoch)return;
    if(init.needsBuilding){const label=el('label','Velg modell / bygg');const select=el('select');select.append(new Option('Velg …',''));for(const building of init.buildings)select.append(new Option(building.attributes?.name||`Modell ${building.id}`,building.id));label.append(select);$('file-panel').replaceChildren(label);select.onchange=async()=>{if(select.value){state.source.buildingId=select.value;await catalogue(epoch);}};showWorkspace();message('StreamBIM oppgir ikke aktiv modell. Velg blant modellene i prosjektet.');return;}
    await catalogue(epoch);
  }catch(error){if(epoch===state.epoch)message(`Kunne ikke hente modellag: ${errorText(error)}`,true);}
  finally{if(epoch===state.epoch)$('refresh').disabled=false;}
}
async function catalogue(epoch){const data=await state.source.catalogue();if(epoch!==state.epoch)return;state.files=data.files;state.tree=data.tree;showWorkspace();renderTree();$('connection').textContent='Tilkoblet StreamBIM';$('connection').classList.add('connected');message(state.files.some(f=>f.error)?'Enkelte dokumenter kunne ikke leses. Modellfilene vises med tilgjengelig informasjon.':'Velg en IFC-fil, eller klikk på et objekt i 3D.');}
$('refresh').onclick=()=>state.connected?refresh():connectPanel();
async function connected(){state.connected=true;state.source=new StreamBimSource(window.StreamBIM);await refresh();}

async function handlePickedObject(result){
  if(!state.source)return;
  // Restore native viewer selection while metadata loads independently.
  const source=state.source;
  const selection=source.selectPickedObject(result).catch(error=>{
    if(source===state.source)message(`Kunne ikke markere objektet i 3D: ${errorText(error)}`,true);
  });
  await Promise.all([selection,picked(result)]);
}
const callbacks={pickedObject:handlePickedObject,modelReady:()=>{if(state.connected&&state.source)refresh();}};
let panelConnection=null,connecting=false;
async function connectPanel(){
  if(connecting)return;connecting=true;state.connected=false;
  panelConnection?.destroy();window.StreamBIM._connection?.destroy();
  showWorkspace();$('connection').textContent='Kobler til StreamBIM …';$('refresh').disabled=true;
  message('Henter prosjektet du har åpnet widgeten i …');
  try {
    panelConnection=await withTimeout(connectEmbedded({sdk:window.StreamBIM,legacy:window.Penpal,parentWindow:window.parent,referrer:document.referrer,callbacks}),25000);
    await connected();
  }catch(error){
    $('connection').textContent='Ingen forbindelse til StreamBIM';
    message(`Kunne ikke koble til prosjektet: ${errorText(error)} Lukk og åpne widgeten, eller trykk Oppdater.`,true);
  }finally{connecting=false;$('refresh').disabled=false;}
}
if(window.parent!==window){
  await connectPanel();
}
$('connect-form').onsubmit=async event=>{
  event.preventDefault();let url;
  try{url=new URL($('project-url').value);if(url.protocol!=='https:'||!/(^|\.)streambim\.com$/.test(url.hostname))throw new Error('Bruk en HTTPS-lenke til et StreamBIM-prosjekt.');const query=new URLSearchParams(url.hash.split('?')[1]||url.search.slice(1));if(!query.get('projectId'))throw new Error('Lenken mangler prosjekt-ID.');query.set('embedded','true');url.hash=`/viewer?${query}`;}
  catch(error){message(error.message,true);return;}
  const viewerWindow=window.open(url.href,'statkraft-ifc-viewer','popup,width=1200,height=850');
  if(!viewerWindow){message('Tillat åpning av prosjektvinduet for å koble til.',true);return;}
  $('connection').textContent='Kobler til StreamBIM …';
  try{await withTimeout(window.StreamBIM.connectToWindow(viewerWindow,url.href,callbacks),60000);await connected();}catch(error){message(`Tilkobling mislyktes: ${errorText(error)}`,true);}
};
$('close-viewer').onclick=()=>{++state.epoch;++state.pick;++state.selection;state.connected=false;$('viewer').src='about:blank';$('viewer-wrap').hidden=true;document.body.classList.remove('with-viewer');$('welcome').hidden=false;$('workspace').hidden=true;$('connection').textContent='Ikke tilkoblet';$('connection').classList.remove('connected');$('refresh').disabled=true;};
$('local-ifc').onchange=async()=>{const file=$('local-ifc').files[0];if(!file)return;if(file.size>200*1024*1024){message('Filen er større enn grensen på 200 MB.',true);return;}const epoch=++state.epoch;++state.pick;state.metadata.clear();await work('clear');const local={id:`local:${file.name}:${file.lastModified}`,name:file.name,localText:await file.text(),layer:'Lokale filer'};if(epoch!==state.epoch)return;state.files=[local];state.tree=[{kind:'layer',name:'Lokale filer',path:'local',children:[{...local,kind:'file'}]}];showWorkspace();await selectFile(local);};
// Invalidate cached revisions on refresh and when the host changes project/building.
let checking=false;
setInterval(async()=>{if(!state.connected||checking||!state.source)return;checking=true;try{const projectId=String(await withTimeout(state.source.api.getProjectId(),5000));const buildingId=typeof state.source.api.getBuildingId==='function'?String(await withTimeout(state.source.api.getBuildingId(),5000)):state.source.buildingId;if(projectId!==state.source.projectId||buildingId!==state.source.buildingId)await refresh();}catch{}finally{checking=false;}},15000);

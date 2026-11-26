import test from 'node:test';
import assert from 'node:assert/strict';
import {StreamBimSource,buildTree,displayLayer,sourceFilesForObject} from '../dist/streambim.mjs';
test('builds arbitrary nested layers with mixed files and empty viewer layers',()=>{
  const tree=buildTree([{id:'a',name:'model.ifc',layer:'Civil~Dam~Concrete'},{id:'b',name:'drawing.dwg',layer:'Civil~Dam'}],{'Civil~Empty':false,'Other':true});
  const civil=tree.find(n=>n.name==='Civil');assert.ok(civil.children.some(n=>n.name==='Empty'));
  const dam=civil.children.find(n=>n.name==='Dam');assert.equal(dam.children.find(n=>n.name==='Concrete').children[0].id,'a');assert.equal(dam.children.find(n=>n.kind==='file').name,'drawing.dwg');
});
test('derives project and building from host and follows pagination',async()=>{
  const calls=[];const api={getProjectId:async()=>98765,getBuildingId:async()=>4321,makeApiRequest:async({url,method})=>{
    calls.push({url,method});const skip=Number(new URL(url,'https://example.test').searchParams.get('page[skip]'));
    return JSON.stringify({data:skip? [{id:'last',type:'ifc-files'}]:Array.from({length:250},(_,i)=>({id:String(i),type:'ifc-files'}))});
  }};
  const source=new StreamBimSource({API:api});await source.initialize();assert.equal(source.projectId,'98765');assert.equal(source.buildingId,'4321');
  assert.equal((await source.list(source.base+'/v2/ifc-files')).rows.length,251);assert.ok(calls.every(c=>c.method==='GET'));assert.match(calls[1].url,/skip\]=250/);
});
test('does not silently accept repeated pages',async()=>{const source=new StreamBimSource({API:{makeApiRequest:async()=>JSON.stringify({data:Array.from({length:250},(_,i)=>({id:i,type:'files'}))})}});await assert.rejects(source.list('/files'),/samme side/);});
test('offers building selection when host cannot identify active building',async()=>{const source=new StreamBimSource({API:{getProjectId:async()=>765,makeApiRequest:async()=>JSON.stringify({data:[{id:'9'},{id:'10'}]})}});assert.equal((await source.initialize()).needsBuilding,true);});
test('uses host layer names without inventing or stripping literal names',()=>{assert.equal(displayLayer('Civil~Concrete+4',{'Civil~Concrete':true}),'Civil~Concrete');assert.equal(displayLayer('Civil~Concrete+4',{'Civil~Concrete+4':true}),'Civil~Concrete+4');assert.equal(displayLayer('Custom+7',{}),'Custom+7');});
test('resolves object by host document ID, independently of file selection and duplicate GUIDs',()=>{const files=[{documentId:'1'},{documentId:'2'}];assert.deepEqual(sourceFilesForObject(files,{document:2}),[files[1]]);assert.deepEqual(sourceFilesForObject(files,{properties:{'@Document Id':1}}),[files[0]]);assert.deepEqual(sourceFilesForObject(files,{}),files);assert.deepEqual(sourceFilesForObject(files,{document:99}),[]);});
test('widget picks replace selection, while Shift-click adds to it',async()=>{
  const selected=new Set(['previous']);const source=new StreamBimSource({API:{getViewportState:async()=>({highlightedObjects:[...selected]}),deHighlightObject:()=>{throw new Error('Broken host API');},deHighlightAllObjects:()=>{selected.clear();return new Promise(()=>{});},highlightObject:async guid=>selected.add(guid)}});
  await source.selectPickedObject({guid:'wall'});assert.deepEqual([...selected],['wall']);
  await source.selectPickedObject({guid:'slab',shiftKey:true});assert.deepEqual([...selected],['wall','slab']);
  await source.selectPickedObject({});assert.equal(selected.size,0);
});
test('rapid clicks leave the latest object highlighted even with a delayed viewer reply',async()=>{
  const selected=new Set();let release,started;const inFlight=new Promise(resolve=>{started=resolve;});
  const source=new StreamBimSource({API:{getViewportState:async()=>({highlightedObjects:[...selected]}),deHighlightAllObjects:()=>{selected.clear();return new Promise(()=>{});},highlightObject:async guid=>{if(guid==='first'){started();await new Promise(resolve=>{release=resolve;});}selected.add(guid);}}});
  const first=source.selectPickedObject({guid:'first'});await inFlight;
  const second=source.selectPickedObject({guid:'second'});const latest=source.selectPickedObject({guid:'latest'});
  release();await Promise.all([first,second,latest]);assert.deepEqual([...selected],['latest']);
});
test('selection recovers after a failed viewer call',async()=>{
  const selected=new Set();let fail=true;const source=new StreamBimSource({API:{getViewportState:async()=>({highlightedObjects:[...selected]}),deHighlightAllObjects:()=>{selected.clear();return new Promise(()=>{});},highlightObject:async guid=>{if(fail){fail=false;throw new Error('Temporary viewer error');}selected.add(guid);}}});
  await assert.rejects(source.selectPickedObject({guid:'first'}));await source.selectPickedObject({guid:'second'});assert.deepEqual([...selected],['second']);
});

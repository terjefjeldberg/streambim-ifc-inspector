import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {connectEmbedded} from '../dist/embedded-connection.mjs';
import {StreamBimSource} from '../dist/streambim.mjs';
const library=readFileSync(new URL('../dist/vendor/penpal-6.2.2.min.js',import.meta.url),'utf8');

test('embedded panel performs real Penpal 6 handshake, reads host context and receives object picks',async()=>{
  function endpoint(){const listeners=new Set();return {closed:false,setTimeout,clearTimeout,addEventListener:(type,fn)=>{if(type==='message')listeners.add(fn);},removeEventListener:(type,fn)=>listeners.delete(fn),dispatch:event=>{for(const fn of [...listeners])fn(event);}};}
  const host=endpoint(),child=endpoint();
  const parentProxy={closed:false,postMessage(data,origin){assert.ok(origin==='*'||origin==='https://app.streambim.com');queueMicrotask(()=>host.dispatch({data,origin:'http://127.0.0.1:4186',source:childProxy}));}};
  const childProxy={closed:false,postMessage(data,origin){assert.equal(origin,'http://127.0.0.1:4186');queueMicrotask(()=>child.dispatch({data,origin:'https://app.streambim.com',source:parentProxy}));}};
  child.parent=parentProxy;
  function context(window){const ctx=vm.createContext({window,parent:window.parent,setTimeout,clearTimeout,setInterval,clearInterval,console,URL,Promise});vm.runInContext(library,ctx);return ctx.Penpal;}
  const hostLibrary=context(host),childLibrary=context(child);
  const hostConnection=hostLibrary.connectToChild({iframe:{src:'http://127.0.0.1:4186/',contentWindow:childProxy,isConnected:true},childOrigin:'http://127.0.0.1:4186',timeout:1000,methods:{getProjectId:()=>54321,getBuildingId:()=>876,getLayers:()=>({'Infrastructure~Dam':true})}});
  const sdk={connectToParent(){throw new Error('Modern protocol should not run for a legacy panel');}};
  let picked=null;
  const connection=await connectEmbedded({sdk,legacy:childLibrary,parentWindow:parentProxy,referrer:'https://app.streambim.com/webapp/default/',callbacks:{pickedObject:result=>{picked=result.guid;}}});
  try {
    const source=new StreamBimSource(sdk);await source.initialize();
    assert.equal(source.projectId,'54321');assert.equal(source.buildingId,'876');
    assert.equal((await sdk.API.getLayers())['Infrastructure~Dam'],true);
    const childApi=await hostConnection.promise;await childApi.pickedObject({guid:'0000000000000000000003'});
    assert.equal(picked,'0000000000000000000003');
  }finally{connection.destroy();hostConnection.destroy();}
});
test('modern fallback destroys the timed out legacy connection',async()=>{
  let destroyed=false,called=false;const sdk={async connectToParent(parent,methods){called=true;this._connection={destroy(){}};}};
  const connection=await connectEmbedded({sdk,legacy:{connectToParent(){return {promise:Promise.reject({code:'ConnectionTimeout'}),destroy(){destroyed=true;}};}},parentWindow:{},referrer:'https://sweden.streambim.com/',callbacks:{}});
  assert.equal(destroyed,true);assert.equal(called,true);assert.equal(connection,sdk._connection);
});
test('missing referrer restricts accepted origins to StreamBIM',async()=>{
  let accepted;await connectEmbedded({sdk:{},legacy:{connectToParent(options){accepted=options.parentOrigin;return {promise:Promise.resolve({}),destroy(){}};}},parentWindow:{},referrer:'',callbacks:{}});
  assert.equal(accepted.test('https://app.streambim.com'),true);assert.equal(accepted.test('https://sweden.streambim.com'),true);assert.equal(accepted.test('https://streambim.com.attacker.test'),false);
});

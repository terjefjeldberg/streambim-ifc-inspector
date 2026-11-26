import {parseIfc,metadata,objectPaths} from './ifc.mjs';
const models=new Map();
self.onmessage=({data})=>{
  const {id,action,key,text,guid}=data;
  try {
    if(action==='parse') {
      const model=parseIfc(text);models.delete(key);models.set(key,model);
      const evicted=[];while(models.size>3){const oldest=models.keys().next().value;models.delete(oldest);evicted.push(oldest);}
      self.postMessage({id,result:{metadata:metadata(model),evicted}});
    } else if(action==='object') {
      const model=models.get(key);if(!model)throw new Error('Filen er ikke lenger i hurtigbufferen. Velg filen på nytt.');
      self.postMessage({id,result:objectPaths(model,guid)});
    } else if(action==='clear'){models.clear();self.postMessage({id,result:true});}
  }catch(error){self.postMessage({id,error:error.message});}
};

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIfc,metadata,objectPaths,parseArguments,ifcGuid} from '../dist/ifc.mjs';
const fixture=(extra='',schema='IFC4')=>`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');
FILE_NAME('sample.ifc','2026-01-01T10:00:00',('Author'),('Company'),'Processor','Authoring tool','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
#1=IFCPROJECT('0000000000000000000001',$,'Project',$,$,'Long name','Phase',(),#30);
#2=IFCSITE('0000000000000000000002',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,42.,$,$);
#3=IFCWALL('0000000000000000000003',$,'Wall',$,$,$,$,$,.STANDARD.);
#4=IFCRELAGGREGATES('0000000000000000000004',$,$,$,#1,(#2));
#5=IFCRELCONTAINEDINSPATIALSTRUCTURE('0000000000000000000005',$,$,$,(#3),#2);
#20=IFCORGANIZATION($,'Vendor',$,$,$);
#21=IFCAPPLICATION(#20,'1.0','Tool','T');
#30=IFCUNITASSIGNMENT((#31));
#31=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
${extra}
ENDSEC;
END-ISO-10303-21;`;
test('reads author, schema, tool, units and real spatial relationships',()=>{
  const model=parseIfc(fixture()),data=metadata(model);
  assert.equal(data.header.FILE_NAME[2][0],'Author');assert.equal(data.header.FILE_SCHEMA[0][0],'IFC4');
  assert.equal(data.sections.find(s=>s.title==='Applikasjoner').entities[0].ApplicationFullName,'Tool');
  assert.equal(data.sections.find(s=>s.title==='Enheter').entities[0].Units[0].Prefix,'MILLI');
  assert.deepEqual(objectPaths(model,'0000000000000000000003').paths[0].nodes.map(n=>n.type),['IFCPROJECT','IFCSITE','IFCWALL']);
});
test('works for IFC2X3 and IFC4X3 without inserting building or storey',()=>{for(const schema of ['IFC2X3','IFC4X3_ADD2'])assert.equal(objectPaths(parseIfc(fixture('',schema)),'0000000000000000000003').paths[0].nodes.length,3);});
test('decodes nested STEP values, apostrophes, Unicode and typed values',()=>{
  assert.deepEqual(parseArguments("('O''Brien; a,b',('P\\X\\E5lsbu','\\X2\\00D800E6\\X0\\'),IFCLABEL('Text'),#12,$,*)"),["O'Brien; a,b",['Pålsbu','Øæ'],{type:'IFCLABEL',value:['Text']},{ref:12},null,{derived:true}]);
});
test('does not invent hierarchy for orphan and reports cycles',()=>{
  const model=parseIfc(fixture("#40=IFCWALL('0000000000000000000040',$,'Orphan',$,$,$,$,$,.STANDARD.);"));
  assert.equal(objectPaths(model,'0000000000000000000040').paths[0].nodes.length,1);
  model.parents.set(1,[{parent:3,relation:'IFCRELAGGREGATES'}]);assert.match(objectPaths(model,'0000000000000000000003').paths[0].warning,/Syklus/);
});
test('preserves multiple parents and duplicate GlobalIds',()=>{
  const model=parseIfc(fixture("#40=IFCWALL('0000000000000000000003',$,'Duplicate',$,$,$,$,$,.STANDARD.);#41=IFCRELNESTS('0000000000000000000041',$,$,$,#1,(#3));"));
  const paths=objectPaths(model,'0000000000000000000003');assert.equal(paths.objects.length,2);assert.equal(paths.paths.length,3);
});
test('rejects truncated, XML, ZIP and non-IFC STEP input',()=>{
  for(const source of ['<ifcXML/>','PKabcd',fixture().replace('END-ISO-10303-21;',''),fixture().replace("(('IFC4'))","(('OTHER'))")])assert.throws(()=>parseIfc(source));
});
test('understands viewer-prefixed GlobalIds and rejects accidental identifiers',()=>{
  assert.equal(ifcGuid('1000~0000000000000000000003'),'0000000000000000000003');assert.equal(ifcGuid('wall123'),null);
});
test('comments are skipped without deleting literal comment text in IFC strings',()=>{
  const model=parseIfc(fixture().replace("'Project'","'literal /* keep this */ text'").replace("#2=IFCSITE","/* ignore ; ' */ #2=IFCSITE"));
  assert.equal(model.entities.get(1).args[2],'literal /* keep this */ text');assert.equal(model.entities.get(2).type,'IFCSITE');
});

// Curated presentation, separate from the complete IFC metadata reader.
// Grouping follows Solibri Info View; never show internal API or STEP records.
const text=value=>value===null||value===undefined?'':Array.isArray(value)?value.map(text).filter(Boolean).join('\n'):typeof value==='object'?'':String(value);
const compact=fields=>Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,text(value)]).filter(([,value])=>value!==''));
const allEntities=data=>(data?.sections||[]).flatMap(section=>section.entities);
const entity=(data,type)=>allEntities(data).find(value=>value.type===type)||{};
const page=(name,fields)=>({name,fields:compact(fields)});

export function headerGroup(data) {
  const header=data?.header||{},name=header.FILE_NAME||[],description=header.FILE_DESCRIPTION||[];
  return {name:'IFC Header',pages:[
    page('File Name',{'Name':name[0],'Time Stamp':name[1],'Author':name[2],'Organization':name[3],'Preprocessor Version':name[4],'Originating System':name[5],'Authorization':name[6]}),
    page('File Description',{'Description':description[0],'Implementation Level':description[1]}),
    page('File Schema',{'Schema Identifiers':header.FILE_SCHEMA?.[0]})
  ]};
}

export function fileViews(file,data) {
  const project=entity(data,'IFCPROJECT'),app=entity(data,'IFCAPPLICATION'),site=entity(data,'IFCSITE'),crs=entity(data,'IFCPROJECTEDCRS');
  const owner=entity(data,'IFCOWNERHISTORY'),person=owner.OwningUser?.ThePerson||{},organization=owner.OwningUser?.TheOrganization||{};
  const identification=page('Identification',{'Modell':file.name,'IFC-type':project.type,'Navn':project.Name,'Langt navn':project.LongName,'Beskrivelse':project.Description,'GlobalId':project.GlobalId,'Fase':project.Phase,'Applikasjon':app.ApplicationFullName,'Versjon':app.Version,'Applikasjonsleverandør':app.ApplicationDeveloper?.Name,'Opprettet av':[person.GivenName,person.FamilyName].filter(Boolean).join(' '),'Organisasjon':organization.Name});
  const location=page('Location',{'Område':site.Name,'Breddegrad (grader, minutter, sekunder)':site.RefLatitude,'Lengdegrad (grader, minutter, sekunder)':site.RefLongitude,'Referansehøyde':site.RefElevation,'Koordinatsystem':crs.Name,'Geodetisk datum':crs.GeodeticDatum,'Høydedatum':crs.VerticalDatum});
  return [headerGroup(data),{name:'BIM Data',pages:[identification,...(Object.keys(location.fields).length?[location]:[])]}];
}

function propertyPages(groups) {
  const pages=[];
  function visit(group,path=[]) {
    const properties=group.content?.properties||[];
    const fields=Object.fromEntries(properties.filter(p=>p.value!==null&&p.value!==undefined&&p.value!=='').map(p=>[p.key,p.value]));
    if(Object.keys(fields).length)pages.push(page([...path,group.label].filter(Boolean).join(' / '),fields));
    for(const child of group.content?.children||[])visit(child,[...path,group.label]);
  }
  for(const group of groups)visit(group);
  return pages;
}

export function objectViews(info,file,data,paths=[]) {
  const props=info.properties||{},groups=info.groups||[];
  const identity=page('Identification',{'Navn':props.Name,'IFC-type':props['@kind'],'GlobalId':props['Global Id'],'Modell':file?.name,'Langt navn':props['Long Name'],'Beskrivelse':props.Description});
  const location=page('Location',{'Modellag':info.layer});location.paths=paths;
  const bim={name:'BIM Data',pages:[identity,location]};
  for(const [title,pattern] of [['Material',/^Material$/i],['Profile',/^Profile$/i],['Quantities',/^(?:BaseQuantities|Quantities)$/i]]) {
    const pages=propertyPages(groups.filter(g=>pattern.test(g.label||'')));
    if(pages.length)bim.pages.push({name:title,fields:Object.assign({},...pages.map(p=>p.fields))});
  }
  const result=[bim];if(data)result.push(headerGroup(data));
  const psets=propertyPages(groups.filter(g=>/^Pset_/i.test(g.label||'')));
  const qtos=propertyPages(groups.filter(g=>/^Qto_/i.test(g.label||'')));
  const other=propertyPages(groups.filter(g=>!/^(@|Pset_|Qto_|Geometry$|Location$|Material$|Profile$|BaseQuantities$|Quantities$)/i.test(g.label||'')));
  if(psets.length)result.push({name:'IFC Properties',pages:psets});
  if(qtos.length)result.push({name:'IFC Quantities',pages:qtos});
  if(other.length)result.push({name:'Other Properties',pages:other});
  return result;
}

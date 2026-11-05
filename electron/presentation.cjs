'use strict';
const { ITEM_TYPES }=require('./store.cjs');
function itemIndex(catalog) {
  const index=new Map();
  for(const kind of ['cards','titles','sprays','buddies','skinlevels','bundles']){
    for(const item of catalog[kind] || []){
      index.set(item.id,{...item,kind});
      for(const level of item.levels || [])index.set(level.id,{...item,...level,image:level.image || item.image,kind});
    }
  }
  for(const weapon of catalog.weapons || [])for(const skin of weapon.skins){
    for(const level of skin.levels)index.set(level.id,{...skin,id:level.id,image:level.image || skin.image,name:skin.name,weapon:weapon.name,kind:'skin'});
  }
  return index;
}
function enrichStore(store,catalog){
  const index=itemIndex(catalog);
  const enrich=offer=>({...offer,...index.get(offer.itemId),id:offer.id,itemId:offer.itemId});
  return {...store,offers:store.offers.map(enrich),accessories:store.accessories.map(enrich),bonus:store.bonus.map(enrich),bundles:store.bundles.map(bundle=>({...bundle,...index.get(bundle.id),id:bundle.id,items:bundle.items.map(enrich)}))};
}
function presentLocker(inventory,catalog){
  const {loadout,owned}=inventory;
  const has=(type,id)=>(owned[type]||[]).some(x=>x.id===id);
  const weapons=(catalog.weapons||[]).map(weapon=>{
    const equipped=loadout.Guns.find(g=>g.ID===weapon.id);
    const skins=weapon.skins.map(skin=>{
      const levels=skin.levels.filter(l=>has(ITEM_TYPES.skin,l.id)||equipped?.SkinLevelID===l.id);
      return {...skin,levels,chromas:skin.chromas.filter((c,i)=>i===0||has(ITEM_TYPES.chroma,c.id)||equipped?.ChromaID===c.id)};
    }).filter(skin=>skin.levels.length);
    return {id:weapon.id,name:weapon.name,image:weapon.image,category:weapon.category,equipped,skins};
  }).filter(w=>w.equipped || w.skins.length);
  const result={weapons,profile:loadout.Identity,spraySlots:loadout.Sprays,warnings:catalog.warnings || []};
  for(const [kind,type]of Object.entries({cards:ITEM_TYPES.card,titles:ITEM_TYPES.title,sprays:ITEM_TYPES.spray})){
    result[kind]=(catalog[kind]||[]).filter(item=>has(type,item.id));
  }
  result.buddies=(catalog.buddies||[]).flatMap(buddy=>buddy.levels.flatMap(level=>(owned[ITEM_TYPES.buddy]||[]).filter(x=>x.id===level.id&&x.instanceId).map(x=>({...buddy,itemId:level.id,instanceId:x.instanceId}))));
  return result;
}
module.exports={itemIndex,enrichStore,presentLocker};

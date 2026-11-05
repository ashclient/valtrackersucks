'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {presentLocker,enrichStore}=require('../electron/presentation.cjs');const {ITEM_TYPES}=require('../electron/store.cjs');
test('locker excludes unowned levels and locked variants but retains current defaults',()=>{
 const inventory={loadout:{Guns:[{ID:'weapon',SkinID:'default',SkinLevelID:'default-level',ChromaID:'default-chroma'}],Identity:{},Sprays:[]},owned:{[ITEM_TYPES.skin]:[{id:'level2'}]}};
 const catalog={weapons:[{id:'weapon',name:'Vandal',skins:[{id:'default',name:'Standard',levels:[{id:'default-level',level:1}],chromas:[{id:'default-chroma'}]},{id:'skin',name:'Skin',levels:[{id:'level1',level:1},{id:'level2',level:2}],chromas:[{id:'base'},{id:'locked'}]},{id:'not-owned',levels:[{id:'no'}],chromas:[{id:'no'}]}]}]};
 const locker=presentLocker(inventory,catalog);assert.equal(locker.weapons[0].skins.length,2);assert.deepEqual(locker.weapons[0].skins[1].levels,[{id:'level2',level:2}]);assert.deepEqual(locker.weapons[0].skins[1].chromas,[{id:'base'}]);
});
test('store enrichment maps reward item IDs without replacing final prices',()=>{
 const offer={id:'offer-id',itemId:'skin-level',cost:{VP:10},baseCost:{VP:20},discount:50};
 const catalog={weapons:[{id:'gun',name:'Vandal',skins:[{id:'skin',name:'My skin',image:'image',levels:[{id:'skin-level'}],chromas:[]}]}]};
 const store=enrichStore({offers:[offer],accessories:[],bonus:[],bundles:[]},catalog);
 assert.equal(store.offers[0].name,'My skin');assert.equal(store.offers[0].id,'offer-id');assert.equal(store.offers[0].itemId,'skin-level');assert.equal(store.offers[0].cost.VP,10);
});
test('buddy instances remain separate owned copies in the locker',()=>{
 const inventory={loadout:{Guns:[],Identity:{},Sprays:[]},owned:{[ITEM_TYPES.buddy]:[{id:'level',instanceId:'one'},{id:'level',instanceId:'two'}]}};
 const locker=presentLocker(inventory,{weapons:[],buddies:[{id:'buddy',name:'Buddy',levels:[{id:'level'}]}]});assert.equal(locker.buddies.length,2);assert.deepEqual(locker.buddies.map(b=>b.instanceId),['one','two']);
});

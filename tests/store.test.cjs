'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {normalizeStore,normalizeOffer,ITEM_TYPES}=require('../electron/store.cjs');
const VP='85ad13f7-3d1b-5128-9eb2-7cd8a9b7e876';const KC='85ca954a-41f2-ce94-9b45-8ca3dd39a00d';
test('missing daily prices fall back to the offer list and use reward IDs for artwork',()=>{
 const store=normalizeStore({SkinsPanelLayout:{SingleItemOffers:['offer'],SingleItemStoreOffers:[{OfferID:'offer',Cost:{}}]}},[{OfferID:'offer',Cost:{[VP]:1775},Rewards:[{ItemID:'skin-level',ItemTypeID:ITEM_TYPES.skin}]}]);
 assert.equal(store.offers[0].cost[VP],1775);assert.equal(store.offers[0].itemId,'skin-level');
});
test('zero is a valid price; invalid/missing prices are not invented',()=>{
 assert.deepEqual(normalizeOffer({Cost:{[VP]:0}}).cost,{[VP]:0});
 assert.deepEqual(normalizeOffer({Cost:{[VP]:-1,other:NaN}}).cost,{});
});
test('accessory prices use their own currency, reward IDs and expiry',()=>{
 const store=normalizeStore({AccessoryStore:{AccessoryStoreOffers:[{Offer:{OfferID:'accessory',Cost:{[KC]:4000},Rewards:[{ItemID:'card',ItemTypeID:ITEM_TYPES.card}]}}],AccessoryStoreRemainingDurationInSeconds:60}},[],1000);
 assert.equal(store.accessories[0].itemId,'card');assert.equal(store.accessories[0].cost[KC],4000);assert.equal(store.accessoriesExpireAt,61000);
});
test('Night Market and bundle discounts preserve original and final costs',()=>{
 const store=normalizeStore({BonusStore:{BonusStoreOffers:[{Offer:{OfferID:'sale',Cost:{[VP]:1775}},DiscountCosts:{[VP]:1065},DiscountPercent:40}]},FeaturedBundle:{Bundle:{ID:'bundle-offer',DataAssetID:'bundle-art',TotalBaseCost:{[VP]:10000},TotalDiscountedCost:{[VP]:7100},Items:[{Item:{ItemID:'gun'},CurrencyID:VP,BasePrice:2000,DiscountedPrice:1000}]}}});
 assert.equal(store.bonus[0].cost[VP],1065);assert.equal(store.bonus[0].baseCost[VP],1775);assert.equal(store.bundles[0].id,'bundle-art');assert.equal(store.bundles[0].cost[VP],7100);assert.equal(store.bundles[0].items[0].cost[VP],1000);
});

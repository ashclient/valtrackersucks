'use strict';
const CURRENCIES = Object.freeze({
  '85ad13f7-3d1b-5128-9eb2-7cd8a9b7e876':'VP',
  'e59aa87c-4cbf-517a-5983-6e81511be9b7':'RP',
  '85ca954a-41f2-ce94-9b45-8ca3dd39a00d':'KC'
});
const ITEM_TYPES = Object.freeze({skin:'e7c63390-eda7-46e0-bb7a-a6abdacd2433',chroma:'3ad1b2b2-acdb-4524-852f-954a76ddae0a',buddy:'dd3bf334-87f3-40bd-b043-682a57a8dc3a',card:'3f296c07-64c3-494c-923b-fe692a4fa1bd',spray:'d5f120f8-ff8c-4aac-92ea-f2b5acbe9475',title:'de7caa6b-adf7-4588-bbd1-143831e786c6'});
function prices(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([,amount])=>typeof amount==='number'&&Number.isFinite(amount)&&amount>=0));
}
function firstCost(...maps) {return maps.map(prices).find(map=>Object.keys(map).length) || {};}
function normalizeOffer(entry, fallback={}, id) {
  const offer=entry?.Offer || entry || {};
  const rewards=Array.isArray(offer.Rewards)&&offer.Rewards.length?offer.Rewards:Array.isArray(fallback.Rewards)?fallback.Rewards:[];
  const reward=rewards[0] || {};
  return {id:String(id || offer.OfferID || fallback.OfferID || ''),itemId:reward.ItemID || id || offer.OfferID || '',itemType:reward.ItemTypeID || ITEM_TYPES.skin,
    cost:firstCost(entry?.DiscountCosts,entry?.DiscountedCost,offer.Cost,fallback.Cost),baseCost:firstCost(offer.Cost,fallback.Cost),discount:Number(entry?.DiscountPercent)||0};
}
function normalizeStore(data, fallbackOffers=[], now=Date.now()) {
  const layout=data.SkinsPanelLayout || {};
  const embedded=layout.SingleItemStoreOffers || [];
  const find=id=>fallbackOffers.find(o=>o.OfferID===id || o.Rewards?.some(r=>r.ItemID===id)) || {};
  const expiry=seconds=>now+Math.max(0,Number(seconds)||0)*1000;
  const bundles=data.FeaturedBundle?.Bundles?.length?data.FeaturedBundle.Bundles:data.FeaturedBundle?.Bundle?[data.FeaturedBundle.Bundle]:[];
  return {
    offers:(layout.SingleItemOffers || embedded.map(o=>(o.Offer||o).OfferID)).slice(0,8).map(id=>normalizeOffer(embedded.find(o=>(o.Offer||o).OfferID===id) || {},find(id),id)),
    expiresAt:expiry(layout.SingleItemOffersRemainingDurationInSeconds),
    accessories:(data.AccessoryStore?.AccessoryStoreOffers || []).map(entry=>normalizeOffer(entry,find(entry.Offer?.OfferID))),
    accessoriesExpireAt:expiry(data.AccessoryStore?.AccessoryStoreRemainingDurationInSeconds),
    bonus:(data.BonusStore?.BonusStoreOffers || []).map(entry=>normalizeOffer(entry,find(entry.Offer?.OfferID))),
    bonusExpireAt:expiry(data.BonusStore?.BonusStoreRemainingDurationInSeconds),
    bundles:bundles.map(bundle=>({id:bundle.DataAssetID || bundle.ID,cost:prices(bundle.TotalDiscountedCost),baseCost:prices(bundle.TotalBaseCost),discount:Number(bundle.TotalDiscountPercent)||0,expiresAt:expiry(bundle.DurationRemainingInSeconds),items:(bundle.Items||[]).map(item=>({id:item.Item?.ItemID,itemId:item.Item?.ItemID,itemType:item.Item?.ItemTypeID,cost:typeof item.DiscountedPrice==='number'?{[item.CurrencyID]:item.DiscountedPrice}:{},baseCost:typeof item.BasePrice==='number'?{[item.CurrencyID]:item.BasePrice}:{},discount:item.DiscountPercent || 0}))}))
  };
}
module.exports={CURRENCIES,ITEM_TYPES,prices,normalizeOffer,normalizeStore};

'use strict';

/**
 * Static game content is public and does not include player identity or matches.
 * The community Valorant-API endpoint is distinct from Riot's protected player API.
 * All remote URLs are normalized and allowlisted before presentation.
 */
const httpsHosts = new Set(['media.valorant-api.com']);
const ENDPOINTS = Object.freeze({
  buddies: 'https://valorant-api.com/v1/buddies?language=en-US',
  cards: 'https://valorant-api.com/v1/playercards?language=en-US',
  sprays: 'https://valorant-api.com/v1/sprays?language=en-US',
  titles: 'https://valorant-api.com/v1/playertitles?language=en-US',
  bundles: 'https://valorant-api.com/v1/bundles?language=en-US',
  ranks: 'https://valorant-api.com/v1/competitivetiers?language=en-US',
  skinlevels: 'https://valorant-api.com/v1/weapons/skinlevels?language=en-US',
  agents: 'https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US',
  maps: 'https://valorant-api.com/v1/maps?language=en-US',
  weapons: 'https://valorant-api.com/v1/weapons?language=en-US'
});
function validImage(input) {
  try {
    const u = new URL(input);
    return u.protocol === 'https:' && !u.username && !u.password && httpsHosts.has(u.hostname) ? u.href : null;
  } catch (_) { return null; }
}
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max || 100) : ''; }
function sanitizeAgent(entry) {
  if (!entry || !entry.isPlayableCharacter || !entry.uuid) return null;
  return {
    id: clean(entry.uuid, 80),
    name: clean(entry.displayName, 42),
    role: clean(entry.role && entry.role.displayName, 40) || 'Unknown',
    description: clean(entry.description, 300),
    portrait: validImage(entry.displayIconSmall || entry.displayIcon),
    fullPortrait: validImage(entry.fullPortrait || entry.displayIcon),
    icon: validImage(entry.displayIcon),
    abilities: Array.isArray(entry.abilities) ? entry.abilities.slice(0, 5).map(a => ({
      name: clean(a && a.displayName, 50),
      slot: clean(a && a.slot, 30),
      description: clean(a && a.description, 160),
      icon: validImage(a && a.displayIcon)
    })) : []
  };
}
function sanitizeMap(entry) {
  if (!entry || !entry.uuid) return null;
  return {
    id: clean(entry.uuid, 80),
    name: clean(entry.displayName, 50),
    callouts: Array.isArray(entry.callouts) ? entry.callouts.length : 0,
    image: validImage(entry.splash || entry.displayIcon)
  };
}
function sanitizeWeapon(entry) {
  if (!entry || !entry.uuid) return null;
  return {
    id: clean(entry.uuid, 80),
    name: clean(entry.displayName, 50),
    category: clean((entry.shopData && entry.shopData.categoryText) || entry.category, 55),
    cost: Math.max(0, Number(entry.shopData && entry.shopData.cost) || 0),
    image: validImage(entry.displayIcon),
    skins: Array.isArray(entry.skins) ? entry.skins.filter(s=>s&&s.uuid).map(s=>({
      id:clean(s.uuid,80),name:clean(s.displayName,100),tier:clean(s.contentTierUuid,80),
      image:validImage(s.displayIcon || s.chromas?.[0]?.fullRender),
      levels:(s.levels||[]).map((l,i)=>({id:clean(l.uuid,80),level:i+1,name:clean(l.displayName,100),image:validImage(l.displayIcon)})),
      chromas:(s.chromas||[]).map(c=>({id:clean(c.uuid,80),name:clean(c.displayName,100),image:validImage(c.fullRender || c.displayIcon),swatch:validImage(c.swatch)}))
    })) : []
  };
}
async function getCatalog(kind, opts = {}) {
  if (!Object.prototype.hasOwnProperty.call(ENDPOINTS, kind)) throw new Error('Unknown catalog kind');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await (opts.fetch || fetch)(ENDPOINTS[kind], { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error('Game content is temporarily unavailable (' + response.status + ').');
    const data = await response.json();
    if (data.status !== 200 || !Array.isArray(data.data)) throw new Error('Unexpected game content response.');
    const simple=['buddies','cards','sprays','titles','bundles'].includes(kind);
    const parser = simple ? entry=>entry&&entry.uuid?{id:clean(entry.uuid,80),name:clean(entry.titleText || entry.displayName,100),image:validImage(entry.largeArt || entry.displayIcon || entry.displayIcon2 || entry.fullIcon),banner:validImage(entry.wideArt || entry.displayIcon),levels:(entry.levels||[]).map(l=>({id:clean(l.uuid,80),name:clean(l.displayName,100),image:validImage(l.displayIcon)}))}:null : kind==='ranks' ? entry=>entry&&entry.uuid?{id:clean(entry.uuid,80),tiers:(entry.tiers||[]).map(t=>({tier:t.tier,name:clean(t.tierName,50),image:validImage(t.largeIcon || t.smallIcon)}))}:null : kind === 'skinlevels' ? entry => entry && entry.uuid ? {id: clean(entry.uuid,80), name:clean(entry.displayName,100), image:validImage(entry.displayIcon)} : null : kind === 'agents' ? sanitizeAgent : kind === 'maps' ? sanitizeMap : sanitizeWeapon;
    const list = data.data.map(parser).filter(Boolean);
    if (!list.length) throw new Error('No ' + kind + ' information was returned.');
    return list;
  } finally { clearTimeout(timeout); }
}
module.exports = { getCatalog, sanitizeAgent, sanitizeMap, sanitizeWeapon, validImage };

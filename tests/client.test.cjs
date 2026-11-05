'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {RiotClient,parseLockfile}=require('../electron/client.cjs');
const own='11111111-1111-1111-1111-111111111111';
const party='22222222-2222-2222-2222-222222222222';
const agent='33333333-3333-3333-3333-333333333333';
function fixture(routes={}){
  const calls=[];
  const client=new RiotClient({readLockfile:async()=> 'Riot:123:4567:private-password:https',localRequest:async()=>({subject:own,accessToken:'private-access',token:'private-entitlement'}),fetchJSON:async(url,opts)=>{
    calls.push({url,opts});
    if(url.endsWith('/v1/version'))return {ok:true,json:async()=>({data:{riotClientVersion:'release-shipping-test'}})};
    const route=new URL(url).pathname;let value=routes[route];if(typeof value==='function')value=await value(url,opts);
    const status=value?.status || (value===undefined?404:200);
    return {ok:status>=200&&status<300,status,json:async()=>value?.body || value};
  }});return {client,calls};
}
test('lockfile rejects invalid ports, protocols and malformed input',()=>{
  assert.deepEqual(parseLockfile('Riot:123:4567:secret:https'),{port:4567,password:'secret'});
  for(const raw of ['x','Riot:1:0:secret:https','Riot:1:70000:secret:https','Riot:1:123:secret:http'])assert.throws(()=>parseLockfile(raw));
});
test('connection keeps bearer credentials out of the returned state',async()=>{
  const {client}=fixture();const result=await client.connect('na');
  assert.deepEqual(result,{connected:true,region:'na'});
  assert.ok(!JSON.stringify(result).includes('private'));
  client.disconnect();await assert.rejects(client.shop(),/Connect/);
});
test('daily shop maps offer IDs, VP cost and reset time',async()=>{
  const {client,calls}=fixture({['/store/v3/storefront/'+own]:{SkinsPanelLayout:{SingleItemOffers:[agent],SingleItemOffersRemainingDurationInSeconds:3600,SingleItemStoreOffers:[{OfferID:agent,Cost:{VP:1775}}]}}});
  await client.connect('eu');const shop=await client.shop();assert.equal(shop.offers[0].cost.VP,1775);
  assert.ok(shop.expiresAt>Date.now()+3500000);
  const request=calls.find(x=>x.url.includes('/store/v3/storefront/'));
  assert.equal(request.url,'https://pd.eu.a.pvp.net/store/v3/storefront/'+own);
  assert.equal(request.opts.method,'POST');
});
test('party member cannot start queue and missing party does not send actions',async()=>{
  const {client,calls}=fixture({['/parties/v1/players/'+own]:{CurrentPartyID:party},['/parties/v1/parties/'+party]:{State:'DEFAULT',Members:[{Subject:own,IsOwner:false}]}});
  await client.connect('na');await assert.rejects(client.action('queue'),/leader/);
  assert.equal(calls.filter(x=>x.opts?.method==='POST').length,0);
});
test('ready writes only to the authenticated member in a fresh party',async()=>{
  const route='/parties/v1/parties/'+party+'/members/'+own+'/setReady';
  const {client,calls}=fixture({['/parties/v1/players/'+own]:{CurrentPartyID:party},['/parties/v1/parties/'+party]:{State:'DEFAULT',Members:[{Subject:own}]},[route]:{status:204}});
  await client.connect('na');await client.action('ready');
  assert.equal(calls.at(-1).url,'https://glz-na-1.na.a.pvp.net'+route);
  assert.deepEqual(JSON.parse(calls.at(-1).opts.body),{ready:true});
});
test('agent locking requires active pregame and uses a fresh match ID',async()=>{
  const {client,calls}=fixture({['/pregame/v1/players/'+own]:{MatchID:party},['/pregame/v1/matches/'+party+'/lock/'+agent]:{status:204}});
  await client.connect('na');await client.action('lock',agent);
  assert.equal(calls.at(-1).url,'https://glz-na-1.na.a.pvp.net/pregame/v1/matches/'+party+'/lock/'+agent);
  await assert.rejects(client.action('lock','../../bad'),/Choose an agent/);
});
test('expired session is cleared without leaking response bodies',async()=>{
  const {client}=fixture({['/store/v3/storefront/'+own]:{status:401,body:{secret:'never-show'}}});
  await client.connect('na');await assert.rejects(client.shop(),/Reconnect/);assert.equal(client.session,null);
});
test('disconnect during connection prevents late response from restoring session',async()=>{
  const {client}=fixture();let release;client.local=()=>new Promise(r=>release=r);
  const pending=client.connect('na');await new Promise(r=>setImmediate(r));client.disconnect();
  release({subject:own,accessToken:'private',token:'private'});
  await assert.rejects(pending,/canceled/);assert.equal(client.session,null);
});
test('masked names do not prevent permitted rank and history requests',async()=>{
  const hidden='44444444-4444-4444-4444-444444444444';
  const {client,calls}=fixture({
    ['/core-game/v1/players/'+own]:{MatchID:party},
    ['/core-game/v1/matches/'+party]:{Players:[{Subject:own,TeamID:'Blue',PlayerIdentity:{Incognito:false}},{Subject:hidden,TeamID:'Red',PlayerIdentity:{Incognito:true}}]},
    '/name-service/v2/players':[{Subject:own,GameName:'Myself',TagLine:'NA1'}],
    ['/mmr/v1/players/'+own]:{LatestCompetitiveUpdate:{TierAfterUpdate:18,RankedRatingAfterUpdate:50}}
  });
  await client.connect('na');const players=await client.players();
  assert.equal(players[0].name,'Myself#NA1');assert.equal(players[0].rank.tier,18);
  assert.equal(players[1].name,'Hidden player');assert.equal(players[1].puuid,hidden);assert.equal(players[1].rank,null);
  assert.ok(calls.some(x=>x.url.includes('/mmr/v1/players/'+hidden)));
  await assert.rejects(client.playerStats(hidden),/history unavailable/);
  assert.ok(calls.some(x=>x.url.includes('/match-history/v1/history/'+hidden)));
  assert.ok(client.session);
  const nameRequest=calls.find(x=>x.url.includes('/name-service/'));
  assert.deepEqual(JSON.parse(nameRequest.opts.body),[own,hidden]);
});
const {ITEM_TYPES}=require('../electron/store.cjs');
const weapon='99999999-9999-9999-9999-999999999999';
const skin='55555555-5555-5555-5555-555555555555';
const level='66666666-6666-6666-6666-666666666666';
const chroma='77777777-7777-7777-7777-777777777777';
const locked='88888888-8888-8888-8888-888888888888';
function lockerFixture(owns=true){
 const original={Subject:own,Version:41,Guns:[{ID:weapon,SkinID:party,SkinLevelID:agent,ChromaID:party,CharmID:party,Attachments:[{kept:true}]},{ID:party,SkinID:party,SkinLevelID:party,ChromaID:party,Attachments:[]}],Sprays:[{EquipSlotID:party,SprayID:agent,SprayLevelID:null}],Identity:{PlayerCardID:agent,PlayerTitleID:party,AccountLevel:50,HideAccountLevel:true},Incognito:true};
 const route='/personalization/v2/players/'+own+'/playerloadout';
 let saved=null;
 const f=fixture({[route]:(url,opts)=>{if(opts.method==='PUT'){saved=JSON.parse(opts.body);return {Subject:own,Version:42,...saved};}return structuredClone(original);},['/store/v1/entitlements/'+own]:{EntitlementsByTypes:[{ItemTypeID:ITEM_TYPES.skin,Entitlements:owns?[{ItemID:level}]:[]},{ItemTypeID:ITEM_TYPES.card,Entitlements:[{ItemID:skin}]},{ItemTypeID:ITEM_TYPES.spray,Entitlements:[{ItemID:skin}]}]}});
 return {...f,original,getSaved:()=>saved,catalog:{weapons:[{id:weapon,skins:[{id:skin,levels:[{id:level}],chromas:[{id:chroma},{id:locked}]}]}],buddies:[]}};
}
test('equipping an owned skin uses a fresh loadout and preserves every unrelated field',async()=>{
 const f=lockerFixture();await f.client.connect('na');await f.client.equip({kind:'weapon',weaponId:weapon,levelId:level,chromaId:chroma},f.catalog);
 const saved=f.getSaved();assert.equal(saved.Guns[0].SkinID,skin);assert.equal(saved.Guns[0].SkinLevelID,level);assert.deepEqual(saved.Guns[1],f.original.Guns[1]);assert.deepEqual(saved.Identity,f.original.Identity);assert.deepEqual(saved.Sprays,f.original.Sprays);assert.equal(saved.Incognito,true);assert.deepEqual(saved.Guns[0].Attachments,[{kept:true}]);assert.ok(!('Subject'in saved));assert.ok(!('Version'in saved));
});
test('unowned levels and locked chromas never reach a loadout PUT',async()=>{
 const f=lockerFixture(false);await f.client.connect('na');await assert.rejects(f.client.equip({kind:'weapon',weaponId:weapon,levelId:level,chromaId:chroma},f.catalog),/do not own/);assert.equal(f.getSaved(),null);
 const g=lockerFixture();await g.client.connect('na');await assert.rejects(g.client.equip({kind:'weapon',weaponId:weapon,levelId:level,chromaId:locked},g.catalog),/not unlocked/);assert.equal(g.getSaved(),null);
});
test('cross-weapon skins and unknown spray slots are rejected',async()=>{
 const f=lockerFixture();await f.client.connect('na');await assert.rejects(f.client.equip({kind:'weapon',weaponId:party,levelId:level,chromaId:chroma},f.catalog),/does not belong/);
 await assert.rejects(f.client.equip({kind:'spray',itemId:skin,slotId:weapon},f.catalog),/valid spray slot/);assert.equal(f.getSaved(),null);
});
test('owned cards update identity without changing privacy or weapon fields',async()=>{
 const f=lockerFixture();await f.client.connect('na');await f.client.equip({kind:'card',itemId:skin},f.catalog);
 assert.equal(f.getSaved().Identity.PlayerCardID,skin);assert.equal(f.getSaved().Identity.HideAccountLevel,true);assert.deepEqual(f.getSaved().Guns,f.original.Guns);
});
test('shop resolves missing prices from global offers and separates wallet currencies',async()=>{
 const vp='85ad13f7-3d1b-5128-9eb2-7cd8a9b7e876';
 const {client,calls}=fixture({['/store/v3/storefront/'+own]:{SkinsPanelLayout:{SingleItemOffers:[agent]}},'/store/v1/offers/':{Offers:[{OfferID:agent,Cost:{[vp]:2175},Rewards:[{ItemID:skin}]}]},['/store/v1/wallet/'+own]:{Balances:{[vp]:900}}});
 await client.connect('na');const shop=await client.shop();assert.equal(shop.offers[0].cost[vp],2175);assert.equal(shop.offers[0].itemId,skin);assert.equal(shop.balances[vp],900);assert.ok(calls.some(c=>c.url.endsWith('/store/v1/offers/')));
});
test('shop falls back to the documented v2 storefront after a v3 404',async()=>{
 const {client,calls}=fixture({['/store/v2/storefront/'+own]:{SkinsPanelLayout:{SingleItemOffers:[],SingleItemStoreOffers:[]}}});await client.connect('na');await client.shop();assert.equal(calls.find(c=>c.url.includes('/store/v2/')).opts.method,'GET');
});
test('player stats refuse identities absent from the visible roster',async()=>{
 const {client,calls}=fixture();await client.connect('na');const before=calls.length;await assert.rejects(client.playerStats(party),/visible players/);assert.equal(calls.length,before);
});
test('recent competitive stats aggregate completed matches and are cached',async()=>{
 const match={matchInfo:{matchId:party,mapId:'/Game/Maps/Ascent/Ascent',queueId:'competitive'},players:[{puuid:own,teamId:'Blue',stats:{kills:20,deaths:10,assists:5,score:5000,roundsPlayed:20}}],teams:[{teamId:'Blue',won:true}],roundResults:[]};
 const {client,calls}=fixture({['/match-history/v1/history/'+own]:{History:[{MatchID:party}]},['/match-details/v1/matches/'+party]:match});await client.connect('na');const stats=await client.playerStats(own);assert.equal(stats.metrics.kd,2);assert.equal(stats.metrics.acs,250);assert.equal(stats.metrics.winRate,100);const before=calls.length;const again=await client.playerStats(own);assert.equal(again.cached,true);assert.equal(calls.length,before);client.disconnect();assert.equal(client.statsCache.size,0);
});
test('a response from a disconnected session is discarded',async()=>{
 const {client}=fixture();await client.connect('na');let release;client.fetch=()=>new Promise(r=>release=r);const pending=client.lobby();client.disconnect();release({ok:true,status:200,json:async()=>({CurrentPartyID:party})});await assert.rejects(pending,/connection changed/);
});
test('private player history cannot invalidate the signed-in account session',async()=>{
 const {client}=fixture({['/match-history/v1/history/'+party]:{status:403}});await client.connect('na');client.visiblePlayers.add(party);await assert.rejects(client.playerStats(party),/unavailable/);assert.ok(client.session);
});
test('recent K/D, ACS and HS percentage use totals, not averages of match ratios',async()=>{
 const first={matchInfo:{matchId:party},players:[{puuid:own,stats:{kills:20,deaths:10,roundsPlayed:20,score:5000}}],roundResults:[{playerStats:[{puuid:own,damage:[{headshots:1,bodyshots:1,damage:200}]}]}]};
 const second={matchInfo:{matchId:agent},players:[{puuid:own,stats:{kills:1,deaths:1,roundsPlayed:10,score:1000}}],roundResults:[{playerStats:[{puuid:own,damage:[{headshots:0,bodyshots:8,damage:100}]}]}]};
 const {client}=fixture({['/match-history/v1/history/'+own]:{History:[{MatchID:party},{MatchID:agent}]},['/match-details/v1/matches/'+party]:first,['/match-details/v1/matches/'+agent]:second});await client.connect('na');const stats=await client.playerStats(own);assert.equal(stats.metrics.kd,1.91);assert.equal(stats.metrics.acs,200);assert.equal(stats.metrics.hs,10);assert.equal(stats.metrics.adr,10);
});
test('real client match-detail contract no longer produces the empty-summary error',async()=>{
 const detail=require('./fixtures/client-match-detail.json'),id=detail.matchInfo.matchId;
 const {client}=fixture({['/match-history/v1/history/'+own]:{History:[{MatchID:id}]},['/match-details/v1/matches/'+id]:detail});
 await client.connect('na');const stats=await client.playerStats(own);assert.equal(stats.metrics.played,1);assert.equal(stats.metrics.kd,1.9);assert.equal(stats.metrics.acs,303);assert.equal(stats.metrics.hs,34.5);assert.equal(stats.metrics.adr,206);
 assert.equal(Object.values(stats.agents)[0].played,1);
});
test('lobby roster loads party members and confirmed party grouping without a current match',async()=>{
 const {client,calls}=fixture({['/parties/v1/players/'+own]:{CurrentPartyID:party},['/parties/v1/parties/'+party]:{ID:party,Members:[{Subject:own,PlayerIdentity:{Incognito:false}},{Subject:agent,PlayerIdentity:{Incognito:false}}]},'/name-service/v2/players':[{Subject:own,GameName:'Me',TagLine:'NA1'},{Subject:agent,GameName:'Teammate',TagLine:'NA1'}]});
 await client.connect('na');client.local=async()=>({presences:[{puuid:own,product:'valorant',private:Buffer.from(JSON.stringify({sessionLoopState:'MENUS'})).toString('base64')}]});
 const roster=await client.roster();assert.equal(roster.phase,'lobby');assert.equal(roster.players.length,2);assert.equal(roster.players[0].partyGroup,roster.players[1].partyGroup);assert.ok(!calls.some(c=>c.url.includes('/core-game/')));
});
test('agent-select roster is available before core-game and does not invent opponents',async()=>{
 const {client}=fixture({['/pregame/v1/players/'+own]:{MatchID:party},['/pregame/v1/matches/'+party]:{ID:party,PregameState:'character_select_active',MapID:'/Game/Maps/Ascent/Ascent',EnemyTeamSize:5,AllyTeam:{TeamID:'Blue',Players:[{Subject:own},{Subject:agent,PlayerIdentity:{Incognito:false}}]},EnemyTeam:null},'/name-service/v2/players':[{Subject:own,GameName:'Me',TagLine:'NA1'},{Subject:agent,GameName:'Ally',TagLine:'NA1'}]});
 await client.connect('na');const roster=await client.roster();assert.equal(roster.phase,'agent-select');assert.equal(roster.players.length,2);assert.equal(roster.enemyExpected,5);assert.equal(roster.players.filter(p=>p.team==='Opponent').length,0);
});
test('provisioned pregame uses the supplied core-game roster during loading',async()=>{
 const {client}=fixture({['/pregame/v1/players/'+own]:{MatchID:party},['/pregame/v1/matches/'+party]:{ID:party,PregameState:'provisioned',AllyTeam:{TeamID:'Blue',Players:[{Subject:own}]}},['/core-game/v1/players/'+own]:{MatchID:party},['/core-game/v1/matches/'+party]:{MatchID:party,MapID:'/Game/Maps/Ascent/Ascent',Players:[{Subject:own,TeamID:'Blue'},{Subject:agent,TeamID:'Red',PlayerIdentity:{Incognito:false}}]}});
 await client.connect('na');const roster=await client.roster();assert.equal(roster.phase,'match');assert.equal(roster.players.length,2);assert.equal(roster.players[1].team,'Opponent');
});
test('masked Riot IDs are shown only when returned by Riot for roster participants',async()=>{
 const {client}=fixture({['/core-game/v1/players/'+own]:{MatchID:party},['/core-game/v1/matches/'+party]:{Players:[{Subject:own,TeamID:'Blue'},{Subject:agent,TeamID:'Red',PlayerIdentity:{Incognito:true}}]},'/name-service/v2/players':[{Subject:agent,GameName:'ReturnedByRiot',TagLine:'NA1'}]});
 await client.connect('na');const roster=await client.roster();assert.equal(roster.players[1].name,'ReturnedByRiot#NA1');assert.equal(roster.players[1].puuid,agent);assert.ok(client.visiblePlayers.has(agent));
});
test('concurrent player reports coalesce shared match-detail requests',async()=>{
 const detail=require('./fixtures/client-match-detail.json'),id=detail.matchInfo.matchId;
 const {client,calls}=fixture({['/match-history/v1/history/'+own]:{History:[{MatchID:id}]},['/match-history/v1/history/'+party]:{History:[{MatchID:id}]},['/match-details/v1/matches/'+id]:detail});
 await client.connect('na');client.visiblePlayers.add(party);await Promise.all([client.playerStats(own),client.playerStats(party)]);assert.equal(calls.filter(c=>c.url.includes('/match-details/')).length,1);
});

test('default history requests include every queue and keep diagnostics after roster polling',async()=>{
 const detail=structuredClone(require('./fixtures/client-match-detail.json'));detail.matchInfo.queueID='swiftplay';
 const id=detail.matchInfo.matchId;const {client,calls}=fixture({['/match-history/v1/history/'+own]:{History:[{MatchID:id,QueueID:'swiftplay'}]},['/match-details/v1/matches/'+id]:detail});
 await client.connect('na');const stats=await client.playerStats(own);assert.equal(stats.matches[0].queue,'swiftplay');assert.deepEqual(stats.modes,['all']);
 const url=new URL(calls.find(c=>c.url.includes('/match-history/')).url);assert.equal(url.searchParams.has('queue'),false);
 for(let i=0;i<45;i++)await client.request('glz','/pregame/v1/players/'+own);
 assert.equal(client.featureDiagnostics.history.entries,1);assert.ok(!JSON.stringify(client.featureDiagnostics).includes(own));
});
test('changing queue filters uses a separate cache and sends the selected server filter',async()=>{
 const detail=structuredClone(require('./fixtures/client-match-detail.json'));const id=detail.matchInfo.matchId;
 const other=structuredClone(detail);other.matchInfo.matchId=party;other.matchInfo.queueID='swiftplay';
 const {client,calls}=fixture({['/match-history/v1/history/'+own]:(url)=>({History:[{MatchID:new URL(url).searchParams.get('queue')==='swiftplay'?party:id,QueueID:new URL(url).searchParams.get('queue') || 'competitive'}]}),['/match-details/v1/matches/'+id]:detail,['/match-details/v1/matches/'+party]:other});
 await client.connect('na');await client.playerStats(own,['competitive']);await client.playerStats(own,['swiftplay']);
 assert.equal(calls.filter(c=>c.url.includes('/match-history/')).length,2);assert.equal(client.statsCache.size,2);assert.equal(new URL(calls.filter(c=>c.url.includes('/match-history/')).at(-1).url).searchParams.get('queue'),'swiftplay');
});
test('locker reads optional privacy omissions, uses canonical entitlement route and blocks unsafe writes',async()=>{
 const {client,calls}=fixture({['/personalization/v2/players/'+own+'/playerloadout']:{Subject:own,Guns:[],Identity:{HideAccountLevel:true}},['/store/v1/entitlements/'+own+'/']:{EntitlementsByTypes:[]}});
 await client.connect('na');const inventory=await client.inventory();assert.deepEqual(inventory.loadout.Sprays,[]);assert.ok(inventory.warnings.length);assert.ok(calls.some(c=>c.url.endsWith('/entitlements/'+own+'/')));
 await assert.rejects(client.equip({kind:'card'},{}),/privacy settings/);assert.ok(!calls.some(c=>c.opts.method==='PUT'&&c.url.includes('playerloadout')));
});
test('locker falls back to category entitlements and still shows current loadout on ownership failure',async()=>{
 const {client}=fixture({['/personalization/v2/players/'+own+'/playerloadout']:{Subject:own,Guns:[],Identity:{},Sprays:[],Incognito:true},['/store/v1/entitlements/'+own+'/'+ITEM_TYPES.skin]:{Entitlements:[{ItemID:level}]}});
 await client.connect('na');const inventory=await client.inventory();assert.equal(inventory.owned[ITEM_TYPES.skin][0].id,level);assert.ok(inventory.warnings.length);
});
test('masked roster participants load permitted history without revealing a withheld name',async()=>{
 const hidden='44444444-4444-4444-4444-444444444444';const detail=structuredClone(require('./fixtures/client-match-detail.json'));detail.players[0].subject=hidden;for(const round of detail.roundResults)for(const player of round.playerStats)if(player.subject===own)player.subject=hidden;
 const id=detail.matchInfo.matchId;const {client}=fixture({['/core-game/v1/players/'+own]:{MatchID:party},['/core-game/v1/matches/'+party]:{Players:[{Subject:own,TeamID:'Blue'},{Subject:hidden,TeamID:'Red',PlayerIdentity:{Incognito:true}}]},'/name-service/v2/players':[],['/match-history/v1/history/'+hidden]:{History:[{MatchID:id,QueueID:'competitive'}]},['/match-details/v1/matches/'+id]:detail});
 await client.connect('na');const roster=await client.roster();assert.equal(roster.players[1].name,'Hidden player');const stats=await client.playerStats(hidden);assert.equal(stats.metrics.kd,1.9);assert.equal(stats.metrics.played,1);assert.ok(client.session);
});

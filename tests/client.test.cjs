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
    const route=new URL(url).pathname;const value=routes[route];
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
  assert.equal(calls.at(-1).url,'https://pd.eu.a.pvp.net/store/v3/storefront/'+own);
  assert.equal(calls.at(-1).opts.method,'POST');
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
test('active-match ranks never resolve or query hidden player identities',async()=>{
  const hidden='44444444-4444-4444-4444-444444444444';
  const {client,calls}=fixture({
    ['/core-game/v1/players/'+own]:{MatchID:party},
    ['/core-game/v1/matches/'+party]:{Players:[{Subject:own,TeamID:'Blue',PlayerIdentity:{Incognito:false}},{Subject:hidden,TeamID:'Red',PlayerIdentity:{Incognito:true}}]},
    '/name-service/v2/players':[{Subject:own,GameName:'Myself',TagLine:'NA1'}],
    ['/mmr/v1/players/'+own]:{LatestCompetitiveUpdate:{TierAfterUpdate:18,RankedRatingAfterUpdate:50}}
  });
  await client.connect('na');const players=await client.players();
  assert.equal(players[0].name,'Myself#NA1');assert.equal(players[0].rank.tier,18);
  assert.deepEqual(players[1],{name:'Hidden player',team:'Opponent',rank:null});
  assert.ok(!calls.some(x=>x.url.includes(hidden)));
  const nameRequest=calls.find(x=>x.url.includes('/name-service/'));
  assert.deepEqual(JSON.parse(nameRequest.opts.body),[own]);
});

'use strict';
// Unofficial Riot Client integration. Credentials never cross the preload bridge.
const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REGIONS = {na:'na-1',eu:'eu-1',ap:'ap-1',kr:'kr-1',br:'na-1',latam:'na-1'};
const { normalizeStore, ITEM_TYPES } = require('./store.cjs');
const Modes=require('../src/modes.js');
const { analyzeMatch, aggregateRecent, playerId } = require('../src/analytics.cjs');
const PLATFORM = Buffer.from(JSON.stringify({platformType:'PC',platformOS:'Windows',platformOSVersion:'10.0.19045.1.256.64bit',platformChipset:'Unknown'})).toString('base64');
function parseLockfile(raw) {
  const parts = raw.trim().split(':');
  if (parts.length !== 5 || !/^\d+$/.test(parts[2]) || Number(parts[2]) < 1 || Number(parts[2]) > 65535 || !parts[3] || parts[4] !== 'https') throw new Error('Invalid Riot Client lockfile. Restart Riot Client and reconnect.');
  return {port:Number(parts[2]),password:parts[3]};
}
function localJSON(lock, route) {
  return new Promise((resolve,reject)=>{
    // Riot's loopback service uses a self-signed certificate. This exception is
    // confined to literal 127.0.0.1 and the lockfile port; remote TLS stays verified.
    const req = https.request({hostname:'127.0.0.1',port:lock.port,path:route,method:'GET',rejectUnauthorized:false,
      headers:{Authorization:'Basic '+Buffer.from('riot:'+lock.password).toString('base64'),Accept:'application/json'}},res=>{
      const chunks=[]; let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)req.destroy(new Error('Riot Client response too large'));else chunks.push(chunk);});
      res.on('end',()=>{if(res.statusCode!==200)return reject(new Error('Riot Client session unavailable. Sign in to Riot Client and reconnect.'));try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch{reject(new Error('Invalid Riot Client response'));}});
    });
    req.setTimeout(8000,()=>req.destroy(new Error('Riot Client timed out')));
    req.on('error',()=>reject(new Error('Cannot reach Riot Client. Keep Riot Client running and sign in.')));req.end();
  });
}
class RiotClient {
  constructor({fetchJSON=fetch,readLockfile,localRequest=localJSON}={}) {
    this.fetch=fetchJSON; this.readLockfile=readLockfile || (()=>{
      if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw new Error('Local Riot Client connection requires Windows.');
      return fs.readFile(path.join(process.env.LOCALAPPDATA,'Riot Games','Riot Client','Config','lockfile'),'utf8');
    }); this.local=localRequest;this.session=null;this.generation=0;this.visiblePlayers=new Set();this.statsCache=new Map();this.matchCache=new Map();this.rankCache=new Map();this.statsInflight=new Map();this.matchInflight=new Map();this.localLock=null;this.diagnostics=[];this.partyCache=null;this.nameCache=new Map();this.featureDiagnostics={};
  }
  disconnect(){this.generation++;this.session=null;this.visiblePlayers.clear();this.statsCache.clear();this.matchCache.clear();this.rankCache.clear();this.statsInflight.clear();this.matchInflight.clear();this.localLock=null;this.partyCache=null;this.nameCache.clear();}
  async connect(region) {
    this.disconnect();const generation=this.generation;
    if(!REGIONS[region])throw new Error('Choose a supported region in Settings.');
    const lock=parseLockfile(await this.readLockfile());
    const auth=await this.local(lock,'/entitlements/v1/token');
    if(!UUID.test(auth.subject)||!auth.accessToken||!auth.token)throw new Error('Sign in to Riot Client first.');
    const res=await this.fetch('https://valorant-api.com/v1/version',{signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw new Error('Could not load the current VALORANT client version.');
    const version=await res.json();
    if(!version.data?.riotClientVersion)throw new Error('VALORANT version service returned invalid data.');
    if(generation!==this.generation)throw new Error('Connection canceled.');
    this.localLock=lock;
    this.session={puuid:auth.subject,access:auth.accessToken,entitlement:auth.token,region,version:version.data.riotClientVersion};
    return {connected:true,region};
  }
  async request(service,route,method='GET',body,session=this.session,{permissionFailure=false}={}) {
    const s=session;if(!s)throw new Error('Connect Riot Client first.');
    if(s!==this.session)throw new Error('The account connection changed. Refresh and try again.');
    const host=service==='pd'?`pd.${s.region}.a.pvp.net`:`glz-${REGIONS[s.region]}.${s.region}.a.pvp.net`;
    const response=await this.fetch('https://'+host+route,{method,signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+s.access,'X-Riot-Entitlements-JWT':s.entitlement,'X-Riot-ClientVersion':s.version,'X-Riot-ClientPlatform':PLATFORM,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(s!==this.session)throw new Error('The account connection changed. Refresh and try again.');
    this.diagnostics.push({at:new Date().toISOString(),service,method,path:route.split('?')[0].replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,':id'),status:response.status});
    if(this.diagnostics.length>40)this.diagnostics.shift();
    const feature=route.includes('/name-service/')?'names':route.includes('/match-history/')?'history':route.includes('/match-details/')?'matchDetails':route.includes('/playerloadout')?'loadout':route.includes('/entitlements/')?'ownership':route.includes('/mmr/')?'rank':null;
    if(feature)this.featureDiagnostics[feature]={...this.diagnostics.at(-1)};
    if(response.status===403&&permissionFailure)return null;
    if(response.status===401||response.status===403){if(this.session===s)this.disconnect();throw new Error('Riot rejected this session. Reconnect Riot Client and check your region.');}
    if(response.status===404)return null;
    if(!response.ok)throw new Error(response.status===429?'Riot rate limit reached. Wait before retrying.':'Riot Client request failed (HTTP '+response.status+'). Refresh before retrying.');
    if(response.status===204)return {};
    const result=await response.json();
    if(feature){const record=this.featureDiagnostics[feature];if(feature==='names')Object.assign(record,{requested:Array.isArray(body)?body.length:null,returned:Array.isArray(result)?result.length:null,named:Array.isArray(result)?result.filter(p=>p.GameName).length:null});if(feature==='history')Object.assign(record,{historyArray:Array.isArray(result?.History),entries:result?.History?.length ?? null,total:result?.Total ?? null});if(feature==='loadout')Object.assign(record,{guns:Array.isArray(result?.Guns),identity:Boolean(result?.Identity),sprays:Array.isArray(result?.Sprays),privacy:typeof result?.Incognito==='boolean'});if(feature==='ownership')Object.assign(record,{groups:result?.EntitlementsByTypes?.length ?? null,entries:result?.Entitlements?.length ?? null});}
    if(s!==this.session)throw new Error('The account connection changed. Refresh and try again.');
    return result;
  }
  async shop(){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    let data=await this.request('pd',`/store/v3/storefront/${s.puuid}`,'POST',{},s);
    if(!data)data=await this.request('pd',`/store/v2/storefront/${s.puuid}`,'GET',undefined,s);
    if(!data?.SkinsPanelLayout)throw new Error('Daily shop was not returned. Check your account region.');
    let store=normalizeStore(data);const warnings=[];
    if(store.offers.some(offer=>!Object.keys(offer.cost).length)){
      try {const prices=await this.request('pd','/store/v1/offers/','GET',undefined,s);store=normalizeStore(data,prices?.Offers || []);}
      catch(error){if(!this.session || this.session!==s)throw error;warnings.push('Some prices could not be loaded.');}
    }
    let balances={};
    try{balances=(await this.request('pd',`/store/v1/wallet/${s.puuid}`,'GET',undefined,s))?.Balances || {};}
    catch(error){if(!this.session || this.session!==s)throw error;warnings.push('Wallet balance unavailable.');}
    return {...store,balances,warnings};
  }
  async inventory(){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    const loadout=await this.request('pd',`/personalization/v2/players/${s.puuid}/playerloadout`,'GET',undefined,s);
    if(!loadout || loadout.Subject&&loadout.Subject!==s.puuid || !Array.isArray(loadout.Guns) || !loadout.Identity)throw new Error('Riot did not return your weapon loadout. Copy endpoint diagnostics.');
    const warnings=[];const writeSafe=Array.isArray(loadout.Sprays)&&loadout.Subject===s.puuid;
    if(!writeSafe||typeof loadout.Incognito!=='boolean')warnings.push('Equipping unavailable until Riot returns complete loadout and privacy settings.');
    if(!Array.isArray(loadout.Sprays)){loadout.Sprays=[];warnings.push('Spray slots unavailable.');}
    let data=await this.request('pd',`/store/v1/entitlements/${s.puuid}/`,'GET',undefined,s,{permissionFailure:true});
    if(!data)data=await this.request('pd',`/store/v1/entitlements/${s.puuid}`,'GET',undefined,s,{permissionFailure:true});
    const owned={};
    if(Array.isArray(data?.EntitlementsByTypes)){
      for(const group of data.EntitlementsByTypes)owned[group.ItemTypeID]=(group.Entitlements || []).map(item=>({id:item.ItemID,instanceId:item.InstanceID}));
    }else{
      // Some deployments only answer category-scoped entitlement requests.
      for(const type of Object.values(ITEM_TYPES)){
        const category=await this.request('pd',`/store/v1/entitlements/${s.puuid}/${type}`,'GET',undefined,s,{permissionFailure:true});
        const items=category?.Entitlements || category?.EntitlementsByTypes?.find(g=>g.ItemTypeID===type)?.Entitlements;
        if(Array.isArray(items))owned[type]=items.map(item=>({id:item.ItemID,instanceId:item.InstanceID}));
        else warnings.push('An ownership category could not be loaded.');
      }
      if(!Object.keys(owned).length)warnings.push('Ownership unavailable; showing equipped items only. Retry or copy endpoint diagnostics.');
    }
    return {loadout,owned,writeSafe,warnings:[...new Set(warnings)]};
  }

  async equip(change, catalog){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    if(!change || !['weapon','card','title','spray','buddy'].includes(change.kind))throw new Error('Choose a supported locker item.');
    const {loadout,owned,writeSafe}=await this.inventory();
    if(typeof loadout.Incognito!=='boolean')throw new Error('Riot omitted privacy settings. Refresh before changing your loadout.');
    if(!writeSafe)throw new Error('Riot returned an incomplete loadout. Refresh before equipping.');
    const has=(type,id)=>(owned[type]||[]).some(x=>x.id===id);
    // Work on the freshest server loadout, preserving unrelated slots and settings.
    const body=structuredClone({Guns:loadout.Guns,Sprays:loadout.Sprays,Identity:loadout.Identity,Incognito:loadout.Incognito});
    if(change.kind==='weapon'){
      const weapon=catalog.weapons.find(w=>w.id===change.weaponId);
      const skin=weapon?.skins.find(sk=>sk.levels.some(l=>l.id===change.levelId));
      const gun=body.Guns.find(g=>g.ID===change.weaponId);
      const chroma=skin?.chromas.find(c=>c.id===change.chromaId);
      if(!gun||!skin||!chroma)throw new Error('This skin or variant does not belong to the selected weapon.');
      if(!has(ITEM_TYPES.skin,change.levelId)&&gun.SkinLevelID!==change.levelId)throw new Error('You do not own this skin level.');
      if(chroma.id!==skin.chromas[0]?.id&&!has(ITEM_TYPES.chroma,chroma.id)&&gun.ChromaID!==chroma.id)throw new Error('This variant is not unlocked.');
      gun.SkinID=skin.id;gun.SkinLevelID=change.levelId;gun.ChromaID=change.chromaId;
    }else if(change.kind==='buddy'){
      const gun=body.Guns.find(g=>g.ID===change.weaponId);
      const buddy=catalog.buddies.find(x=>x.levels.some(l=>l.id===change.itemId));
      const instance=(owned[ITEM_TYPES.buddy]||[]).find(x=>x.id===change.itemId&&x.instanceId===change.instanceId);
      if(change.weaponId==='2f59173c-4bed-b6c3-2191-dea9b58be9c7')throw new Error('Melee weapons cannot equip buddies.');
      if(!gun||!buddy||!instance||!UUID.test(instance.instanceId))throw new Error('Choose an owned buddy instance for this weapon.');
      const used=body.Guns.find(g=>g.CharmInstanceID===instance.instanceId&&g!==gun);
      if(used){used.CharmID='00000000-0000-0000-0000-000000000000';used.CharmLevelID='00000000-0000-0000-0000-000000000000';used.CharmInstanceID='00000000-0000-0000-0000-000000000000';}
      gun.CharmID=buddy.id;gun.CharmLevelID=change.itemId;gun.CharmInstanceID=instance.instanceId;
    }else{
      if(!UUID.test(change.itemId)||!has(ITEM_TYPES[change.kind],change.itemId))throw new Error('You do not own this item.');
      if(change.kind==='card')body.Identity.PlayerCardID=change.itemId;
      if(change.kind==='title')body.Identity.PlayerTitleID=change.itemId;
      if(change.kind==='spray'){
        const slot=body.Sprays.find(x=>x.EquipSlotID===change.slotId);
        if(!slot)throw new Error('Choose a valid spray slot.');slot.SprayID=change.itemId;slot.SprayLevelID=null;
      }
    }
    const result=await this.request('pd',`/personalization/v2/players/${s.puuid}/playerloadout`,'PUT',body,s);
    if(result?.Subject!==s.puuid)throw new Error('Riot did not confirm the loadout change. Refresh your locker.');
    return result;
  }
  async playerStats(puuid,selection=['all']){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    if(puuid!==s.puuid&&!this.visiblePlayers.has(puuid))throw new Error('Only your account and visible players in the current roster can be queried.');
    const cacheKey=puuid+'|'+Modes.key(selection);
    const cached=this.statsCache.get(cacheKey);if(cached&&cached.expires>Date.now())return {...cached.value,cached:true};
    if(this.statsInflight.has(cacheKey))return this.statsInflight.get(cacheKey);
    const work=this.fetchPlayerStats(puuid,s,selection,cacheKey);this.statsInflight.set(cacheKey,work);
    try{return await work;}finally{if(this.statsInflight.get(cacheKey)===work)this.statsInflight.delete(cacheKey);}
  }
  async fetchPlayerStats(puuid,s,selection,cacheKey){
    const modes=Modes.normalize(selection);let rows=[];
    for(let start=0;start<100&&rows.length<10;start+=20){
      const query=new URLSearchParams({startIndex:String(start),endIndex:String(start+20)});
      if(modes.length===1&&!['all','custom'].includes(modes[0]))query.set('queue',modes[0]);
      const history=await this.request('pd',`/match-history/v1/history/${puuid}?${query}`,'GET',undefined,s,{permissionFailure:true});
      if(!Array.isArray(history?.History)){
        const status=this.diagnostics.filter(d=>d.path.includes('/match-history/')).at(-1)?.status;
        throw new Error('Recent history unavailable'+(status?' (HTTP '+status+')':'')+'. Copy endpoint diagnostics.');
      }
      for(const row of history.History)if(Modes.includes(modes,row.QueueID)&&!rows.some(old=>old.MatchID===row.MatchID))rows.push(row);
      if(history.History.length<20||Number.isFinite(history.Total)&&start+20>=history.Total)break;
    }
    const matches=[];const partners=new Map();let unavailable=0;
    for(const row of rows.slice(0,10)){
      if(s!==this.session||puuid!==s.puuid&&!this.visiblePlayers.has(puuid))throw new Error('The visible roster changed.');
      if(!UUID.test(row.MatchID))continue;
      try{
        const detail=await this.matchDetail(row.MatchID,s);const parsed=analyzeMatch(detail,puuid);if(!Modes.includes(modes,parsed.queue))continue;matches.push(parsed);
        const owner=detail.players.find(p=>playerId(p)===puuid),party=owner?.partyId;
        if(party)for(const other of detail.players){const id=playerId(other);if(id!==puuid&&other.partyId===party&&this.visiblePlayers.has(id)){const old=partners.get(id)||{puuid:id,matches:0,lastPlayedAt:0};old.matches++;old.lastPlayedAt=Math.max(old.lastPlayedAt,detail.matchInfo?.gameStartMillis || 0);partners.set(id,old);}}
      }
      catch(error){if(!this.session||this.session!==s)throw error;unavailable++;}
    }
    if(!matches.length&&rows.length)throw new Error('Match details did not contain usable player stats. Copy diagnostics from the app.');
    if(s!==this.session || puuid!==s.puuid&&!this.visiblePlayers.has(puuid))throw new Error('The visible roster changed.');
    const agents={};
    for(const id of new Set(matches.map(m=>m.agentId).filter(Boolean)))agents[id]=aggregateRecent(matches.filter(m=>m.agentId===id));
    const value={source:'Riot Client · recent '+Modes.label(modes),modes,metrics:aggregateRecent(matches),agents,recentPartyPartners:[...partners.values()],matches,unavailable,fetchedAt:Date.now()};
    if(this.statsCache.size>=50)this.statsCache.delete(this.statsCache.keys().next().value);
    this.statsCache.set(cacheKey,{value,expires:Date.now()+300000});return value;
  }
  async matchDetail(id,s){
    if(this.matchCache.has(id))return this.matchCache.get(id);
    if(this.matchInflight.has(id))return this.matchInflight.get(id);
    const work=this.request('pd',`/match-details/v1/matches/${id}`,'GET',undefined,s,{permissionFailure:true});this.matchInflight.set(id,work);
    try{const value=await work;if(value){if(this.matchCache.size>=100)this.matchCache.delete(this.matchCache.keys().next().value);this.matchCache.set(id,value);}return value;}
    finally{if(this.matchInflight.get(id)===work)this.matchInflight.delete(id);}
  }
  async playerRank(id){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    if(id!==s.puuid&&!this.visiblePlayers.has(id))throw new Error('Player is not visible.');
    const cached=this.rankCache.get(id);if(cached&&cached.expires>Date.now())return cached.value;
    const mmr=await this.request('pd',`/mmr/v1/players/${id}`,'GET',undefined,s,{permissionFailure:true});
    if(!mmr)return null;
    const update=mmr.LatestCompetitiveUpdate;
    const seasons=Object.values(mmr.QueueSkills?.competitive?.SeasonalInfoBySeasonID || {});
    const latest=seasons.find(season=>season.SeasonID===update?.SeasonID);
    const tier=latest?.CompetitiveTier ?? update?.TierAfterUpdate;
    const value={rank:Number.isInteger(tier)?{tier,rr:latest?.RankedRating ?? update?.RankedRatingAfterUpdate}:null,peakTier:Math.max(0,...seasons.map(x=>x.CompetitiveTier || 0),Number(tier)||0)};
    this.rankCache.set(id,{value,expires:Date.now()+60000});return value;
  }
  async selfPresence(){
    if(!this.localLock||!this.session)return null;
    try{
      const data=await this.local(this.localLock,'/chat/v4/presences');
      const own=data?.presences?.find(p=>p.puuid===this.session?.puuid&&p.product==='valorant');
      if(!own?.private)return null;
      return JSON.parse(Buffer.from(own.private,'base64').toString('utf8'));
    }catch{return null;}
  }
  async currentParty(s=this.session){
    if(this.partyCache&&this.partyCache.expires>Date.now())return this.partyCache.value;
    const own=await this.request('glz',`/parties/v1/players/${s.puuid}`,'GET',undefined,s,{permissionFailure:true});
    const value=UUID.test(own?.CurrentPartyID)?await this.request('glz',`/parties/v1/parties/${own.CurrentPartyID}`,'GET',undefined,s,{permissionFailure:true}):null;
    this.partyCache={value,expires:Date.now()+15000};return value;
  }
  async roster(){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    const presence=await this.selfPresence();
    let phase='lobby',contextId='lobby',mapId='',queue=presence?.queueId || '',players=[],notice='',enemyExpected=0,party=null;
    if(presence?.sessionLoopState!=='MENUS'){
      const pre=await this.request('glz',`/pregame/v1/players/${s.puuid}`,'GET',undefined,s,{permissionFailure:true});
      const core=await this.request('glz',`/core-game/v1/players/${s.puuid}`,'GET',undefined,s,{permissionFailure:true});
      let preg=null;
      if(UUID.test(pre?.MatchID))preg=await this.request('glz',`/pregame/v1/matches/${pre.MatchID}`,'GET',undefined,s,{permissionFailure:true});
      if(preg){
        phase=preg.PregameState==='provisioned'?'loading':'agent-select';contextId=pre.MatchID;mapId=preg.MapID || '';queue=preg.QueueID || '';
        const teams=preg.Teams?.length?preg.Teams:[preg.AllyTeam,preg.EnemyTeam].filter(Boolean);
        for(const team of teams)for(const player of team.Players || [])if(!players.some(p=>p.Subject===player.Subject))players.push({...player,TeamID:team.TeamID});
        enemyExpected=preg.EnemyTeamSize || 5;
        notice='Opponent data appears when Riot supplies the match roster.';
      }
      if(UUID.test(core?.MatchID)&&(!preg || phase==='loading'&&core.MatchID===pre.MatchID)){
        const match=await this.request('glz',`/core-game/v1/matches/${core.MatchID}`,'GET',undefined,s,{permissionFailure:true});
        if(match){phase='match';contextId=core.MatchID;mapId=match.MapID || '';players=match.Players || [];enemyExpected=5;notice='Roster available during map loading and the match.';}
      }
    }
    if(phase==='lobby'){
      party=await this.currentParty(s);
      if(party){players=(party.Members || []).map(p=>({...p,TeamID:'party'}));contextId='party:'+(party.ID || 'current');queue=party.MatchmakingData?.QueueID || '';}
      if(!players.some(p=>p.Subject===s.puuid))players.unshift({Subject:s.puuid,TeamID:'party'});
      notice='Party stats load automatically. Opponents have not been assigned in the lobby.';
    }
    if(s!==this.session)throw new Error('The account connection changed.');
    const own=players.find(p=>p.Subject===s.puuid);if(!own)throw new Error('Your account is not in the returned roster.');
    if(!party)party=await this.currentParty(s);
    const candidates=players.filter(p=>UUID.test(p.Subject)).slice(0,10);
    let names=[];
    const missing=candidates.filter(p=>!this.nameCache.has(p.Subject));
    if(missing.length){
      try{const response=await this.request('pd','/name-service/v2/players','PUT',missing.map(p=>p.Subject),s,{permissionFailure:true});if(Array.isArray(response))for(const name of response)if(name.GameName)this.nameCache.set(name.Subject,name);}
      catch(error){if(s!==this.session)throw error;}
    }
    names=candidates.map(p=>this.nameCache.get(p.Subject)).filter(Boolean);
    const visible=candidates.filter(p=>p.Subject===s.puuid||p.PlayerIdentity?.Incognito===false||names.some(n=>n.Subject===p.Subject));
    this.visiblePlayers=new Set(candidates.map(p=>p.Subject));
    const partyMembers=new Set((party?.Members || []).map(p=>p.Subject));
    const groups=new Map();
    for(const player of players){const id=player.PartyID || (partyMembers.has(player.Subject)?party?.ID || 'own-party':null);if(id){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(player.Subject);}}
    const partyGroups=[...groups.values()].filter(group=>group.length>1);
    const rows=players.slice(0,10).map((player,index)=>{
      const allowed=visible.some(p=>p.Subject===player.Subject),name=allowed&&names.find(n=>n.Subject===player.Subject);
      const partyIndex=partyGroups.findIndex(group=>group.includes(player.Subject));
      return {slot:index,...partyIndex>=0?{partyGroup:'P'+(partyIndex+1),partySource:'Current Riot party'}:{},agentId:player.CharacterID || '',isOwn:player.Subject===s.puuid,selectionState:player.CharacterSelectionState || '',name:allowed?(name?.GameName?name.GameName+'#'+name.TagLine:player.Subject===s.puuid?'You':'Player'):'Hidden player',team:player.TeamID===own.TeamID?'Your team':'Opponent',rank:Number.isInteger(player.CompetitiveTier)?{tier:player.CompetitiveTier,rr:null}:null,...this.visiblePlayers.has(player.Subject)?{puuid:player.Subject}:{}};
    });
    return {contextId,phase,mapId,queue,players:rows,enemyExpected,notice };
  }
  async lobby(){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    const player=await this.request('glz',`/parties/v1/players/${s.puuid}`,'GET',undefined,s);
    if(!player?.CurrentPartyID||!UUID.test(player.CurrentPartyID))return {phase:'unavailable',message:'No party found. Launch VALORANT and enter a lobby.'};
    const party=await this.request('glz',`/parties/v1/parties/${player.CurrentPartyID}`,'GET',undefined,s);
    if(!party)throw new Error('Your party changed. Refresh the lobby.');
    const own=(party.Members||[]).find(x=>x.Subject===s.puuid);
    return {partyId:player.CurrentPartyID,phase:party.State || 'UNKNOWN',queue:party.MatchmakingData?.QueueID || '',ready:own?.IsReady===true,leader:own?.IsOwner===true};
  }
  async players(){
    const snapshot=await this.roster();
    return Promise.all(snapshot.players.map(async player=>{
      if(!player.puuid)return player;
      try{const rank=await this.playerRank(player.puuid);return {...player,...rank || {}};}catch{return player;}
    }));
  }
  async action(action,agentId){
    if(!['ready','unready','queue','dequeue','select','lock'].includes(action))throw new Error('Unknown client action.');
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    if(action==='select'||action==='lock'){
      if(!UUID.test(agentId))throw new Error('Choose an agent from the loaded catalog.');
      const player=await this.request('glz',`/pregame/v1/players/${s.puuid}`,'GET',undefined,s);
      if(!player?.MatchID||!UUID.test(player.MatchID))throw new Error('Agent select is not active. Wait until a match is found.');
      const result=await this.request('glz',`/pregame/v1/matches/${player.MatchID}/${action==='lock'?'lock':'select'}/${agentId}`,'POST',{},s);
      if(!result)throw new Error('Agent select ended or the agent is no longer available.');
    }else{
      const lobby=await this.lobby();
      if(!lobby.partyId)throw new Error(lobby.message);
      if(['queue','dequeue'].includes(action)&&!lobby.leader)throw new Error('Only the party leader can start or cancel matchmaking.');
      if(action==='queue'&&lobby.phase!=='DEFAULT')throw new Error('Party is not idle. Refresh the lobby.');
      if(action==='dequeue'&&lobby.phase!=='MATCHMAKING')throw new Error('Your party is not searching. Refresh the lobby.');
      const suffix=['ready','unready'].includes(action)?'members/'+s.puuid+'/setReady':action==='queue'?'matchmaking/join':'matchmaking/leave';
      const result=await this.request('glz',`/parties/v1/parties/${lobby.partyId}/${suffix}`,'POST',['ready','unready'].includes(action)?{ready:action==='ready'}:{},s);
      if(!result)throw new Error('Party changed. Refresh before retrying.');
    }
    return {ok:true};
  }
}
module.exports={RiotClient,parseLockfile};

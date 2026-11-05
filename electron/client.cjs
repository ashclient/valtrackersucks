'use strict';
// Unofficial Riot Client integration. Credentials never cross the preload bridge.
const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REGIONS = {na:'na-1',eu:'eu-1',ap:'ap-1',kr:'kr-1',br:'br-1',latam:'latam-1'};
const { normalizeStore, ITEM_TYPES } = require('./store.cjs');
const { analyzeMatch, summary } = require('../src/analytics.cjs');
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
    }); this.local=localRequest;this.session=null;this.generation=0;this.visiblePlayers=new Set();this.statsCache=new Map();this.matchCache=new Map();
  }
  disconnect(){this.generation++;this.session=null;this.visiblePlayers.clear();this.statsCache.clear();this.matchCache.clear();}
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
    this.session={puuid:auth.subject,access:auth.accessToken,entitlement:auth.token,region,version:version.data.riotClientVersion};
    return {connected:true,region};
  }
  async request(service,route,method='GET',body,session=this.session,{permissionFailure=false}={}) {
    const s=session;if(!s)throw new Error('Connect Riot Client first.');
    if(s!==this.session)throw new Error('The account connection changed. Refresh and try again.');
    const host=service==='pd'?`pd.${s.region}.a.pvp.net`:`glz-${REGIONS[s.region]}.${s.region}.a.pvp.net`;
    const response=await this.fetch('https://'+host+route,{method,signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+s.access,'X-Riot-Entitlements-JWT':s.entitlement,'X-Riot-ClientVersion':s.version,'X-Riot-ClientPlatform':PLATFORM,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(s!==this.session)throw new Error('The account connection changed. Refresh and try again.');
    if(response.status===403&&permissionFailure)return null;
    if(response.status===401||response.status===403){if(this.session===s)this.disconnect();throw new Error('Riot rejected this session. Reconnect Riot Client and check your region.');}
    if(response.status===404)return null;
    if(!response.ok)throw new Error(response.status===429?'Riot rate limit reached. Wait before retrying.':'Riot Client request failed (HTTP '+response.status+'). Refresh before retrying.');
    if(response.status===204)return {};
    const result=await response.json();
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
    if(loadout?.Subject!==s.puuid || !Array.isArray(loadout.Guns) || !Array.isArray(loadout.Sprays) || !loadout.Identity || typeof loadout.Incognito!=='boolean')throw new Error('Your loadout could not be loaded.');
    const data=await this.request('pd',`/store/v1/entitlements/${s.puuid}`,'GET',undefined,s);
    if(!data || !Array.isArray(data.EntitlementsByTypes))throw new Error('Your owned items could not be loaded.');
    const owned={};
    for(const group of data.EntitlementsByTypes)owned[group.ItemTypeID]=(group.Entitlements || []).map(item=>({id:item.ItemID,instanceId:item.InstanceID}));
    return {loadout,owned};
  }
  async equip(change, catalog){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    if(!change || !['weapon','card','title','spray','buddy'].includes(change.kind))throw new Error('Choose a supported locker item.');
    const {loadout,owned}=await this.inventory();
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
  async playerStats(puuid){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    if(puuid!==s.puuid&&!this.visiblePlayers.has(puuid))throw new Error('Only your account and visible players in the current match can be queried.');
    const cached=this.statsCache.get(puuid);if(cached&&cached.expires>Date.now())return {...cached.value,cached:true};
    const history=await this.request('pd',`/match-history/v1/history/${puuid}?startIndex=0&endIndex=10&queue=competitive`,'GET',undefined,s,{permissionFailure:true});
    if(!history || !Array.isArray(history.History))throw new Error('Recent match history is unavailable for this player.');
    const matches=[];let unavailable=0;
    const totals={kills:0,deaths:0,score:0,rounds:0,heads:0,hits:0,damage:0,damageRounds:0};
    const number=value=>Number.isFinite(Number(value))&&Number(value)>=0?Number(value):0;
    for(const row of history.History.slice(0,10)){
      if(!UUID.test(row.MatchID))continue;
      try{
        let detail=this.matchCache.get(row.MatchID);
        if(!detail){detail=await this.request('pd',`/match-details/v1/matches/${row.MatchID}`,'GET',undefined,s,{permissionFailure:true});if(detail){if(this.matchCache.size>=100)this.matchCache.delete(this.matchCache.keys().next().value);this.matchCache.set(row.MatchID,detail);}}
        const match=analyzeMatch(detail,puuid);matches.push(match);
        const raw=detail.players.find(player=>player.puuid===puuid)?.stats || {};
        totals.kills+=match.kills;totals.deaths+=match.deaths;totals.score+=number(raw.score);totals.rounds+=match.rounds;
        let hasDamage=false;
        for(const round of Array.isArray(detail.roundResults)?detail.roundResults:[]){
          const ownRound=(round.playerStats || []).find(player=>player.puuid===puuid);
          if(!Array.isArray(ownRound?.damage))continue;hasDamage=true;
          for(const hit of ownRound.damage){totals.heads+=number(hit.headshots);totals.hits+=number(hit.headshots)+number(hit.bodyshots)+number(hit.legshots);totals.damage+=number(hit.damage);}
        }
        if(hasDamage)totals.damageRounds+=match.rounds;
      }catch(error){if(!this.session||this.session!==s)throw error;unavailable++;}
    }
    const metrics=summary(matches);
    if(matches.length){
      metrics.kd=Math.round(totals.kills/Math.max(1,totals.deaths)*100)/100;
      metrics.acs=totals.rounds?Math.round(totals.score/totals.rounds):null;
      metrics.hs=totals.hits?Math.round(totals.heads/totals.hits*1000)/10:null;
      metrics.adr=totals.damageRounds?Math.round(totals.damage/totals.damageRounds):null;
    }
    const value={source:'Riot Client · recent competitive matches',metrics,matches,unavailable,fetchedAt:Date.now()};
    if(!matches.length&&history.History.length)throw new Error('Match summaries could not be loaded. Try again later.');
    if(this.statsCache.size>=50)this.statsCache.delete(this.statsCache.keys().next().value);
    this.statsCache.set(puuid,{value,expires:Date.now()+300000});return value;
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
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    this.visiblePlayers.clear();
    const current=await this.request('glz',`/core-game/v1/players/${s.puuid}`,'GET',undefined,s);
    if(!UUID.test(current?.MatchID))throw new Error('No active match. Player ranks are available after the match starts.');
    const match=await this.request('glz',`/core-game/v1/matches/${current.MatchID}`,'GET',undefined,s);
    const roster=Array.isArray(match?.Players)?match.Players:[];
    const own=roster.find(x=>x.Subject===s.puuid);
    if(!own)throw new Error('Your account is not in the current match.');
    // Do not resolve identities or request stats for incognito players.
    const visible=roster.filter(x=>UUID.test(x.Subject)&&x.PlayerIdentity?.Incognito===false).slice(0,10);
    this.visiblePlayers=new Set(visible.map(x=>x.Subject));
    const names=visible.length?await this.request('pd','/name-service/v2/players','PUT',visible.map(x=>x.Subject),s):[];
    const rows=[];
    for(const player of roster.slice(0,10)){
      const identity=visible.find(x=>x.Subject===player.Subject);
      const name=identity&&(Array.isArray(names)?names:[]).find(x=>x.Subject===player.Subject);
      let rank=null;
      if(identity){
        try{const mmr=await this.request('pd',`/mmr/v1/players/${player.Subject}`,'GET',undefined,s,{permissionFailure:true});
          const update=mmr?.LatestCompetitiveUpdate;
          if(Number.isInteger(update?.TierAfterUpdate))rank={tier:update.TierAfterUpdate,rr:update.RankedRatingAfterUpdate};
        }catch(error){if(!this.session)throw error;}
      }
      rows.push({...identity?{puuid:player.Subject,agentId:player.CharacterID}: {},name:name?.GameName?name.GameName+'#'+name.TagLine:'Hidden player',team:player.TeamID===own.TeamID?'Your team':'Opponent',rank});
    }
    return rows;
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

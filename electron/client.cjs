'use strict';
// Unofficial Riot Client integration. Credentials never cross the preload bridge.
const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REGIONS = {na:'na-1',eu:'eu-1',ap:'ap-1',kr:'kr-1',br:'br-1',latam:'latam-1'};
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
    }); this.local=localRequest;this.session=null;this.generation=0;
  }
  disconnect(){this.generation++;this.session=null;}
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
  async request(service,route,method='GET',body,session=this.session) {
    const s=session;if(!s)throw new Error('Connect Riot Client first.');
    const host=service==='pd'?`pd.${s.region}.a.pvp.net`:`glz-${REGIONS[s.region]}.${s.region}.a.pvp.net`;
    const response=await this.fetch('https://'+host+route,{method,signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+s.access,'X-Riot-Entitlements-JWT':s.entitlement,'X-Riot-ClientVersion':s.version,'X-Riot-ClientPlatform':PLATFORM,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(response.status===401||response.status===403){if(this.session===s)this.disconnect();throw new Error('Riot rejected this session. Reconnect Riot Client and check your region.');}
    if(response.status===404)return null;
    if(!response.ok)throw new Error(response.status===429?'Riot rate limit reached. Wait before retrying.':'Riot Client request failed (HTTP '+response.status+'). Refresh before retrying.');
    if(response.status===204)return {};
    return response.json();
  }
  async shop(){
    const s=this.session;if(!s)throw new Error('Connect Riot Client first.');
    const data=await this.request('pd',`/store/v3/storefront/${s.puuid}`,'POST',{},s);
    if(!data?.SkinsPanelLayout)throw new Error('Daily shop was not returned. Your region or the client API may have changed.');
    const layout=data.SkinsPanelLayout;
    const offers=layout.SingleItemStoreOffers || [];
    return {offers:(layout.SingleItemOffers||[]).filter(id=>UUID.test(id)).slice(0,8).map(id=>{
      const offer=offers.find(x=>x.OfferID===id);
      return {id,cost:offer?.Cost || {}};
    }),expiresAt:Date.now()+Math.max(0,Number(layout.SingleItemOffersRemainingDurationInSeconds)||0)*1000};
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
    const current=await this.request('glz',`/core-game/v1/players/${s.puuid}`,'GET',undefined,s);
    if(!UUID.test(current?.MatchID))throw new Error('No active match. Player ranks are available after the match starts.');
    const match=await this.request('glz',`/core-game/v1/matches/${current.MatchID}`,'GET',undefined,s);
    const roster=Array.isArray(match?.Players)?match.Players:[];
    const own=roster.find(x=>x.Subject===s.puuid);
    if(!own)throw new Error('Your account is not in the current match.');
    // Do not resolve identities or request stats for incognito players.
    const visible=roster.filter(x=>UUID.test(x.Subject)&&x.PlayerIdentity?.Incognito===false).slice(0,10);
    const names=visible.length?await this.request('pd','/name-service/v2/players','PUT',visible.map(x=>x.Subject),s):[];
    const rows=[];
    for(const player of roster.slice(0,10)){
      const identity=visible.find(x=>x.Subject===player.Subject);
      const name=identity&&(Array.isArray(names)?names:[]).find(x=>x.Subject===player.Subject);
      let rank=null;
      if(identity){
        try{const mmr=await this.request('pd',`/mmr/v1/players/${player.Subject}`,'GET',undefined,s);
          const update=mmr?.LatestCompetitiveUpdate;
          if(Number.isInteger(update?.TierAfterUpdate))rank={tier:update.TierAfterUpdate,rr:update.RankedRatingAfterUpdate};
        }catch(error){if(!this.session)throw error;}
      }
      rows.push({name:name?.GameName?name.GameName+'#'+name.TagLine:'Hidden player',team:player.TeamID===own.TeamID?'Your team':'Opponent',rank});
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

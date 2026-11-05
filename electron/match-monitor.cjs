'use strict';
// A single owner for phase polling and automatic stat hydration across both windows.
class MatchMonitor {
  constructor(client,{onSnapshot=()=>{},onError=()=>{},interval=5000,concurrency=2}={}){
    this.client=client;this.onSnapshot=onSnapshot;this.onError=onError;this.interval=interval;this.concurrency=concurrency;
    this.timer=null;this.running=false;this.epoch=0;this.pending=false;this.snapshot=null;this.jobs=new Set();this.activeLoads=0;
  }
  start(){this.stop();this.running=true;this.tick();this.timer=setInterval(()=>this.tick(),this.interval);this.timer.unref?.();}
  stop(){this.running=false;this.epoch++;this.jobs.clear();if(this.timer)clearInterval(this.timer);this.timer=null;this.snapshot=null;}
  publish(){if(this.running&&this.snapshot)this.onSnapshot(structuredClone(this.snapshot));}
  async tick(){
    if(!this.running||this.pending||!this.client.session)return;
    this.pending=true;const session=this.client.session;
    try{
      const next=await this.client.roster();
      if(!this.running||session!==this.client.session)return;
      const context=next.contextId;
      const same=this.snapshot?.contextId===context;
      const previous=same?new Map(this.snapshot.players.filter(p=>p.puuid).map(p=>[p.puuid,p])):new Map();
      if(!same){this.epoch++;this.jobs.clear();}
      this.snapshot={...next,players:next.players.map(p=>{
        const old=previous.get(p.puuid);
        return {...p,rank:old?.rank || p.rank,peakTier:old?.peakTier,stats:old?.stats || null,statsState:p.puuid?(old?.statsState || 'loading'):'private',statsError:old?.statsError || '',retryAt:old?.retryAt || 0};
      }),updatedAt:Date.now(),source:'Riot Client · last 10 competitive matches'};
      this.publish();this.hydrate(this.epoch,session);
    }catch(error){if(this.running&&(session===this.client.session||!this.client.session))this.onError(error.message);}
    finally{this.pending=false;}
  }
  hydrate(epoch,session){
    if(!this.running||epoch!==this.epoch||session!==this.client.session||!this.snapshot)return;
    const queued=this.snapshot.players.filter(p=>p.puuid&&!this.jobs.has(p.puuid)&&(!p.stats||p.stats.fetchedAt+300000<Date.now())&&p.retryAt<=Date.now());
    while(queued.length&&this.activeLoads<this.concurrency){
      const row=queued.shift(),id=row.puuid;this.jobs.add(id);this.activeLoads++;this.load(row,epoch,session);
    }
  }
  async load(row,epoch,session){
    let stats=null,rank=null,error='';
    try{
      [stats,rank]=await Promise.all([
        this.client.playerStats(row.puuid).catch(e=>{error=e.message;return null;}),
        this.client.playerRank(row.puuid).catch(()=>null)
      ]);
      if(!this.running||epoch!==this.epoch)return;
      if(session!==this.client.session){if(!this.client.session)this.onError('Riot session expired. Reconnect Riot Client.');return;}
      const current=this.snapshot?.players.find(p=>p.puuid===row.puuid);
      if(!current)return;
      if(rank){current.rank=rank.rank || current.rank;current.peakTier=rank.peakTier;}
      current.stats=stats;current.statsState=stats?(stats.metrics.played?'ready':'empty'):'unavailable';current.statsError=error;
      current.retryAt=stats?0:Date.now()+60000;this.publish();
    }finally{
      this.activeLoads--;
      if(epoch===this.epoch)this.jobs.delete(row.puuid);
      if(this.running)this.hydrate(this.epoch,this.client.session);
    }
  }
}
module.exports={MatchMonitor};

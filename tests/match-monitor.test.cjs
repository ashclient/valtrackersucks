'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {MatchMonitor}=require('../electron/match-monitor.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const events=[],calls=[],pending=new Map();let context='party:A';
 const players=Array.from({length:5},(_,i)=>({puuid:'player-'+i,name:'Player '+i,team:'Your team'}));
 const client={session:{},roster:async()=>({contextId:context,phase:'lobby',players,notice:'Party'}),playerRank:async()=>({rank:{tier:18,rr:30},peakTier:20}),playerStats:id=>{calls.push(id);return new Promise(resolve=>pending.set(id,resolve));}};
 const monitor=new MatchMonitor(client,{interval:100000,onSnapshot:s=>events.push(s)});
 const stats={metrics:{played:1,kd:1.2},agents:{},matches:[],fetchedAt:Date.now()};
 return {monitor,client,events,calls,pending,stats,setContext:value=>context=value};
}
test('phase watching automatically starts stat hydration with bounded concurrency',async t=>{
 const f=fixture();t.after(()=>f.monitor.stop());f.monitor.start();await flush();
 assert.equal(f.calls.length,2);assert.equal(f.events[0].players[0].statsState,'loading');
 f.pending.get('player-0')(f.stats);await flush();assert.equal(f.calls.length,3);assert.equal(f.monitor.activeLoads,2);assert.equal(f.events.at(-1).players[0].stats.metrics.kd,1.2);
});
test('phase changes discard old snapshots and never exceed the worker limit',async t=>{
 const f=fixture();t.after(()=>f.monitor.stop());f.monitor.start();await flush();f.setContext('match:B');await f.monitor.tick();
 assert.equal(f.calls.length,2);f.pending.get('player-0')(f.stats);await flush();assert.equal(f.monitor.activeLoads,2);assert.equal(f.events.at(-1).contextId,'match:B');assert.equal(f.events.at(-1).players[0].stats,null);
});
test('stopping clears the snapshot and suppresses late network results',async()=>{
 const f=fixture();f.monitor.start();await flush();const count=f.events.length;f.monitor.stop();f.pending.get('player-0')(f.stats);await flush();assert.equal(f.events.length,count);assert.equal(f.monitor.snapshot,null);
});

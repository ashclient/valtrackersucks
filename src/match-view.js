'use strict';
let liveSnapshot=null;
let liveMapAssets=new Map();
const phaseLabels={lobby:'LOBBY','agent-select':'AGENT SELECT',loading:'MAP LOADING',match:'LOADING / LIVE MATCH'};
function clearMatchView(){liveSnapshot=null;rosterSnapshot=[];playerStatsCache.clear();renderMatchTables();}
function applyMatchSnapshot(snapshot){
  if(!snapshot)return;
  if(liveSnapshot?.contextId!==snapshot.contextId)playerStatsCache.clear();
  if(liveSnapshot&&VtsModes.key(liveSnapshot.modes)!==VtsModes.key(snapshot.modes)){ownStatsSnapshot=null;playerStatsCache.clear();}
  liveSnapshot=snapshot;rosterSnapshot=snapshot.players;
  for(const player of snapshot.players){if(player.stats&&player.puuid)playerStatsCache.set(player.puuid,player.stats);if(player.isOwn&&player.stats){ownStatsSnapshot=player.stats;if(current)renderOwnStats();}}
  renderMatchTables();if(typeof renderAgentCorner==='function')renderAgentCorner();
}
function currentMetrics(player){return player.stats || playerStatsCache.get(player.puuid) || null;}
function namedMap(){
  if(liveSnapshot?.phase==='lobby')return 'Your party';
  if(!liveSnapshot?.mapId)return 'Waiting for map';
  const map=liveMapAssets.get(liveSnapshot.mapId);return map?.name || liveSnapshot.mapId.split('/').filter(Boolean).at(-1);
}
function badgeFor(tier,className='table-rank-icon'){
  const asset=rankArtwork.get(tier);return asset&&imageElement(asset.image,asset.name,className);
}
function partyLabel(player){
  const chip=node('span','party-chip');
  if(player.partyGroup){
    chip.textContent=player.partyGroup;chip.classList.add('confirmed');
    const partners=rosterSnapshot.filter(p=>p.partyGroup===player.partyGroup&&p!==player).map(p=>p.name);
    chip.title='Confirmed current party: '+[player.name,...partners].join(', ');return chip;
  }
  const recent=currentMetrics(player)?.recentPartyPartners || [];
  const together=recent.filter(link=>rosterSnapshot.some(p=>p.puuid===link.puuid));
  if(together.length){chip.textContent='Past';chip.classList.add('historical');chip.title='Historical party only; current grouping unconfirmed. '+together.map(link=>rosterSnapshot.find(p=>p.puuid===link.puuid)?.name+': '+link.matches+' recent shared-party games').join('; ');}
  else{chip.textContent='—';chip.title='Party membership not supplied';}
  return chip;
}
function tableHead(compact){
  const head=document.createElement('thead');
  const group=node('tr','column-groups');
  for(const [label,span,style]of [['',3,''],['RECENT · '+VtsModes.label(liveSnapshot?.modes || current?.settings.statsModes).toUpperCase(),6,'recent-group'],...compact?[]:[['THIS AGENT · IN SAMPLE',3,'agent-group']],['REPORTED',1,'peak-group']]){const th=node('th',style,label);th.colSpan=span;group.appendChild(th);}head.appendChild(group);
  const labels=node('tr');
  for(const [label,style]of [['Agent / Player','identity-column'],['Rank','rank-column'],['Party','party-column'],['K/D','recent-column'],['Win %','recent-column'],['ACS','recent-column'],['HS %','recent-column'],['ADR','recent-column'],['Games','recent-column'],...compact?[]:[['K/D','agent-column'],['Win %','agent-column'],['Games','agent-column']],['Peak','peak-column']])labels.appendChild(node('th',style,label));head.appendChild(labels);return head;
}
function playerTableRow(player,compact){
  const row=node('tr','tracker-player-row '+(player.isOwn?'own-player ': '')+(player.team==='Opponent'?'enemy-row':'ally-row'));
  const identity=node('td','tracker-identity');const agent=agentCatalog.find(a=>a.id===player.agentId);
  const art=agent&&imageElement(agent.portrait || agent.icon,agent.name,'tracker-agent');
  if(art)identity.appendChild(art);else identity.appendChild(node('span','tracker-agent placeholder','?'));
  const labels=node('div','tracker-name');const button=node(player.puuid?'button':'strong','',player.name);
  if(player.puuid){button.type='button';button.addEventListener('click',()=>loadPlayerReport(player,overlayMode));}
  labels.appendChild(button);labels.appendChild(node('small','',agent?.name || (player.selectionState==='locked'?'Locked in':'Not selected')));identity.appendChild(labels);row.appendChild(identity);
  const rank=node('td','rank-column');const icon=badgeFor(player.rank?.tier);if(icon)rank.appendChild(icon);else rank.appendChild(node('span','muted','—'));rank.title=rankText(player.rank);if(Number.isFinite(player.rank?.rr))rank.appendChild(node('small','rank-rr',player.rank.rr+' RR'));row.appendChild(rank);
  const party=node('td','party-column');party.appendChild(partyLabel(player));row.appendChild(party);
  const data=currentMetrics(player),stats=data?.metrics;
  if(!data||stats.played===0){
    const state=player.statsState || (player.puuid?'loading':'private');
    const label=stats?.played===0?'No matches in selected modes':state==='loading'?'Loading recent stats…':state==='private'?'Profile unavailable to this session':player.statsError || 'Recent history unavailable';
    const cell=node('td','row-status '+state,label);cell.colSpan=6;cell.title=label;row.appendChild(cell);
  }else{
    for(const value of [metric(stats.kd),metric(stats.winRate,'%'),metric(stats.acs),metric(stats.hs,'%'),metric(stats.adr),stats.played])row.appendChild(node('td','recent-column stat-number',value));
  }
  const agentMetrics=data?.agents?.[player.agentId];
  if(!compact)for(const value of [metric(agentMetrics?.kd),metric(agentMetrics?.winRate,'%'),agentMetrics?.played ?? '—'])row.appendChild(node('td','agent-column stat-number',value));
  const peak=node('td','peak-column');const peakArt=badgeFor(player.peakTier);if(peakArt)peak.appendChild(peakArt);else peak.appendChild(node('span','muted','—'));peak.title='Highest tier in the returned rank records';row.appendChild(peak);
  return row;
}
function teamSummary(team){
  const players=rosterSnapshot.filter(p=>p.team===team),loaded=players.filter(p=>currentMetrics(p)?.metrics.played>0);
  const mean=key=>{const available=loaded.map(p=>currentMetrics(p).metrics[key]).filter(v=>v!==null&&Number.isFinite(v));return available.length?available.reduce((a,b)=>a+b,0)/available.length:null;};
  return {count:loaded.length,total:players.length,kd:mean('kd'),win:mean('winRate'),acs:mean('acs')};
}
function matchupRow(compact){
  const row=node('tr','matchup-row');const cell=document.createElement('td');cell.colSpan=compact?10:13;
  const box=node('div','matchup-summary');box.appendChild(node('strong','','MATCHUP'));
  const own=teamSummary('Your team'),enemy=teamSummary('Opponent');
  for(const [label,key,digits,suffix]of [['AVG K/D','kd',2,''],['WIN %','win',0,'%'],['AVG ACS','acs',0,'']]){
    const part=node('div','matchup-metric');part.appendChild(node('span','team-value ally-value',own[key]===null?'—':own[key].toFixed(digits)+suffix));part.appendChild(node('small','',label));part.appendChild(node('span','team-value enemy-value',enemy[key]===null?'—':enemy[key].toFixed(digits)+suffix));box.appendChild(part);
  }
  box.appendChild(node('small','matchup-count',own.count+'/'+own.total+' allies · '+enemy.count+'/'+enemy.total+' opponents loaded'));cell.appendChild(box);row.appendChild(cell);return row;
}
function placeholderRows(body,team,count,compact){
  for(let i=0;i<count;i++){
    const row=node('tr','tracker-player-row waiting-row');const cell=node('td','',i===0?(team==='Opponent'?(liveSnapshot?.phase==='lobby'?'Opponents are not assigned in the lobby.':'Waiting for Riot to publish opponent identities.'):liveSnapshot?.phase==='lobby'?'Open party slot':liveSnapshot?'Waiting for party roster…':'Connect Riot Client. Stats populate automatically.'):'');cell.colSpan=compact?10:13;row.appendChild(cell);body.appendChild(row);
  }
}
function createMatchTable(compact=false){
  const table=node('table','tracker-match-table');
  const columns=document.createElement('colgroup');for(const width of [compact?190:150,40,34,40,40,40,40,40,36,...compact?[]:[40,40,36],35]){const col=document.createElement('col');col.style.width=width+'px';columns.appendChild(col);}table.appendChild(columns);
  table.appendChild(tableHead(compact));const body=document.createElement('tbody');
  const allies=rosterSnapshot.filter(p=>p.team==='Your team'),enemies=rosterSnapshot.filter(p=>p.team==='Opponent');
  allies.forEach(player=>body.appendChild(playerTableRow(player,compact)));
  placeholderRows(body,'Your team',Math.max(0,5-allies.length),compact);body.appendChild(matchupRow(compact));
  enemies.forEach(player=>body.appendChild(playerTableRow(player,compact)));
  placeholderRows(body,'Opponent',Math.max(0,(liveSnapshot?.enemyExpected || 5)-enemies.length),compact);table.appendChild(body);return table;
}
function fillProfile(parent){
  empty(parent);const own=rosterSnapshot.find(p=>p.isOwn) || rosterSnapshot.find(p=>p.puuid&&current?.settings.puuid===p.puuid);
  const profile=node('div','tracker-profile-card');const map=liveMapAssets.get(liveSnapshot?.mapId);if(map?.image){const image=imageElement(map.image,map.name,'profile-map-art');if(image)profile.appendChild(image);}
  const body=node('div','tracker-profile-body');const agent=agentCatalog.find(a=>a.id===own?.agentId);
  const portrait=agent&&imageElement(agent.portrait || agent.icon,agent.name,'profile-agent');if(portrait)body.appendChild(portrait);
  const rank=badgeFor(own?.rank?.tier,'profile-rank');if(rank)body.appendChild(rank);
  body.appendChild(node('small','','SIGNED-IN PLAYER'));body.appendChild(node('h2','',own?.name || 'Your profile'));body.appendChild(node('p','',own?.rank?rankText(own.rank):'Waiting for rank'));profile.appendChild(body);parent.appendChild(profile);
  const status=node('div','profile-phase');status.appendChild(node('strong','',phaseLabels[liveSnapshot?.phase] || 'WAITING FOR CLIENT'));status.appendChild(node('small','',namedMap()));parent.appendChild(status);
  const sample=node('div','profile-sample');sample.appendChild(node('small','','RECENT · '+VtsModes.label(liveSnapshot?.modes || current?.settings.statsModes).toUpperCase()));
  const stats=own&&currentMetrics(own)?.metrics;for(const [label,value]of [['K/D',metric(stats?.kd)],['Win rate',metric(stats?.winRate,'%')],['ACS',metric(stats?.acs)],['Matches',stats?.played ?? '—']]){const item=node('div');item.appendChild(node('span','',label));item.appendChild(node('strong','',value));sample.appendChild(item);}parent.appendChild(sample);
  const source=node('p','profile-source','Riot Client data. Recent sample, not lifetime Tracker scores. Select a player for match details.');parent.appendChild(source);
  const button=node('button','text-button','Copy endpoint diagnostics');button.addEventListener('click',async()=>{await window.vts.copyDiagnostics();button.textContent='Diagnostics copied';});parent.appendChild(button);
}
function renderMatchTables(){
  const desktop=$('desktop-match-table'),overlay=$('overlay-players');
  if(!desktop||!overlay)return;
  desktop.replaceChildren(createMatchTable());overlay.replaceChildren(createMatchTable(true));fillProfile($('match-profile'));
  const phase=phaseLabels[liveSnapshot?.phase] || 'WAITING FOR CLIENT';text('match-phase',phase);text('match-map',namedMap());text('match-queue',liveSnapshot?.queue || '');
  text('players-status',liveSnapshot?.notice || 'Sign in to Riot Client. Party and match stats load automatically.');
  text('overlay-feedback',liveSnapshot?(phase+' · '+namedMap()):'Waiting for Riot Client');
  const pending=rosterSnapshot.filter(p=>p.statsState==='loading').length;
  text('match-auto-status',liveSnapshot?(pending?'Loading '+pending+' players…':'Auto updating · '+new Date(liveSnapshot.updatedAt).toLocaleTimeString()):'Auto update ready');
}
function bindMatchView(){
  window.vts.on('match:updated',applyMatchSnapshot);
  window.vts.on('match:error',value=>{text('players-status',value.error);text('overlay-feedback',value.error);});
  window.vts.rosterState().then(result=>{if(result.snapshot)applyMatchSnapshot(result.snapshot);}).catch(()=>{});
  window.vts.catalog('maps').then(result=>{if(result.ok){liveMapAssets=new Map(result.data.flatMap(map=>[[map.id,map],...map.path?[[map.path,map]]:[]]));for(const map of result.data){const suffix=map.image?.match(/maps\/([^/]+)/)?.[1];if(suffix)liveMapAssets.set(suffix,map);}renderMatchTables();}}).catch(()=>{});
  $('match-diagnostics').addEventListener('click',async()=>{await window.vts.copyDiagnostics();showToast('Endpoint diagnostics copied. No credentials or player IDs included.');});
  renderMatchTables();
}

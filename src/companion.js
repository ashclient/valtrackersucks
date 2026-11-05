'use strict';
// Account data remains in memory. Public artwork is obtained through the main process.
let shopSnapshot=null;
let storeTab='offers';
let storeError='';
let lockerSnapshot=null;
let lockerTab='weapons';
let lockerWeapon=null;
let inspectedItem=null;
let ownStatsSnapshot=null;
let rosterSnapshot=[];
let rosterBusy=false;
let rosterNextPoll=0;
let rankArtwork=new Map();
let reportGeneration=0;
const playerStatsCache=new Map();
const currencyNames={'85ad13f7-3d1b-5128-9eb2-7cd8a9b7e876':'VP','e59aa87c-4cbf-517a-5983-6e81511be9b7':'RP','85ca954a-41f2-ce94-9b45-8ca3dd39a00d':'KC'};
function money(cost){
  const entries=Object.entries(cost || {});
  return entries.length?entries.map(([id,amount])=>Number(amount).toLocaleString()+' '+(currencyNames[id] || 'currency')).join(' + '):'Price unavailable';
}
function timeLeft(timestamp){
  const seconds=Math.max(0,Math.floor((timestamp-Date.now())/1000));
  if(!Number.isFinite(seconds))return '—';if(!seconds)return 'Refresh to update';
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  return days?days+'d '+hours+'h':hours+'h '+String(minutes).padStart(2,'0')+'m';
}
function collectionEmpty(parent,title,description){
  const box=node('div','collection-empty');box.appendChild(node('h2','',title));box.appendChild(node('p','',description));parent.replaceChildren(box);
}
function clearCompanion(){
  reportGeneration++;shopSnapshot=null;storeError='';lockerSnapshot=null;ownStatsSnapshot=null;rosterSnapshot=[];inspectedItem=null;playerStatsCache.clear();
  shopEmpty();text('shop-status','Connect Riot Client to load your store.');
  empty($('shop-wallet'));playersEmpty();
  collectionEmpty($('locker-items'),'Your collection, ready to equip.','Connect Riot Client, then load the items you own.');
  empty($('locker-weapons'));empty($('locker-inspector'));
  text('locker-status','Connect Riot Client to load your inventory.');
  if($('player-detail').open)$('player-detail').close();
  $('overlay-report').classList.add('hidden');
  collectionEmpty($('overlay-players'),'No player data loaded','Connect Riot Client in the app to load your active match.');
}
async function loadRankCatalog(){
  try{const result=await window.vts.catalog('ranks');if(!result.ok)return;
    const last=result.data[result.data.length-1];rankArtwork=new Map((last?.tiers || []).map(t=>[t.tier,t]));
    if(rosterSnapshot.length)renderRoster();
  }catch{}
}
function renderStore(){
  if(!shopSnapshot)return;
  const wallet=$('shop-wallet');empty(wallet);
  for(const [id,amount]of Object.entries(shopSnapshot.balances || {})){
    if(!currencyNames[id])continue;
    const balance=node('div','wallet-currency');balance.appendChild(node('span','currency-mark',currencyNames[id]));balance.appendChild(node('strong','',Number(amount).toLocaleString()));wallet.appendChild(balance);
  }
  if(!wallet.children.length)wallet.appendChild(node('small','','Wallet unavailable'));
  const offers=shopSnapshot[storeTab] || [];
  const grid=$('shop-grid');empty(grid);grid.dataset.storeSection=storeTab;
  const labels={offers:'Daily offers',accessories:'Accessories',bundles:'Featured bundles',bonus:'Night Market'};
  text('shop-section-title',labels[storeTab]);
  const expiry=storeTab==='offers'?shopSnapshot.expiresAt:storeTab==='accessories'?shopSnapshot.accessoriesExpireAt:storeTab==='bonus'?shopSnapshot.bonusExpireAt:offers[0]?.expiresAt;
  text('shop-status',storeError?'Refresh failed: '+storeError+' · Showing previously loaded offers.':offers.length+' '+(storeTab==='bundles'?'bundles':'offers')+' · Resets in '+timeLeft(expiry)+(shopSnapshot.warnings.length?' · '+shopSnapshot.warnings.join(' '):''));
  if(!offers.length){collectionEmpty(grid,storeTab==='bonus'?'Night Market is not active':'No offers returned',storeTab==='bonus'?'Check again when the next Night Market opens.':'Riot did not return items in this section.');return;}
  for(const offer of offers){
    const card=node('article','offer-card'+(storeTab==='bundles'?' bundle-offer':''));
    const visual=node('div','offer-art');const image=imageElement(storeTab==='bundles'?(offer.banner || offer.image):offer.image,offer.name,'offer-image');
    if(image)visual.appendChild(image);else visual.appendChild(node('span',offer.kind==='titles'?'title-preview':'art-unavailable',offer.kind==='titles'?offer.name:'Artwork unavailable'));
    if(offer.discount>0)visual.appendChild(node('span','discount-badge','−'+offer.discount+'%'));
    const info=node('div','offer-info');info.appendChild(node('small','offer-kind',offer.weapon || (storeTab==='accessories'?({cards:'Player card',sprays:'Spray',buddies:'Gun buddy',titles:'Player title'}[offer.kind] || 'Accessory'):storeTab==='bundles'?'Featured bundle':'Weapon skin')));
    info.appendChild(node('h3','',offer.name || 'Unidentified item'));
    const cost=node('div','offer-cost');cost.appendChild(node('strong','',money(offer.cost)));
    if(offer.discount>0&&money(offer.cost)!==money(offer.baseCost))cost.appendChild(node('s','',money(offer.baseCost)));
    info.appendChild(cost);card.append(visual,info);
    if(offer.items?.length){const details=document.createElement('details');details.className='bundle-items';details.appendChild(node('summary','',offer.items.length+' bundle items'));for(const item of offer.items)details.appendChild(node('p','', (item.name || 'Item')+' · '+money(item.cost)));card.appendChild(details);}
    grid.appendChild(card);
  }
}
async function refreshStore(){
  storeError='';text('shop-status','Loading your current offers…');
  if(!shopSnapshot)shopEmpty('Loading store','Fetching daily offers, accessories and featured content.');
  const result=await window.vts.clientShop();
  if(!result.ok){storeError=result.error;if(shopSnapshot)renderStore();else{shopEmpty('Store unavailable',result.error);text('shop-status',result.error);}return result;}
  shopSnapshot=result.shop;renderStore();return result;
}
function renderLocker(){
  if(!lockerSnapshot)return;
  const query=$('locker-search').value.trim().toLowerCase();
  const weapons=lockerSnapshot.weapons;
  if(!weapons.some(w=>w.id===lockerWeapon))lockerWeapon=weapons[0]?.id;
  const weapon=weapons.find(w=>w.id===lockerWeapon);
  const sidebar=$('locker-weapons');empty(sidebar);
  sidebar.classList.toggle('hidden',!['weapons','buddies'].includes(lockerTab));
  for(const item of weapons){
    const button=node('button','locker-weapon'+(item.id===lockerWeapon?' active':''));button.type='button';button.setAttribute('aria-pressed',String(item.id===lockerWeapon));
    const art=imageElement(item.image,item.name,'');if(art)button.appendChild(art);button.appendChild(node('span','',item.name));
    button.addEventListener('click',()=>{lockerWeapon=item.id;inspectedItem=null;renderLocker();});sidebar.appendChild(button);
  }
  const grid=$('locker-items');empty(grid);
  let items=lockerTab==='weapons'?weapon?.skins || []:lockerSnapshot[lockerTab] || [];
  items=items.filter(item=>!query||(item.name+' '+(weapon?.name || '')).toLowerCase().includes(query));
  text('locker-status',items.length+' owned '+(lockerTab==='weapons'?'skins for '+(weapon?.name || 'this weapon'):lockerTab)+(lockerSnapshot.warnings?.length?' · '+lockerSnapshot.warnings.join(' '):''));
  for(const item of items.slice(0,150)){
    const button=node('button','locker-item');button.type='button';
    const image=imageElement(item.image || item.levels?.[0]?.image,item.name,'');
    if(image)button.appendChild(image);else button.appendChild(node('span','art-unavailable',lockerTab==='titles'?'PLAYER TITLE':'Artwork unavailable'));
    button.appendChild(node('strong','',item.name || 'Unnamed item'));
    const equipped=lockerTab==='weapons'?weapon?.equipped?.SkinID===item.id:lockerTab==='cards'?lockerSnapshot.profile?.PlayerCardID===item.id:lockerTab==='titles'?lockerSnapshot.profile?.PlayerTitleID===item.id:lockerTab==='sprays'?lockerSnapshot.spraySlots.some(x=>x.SprayID===item.id):false;
    button.appendChild(node('small',equipped?'equipped-label':'',equipped?'Equipped':'Owned'));
    button.addEventListener('click',()=>{inspectedItem=item;inspectLocker(item);});grid.appendChild(button);
  }
  if(!items.length)collectionEmpty(grid,query?'No matching items':'No items available','Try another category, weapon or search. Refresh if your collection has changed.');
  if(items.length>150)grid.appendChild(node('p','control-note','Showing the first 150 items. Search to narrow the list.'));
  if(inspectedItem)inspectLocker(inspectedItem);else collectionEmpty($('locker-inspector'),'Loadout','Select an item to preview and equip it.');
}
function inspectLocker(item){
  const parent=$('locker-inspector');empty(parent);
  const weapon=lockerSnapshot.weapons.find(w=>w.id===lockerWeapon);
  parent.appendChild(node('small','inspector-kicker','OWNED ITEM'));
  const art=imageElement(item.image,item.name,'inspector-art');if(art)parent.appendChild(art);
  parent.appendChild(node('h2','',item.name));
  const change={kind:{weapons:'weapon',cards:'card',titles:'title',sprays:'spray',buddies:'buddy'}[lockerTab],itemId:item.itemId || item.id};
  function selector(label,values){
    const field=node('label','inspector-field',label);const select=document.createElement('select');select.setAttribute('aria-label',label);
    for(const value of values){const option=node('option','',value.name);option.value=value.id;select.appendChild(option);}field.appendChild(select);parent.appendChild(field);return select;
  }
  if(lockerTab==='weapons'){
    change.weaponId=weapon.id;
    const level=selector('Skin level',item.levels.map((l,i)=>({id:l.id,name:'Level '+(l.level || i+1)+(l.name?' · '+l.name:'')})));
    const chroma=selector('Variant',item.chromas);
    if(item.levels.some(x=>x.id===weapon.equipped?.SkinLevelID))level.value=weapon.equipped.SkinLevelID;
    if(item.chromas.some(x=>x.id===weapon.equipped?.ChromaID))chroma.value=weapon.equipped.ChromaID;
    change.levelId=level.value;change.chromaId=chroma.value;
    level.addEventListener('change',()=>change.levelId=level.value);
    chroma.addEventListener('change',()=>{change.chromaId=chroma.value;const selected=item.chromas.find(c=>c.id===chroma.value);if(art&&selected?.image)art.src=selected.image;});
  }
  if(lockerTab==='sprays'){
    const slot=selector('Spray slot',lockerSnapshot.spraySlots.map((x,i)=>({id:x.EquipSlotID,name:'Slot '+(i+1)})));change.slotId=slot.value;slot.addEventListener('change',()=>change.slotId=slot.value);
  }
  if(lockerTab==='buddies'){change.weaponId=weapon?.id;change.instanceId=item.instanceId;parent.appendChild(node('p','control-note','Equip on '+(weapon?.name || 'the selected weapon')+'. The selected buddy copy will move if it is used elsewhere.'));}
  const status=node('p','inspector-status','Changes apply only when you choose Equip.');status.setAttribute('role','status');
  const button=node('button','btn btn-primary','Equip '+(lockerTab==='weapons'?'skin':change.kind));button.type='button';button.disabled=!localConnected;
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent='Updating your loadout…';
    try{const result=await window.vts.clientEquip(change);if(!result.ok)throw Error(result.error);lockerSnapshot=result.locker;inspectedItem=null;renderLocker();showToast('Loadout updated.');}
    catch(error){status.textContent=error.message;button.disabled=!localConnected;}
  });parent.append(button,status);
}
function rankCell(player){
  const block=node('div','rank-cell');const metadata=rankArtwork.get(player.rank?.tier);
  const icon=metadata&&imageElement(metadata.image,metadata.name,'rank-icon');if(icon)block.appendChild(icon);
  block.appendChild(node('span','',rankText(player.rank)));return block;
}
function renderRoster(){
  const tbody=$('client-player-rows');empty(tbody);const overlay=$('overlay-players');empty(overlay);
  const teams=['Your team','Opponent'];
  for(const team of teams){
    const group=node('section','roster-team');group.appendChild(node('h3','',team==='Your team'?'YOUR TEAM':'OPPONENTS'));
    const members=rosterSnapshot.filter(player=>player.team===team);
    for(const player of members){
      const stats=playerStatsCache.get(player.puuid)?.metrics;
      const row=node('tr','roster-row');row.dataset.team=team;
      const identity=node('td','player-identity');const agent=agentCatalog.find(a=>a.id===player.agentId);
      const image=agent&&imageElement(agent.portrait || agent.icon,agent.name,'roster-avatar');if(image)identity.appendChild(image);
      const name=node('div');name.appendChild(node('strong','',player.name));name.appendChild(node('small','',agent?.name || team));identity.appendChild(name);row.appendChild(identity);
      const rank=node('td');rank.appendChild(rankCell(player));row.appendChild(rank);
      for(const value of [metric(stats?.kd),metric(stats?.acs),metric(stats?.winRate,'%')])row.appendChild(node('td','numeric-cell',value));
      const action=node('td');if(player.puuid){const button=node('button','text-button','Report →');button.addEventListener('click',()=>loadPlayerReport(player,false));action.appendChild(button);}else action.appendChild(node('small','muted','Private'));
      row.appendChild(action);tbody.appendChild(row);
      const tile=node('button','overlay-roster-row');tile.type='button';tile.disabled=!player.puuid;
      const agentArt=agent&&imageElement(agent.portrait || agent.icon,agent.name,'roster-avatar');if(agentArt)tile.appendChild(agentArt);
      const labels=node('div','roster-player-name');labels.appendChild(node('strong','',player.name));labels.appendChild(node('small','',rankText(player.rank)));tile.appendChild(labels);
      const detail=node('span','roster-player-form',stats?metric(stats.kd)+' K/D · '+metric(stats.winRate,'%'):'View stats');tile.appendChild(detail);
      const badge=rankArtwork.get(player.rank?.tier);const rankArt=badge&&imageElement(badge.image,badge.name,'rank-icon');if(rankArt)tile.appendChild(rankArt);
      tile.addEventListener('click',()=>loadPlayerReport(player,true));group.appendChild(tile);
    }
    if(members.length)overlay.appendChild(group);
  }
  if(!rosterSnapshot.length){playersEmpty();collectionEmpty(overlay,'No players returned','Refresh after your match starts.');}
}
async function refreshRoster(inOverlay=false,silent=false){
  if(rosterBusy || silent&&Date.now()<rosterNextPoll)return {ok:true};
  rosterBusy=true;rosterNextPoll=Date.now()+30000;
  const button=$(inOverlay?'overlay-refresh-players':'client-players');button.disabled=true;
  text(inOverlay?'overlay-feedback':'players-status','Loading current match…');
  try{
    const result=await window.vts.clientPlayers();if(!result.ok)throw Error(result.error);
    rosterSnapshot=result.players;renderRoster();
    text(inOverlay?'overlay-feedback':'players-status','Latest ranks · Select a player for recent K/D, ACS, HS% and win rate.');return result;
  }catch(error){
    rosterNextPoll=Date.now()+60000;text(inOverlay?'overlay-feedback':'players-status',error.message);
    if(!rosterSnapshot.length)collectionEmpty($('overlay-players'),'No active match',error.message);
    return {ok:false,error:error.message};
  }finally{rosterBusy=false;button.disabled=!current?.clientConnected;}
}
function reportBody(parent,stats){
  empty(parent);parent.appendChild(node('p','report-source',stats.source+' · '+stats.metrics.played+' matches'+(stats.cached?' · Cached for up to 5 minutes':'')));
  const metrics=node('div','report-metrics');
  for(const [label,value]of [['K/D',metric(stats.metrics.kd)],['ACS',metric(stats.metrics.acs)],['WIN RATE',metric(stats.metrics.winRate,'%')],['HEADSHOTS',metric(stats.metrics.hs,'%')]]){const cell=node('div');cell.appendChild(node('small','',label));cell.appendChild(node('strong','',value));metrics.appendChild(cell);}parent.appendChild(metrics);
  const form=node('div','recent-form');for(const match of stats.matches){const cell=node('span',match.result==='WIN'?'form-win':match.result==='LOSS'?'form-loss':'form-unknown',match.result==='WIN'?'W':match.result==='LOSS'?'L':'?');cell.title=match.map+' · '+match.kills+'/'+match.deaths+'/'+match.assists;form.appendChild(cell);}parent.appendChild(form);
  if(!stats.matches.length)parent.appendChild(node('p','report-source','No recent competitive matches returned.'));
  for(const match of stats.matches.slice(0,5))renderMatch(parent,match);
  if(stats.unavailable)parent.appendChild(node('p','report-source',stats.unavailable+' match details were unavailable.'));
}
async function loadPlayerReport(player,inOverlay){
  const generation=++reportGeneration;
  const parent=$(inOverlay?'overlay-report-body':'player-detail-body');
  const tracker=$('player-tracker');tracker.disabled=!player.name.includes('#');tracker.onclick=()=>window.vts.openTracker(player.name);
  if(inOverlay){$('overlay-report').classList.remove('hidden');text('overlay-report-name',player.name);}else{text('player-detail-name',player.name);if(!$('player-detail').open)$('player-detail').showModal();}
  collectionEmpty(parent,'Loading player report','Fetching recent completed competitive matches.');
  try{
    const result=await window.vts.clientStats(player.puuid);if(generation!==reportGeneration)return;if(!result.ok)throw Error(result.error);
    playerStatsCache.set(player.puuid,result.stats);reportBody(parent,result.stats);renderRoster();
  }catch(error){if(generation===reportGeneration)collectionEmpty(parent,'Stats unavailable',error.message);}
}
function renderOwnStats(){
  if(!ownStatsSnapshot)return;
  const m=ownStatsSnapshot.metrics;
  for(const [id,value]of [['metric-kd',metric(m.kd)],['metric-acs',metric(m.acs)],['metric-win',metric(m.winRate,'%')],['metric-hs',metric(m.hs,'%')]])text(id,value);
  $('metric-kd').parentElement.querySelector('.stat-sub').textContent='Total kills / deaths · recent games';
  text('overview-subtitle','Recent competitive matches · Riot Client · '+m.played+' games');
  text('mode-indicator','RECENT COMPETITIVE');
  const recent=$('overview-matches');empty(recent);ownStatsSnapshot.matches.slice(0,4).forEach(match=>renderMatch(recent,match));
  renderOverlayMetrics();
}
function renderOverlayMetrics(){
  const stats=ownStatsSnapshot?.metrics || current?.metrics;
  const parent=$('overlay-quick-stats');empty(parent);
  for(const [label,value]of [['K/D',metric(stats?.kd)],['ACS',metric(stats?.acs)],['WIN',metric(stats?.winRate,'%')]]){const box=node('div');box.appendChild(node('small','',label));box.appendChild(node('strong','',value));parent.appendChild(box);}
  if(ownStatsSnapshot)text('overlay-match-count',ownStatsSnapshot.metrics.played+' recent competitive matches · Riot Client');
  parent.title=ownStatsSnapshot?'Recent competitive matches from Riot Client':'Saved local match summaries';
}
function bindCompanion(){
  document.querySelectorAll('[data-store-tab]').forEach(button=>button.addEventListener('click',()=>{storeTab=button.dataset.storeTab;document.querySelectorAll('[data-store-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderStore();}));
  document.querySelectorAll('[data-locker-tab]').forEach(button=>button.addEventListener('click',()=>{lockerTab=button.dataset.lockerTab;inspectedItem=null;document.querySelectorAll('[data-locker-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderLocker();}));
  $('locker-search').addEventListener('input',renderLocker);
  $('locker-refresh').addEventListener('click',()=>runClient(async()=>{
    text('locker-status','Loading owned items and current loadout…');const result=await window.vts.clientLocker();
    if(!result.ok){text('locker-status',result.error);return result;}lockerSnapshot=result.locker;inspectedItem=null;renderLocker();return result;
  }));
  $('own-stats-refresh').addEventListener('click',()=>runClient(async()=>{
    text('overview-subtitle','Loading your recent competitive matches…');const result=await window.vts.clientStats();
    if(!result.ok){text('overview-subtitle',result.error);return result;}ownStatsSnapshot=result.stats;renderOwnStats();return result;
  }));
  $('player-detail-close').addEventListener('click',()=>$('player-detail').close());
  $('overlay-report-close').addEventListener('click',()=>$('overlay-report').classList.add('hidden'));
  window.vts.on('stats:updated',value=>{if(value.isOwn){ownStatsSnapshot=value.stats;renderOwnStats();}else if(value.puuid)playerStatsCache.set(value.puuid,value.stats);if(rosterSnapshot.length)renderRoster();});
  setInterval(()=>{
    if(shopSnapshot&&activePage==='client'&&clientTab==='shop')renderStoreCountdown();
    if(overlayMode&&current?.overlay.visible&&current?.clientConnected&&document.querySelector('[data-overlay-tab=players]').classList.contains('active'))refreshRoster(true,true);
  },1000);
}
function renderStoreCountdown(){
  if(!shopSnapshot || storeError)return;
  const offers=shopSnapshot[storeTab] || [];
  const expiry=storeTab==='offers'?shopSnapshot.expiresAt:storeTab==='accessories'?shopSnapshot.accessoriesExpireAt:storeTab==='bonus'?shopSnapshot.bonusExpireAt:offers[0]?.expiresAt;
  text('shop-status',offers.length+' '+(storeTab==='bundles'?'bundles':'offers')+' · Resets in '+timeLeft(expiry)+(shopSnapshot.warnings.length?' · '+shopSnapshot.warnings.join(' '):''));
}

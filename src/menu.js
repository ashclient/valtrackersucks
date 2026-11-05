'use strict';
let agentContext='';let agentChosen='';let agentActionBusy=false;
function renderModeSettings(){
  if(!current)return;const parent=$('stats-mode-options');empty(parent);
  for(const [id,name]of [['all','All modes'],...VtsModes.options]){const label=node('label','mode-option');const input=node('input');input.type='checkbox';input.value=id;input.name='statsMode';input.checked=VtsModes.normalize(current.settings.statsModes).includes(id);input.addEventListener('change',()=>{if(id==='all'&&input.checked)parent.querySelectorAll('input:not([value=all])').forEach(i=>i.checked=false);else if(id!=='all'&&input.checked)parent.querySelector('[value=all]').checked=false;});label.append(input,document.createTextNode(name));parent.appendChild(label);}
  const select=$('live-mode');empty(select);
  for(const [id,name]of [['all','All modes'],...VtsModes.options,['selected','My selected modes']]){const option=node('option','',name);option.value=id;select.appendChild(option);}
  const modes=VtsModes.normalize(current.settings.statsModes);select.value=modes.length===1?modes[0]:'selected';renderModeSummary();
}
function renderModeSummary(){if(!current)return;text('live-mode-label',VtsModes.label(current.settings.statsModes));const ids=VtsModes.normalize(current.settings.statsModes);if($('live-mode').options.length)$('live-mode').value=ids.length===1?ids[0]:'selected';}
async function saveModeSelection(selection){
  current=await window.vts.saveSettings({...current.settings,statsModes:selection});ownStatsSnapshot=null;playerStatsCache.clear();clearMatchView();renderAll();renderModeSettings();
  text('stats-mode-status','Using '+VtsModes.label(current.settings.statsModes)+'. Stats refresh automatically.');
}
function renderAgentCorner(){
  if(!agentMode)return;
  const players=liveSnapshot?.players || [],own=players.find(p=>p.isOwn);const locked=own?.selectionState?.toLowerCase()==='locked';
  if(liveSnapshot?.contextId!==agentContext){agentContext=liveSnapshot?.contextId || '';agentChosen=own?.agentId || '';delete $('agent-confirm').dataset.confirm;}
  if(own?.agentId&&!agentChosen)agentChosen=own.agentId;
  text('agent-phase',locked?'LOCKED IN':phaseLabels[liveSnapshot?.phase] || 'WAITING');
  const query=$('agent-search').value.trim().toLowerCase(),grid=$('agent-picker-grid');empty(grid);
  const taken=new Set(players.filter(p=>!p.isOwn&&p.selectionState?.toLowerCase()==='locked').map(p=>p.agentId));
  for(const agent of agentCatalog.filter(a=>a.name.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name))){
    const button=node('button','agent-choice'+(agentChosen===agent.id?' selected':''));button.type='button';button.setAttribute('aria-pressed',String(agentChosen===agent.id));button.title=agent.name+' · '+agent.role;
    const art=imageElement(agent.portrait||agent.icon,agent.name,'');if(art)button.appendChild(art);button.appendChild(node('span','',agent.name));
    button.disabled=locked||taken.has(agent.id)||agentActionBusy;
    button.addEventListener('click',()=>chooseCornerAgent(agent));grid.appendChild(button);
  }
  text('agent-chosen',agentCatalog.find(a=>a.id===agentChosen)?.name || 'Choose an agent');
  $('agent-confirm').textContent=locked?'Locked in':$('agent-confirm').dataset.confirm===agentChosen?'Confirm lock':'Lock agent';$('agent-confirm').disabled=locked||agentActionBusy||!agentChosen||!current?.clientConnected||!['agent-select','loading'].includes(liveSnapshot?.phase);
}
async function chooseCornerAgent(agent){
  if(agentActionBusy)return;agentActionBusy=true;agentChosen=agent.id;delete $('agent-confirm').dataset.confirm;renderAgentCorner();
  try{const result=await window.vts.clientAction('select',agent.id);text('overlay-feedback',result.ok?'Selected '+agent.name:result.error);}
  catch(error){text('overlay-feedback',error.message);}finally{agentActionBusy=false;renderAgentCorner();}
}
function bindMenu(){
  $('top-client-connect').addEventListener('click',()=>$('client-connect').click());
  $('save-stats-modes').addEventListener('click',async()=>{const values=[...$('stats-mode-options').querySelectorAll('input:checked')].map(i=>i.value);try{await saveModeSelection(values);}catch(error){text('stats-mode-status',error.message);}});
  $('live-mode').addEventListener('change',async event=>{if(event.target.value==='selected'){showPage('settings');return;}try{await saveModeSelection([event.target.value]);}catch(error){showToast(error.message,true);}});
  window.vts.on('stats:cleared',()=>{reportGeneration++;if($('player-detail').open)$('player-detail').close();$('overlay-report').classList.add('hidden');ownStatsSnapshot=null;playerStatsCache.clear();rosterSnapshot=[];clearMatchView();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlayMode&&!agentMode){event.preventDefault();window.vts.overlay('hide');}});
  $('agent-search').addEventListener('input',renderAgentCorner);
  $('agent-confirm').addEventListener('click',async()=>{
    if(agentActionBusy||!agentChosen)return;const agent=agentCatalog.find(a=>a.id===agentChosen);if(!agent)return;
    // Confirmation is inline so it does not open a focus-stealing native modal over the game.
    if($('agent-confirm').dataset.confirm!==agentChosen){$('agent-confirm').dataset.confirm=agentChosen;$('agent-confirm').textContent='Confirm lock';text('overlay-feedback','Lock '+agent.name+'? Click Confirm lock to commit.');return;}
    agentActionBusy=true;$('agent-confirm').disabled=true;
    try{const result=await window.vts.clientAction('lock',agentChosen);text('overlay-feedback',result.ok?'Locked '+agent.name:result.error);}
    catch(error){text('overlay-feedback',error.message);}finally{agentActionBusy=false;delete $('agent-confirm').dataset.confirm;renderAgentCorner();}
  });
}

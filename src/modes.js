'use strict';
(function(root){
  const options=[['competitive','Competitive'],['unrated','Unrated'],['swiftplay','Swiftplay'],['spikerush','Spike Rush'],['deathmatch','Deathmatch'],['hurm','Team Deathmatch'],['ggteam','Escalation'],['onefa','Replication'],['newmap','New map'],['snowball','Snowball Fight'],['custom','Custom']];
  function normalize(value){const ids=Array.isArray(value)?[...new Set(value.filter(id=>options.some(x=>x[0]===id)))].sort():[];return !Array.isArray(value)||value.includes('all')||!ids.length?['all']:ids;}
  function includes(selection,queue){const ids=normalize(selection);return ids.includes('all')||ids.includes(queue||'custom');}
  function label(selection){const ids=normalize(selection);return ids.includes('all')?'All modes':ids.map(id=>options.find(x=>x[0]===id)?.[1]||id).join(' + ');}
  const api={options,normalize,includes,label,key:value=>normalize(value).join(',')};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.VtsModes=api;
})(globalThis);

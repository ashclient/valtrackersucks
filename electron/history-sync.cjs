'use strict';
const {mergeMatches}=require('./local-data.cjs');
// Preserve a different imported profile; an explicit Sync can approve switching it.
function mergeClientHistory(snapshot,sessionId,profileId,matches){
  const own=snapshot?.players.find(p=>p.isOwn&&p.puuid===sessionId);
  if(!own?.stats?.matches?.length||matches.length&&profileId!==sessionId)return null;
  if(!matches.length||own.stats.matches.some(m=>!matches.some(old=>old.id===m.id)))return {puuid:sessionId,matches:mergeMatches(matches,own.stats.matches)};
  return null;
}
module.exports={mergeClientHistory};

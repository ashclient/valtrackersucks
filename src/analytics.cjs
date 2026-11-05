/* Shared pure analysis helpers. Extract statistics only for the requested participant. */
'use strict';
function number(value) {
  var n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function round(value, precision) {
  var places = precision === undefined ? 1 : precision;
  var factor = Math.pow(10, places);
  return Math.round(number(value) * factor) / factor;
}
function mapName(mapId) {
  if (typeof mapId !== 'string') return 'Unknown map';
  var tail = mapId.split('/').filter(Boolean).pop() || mapId;
  var names = {
    Ascent: 'Ascent', Bind: 'Bind', Haven: 'Haven', Split: 'Split',
    Duality: 'Bind', Bonsai: 'Split', Triad: 'Haven',
    Port: 'Icebox', Icebox: 'Icebox', Breeze: 'Breeze',
    Foxtrot: 'Breeze', Canyon: 'Fracture', Fracture: 'Fracture',
    Pitt: 'Pearl', Pearl: 'Pearl', Jam: 'Lotus', Lotus: 'Lotus',
    Juliett: 'Sunset', Sunset: 'Sunset', Infinity: 'Abyss',
    Abyss: 'Abyss', Rook: 'Corrode', Corrode: 'Corrode'
  };
  return names[tail] || tail.replace(/([a-z])([A-Z])/g, '$1 $2');
}
function playerId(player) { return player && (player.puuid || player.subject); }
function analyzeMatch(match, ownPuuid) {
  if (!match || typeof match !== 'object' || !Array.isArray(match.players)) {
    throw new Error('This is not an official VALORANT match response.');
  }
  if (!ownPuuid || typeof ownPuuid !== 'string') {
    throw new Error('Enter your own PUUID in Settings before importing matches.');
  }
  var player = match.players.find(function (p) { return p && playerId(p) === ownPuuid; });
  if (!player) throw new Error('Your PUUID does not appear in this match.');
  var stats = player.stats || {};
  var rounds = Math.max(1, number(stats.roundsPlayed) || (Array.isArray(match.roundResults) ? match.roundResults.length : 0));
  var head = 0, body = 0, leg = 0, damage = 0, hasDamage = false;
  (Array.isArray(match.roundResults) ? match.roundResults : []).forEach(function (r) {
    var ps = (Array.isArray(r.playerStats) ? r.playerStats : []).find(function (entry) { return entry && playerId(entry) === ownPuuid; });
    if (ps && Array.isArray(ps.damage)) hasDamage = true;
    (ps && Array.isArray(ps.damage) ? ps.damage : []).forEach(function (hit) {
      head += number(hit.headshots);
      body += number(hit.bodyshots);
      leg += number(hit.legshots);
      damage += number(hit.damage);
    });
  });
  var team = (Array.isArray(match.teams) ? match.teams : []).find(function (t) { return t.teamId === player.teamId; });
  var kills = number(stats.kills), deaths = number(stats.deaths), assists = number(stats.assists);
  return {
    id: String((match.matchInfo && match.matchInfo.matchId) || ('import-' + Date.now())),
    timestamp: number(match.matchInfo && match.matchInfo.gameStartMillis) || Date.now(),
    map: mapName(match.matchInfo && match.matchInfo.mapId),
    agentId: String(player.characterId || ''),
    queue: String((match.matchInfo && (match.matchInfo.queueId || match.matchInfo.queueID)) || 'Unknown'),
    result: team && typeof team.won === 'boolean' ? (team.won ? 'WIN' : 'LOSS') : 'UNKNOWN',
    kills: kills, deaths: deaths, assists: assists,
    kd: round(kills / Math.max(1, deaths), 2),
    acs: round(number(stats.score) / rounds, 0),
    adr: damage ? round(damage / rounds, 0) : null,
    hs: head + body + leg ? round((head / (head + body + leg)) * 100, 1) : null,
    rounds: rounds,
    combat: { score: number(stats.score), headshots: head, hits: head + body + leg, damage: damage, hasDamage: hasDamage }
  };
}
function summary(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var wins = list.filter(function (m) { return m.result === 'WIN'; }).length;
  var decided = list.filter(function (m) { return m.result === 'WIN' || m.result === 'LOSS'; }).length;
  var avg = function (key) {
    var available = list.filter(function (m) { return m[key] !== null && Number.isFinite(Number(m[key])); });
    return available.length ? round(available.reduce(function (sum, m) { return sum + number(m[key]); }, 0) / available.length, 1) : null;
  };
  return {
    played: list.length,
    wins: wins,
    winRate: decided ? round(100 * wins / decided, 1) : null,
    kd: avg('kd'), hs: avg('hs'), adr: avg('adr'), acs: avg('acs')
  };
}
function aggregateRecent(matches) {
  var result = summary(matches);
  if (!matches.length) return result;
  var kills=0,deaths=0,rounds=0,score=0,heads=0,hits=0,damage=0,damageRounds=0;
  matches.forEach(function(m){
    kills+=number(m.kills);deaths+=number(m.deaths);rounds+=number(m.rounds);
    score+=number(m.combat && m.combat.score);heads+=number(m.combat && m.combat.headshots);hits+=number(m.combat && m.combat.hits);
    if(m.combat && m.combat.hasDamage){damage+=number(m.combat.damage);damageRounds+=number(m.rounds);}
  });
  result.kd=round(kills/Math.max(1,deaths),2);result.acs=rounds?round(score/rounds,0):null;
  result.hs=hits?round(heads/hits*100,1):null;result.adr=damageRounds?round(damage/damageRounds,0):null;
  return result;
}
module.exports = { playerId: playerId, aggregateRecent: aggregateRecent, analyzeMatch: analyzeMatch, summary: summary, mapName: mapName };

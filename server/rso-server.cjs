'use strict';

/**
 * Optional production-side Riot Sign On adapter.
 * Deploy under HTTPS with an approved Riot client. This service does not accept Riot passwords.
 * Never package this server or any of its secrets with the desktop installer.
 *
 * All sessions are ephemeral in this single-process reference deployment.
 * Use durable encrypted session storage and proper external rate limiting at scale.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { analyzeMatch } = require('../src/analytics.cjs');

const secrets = {
  clientId: process.env.RIOT_RSO_CLIENT_ID || '',
  clientSecret: process.env.RIOT_RSO_CLIENT_SECRET || '',
  redirectUri: process.env.RIOT_RSO_REDIRECT_URI || '',
  apiKey: process.env.RIOT_API_KEY || '',
  publicUrl: process.env.VTS_PUBLIC_URL || ''
};
const ALLOWED_REGIONS = new Set(['na','eu','ap','kr','br','latam']);
const links = new Map();
const states = new Map();
const sessions = new Map();
const ipHits = new Map();
const LINK_DURATION = 5 * 60 * 1000;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const random = n => crypto.randomBytes(n).toString('base64url');
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const timing = (a,b) => typeof a === 'string' && typeof b === 'string' &&
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function configured() {
  if (!secrets.clientId || !secrets.clientSecret || !secrets.redirectUri || !secrets.apiKey || !secrets.publicUrl) return false;
  try {
    const url = new URL(secrets.publicUrl);
    const redirect = new URL(secrets.redirectUri);
    return url.protocol === 'https:' && redirect.protocol === 'https:' &&
      redirect.href.startsWith(url.origin + '/oauth/callback');
  } catch (_) { return false; }
}
function response(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', ...headers });
  res.end(JSON.stringify(payload));
}
function page(res, html, status = 200) {
  res.writeHead(status, {'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
  res.end('<!doctype html><html><head><meta charset="utf-8"><title>VTS · Riot Sign On</title>'+
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11151d;color:#f3f4f7;font:16px system-ui}'+
    'main{max-width:440px;padding:40px;background:#1c2431;border:1px solid #414758;border-radius:14px;line-height:1.65}'+
    'h1{font-size:24px;color:#ff7182;margin:0 0 12px}</style></head><body><main>'+
    html +'</main></body></html>');
}
function prune() {
  const now = Date.now();
  for (const [id,x] of links) if (x.expires < now) links.delete(id);
  for (const [id,x] of states) if (x.expires < now) states.delete(id);
  for (const [id,x] of sessions) if (x.expires < now) sessions.delete(id);
  for (const [id,x] of ipHits) if (x.expires < now) ipHits.delete(id);
}
async function jsonBody(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { throw new Error('Invalid JSON'); }
}
function rateCheck(req) {
  // Behind an HTTPS reverse proxy, protect this endpoint at the edge too.
  // Never trust X-Forwarded-For from an untrusted client.
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = ipHits.get(ip) || {count:0,expires:now + 60000};
  if (entry.expires < now) {entry.count=0;entry.expires=now+60000;}
  entry.count++;
  ipHits.set(ip,entry);
  return entry.count <= 90;
}
async function remoteJSON(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {headers:{'Accept':'application/json',...headers}, signal:controller.signal});
    if (res.status === 429) throw new Error('Riot API rate limit. Try again shortly.');
    if (!res.ok) throw new Error('Riot API HTTP ' + res.status);
    return await res.json();
  } finally {clearTimeout(timeout);}
}
async function exchangeCode(code) {
  const basic = Buffer.from(secrets.clientId + ':' + secrets.clientSecret, 'utf8').toString('base64');
  const body = new URLSearchParams({
    grant_type:'authorization_code', code, redirect_uri:secrets.redirectUri
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://auth.riotgames.com/token', {
      method:'POST',
      headers: {'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
      body:body.toString(),signal:controller.signal
    });
    if (!res.ok) throw new Error('OAuth token request rejected with HTTP ' + res.status);
    const auth = await res.json();
    if (!auth.access_token) throw new Error('Riot did not return an access token');
    return auth.access_token;
  } finally {clearTimeout(timeout);}
}
async function myAccount(accessToken) {
  const acc = await remoteJSON('https://americas.api.riotgames.com/riot/account/v1/accounts/me', {
    Authorization:'Bearer '+accessToken
  });
  if (!acc || typeof acc.puuid !== 'string') throw new Error('Riot did not identify this account');
  return {
    puuid: acc.puuid.slice(0, 128),
    gameName: String(acc.gameName || '').slice(0, 50),
    tagLine: String(acc.tagLine || '').slice(0, 12)
  };
}
function bearerSession(req) {
  const match = /^Bearer ([A-Za-z0-9_-]{30,120})$/.exec(req.headers.authorization || '');
  if (!match) return null;
  const session = sessions.get(tokenHash(match[1]));
  return session && session.expires > Date.now() ? session : null;
}
async function route(req,res) {
  prune();
  if (!rateCheck(req)) return response(res,429,{error:'Rate limited'});
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/health' && req.method === 'GET')
    return response(res,200,{status:'up',configured:configured()});
  if (!configured()) return response(res,503,{error:'RSO credentials and HTTPS deployment have not been configured.'});
  if (url.pathname === '/api/device/start' && req.method === 'POST') {
    if (links.size >= 250) return response(res,429,{error:'Too many login attempts'});
    const linkId = random(18), pollSecret = random(32);
    links.set(linkId, {pollHash:tokenHash(pollSecret),expires:Date.now()+LINK_DURATION,status:'pending'});
    return response(res,200,{loginUrl:new URL('/connect/'+linkId,secrets.publicUrl).href,pollSecret,expiresIn:300});
  }
  if (url.pathname.startsWith('/connect/') && req.method === 'GET') {
    const linkId = url.pathname.slice('/connect/'.length);
    const link = links.get(linkId);
    if (!link || link.status!=='pending') return page(res,'<h1>Link expired</h1><p>Return to VTS and start again.</p>',404);
    const state = random(32);
    states.set(state,{linkId,expires:Date.now()+LINK_DURATION});
    const auth = new URL('https://auth.riotgames.com/authorize');
    auth.searchParams.set('client_id',secrets.clientId);
    auth.searchParams.set('redirect_uri',secrets.redirectUri);
    auth.searchParams.set('response_type','code');
    auth.searchParams.set('scope','openid offline_access');
    auth.searchParams.set('state',state);
    res.writeHead(302,{Location:auth.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
    return res.end();
  }
  if (url.pathname === '/oauth/callback' && req.method === 'GET') {
    const state = url.searchParams.get('state');
    const record = state && states.get(state);
    if (!record || record.expires < Date.now()) return page(res,'<h1>Authorization expired</h1><p>Return to VTS and start again.</p>',400);
    states.delete(state);
    const link = links.get(record.linkId);
    if (!link || link.status!=='pending') return page(res,'<h1>Authorization expired</h1>',400);
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) return page(res,'<h1>Authorization cancelled</h1><p>Return to VTS to retry.</p>',400);
    try {
      const accessToken = await exchangeCode(code);
      const account = await myAccount(accessToken);
      const sessionToken = random(48);
      sessions.set(tokenHash(sessionToken), {account,expires:Date.now()+SESSION_DURATION});
      link.status='linked';
      link.account=account;
      link.sessionToken=sessionToken;
      return page(res,'<h1>Account connected</h1><p>Your Riot account is linked to VTS with your consent. You may close this tab and return to the desktop application.</p>');
    } catch(error) {
      link.status='error'; link.error='Riot authorization failed. Please retry.';
      return page(res,'<h1>Connection failed</h1><p>VTS was unable to complete Riot authorization. Please try again.</p>',502);
    }
  }
  if (url.pathname === '/api/device/poll' && req.method === 'POST') {
    const body = await jsonBody(req);
    const token = typeof body.pollSecret === 'string' ? body.pollSecret : '';
    const candidateHash = tokenHash(token);
    const record = [...links.values()].find(x=>timing(x.pollHash,candidateHash));
    if (!record || record.expires < Date.now()) return response(res,404,{error:'Link attempt expired'});
    if (record.status==='linked') {
      const account = record.account,sessionToken=record.sessionToken;
      // Never return the application session twice.
      record.status='used';record.sessionToken=null;
      return response(res,200,{status:'linked',account,sessionToken});
    }
    if (record.status==='error') return response(res,403,{error:record.error});
    return response(res,200,{status:'pending'});
  }
  if (url.pathname === '/api/account' && req.method === 'GET') {
    const session=bearerSession(req);
    return session ? response(res,200,{account:session.account}) : response(res,401,{error:'Not signed in'});
  }
  if (url.pathname === '/api/disconnect' && req.method === 'POST') {
    const session=bearerSession(req);
    if (!session) return response(res,401,{error:'Not signed in'});
    const token = req.headers.authorization.slice('Bearer '.length);
    sessions.delete(tokenHash(token));
    return response(res,200,{ok:true});
  }
  if (url.pathname === '/api/matches/sync' && req.method === 'POST') {
    const session=bearerSession(req);
    if (!session) return response(res,401,{error:'Not signed in'});
    const body=await jsonBody(req);
    const region=String(body.region||'na').toLowerCase();
    if (!ALLOWED_REGIONS.has(region)) return response(res,400,{error:'Invalid region'});
    const host='https://'+region+'.api.riotgames.com';
    const puuid=session.account.puuid;
    const headers={'X-Riot-Token':secrets.apiKey};
    try {
      const matchList=await remoteJSON(host+'/val/match/v1/matchlists/by-puuid/'+encodeURIComponent(puuid),headers);
      const history=Array.isArray(matchList.history)?matchList.history.slice(0,10):[];
      const matches=[];
      for (const row of history) {
        if (typeof row.matchId!=='string'||!/^[0-9a-zA-Z-]{8,80}$/.test(row.matchId)) continue;
        const detail=await remoteJSON(host+'/val/match/v1/matches/'+encodeURIComponent(row.matchId),headers);
        matches.push(analyzeMatch(detail,puuid));
      }
      return response(res,200,{count:matches.length,matches});
    }catch(error){
      return response(res,502,{error:'Could not sync completed matches: '+error.message});
    }
  }
  return response(res,404,{error:'Not found'});
}
function start() {
  if (!configured()) throw new Error('Set approved RIOT_RSO_CLIENT_ID, RIOT_RSO_CLIENT_SECRET, RIOT_RSO_REDIRECT_URI, RIOT_API_KEY and HTTPS VTS_PUBLIC_URL.');
  const host=process.env.VTS_BIND_HOST||'127.0.0.1';
  const port=Number(process.env.PORT||8799);
  const server=http.createServer((req,res)=>route(req,res).catch(error=>
    response(res,400,{error:error.message||'Invalid request'})));
  server.listen(port,host,()=>process.stdout.write('VTS RSO backend listening on '+host+':'+port+'\n'));
  return server;
}
if (require.main===module) start();
module.exports={configured,route,start};

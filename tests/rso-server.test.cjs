'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {configured,route}=require('../server/rso-server.cjs');
test('requires real approved OAuth configuration',()=>{
  if(!process.env.RIOT_RSO_CLIENT_ID) assert.equal(configured(),false);
});
test('health endpoint reports configuration without secrets',async()=>{
  const server=http.createServer((req,res)=>route(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port=server.address().port;
    const response=await fetch('http://127.0.0.1:'+port+'/health');
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.status,'up');
    assert.equal(typeof data.configured,'boolean');
    assert.equal('clientSecret' in data,false);
    const denied=await fetch('http://127.0.0.1:'+port+'/api/device/start',{method:'POST'});
    if(!configured())assert.equal(denied.status,503);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

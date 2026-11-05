'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {mergeClientHistory}=require('../electron/history-sync.cjs');
const game={id:'new-match',timestamp:123,kills:12},snapshot={players:[{puuid:'self',isOwn:true,stats:{matches:[game]}}]};
test('own automatic stats populate an empty saved history without a manual sync click',()=>{assert.deepEqual(mergeClientHistory(snapshot,'self','',[]),{puuid:'self',matches:[game]});});
test('automatic history never mixes or replaces a different imported profile',()=>{assert.equal(mergeClientHistory(snapshot,'self','other',[{id:'old-match'}]),null);assert.equal(mergeClientHistory(snapshot,'self','',[{id:'old-match'}]),null);assert.equal(mergeClientHistory(snapshot,'different','',[]),null);});
test('already imported games do not trigger repeated disk writes',()=>{assert.equal(mergeClientHistory(snapshot,'self','self',[game]),null);assert.equal(mergeClientHistory({players:[]},'self','',[]),null);});

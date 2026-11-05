'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {normalizeKey,Shortcuts,DEFAULT_KEYS}=require('../electron/shortcuts.cjs');
function fixture(){const keys=new Map();const unavailable=new Set();return {keys,unavailable,api:{register:(key,cb)=>{if(unavailable.has(key)||keys.has(key))return false;keys.set(key,cb);return true;},unregister:key=>keys.delete(key),unregisterAll:()=>keys.clear()}};}
test('normalizes modifier order and rejects plain gameplay keys',()=>{
 assert.equal(normalizeKey('Shift+Control+V'),'Control+Shift+V');assert.equal(normalizeKey('F2'),'F2');
 for(const key of ['V','1','Control+Control+V','Control+Escape','Control+F25'])assert.equal(normalizeKey(key),null);
});
test('registered overlay callbacks work without a desktop window dependency',()=>{
 const f=fixture();let toggles=0;const shortcuts=new Shortcuts(f.api,{overlay:()=>toggles++,interaction:()=>{}});
 shortcuts.apply(DEFAULT_KEYS);f.keys.get(DEFAULT_KEYS.overlay)();assert.equal(toggles,1);assert.ok(shortcuts.current);
});
test('a taken replacement restores both working shortcuts',()=>{
 const f=fixture();const shortcuts=new Shortcuts(f.api,{overlay:()=>{},interaction:()=>{}});shortcuts.apply(DEFAULT_KEYS);
 f.unavailable.add('F3');assert.throws(()=>shortcuts.apply({overlay:'F2',interaction:'F3'}),/unavailable/);
 assert.deepEqual([...f.keys.keys()].sort(),Object.values(DEFAULT_KEYS).sort());assert.deepEqual(shortcuts.current,DEFAULT_KEYS);
});
test('duplicates are rejected before unregistering existing keys',()=>{
 const f=fixture();const shortcuts=new Shortcuts(f.api,{overlay:()=>{},interaction:()=>{}});shortcuts.apply(DEFAULT_KEYS);
 assert.throws(()=>shortcuts.apply({overlay:'F2',interaction:'F2'}),/different/);assert.equal(f.keys.size,2);
});

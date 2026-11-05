'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validImage, sanitizeAgent, sanitizeMap, sanitizeWeapon, getCatalog } = require('../electron/catalog.cjs');

test('only image URLs from allowed HTTPS host', () => {
  assert.equal(validImage('https://media.valorant-api.com/agents/test.png'), 'https://media.valorant-api.com/agents/test.png');
  assert.equal(validImage('https://media.valorant-api.com.evil.test/test.png'), null);
  assert.equal(validImage('javascript:alert(1)'), null);
  assert.equal(validImage('http://media.valorant-api.com/agents/foo.png'), null);
  assert.equal(validImage('file:///C:/secrets.txt'), null);
});
test('normalizes one playable agent, excludes non-playable agent', () => {
  assert.equal(sanitizeAgent({ uuid: 'abc', displayName: 'Jett', isPlayableCharacter: false }), null);
  assert.deepEqual(sanitizeAgent({
    uuid: 'abc', displayName: 'Jett', isPlayableCharacter: true,
    role: { displayName: 'Duelist' }, displayIconSmall: 'https://media.valorant-api.com/test.png',
    abilities: [{ displayName: 'Dash', slot: 'Ability2', displayIcon: 'javascript:evil()' }]
  }), {
    id: 'abc', name: 'Jett', role: 'Duelist', description: '',
    portrait: 'https://media.valorant-api.com/test.png', fullPortrait: null,
    icon: null,
    abilities: [{ name: 'Dash', slot: 'Ability2', description: '', icon: null }]
  });
});
test('map and weapons are filtered to display-safe fields', () => {
  assert.equal(sanitizeMap({ uuid: 'map1', displayName: 'Ascent', callouts: [1,2] }).callouts, 2);
  assert.equal(sanitizeWeapon({ uuid: 'weapon1', displayName: 'Vandal', shopData: { categoryText: 'Rifles', cost: 2900 } }).cost, 2900);
});
test('rejects arbitrary catalog queries', async () => {
  await assert.rejects(getCatalog('anything-else'), /Unknown catalog/);
});
test('weapon metadata includes standard skins, all variants and actual level numbers',()=>{
  const weapon=sanitizeWeapon({uuid:'gun',displayName:'Gun',skins:[{uuid:'skin',displayName:'Standard Gun',levels:[{uuid:'base',displayName:'Base'},{uuid:'upgrade',displayName:'Upgrade'}],chromas:[{uuid:'blue',displayName:'Blue',fullRender:'https://media.valorant-api.com/blue.png'}]}]});
  assert.equal(weapon.skins.length,1);assert.equal(weapon.skins[0].levels[1].level,2);assert.equal(weapon.skins[0].chromas[0].id,'blue');
});

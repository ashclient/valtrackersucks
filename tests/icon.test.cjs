'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('builds recognizable Windows icon with embedded 256px PNG',()=>{
  execFileSync(process.execPath,[path.join(__dirname,'../scripts/generate-icons.cjs')],{stdio:'pipe'});
  const content=fs.readFileSync(path.join(__dirname,'../assets/icon.ico'));
  assert.equal(content.readUInt16LE(2),1);
  assert.equal(content.readUInt16LE(4),1);
  assert.equal(content.readUInt16LE(12),32);
  const offset=content.readUInt32LE(18);
  assert.equal(offset,22);
  assert.equal(content.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(content.readUInt32BE(offset+16),256);
  assert.equal(content.readUInt32BE(offset+20),256);
});

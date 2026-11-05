'use strict';
/* No image-generation packages needed. Reproducible 256x256 PNG-backed ICO. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const SIZE = 256;
const rgba = Buffer.alloc(SIZE * (SIZE * 4 + 1));
const V = [[56,62],[92,62],[134,171],[179,62],[202,62],[148,205],[120,205]];
function inPoly(x,y,points) {
  let yes=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const xi=points[i][0],yi=points[i][1],xj=points[j][0],yj=points[j][1];
    if ((yi>y)!=(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) yes=!yes;
  }
  return yes;
}
function rounded(x,y) {
  const edge=6,rad=52;
  if(x<edge||y<edge||x>=SIZE-edge||y>=SIZE-edge)return false;
  const cx=Math.max(edge+rad,Math.min(x,SIZE-edge-rad));
  const cy=Math.max(edge+rad,Math.min(y,SIZE-edge-rad));
  return (x-cx)**2+(y-cy)**2<=rad**2;
}
for(let y=0;y<SIZE;y++) {
  const stride=SIZE*4+1,offset=y*stride;
  rgba[offset]=0;
  for(let x=0;x<SIZE;x++) {
    const i=offset+1+x*4;
    const inner=rounded(x,y);
    const letter=inner&&inPoly(x,y,V);
    rgba[i]=letter?255:255;
    rgba[i+1]=letter?255:82;
    rgba[i+2]=letter?255:105;
    rgba[i+3]=inner?255:0;
  }
}
const table=Array.from({length:256},(_,n)=>{
  for(let k=0;k<8;k++) n=n&1?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
function crc(buf) {
  let c=0xffffffff;
  for(const byte of buf)c=table[(c^byte)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(type,data) {
  const head=Buffer.alloc(4);head.writeUInt32BE(data.length,0);
  const name=Buffer.from(type,'ascii');
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc(Buffer.concat([name,data])),0);
  return Buffer.concat([head,name,data,checksum]);
}
const hdr=Buffer.alloc(13);
hdr.writeUInt32BE(SIZE,0);hdr.writeUInt32BE(SIZE,4);hdr[8]=8;hdr[9]=6;
const png=Buffer.concat([
  Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',hdr),
  chunk('IDAT',zlib.deflateSync(rgba,{level:9})),
  chunk('IEND',Buffer.alloc(0))
]);
const ico=Buffer.alloc(22);
ico.writeUInt16LE(0,0);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);
ico[6]=0;ico[7]=0;ico[8]=0;ico[9]=0;
ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);
ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
const outputDir=path.join(__dirname,'..','assets');
fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,'icon.ico'),Buffer.concat([ico,png]));
fs.writeFileSync(path.join(outputDir,'icon.png'),png);
process.stdout.write('VTS branded Windows icon generated\n');

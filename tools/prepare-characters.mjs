/** Prepare sprites by cropping the user's original character sheets. No redrawing, recoloring or generated replacements.
 * Usage: node tools/prepare-characters.mjs /absolute/path/to/LevelUp_Character_Sheets_20261118
 * Crop rectangles and source hashes are recorded for reproducibility. Paper removal is edge-connected only,
 * so enclosed light clothing and skin are retained. Source sheets remain unchanged.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Pass the extracted original character-sheet directory.');
const target = path.resolve('public/assets/remaster/characters');
await fs.mkdir(target, { recursive: true });
const specs = [
  { part: 'player', sheet: '00_player', front: [548,40,220,460], left: [1050,40,190,460], right: [802,40,197,460], back:[1290,40,225,460], portrait:[985,590,210,210] },
  { part: 'bed', sheet: '01_bed_harmony', front:[538,42,222,455], portrait:[985,590,210,210] },
  { part: 'melody', sheet: '02_melody_flute', front:[540,40,202,455], portrait:[980,589,210,212] },
  { part: 'percussion', sheet: '03_percussion_tambourine', front:[536,40,224,435], portrait:[963,570,210,212] },
  { part: 'bass', sheet: '04_bass_strings', front:[432,53,280,394], portrait:[949,565,216,218] },
  { part: 'runner', sheet: '05_runner_xylophone', front:[541,40,215,457], portrait:[939,590,211,211] },
  { part: 'ornament', sheet: '06_ornament_triangle', front:[539,41,219,459], portrait:[982,588,211,213] },
  { part: 'pulse', sheet: '07_pulse_drum', front:[505,40,253,438], portrait:[946,570,214,210] },
];
const frames = {};
const composites=[];
const manifest={ version:1, source:'LevelUp_Character_Sheets_20261118', method:'Exact artwork crops; edge-connected paper removed; down/up/left/right are original front/back/side/three-quarter views. Player idle and walking atlas frames reuse each direction drawing; movement is a small runtime bob, not newly drawn poses.', frameSize:[96,144], foot:[48,136], characters:[] };
let slot=0;
function paper(r,g,b) { return r>216 && g>194 && b>161 && r-g<45 && g-b<45 && r-b<77; }
async function cut(file,rect,{removePaper=true}={}) {
 const [left,top,width,height]=rect;
 const {data,info}=await sharp(file).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(removePaper){
  const seen=new Uint8Array(width*height), queue=new Int32Array(width*height);let tail=0,head=0;
  const add=(p)=>{if(seen[p])return;const i=p*4;if(!paper(data[i],data[i+1],data[i+2]))return;seen[p]=1;queue[tail++]=p;};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);if(x)add(p-1);if(x+1<width)add(p+1);if(y)add(p-width);if(y+1<height)add(p+width);}
  for(let p=0;p<seen.length;p++) if(seen[p]) data[p*4+3]=0;
  // A few crop margins meet a printed label descender. Discard only detached specks;
  // complete figure, instrument and contact-shadow components remain untouched.
  const visited=new Uint8Array(width*height);
  for(let start=0;start<visited.length;start++){
   if(visited[start]||data[start*4+3]===0)continue;
   head=0;tail=1;queue[0]=start;visited[start]=1;
   while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);
    for(const n of [x?p-1:-1,x+1<width?p+1:-1,y?p-width:-1,y+1<height?p+width:-1]){
     if(n<0||visited[n]||data[n*4+3]===0)continue;visited[n]=1;queue[tail++]=n;
    }
   }
   if(tail<80)for(let i=0;i<tail;i++)data[queue[i]*4+3]=0;
  }
 }
 return sharp(data,{raw:info}).png().toBuffer();
}
async function inFrame(buf){
 const {data,info}=await sharp(buf).resize({width:88,height:132,fit:'inside'}).png().toBuffer({resolveWithObject:true});
 return sharp({create:{width:96,height:144,channels:4,background:'#00000000'}}).composite([{input:data,left:Math.round((96-info.width)/2),top:136-info.height}]).png().toBuffer();
}
for(const spec of specs){
 const file=path.join(source,spec.sheet,`${spec.sheet}.png`), original=await fs.readFile(file);
 const front=await inFrame(await cut(file,spec.front));
 const record={part:spec.part,source:`${spec.sheet}/${spec.sheet}.png`,sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),crops:{front:spec.front,portrait:spec.portrait},portrait:`${spec.part}-portrait.webp`};
 // Portrait keeps its original paper-filled circular frame, clipped only outside the painted circle.
 const portrait=await sharp(file).extract({left:spec.portrait[0],top:spec.portrait[1],width:spec.portrait[2],height:spec.portrait[3]}).resize(256,256).composite([{input:Buffer.from('<svg width="256" height="256"><circle cx="128" cy="128" r="127" fill="white"/></svg>'),blend:'dest-in'}]).webp({quality:92,alphaQuality:100}).toBuffer();
 await fs.writeFile(path.join(target,record.portrait),portrait);
 await sharp(front).webp({quality:92,alphaQuality:100}).toFile(path.join(target,`${spec.part}-standing.webp`));
 const put=(name,input)=>{const x=(slot%8)*96,y=Math.floor(slot/8)*144;frames[name]={frame:{x,y,w:96,h:144},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:96,h:144},sourceSize:{w:96,h:144}};composites.push({input,left:x,top:y});slot++;};
 if(spec.part==='player') {
  for(const facing of ['down','up','left','right']){
   const rect=facing==='down'?spec.front:facing==='up'?spec.back:spec[facing];
   const image=facing==='down'?front:await inFrame(await cut(file,rect));
   record.crops[facing]=rect;
   for(const pose of ['idle','walk']) for(let i=0;i<(pose==='idle'?2:6);i++) put(`chr-player-${facing}-${pose}-${i}`,image);
  }
 } else put(`chr-${spec.part}-standing`,front);
 manifest.characters.push(record);
}
const rows=Math.ceil(slot/8);
await sharp({create:{width:768,height:rows*144,channels:4,background:'#00000000'}}).composite(composites).webp({quality:95,alphaQuality:100}).toFile(path.join(target,'atlas.webp'));
await fs.writeFile(path.join(target,'atlas.json'),JSON.stringify({frames,meta:{app:'LevelUp original-sheet preparation',image:'atlas.webp',format:'RGBA8888',size:{w:768,h:rows*144},scale:'1'}},null,2)+'\n');
await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${specs.length} original characters, ${slot} atlas frames and eight UI portraits.`);

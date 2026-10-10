// One-time publisher operation. The resulting catalog is checked into the game.
import fs from 'node:fs';
import { randomInt } from 'node:crypto';
const source = fs.readFileSync('js/characters.js', 'utf8');
const categories = {hats:'HAT',skins:'SKIN',pets:'PET'};
const shuffle = a => {for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const entries = Object.entries(categories).flatMap(([category,prefix]) => {
 const block=source.match(new RegExp('var '+prefix+'_DEFS = \\[([\\s\\S]*?)\\];'))[1];
 return [...block.matchAll(/id: '([^']+)',\s+name: '([^']+)'/g)].filter(m=>m[1]!=='none').map(m=>({category,id:m[1],name:m[2]}));
});
const free = new Set();
for(const category of Object.keys(categories))free.add(shuffle(entries.filter(e=>e.category===category))[0]);
shuffle(entries.filter(e=>!free.has(e))).slice(0,3).forEach(e=>free.add(e));
const tiers=shuffle(Array.from({length:22},(_,i)=>[10000,20000,30000,50000][i%4]));
let i=0;entries.forEach(e=>e.minimum=free.has(e)?0:tiers[i++]);
const catalog={version:1,ticker:'OUTCAST',network:'Solana mainnet',items:entries};
fs.writeFileSync('integration/cosmetics-catalog.json',JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync('js/cosmetics-catalog.js','/* Shared Outcast wardrobe policy. Generated once; identical for every player. */\nwindow.AL = window.AL || {};\nAL.cosmeticsCatalog = Object.freeze('+JSON.stringify(catalog,null,2)+');\n');
console.log(entries.map(e=>`${e.category}/${e.id}: ${e.minimum||'FREE'}`).join('\n'));

import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('integration/cosmetics-catalog.json','utf8'));
const script=`/* Outcast wardrobe: shared policy and server-authoritative on-chain checks. */
var OUTCAST_CATALOG = ${JSON.stringify(catalog)};
// Mint created by the publisher on iDosGames, Solana mainnet. No client-supplied mint/address.
var OUTCAST_MINT = '3BCFLiDS7HJBvo23r91dCDERJi8GgdqeQb8zfrXgidos';
var OUTCAST_DECIMALS = 6;
function outcastData(result) {
 if (!result || result.Success === false) throw new Error('Server data unavailable.');
 return result.Data || result;
}
function outcastMinimum(category,id) {
 if (['hats','skins','pets'].indexOf(category)<0) throw new Error('Unknown category.');
 if(id==='none')return 0;
 for(var i=0;i<OUTCAST_CATALOG.items.length;i++){
  var item=OUTCAST_CATALOG.items[i];
  if(item.category===category && item.id===id)return item.minimum;
 }
 throw new Error('Unknown cosmetic.');
}
function outcastAdd(a,b){
 var out='',carry=0,i=a.length-1,j=b.length-1;
 while(i>=0||j>=0||carry){var n=(i>=0?+a[i--]:0)+(j>=0?+b[j--]:0)+carry;out=(n%10)+out;carry=Math.floor(n/10);}
 return out.replace(/^0+(?=.)/,'');
}
function outcastAtLeast(a,b){return a.length>b.length || (a.length===b.length && a>=b);}
function outcastVerify(){
 var binding={ContractAddress:OUTCAST_MINT},networkID='solana',decimals=OUTCAST_DECIMALS;
 var user=outcastData(server.ReadUserData(['Blockchain']));
 var linked=(user.Blockchain||{}).LinkedWallets||{};
 var wallet=linked[networkID];
 if(!wallet || (wallet.IsSignatureVerified!==true && wallet.LinkType!=='SignatureVerified'))return {status:'wallet_required',tiers:[],expiresAt:0};
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.Address||'') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(binding.ContractAddress))throw new Error('Invalid wallet or mint.');
 var http=outcastData(server.HttpRequest({Method:'POST',Url:'https://api.mainnet-beta.solana.com',ContentType:'application/json',Body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTokenAccountsByOwner',params:[wallet.Address,{mint:binding.ContractAddress},{encoding:'jsonParsed',commitment:'confirmed'}]})}));
 if(!http.Ok||http.BodyTooLarge)throw new Error('Solana balance check unavailable.');
 var rpc=JSON.parse(http.Body);
 if(rpc.error||!rpc.result||!Array.isArray(rpc.result.value))throw new Error('Solana balance check failed.');
 var total='0';
 for(var k=0;k<rpc.result.value.length;k++){
  var account=rpc.result.value[k].account;
  var info=account && account.data && account.data.parsed && account.data.parsed.info;
  if(!info || info.owner!==wallet.Address || info.mint!==binding.ContractAddress || !info.tokenAmount || info.tokenAmount.decimals!==decimals)throw new Error('Unexpected token account.');
  var raw=info.tokenAmount.amount;
  if(typeof raw!=='string'||!/^\\d{1,30}$/.test(raw))throw new Error('Unexpected token amount.');
  total=outcastAdd(total,raw);
 }
 var zeros=new Array(decimals+1).join('0'),tiers=[];
 [10000,20000,30000,50000].forEach(function(n){if(outcastAtLeast(total,String(n)+zeros))tiers.push(n);});
 return {status:'verified',tiers:tiers,expiresAt:Date.now()+60000,catalogVersion:OUTCAST_CATALOG.version};
}
handlers.outcastWardrobeAccess = function(){return outcastVerify();};
handlers.outcastEquipCosmetic = function(args){
 var minimum=outcastMinimum(args.category,args.id);
 var access=minimum===0?{status:'verified',tiers:[],expiresAt:Date.now()+60000}:outcastVerify();
 if(minimum>0 && (access.status!=='verified'||access.tiers.indexOf(minimum)<0))return {status:'locked'};
 var written=server.SetUserCustomData('ReadOnly','outcast_cosmetic_'+args.category,JSON.stringify({id:args.id,expiresAt:access.expiresAt,catalogVersion:OUTCAST_CATALOG.version}));
 if(written && written.Success===false)throw new Error('Could not save cosmetic.');
 return {status:'equipped',id:args.id,expiresAt:access.expiresAt};
};
`;
fs.writeFileSync('integration/cloud-code.js',script);

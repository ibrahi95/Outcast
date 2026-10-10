import { createIDosGamesClient } from '@idosgames/core';
import { linkWalletViaPlatform, linkWalletSolana, loginWithWalletViaPlatform, loginWithWalletSolana, isEmbeddedInPlatform, openPlatformWalletPanel, onWalletBalanceChanged } from '@idosgames/wallet';

const AL = window.AL;
const titleID = new URLSearchParams(location.search).get('titleID');
const client = createIDosGamesClient({titleID: ['6KXNOX5I','6KXNOX5I-DEV'].includes(titleID) ? titleID : '6KXNOX5I'});
const policy = AL.cosmeticsCatalog;
const requirements = Object.fromEntries(policy.items.map(i=>[i.category+'/'+i.id,i.minimum]));
let state = {status:'idle',message:'Hold OUTCAST to unlock cosmetics. Tokens are never spent.',tiers:[],expiresAt:0};
let session, pending;
function emit(next){state={...state,...next};AL.bus.emit('wardrobe:access',state);}
function minimum(category,id){return id==='none'?0:requirements[category+'/'+id]??Infinity;}
function unlocked(category,id){const n=minimum(category,id);return n===0 || (Date.now()<state.expiresAt && state.tiers.includes(n));}
function sanitize(profile){const p={...profile};for(const [category,key] of [['hats','hat'],['skins','skin'],['pets','pet']])if(!unlocked(category,p[key]))p[key]='none';return p;}
async function authenticated(){
 if(!session) session=client.auth.autoLogin().then(r=>{if(!r.ok)throw new Error('Connect your wallet to continue.');return r;}).catch(e=>{session=null;throw e;});
 return session;
}
async function call(name,args){await authenticated();const r=await client.cloudCode.execute(name,args);if(!r.ok||r.data.Error)throw new Error('Unable to verify access. Please retry.');const data=r.data.FunctionResult;if(!data||typeof data!=='object')throw new Error('Unable to verify access.');return data;}
async function refresh(){
 if(pending)return pending;
 // Revoke old permissions before starting a new check; a failed check never grants access.
 emit({status:'checking',message:'Checking OUTCAST holdings…',tiers:[],expiresAt:0});
 pending=call('outcastWardrobeAccess',{}).then(data=>{
  const status=data.status;
  emit({status,tiers:status==='verified'?data.tiers:[],expiresAt:status==='verified'?Math.min(Number(data.expiresAt),Date.now()+60000):0,
   message:status==='verified'?'OUTCAST holdings verified. Access updates every minute.':status==='token_pending'?'OUTCAST launch pending. Free cosmetics are available.':status==='wallet_required'?'Connect a Solana wallet to unlock cosmetics.':'Hold more OUTCAST to unlock cosmetics.'});
  return data;
 }).catch(e=>{emit({status:'error',message:e.message,tiers:[],expiresAt:0});}).finally(()=>{pending=null;});return pending;
}
async function connect(){
 if(pending)return pending;
 emit({status:'connecting',message:'Confirm wallet ownership in your wallet. No tokens are spent.',tiers:[],expiresAt:0});
 try{
  const restored=await authenticated().then(()=>true).catch(()=>false);
  const networkID='solana';
  let result;
  if(isEmbeddedInPlatform()){
   await openPlatformWalletPanel();
   result=await (restored?linkWalletViaPlatform:loginWithWalletViaPlatform)({client,networkID,family:'solana'});
  }else{
   const provider=window.phantom?.solana || window.solflare || window.solana;
   if(!provider?.connect || !provider?.signMessage)throw new Error('Open this game on idosgames.com or use a Solana wallet browser.');
   await provider.connect();
   result=await (restored?linkWalletSolana:loginWithWalletSolana)({client,networkID,walletAddress:provider.publicKey.toString(),signMessage:async message=>{
    const signed=await provider.signMessage(message,'utf8');return signed.signature || signed;
   }});
  }
  if(!result.ok)throw new Error('Wallet connection was not completed. Please retry.');
  session=Promise.resolve(result);
  await refresh();
 }catch(e){emit({status:'error',message:e.message,tiers:[],expiresAt:0});}
}
async function equip(category,id,profile){
 if(!unlocked(category,id))return false;
 if(minimum(category,id)===0)return true;
 try{const r=await call('outcastEquipCosmetic',{category,id,profile:sanitize(profile)});if(r.status!=='equipped'){await refresh();return false;}return true;}
 catch(e){emit({status:'error',message:e.message,tiers:[],expiresAt:0});return false;}
}
AL.wardrobe={minimum,unlocked,sanitize,refresh,connect,equip,mint:'3BCFLiDS7HJBvo23r91dCDERJi8GgdqeQb8zfrXgidos',get state(){return state;}};
onWalletBalanceChanged(()=>{if(state.status==='verified')refresh();});
window.addEventListener('focus',()=>{if(state.status==='verified')refresh();});
setInterval(()=>{if(state.expiresAt && Date.now()>=state.expiresAt)refresh();},1000);
AL.bus.emit('wardrobe:ready');

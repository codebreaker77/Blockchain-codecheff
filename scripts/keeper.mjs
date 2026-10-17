import {provider,connect} from './lib.mjs';
const p=provider();
if(BigInt(await p.send('eth_chainId',[]))!==31337n)throw new Error('Local chain only');
const {arena,tournament}=await connect(p),signer=await p.getSigner(0);
let busy=false;
setInterval(async()=>{
  if(busy)return;busy=true;
  try {
    const now=BigInt((await p.send('eth_getBlockByNumber',['latest',false])).timestamp);
    for(let id=1;id<=Number(await arena.nextId());id++) {
      const m=await arena.getMatch(id);
      if(m.state===1n && now>=m.acceptDeadline) await(await arena.connect(signer).cancelOpen(id)).wait();
      else if(((m.state===2n||m.state===4n)&&now>=m.revealDeadline)||(m.state===3n&&now>=m.disputeDeadline))
        await(await arena.connect(signer).progress(id)).wait();
    }
    for(let id=1;id<=Number(await tournament.nextId());id++) {
      const c=await tournament.getCup(id);
      if(c.status===1n && now>=c.deadline) await(await tournament.connect(signer).expire(id)).wait();
      if(c.status===2n) {
        const matches=await Promise.all(c.roundMatches.map(x=>arena.getMatch(x)));
        if(matches.every(x=>x.state===5n))await(await tournament.connect(signer).advance(id)).wait();
      }
    }
  } catch(e){console.error('Keeper:',e.shortMessage??e.message);}finally{busy=false;}
},1000);
console.log('Local permissionless settlement keeper running');

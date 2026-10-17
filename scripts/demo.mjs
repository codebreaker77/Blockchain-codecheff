import fs from 'node:fs';
import assert from 'node:assert/strict';
import {keccak256,toUtf8Bytes,parseEther,ZeroHash} from 'ethers';
import {provider,connect,mineAt,PROBLEM} from './lib.mjs';
const p=provider(),{d,token,arena,tournament}=await connect(p);
const signers=await Promise.all([7,8,9,10].map(i=>p.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
const tx=async x=>(await x).wait();
async function waitFor(label,check,timeout=120000){
  const until=Date.now()+timeout;
  while(Date.now()<until){if(await check())return;await new Promise(r=>setTimeout(r,500));}
  throw new Error(`Timed out: ${label}`);
}
try {
  for(const signer of signers){const a=await signer.getAddress();if(!(await token.received(a)))await tx(token.connect(signer).faucet());await tx(token.connect(signer).approve(d.arena,parseEther('100')));}
  await tx(arena.connect(signers[0]).create(PROBLEM,parseEther('10'),60,600,[addresses[0]]));const id=await arena.nextId();
  await tx(arena.connect(signers[1]).accept(id,[addresses[1]]));
  for(let i=0;i<2;i++){
    const source=i===0?'a,b=map(int,input().split());print(a+b)':'print(0)',anchor=keccak256(toUtf8Bytes(source));
    await tx(arena.connect(signers[i]).submit(id,anchor));
    const signature=await signers[i].signMessage(`CodeChef local submission\n31337\n${d.arena}\n${id}\n${anchor}`);
    for(let v=1;v<=6;v++){
      const response=await fetch(`http://127.0.0.1:${8780+v}/submissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({matchId:Number(id),source,signature})});
      assert.equal(response.status,200,await response.text());
    }
  }
  let m=await arena.getMatch(id);await mineAt(p,m.solveDeadline);
  await waitFor('three independently executed commitments',async()=>{
    const c=await Promise.all(d.verifiers.slice(0,3).map(a=>arena.commitments(id,0,a)));return c.every(x=>x!==ZeroHash);
  });
  await mineAt(p,m.commitDeadline);
  await waitFor('three reveals',async()=>Number(await arena.votes(id,0,1))===3);
  await mineAt(p,m.revealDeadline);
  await waitFor('keeper proposes',async()=>(await arena.getMatch(id)).state===3n);
  // Exercise a real appeal, evaluated independently by the other three processes.
  await tx(arena.connect(signers[1]).dispute(id,keccak256(toUtf8Bytes('Request independent replay'))));
  m=await arena.getMatch(id);
  await waitFor('three appeal commitments',async()=>{
    const c=await Promise.all(d.verifiers.slice(3).map(a=>arena.commitments(id,1,a)));return c.every(x=>x!==ZeroHash);
  });
  await mineAt(p,m.commitDeadline);
  await waitFor('appeal reveals',async()=>Number(await arena.votes(id,1,1))===3);
  await mineAt(p,m.revealDeadline);
  await waitFor('keeper settlement',async()=>(await arena.getMatch(id)).state===5n);
  assert.equal((await arena.getMatch(id)).result,1n);
  const credit=await arena.claimable(addresses[0]);assert(credit>=parseEther('20'));
  await tx(arena.connect(signers[0]).claim());
  await tx(arena.connect(signers[2]).create(PROBLEM,parseEther('10'),180,600,[addresses[2]]));
  await tx(tournament.connect(signers[0]).create(PROBLEM,4,parseEther('5'),600,180));
  const cup=await tournament.nextId();
  for(const signer of signers.slice(0,2)){await tx(token.connect(signer).approve(d.tournament,parseEther('5')));await tx(tournament.connect(signer).join(cup));}
  const result={timestamp_utc:new Date().toISOString(),matchId:Number(id),signedSubmissions:2,independentVerifierProcesses:6,
    primaryVotesForA:Number(await arena.votes(id,0,1)),appealVotesForA:Number(await arena.votes(id,1,1)),
    settledWinner:'A',prizeClaimedCHEF:'20',realSandboxExecution:true,keeperSettlement:true,passed:true};
  fs.mkdirSync('docs/results',{recursive:true});fs.writeFileSync('docs/results/live-demo.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await p.destroy();}

import fs from 'node:fs';
import {Contract,ContractFactory,JsonRpcProvider,keccak256,toUtf8Bytes} from 'ethers';
export const PROBLEM=keccak256(toUtf8Bytes('codechef-local/sum-two/v1'));
export const artifact=name=>JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8'));
export const provider=(url=process.env.RPC_URL??'http://127.0.0.1:18545')=>{
  const p=new JsonRpcProvider(url,31337,{staticNetwork:true,cacheTimeout:-1}); p.pollingInterval=50; return p;
};
export async function deploy(p,windows=[120,30,30]) {
  const net=await p.getNetwork();
  if(net.chainId!==31337n) throw new Error('Deployment restricted to local chain 31337');
  // Verify the actual RPC rather than relying on ethers static network configuration.
  if(BigInt(await p.send('eth_chainId',[]))!==31337n) throw new Error('RPC must be local chain 31337');
  const signers=await Promise.all(Array.from({length:20},(_,i)=>p.getSigner(i)));
  const addresses=await Promise.all(signers.map(s=>s.getAddress()));
  async function create(name,args=[]) {
    const a=artifact(name); const c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args);
    await c.waitForDeployment(); return c;
  }
  const token=await create('ChefToken');
  const arena=await create('Arena',[await token.getAddress(),addresses.slice(1,4),addresses.slice(4,7),...windows]);
  const trophy=await create('WinnerTrophy');
  const tournament=await create('Tournament',[await token.getAddress(),await arena.getAddress(),await trophy.getAddress()]);
  await(await arena.bindTournament(await tournament.getAddress())).wait();
  await(await trophy.bindTournament(await tournament.getAddress())).wait();
  return {token,arena,trophy,tournament,signers,addresses};
}
export async function mineAt(p,timestamp) {
  const now=Number((await p.send('eth_getBlockByNumber',['latest',false])).timestamp);
  if(Number(timestamp)>now) await p.send('evm_setNextBlockTimestamp',[Number(timestamp)]);
  await p.send('evm_mine',[]);
}
export async function connect(p,file='web/deployment.json') {
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  return {d,...Object.fromEntries(['token','arena','trophy','tournament'].map(name=>[name,new Contract(d[name],d.abis[name],p)]))};
}

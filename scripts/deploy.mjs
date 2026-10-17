import fs from 'node:fs';
import {deploy,provider,PROBLEM,artifact} from './lib.mjs';
const p=provider(); const deployed=await deploy(p);
await p.send('evm_setIntervalMining',[1000]);
const names={token:'ChefToken',arena:'Arena',trophy:'WinnerTrophy',tournament:'Tournament'};
const result={chainId:31337,rpcUrl:'http://127.0.0.1:18545',problem:PROBLEM,abis:{},verifiers:deployed.addresses.slice(1,7)};
result.deploymentId=(await p.send('eth_getBlockByNumber',['latest',false])).hash.slice(2);
for(const [key,name] of Object.entries(names)) { result[key]=await deployed[key].getAddress(); result.abis[key]=artifact(name).abi; }
fs.writeFileSync('web/deployment.json',JSON.stringify(result,null,2));
console.log('Deployed local fictional-token arena:',JSON.stringify(Object.fromEntries(Object.keys(names).map(k=>[k,result[k]]))));
await p.destroy();

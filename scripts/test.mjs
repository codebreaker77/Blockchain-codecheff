import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {compile} from './compile.mjs';
compile();
const log=fs.openSync('test-chain.log','w');
const chain=spawn(process.execPath,['node_modules/hardhat/dist/src/cli.js','node','--hostname','127.0.0.1','--port','19545'],{stdio:['ignore',log,log],windowsHide:true});
try {
  let ready=false;
  for(let i=0;i<120;i++) {
    try { const r=await fetch('http://127.0.0.1:19545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})}); if((await r.json()).result==='0x7a69') {ready=true;break;} } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  if(!ready) throw new Error('Test chain failed to start; inspect test-chain.log');
  const child=spawn(process.execPath,['--test','--test-concurrency=1','test/contracts.test.mjs'],{stdio:'inherit',env:{...process.env,RPC_URL:'http://127.0.0.1:19545'},windowsHide:true});
  process.exitCode=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
} finally { chain.kill();fs.closeSync(log); }

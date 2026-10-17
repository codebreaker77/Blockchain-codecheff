import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {compile} from './compile.mjs';
for(const port of [18545,5174,8781,8782,8783,8784,8785,8786]) {
  await new Promise((resolve,reject)=>{
    const socket=net.createServer();
    socket.once('error',()=>reject(new Error(`Port ${port} is occupied. Stop the old local arena instance first.`)));
    socket.listen(port,'127.0.0.1',()=>socket.close(resolve));
  });
}
compile();
const children=[];
function start(name,args,env={}){
  fs.mkdirSync('test-results',{recursive:true});
  const log=fs.openSync(`test-results/${name}.log`,'w');
  const child=spawn(process.execPath,args,{stdio:['ignore',log,log],env:{...process.env,...env},windowsHide:true});
  children.push(child);console.log(`${name} started (PID ${child.pid})`);
  child.on('exit',code=>{if(code)console.error(`${name} exited: ${code}; see test-results/${name}.log`);});
  return child;
}
function stop(){for(const c of children)c.kill();setTimeout(()=>process.exit(),300);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
start('chain',['node_modules/hardhat/dist/src/cli.js','node','--hostname','127.0.0.1','--port','18545']);
let ready=false;
for(let i=0;i<120;i++){
  try{const r=await fetch('http://127.0.0.1:18545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});if((await r.json()).result==='0x7a69'){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
}
if(!ready){stop();throw new Error('Chain did not start');}
const deploy=spawn(process.execPath,['scripts/deploy.mjs'],{stdio:'inherit',windowsHide:true});
const code=await new Promise(r=>deploy.on('exit',r));if(code){stop();throw new Error('Deployment failed');}
for(let i=1;i<=6;i++)start(`verifier-${i}`,['judge/server.mjs'],{VERIFIER_INDEX:String(i)});
start('keeper',['scripts/keeper.mjs']);
start('web',['node_modules/vite/bin/vite.js','web','--host','127.0.0.1','--port','5174','--strictPort']);
console.log('Arena: http://127.0.0.1:5174 | RPC: http://127.0.0.1:18545 | Six verifiers: ports 8781-8786');
console.log('Keep this terminal open. Ctrl+C stops the stack. Docker must have python:3.12-alpine for code execution.');

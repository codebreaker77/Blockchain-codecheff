import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {keccak256,toUtf8Bytes,verifyMessage} from 'ethers';
import {provider,connect,PROBLEM} from '../scripts/lib.mjs';
import {evaluate} from './sandbox.mjs';

const p=provider();
if(BigInt(await p.send('eth_chainId',[]))!==31337n) throw new Error('Local chain only');
const {d,arena}=await connect(p);
const index=Number(process.env.VERIFIER_INDEX??1);
if(![1,2,3,4,5,6].includes(index)) throw new Error('VERIFIER_INDEX must be 1-6');
const signer=await p.getSigner(index),verifier=await signer.getAddress();
const contract=arena.connect(signer),round=index<=3?0:1;
// Each verifier has its own evidence/secret directory. Persist salt before submitting commitment.
const store=path.join('judge','data',d.deploymentId,String(index));fs.mkdirSync(store,{recursive:true});
const file=id=>path.join(store,`${id}.json`);
const read=id=>fs.existsSync(file(id))?JSON.parse(fs.readFileSync(file(id),'utf8')):{};
function write(id,value) {fs.writeFileSync(file(id)+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file(id)+'.tmp',file(id));}
let busy=false;
async function tick() {
  if(busy)return;busy=true;
  try {
    const count=Number(await arena.nextId());
    for(let id=1;id<=count;id++) {
      let m=await arena.getMatch(id);
      const now=Number((await p.send('eth_getBlockByNumber',['latest',false])).timestamp);
      if((m.state!==2n && m.state!==4n) || Number(m.round)!==round || now<Number(m.solveDeadline)) continue;
      let report=read(id);
      if(now<Number(m.commitDeadline) && !report.salt) {
        if(m.problem!==PROBLEM) continue; // Unsupported problems require a separately implemented verifier.
        const results=[];
        for(const [captain,anchor] of [[m.teamA[0],m.submissionA],[m.teamB[0],m.submissionB]]) {
          const submission=report.sources?.[captain.toLowerCase()];
          const valid=submission && keccak256(toUtf8Bytes(submission.source))===anchor;
          results.push(valid?await evaluate(submission.source):{passed:false,tests:[],reason:'missing matching signed source'});
        }
        const outcome=results[0].passed===results[1].passed?0:(results[0].passed?1:2);
        const evidence=keccak256(toUtf8Bytes(JSON.stringify({problem:m.problem,sourceA:m.submissionA,sourceB:m.submissionB,results})));
        report={...report,round,outcome,evidence,salt:'0x'+randomBytes(32).toString('hex'),results};write(id,report);
      }
      if(report.salt && now<Number(m.commitDeadline) && (await arena.commitments(id,round,verifier))==='0x'+'0'.repeat(64)) {
        const digest=await arena.commitmentHash(id,round,report.outcome,report.evidence,report.salt,verifier);
        await(await contract.commit(id,digest)).wait();console.log(`Verifier ${index}: committed match ${id}`);
      }
      if(report.salt && now>=Number(m.commitDeadline) && now<Number(m.revealDeadline) && !(await arena.revealed(id,round,verifier))) {
        await(await contract.reveal(id,report.outcome,report.evidence,report.salt)).wait();console.log(`Verifier ${index}: revealed match ${id}`);
      }
    }
  } catch(e) {console.error(`Verifier ${index}:`,e.shortMessage??e.message);} finally {busy=false;}
}
setInterval(tick,1000);

// Bind loopback only. Browser submissions require a signature and an already-anchored source hash.
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin && !['http://127.0.0.1:5174','http://localhost:5174'].includes(origin)) {res.writeHead(403);res.end();return;}
  res.setHeader('Access-Control-Allow-Origin',origin??'http://127.0.0.1:5174');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET' && url.pathname==='/health') {
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({verifier,index,round,busy}));return;
    }
    if(req.method==='POST' && url.pathname==='/submissions') {
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>24000)throw new Error('Request too large');}
      const {matchId,source,signature}=JSON.parse(body);
      if(!Number.isSafeInteger(matchId)||matchId<1||typeof source!=='string'||Buffer.byteLength(source)>16384)throw new Error('Invalid submission');
      const m=await arena.getMatch(matchId),anchor=keccak256(toUtf8Bytes(source));
      const message=`CodeChef local submission\n31337\n${d.arena}\n${matchId}\n${anchor}`;
      const who=verifyMessage(message,signature).toLowerCase();
      const matched=(who===m.teamA[0]?.toLowerCase()&&anchor===m.submissionA)||(who===m.teamB[0]?.toLowerCase()&&anchor===m.submissionB);
      if(!matched) throw new Error('Signature/source does not match on-chain captain submission');
      const report=read(matchId);
      if(report.salt)throw new Error('Verifier already committed');
      const now=Number((await p.send('eth_getBlockByNumber',['latest',false])).timestamp);
      // Delivery retry is allowed until commit phase begins; source was immutably anchored before solve deadline.
      if(now>=Number(m.solveDeadline))throw new Error('Source delivery deadline passed');
      report.sources??={};report.sources[who]={source,signature};write(matchId,report);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accepted:true,anchor,verifier}));return;
    }
    res.writeHead(404);res.end('Not found');
  } catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
server.listen(8780+index,'127.0.0.1',()=>console.log(`Independent verifier ${index}: http://127.0.0.1:${8780+index}`));

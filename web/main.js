import './style.css';
import {BrowserProvider,JsonRpcProvider,Contract,parseEther,formatEther,keccak256,toUtf8Bytes,getAddress} from 'ethers';
const $=id=>document.getElementById(id),short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'Awaiting opponent';
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=x=>Number(formatEther(x)).toLocaleString(undefined,{maximumFractionDigits:4});
const names=['Missing','Open','Solving','Proposed','Appeal','Settled','Cancelled'];
const cups=['Missing','Registration','Running','Finished','Refunded'];
let d,p,token,arena,tournament,trophy,signer,address,selected,busy=false,refreshing=false;
const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').classList.toggle('error',error);};
function requireWallet(){if(!signer)throw new Error('Connect MetaMask or choose a local demo wallet first.');}
const syncBusy=()=>document.querySelectorAll('button').forEach(b=>b.disabled=busy);
async function run(fn) {
  if(busy)return;busy=true;syncBusy();
  try{await fn();await refresh();}catch(e){notice(e.reason??e.shortMessage??e.message,true);}
  finally{busy=false;syncBusy();}
}
async function send(promise){const tx=await promise;notice(`Transaction ${short(tx.hash)} submitted…`);await tx.wait();notice('Transaction confirmed on the local chain.');}
function teamFromInput(raw){return [address,...raw.split(',').map(x=>x.trim()).filter(Boolean).map(getAddress)];}
async function useSigner(s){signer=s;address=await s.getAddress();notice(`Connected ${address}. Fictional local tokens only.`);await refresh();}
async function refresh() {
  if(!arena||refreshing)return;refreshing=true;
  try {
    if(signer){
      const [bal,credit,cupCredit,trophies]=await Promise.all([token.balanceOf(address),arena.claimable(address),tournament.claimable(address),trophy.balanceOf(address)]);
      $('balance').textContent=`${amount(bal)} CHEF`;$('address').textContent=address;
      $('rewards').textContent=amount(credit+cupCredit);$('trophies').textContent=trophies;
    }
    const count=Number(await arena.nextId());$('match-count').textContent=count;
    const matches=await Promise.all(Array.from({length:Math.min(count,100)},(_,i)=>arena.getMatch(count-i).then(m=>({id:count-i,m}))));
    $('match-list').innerHTML=matches.length?matches.map(({id,m})=>`<article class="card"><div class="card-top"><span>CHALLENGE #${id} · ${m.teamA.length>1?'TEAM':'SOLO'}</span><span class="badge">${names[Number(m.state)]}</span></div><h3>${m.problem===d.problem?'Sum two integers':'Custom problem'}</h3><p class="versus">${short(m.teamA[0])} <span>vs</span> ${short(m.teamB.length?m.teamB[0]:null)}</p><div class="card-meta"><div><b>${amount(m.stake*2n)} CHEF</b><span>Shared prize pool</span></div><div><b>${Number(m.duration)}s</b><span>Solving time</span></div></div><div class="actions"><button data-open="${id}" class="outline">${m.state===5n?'View result':'Watch match'}</button>${m.state===1n?`<button data-accept="${id}">Accept challenge</button>`:''}</div></article>`).join(''):'<div class="empty">The floor is open. Create the first coding challenge.</div>';
    syncBusy();
    const cc=Number(await tournament.nextId()),cs=await Promise.all(Array.from({length:Math.min(cc,50)},(_,i)=>tournament.getCup(cc-i).then(c=>({id:cc-i,c}))));
    $('cup-list').innerHTML=cs.length?cs.map(({id,c})=>`<article class="card"><div class="card-top"><span>CUP #${id}</span><span class="badge">${cups[Number(c.status)]}</span></div><h3>${c.size}-player elimination</h3><p class="versus">${c.entrants.length}/${c.size} joined${c.champion!=='0x0000000000000000000000000000000000000000'?` · Champion ${short(c.champion)}`:''}</p><div class="card-meta"><div><b>${amount(c.fee)} CHEF</b><span>Entry fee</span></div><div><b>${amount(c.fee*BigInt(c.entrants.length))} CHEF</b><span>Current pool</span></div></div><p class="versus">Round: ${c.roundMatches.length?c.roundMatches.map(x=>`#${x}`).join(' · '):'Registration'}</p><div class="actions">${c.status===1n?`<button data-join="${id}">Join tournament</button><button data-expire="${id}" class="outline">Expire registration</button>`:''}${c.status===2n?`<button data-advance="${id}">Advance bracket</button>`:''}</div></article>`).join(''):'<div class="empty">No tournaments yet. Start a four or eight-player cup.</div>';
    syncBusy();
    const pc=Number(await arena.playerCount());const players=await Promise.all(Array.from({length:Math.min(pc,200)},(_,i)=>arena.players(i)));
    const rows=await Promise.all(players.map(async a=>({a,s:await arena.stats(a),c:await tournament.championships(a)})));
    rows.sort((a,b)=>Number(b.s.wins-a.s.wins)||Number(b.c-a.c)||a.a.localeCompare(b.a));
    $('rankings').innerHTML=rows.map((r,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td title="${r.a}">${short(r.a)}</td><td>${r.s.wins}</td><td>${r.s.losses}</td><td>${r.s.draws}</td><td>${r.c}</td><td>${amount(r.s.earned)}</td></tr>`).join('')||'<tr><td colspan="7">Standings appear when participants create matches.</td></tr>';
    if($('match-dialog').open)await detail(selected);
  } finally{refreshing=false;}
}
function deadline(m){if(m.state===1n)return ['Acceptance deadline',m.acceptDeadline];if(m.state===3n)return ['Appeal deadline',m.disputeDeadline];return ['Solve / commit / reveal deadlines',`${new Date(Number(m.solveDeadline)*1000).toLocaleTimeString()} / ${new Date(Number(m.commitDeadline)*1000).toLocaleTimeString()} / ${new Date(Number(m.revealDeadline)*1000).toLocaleTimeString()}`];}
async function detail(id) {
  selected=Number(id);const m=await arena.getMatch(id),[label,when]=deadline(m);
  $('detail-title').textContent=`Challenge #${id} · ${names[Number(m.state)]}`;
  const result=Number(m.result)===0?'Draw / no quorum':`Team ${m.result===1n?'A':'B'}`;
  $('detail').innerHTML=`<div class="detail-grid"><div><span>Team A</span>${m.teamA.map(short).join(', ')}</div><div><span>Team B</span>${m.teamB.length?m.teamB.map(short).join(', '):'Awaiting opponent'}</div><div><span>Escrow pool</span>${amount(m.stake*2n)} CHEF</div><div><span>Result</span>${[3n,5n].includes(m.state)?result:'Pending'}</div><div style="grid-column:1/-1"><span>${label}</span>${typeof when==='bigint'?new Date(Number(when)*1000).toLocaleString():esc(when)}</div></div>`;
  $('player-tools').hidden=!(address && (address===m.teamA[0]||(m.teamB.length && address===m.teamB[0])) && m.state===2n);
  const logs=await arena.queryFilter('*',0,'latest');
  $('trail').innerHTML=logs.filter(e=>e.args?.[0]===BigInt(id)&&['Committed','Revealed','Proposed','Disputed','Settled','Submission'].includes(e.fragment?.name)).slice(-20).map(e=>`<div class="trail-item"><b>${e.fragment.name}</b> · block ${e.blockNumber}<br>${esc(e.args.map(String).join(' · '))}</div>`).join('')||'<p class="hint">Votes and result events will appear here.</p>';
}
$('local').onclick=()=>run(async()=>useSigner(await p.getSigner(Number($('account').value))));
$('connect').onclick=()=>run(async()=>{
  if(!window.ethereum)throw new Error('Install MetaMask, or use a local demo wallet.');
  try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x7a69'}]});}
  catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x7a69',chainName:'CodeChef Local',rpcUrls:[d.rpcUrl],nativeCurrency:{name:'Local gas',symbol:'ETH',decimals:18}}]});}
  const bp=new BrowserProvider(window.ethereum);await bp.send('eth_requestAccounts',[]);if((await bp.getNetwork()).chainId!==31337n)throw new Error('Local chain 31337 required');await useSigner(await bp.getSigner());
});
window.ethereum?.on?.('accountsChanged',()=>{signer=null;address=null;location.reload();});
window.ethereum?.on?.('chainChanged',()=>location.reload());
$('faucet').onclick=()=>run(async()=>{requireWallet();await send(token.connect(signer).faucet());});
$('claim').onclick=()=>run(async()=>{requireWallet();let any=false;for(const c of [arena,tournament])if((await c.claimable(address))>0n){await send(c.connect(signer).claim());any=true;}if(!any)throw new Error('No rewards ready to claim.');});
$('new-match').onclick=()=>{if(!signer){notice('Connect a wallet to create a challenge.',true);return;}$('create-dialog').showModal();};
$('new-cup').onclick=()=>{if(!signer){notice('Connect a wallet to create a tournament.',true);return;}$('cup-dialog').showModal();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!==b.dataset.tab);document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('selected',x===b));});
$('create-form').onsubmit=e=>{e.preventDefault();run(async()=>{requireWallet();const stake=parseEther($('stake').value),team=teamFromInput($('members').value);await send(token.connect(signer).approve(d.arena,stake));await send(arena.connect(signer).create(d.problem,stake,Number($('duration').value),600,team));$('create-dialog').close();});};
$('cup-form').onsubmit=e=>{e.preventDefault();run(async()=>{requireWallet();await send(tournament.connect(signer).create(d.problem,Number($('cup-size').value),parseEther($('cup-fee').value),600,180));$('cup-dialog').close();});};
$('match-list').onclick=e=>{
  const open=e.target.closest('[data-open]'),accept=e.target.closest('[data-accept]');
  if(open)run(async()=>{await detail(open.dataset.open);$('match-dialog').showModal();});
  if(accept)run(async()=>{requireWallet();const id=accept.dataset.accept,m=await arena.getMatch(id);let raw='';if(m.teamA.length>1){raw=prompt(`Enter ${m.teamA.length-1} consenting teammate addresses, comma separated`);if(raw===null)return;}await send(token.connect(signer).approve(d.arena,m.stake));await send(arena.connect(signer).accept(id,teamFromInput(raw)));});
};
$('cup-list').onclick=e=>run(async()=>{
  const join=e.target.closest('[data-join]'),advance=e.target.closest('[data-advance]'),expire=e.target.closest('[data-expire]');if(!join&&!advance&&!expire)return;requireWallet();
  if(join){const id=join.dataset.join,c=await tournament.getCup(id);await send(token.connect(signer).approve(d.tournament,c.fee));await send(tournament.connect(signer).join(id));}
  if(advance)await send(tournament.connect(signer).advance(advance.dataset.advance));
  if(expire)await send(tournament.connect(signer).expire(expire.dataset.expire));
});
$('submit-code').onclick=()=>run(async()=>{
  requireWallet();const source=$('source').value,anchor=keccak256(toUtf8Bytes(source));
  const m=await arena.getMatch(selected),existing=address===m.teamA[0]?m.submissionA:m.submissionB;
  if(existing==='0x'+'0'.repeat(64))await send(arena.connect(signer).submit(selected,anchor));
  else if(existing!==anchor)throw new Error('A different source hash is already anchored. Source cannot be replaced.');
  const signature=await signer.signMessage(`CodeChef local submission\n31337\n${d.arena}\n${selected}\n${anchor}`);
  const deliveries=await Promise.allSettled(Array.from({length:6},async(_,i)=>{
    const response=await fetch(`http://127.0.0.1:${8781+i}/submissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({matchId:selected,source,signature})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
  }));
  const delivered=deliveries.filter(x=>x.status==='fulfilled').length;
  notice(`Source anchored. Delivered to ${delivered}/6 verifiers.${delivered<6?' Retry with the same source before the deadline to complete delivery.':''}`,delivered<6);
});
$('progress').onclick=()=>run(async()=>{requireWallet();await send(arena.connect(signer).progress(selected));});
$('dispute').onclick=()=>run(async()=>{requireWallet();const reason=prompt('Describe why the proposed result needs an appeal:');if(reason)await send(arena.connect(signer).dispute(selected,keccak256(toUtf8Bytes(reason))));});
$('cancel').onclick=()=>run(async()=>{requireWallet();await send(arena.connect(signer).cancelOpen(selected));});
$('consent').onclick=()=>run(async()=>{requireWallet();await send(arena.connect(signer).consent(getAddress($('captain').value),true));});
$('refresh').onclick=()=>run(refresh);
async function init(){
  const r=await fetch('/deployment.json');if(!r.ok)throw new Error('Run npm run compile, start the chain, then npm run deploy.');d=await r.json();
  p=new JsonRpcProvider(d.rpcUrl,31337,{staticNetwork:true,cacheTimeout:-1});p.pollingInterval=100;
  if(BigInt(await p.send('eth_chainId',[]))!==31337n)throw new Error('RPC must be local chain 31337');
  token=new Contract(d.token,d.abis.token,p);arena=new Contract(d.arena,d.abis.arena,p);tournament=new Contract(d.tournament,d.abis.tournament,p);trophy=new Contract(d.trophy,d.abis.trophy,p);
  $('account').innerHTML=Array.from({length:8},(_,i)=>`<option value="${7+i}">Demo player ${i+1}</option>`).join('');
  await refresh();notice('Spectator mode · Live local-chain data. Connect a wallet to play.');
  setInterval(()=>{if(!busy)refresh().catch(e=>notice(e.shortMessage??e.message,true));},5000);
}
init().catch(e=>notice(e.message,true));

import {before,beforeEach,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,toUtf8Bytes,parseEther,ZeroHash,ZeroAddress} from 'ethers';
import {provider,deploy,mineAt,PROBLEM} from '../scripts/lib.mjs';
const p=provider();
let d,s,a,snapshot;
const tx=async promise=>(await promise).wait();
const hash=x=>keccak256(toUtf8Bytes(x));
before(async()=>{
  d=await deploy(p,[10,10,10]);s=d.signers;a=d.addresses;
  for(let i=7;i<20;i++) {
    await tx(d.token.connect(s[i]).faucet());
    await tx(d.token.connect(s[i]).approve(d.arena.target,parseEther('1000')));
    await tx(d.token.connect(s[i]).approve(d.tournament.target,parseEther('1000')));
  }
  snapshot=await p.send('evm_snapshot',[]);
});
beforeEach(async()=>{ await p.send('evm_revert',[snapshot]); snapshot=await p.send('evm_snapshot',[]); });
after(async()=>{ await p.destroy(); });
async function match(teamA=[a[7]],teamB=[a[8]],stake=parseEther('10')) {
  const creator=s[a.indexOf(teamA[0])],acceptor=s[a.indexOf(teamB[0])];
  await tx(d.arena.connect(creator).create(PROBLEM,stake,10,60,teamA));
  const id=await d.arena.nextId();
  if(teamB.length) await tx(d.arena.connect(acceptor).accept(id,teamB));
  return id;
}
async function vote(id,outcomes=[1,1,2],appeal=false) {
  let m=await d.arena.getMatch(id);await mineAt(p,m.solveDeadline);
  const panel=appeal?[4,5,6]:[1,2,3],secrets=[];
  for(let i=0;i<outcomes.length;i++) {
    const salt=hash(`salt-${id}-${m.round}-${i}`),evidence=hash(`evidence-${i}`);
    secrets.push([outcomes[i],evidence,salt]);
    const digest=await d.arena.commitmentHash(id,m.round,...secrets[i],a[panel[i]]);
    await tx(d.arena.connect(s[panel[i]]).commit(id,digest));
  }
  await mineAt(p,m.commitDeadline);
  for(let i=0;i<outcomes.length;i++) await tx(d.arena.connect(s[panel[i]]).reveal(id,...secrets[i]));
  await mineAt(p,m.revealDeadline);await tx(d.arena.progress(id));
}
async function finalize(id,outcomes=[1,1,2]) {
  await vote(id,outcomes);const m=await d.arena.getMatch(id);
  await mineAt(p,m.disputeDeadline);await tx(d.arena.progress(id));
}

test('faucet mints only once and gives non-monetary test balance',async()=>{
  assert.equal(await d.token.balanceOf(a[7]),parseEther('1000'));
  await assert.rejects(tx(d.token.connect(s[7]).faucet()));
});
test('creation and matching acceptance lock exact stakes',async()=>{
  const id=await match();assert.equal((await d.arena.getMatch(id)).state,2n);
  assert.equal(await d.token.balanceOf(d.arena.target),parseEther('20'));
  assert.equal(await d.token.balanceOf(a[7]),parseEther('990'));
});
test('unaccepted challenge can be cancelled once; strangers cannot withdraw',async()=>{
  await tx(d.arena.connect(s[7]).create(PROBLEM,parseEther('10'),10,60,[a[7]]));
  const id=await d.arena.nextId();
  await assert.rejects(tx(d.arena.connect(s[8]).cancelOpen(id)));
  await tx(d.arena.connect(s[7]).cancelOpen(id));
  await assert.rejects(tx(d.arena.connect(s[7]).cancelOpen(id)));
  await tx(d.arena.connect(s[7]).claim());assert.equal(await d.token.balanceOf(a[7]),parseEther('1000'));
  await assert.rejects(tx(d.arena.connect(s[8]).claim()));
});
test('anyone may expire an unaccepted challenge after its deadline',async()=>{
  await tx(d.arena.connect(s[7]).create(PROBLEM,1,10,10,[a[7]]));
  const id=await d.arena.nextId();await mineAt(p,(await d.arena.getMatch(id)).acceptDeadline);
  await assert.rejects(tx(d.arena.connect(s[8]).accept(id,[a[8]])));
  await tx(d.arena.connect(s[9]).cancelOpen(id));assert.equal(await d.arena.claimable(a[7]),1n);
});
test('self matches, zero stakes and unauthorized sponsorship are rejected',async()=>{
  await assert.rejects(tx(d.arena.connect(s[7]).create(PROBLEM,0,10,10,[a[7]])));
  await assert.rejects(tx(d.arena.sponsor(PROBLEM,a[7],a[8],10)));
  await tx(d.arena.connect(s[7]).create(PROBLEM,1,10,60,[a[7]]));
  await assert.rejects(tx(d.arena.connect(s[7]).accept(await d.arena.nextId(),[a[7]])));
});
test('submission anchors are captain-only, immutable, and deadline-bound',async()=>{
  const id=await match();await assert.rejects(tx(d.arena.connect(s[9]).submit(id,hash('fake'))));
  await tx(d.arena.connect(s[7]).submit(id,hash('source')));
  await assert.rejects(tx(d.arena.connect(s[7]).submit(id,hash('replacement'))));
  await mineAt(p,(await d.arena.getMatch(id)).solveDeadline);
  await assert.rejects(tx(d.arena.connect(s[8]).submit(id,hash('late'))));
});
test('two verifier votes settle a winner and prize can be claimed exactly once',async()=>{
  const id=await match();await finalize(id);
  assert.equal((await d.arena.getMatch(id)).result,1n);
  assert.equal(await d.arena.claimable(a[7]),parseEther('20'));
  await tx(d.arena.connect(s[7]).claim());await assert.rejects(tx(d.arena.connect(s[7]).claim()));
  await assert.rejects(tx(d.arena.progress(id)));
  assert.equal(await d.token.balanceOf(a[7]),parseEther('1010'));
  assert.equal((await d.arena.stats(a[7])).wins,1n);
  assert.equal((await d.arena.stats(a[8])).losses,1n);
});
test('draw refunds both parties and records on-chain draw statistics',async()=>{
  const id=await match();await finalize(id,[0,0,1]);
  assert.equal(await d.arena.claimable(a[7]),parseEther('10'));
  assert.equal(await d.arena.claimable(a[8]),parseEther('10'));
  assert.equal((await d.arena.stats(a[7])).draws,1n);
});
test('abandonment/no quorum has a bounded refund path',async()=>{
  const id=await match();await mineAt(p,(await d.arena.getMatch(id)).revealDeadline);
  await tx(d.arena.progress(id));await mineAt(p,(await d.arena.getMatch(id)).disputeDeadline);
  await tx(d.arena.progress(id));assert.equal(await d.arena.claimable(a[8]),parseEther('10'));
});
test('one dishonest verifier cannot choose the outcome',async()=>{
  const id=await match();await finalize(id,[2]);
  assert.equal((await d.arena.getMatch(id)).result,0n);
});
test('commit/reveal rejects outsiders, early reveals, wrong salts and duplicate votes',async()=>{
  const id=await match();const m=await d.arena.getMatch(id),salt=hash('secret'),evidence=hash('report');
  await mineAt(p,m.solveDeadline);
  const digest=await d.arena.commitmentHash(id,0,1,evidence,salt,a[1]);
  await assert.rejects(tx(d.arena.connect(s[7]).commit(id,digest)));
  await tx(d.arena.connect(s[1]).commit(id,digest));
  await assert.rejects(tx(d.arena.connect(s[1]).commit(id,digest)));
  await assert.rejects(tx(d.arena.connect(s[1]).reveal(id,1,evidence,salt)));
  await mineAt(p,m.commitDeadline);
  await assert.rejects(tx(d.arena.connect(s[1]).reveal(id,1,evidence,hash('wrong'))));
  await tx(d.arena.connect(s[1]).reveal(id,1,evidence,salt));
  await assert.rejects(tx(d.arena.connect(s[1]).reveal(id,1,evidence,salt)));
});
test('commitments are domain-separated by match, verifier and round',async()=>{
  const id=await match(),salt=hash('salt'),evidence=hash('evidence');
  const base=await d.arena.commitmentHash(id,0,1,evidence,salt,a[1]);
  for(const [mid,round,who] of [[id+1n,0,a[1]],[id,1,a[1]],[id,0,a[2]]])
    assert.notEqual(base,await d.arena.commitmentHash(mid,round,1,evidence,salt,who));
});
test('participant dispute freezes payout and separate appeal panel reverses primary result',async()=>{
  const id=await match();await vote(id);
  await assert.rejects(tx(d.arena.connect(s[9]).dispute(id,hash('reason'))));
  await tx(d.arena.connect(s[8]).dispute(id,hash('wrong output')));
  assert.equal(await d.arena.claimable(a[7]),0n);
  await assert.rejects(tx(d.arena.connect(s[1]).commit(id,hash('not appeal judge'))));
  await vote(id,[2,2,1],true);
  assert.equal((await d.arena.getMatch(id)).state,5n);
  assert.equal(await d.arena.claimable(a[8]),parseEther('20'));
  await assert.rejects(tx(d.arena.connect(s[7]).dispute(id,hash('second appeal'))));
});
test('appeal silence refunds instead of locking escrow',async()=>{
  const id=await match();await vote(id);await tx(d.arena.connect(s[7]).dispute(id,hash('reason')));
  await mineAt(p,(await d.arena.getMatch(id)).revealDeadline);await tx(d.arena.progress(id));
  assert.equal(await d.arena.claimable(a[7]),parseEther('10'));
});
test('teams require member consent and split the complete shared prize including dust',async()=>{
  await assert.rejects(match([a[7],a[9]],[a[8],a[10]],11n));
  await tx(d.arena.connect(s[9]).consent(a[7],true));await tx(d.arena.connect(s[10]).consent(a[8],true));
  const id=await match([a[7],a[9]],[a[8],a[10]],11n);await finalize(id);
  assert.equal(await d.arena.claimable(a[7]),11n);assert.equal(await d.arena.claimable(a[9]),11n);
  assert.equal(await d.arena.claimable(a[8]),0n);
});
test('immutable verifier panels exclude participants and duplicate judges',async()=>{
  await assert.rejects(tx(d.arena.connect(s[1]).create(PROBLEM,1,10,10,[a[1]])));
  await assert.rejects(tx(d.arena.bindTournament(a[7])));
  await assert.rejects(tx(d.trophy.connect(s[7]).award(a[7],1)));
});
async function cup(size=4) {
  await tx(d.tournament.connect(s[7]).create(PROBLEM,size,parseEther('5'),60,10));
  const id=await d.tournament.nextId();
  for(let i=7;i<7+size;i++) await tx(d.tournament.connect(s[i]).join(id));
  return id;
}
test('four-player tournament progresses semifinals/final and awards non-transferable trophy',async()=>{
  const id=await cup();let c=await d.tournament.getCup(id);assert.equal(c.roundMatches.length,2);
  // All bracket matches share deadlines. Vote them together using independent time progression.
  await bracketRound(c.roundMatches);await tx(d.tournament.advance(id));
  c=await d.tournament.getCup(id);assert.equal(c.roundMatches.length,1);
  await finalize(c.roundMatches[0]);await tx(d.tournament.advance(id));
  c=await d.tournament.getCup(id);assert.equal(c.champion,a[7]);
  assert.equal(await d.tournament.claimable(a[7]),parseEther('20'));
  assert.equal(await d.trophy.ownerOf(1),a[7]);assert.equal(await d.tournament.championships(a[7]),1n);
  await assert.rejects(tx(d.trophy.connect(s[7]).transferFrom(a[7],a[8],1)));
  await assert.rejects(tx(d.tournament.advance(id)));
  await tx(d.tournament.connect(s[7]).claim());await assert.rejects(tx(d.tournament.connect(s[7]).claim()));
});
async function bracketRound(ids,outcome=1) {
  const ms=await Promise.all(ids.map(id=>d.arena.getMatch(id)));
  await mineAt(p,ms.reduce((n,m)=>m.solveDeadline>n?m.solveDeadline:n,0n));
  const evidence=hash('bracket'),salt=hash('bracket salt');
  for(const id of ids) for(const judge of [1,2]) await tx(d.arena.connect(s[judge]).commit(id,await d.arena.commitmentHash(id,0,outcome,evidence,salt,a[judge])));
  await mineAt(p,ms.reduce((n,m)=>m.commitDeadline>n?m.commitDeadline:n,0n));
  for(const id of ids) for(const judge of [1,2]) await tx(d.arena.connect(s[judge]).reveal(id,outcome,evidence,salt));
  await mineAt(p,ms.reduce((n,m)=>m.revealDeadline>n?m.revealDeadline:n,0n));
  for(const id of ids) await tx(d.arena.progress(id));
  const proposed=await Promise.all(ids.map(id=>d.arena.getMatch(id)));
  await mineAt(p,proposed.reduce((n,m)=>m.disputeDeadline>n?m.disputeDeadline:n,0n));
  for(const id of ids) await tx(d.arena.progress(id));
}
test('eight-player tournament has three elimination rounds',async()=>{
  const id=await cup(8);
  for(const expected of [4,2,1]) {
    const c=await d.tournament.getCup(id);assert.equal(c.roundMatches.length,expected);
    await bracketRound(c.roundMatches);await tx(d.tournament.advance(id));
  }
  assert.equal((await d.tournament.getCup(id)).status,3n);
});
test('incomplete tournament registration refunds every entrant exactly once',async()=>{
  await tx(d.tournament.create(PROBLEM,4,parseEther('5'),10,10));const id=await d.tournament.nextId();
  await tx(d.tournament.connect(s[7]).join(id));await assert.rejects(tx(d.tournament.connect(s[7]).join(id)));
  await mineAt(p,(await d.tournament.getCup(id)).deadline);await tx(d.tournament.expire(id));
  assert.equal(await d.tournament.claimable(a[7]),parseEther('5'));await assert.rejects(tx(d.tournament.expire(id)));
});
test('drawn bracket voids tournament and conserves all deposits',async()=>{
  const id=await cup();await bracketRound((await d.tournament.getCup(id)).roundMatches,0);
  await tx(d.tournament.advance(id));assert.equal((await d.tournament.getCup(id)).status,4n);
  for(let i=7;i<11;i++) assert.equal(await d.tournament.claimable(a[i]),parseEther('5'));
  assert.equal(await d.trophy.nextId(),0n);
});

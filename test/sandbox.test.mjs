import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {evaluate,runCode} from '../judge/sandbox.mjs';
test('correct Python submission passes real isolated test cases',async()=>{
  assert.equal((await evaluate('a,b=map(int,input().split());print(a+b)')).passed,true);
});
test('wrong output fails evaluation',async()=>{assert.equal((await evaluate('print(42)')).passed,false);});
test('infinite loop is killed and its container removed',async()=>{
  assert.equal((await runCode('while True: pass','',{timeout:3000})).status,'timeout');
  const {stdout}=await promisify(execFile)('docker',['ps','--filter','name=chef-sandbox-','--format','{{.Names}}'],{windowsHide:true});
  assert.equal(stdout.trim(),'');
});
test('unbounded output is stopped',async()=>{
  assert.equal((await runCode('while True: print("x"*1000,flush=True)','')).status,'output_limit');
});
test('root filesystem is read-only and submitted process is unprivileged',async()=>{
  const result=await runCode('import os\nprint(os.getuid())\ntry:\n open("/escape", "w").write("bad")\nexcept OSError:\n print("blocked")','');
  assert.equal(result.status,'ok');assert.equal(result.stdout,'65534\nblocked');
});
test('network egress is disabled',async()=>{
  const result=await runCode('import socket\ns=socket.socket();s.settimeout(1)\ntry:\n s.connect(("1.1.1.1",80)); print("connected")\nexcept OSError:\n print("blocked")','');
  assert.equal(result.status,'ok');assert.equal(result.stdout,'blocked');
});
test('memory abuse is constrained',async()=>{
  const result=await runCode('a=bytearray(256*1024*1024)','');assert.notEqual(result.status,'ok');
});
test('oversized source is rejected before starting Docker',async()=>{
  await assert.rejects(runCode('a'.repeat(17000),''),/16 KiB/);
});

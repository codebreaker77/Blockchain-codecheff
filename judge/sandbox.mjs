import {spawn,execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const IMAGE=process.env.SANDBOX_IMAGE??'python:3.12-alpine';

export async function runCode(source,input,{timeout=6000,outputLimit=8192}={}) {
  if(Buffer.byteLength(source)>16384) throw new Error('Source exceeds 16 KiB');
  const name='chef-sandbox-'+randomUUID();
  const program=`import base64;exec(compile(base64.b64decode('${Buffer.from(source).toString('base64')}'),'<submission>','exec'))`;
  const args=['run','--rm','-i','--name',name,'--network','none','--read-only','--user','65534:65534',
    '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','32','--memory','64m',
    '--memory-swap','64m','--cpus','0.5','--ulimit','nofile=64:64','--log-driver','none',
    '--tmpfs','/tmp:rw,noexec,nosuid,size=4m',IMAGE,'python','-I','-S','-c',program];
  let child,reason=null;
  const result=await new Promise((resolve,reject)=>{
    child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',err='',bytes=0;
    const stop=why=>{
      if(reason) return;reason=why;
      // Killing only the docker client would leave adversarial code alive in its container.
      exec('docker',['rm','-f',name],{windowsHide:true,timeout:10000}).catch(()=>{}).finally(()=>child.kill());
    };
    const timer=setTimeout(()=>stop('timeout'),timeout);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>outputLimit) stop('output_limit');else out+=chunk;});
    child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>outputLimit) stop('output_limit');else err+=chunk;});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);resolve({status:reason??(code===0?'ok':'runtime_error'),stdout:out.trim(),stderr:err.slice(0,1000),exitCode:code});});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
  // Retry cleanup after client exit, including a start-up timeout race.
  if(reason) await exec('docker',['rm','-f',name],{windowsHide:true,timeout:10000}).catch(()=>{});
  return result;
}

export const CASES=[['2 3\n','5'],['-7 4\n','-3'],['0 0\n','0'],['1000000000000 9\n','1000000000009']];
export async function evaluate(source) {
  const tests=[];
  for(const [input,expected] of CASES) {
    const result=await runCode(source,input);
    tests.push({passed:result.status==='ok' && result.stdout===expected,status:result.status,stdout:result.stdout,stderr:result.stderr});
    if(result.status!=='ok') break;
  }
  return {passed:tests.length===CASES.length && tests.every(t=>t.passed),tests};
}

import solc from 'solc';
import fs from 'node:fs';
import path from 'node:path';

export function compile() {
  const sources = Object.fromEntries(fs.readdirSync('contracts').filter(x=>x.endsWith('.sol')).map(x=>[x,{content:fs.readFileSync(`contracts/${x}`,'utf8')}]));
  const input = {language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
  const output=JSON.parse(solc.compile(JSON.stringify(input),{import:name=>{
    for(const file of [path.join('node_modules',name),path.join('contracts',name)]) if(fs.existsSync(file)) return {contents:fs.readFileSync(file,'utf8')};
    return {error:`Missing import ${name}`};
  }}));
  for(const e of output.errors??[]) console[e.severity==='error'?'error':'warn'](e.formattedMessage);
  if(output.errors?.some(e=>e.severity==='error')) throw new Error('Solidity compilation failed');
  fs.mkdirSync('artifacts',{recursive:true});
  for(const [file,contracts] of Object.entries(output.contracts)) {
    if(!sources[file]) continue;
    for(const [name,data] of Object.entries(contracts)) {
      const bytes=data.evm.deployedBytecode.object.length/2;
      if(bytes>24576) throw new Error(`${name} exceeds EIP-170 contract size`);
      fs.writeFileSync(`artifacts/${name}.json`,JSON.stringify({abi:data.abi,bytecode:'0x'+data.evm.bytecode.object},null,2));
      console.log(`${name}: ${bytes} deployed bytes`);
    }
  }
}
if(process.argv[1]?.endsWith('compile.mjs')) compile();

for(let i=0;i<180;i++){
  try{
    const endpoints=['http://127.0.0.1:5174/deployment.json',...Array.from({length:6},(_,i)=>`http://127.0.0.1:${8781+i}/health`)];
    const results=await Promise.all(endpoints.map(x=>fetch(x)));if(results.every(r=>r.ok)){console.log('Application and six verifier processes ready');process.exit(0);}
  }catch{}
  await new Promise(r=>setTimeout(r,500));
}
throw new Error('Local application did not become ready');

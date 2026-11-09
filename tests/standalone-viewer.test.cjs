const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {startViewer}=require('../extensions/paper-writing/standalone-viewer');
test('independent viewer serves only loopback assets, no manuscript or external resources',async()=>{
  const viewer=await startViewer();
  try{
    assert.equal(new URL(viewer.url).hostname,'127.0.0.1');
    const page=await fetch(viewer.url);assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/img-src blob: data:/);
    assert.match(await page.text(),/图片单独全屏/);
    assert.equal((await fetch(viewer.url+'viewer.js')).status,200);
    assert.equal((await fetch(viewer.url+'unknown')).status,404);
    assert.equal((await fetch(new URL('/viewer.js',viewer.url))).status,404);
    assert.equal((await fetch(viewer.url,{method:'POST',body:'private'})).status,404);
    const status=await new Promise((resolve,reject)=>{http.get(viewer.url,{headers:{Host:'attacker.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
    assert.equal(status,404);
  }finally{viewer.dispose();}
});
test('large diagrams use short external URLs and a bounded local snapshot cache',async()=>{
  const viewer=await startViewer();
  try{
    const data='a'.repeat(100000), url=viewer.store(data);
    assert.ok(url.length<200);
    const route=viewer.url+'diagram/'+new URL(url).hash.slice(4);
    assert.equal(await (await fetch(route)).text(),data);
    for(let i=0;i<16;i++)viewer.store('abcd');
    assert.equal((await fetch(route)).status,404);
    assert.throws(()=>viewer.store('a'.repeat(2000001)));
    assert.throws(()=>viewer.store('<script>'));
  }finally{viewer.dispose();}
});

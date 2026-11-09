/* The SVG is an image, never executable page markup. Loopback requests only. */
(async () => {
  const $ = id => document.getElementById(id);
  const reader=$('reader'), viewport=$('viewport'), img=$('diagram'), percent=$('percent'), hint=$('hint'), fullscreen=$('fullscreen');
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  let width=1,height=1,scale=1,clearScale=1,drag=null,idle;
  function paint(){img.style.width=`${width*scale}px`;img.style.height=`${height*scale}px`;percent.textContent=`${Math.round(scale*100)}%`;}
  function zoom(next){const old=img.getBoundingClientRect(),port=viewport.getBoundingClientRect(),x=port.left+viewport.clientWidth/2,y=port.top+viewport.clientHeight/2,px=(x-old.left)/scale,py=(y-old.top)/scale;scale=clamp(next,.02,8);paint();const now=img.getBoundingClientRect();viewport.scrollLeft+=now.left+px*scale-x;viewport.scrollTop+=now.top+py*scale-y;}
  function reset(next){scale=next;paint();viewport.scrollLeft=0;viewport.scrollTop=0;}
  function fit(){reset(clamp(Math.min((viewport.clientWidth-64)/width,(viewport.clientHeight-120)/height,2),.02,8));}
  function wake(){reader.classList.remove('quiet');clearTimeout(idle);if(document.fullscreenElement)idle=setTimeout(()=>{if(!$('toolbar').matches(':hover'))reader.classList.add('quiet');},1800);}
  $('minus').onclick=()=>zoom(scale/1.25);$('plus').onclick=()=>zoom(scale*1.25);$('fit').onclick=fit;$('readable').onclick=()=>reset(clearScale);
  fullscreen.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await reader.requestFullscreen();}catch{hint.textContent='浏览器未允许全屏，请再点击一次全屏按钮。';}};
  document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'退出图片全屏 ⛶':'图片单独全屏 ⛶';wake();});
  reader.addEventListener('pointermove',wake);reader.addEventListener('pointerdown',wake);
  viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(scale*Math.exp(-clamp(e.deltaY,-100,100)*.003));},{passive:false});
  viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
  viewport.addEventListener('pointermove',e=>{if(drag){viewport.scrollLeft=drag.left+drag.x-e.clientX;viewport.scrollTop=drag.top+drag.y-e.clientY;}});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(event,()=>{drag=null;viewport.classList.remove('dragging');});
  viewport.addEventListener('dblclick',()=>fullscreen.click());
  try{
    const id=location.hash.match(/^#id=([a-f0-9]{32})$/)?.[1];
    if(!id)throw Error('请从 VS Code 图表上的「图片单独全屏」按钮打开。');
    const response=await fetch(`diagram/${id}`);
    if(!response.ok)throw Error('此看图页已过期，请从 VS Code 重新打开。');
    const encoded=await response.text();if(encoded.length>2000000)throw Error('图表过大，请在 VS Code 中放大阅读。');
    const bytes=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const input=stream.getReader();let size=0;const chunks=[];
    for(;;){const {done,value}=await input.read();if(done)break;size+=value.byteLength;if(size>8000000){await input.cancel();throw Error('图表过大，请在 VS Code 中放大阅读。');}chunks.push(value);}
    const payload=JSON.parse(await new Blob(chunks).text());
    width=Number(payload.width);height=Number(payload.height);clearScale=clamp(Number(payload.scale)||1,.1,8);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||typeof payload.svg!=='string')throw Error('图表数据不完整，请重新打开。');
    const url=URL.createObjectURL(new Blob([payload.svg],{type:'image/svg+xml'}));
    img.onload=()=>{URL.revokeObjectURL(url);reset(clearScale);};img.onerror=()=>{URL.revokeObjectURL(url);hint.textContent='图表未能载入，请回到 VS Code 重新打开。';};
    img.src=url;
  }catch(error){hint.textContent=error.message;}
})();

const box=document.getElementById('selection');let origin=null;
window.selection.image().then(image=>{document.getElementById('screen').src=image;}).catch(()=>{document.querySelector('aside').textContent='Ekran okunamadı. Esc ile kapatıp tekrar dene.';});
const rect=e=>({x:Math.min(origin.x,e.clientX),y:Math.min(origin.y,e.clientY),width:Math.abs(origin.x-e.clientX),height:Math.abs(origin.y-e.clientY)});
document.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();document.body.setPointerCapture(e.pointerId);origin={x:e.clientX,y:e.clientY};box.style.display='block';});
document.addEventListener('pointermove',e=>{if(!origin)return;const r=rect(e);for(const key of ['left','top','width','height'])box.style[key]=r[{left:'x',top:'y',width:'width',height:'height'}[key]]+'px';});
document.addEventListener('pointerup',e=>{if(origin){const r=rect(e);origin=null;if(r.width>=8&&r.height>=8)window.selection.finish(r);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.selection.finish(null);});

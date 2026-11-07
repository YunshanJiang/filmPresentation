(()=>{
 if(!location.pathname.endsWith('/remote.html'))return;
 const key=new URLSearchParams(location.hash.slice(1)).get('key');if(!key)return;
 const desktopId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const headers={'X-Remote-Key':key,'X-Desktop-ID':desktopId,'Content-Type':'application/json'};
 const toggle=document.createElement('button');toggle.className='icon-button';toggle.id='desktopToggle';toggle.textContent='鼠标模式';document.querySelector('.utilities').prepend(toggle);
 const panel=document.createElement('section');panel.className='desktop-remote';panel.hidden=true;
 panel.innerHTML=`<header><strong>电脑实时桌面</strong><span id="desktopState" role="status">连接中…</span><button id="desktopExit">返回演示</button></header>
 <div class="desktop-display"><canvas aria-label="电脑桌面，滑动移动鼠标，轻点点击"></canvas><i class="desktop-touch" hidden></i></div>
 <footer><div class="desktop-modes"><button data-mode="point" aria-pressed="true">移动 / 点击</button><button data-mode="scroll" aria-pressed="false">滚动</button><button data-mode="drag" aria-pressed="false">拖动</button></div><button id="desktopRight">右键</button><span>滑动移动 · 轻点点击 · 电脑 Esc 停止</span></footer>`;
 document.body.append(panel);
 const canvas=panel.querySelector('canvas'),display=panel.querySelector('.desktop-display'),touch=panel.querySelector('.desktop-touch'),status=panel.querySelector('#desktopState');
 let active=false,generation=0,frame=0,seq=0,meta=null,mode='point',pointer=null,position={x:.5,y:.5},lastMove=0;
 let queue=[],pumping=false,capturing=false;
 async function api(path,body){const r=await fetch('/api/desktop/'+path,{method:body?'POST':'GET',headers,cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});if(!r.ok){const d=await r.json();throw Error(d.error||'连接中断');}return r;}
 function error(e){status.textContent=e.message||'连接中断';}
 async function pump(){
  if(pumping)return;pumping=true;
  try{while(active&&queue.length){const item=queue.shift();try{await api('input',item);}catch(e){error(e);queue=[];break;}}}
  finally{pumping=false;}
 }
 function send(action,point=position,delta){
  if(!active||!frame)return;
  const item={action,x:point.x,y:point.y,frame,seq:++seq,...(delta!==undefined?{delta}: {})};
  if(action==='move'&&queue.at(-1)?.action==='move')queue[queue.length-1]=item;else queue.push(item);
  pump();
 }
 async function capture(run){
  if(!active||run!==generation||capturing)return;capturing=true;
  try{
   const response=await api('frame'),info=JSON.parse(response.headers.get('X-Desktop-Meta'));
   const bitmap=await createImageBitmap(await response.blob());
   if(!active||run!==generation){bitmap.close();return;}
   canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
   meta=info;frame=info.frame;if(!pointer&&info.cursor)position={x:info.cursor[0],y:info.cursor[1]};status.textContent='已连接 · 黄色标记为电脑鼠标';
  }catch(e){error(e);if(active){active=false;generation++;queue=[];toggle.textContent='重新开启鼠标';}}
  finally{capturing=false;if(active&&run===generation)setTimeout(()=>capture(run),180);}
 }
 async function start(){
  toggle.disabled=true;
  try{await api('enable',{});active=true;generation++;frame=0;seq=0;queue=[];panel.hidden=false;document.body.classList.add('desktop-mode');toggle.textContent='鼠标模式 · 已连接';capture(generation);}
  catch(e){toggle.textContent='鼠标模式 · 未连接';alert(e.message);}
  finally{toggle.disabled=false;}
 }
 function stop(){
  active=false;generation++;queue=[];pointer=null;frame=0;meta=null;touch.hidden=true;panel.hidden=true;document.body.classList.remove('desktop-mode');toggle.textContent='鼠标模式';
  fetch('/api/desktop/disable',{method:'POST',headers,body:'{}',keepalive:true}).catch(()=>{});
 }
 toggle.onclick=start;panel.querySelector('#desktopExit').onclick=stop;
 panel.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(pointer){send('up');pointer=null;}mode=b.dataset.mode;panel.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));status.textContent=mode==='scroll'?'上下滑动滚动电脑网页':mode==='drag'?'按住并移动，拖动电脑内容':'滑动移动鼠标，轻点点击';});
 function point(e){
  const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
  const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  if(x<0||x>1||y<0||y>1)return null;
  position={x,y};const d=display.getBoundingClientRect();touch.style.left=(e.clientX-d.left)+'px';touch.style.top=(e.clientY-d.top)+'px';touch.hidden=false;return position;
 }
 canvas.addEventListener('pointerdown',e=>{
  if(pointer||!active||!frame)return;const p=point(e);if(!p)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastY:e.clientY,moved:false};
  send(mode==='drag'?'down':'move',p);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;e.preventDefault();
  if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;
  const p=point(e);if(!p)return;
  if(performance.now()-lastMove<50)return;lastMove=performance.now();
  if(mode==='scroll'){const delta=Math.max(-1200,Math.min(1200,(pointer.lastY-e.clientY)*4));pointer.lastY=e.clientY;if(Math.abs(delta)>1)send('wheel',p,delta);}
  else send('move',p);
 });
 function release(e,cancel=false){
  if(!pointer||pointer.id!==e.pointerId)return;e.preventDefault();const p=point(e)||position;
  if(mode==='drag')send('up',p);else if(!cancel&&!pointer.moved&&mode==='point')send('click',p);else if(mode==='point')send('move',p);
  pointer=null;touch.hidden=true;
 }
 canvas.addEventListener('pointerup',e=>release(e));canvas.addEventListener('pointercancel',e=>release(e,true));canvas.addEventListener('lostpointercapture',e=>{if(pointer?.id===e.pointerId)release(e,true);});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());panel.querySelector('#desktopRight').onclick=()=>send('right');
 window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop();});
 window.filmDesktopRemote={get state(){return {active,frame,mode,cursor:meta?.cursor};}};
})();

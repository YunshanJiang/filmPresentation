(()=>{
 const key=new URLSearchParams(location.hash.slice(1)).get('key');
 const mobile=location.pathname.endsWith('/remote.html');window.filmRemoteController=mobile;
 const button=document.getElementById('remoteToggle');
 const dialog=document.createElement('dialog');dialog.className='remote-dialog';
 dialog.innerHTML='<h2>手机同步控制</h2><p></p><div class="remote-links"></div><button class="icon-button">关闭</button>';
 document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();button.onclick=()=>dialog.showModal();
 const message=dialog.querySelector('p');
 if(!key){message.textContent='请运行“启动手机遥控.cmd”，从电脑打开本次生成的完整配对链接。';return;}
 document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();if(mobile)window.dispatchEvent(new CustomEvent('film:remote-command',{detail:{action:'navigate',target:0}}));else window.filmPresentation.command({action:'navigate',target:0});});
 const id=sessionStorage.getItem('film-host-id')||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem('film-host-id',id);const headers={'X-Remote-Key':key,'X-Host-ID':id,'Content-Type':'application/json'};
 let ack=0,sending=false,online=false,snapshot=null,lastIndex=-1;
 async function request(path,body){const r=await fetch(path,{headers,cache:'no-store',...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'连接中断');return d;}
 window.addEventListener('film:remote-command',async e=>{
  if(!mobile||sending)return;
  if(!online||!snapshot){button.textContent='手机控制 · 电脑未连接';return;}
  if(snapshot.busy||snapshot.pending){button.textContent='手机控制 · 转场中';return;}
  const c=e.detail;if(c.action==='navigate'&&(c.target<0||c.target>=10))return;
  sending=true;
  try{await request('/api/command',c);button.textContent='手机控制 · 已发送';}
  catch(error){button.textContent='手机控制 · '+error.message;}
  finally{sending=false;}
 });
 async function tick(){
  try{
   if(mobile){
    const s=await request('/api/status');online=s.online;snapshot=s;
    document.body.classList.toggle('remote-offline',!online);
    if(online&&!document.body.classList.contains('desktop-mode')){await window.filmPresentation.mirror(s);lastIndex=s.index;}
    // In a stalled/offline connection, keep the visible page but disallow blind operations.
    button.textContent=!online?'手机控制 · 等待电脑':s.busy||s.pending?'手机控制 · 转场中':'手机控制 · 已同步';
    message.textContent='手机显示与电脑相同的演示界面。翻页、章节选择、重播、展板展开与关闭、声音开关均控制电脑。画面由两端本地播放并同步，保持此页处于前台。全屏只作用于当前设备。要操作第三方内嵌网页，请切换「鼠标模式」，通过电脑实时桌面直接操作真实鼠标。';
   }else{
    const s=window.filmPresentation.snapshot();
    s.busy=s.busy||!['intro','holding'].includes(s.phase)||!!s.brush;
    await request('/api/state',{...s,ack});
    const data=await request('/api/host');online=true;button.textContent='手机遥控 · 已连接';
    message.textContent='手机与电脑连接同一 Wi-Fi。用手机打开下面的完整链接，即可显示相同网页并控制电脑。';
    const links=dialog.querySelector('.remote-links');
    if(!links.children.length)for(const url of data.urls){const a=document.createElement('a');a.href=url;a.textContent=url;links.append(a);}
    const c=data.command;
    if(c&&c.id>ack){ack=c.id;const current=window.filmPresentation.snapshot();const locked=current.busy||!['intro','holding'].includes(current.phase)||!!current.brush;if(!locked&&current.index===c.index&&Date.now()/1000<c.expires)window.filmPresentation.command(c);}
   }
  }catch(error){online=false;document.body.classList.toggle('remote-offline',mobile);button.textContent=mobile?'手机控制 · 未连接':'手机遥控 · 未连接';message.textContent=error.message+'；请检查局域网及电脑服务。';}
  setTimeout(tick,100);
 }
 document.addEventListener('visibilitychange',()=>{if(mobile&&document.hidden)document.querySelectorAll('video').forEach(v=>v.pause());});
 tick();
})();

(()=>{
 const key=new URLSearchParams(location.hash.slice(1)).get('key');
 const button=document.getElementById('remoteToggle');
 const dialog=document.createElement('dialog');dialog.style.cssText='max-width:560px;background:#191523;color:#fff0d5;border:2px solid #ffc84e;padding:28px;border-radius:12px';
 dialog.innerHTML='<h2>手机遥控</h2><p class="remote-message"></p><div class="remote-links"></div><button class="icon-button">关闭</button>';
 document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
 button.onclick=()=>dialog.showModal();
 const message=dialog.querySelector('p');
 if(!key){message.textContent='请先运行“启动手机遥控.cmd”，使用自动打开的本地演示页。电脑和手机连接同一个 Wi-Fi。';return;}
 const id=crypto.randomUUID(),headers={'X-Remote-Key':key,'X-Host-ID':id,'Content-Type':'application/json'};
 let ack=0;
 async function tick(){
  try{
   const s=window.filmPresentation.state;
   const busy=s.busy||!['intro','holding'].includes(s.phase)||document.getElementById('textPlane').classList.contains('brush-running');
   let r=await fetch('/api/state',{method:'POST',headers,body:JSON.stringify({index:s.index,busy,phase:s.phase,title:document.getElementById('chapterTitle').textContent,ack})});
   if(!r.ok)throw Error((await r.json()).error);
   r=await fetch('/api/host',{headers,cache:'no-store'});if(!r.ok)throw Error('遥控连接中断');const data=await r.json();
   message.textContent='手机与电脑连接同一 Wi-Fi，在手机打开下方任一可访问的地址。';
   const links=dialog.querySelector('.remote-links');
   if(!links.children.length)for(const url of data.urls){const a=document.createElement('a');a.href=url;a.textContent=url;a.style.cssText='display:block;color:#55dfed;overflow-wrap:anywhere;margin:16px 0';links.append(a);}
   button.textContent='手机遥控 · 已连接';
   const c=data.command;
   if(c&&c.id>ack){ack=c.id;const current=window.filmPresentation.state;const locked=current.busy||!['intro','holding'].includes(current.phase)||document.getElementById('textPlane').classList.contains('brush-running');if(!locked&&current.index===c.index&&Date.now()/1000<c.expires){const control=document.getElementById(c.action);if(control&&!control.disabled)control.click();}}
  }catch(e){button.textContent='手机遥控 · 未连接';message.textContent=e.message+'；请检查本地服务是否仍在运行。';}
  setTimeout(tick,200);
 }
 tick();
})();

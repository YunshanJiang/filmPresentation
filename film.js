(() => {
  'use strict';
  const slides=window.FILM_SLIDES;
  const $=id=>document.getElementById(id);
  const videos=[$('videoA'),$('videoB')];
  const plane=$('textPlane');
  const stage=document.createElement('div');stage.className='scene-stage';
  [$('opening'),...videos,plane].forEach(el=>stage.append(el));$('screen').prepend(stage);
  const state={index:-1,active:-1,busy:false,phase:'intro',token:0,muted:true};
  let wheelTotal=0,wheelAt=0;

  // Map an HTML rectangle to the four measured corners of a video surface.
  function project(w,h,q){
    const xy=[[0,0],[w,0],[w,h],[0,h]],a=[];
    xy.forEach(([x,y],i)=>{const[X,Y]=q[i];a.push([x,y,1,0,0,0,-X*x,-X*y,X],[0,0,0,x,y,1,-Y*x,-Y*y,Y]);});
    for(let i=0;i<8;i++){
      let k=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;
      [a[i],a[k]]=[a[k],a[i]];
      const pivot=a[i][i];if(Math.abs(pivot)<1e-9)throw Error('无效的文字透视坐标');
      for(let c=i;c<9;c++)a[i][c]/=pivot;
      for(let r=0;r<8;r++)if(r!==i){const v=a[r][i];for(let c=i;c<9;c++)a[r][c]-=v*a[i][c];}
    }
    const z=a.map(r=>r[8]);return `matrix3d(${z[0]},${z[3]},0,${z[6]},${z[1]},${z[4]},0,${z[7]},0,0,1,0,${z[2]},${z[5]},0,1)`;
  }
  const caseTitles=['地质博物馆','市属国企合作','兰州职业技术学院','卷云传'];
  const caseUrls=['','','https://yunshanjiang.github.io/Inkstone/','https://legendofjuanyun.com'];
  let caseOpen=false,caseAnimation,currentCase=-1,blockedCase=-1;
  const caseView=document.createElement('section');caseView.className='case-view';caseView.hidden=true;
  caseView.setAttribute('aria-label','广告牌实践案例');
  function closeCase(remote=false){
    if(remote!==true&&window.filmRemoteController){window.dispatchEvent(new CustomEvent("film:remote-command",{detail:{action:"case-close"}}));return;}
    if(!caseOpen)return;blockedCase=currentCase;caseOpen=false;caseAnimation?.cancel();
    caseView.querySelector('video')?.pause();caseView.replaceChildren();caseView.hidden=true;
    $('screen').classList.remove('case-active');stage.style.transform='none';
    plane.querySelectorAll('.surface.project').forEach(el=>el.style.visibility='');caseView.remove();
  }
  function openCase(n,source,remote=false){
    if(remote!==true&&window.filmRemoteController){window.dispatchEvent(new CustomEvent("film:remote-command",{detail:{action:"case-open",target:n}}));return;}
    if(state.busy||state.index!==2||caseOpen||(!remote&&blockedCase===n)||plane.classList.contains('brush-running'))return;
    currentCase=n;caseOpen=true;caseView.hidden=false;$('screen').classList.add('case-active');
    const q=slides[2].panels[n].quad;
    const cx=q.reduce((a,v)=>a+v[0],0)/4,cy=q.reduce((a,v)=>a+v[1],0)/4;
    const w=1000,h=Math.round(1000*(q[3][1]-q[0][1])/(q[1][0]-q[0][0]));
    caseView.style.width=w+'px';caseView.style.height=h+'px';caseView.style.transform=project(w,h,q);
    plane.append(caseView);source.style.visibility='hidden';
    const scale=3.15;
    stage.style.transform=`translate(${(432-scale*cx)/864*100}%,${(248-scale*cy)/496*100}%) scale(${scale})`;
    caseView.dataset.opened=Date.now();
    caseView.innerHTML=`<header class="case-header"><strong>${String(n+1).padStart(2,'0')} / ${caseTitles[n]}</strong><div>${caseUrls[n]?`<a href="${caseUrls[n]}" target="_blank" rel="noopener noreferrer">新窗口打开 ↗</a>`:''}<button type="button" class="case-close" aria-label="关闭案例">返回展板 ×</button></div></header><div class="case-content"></div>`;
    caseView.querySelector('button').onclick=closeCase;
    const body=caseView.querySelector('.case-content');
    if(n===0){
      const v=document.createElement('video');v.src='case-media/geology.mp4';v.controls=true;v.autoplay=true;v.loop=true;v.muted=true;v.playsInline=true;v.setAttribute('aria-label','地质博物馆实践案例视频');body.append(v);v.play().catch(()=>{});
    }else if(n===1){
      body.innerHTML='<div class="partner-case"><small>STRATEGIC COLLABORATION</small><h2 class="partner-shake">市属国企合作</h2><p>兰州黄河科技发展有限公司</p><strong>已签署战略合作</strong></div>';
    }else{
      const frame=document.createElement('iframe');frame.title=caseTitles[n]+'实践案例';frame.src=caseUrls[n];frame.allow='fullscreen';frame.referrerPolicy='strict-origin-when-cross-origin';body.append(frame);
      if(n===3){const note=document.createElement('p');note.className='case-site-note';note.textContent='网站当前返回 403；恢复访问后可在此查看，也可使用上方入口打开。';body.append(note);}
    }

  }
  document.addEventListener('pointermove',e=>{if(!caseOpen&&blockedCase>=0){const panels=[...plane.querySelectorAll('.surface.project')];if(!panels[blockedCase]?.contains(e.target))blockedCase=-1;}});
  caseView.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&Date.now()-Number(caseView.dataset.opened)>850)closeCase();});
  caseView.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});
  const brushTextures=['01-flat','02-dry','03-narrow','04-diagonal'].map(name=>{
    const im=new Image();im.src=`assets/brush-masks-v1/${name}.png`;return im;
  });
  let brushStarted=0,brushMode="reveal";
  let brushRun=0,brushFrame=0,brushTargets=[],brushResolve;
  function cancelBrushReveal(){
    brushRun++;cancelAnimationFrame(brushFrame);brushResolve?.(false);brushResolve=null;
    for(const el of brushTargets){el.style.maskImage='';el.style.webkitMaskImage='';el.classList.remove('paint-revealing','paint-pending');el.querySelector('.paint-swipe')?.remove();}
    brushTargets=[];plane.classList.remove('brush-running');
  }
  function prepareBrushReveal(){
    brushTargets=[...plane.querySelectorAll('.copy')].flatMap(copy=>copy.closest('.project')?[copy]:[...copy.querySelectorAll('.eyebrow,h2,p,.card>b,.flow,.community-keywords>span')]);
    plane.classList.add('brush-test');
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    brushTargets.forEach(el=>{el.classList.add('paint-pending');el.style.maskImage='linear-gradient(transparent,transparent)';el.style.webkitMaskImage=el.style.maskImage;});
  }
  async function startBrushReveal({erase=false,elapsed=0}={}){
    if(state.index<1||!brushTargets.length||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const run=++brushRun;cancelAnimationFrame(brushFrame);brushResolve?.(false);brushResolve=null;
    brushTargets.forEach(el=>el.querySelector('.paint-swipe')?.remove());
    const snapshots=erase?brushTargets.map(el=>el.style.maskImage||'none'):[];
    brushStarted=performance.now()-elapsed;brushMode=erase?'erase':'reveal';
    plane.classList.add('brush-running');
    await Promise.all(brushTextures.map(im=>im.decode().catch(()=>{})));
    if(run!==brushRun||state.index<1||state.phase!==(erase?'erasing':'holding'))return;
    const originals=await Promise.all(snapshots.map(async mask=>{
      const url=mask.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if(!url)return mask==='none'?null:'empty';
      const im=new Image();im.src=url;await im.decode().catch(()=>{});return im.naturalWidth?im:null;
    }));
    if(run!==brushRun)return;
    const jobs=brushTargets.map((el,i)=>{
      const width=Math.ceil(el.offsetWidth),height=Math.ceil(el.offsetHeight);
      const factor=Math.min(1,560/width),canvas=document.createElement('canvas');canvas.width=Math.ceil(width*factor);canvas.height=Math.ceil(height*factor);
      const isBoard=el.classList.contains('copy'),isHeading=el.matches('h2'),isLabel=el.matches('.eyebrow'),isNote=el.matches('.note');
      const ctx=canvas.getContext('2d'),texture=brushTextures[isBoard?1:isHeading?0:el.matches('b,.eyebrow')?2:1];
      const delay=erase?Math.min(i,10)*25:isBoard?120+i*160:isLabel?80:isHeading?230:isNote?1700:550+Math.min(i,11)*100;
      const duration=erase?900:isBoard?1350:isHeading?1080:isLabel?480:el.matches('p')?1100:650;
      el.classList.add('paint-revealing');
      const swipe=document.createElement('span');swipe.className='paint-swipe';swipe.setAttribute('aria-hidden','true');el.append(swipe);
      const paint=document.createElement('canvas');paint.width=canvas.width;paint.height=canvas.height;
      return {el,ctx,canvas,paint,paintCtx:paint.getContext('2d'),variant:i%3,texture,delay,duration,swipe,original:erase?originals[i]:null,last:-1,done:false};
    });
    return new Promise(resolve=>{brushResolve=resolve;
    const start=performance.now()-elapsed;brushStarted=start;brushMode=erase?"erase":"reveal";let lastPaint=-Infinity;
    const tick=now=>{
      if(run!==brushRun)return;
      if(now-lastPaint<30){brushFrame=requestAnimationFrame(tick);return;}lastPaint=now;
      let pending=false;
      for(const j of jobs){
        if(j.done)continue;const t=Math.max(0,Math.min(1,(now-start-j.delay)/j.duration));
        if(now-start<j.delay){pending=true;continue;}
        j.el.classList.remove('paint-pending');
        if(t>=1){j.el.style.maskImage=erase?'linear-gradient(transparent,transparent)':'none';j.el.style.webkitMaskImage=j.el.style.maskImage;j.swipe.remove();j.el.classList.remove('paint-revealing');j.done=true;continue;}
        pending=true;
        const {canvas:c,ctx}=j,bw=Math.max(45,c.width*.48),bh=c.height*1.65;
        const eased=t*t*(3-2*t);
        const points=[[-.22,.12],[.32,.04],[1.22,.27],[.67,.53],[-.22,.62],[.36,.96],[1.22,.88]];
        const position=progress=>{
          const a=Math.min(points.length-1.00001,progress*(points.length-1)),k=Math.floor(a),f=a-k;
          const p0=points[Math.max(0,k-1)],p1=points[k],p2=points[k+1],p3=points[Math.min(points.length-1,k+2)];
          const curve=axis=>.5*((2*p1[axis])+(-p0[axis]+p2[axis])*f+(2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*f*f+(-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*f*f*f);
          let x=curve(0),y=curve(1);
          if(j.variant===1)x=1-x;
          if(j.variant===2)y=1-y;
          return {x:x*c.width,y:y*c.height};
        };
        const paint=j.paintCtx;
        const stamp=progress=>{
          const p=position(progress),ahead=position(Math.min(.99999,progress+.012));
          const angle=Math.max(-.16,Math.min(.16,Math.atan2(ahead.y-p.y,Math.abs(ahead.x-p.x)+.01)));
          paint.save();paint.translate(p.x,p.y);paint.rotate(angle);paint.globalAlpha=.98;
          if(j.texture.naturalWidth)paint.drawImage(j.texture,-bw/2,-bh/2,bw,bh);
          else{paint.fillStyle='#fff';paint.fillRect(-bw/2,-c.height*.35,bw,c.height*.7);}
          paint.restore();return {p,angle};
        };
        for(let at=Math.max(0,j.last);at<eased;at+=.008)stamp(at);
        const head=stamp(eased);j.last=eased;
        ctx.clearRect(0,0,c.width,c.height);ctx.globalCompositeOperation='source-over';ctx.drawImage(j.paint,0,0);
        // Close tiny bristle gaps gradually at the end, without a final-frame jump.
        if(t>.86){ctx.globalAlpha=(t-.86)/.14;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.globalAlpha=1;}
        if(erase){
          ctx.globalCompositeOperation='source-out';ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.globalCompositeOperation='source-over';
          if(j.original==='empty')ctx.clearRect(0,0,c.width,c.height);
          else if(j.original){ctx.globalCompositeOperation='destination-in';ctx.drawImage(j.original,0,0,c.width,c.height);ctx.globalCompositeOperation='source-over';}
        }
        const mask=`url("${c.toDataURL('image/png')}")`;j.el.style.maskImage=mask;j.el.style.webkitMaskImage=mask;
        j.swipe.style.width='48%';j.swipe.style.left=(head.p.x/c.width*100-24)+'%';j.swipe.style.top=(head.p.y/c.height*100-70)+'%';j.swipe.style.transform=`rotate(${head.angle}rad)`;j.swipe.style.opacity=String(.22*(1-t));
      }
      if(pending)brushFrame=requestAnimationFrame(tick);
      else{plane.classList.remove('brush-running');brushResolve=null;resolve(true);window.dispatchEvent(new CustomEvent('film:brush-end',{detail:{number:state.index+1,mode:erase?'erase':'reveal'}}));}
    };
    brushFrame=requestAnimationFrame(tick);
    });
  }
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function buildText(index){
    closeCase(true);cancelBrushReveal();plane.classList.remove("brush-test");plane.style.visibility="";
    plane.replaceChildren();
    for(const panel of slides[index].panels){
      const q=panel.quad,w=panel.kind==='project'?420:1000;
      const realW=(distance(q[0],q[1])+distance(q[3],q[2]))/2;
      const realH=(distance(q[0],q[3])+distance(q[1],q[2]))/2;
      const h=Math.round(w*realH/realW),surface=document.createElement('div');
      surface.className='surface '+panel.kind+(index>=2?' graffiti-rich':'');surface.dataset.chapter=String(index+1);surface.dataset.panel=String(slides[index].panels.indexOf(panel));surface.style.width=w+'px';surface.style.height=h+'px';
      surface.style.transform=project(w,h,q);
      const copy=document.createElement('div');copy.className='copy';copy.innerHTML=panel.html;surface.append(copy);plane.append(surface);
      if(panel.kind==='project'){
        const n=slides[index].panels.indexOf(panel);
        surface.tabIndex=0;surface.setAttribute('role','button');surface.setAttribute('aria-label',caseTitles[n]+'，展开案例');
        surface.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&state.phase==='holding')openCase(n,surface);});
        surface.addEventListener('click',()=>openCase(n,surface));
        surface.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openCase(n,surface);}});
      }
      let size=panel.kind==='cover'?54:index>=2?96:42;
      copy.style.fontSize=size+'px';
      if(index>=2){
        // Fit actual rotated lettering and its shadows, not just the text flow box.
        const mapped=surface.style.transform;surface.style.transform='none';
        const fits=()=>{
          if(copy.scrollHeight>h+1||copy.scrollWidth>w+1)return false;
          const bounds=surface.getBoundingClientRect(),scale=bounds.width/w,edge=9*scale;
          return [...copy.querySelectorAll('h2,p,b,.eyebrow,.flow')].every(el=>{
            const r=el.getBoundingClientRect();return r.left>=bounds.left+edge&&r.right<=bounds.right-edge&&r.top>=bounds.top+edge&&r.bottom<=bounds.bottom-edge;
          });
        };
        let lo=28,hi=Math.floor(size*2),best=14;
        while(lo<=hi){const mid=Math.floor((lo+hi)/2);copy.style.fontSize=(mid/2)+'px';if(fits()){best=mid/2;lo=mid+1;}else hi=mid-1;}
        size=best;copy.style.fontSize=size+'px';
        surface.style.transform=mapped;
      }else{
        let lo=28,hi=Math.floor(size*2),best=14;
        while(lo<=hi){const mid=Math.floor((lo+hi)/2);copy.style.fontSize=(mid/2)+'px';if(copy.scrollHeight<=copy.clientHeight+1&&copy.scrollWidth<=copy.clientWidth+1){best=mid/2;lo=mid+1;}else hi=mid-1;}
        size=best;copy.style.fontSize=size+'px';
      }
    }
    if(index>=1){prepareBrushReveal();if(state.phase==='holding')startBrushReveal();}
  }
  function layout(){
    const host=$('screenHost'),w=Math.min(host.clientWidth,host.clientHeight*864/496);
    $('screen').style.width=w+'px';$('screen').style.height=(w*496/864)+'px';
    plane.style.transform=`scale(${w/864})`;
  }
  new ResizeObserver(layout).observe($('screenHost'));layout();

  function controls(){
    $('previous').disabled=state.busy||state.index<=0;
    $('replay').disabled=state.busy||state.index<0;
    $('next').disabled=state.busy||state.index===slides.length-1;
    $('next').innerHTML=state.index<0?'开始放映 <span>→</span>':state.index===9?'旅程已到达 <span>✓</span>':'下一幕 <span>→</span>';
    [...$('chapters').children].forEach((b,i)=>{b.disabled=state.busy;b.setAttribute('aria-current',i===state.index?'step':'false');});
    $('app').setAttribute('aria-busy',String(state.busy));
  }
  function status(s){$('status').textContent=s;}
  function loaded(video,index,reverse=false){
    return new Promise((resolve,reject)=>{
      let timer;
      const clean=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);};
      const ok=()=>{clean();resolve();};
      const bad=()=>{clean();reject(Error(`第${index+1}段视频读取失败，请检查 filmclip/${index+1}.mp4。`));};
      video.addEventListener('loadeddata',ok,{once:true});video.addEventListener('error',bad,{once:true});
      timer=setTimeout(()=>{clean();reject(Error('视频读取超时，请检查文件后重试。'));},20000);
      const key=reverse?'reverse:'+index:String(index);
      if(video.dataset.clip!==key){
        video.dataset.clip=key;video.src=reverse?`filmclip-reverse/${index+1}.mp4`:slides[index].video;video.load();
      }else if(video.readyState>=2)ok();
    });
  }
  async function seekPausedFrame(video,time=0){
    video.pause();
    if(Math.abs(video.currentTime-time)<.00001&&!video.seeking&&video.readyState>=2)return;
    await new Promise((resolve,reject)=>{
      const clean=()=>{clearTimeout(timer);video.removeEventListener('seeked',ready);video.removeEventListener('error',failed);};
      const ready=()=>{clean();resolve();},failed=()=>{clean();reject(Error('视频首帧定位失败'));};
      const timer=setTimeout(()=>{clean();reject(Error('视频首帧定位超时，请重试'));},10000);
      video.addEventListener('seeked',ready);video.addEventListener('error',failed,{once:true});video.currentTime=time;
    });
  }
  function paintPausedFrame(){
    return new Promise(resolve=>{const timer=setTimeout(resolve,180);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});
  }
  function prefetch(){
    const index=state.index+1;if(index>=slides.length||state.active<0)return;
    const buffer=videos[1-state.active];buffer.pause();buffer.onended=null;buffer.ontimeupdate=null;
    if(buffer.dataset.clip!==String(index)){buffer.dataset.clip=String(index);buffer.src=slides[index].video;buffer.preload='auto';buffer.load();}
  }
  async function finish(video,token,reverse=false){
    if(token!==state.token||video!==videos[state.active])return;
    if(reverse){
      // End on the actual previous slide's final frame before revealing its mapped text.
      const slot=1-state.active,previous=videos[slot];
      try{
        await loaded(previous,state.index);
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{previous.removeEventListener('seeked',ready);reject(Error('上一页尾帧读取超时'));},10000);
          const ready=()=>{clearTimeout(timer);resolve();};
          previous.addEventListener('seeked',ready,{once:true});
          previous.currentTime=Math.max(0,previous.duration-.001);
        });
        if(token!==state.token)return;
        previous.pause();previous.muted=state.muted;
        videos.forEach((v,i)=>v.classList.toggle('active',i===slot));state.active=slot;
      }catch(error){
        state.busy=false;state.phase='error';state.failed=state.index;
        $('errorMessage').textContent=error.message;$('errorNotice').hidden=false;controls();return;
      }
    }
    state.busy=false;state.phase='holding';
    $('loadNotice').hidden=true;plane.classList.add('visible');
    if(state.index>=1)startBrushReveal();
    status(state.index===9?'欢迎加入 dream兰 · 可返回任意章节':'镜头已停稳 · 点击下一幕 / 按 → 继续');
    $('progress').style.width='100%';controls();prefetch();
    window.dispatchEvent(new CustomEvent('film:hold',{detail:{index:state.index,number:state.index+1}}));
  }
  async function go(index,options={}){
    if(window.filmRemoteController){window.dispatchEvent(new CustomEvent("film:remote-command",{detail:{action:"navigate",target:index}}));return;}
    if(state.busy||index<0||index>=slides.length)return;
    closeCase();
    const token=++state.token;
    state.busy=true;controls();
    if(state.index>=1&&plane.classList.contains('visible')){
      state.phase='erasing';status('正在刷除文字…');
      await startBrushReveal({erase:true});
      if(token!==state.token)return;
    }
    // Keep every erased mask intact until the next scene has replaced the old text.
    // Hiding the whole plane also prevents a compositor flash when clearing masks later.
    plane.style.visibility='hidden';plane.classList.remove('visible');
    if(state.index>=0){
      state.phase='cleared';status('文字已刷除 · 准备转场');
      window.dispatchEvent(new CustomEvent('film:cleared',{detail:{number:state.index+1}}));
      await new Promise(resolve=>setTimeout(resolve,240));
      if(token!==state.token)return;
    }
    const reverseSource=options.reverseSource??(index===state.index-1?state.index:null);
    const reverse=reverseSource!==null;
    state.phase='loading';
    $('welcome').hidden=true;$('errorNotice').hidden=true;status('正在准备镜头…');controls();
    const spinnerTimer=setTimeout(()=>{if(state.busy&&state.phase==='loading')$('loadNotice').hidden=false;},500);
    const slot=state.active===0?1:0,video=videos[slot];
    try{
      await Promise.all([loaded(video,reverse?reverseSource:index,reverse),new Promise(r=>setTimeout(r,state.index<0?0:200))]);
      if(token!==state.token)return;
      video.pause();video.onended=null;video.ontimeupdate=null;
      video.muted=state.muted;video.loop=false;video.playbackRate=1;
      await seekPausedFrame(video,0);
      if(token!==state.token)return;
      // Layout and masks can be expensive. Finish them while both video clocks are paused.
      buildText(index);
      await seekPausedFrame(video,0);
      if(token!==state.token)return;
      videos.forEach((v,i)=>{v.pause();v.classList.toggle('active',i===slot);});
      state.active=slot;state.index=index;state.phase='priming';
      $('chapterNumber').textContent=String(index+1).padStart(2,'0');
      $('chapterTitle').textContent=slides[index].title;$('loadNotice').hidden=true;
      await paintPausedFrame();
      if(token!==state.token)return;
      window.dispatchEvent(new CustomEvent('film:frame-ready',{detail:{index,number:index+1,time:video.currentTime,paused:video.paused}}));
      state.phase='playing';
      status(reverse?'正在倒放 · 返回上一页':'运镜播放中 · 结束后显示文案');controls();
      window.dispatchEvent(new CustomEvent('film:play',{detail:{index,number:index+1}}));
      video.onended=()=>finish(video,token,reverse);
      video.ontimeupdate=()=>{if(video===videos[state.active]&&video.duration)$('progress').style.width=(video.currentTime/video.duration*100)+'%';};
      await video.play();
    }catch(error){
      if(token!==state.token)return;
      state.busy=false;state.phase='error';state.failed=index;state.failedReverse=reverseSource;
      $('loadNotice').hidden=true;$('errorMessage').textContent=error.message||'播放受阻，请点击重试。';$('errorNotice').hidden=false;
      status('播放未完成');controls();
    }finally{clearTimeout(spinnerTimer);}
  }
  slides.forEach((slide,i)=>{const b=document.createElement('button');b.textContent=String(i+1).padStart(2,'0');b.title=slide.title;b.setAttribute('aria-label',`第${i+1}页 ${slide.title}`);b.onclick=()=>go(i);$('chapters').append(b);});
  $('begin').onclick=()=>go(0);$('next').onclick=()=>go(state.index+1);$('previous').onclick=()=>go(state.index-1);$('replay').onclick=()=>go(state.index);$('retry').onclick=()=>go(state.failed??Math.max(state.index,0),{reverseSource:state.failedReverse??null});
  $('sound').onclick=()=>{if(window.filmRemoteController){window.dispatchEvent(new CustomEvent('film:remote-command',{detail:{action:'sound'}}));return;}state.muted=!state.muted;videos.forEach(v=>v.muted=state.muted);$('sound').querySelector('span').textContent=state.muted?'关':'开';$('sound').setAttribute('aria-pressed',String(!state.muted));$('sound').setAttribute('aria-label',state.muted?'开启视频声音':'关闭视频声音');};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('app').requestFullscreen();}catch{status('请使用浏览器全屏快捷键 F11');}};
  document.addEventListener('fullscreenchange',()=>{document.body.classList.toggle('is-fullscreen',!!document.fullscreenElement);layout();});
  document.addEventListener('keydown',e=>{
    if(caseOpen){if(e.key==='Escape'){e.preventDefault();closeCase();}return;}
    if(e.altKey||e.ctrlKey||e.metaKey||e.repeat||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(e.key==='ArrowRight'||e.key==='PageDown'||(e.code==='Space'&&e.target===document.body)){e.preventDefault();go(state.index+1);}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(state.index-1);}
    else if(e.key.toLowerCase()==='r'&&state.index>=0)go(state.index);
    else if(e.key.toLowerCase()==='f')$('fullscreen').click();
    else if(e.key.toLowerCase()==='m')$('sound').click();
  });
  document.addEventListener('wheel',e=>{
    if(caseOpen)return;
    e.preventDefault();if(state.busy||state.index<0){wheelTotal=0;return;}
    const now=Date.now();if(now-wheelAt>250)wheelTotal=0;wheelAt=now;wheelTotal+=e.deltaY;
    if(Math.abs(wheelTotal)>90){const d=wheelTotal>0?1:-1;wheelTotal=0;go(state.index+d);}
  },{passive:false});
  let touch;
  $('screen').addEventListener('touchstart',e=>{touch={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};},{passive:true});
  $('screen').addEventListener('touchend',e=>{if(caseOpen||!touch||state.index<0)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.3)go(state.index+(dx<0?1:-1));touch=null;},{passive:true});
  document.fonts.ready.then(()=>{if(state.phase==='holding')buildText(state.index);});
  controls();
  loaded(videos[0],0).catch(()=>{});
  // Read-only diagnostics for presentation checks; navigation uses the public controls.
  let remoteClip=null,remoteBrush=null;
  window.filmPresentation={get state(){return {...state};},slides,
    snapshot(){const v=videos[state.active];return {...state,title:$('chapterTitle').textContent,caseIndex:caseOpen?currentCase:-1,clip:v?.dataset.clip||null,time:v?.currentTime||0,paused:v?.paused??true,planeVisible:plane.classList.contains('visible')&&plane.style.visibility!=='hidden',brush:plane.classList.contains('brush-running')?{mode:brushMode,elapsed:performance.now()-brushStarted}:null};},
    command(c){if(c.action==='navigate')go(c.target);else if(c.action==='case-open'){blockedCase=-1;openCase(c.target,plane.querySelectorAll('.surface.project')[c.target]);}else if(c.action==='case-close')closeCase();else if(c.action==='sound')$('sound').click();else $(c.action)?.click();},
    async mirror(s){
      const changed=state.index!==s.index||state.token!==s.token;
      if(changed){closeCase(true);cancelBrushReveal();remoteBrush=null;}
      if(s.clip&&remoteClip!==s.clip){const reverse=s.clip.startsWith('reverse:'),n=Number(reverse?s.clip.slice(8):s.clip);await loaded(videos[0],n,reverse);remoteClip=s.clip;}
      Object.assign(state,{index:s.index,token:s.token,busy:s.busy,phase:s.phase,muted:s.muted,active:s.clip?0:-1});
      if(changed&&s.index>=0)buildText(s.index);
      const v=videos[0];videos.forEach((video,i)=>video.classList.toggle('active',!!s.clip&&i===0));
      if(s.clip){v.muted=true;v.onended=null;v.ontimeupdate=null;if(Math.abs(v.currentTime-s.time)>.25||s.paused&&Math.abs(v.currentTime-s.time)>.04)v.currentTime=s.time;if(s.paused)v.pause();else v.play().catch(()=>{});}
      $('welcome').hidden=s.index>=0||s.busy;plane.style.visibility=s.planeVisible?'':'hidden';plane.classList.toggle('visible',s.planeVisible);
      if(s.brush){const key=s.token+':'+s.brush.mode;if(remoteBrush!==key){remoteBrush=key;if(!brushTargets.length)prepareBrushReveal();startBrushReveal({erase:s.brush.mode==='erase',elapsed:s.brush.elapsed});}}
      else if(plane.classList.contains('brush-running')||brushTargets.some(el=>el.classList.contains('paint-pending'))){cancelBrushReveal();remoteBrush=null;}
      if(s.caseIndex>=0&&(!caseOpen||currentCase!==s.caseIndex)){closeCase(true);blockedCase=-1;openCase(s.caseIndex,plane.querySelectorAll('.surface.project')[s.caseIndex],true);}else if(s.caseIndex<0&&caseOpen)closeCase(true);
      $('chapterTitle').textContent=s.title;$('chapterNumber').textContent=s.index<0?'INTRO':String(s.index+1).padStart(2,'0');$('sound').querySelector('span').textContent=s.muted?'关':'开';controls();status(s.busy?'电脑正在运镜 / 刷字':'手机操作同步控制电脑');
    }
  };
})();

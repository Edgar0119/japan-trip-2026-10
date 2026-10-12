(() => {
  'use strict';
  const root = document.documentElement;
  const save = (key,value) => { try { localStorage.setItem('trip-2026-10-'+key,value); } catch {} };
  const themeButton = document.getElementById('themeToggle');
  const textButton = document.getElementById('textToggle');
  const updateThemeButton = () => {
    const dark = root.dataset.theme === 'dark';
    themeButton.textContent = dark ? '☀' : '☾';
    themeButton.setAttribute('aria-label',dark ? '切換淺色模式' : '切換深色模式');
    themeButton.setAttribute('aria-pressed',String(dark));
  };
  updateThemeButton();
  themeButton.addEventListener('click',() => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    save('theme',root.dataset.theme);updateThemeButton();
  });
  const scales = ['1','1.12','1.24'], labels = ['A','A+','A++'];
  const updateText = () => {
    const index = Math.max(0,scales.indexOf(root.dataset.scale || '1'));
    textButton.textContent = labels[index];
    textButton.setAttribute('aria-label','字體大小：'+['標準','加大','最大'][index]+'，點選切換');
  };
  updateText();
  textButton.addEventListener('click',() => {
    const index = (Math.max(0,scales.indexOf(root.dataset.scale || '1'))+1)%scales.length;
    root.dataset.scale=scales[index];root.style.setProperty('--scale',scales[index]);save('scale',scales[index]);updateText();
  });
  const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  document.querySelectorAll('[data-carousel]').forEach(car => {
    const track=car.querySelector('.carousel-track'),dots=[...car.querySelectorAll('.carousel-dot')];
    const counter=car.querySelector('[data-counter]');
    let index=0;
    const show=i => track.scrollTo({left:Math.max(0,Math.min(dots.length-1,i))*track.clientWidth,behavior:motion()});
    track.addEventListener('scroll',() => {
      index=Math.max(0,Math.min(dots.length-1,Math.round(track.scrollLeft/track.clientWidth)));
      dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));
      counter.textContent=`${index+1} / ${dots.length}`;
    },{passive:true});
    dots.forEach((dot,i)=>dot.addEventListener('click',()=>show(i)));
    car.querySelector('[data-prev]').addEventListener('click',()=>show((index-1+dots.length)%dots.length));
    car.querySelector('[data-next]').addEventListener('click',()=>show((index+1)%dots.length));
  });
  const map=document.querySelector('.kyushu-map'),expandMap=document.querySelector('.map-expand');
  if(map&&expandMap){
    const mapDialog=document.createElement('dialog');mapDialog.className='route-map-dialog';mapDialog.setAttribute('aria-label','放大九州行程路線圖');
    const hint=document.createElement('p');hint.textContent='可左右滑動 · 點地名開啟地圖';
    const close=document.createElement('button');close.type='button';close.className='lightbox-close';close.setAttribute('aria-label','關閉路線圖');close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const scroll=document.createElement('div');scroll.className='map-dialog-scroll';
    const copy=map.cloneNode(true);copy.querySelector('#map-arrow').id='map-arrow-expanded';copy.querySelectorAll('[marker-end]').forEach(path=>path.setAttribute('marker-end','url(#map-arrow-expanded)'));
    scroll.append(copy);mapDialog.append(hint,close,scroll);document.body.append(mapDialog);
    expandMap.addEventListener('click',e=>{e.preventDefault();mapDialog.showModal();document.body.style.overflow='hidden';});
    close.addEventListener('click',()=>mapDialog.close());
    mapDialog.addEventListener('click',e=>{if(e.target===mapDialog)mapDialog.close();});
    mapDialog.addEventListener('close',()=>{document.body.style.overflow='';expandMap.focus({preventScroll:true});});
    copy.querySelector('a[href="#route-mountain-stops"]').addEventListener('click',e=>{e.preventDefault();mapDialog.close();document.getElementById('route-mountain-stops').scrollIntoView({behavior:motion(),block:'center'});});
  }
  const dialog=document.getElementById('lightbox');
  if(dialog){
    const image=dialog.querySelector('img'),stage=dialog.querySelector('.lightbox-stage');
    const caption=dialog.querySelector('.lightbox-caption'),count=dialog.querySelector('[data-lightbox-count]');
    const nav=dialog.querySelector('.lightbox-nav'),hint=dialog.querySelector('.lightbox-swipe-hint');
    let group=[],index=0,opener,gesture=null,suppressClickUntil=0;
    const pointers=new Set();
    const resetDrag=()=>{gesture=null;image.style.transform='';image.style.opacity='';stage.classList.remove('is-dragging');};
    const zoomed=()=>Boolean(window.visualViewport&&window.visualViewport.scale>1.05);
    const syncZoom=()=>{stage.style.touchAction=zoomed()?'auto':'';if(zoomed())resetDrag();};
    window.visualViewport?.addEventListener('resize',syncZoom);
    const show=()=>{
      if(!group.length)return;
      syncZoom();
      resetDrag();
      const img=group[index].querySelector('img');
      image.src=img.src;image.alt=img.alt;caption.textContent=img.alt;
      count.textContent=`${index+1} / ${group.length}`;
      nav.hidden=hint.hidden=group.length<2;
    };
    document.querySelectorAll('button.photo').forEach(button=>button.addEventListener('click',()=>{
      opener=button;group=[...button.closest('.feature').querySelectorAll('button.photo')];
      index=group.indexOf(button);pointers.clear();suppressClickUntil=0;
      show();dialog.showModal();document.body.style.overflow='hidden';
    }));
    const move=delta=>{if(group.length<2)return;index=(index+delta+group.length)%group.length;show();};
    stage.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      pointers.add(e.pointerId);
      if(pointers.size!==1||!e.isPrimary||group.length<2||zoomed()){resetDrag();return;}
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY};
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove',e=>{
      if(!gesture||gesture.id!==e.pointerId)return;
      if(zoomed()){resetDrag();return;}
      const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){resetDrag();return;}
      if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.5){
        stage.classList.add('is-dragging');
        image.style.transform=`translateX(${Math.max(-80,Math.min(80,dx*.45))}px)`;
        image.style.opacity=String(Math.max(.65,1-Math.abs(dx)/700));
      }
    });
    stage.addEventListener('pointerup',e=>{
      pointers.delete(e.pointerId);
      if(!gesture||gesture.id!==e.pointerId)return;
      const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      const switchPhoto=!zoomed()&&Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.5;
      resetDrag();
      if(Math.max(Math.abs(dx),Math.abs(dy))>8)suppressClickUntil=performance.now()+400;
      if(switchPhoto)move(dx<0?1:-1);
    });
    const cancelPointer=e=>{pointers.delete(e.pointerId);resetDrag();};
    stage.addEventListener('pointercancel',cancelPointer);
    stage.addEventListener('lostpointercapture',cancelPointer);
    // A second finger anywhere in the dialog cancels photo navigation for this gesture.
    dialog.addEventListener('touchstart',e=>{if(e.touches.length>1)resetDrag();},{passive:true});
    stage.addEventListener('dragstart',e=>e.preventDefault());
    dialog.querySelector('[data-lightbox-prev]').addEventListener('click',()=>move(-1));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click',()=>move(1));
    dialog.querySelector('.lightbox-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{
      if(performance.now()<suppressClickUntil){e.preventDefault();return;}
      if(e.target===dialog)dialog.close();
    });
    dialog.addEventListener('close',()=>{resetDrag();pointers.clear();document.body.style.overflow='';opener?.focus({preventScroll:true});});
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}});
  }
  if('IntersectionObserver' in window){
    document.querySelectorAll('.day-header').forEach(header=>{
      const sentinel=document.createElement('span');sentinel.style.cssText='position:absolute;top:0;width:1px;height:1px;pointer-events:none';header.before(sentinel);
      new IntersectionObserver(entries=>header.classList.toggle('is-stuck',!entries[0].isIntersecting&&entries[0].boundingClientRect.top<0)).observe(sentinel);
    });
  }
})();

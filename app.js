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
  const dialog=document.getElementById('lightbox');
  if(dialog){
    const image=dialog.querySelector('img'),caption=dialog.querySelector('.lightbox-caption'),count=dialog.querySelector('[data-lightbox-count]');
    let group=[],index=0,opener;
    const show=()=>{const img=group[index].querySelector('img');image.src=img.src;image.alt=img.alt;caption.textContent=img.alt;count.textContent=`${index+1} / ${group.length}`;};
    document.querySelectorAll('button.photo').forEach(button=>button.addEventListener('click',()=>{
      opener=button;group=[...button.closest('.feature').querySelectorAll('button.photo')];index=group.indexOf(button);show();dialog.showModal();document.body.style.overflow='hidden';
    }));
    const move=delta=>{index=(index+delta+group.length)%group.length;show();};
    dialog.querySelector('[data-lightbox-prev]').addEventListener('click',()=>move(-1));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click',()=>move(1));
    dialog.querySelector('.lightbox-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{document.body.style.overflow='';opener?.focus({preventScroll:true});});
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}});
  }
  if('IntersectionObserver' in window){
    document.querySelectorAll('.day-header').forEach(header=>{
      const sentinel=document.createElement('span');sentinel.style.cssText='position:absolute;top:0;width:1px;height:1px;pointer-events:none';header.before(sentinel);
      new IntersectionObserver(entries=>header.classList.toggle('is-stuck',!entries[0].isIntersecting&&entries[0].boundingClientRect.top<0)).observe(sentinel);
    });
  }
})();

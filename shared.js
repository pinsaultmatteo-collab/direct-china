/* ============ DIRECT CHINA — comportements partagés ============ */
(function(){
  const header = document.getElementById('header');
  if(header){
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 30);
    window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  }
  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobileMenu');
  if(burger && menu){
    const toggle = (force) => {
      const open = force !== undefined ? force : !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', () => toggle());
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => toggle(false)));
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:.14, rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.rv').forEach(el => io.observe(el));
})();

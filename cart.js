/* ============================================================
   DIRECT CHINA — Panier global (toutes les pages)
   Auto-contenu : injecte ses styles + le tiroir, et lit le même
   localStorage ('dc_cart') que la page catalogue.
   Nécessite un bouton #cartBtn (+ #cartBadge) dans le header.
   ============================================================ */
(function(){
  if(window.__dcCart) return;            // évite une double initialisation
  window.__dcCart = true;
  const CUR={EUR:'€',USD:'$',GBP:'£',CNY:'¥'};
  const KEY='dc_cart';
  const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const money=(n,c)=>{const s=CUR[c]||'€',v=Number(n).toLocaleString('fr-FR');return (c==='USD'||c==='GBP')?s+v:v+' '+s;};
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||[];}catch(_){return[];}};
  const save=c=>{try{localStorage.setItem(KEY,JSON.stringify(c));}catch(_){}render();};
  const add=(it,q)=>{const c=load();const e=c.find(x=>x.id===it.id);if(e)e.qty+=q;else c.push({...it,qty:q});save(c);};
  const setQty=(id,q)=>{let c=load();const it=c.find(x=>x.id===id);if(!it)return;it.qty=q;if(it.qty<=0)c=c.filter(x=>x.id!==id);save(c);};
  const rm=id=>save(load().filter(x=>x.id!==id));

  const css=`
  .cart-btn,.member-btn{position:relative;width:42px;height:42px;border-radius:10px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--white);transition:border-color .2s,background .2s;flex:none}
  .cart-btn:hover,.member-btn:hover{border-color:var(--yellow);background:rgba(245,179,1,.08)}
  .cart-btn svg,.member-btn svg{width:20px;height:20px}
  .cart-badge{position:absolute;top:-7px;right:-7px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--yellow);color:var(--ink);font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center}
  .cart-badge.show{display:flex}
  .cart-ov{position:fixed;inset:0;background:rgba(7,12,22,.6);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .3s;z-index:200}
  .cart-ov.open{opacity:1;pointer-events:auto}
  .cart-drawer{position:fixed;top:0;right:0;height:100%;width:404px;max-width:92vw;background:var(--ink-2,#0F1A2E);border-left:1px solid var(--line);z-index:201;transform:translateX(100%);transition:transform .35s cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column}
  .cart-drawer.open{transform:none}
  .cart-head{display:flex;align-items:center;justify-content:space-between;padding:22px 24px;border-bottom:1px solid var(--line)}
  .cart-head h3{font-size:18px;font-weight:800}
  .cart-close{width:34px;height:34px;border-radius:8px;border:1px solid var(--line);font-size:17px;color:var(--steel);transition:background .2s;background:none;cursor:pointer}
  .cart-close:hover{background:rgba(255,255,255,.05);color:var(--white)}
  .cart-items{flex:1;overflow-y:auto;padding:8px 24px}
  .cart-empty{text-align:center;color:var(--steel);padding:60px 20px;font-size:14px}
  .cart-item{display:grid;grid-template-columns:60px 1fr auto;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}
  .ci-img{width:60px;height:60px;border-radius:8px;border:1px solid var(--line);background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center}
  .ci-img img{width:100%;height:100%;object-fit:contain;padding:5px}
  .ci-name{font-size:13.5px;font-weight:700;margin-bottom:3px;line-height:1.25;color:var(--white)}
  .ci-price{font-size:12px;color:var(--yellow)}
  .ci-qty{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:8px;margin-top:9px}
  .ci-qty button{width:26px;height:26px;font-size:15px;color:var(--steel);background:none;cursor:pointer}
  .ci-qty button:hover{color:var(--yellow)}
  .ci-qty span{min-width:28px;text-align:center;font-size:13px;font-weight:700;color:var(--white)}
  .ci-remove{font-size:11px;color:var(--steel-d);text-decoration:underline;margin-top:9px;display:inline-block;cursor:pointer}
  .ci-remove:hover{color:#E8867B}
  .ci-line{font-size:13.5px;font-weight:800;white-space:nowrap;color:var(--white)}
  .cart-foot{border-top:1px solid var(--line);padding:20px 24px;display:flex;flex-direction:column;gap:13px}
  .cart-sub{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;color:var(--steel)}
  .cart-sub b{font-size:23px;font-weight:900;color:var(--white)}
  .cart-note{font-size:11.5px;color:var(--steel-d);text-align:center;line-height:1.5}
  @media(max-width:480px){.cart-drawer{width:100%}}
  `;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  const wrap=document.createElement('div');
  wrap.innerHTML='<div class="cart-ov" id="cartOv"></div><aside class="cart-drawer" id="cartDrawer" aria-label="Panier"><div class="cart-head"><h3>Votre panier</h3><button class="cart-close" id="cartClose" aria-label="Fermer">✕</button></div><div class="cart-items" id="cartItems"></div><div class="cart-foot" id="cartFoot"></div></aside>';
  document.body.appendChild(wrap);

  const ov=document.getElementById('cartOv'), dr=document.getElementById('cartDrawer');
  const open=()=>{ov.classList.add('open');dr.classList.add('open');document.body.style.overflow='hidden';};
  const close=()=>{ov.classList.remove('open');dr.classList.remove('open');document.body.style.overflow='';};

  function render(){
    const c=load(), n=c.reduce((s,i)=>s+i.qty,0);
    const badge=document.getElementById('cartBadge'); if(badge){badge.textContent=n;badge.classList.toggle('show',n>0);}
    const items=document.getElementById('cartItems'), foot=document.getElementById('cartFoot');
    if(!items||!foot) return;
    if(!c.length){items.innerHTML='<div class="cart-empty">Votre panier est vide.</div>';foot.innerHTML='';return;}
    items.innerHTML=c.map(i=>'<div class="cart-item" data-id="'+i.id+'"><div class="ci-img">'+(i.image?'<img src="'+i.image+'" alt="">':'')+'</div><div><div class="ci-name">'+esc(i.n)+'</div><div class="ci-price">'+money(i.price,i.currency)+' / u.</div><div class="ci-qty"><button type="button" data-act="dec" aria-label="Moins">−</button><span>'+i.qty+'</span><button type="button" data-act="inc" aria-label="Plus">+</button></div><span class="ci-remove" data-act="rm">Retirer</span></div><div class="ci-line">'+money(i.price*i.qty,i.currency)+'</div></div>').join('');
    const cur=c[0].currency, sub=c.reduce((s,i)=>s+i.price*i.qty,0);
    const lines=c.map(i=>'- '+i.qty+' x '+i.n+' ('+money(i.price,i.currency)+')').join('%0D%0A');
    const body='Bonjour,%0D%0A%0D%0AJe souhaite un devis pour ce panier :%0D%0A'+lines+'%0D%0A%0D%0ASous-total indicatif : '+money(sub,cur)+'%0D%0A%0D%0AMerci.';
    foot.innerHTML='<div class="cart-sub"><span>Sous-total</span><b>'+money(sub,cur)+'</b></div><a class="btn btn-primary" style="justify-content:center" href="mailto:contact@direct-china.fr?subject=Devis%20panier&body='+body+'">Demander un devis pour ce panier</a><div class="cart-note">Paiement sécurisé · Acompte 50 % à la commande, solde avant livraison · Livré dédouané en France.</div>';
  }

  const btn=document.getElementById('cartBtn'); if(btn) btn.addEventListener('click',open);
  document.getElementById('cartClose').addEventListener('click',close);
  ov.addEventListener('click',close);
  document.getElementById('cartItems').addEventListener('click',e=>{
    const it=e.target.closest('.cart-item'); if(!it)return; const id=it.dataset.id, act=e.target.dataset.act;
    if(!act)return; const cur=load().find(x=>x.id===id), q=cur?cur.qty:0;
    if(act==='inc')setQty(id,q+1); else if(act==='dec')setQty(id,q-1); else if(act==='rm')rm(id);
  });
  render();

  window.cartAdd=add; window.openCart=open; window.closeCart=close; window.cartRender=render;
})();

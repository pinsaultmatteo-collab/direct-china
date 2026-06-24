#!/usr/bin/env node
/* ============================================================
   DIRECT CHINA — Générateur de pages SEO
   ------------------------------------------------------------
   Lit les produits PUBLIÉS + catégories dans Supabase, puis
   fabrique une vraie page HTML statique par produit et par
   catégorie (titre + meta + contenu visible + JSON-LD), plus
   sitemap.xml et robots.txt.

   • Au build Vercel : lancé automatiquement (voir vercel.json).
   • En local      : `npm run build` (ou `node scripts/build-pages.js`).
   • Test sans base : `MOCK=1 node scripts/build-pages.js`.

   La config (URL + clé anon publique) est lue dans supabase-config.js,
   ou via les variables d'env SUPABASE_URL / SUPABASE_ANON.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SITE = (process.env.SITE_URL || 'https://direct-china.fr').replace(/\/$/, '');
const OUT_PRODUITS = path.join(ROOT, 'produit');
const OUT_CATS = path.join(ROOT, 'categorie');

/* ---------- config Supabase ---------- */
function readConfig() {
  let url = process.env.SUPABASE_URL || '';
  let anon = process.env.SUPABASE_ANON || '';
  try {
    const cfg = fs.readFileSync(path.join(ROOT, 'supabase-config.js'), 'utf8');
    if (!url) { const m = cfg.match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/); if (m) url = m[1]; }
    if (!anon) { const m = cfg.match(/SUPABASE_ANON\s*=\s*["']([^"']+)["']/); if (m) anon = m[1]; }
  } catch (_) {}
  return { url: (url || '').replace(/\/$/, ''), anon: anon || '' };
}

/* ---------- helpers ---------- */
const CUR = { EUR: '€', USD: '$', GBP: '£', CNY: '¥' };
const ISO = { EUR: 'EUR', USD: 'USD', GBP: 'GBP', CNY: 'CNY' };

function esc(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function attr(s) { return esc(s); }
function slugify(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/['’]/g, ' ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'produit';
}
function strongify(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function stripMd(s) { return (s || '').replace(/\*\*(.+?)\*\*/g, '$1'); }
function descHtml(d) {
  if (!d) return '<p>Fiche technique complète et devis sur demande. Contactez-nous pour les spécifications détaillées.</p>';
  return d.split(/\n{1,}/).filter(x => x.trim()).map(x => `<p>${strongify(x.trim())}</p>`).join('');
}
function hasFixed(p) { return p.price_mode === 'fixed' && p.price != null && p.price !== '' && isFinite(Number(p.price)); }
function fmtPrice(p) {
  const lbl = (p.price_label || '').trim();
  if (lbl && !/^[€$£¥\s]+$/.test(lbl)) return esc(lbl);
  if (hasFixed(p)) {
    const s = CUR[p.currency] || '€', n = Number(p.price).toLocaleString('fr-FR');
    return (p.currency === 'USD' || p.currency === 'GBP') ? s + n : n + ' ' + s;
  }
  return 'Sur devis';
}
function metaDesc(p) {
  const base = stripMd(p.summary || (p.description || '').split('\n')[0] || p.title || '');
  const tail = ' Import direct usine, prix fabricant, livraison dédouanée en France. Devis sous 24 h.';
  let d = (base + (base.endsWith('.') ? '' : '.') + tail).replace(/\s+/g, ' ').trim();
  if (d.length > 158) d = d.slice(0, 155).replace(/\s+\S*$/, '') + '…';
  return d;
}

/* ---------- briques HTML communes ---------- */
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,300..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;
const LOGO = `<svg class="logo-mark" viewBox="0 0 40 40" fill="none"><rect x="3" y="12" width="34" height="20" rx="2.5" stroke="#F5B301" stroke-width="2.4"/><line x1="10" y1="12" x2="10" y2="32" stroke="#F5B301" stroke-width="2"/><line x1="17" y1="12" x2="17" y2="32" stroke="#F5B301" stroke-width="2"/><line x1="24" y1="12" x2="24" y2="32" stroke="#F5B301" stroke-width="2"/><line x1="31" y1="12" x2="31" y2="32" stroke="#F5B301" stroke-width="2"/><path d="M6 8 L20 2 L34 8" stroke="#FAFBFD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>DIRECT<em>CHINA</em></span>`;
const MEMBER_SVG = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.7"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const CART_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L21 8H6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="20" r="1.4" fill="currentColor"/><circle cx="18" cy="20" r="1.4" fill="currentColor"/></svg>`;
const ORG_LD = JSON.stringify({
  "@context": "https://schema.org", "@type": "Organization",
  "name": "Direct China", "url": SITE,
  "logo": SITE + "/logo-512.png", "image": SITE + "/og-image.png",
  "description": "Import de matériel industriel en direct des usines chinoises : prix fabricant, import géré de A à Z, livraison dédouanée en France.",
  "email": "contact@direct-china.fr",
  "areaServed": { "@type": "Country", "name": "France" },
  "address": { "@type": "PostalAddress", "addressCountry": "FR" },
  "contactPoint": { "@type": "ContactPoint", "email": "contact@direct-china.fr", "contactType": "sales", "areaServed": "FR", "availableLanguage": "French" }
});

function header(prefix) {
  // prefix : '../../' depuis produit/<slug>/ ou categorie/<slug>/
  return `<header id="header">
  <div class="wrap nav">
    <a href="${prefix}index.html" class="logo">${LOGO}</a>
    <nav class="nav-links"><a href="${prefix}catalogue.html">Catalogue</a><a href="${prefix}comment-ca-marche.html">Comment ça marche</a><a href="${prefix}qui-sommes-nous.html">Qui sommes-nous</a><a href="${prefix}blog.html">Blog &amp; conseils</a><a href="${prefix}faq.html">FAQ</a></nav>
    <div class="nav-actions"><a href="mailto:contact@direct-china.fr" class="nav-cta">Demander un devis</a>
    <a class="member-btn" href="${prefix}espace-client.html" aria-label="Espace client" title="Espace client">${MEMBER_SVG}</a>
    <button class="cart-btn" id="cartBtn" aria-label="Panier">${CART_SVG}<span class="cart-badge" id="cartBadge">0</span></button>
    <button class="burger" id="burger" aria-label="Ouvrir le menu" aria-expanded="false"><span></span><span></span><span></span></button></div>
  </div>
</header>
<div class="mobile-menu" id="mobileMenu"><a href="${prefix}catalogue.html">Catalogue</a><a href="${prefix}comment-ca-marche.html">Comment ça marche</a><a href="${prefix}qui-sommes-nous.html">Qui sommes-nous</a><a href="${prefix}blog.html">Blog &amp; conseils</a><a href="${prefix}faq.html">FAQ</a><a href="${prefix}espace-client.html"><em>Espace client</em></a></div>`;
}

function footer(prefix, cats) {
  const catLinks = cats.slice(0, 5).map(c => `<li><a href="${prefix}categorie/${c.id}/">${esc(c.name)}</a></li>`).join('');
  return `<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div><a href="${prefix}index.html" class="logo">${LOGO}</a><p>Import de matériel industriel en direct des usines chinoises. Prix fabricant, import géré de A à Z, livraison partout en France.</p></div>
      <div><h4>Catalogue</h4><ul>${catLinks}</ul></div>
      <div><h4>Direct China</h4><ul><li><a href="${prefix}comment-ca-marche.html">Comment ça marche</a></li><li><a href="${prefix}qui-sommes-nous.html">Qui sommes-nous</a></li><li><a href="${prefix}blog.html">Blog &amp; conseils</a></li><li><a href="${prefix}faq.html">FAQ</a></li></ul></div>
      <div><h4>Contact</h4><ul><li><a href="mailto:contact@direct-china.fr">contact@direct-china.fr</a></li><li><a href="${prefix}espace-client.html">Espace client</a></li><li><a href="${prefix}catalogue.html">Tout le catalogue</a></li></ul></div>
    </div>
    <div class="foot-bottom"><span>© 2026 DIRECT CHINA — TOUS DROITS RÉSERVÉS</span><span>TOULOUSE, FRANCE · 43.60°N 1.44°E</span></div>
  </div>
</footer>`;
}

const PAGE_CSS = `
  body.dcpage{background:var(--white);color:var(--ink)}
  body.dcpage #header{background:rgba(11,18,32,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
  body.dcpage #header .logo span{color:var(--white)}
  body.dcpage #header .nav-links a{color:var(--steel)}
  body.dcpage #header .nav-links a:hover{color:var(--white)}
  .pwrap{max-width:1180px;margin:0 auto;padding:118px 24px 40px}
  .pcrumbs{font-family:var(--font-m);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--steel-d);margin-bottom:26px}
  .pcrumbs a{color:var(--steel-d)}.pcrumbs a:hover{color:var(--yellow-d)}.pcrumbs span{margin:0 7px}
  .pgrid{display:grid;grid-template-columns:1.05fr .95fr;gap:46px;align-items:start}
  @media(max-width:880px){.pgrid{grid-template-columns:1fr;gap:30px}}
  .pgal-main{border:1px solid var(--line-light);border-radius:16px;overflow:hidden;background:linear-gradient(160deg,#E4E9F0,#F3F5F8);min-height:300px;display:flex;align-items:center;justify-content:center;position:relative}
  .pgal-main img{width:100%;height:auto;max-height:78vh;object-fit:contain;display:block}
  .pgal-ph{width:90px;height:90px;color:var(--yellow-d);opacity:.8}
  .pgal-thumbs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  .pgal-thumbs button{width:70px;height:70px;border:1px solid var(--line-light);border-radius:9px;overflow:hidden;background:#fff;padding:4px;cursor:pointer;transition:border-color .2s}
  .pgal-thumbs button.on{border-color:var(--yellow-d)}
  .pgal-thumbs img{width:100%;height:100%;object-fit:contain}
  .peyebrow{font-family:var(--font-m);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--yellow-d);margin-bottom:14px}
  .pinfo h1{font-size:clamp(26px,3.4vw,38px);line-height:1.1;font-variation-settings:'wght' 820,'wdth' 104;letter-spacing:-.01em;color:var(--ink)}
  .psum{font-size:17px;color:var(--steel-d);margin:14px 0 22px;line-height:1.5}
  .pprice-row{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding:18px 0;border-top:1px solid var(--line-light);border-bottom:1px solid var(--line-light)}
  .pprice{font-family:var(--font-m);font-size:30px;font-weight:700;color:var(--ink)}
  .pstock{font-family:var(--font-m);font-size:12px;padding:5px 10px;border-radius:7px}
  .pstock.in{background:rgba(63,178,127,.14);color:#2E9466;border:1px solid rgba(63,178,127,.3)}
  .pstock.out{background:rgba(140,153,173,.12);color:var(--steel-d);border:1px solid var(--line-light)}
  .pbuy{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:22px 0 14px}
  .pqty{display:inline-flex;align-items:center;border:1px solid var(--line-light);border-radius:11px;overflow:hidden}
  .pqty button{width:44px;height:50px;font-size:20px;font-weight:700;color:var(--ink);background:none;cursor:pointer}
  .pqty button:hover{background:rgba(245,179,1,.16)}
  .pqty input{width:52px;height:50px;text-align:center;border:none;border-left:1px solid var(--line-light);border-right:1px solid var(--line-light);background:transparent;color:var(--ink);font-weight:700;font-size:16px;-moz-appearance:textfield}
  .pqty input::-webkit-outer-spin-button,.pqty input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .pqty input:focus{outline:none}
  .pbuy .btn{height:50px}
  .pcta2{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .psecure{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--steel-d);line-height:1.45}
  .psecure svg{width:18px;height:18px;color:var(--blue);flex:none;margin-top:1px}
  .psecure b{color:var(--ink)}
  .pmeta{display:flex;gap:26px;flex-wrap:wrap;margin-top:24px;font-family:var(--font-m);font-size:12px;color:var(--steel-d)}
  .pmeta b{display:block;color:var(--ink);font-family:var(--font-d);font-size:14px;font-weight:700;margin-top:3px}
  .pdesc{margin-top:44px;max-width:760px}
  .pdesc h2{font-size:22px;margin-bottom:14px;color:var(--ink)}
  .pdesc p{font-size:15.5px;line-height:1.72;color:#3D4A5E;margin-bottom:14px}
  .pdesc strong{color:var(--ink);font-weight:700}
  .padv{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:46px;padding-top:42px;border-top:1px solid var(--line-light)}
  @media(max-width:680px){.padv{grid-template-columns:1fr 1fr}}
  .padv .adv svg{width:26px;height:26px;color:var(--yellow-d);margin-bottom:11px}
  .padv .adv b{display:block;font-size:14.5px;font-weight:800;margin-bottom:5px;color:var(--ink)}
  .padv .adv p{font-size:12.5px;color:var(--steel-d);line-height:1.5}
  .prelated{margin-top:60px}
  .prelated h2{font-size:22px;margin-bottom:6px;color:var(--ink)}
  .prelated .sub{font-size:14px;color:var(--steel-d);margin-bottom:24px}
  .pcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
  .pcard{border:1px solid var(--line-light);border-radius:14px;overflow:hidden;background:var(--white);transition:transform .25s,box-shadow .25s;display:flex;flex-direction:column}
  .pcard:hover{transform:translateY(-4px);box-shadow:0 22px 44px -26px rgba(11,18,32,.3)}
  .pcard-img{aspect-ratio:1/1;background:linear-gradient(160deg,#E4E9F0,#F3F5F8);display:flex;align-items:center;justify-content:center;overflow:hidden;border-bottom:1px solid var(--line-light)}
  .pcard-img img{width:100%;height:100%;object-fit:contain;padding:14px}
  .pcard-img .pgal-ph{width:48px;height:48px}
  .pcard-body{padding:18px;display:flex;flex-direction:column;gap:8px;flex:1}
  .pcard-body h3{font-size:16px;font-weight:800;color:var(--ink);line-height:1.25}
  .pcard-body .spec{font-size:13px;color:var(--steel-d);flex:1}
  .pcard-foot{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
  .pcard-price{font-family:var(--font-m);font-size:13px;color:var(--yellow-d);font-weight:600}
  .pcard-cta{font-family:var(--font-m);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);border:1px solid var(--line-light);padding:8px 12px;border-radius:8px;transition:background .2s}
  .pcard:hover .pcard-cta{background:var(--ink);color:var(--white)}
  .pcat-hero{padding-top:140px}
  .pcat-hero .lead{max-width:680px}
  .pcat-grid{margin-top:48px}
`;

const ADV_HTML = `<div class="padv">
  <div class="adv"><svg viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9-9 9-9-9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><b>Prix direct usine</b><p>Jusqu'à −40 % vs le circuit France classique.</p></div>
  <div class="adv"><svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 7v10l9 4 9-4V7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 11v10" stroke="currentColor" stroke-width="1.6"/></svg><b>Import géré de A à Z</b><p>Production, fret maritime, douane et livraison.</p></div>
  <div class="adv"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><b>Contrôle qualité</b><p>Inspection en usine avant expédition.</p></div>
  <div class="adv"><svg viewBox="0 0 24 24" fill="none"><path d="M2 17h13l3-5h-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17V7h9v10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7" cy="20" r="1.7" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="20" r="1.7" stroke="currentColor" stroke-width="1.6"/></svg><b>Livré dédouané</b><p>DDP, partout en France. Aucune surprise.</p></div>
</div>`;

const PH_SVG = `<svg class="pgal-ph" viewBox="0 0 24 24" fill="none"><path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="2.5" y="4.5" width="19" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="9" r="1.4" fill="currentColor"/></svg>`;

/* ---------- page produit ---------- */
function productPage(p, cat, related, cats) {
  const prefix = '../../';
  const url = `${SITE}/produit/${p._slug}`;
  const imgs = Array.isArray(p.images) ? p.images : [];
  const priced = hasFixed(p);
  const priceTxt = fmtPrice(p);
  const title = `${stripMd(p.title)} — Import direct usine | Direct China`;
  const desc = metaDesc(p);
  const catName = cat ? cat.name : 'Catalogue';
  const ogImg = imgs[0] || `${SITE}/og-image.png`;

  const gallery = imgs.length
    ? `<div class="pgal-main"><img id="pmain" src="${attr(imgs[0])}" alt="${attr(stripMd(p.title))} — photo 1"></div>`
      + (imgs.length > 1 ? `<div class="pgal-thumbs">${imgs.map((u, i) => `<button class="${i === 0 ? 'on' : ''}" data-src="${attr(u)}" aria-label="Photo ${i + 1}"><img src="${attr(u)}" alt="${attr(stripMd(p.title))} — vignette ${i + 1}" loading="lazy"></button>`).join('')}</div>` : '')
    : `<div class="pgal-main">${PH_SVG}</div>`;

  const stock = (p.stock != null) ? (p.stock > 0
    ? `<span class="pstock in">${p.stock} en stock</span>`
    : `<span class="pstock out">Sur commande</span>`) : '';

  const buy = priced
    ? `<div class="pbuy">
        <div class="pqty"><button type="button" id="qMinus" aria-label="Diminuer">−</button><input id="qInput" type="number" min="1" value="1" inputmode="numeric"><button type="button" id="qPlus" aria-label="Augmenter">+</button></div>
        <button class="btn btn-primary" id="addCart" style="flex:1;min-width:170px;justify-content:center">Ajouter au panier</button>
      </div>
      <div class="pcta2"><a class="btn btn-ghost" href="mailto:contact@direct-china.fr?subject=${encodeURIComponent('Devis — ' + stripMd(p.title))}">Demander un devis</a></div>`
    : `<div class="pcta2" style="margin-top:22px"><a class="btn btn-primary" href="mailto:contact@direct-china.fr?subject=${encodeURIComponent('Devis — ' + stripMd(p.title))}">Demander un devis<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>`;

  const relatedHtml = related.length ? `<div class="prelated">
      <h2>Nos autres produits</h2>
      <p class="sub">Dans la catégorie ${esc(catName)}</p>
      <div class="pcards">${related.map(o => cardHtml(o, prefix)).join('')}</div>
    </div>` : '';

  // JSON-LD
  const ld = {
    "@context": "https://schema.org", "@type": "Product",
    "name": stripMd(p.title),
    "description": stripMd(p.summary || p.description || ''),
    "image": imgs.length ? imgs : undefined,
    "category": catName,
    "brand": { "@type": "Brand", "name": "Direct China" },
    "url": url
  };
  if (priced) {
    ld.offers = {
      "@type": "Offer", "url": url,
      "priceCurrency": ISO[p.currency] || 'EUR',
      "price": Number(p.price),
      "availability": (p.stock != null && p.stock <= 0) ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
      "seller": { "@type": "Organization", "name": "Direct China" }
    };
  }
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/" },
      { "@type": "ListItem", "position": 2, "name": "Catalogue", "item": SITE + "/catalogue" },
      { "@type": "ListItem", "position": 3, "name": catName, "item": cat ? `${SITE}/categorie/${cat.id}` : SITE + "/catalogue" },
      { "@type": "ListItem", "position": 4, "name": stripMd(p.title), "item": url }
    ]
  };
  const pdata = JSON.stringify({ id: p.id, n: stripMd(p.title), price: priced ? Number(p.price) : null, currency: p.currency || 'EUR', image: imgs[0] || '' });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:title" content="${attr(stripMd(p.title))}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${attr(ogImg)}">
<meta property="og:site_name" content="Direct China">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg">
${FONTS}
<link rel="stylesheet" href="${prefix}styles.css">
<style>${PAGE_CSS}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
<script type="application/ld+json" data-dc="org">${ORG_LD}</script>
</head>
<body class="dcpage">
${header(prefix)}
<main class="pwrap">
  <nav class="pcrumbs"><a href="${prefix}index.html">Accueil</a><span>/</span><a href="${prefix}catalogue.html">Catalogue</a><span>/</span><a href="${prefix}categorie/${cat ? cat.id : ''}/">${esc(catName)}</a><span>/</span>${esc(stripMd(p.title))}</nav>
  <div class="pgrid">
    <div>${gallery}</div>
    <div class="pinfo">
      <div class="peyebrow">${esc(catName)} · Direct usine</div>
      <h1>${esc(stripMd(p.title))}</h1>
      ${p.summary ? `<p class="psum">${esc(stripMd(p.summary))}</p>` : ''}
      <div class="pprice-row"><span class="pprice">${priceTxt}</span>${stock}</div>
      ${buy}
      <div class="psecure"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span><b>Paiement sécurisé.</b> Acompte 50 % à la commande, solde avant livraison · données chiffrées.</span></div>
      <div class="pmeta"><div>Catégorie<b>${esc(catName)}</b></div><div>Import<b>Direct usine · DDP France</b></div><div>Paiement<b>50 % / 50 %</b></div></div>
    </div>
  </div>
  <div class="pdesc"><h2>Description</h2>${descHtml(p.description)}</div>
  ${ADV_HTML}
  ${relatedHtml}
</main>
${footer(prefix, cats)}
<script type="application/json" id="pdata">${pdata}</script>
<script src="${prefix}shared.js"></script>
<script src="${prefix}cart.js"></script>
<script>
(function(){
  var thumbs=document.querySelectorAll('.pgal-thumbs button'), main=document.getElementById('pmain');
  thumbs.forEach(function(b){b.addEventListener('click',function(){if(main)main.src=b.getAttribute('data-src');thumbs.forEach(function(t){t.classList.remove('on');});b.classList.add('on');});});
  var p={}; try{p=JSON.parse(document.getElementById('pdata').textContent);}catch(e){}
  var add=document.getElementById('addCart'), qi=document.getElementById('qInput');
  function q(){return Math.max(1,parseInt(qi&&qi.value,10)||1);}
  var minus=document.getElementById('qMinus'), plus=document.getElementById('qPlus');
  if(minus)minus.addEventListener('click',function(){qi.value=Math.max(1,q()-1);});
  if(plus)plus.addEventListener('click',function(){qi.value=q()+1;});
  if(qi)qi.addEventListener('change',function(){qi.value=q();});
  if(add)add.addEventListener('click',function(){
    if(window.cartAdd){window.cartAdd({id:p.id,n:p.n,price:p.price,currency:p.currency,image:p.image},q());window.openCart&&window.openCart();}
  });
})();
</script>
</body>
</html>`;
}

/* ---------- carte produit (réutilisée catégorie + liés) ---------- */
function cardHtml(p, prefix) {
  const imgs = Array.isArray(p.images) ? p.images : [];
  const media = imgs.length
    ? `<img src="${attr(imgs[0])}" alt="${attr(stripMd(p.title))}" loading="lazy">`
    : PH_SVG;
  return `<a class="pcard" href="${prefix}produit/${p._slug}/">
    <div class="pcard-img">${media}</div>
    <div class="pcard-body">
      <h3>${esc(stripMd(p.title))}</h3>
      <p class="spec">${esc(stripMd(p.summary || ''))}</p>
      <div class="pcard-foot"><span class="pcard-price">${fmtPrice(p)}</span><span class="pcard-cta">Voir</span></div>
    </div>
  </a>`;
}

/* ---------- page catégorie ---------- */
function categoryPage(cat, prods, cats) {
  const prefix = '../../';
  const url = `${SITE}/categorie/${cat.id}`;
  const title = `${stripMd(cat.name)} — Import direct de Chine au prix usine | Direct China`;
  const intro = stripMd(cat.intro || cat.blurb || '');
  let desc = (intro || `${cat.name} importé en direct des usines chinoises.`) + ' Prix fabricant, import géré de A à Z, livraison dédouanée en France. Devis sous 24 h.';
  desc = desc.replace(/\s+/g, ' ').trim();
  if (desc.length > 158) desc = desc.slice(0, 155).replace(/\s+\S*$/, '') + '…';

  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/" },
      { "@type": "ListItem", "position": 2, "name": "Catalogue", "item": SITE + "/catalogue" },
      { "@type": "ListItem", "position": 3, "name": stripMd(cat.name), "item": url }
    ]
  };
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList",
    "itemListElement": prods.map((p, i) => ({ "@type": "ListItem", "position": i + 1, "url": `${SITE}/produit/${p._slug}`, "name": stripMd(p.title) }))
  };

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${attr(stripMd(cat.name))} — Direct China">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:site_name" content="Direct China">
<link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg">
${FONTS}
<link rel="stylesheet" href="${prefix}styles.css">
<style>${PAGE_CSS}</style>
<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
<script type="application/ld+json" data-dc="org">${ORG_LD}</script>
<script type="application/ld+json">${JSON.stringify(itemList)}</script>
</head>
<body class="dcpage">
${header(prefix)}
<main class="pwrap pcat-hero">
  <nav class="pcrumbs"><a href="${prefix}index.html">Accueil</a><span>/</span><a href="${prefix}catalogue.html">Catalogue</a><span>/</span>${esc(stripMd(cat.name))}</nav>
  <div class="peyebrow">${cat.num ? esc(cat.num) + ' · ' : ''}Catégorie</div>
  <h1 style="font-size:clamp(30px,4.4vw,50px);line-height:1.05;font-variation-settings:'wght' 850,'wdth' 106;letter-spacing:-.02em;max-width:760px">${esc(stripMd(cat.name))}</h1>
  ${intro ? `<p class="lead" style="color:var(--steel-d);margin-top:18px">${esc(intro)}</p>` : ''}
  <div class="pcat-grid"><div class="pcards">${prods.length ? prods.map(p => cardHtml(p, prefix)).join('') : '<p style="color:var(--steel-d)">Produits bientôt disponibles dans cette catégorie.</p>'}</div></div>
</main>
${footer(prefix, cats)}
<script src="${prefix}shared.js"></script>
<script src="${prefix}cart.js"></script>
</body>
</html>`;
}

/* ---------- sitemap + robots ---------- */
function buildSitemap(prods, cats) {
  const today = new Date().toISOString().slice(0, 10);
  const statics = ['', 'catalogue', 'comment-ca-marche', 'qui-sommes-nous', 'faq', 'blog', 'blog-acheter-materiel-chine', 'espace-client'];
  const urls = [];
  const add = (loc, pr, freq) => urls.push(`  <url><loc>${SITE}/${loc}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${pr}</priority></url>`);
  add('', '1.0', 'weekly');
  statics.slice(1).forEach(s => add(s, s === 'catalogue' ? '0.9' : '0.6', 'monthly'));
  cats.forEach(c => add(`categorie/${c.id}`, '0.8', 'weekly'));
  prods.forEach(p => add(`produit/${p._slug}`, '0.7', 'weekly'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
function buildRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

/* ---------- données mock (test sans base) ---------- */
function mockData() {
  const cats = [
    { id: 'levage', name: 'Levage & élévation', num: '02', blurb: 'Nacelles, gerbeurs, transpalettes.', intro: 'Tout l\'équipement de levage et d\'élévation importé en direct d\'usine : nacelles araignée, gerbeurs électriques, transpalettes.', sort_order: 1 },
    { id: 'precision', name: 'Soudage laser & cryogénie', num: '03', blurb: 'Soudage laser, nettoyage cryogénique.', intro: 'Machines de précision : postes de soudage laser et stations de nettoyage cryogénique.', sort_order: 2 }
  ];
  const prods = [
    { id: 'a1', category_id: 'levage', title: 'Gerbeur semi-électrique 1 500 kg — levée 3 m', slug: '', summary: 'Levage électrique jusqu\'à 3 m pour 1,5 T, traction manuelle, pour entrepôts à encombrement réduit', description: 'Le **gerbeur semi-électrique** soulève jusqu\'à **1 500 kg** à **3 mètres** de hauteur.\n\nIdéal pour les **entrepôts à encombrement réduit**, il combine montée électrique et traction manuelle.', price_mode: 'fixed', price: 1490, currency: 'EUR', price_label: '', stock: 9, images: ['https://example.com/gerbeur.jpg'], status: 'published', sort_order: 1 },
    { id: 'a2', category_id: 'levage', title: 'Mini-nacelle araignée 12 m', slug: '', summary: 'Nacelle compacte 12 m, passe les portes standard, stabilisateurs hydrauliques', description: 'Nacelle **araignée 12 m** ultra-compacte.', price_mode: 'quote', price: null, currency: 'EUR', price_label: 'Sur devis', stock: null, images: [], status: 'published', sort_order: 2 },
    { id: 'b1', category_id: 'precision', title: 'Station de nettoyage cryogénique', slug: '', summary: 'Décapage à la glace carbonique, sans eau ni solvant. Idéal moules, soudures, industrie.', description: 'Décapage **CO2** sans eau ni solvant.', price_mode: 'fixed', price: 8900, currency: 'EUR', price_label: '', stock: 2, images: ['https://example.com/cryo.jpg'], status: 'published', sort_order: 1 }
  ];
  return { prods, cats };
}

/* ---------- main ---------- */
async function main() {
  let data;
  if (process.env.MOCK === '1') {
    console.log('• Mode MOCK (données de test).');
    data = mockData();
  } else {
    const { url, anon } = readConfig();
    if (!url || /VOTRE-PROJET/.test(url) || !anon || /VOTRE_CLE/.test(anon)) {
      console.warn('⚠  Config Supabase absente/placeholder — génération ignorée (le site se déploie quand même).');
      return;
    }
    try {
      const h = { apikey: anon, Authorization: 'Bearer ' + anon };
      const [prods, cats] = await Promise.all([
        fetch(`${url}/rest/v1/products?status=eq.published&select=*&order=sort_order.asc`, { headers: h }).then(r => r.json()),
        fetch(`${url}/rest/v1/categories?select=*&order=sort_order.asc`, { headers: h }).then(r => r.json())
      ]);
      if (!Array.isArray(prods) || !Array.isArray(cats)) throw new Error('Réponse Supabase inattendue');
      data = { prods, cats };
    } catch (e) {
      console.warn('⚠  Échec de lecture Supabase — génération ignorée. (' + e.message + ')');
      return;
    }
  }

  const { prods, cats } = data;
  // slugs uniques
  const used = new Set();
  prods.forEach(p => {
    let base = (p.slug && p.slug.trim()) ? slugify(p.slug) : slugify(p.title);
    let s = base, n = 2;
    while (used.has(s)) { s = base + '-' + n; n++; }
    used.add(s); p._slug = s;
  });
  const byCat = {};
  prods.forEach(p => { (byCat[p.category_id] = byCat[p.category_id] || []).push(p); });

  // écriture
  fs.mkdirSync(OUT_PRODUITS, { recursive: true });
  fs.mkdirSync(OUT_CATS, { recursive: true });

  let nP = 0, nC = 0;
  prods.forEach(p => {
    const cat = cats.find(c => c.id === p.category_id) || null;
    const related = (byCat[p.category_id] || []).filter(o => o.id !== p.id).slice(0, 4);
    const dir = path.join(OUT_PRODUITS, p._slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), productPage(p, cat, related, cats));
    nP++;
  });
  cats.forEach(c => {
    const list = byCat[c.id] || [];
    const dir = path.join(OUT_CATS, c.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), categoryPage(c, list, cats));
    nC++;
  });
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(prods, cats));
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), buildRobots());

  console.log(`✓ ${nP} page(s) produit, ${nC} page(s) catégorie, sitemap.xml + robots.txt générés.`);
}

main().catch(e => { console.warn('⚠  Erreur génération (ignorée) :', e.message); process.exit(0); });

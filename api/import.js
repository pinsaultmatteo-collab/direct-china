// ============================================================
//  /api/import  —  Pré-remplissage depuis une fiche Alibaba
//  Fonction serverless Vercel (Node, CommonJS, sans dépendance).
//  Récupère titre + photos + prix usine côté serveur (évite le CORS),
//  puis ré-héberge les images dans Supabase Storage.
//
//  Variables d'environnement à définir sur Vercel :
//    SUPABASE_URL           = https://VOTRE-PROJET.supabase.co
//    SUPABASE_SERVICE_ROLE  = clé service_role (Settings → API)  [SECRET, jamais côté client]
// ============================================================
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const { url, productId } = body || {};
  if (!url || !/alibaba\./i.test(url)) return res.status(400).json({ error: 'Lien Alibaba invalide.' });

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      }
    });
    if (!resp.ok) {
      return res.status(502).json({ error: `Alibaba a renvoyé le code ${resp.status}. La page est probablement protégée — passe en saisie manuelle (titre + photos à la main).` });
    }
    const html = await resp.text();

    // --- Titre ---
    let title = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
             || pick(html, /<title[^>]*>([^<]+)<\/title>/i) || '';
    title = decode(title).replace(/\s*[-|]\s*Alibaba.*$/i, '').trim();

    // --- Prix usine (indicatif, interne) ---
    let price = pick(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i)
             || pick(html, /"(?:formatPrice|priceText|price)"\s*:\s*"([^"]{1,40})"/i) || '';
    price = decode(price).trim();

    // --- Photos (CDN alicdn) ---
    const set = new Set();
    const og = pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) set.add(normImg(og));
    const re = /https?:\/\/[a-z0-9.\-]*alicdn\.com\/[^\s"'\\<>]+?\.(?:jpg|jpeg|png|webp)/gi;
    let m;
    while ((m = re.exec(html)) && set.size < 14) set.add(normImg(m[0]));
    const images = [...set].slice(0, 8);

    // --- Ré-hébergement dans Supabase ---
    const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE;
    let hosted = [];
    if (SUPA && KEY && images.length) {
      hosted = await rehost(images, productId || 'import', SUPA, KEY);
    }

    return res.status(200).json({
      title,
      price,
      images: hosted.length ? hosted : images,
      rehosted: hosted.length > 0
    });
  } catch (e) {
    return res.status(500).json({ error: 'Échec de l\'import : ' + e.message });
  }
};

function pick(s, re) { const m = s.match(re); return m ? m[1] : ''; }
function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");
}
function normImg(u) {
  u = u.replace(/^\/\//, 'https://').split('?')[0];
  // Alibaba ajoute parfois un suffixe de redimensionnement type _220x220.jpg → on tente la pleine résolution
  return u.replace(/_\d+x\d+(xz)?\.(jpg|jpeg|png|webp)$/i, '.$2');
}

async function rehost(urls, productId, SUPA, KEY) {
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetch(urls[i], { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || 'image/jpeg';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1024) continue; // ignore les pixels/placeholders
      const path = `${productId}/import-${Date.now()}-${i}.${ext}`;
      const up = await fetch(`${SUPA}/storage/v1/object/product-images/${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': ct, 'x-upsert': 'true' },
        body: buf
      });
      if (up.ok) out.push(`${SUPA}/storage/v1/object/public/product-images/${path}`);
    } catch (_) { /* on passe à la suivante */ }
  }
  return out;
}

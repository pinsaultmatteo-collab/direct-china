// ============================================================
//  /api/rewrite  —  Réécriture du texte produit en voix Direct China
//  Fonction serverless Vercel (Node, CommonJS, sans dépendance).
//
//  Variable d'environnement à définir sur Vercel :
//    ANTHROPIC_API_KEY = ta clé API Anthropic (console.anthropic.com)
// ============================================================
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const { title = '', raw = '', category = '' } = body || {};

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'Clé ANTHROPIC_API_KEY non configurée sur Vercel.' });
  if (!title && !raw) return res.status(400).json({ error: 'Rien à réécrire.' });

  const prompt = `Tu es le rédacteur de Direct China, qui importe du matériel industriel en direct des usines chinoises pour des professionnels français. Positionnement : premium, direct, factuel, sans superlatifs creux ni promesses gratuites.

À partir des informations brutes ci-dessous (souvent mal traduites depuis l'anglais ou le chinois), produis une fiche produit propre en français.

Catégorie : ${category || 'non précisée'}
Titre brut : ${title || '(aucun)'}
Informations brutes :
${raw || '(aucune)'}

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact :
{"title": "...", "summary": "...", "description": "..."}

Contraintes :
- "title" : nom de produit clair et commercial, en français, ~70 caractères max.
- "summary" : UNE phrase courte et concrète pour la carte catalogue (usage + atout clé), ~120 caractères max, sans point final.
- "description" : 2 à 4 courts paragraphes en prose (pas de listes à puces) : à quoi sert le produit, ses points forts techniques, et pourquoi l'acheter via Direct China (prix usine, import géré de A à Z). N'invente aucun prix chiffré ni aucune spécification non fournie.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const j = await r.json();
    if (j.error) return res.status(502).json({ error: 'API Anthropic : ' + (j.error.message || 'erreur') });

    let text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) { return res.status(502).json({ error: 'Réponse IA illisible, réessaie.' }); }

    return res.status(200).json({
      title: parsed.title || '',
      summary: parsed.summary || '',
      description: parsed.description || ''
    });
  } catch (e) {
    return res.status(500).json({ error: 'Échec de la réécriture : ' + e.message });
  }
};

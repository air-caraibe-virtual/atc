/*
  IA de la compagnie pour ATC — petit serveur Cloudflare Worker (gratuit).
  Les pilotes n'ont besoin d'aucune clé : ATC parle à ce serveur, qui parle à Groq avec la clé de la compagnie.
  La clé Groq reste cachée ici (variable secrète GROQ_KEY), jamais dans l'appli.

  Mise en place : voir les étapes données par Claude (Cloudflare > Workers > Créer > coller ce fichier > secret GROQ_KEY).
*/
const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']; // le 2e sert de secours si le 1er est saturé
const MAX_BODY = 24000;      // taille maximale d'une demande (caractères)
const MAX_TOKENS = 400;      // longueur maximale d'une réponse
const PER_MINUTE = 20;       // messages par minute et par PC (anti-abus, par instance du serveur)

const hits = new Map();
function limited(ip) {
  const now = Date.now(), m = Math.floor(now / 60000), k = ip + ':' + m;
  const n = (hits.get(k) || 0) + 1; hits.set(k, n);
  if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(':' + m)) hits.delete(key);
  return n > PER_MINUTE;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'GET') return json({ ok: true, service: 'IA de la compagnie pour ATC' });
    if (req.method !== 'POST' || url.pathname !== '/chat') return json({ ok: false, error: 'not found' }, 404);
    if (req.headers.get('x-atc-app') !== 'ATC-MSFS') return json({ ok: false, error: 'réservé à ATC' }, 403);
    if (!env.GROQ_KEY) return json({ ok: false, error: 'clé GROQ_KEY absente du serveur' }, 500);
    const ip = req.headers.get('cf-connecting-ip') || 'x';
    if (limited(ip)) return json({ ok: false, error: 'trop de messages, patientez une minute' }, 429);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: 'message trop long' }, 413);
    let b; try { b = JSON.parse(raw); } catch (_) { return json({ ok: false, error: 'demande invalide' }, 400); }
    const messages = [{ role: 'system', content: String(b.system || '').slice(0, 12000) }, ...(Array.isArray(b.messages) ? b.messages.slice(-6) : [])]
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: String(m.content || '').slice(0, 12000) }));
    let last = '';
    for (const model of (env.MODEL ? [env.MODEL, ...MODELS] : MODELS)) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.GROQ_KEY },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: Math.min(+b.maxTokens || MAX_TOKENS, MAX_TOKENS) }),
      });
      const j = await r.json().catch(() => ({}));
      const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (r.ok && text) return json({ ok: true, text, model });
      last = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status !== 429 && r.status < 500 && r.status !== 404 && r.status !== 400) break; // erreur de clé : inutile d'essayer un autre modèle
    }
    return json({ ok: false, error: 'IA de la compagnie : ' + last }, 502);
  },
};

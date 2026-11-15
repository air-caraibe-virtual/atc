/* ATC — IA intégrée (gratuite, hors ligne) : un petit modèle de langage qui tourne sur le PC.
   Téléchargé une seule fois (≈ 1 Go), puis gardé dans le dossier d'ATC. */
'use strict';

// du plus malin au plus léger : si le premier ne se charge pas, on essaie le suivant
const MODELS = ['onnx-community/Qwen2.5-1.5B-Instruct', 'onnx-community/Qwen2.5-0.5B-Instruct'];
let T = null, gen = null, loading = null, modelName = null;

function load(cacheDir, onProgress) {
  if (gen) return Promise.resolve(gen);
  if (loading) return loading;
  loading = (async () => {
    T = T || require('@huggingface/transformers');
    T.env.cacheDir = cacheDir;
    T.env.allowLocalModels = false;
    let lastErr = null;
    for (const m of MODELS) {
      const files = {};
      try {
        const g = await T.pipeline('text-generation', m, {
          dtype: 'q4', device: 'cpu',
          progress_callback: (x) => {
            if (!x || !x.file) return;
            if (x.status === 'progress') files[x.file] = { loaded: x.loaded || 0, total: x.total || 0 };
            else if (x.status === 'done' && files[x.file]) files[x.file].loaded = files[x.file].total;
            let l = 0, t = 0; for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
            if (onProgress && t > 5e6) onProgress({ loaded: l, total: t });
          },
        });
        gen = g; modelName = m;
        return g;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('modèle introuvable');
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// system + messages au format chat -> texte de la réponse
async function chat(cacheDir, system, messages, maxTokens, onProgress) {
  const g = await load(cacheDir, onProgress);
  const conv = [{ role: 'system', content: system }, ...messages];
  const out = await g(conv, { max_new_tokens: Math.min(maxTokens || 220, 300), do_sample: false, return_full_text: false });
  const o = out && out[0] && out[0].generated_text;
  if (Array.isArray(o)) { const last = o[o.length - 1]; return (last && last.content) || ''; }
  return String(o || '');
}

module.exports = { load, chat, model: () => modelName };

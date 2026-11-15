/* ATC — reconnaissance vocale hors ligne (Whisper, dans le processus principal).
   Le modèle est téléchargé une seule fois puis gardé sur le PC :
   « précis » (whisper-small, ≈ 250 Mo) ou « rapide » (whisper-base, ≈ 80 Mo). */
'use strict';

const MODELS = { small: 'Xenova/whisper-small', base: 'Xenova/whisper-base' };
let MODEL = MODELS.small;
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt'];
let T = null, pipe = null, loading = null, loadedFor = null;

function setModel(name) {
  const m = MODELS[name] || MODELS.small;
  if (m !== MODEL) { MODEL = m; pipe = null; loading = null; }
}

function load(cacheDir, onProgress) {
  if (pipe && loadedFor === MODEL) return Promise.resolve(pipe);
  if (loading) return loading;
  const want = MODEL;
  loading = (async () => {
    T = T || require('@huggingface/transformers');
    T.env.cacheDir = cacheDir;
    T.env.allowLocalModels = false;
    const files = {};
    const p = await T.pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8', device: 'cpu',
      progress_callback: (x) => {
        if (!x || !x.file) return;
        if (x.status === 'progress') files[x.file] = { loaded: x.loaded || 0, total: x.total || 0 };
        else if (x.status === 'done' && files[x.file]) files[x.file].loaded = files[x.file].total;
        let l = 0, t = 0; for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
        if (onProgress && t > 2e6) onProgress({ loaded: l, total: t });
      },
    });
    pipe = p; loadedFor = want;
    return p;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// Détection de la langue parlée : une seule étape du décodeur après <|startoftranscript|>,
// on compare les probabilités des jetons de langue (seulement les langues gérées par ATC).
async function detectLang(p, audio, allowed) {
  const gc = p.model.generation_config || {};
  const map = gc.lang_to_id; if (!map) return null;
  const { input_features } = await p.processor(audio);
  const sot = gc.decoder_start_token_id;
  const dec = new T.Tensor('int64', BigInt64Array.from([BigInt(sot)]), [1, 1]);
  const out = await p.model({ input_features, decoder_input_ids: dec });
  const logits = out.logits; const V = logits.dims[logits.dims.length - 1];
  const data = logits.data, base = data.length - V;
  let best = null, bestV = -Infinity; const scores = {};
  for (const l of allowed) {
    const id = map[`<|${l}|>`]; if (id == null) continue;
    const v = Number(data[base + id]); scores[l] = v;
    if (v > bestV) { bestV = v; best = l; }
  }
  return best ? { lang: best, scores } : null;
}

// samples : Float32Array mono 16 kHz. Retourne [{ lang, text }] (1 résultat si la langue est détectée).
async function transcribe(cacheDir, samples, fallbackLangs, onProgress) {
  const p = await load(cacheDir, onProgress);
  const audio = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  if (audio.length < 16000 * 0.3) return { results: [], detected: null };
  let det = null;
  try { det = await detectLang(p, audio, LANGS); } catch (e) { det = null; }
  const langs = det ? [det.lang] : [...new Set((fallbackLangs || ['en']).filter((l) => LANGS.includes(l)))].slice(0, 3);
  const results = [];
  for (const lang of langs) {
    // pas de répétitions en boucle (« zulu zulu zulu… »), une erreur fréquente de Whisper sur l'audio radio
    const r = await p(audio, { language: lang, task: 'transcribe', no_repeat_ngram_size: 4 });
    results.push({ lang, text: String((r && r.text) || '').trim() });
  }
  return { results, detected: det && det.lang };
}

module.exports = { load, transcribe, setModel, MODELS };

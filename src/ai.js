/* ATC — IA (facultative) : comprend ce que dit le pilote, répond comme un contrôleur,
   joue le copilote et gère les urgences. Elle passe par la clé API du pilote (Claude, OpenAI ou Groq). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtcAI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PROVIDERS = {
    local: { name: 'IA intégrée (gratuite, sur le PC)', model: '', keyHint: '', noKey: true, compact: true },
    ollama: { name: 'Ollama (gros PC)', model: 'qwen2.5:7b', keyHint: '', noKey: true },
    anthropic: { name: 'Claude (Anthropic)', model: 'claude-haiku-5-5', keyHint: 'sk-ant-…' },
    openai: { name: 'OpenAI', model: 'gpt-4o-mini', keyHint: 'sk-…' },
    groq: { name: 'Groq (accès gratuit limité)', model: 'llama-3.3-70b-versatile', keyHint: 'gsk_…' },
  };
  const LANG_NAMES = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese' };

  // Contexte du vol transmis à l'IA (rien de personnel : seulement le vol en cours)
  function context(engine, extra) {
    const f = engine.flight; if (!f) return null;
    const st = engine.station;
    const acts = engine.actions().map((a) => ({
      id: a.id, label: a.label,
      example: a.id === 'readback' ? (engine.pending && engine.pending.readback && engine.pending.readback.text) : (engine.withLang('en', () => { const m = engine._pilotMsg(a.id, a.needsLevel ? (a.options && a.options[0]) : undefined); return m && m.text; }) || ''),
      levels: a.needsLevel ? a.options : undefined,
    }));
    return {
      callsign: f.callsign, telephony: engine.cs().speech,
      departure: { icao: f.dep.icao, city: f.dep.city, runway: f.dep.rwy }, arrival: { icao: f.arr.icao, city: f.arr.city, runway: f.arr.rwy },
      cruise_ft: f.cruise, cleared_ft: engine.cleared || null, phase: engine.phase,
      station: st ? { name: st.name, role: st.role, freq: st.freq } : null,
      controller_languages: engine.radioMode === 'auto' ? [...new Set(['en', engine.stationLang()])] : [engine.lang],
      current_radio_language: engine.lang,
      pending_readback: engine.pending && engine.pending.readback ? engine.pending.readback.text : null,
      emergency: engine.flags && engine.flags.emergency || null,
      available_requests: acts,
      ...(extra || {}),
    };
  }

  const SYSTEM = `You are the brain of "ATC", an air traffic control simulator for Microsoft Flight Simulator.
The pilot speaks on the radio (transcribed by speech recognition, so expect transcription mistakes: wrong words for the callsign, numbers written as words, missing punctuation) or types a message, or asks the copilot.
You receive the flight context as JSON and the pilot's message. Answer ONLY with one JSON object, no other text.

Decide what the pilot wants:
1. If the message matches one of "available_requests" (even phrased freely, in any language, or badly transcribed), answer
   {"type":"action","action":"<id>","lang":"<xx>","level":<feet or null>}
   - "readback" when a readback is pending and the pilot repeats the instruction (even partially).
   - "req_level" needs "level" in feet (e.g. FL370 -> 37000), chosen among its "levels".
2. If it is a radio message to ATC that is not in the list (request direct, higher/lower, weather, delay, runway change, questions, thanks, position report, request vectors, information...), answer like a real, concise ICAO controller:
   {"type":"reply","lang":"<xx>","pilot":"<clean ICAO version of what the pilot said>","atc":"<controller reply>"}
3. Distress or urgency (mayday, pan-pan, engine failure, fire, medical, smoke, fuel, hydraulic failure...):
   {"type":"emergency","kind":"mayday" or "panpan","lang":"<xx>","pilot":"<clean version>","atc":"<controller reply: acknowledge, give priority, offer vectors / ask intentions, souls on board and fuel if not given>"}
4. If the pilot addresses the copilot ("copilote", "copilot") or asks a question about the flight that is not meant for ATC, answer as a friendly, competent copilot, in the user's interface language (French unless told otherwise), short (1-3 sentences):
   {"type":"copilot","answer":"<answer>"}
5. If you cannot understand anything useful: {"type":"say_again","lang":"<xx>"}

Rules:
- "lang" is the language the pilot SPOKE (en, fr, es, de, it, pt). Write "pilot" and "atc" in that language.
- The controller only understands "controller_languages". If the pilot spoke another language, still return the matching JSON with the real "lang"; the app answers "say again in English" itself.
- Controller replies start with the callsign telephony, use real ICAO phraseology, are short (one radio transmission), never invent a clearance that changes the flight (runway, level, frequency) unless the pilot requested something the controller can grant (then grant it plainly). Never say you are an AI.
- Stay realistic for the current phase and station.`;

  // Version courte pour l'IA intégrée (petit modèle, plus lent à lire de longs textes)
  const SYSTEM_COMPACT = `You are an air traffic control assistant. Read the pilot message (it may be badly transcribed) and answer ONLY one JSON object:
- matches one of the REQUESTS: {"type":"action","action":"<id>","lang":"<en|fr|es|de|it|pt>","level":<feet or null>}
- other radio message to ATC: {"type":"reply","lang":"<xx>","pilot":"<clean message>","atc":"<short ICAO controller reply starting with the callsign>"}
- distress or urgency (mayday, pan-pan, engine failure, fire, medical): {"type":"emergency","kind":"mayday|panpan","lang":"<xx>","pilot":"<clean message>","atc":"<short reply giving priority>"}
- question for the copilot: {"type":"copilot","answer":"<short answer in French>"}
- not understandable: {"type":"say_again","lang":"<xx>"}
"lang" = language the pilot spoke. Write "pilot" and "atc" in that language.`;
  function compactUser(ctx, said, mode) {
    const reqs = (ctx.available_requests || []).map((a) => `- ${a.id}: "${a.example || a.label}"${a.levels ? ' levels: ' + a.levels.join(',') : ''}`).join('\n');
    return `Callsign: ${ctx.callsign} (${ctx.telephony}). Station: ${ctx.station ? ctx.station.name : '-'}. Phase: ${ctx.phase}. From ${ctx.departure ? ctx.departure.icao : '-'} to ${ctx.arrival ? ctx.arrival.icao : '-'}.${ctx.pending_readback ? '\nReadback expected: "' + ctx.pending_readback + '"' : ''}
REQUESTS:
${reqs || '(none)'}

${mode === 'copilot' ? 'Message to the COPILOT' : 'Pilot message'}: ${said}`;
  }

  function buildMessages(ctx, said, mode, history, compact) {
    if (compact) return { system: SYSTEM_COMPACT, messages: [{ role: 'user', content: compactUser(ctx, said, mode) }] };
    const h = (history || []).slice(-8).map((m) => `${m.from}: ${m.text}`).join('\n');
    const user = `Flight context:\n${JSON.stringify(ctx)}\n\nRecent radio:\n${h || '(none)'}\n\n${mode === 'copilot' ? 'Message to the COPILOT' : 'Pilot message'}: ${said}`;
    return { system: SYSTEM, messages: [{ role: 'user', content: user }] };
  }

  function parse(text) {
    if (!text) return null;
    const s = String(text);
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
  }

  return { PROVIDERS, LANG_NAMES, context, buildMessages, parse, SYSTEM };
});

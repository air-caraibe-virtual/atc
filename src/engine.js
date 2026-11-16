/* ATC — moteur ATC (phases du vol, phraséologie FR/EN, surveillance).
   Fonctionne dans la fenêtre de l'appli et sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ATC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Outils de phraséologie ----------
  const DIG = {
    fr: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'],
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'],
  };
  const PHON = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike',
    'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
  const TELEPHONY = {
    FWI: 'French West', AFR: 'Air France', TVF: 'France Soleil', CRL: 'Corsair', ACX: 'French West', FWE: 'French West',
    TSC: 'Air Transat', ACA: 'Air Canada', EZY: 'Easy', EJU: 'Alpine', EZS: 'Topswiss', RYR: 'Ryanair', BAW: 'Speedbird',
    DLH: 'Lufthansa', KLM: 'KLM', IBE: 'Iberia', VLG: 'Vueling', TAP: 'Air Portugal', SWR: 'Swiss', AAL: 'American',
    DAL: 'Delta', UAL: 'United', JBU: 'Jetblue', SWA: 'Southwest', FDX: 'Fedex', UPS: 'UPS', UAE: 'Emirates',
    QTR: 'Qatari', ITY: 'Itarrow', AZA: 'Alitalia', BEL: 'Beeline', TRA: 'Transavia', TVS: 'Skytravel', HOP: 'Air Hop',
    VOE: 'Volotea', AEA: 'Europa', LBT: 'Nouvelair', RAM: 'Royalair Maroc', DAH: 'Air Algerie', CFG: 'Condor', WIF: 'Wideroe',
  };

  // Noms radio des stations quand la ville ne suffit pas (plusieurs aéroports)
  const STATION_NAMES = {
    LFPG: 'De Gaulle', LFPO: 'Orly', LFPB: 'Le Bourget', LFOB: 'Beauvais', LFLL: 'Lyon', LFML: 'Marseille', LFBO: 'Toulouse',
    LFSB: 'Bâle-Mulhouse', LFMN: 'Nice', LFRS: 'Nantes', LFBD: 'Bordeaux', LFQQ: 'Lille', LFST: 'Strasbourg', LFMP: 'Perpignan',
    TFFR: 'Pointe-à-Pitre', TFFF: 'Fort-de-France', TFFJ: 'Saint-Barth', TFFG: 'Grand-Case', SOCA: 'Cayenne', FMEE: 'Réunion',
    EGLL: 'Heathrow', EGKK: 'Gatwick', EGSS: 'Stansted', EGLC: 'City', KJFK: 'Kennedy', KLGA: 'La Guardia', KEWR: 'Newark',
    EDDF: 'Frankfurt', EDDM: 'München', EHAM: 'Schiphol', EBBR: 'Brussels', LEMD: 'Madrid', LEBL: 'Barcelona', LIRF: 'Roma',
    LIMC: 'Malpensa', LIML: 'Linate', LSGG: 'Genève', LSZH: 'Zürich', OMDB: 'Dubai', CYUL: 'Montréal', CYYZ: 'Toronto',
  };
  // ---------- Langues radio ----------
  // Règle OACI : l'anglais partout, plus la langue du pays du contrôleur.
  const RADIO_LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt'];
  const LANG_NAMES = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português' };
  const QUEBEC = ['CYUL', 'CYQB', 'CYMX', 'CYHU', 'CYBG', 'CYVO', 'CYUY', 'CYRJ', 'CYGP', 'CYZV', 'CYYY', 'CYSC', 'CYBC'];
  const PREFIX_LANG = [
    // français
    ['LSG', 'fr'], ['LF', 'fr'], ['LN', 'fr'], ['EB', 'fr'], ['TF', 'fr'], ['SO', 'fr'], ['FM', 'fr'], ['NT', 'fr'], ['NW', 'fr'], ['NL', 'fr'], ['MT', 'fr'],
    ['GO', 'fr'], ['DF', 'fr'], ['DR', 'fr'], ['DI', 'fr'], ['DB', 'fr'], ['DX', 'fr'], ['GA', 'fr'], ['GQ', 'fr'], ['GU', 'fr'], ['FC', 'fr'], ['FE', 'fr'],
    ['FK', 'fr'], ['FO', 'fr'], ['FT', 'fr'], ['FZ', 'fr'], ['DA', 'fr'], ['DT', 'fr'], ['GM', 'fr'], ['FP', 'fr'], ['HD', 'fr'], ['HR', 'fr'],
    // espagnol
    ['LE', 'es'], ['GC', 'es'], ['GE', 'es'], ['MM', 'es'], ['MG', 'es'], ['MH', 'es'], ['MN', 'es'], ['MR', 'es'], ['MS', 'es'], ['MD', 'es'], ['MU', 'es'],
    ['MP', 'es'], ['SK', 'es'], ['SE', 'es'], ['SP', 'es'], ['SL', 'es'], ['SC', 'es'], ['SA', 'es'], ['SU', 'es'], ['SG', 'es'], ['SV', 'es'], ['FG', 'es'],
    // allemand
    ['ED', 'de'], ['ET', 'de'], ['LO', 'de'], ['LS', 'de'],
    // italien
    ['LI', 'it'],
    // portugais
    ['LP', 'pt'], ['SB', 'pt'], ['SD', 'pt'], ['SN', 'pt'], ['SS', 'pt'], ['SW', 'pt'], ['SI', 'pt'], ['SJ', 'pt'], ['FN', 'pt'], ['FQ', 'pt'], ['GV', 'pt'], ['FP', 'pt'],
  ];
  function localLang(icao) {
    const c = String(icao || '').toUpperCase();
    if (QUEBEC.includes(c)) return 'fr';
    for (const [p, l] of PREFIX_LANG) if (c.startsWith(p)) return l;
    return 'en';
  }
  // compagnies qui parlent la langue de leur pays chez elles (trafic IA)
  const AIRLINE_LANG = {
    AFR: 'fr', TVF: 'fr', CRL: 'fr', FWI: 'fr', HOP: 'fr', ACX: 'fr', FWE: 'fr', ASL: 'fr', SWT: 'fr', AIB: 'fr',
    IBE: 'es', VLG: 'es', AEA: 'es', IBS: 'es', ANE: 'es', VOE: 'es', IBB: 'es', AMX: 'es', AVA: 'es', LAN: 'es', ARG: 'es',
    DLH: 'de', EWG: 'de', CFG: 'de', TUI: 'de', AUA: 'de', SWR: 'de', EDW: 'de', CLH: 'de',
    ITY: 'it', AZA: 'it', NOS: 'it',
    TAP: 'pt', GLO: 'pt', TAM: 'pt', AZU: 'pt', SAT: 'pt',
  };
  // Traductions des phrases (clé = la phrase anglaise) : [espagnol, allemand, italien, portugais]
  const DICT = {
    ' slash ': [' barra ', ' Strich ', ' barra ', ' barra '],
    ' left': [' izquierda', ' links', ' sinistra', ' esquerda'], ' right': [' derecha', ' rechts', ' destra', ' direita'], ' center': [' central', ' Mitte', ' centro', ' central'],
    'runway': ['pista', 'Piste', 'pista', 'pista'],
    'closed for works': ['cerrada por obras', 'wegen Bauarbeiten gesperrt', 'chiusa per lavori', 'fechada para obras'],
    'closed': ['cerrada', 'gesperrt', 'chiusa', 'fechada'],
    'hold short runway': ['mantenga antes de pista', 'halten Sie vor Piste', 'attendete prima della pista', 'mantenha antes da pista'],
    'holding short runway': ['manteniendo antes de pista', 'halten vor Piste', 'attendiamo prima della pista', 'mantendo antes da pista'],
    'Holding short runway': ['Mantenemos antes de pista', 'Halten vor Piste', 'Attendiamo prima della pista', 'Mantendo antes da pista'],
    'cross runway': ['cruce pista', 'kreuzen Sie Piste', 'attraversate pista', 'cruze a pista'],
    'Crossing runway': ['Cruzamos pista', 'Kreuzen Piste', 'Attraversiamo pista', 'Cruzando a pista'],
    'contact': ['contacte', 'rufen Sie', 'contattate', 'contate'],
    'good day': ['hasta luego', 'auf Wiederhören', 'arrivederci', 'até logo'],
    'you took off without a clearance, continue and contact Departure.': ['ha despegado sin autorización, continúe y contacte con Salidas.', 'Sie sind ohne Freigabe gestartet, fliegen Sie weiter und rufen Sie Abflug.', 'siete decollati senza autorizzazione, proseguite e contattate Partenze.', 'decolou sem autorização, prossiga e contate Saída.'],
    'you are not cleared to taxi, hold position.': ['no está autorizado a rodar, mantenga posición.', 'Sie haben keine Rollfreigabe, halten Sie Position.', 'non siete autorizzati al rullaggio, mantenete la posizione.', 'não está autorizado a taxiar, mantenha posição.'],
    'take-off without clearance noted, continue.': ['despegue sin autorización anotado, continúe.', 'Start ohne Freigabe vermerkt, fliegen Sie weiter.', 'decollo senza autorizzazione annotato, proseguite.', 'decolagem sem autorização registrada, prossiga.'],
    'check altitude, you are cleared': ['compruebe altitud, está autorizado a', 'prüfen Sie Ihre Höhe, Sie sind freigegeben auf', 'verificate la quota, siete autorizzati a', 'verifique altitude, está autorizado para'],
    'reduce speed 250 knots or less below flight level 100.': ['reduzca velocidad a 250 nudos o menos por debajo de nivel 100.', 'reduzieren Sie auf 250 Knoten oder weniger unterhalb Flugfläche 100.', 'riducete la velocità a 250 nodi o meno sotto il livello 100.', 'reduza velocidade para 250 nós ou menos abaixo do nível 100.'],
    'stop immediately, you are on runway': ['pare inmediatamente, está en la pista', 'halten Sie sofort an, Sie sind auf Piste', 'fermatevi immediatamente, siete sulla pista', 'pare imediatamente, está na pista'],
    'without clearance': ['sin autorización', 'ohne Freigabe', 'senza autorizzazione', 'sem autorização'],
    'same level': ['mismo nivel', 'gleiche Höhe', 'stesso livello', 'mesmo nível'],
    'a': ['un', 'ein', 'un', 'um'],
    'traffic': ['un avión', 'ein Flugzeug', 'un aereo', 'uma aeronave'],
    'Looking out': ['Buscando el tráfico', 'Halten Ausschau', 'Cerchiamo il traffico', 'Procurando o tráfego'],
    'cleared for take-off': ['autorizado a despegar', 'Start frei', 'autorizzati al decollo', 'autorizado decolar'],
    'Cleared for take-off runway': ['Autorizados a despegar pista', 'Start frei Piste', 'Autorizzati al decollo pista', 'Autorizado decolar pista'],
    'landing without clearance noted.': ['aterrizaje sin autorización anotado.', 'Landung ohne Freigabe vermerkt.', 'atterraggio senza autorizzazione annotato.', 'pouso sem autorização registrado.'],
    'requested level now available,': ['nivel solicitado ya disponible,', 'angeforderte Höhe jetzt verfügbar,', 'livello richiesto ora disponibile,', 'nível solicitado agora disponível,'],
    'climb': ['suba', 'steigen Sie', 'salite', 'suba'],
    'descend': ['descienda', 'sinken Sie', 'scendete', 'desça'],
    'Climb': ['Subimos', 'Steigen', 'Saliamo', 'Subindo'],
    'Descend': ['Descendemos', 'Sinken', 'Scendiamo', 'Descendo'],
    ', when ready': [', a su discreción', ', nach eigenem Ermessen', ', a vostra discrezione', ', a seu critério'],
    'ILS approach runway': ['aproximación ILS pista', 'ILS-Anflug Piste', 'avvicinamento ILS pista', 'aproximação ILS pista'],
    'radar contact,': ['contacto radar,', 'Radarkontakt,', 'contatto radar,', 'contato radar,'],
    'cleared': ['autorizado', 'freigegeben', 'autorizzati', 'autorizado'],
    'report established': ['notifique establecido', 'melden Sie Landekurs', 'riportate stabilizzati', 'reporte estabilizado'],
    'Cleared ILS runway': ['Autorizados ILS pista', 'Freigegeben ILS Piste', 'Autorizzati ILS pista', 'Autorizado ILS pista'],
    'wilco': ['notificaremos establecidos', 'werden melden', 'riporteremo', 'reportaremos'],
    'continue approach,': ['continúe la aproximación,', 'setzen Sie den Anflug fort,', "continuate l'avvicinamento,", 'continue a aproximação,'],
    'departing traffic,': ['tráfico saliendo,', 'startender Verkehr,', 'traffico in partenza,', 'tráfego decolando,'],
    'traffic on the runway,': ['tráfico en la pista,', 'Verkehr auf der Piste,', 'traffico sulla pista,', 'tráfego na pista,'],
    'Continuing': ['Continuamos', 'Setzen fort', 'Continuiamo', 'Continuando'],
    'cleared to land': ['autorizado a aterrizar', 'Landung frei', "autorizzati all'atterraggio", 'autorizado pousar'],
    'Cleared to land runway': ['Autorizados a aterrizar pista', 'Landung frei Piste', "Autorizzati all'atterraggio pista", 'Autorizado pousar pista'],
    'go around, I say again, go around, climb': ['motor y al aire, repito, motor y al aire, suba', 'durchstarten, ich wiederhole, durchstarten, steigen Sie', 'riattaccate, ripeto, riattaccate, salite', 'arremeta, repito, arremeta, suba'],
    'Going around, climb': ['Motor y al aire, subimos', 'Starten durch, steigen', 'Riattacchiamo, saliamo', 'Arremetendo, subindo'],
    'vacate when able, contact': ['abandone la pista cuando pueda, contacte', 'verlassen Sie die Piste wenn möglich, rufen Sie', 'liberate appena possibile, contattate', 'livre a pista quando possível, contate'],
    'when vacated': ['una vez libre', 'nach Verlassen', 'una volta liberata', 'após livrar'],
    'Wilco,': ['Recibido,', 'Wilco,', 'Ricevuto,', 'Ciente,'],
    'request IFR clearance to': ['solicitamos autorización IFR a', 'erbitten IFR-Freigabe nach', 'richiediamo autorizzazione IFR per', 'solicitamos autorização IFR para'],
    'information': ['información', 'Information', 'informazione', 'informação'],
    'request push-back and start-up': ['solicitamos remolque y puesta en marcha', 'erbitten Push-back und Anlassen', 'richiediamo push-back e messa in moto', 'solicitamos push-back e acionamento'],
    'request start-up': ['solicitamos puesta en marcha', 'erbitten Anlassen', 'richiediamo messa in moto', 'solicitamos acionamento'],
    'ready to taxi': ['listos para rodar', 'rollbereit', 'pronti al rullaggio', 'prontos para taxiar'],
    'holding point runway': ['en punto de espera pista', 'am Rollhalt Piste', 'al punto attesa pista', 'no ponto de espera pista'],
    'ready for departure': ['listos para salir', 'abflugbereit', 'pronti per la partenza', 'prontos para decolagem'],
    'missed approach, climbing': ['aproximación frustrada, subiendo a', 'Fehlanflug, steigen auf', 'mancato avvicinamento, in salita per', 'aproximação perdida, subindo para'],
    'passing': ['pasando', 'durch', 'passando', 'passando'],
    'descending': ['descendiendo a', 'sinken auf', 'in discesa per', 'descendo para'],
    'climbing': ['subiendo a', 'steigen auf', 'in salita per', 'subindo para'],
    'ready for descent': ['listos para el descenso', 'bereit zum Sinkflug', 'pronti per la discesa', 'prontos para descida'],
    'request runway status at': ['solicitamos estado de pistas en', 'erbitten Pistenzustand in', 'richiediamo stato delle piste a', 'solicitamos condição das pistas em'],
    'request': ['solicitamos', 'erbitten', 'richiediamo', 'solicitamos'],
    'established ILS runway': ['establecidos ILS pista', 'auf dem ILS Piste', 'stabilizzati ILS pista', 'estabilizados ILS pista'],
    'going around': ['motor y al aire', 'starten durch', 'riattacchiamo', 'arremetendo'],
    'vacated': ['libre', 'verlassen', 'liberata', 'livre'],
    'on stand, thanks, good day': ['en el puesto, gracias, hasta luego', 'auf Parkposition, danke, auf Wiederhören', 'al parcheggio, grazie, arrivederci', 'na posição, obrigado, até logo'],
    'cleared to': ['autorizado a', 'freigegeben nach', 'autorizzati a', 'autorizado para'],
    'Cleared to': ['Autorizados a', 'Freigegeben nach', 'Autorizzati a', 'Autorizado para'],
    'as filed': ['según plan de vuelo', 'wie geplant', 'come da piano di volo', 'conforme plano'],
    'climb initially': ['ascenso inicial', 'steigen Sie initial auf', 'salita iniziale', 'subida inicial'],
    'squawk': ['transpondedor', 'Squawk', 'squawk', 'transponder'],
    'via': ['vía', 'über', 'via', 'via'],
    'readback correct, contact': ['colación correcta, contacte', 'Rücklesung korrekt, rufen Sie', 'collazionamento corretto, contattate', 'cotejamento correto, contate'],
    'for start-up, good day': ['para puesta en marcha, hasta luego', 'zum Anlassen, auf Wiederhören', 'per la messa in moto, arrivederci', 'para acionamento, até logo'],
    'readback correct, report ready for start-up': ['colación correcta, notifique listo para puesta en marcha', 'Rücklesung korrekt, melden Sie anlassbereit', 'collazionamento corretto, riportate pronti alla messa in moto', 'cotejamento correto, reporte pronto para acionamento'],
    'push-back and start-up approved': ['remolque y puesta en marcha aprobados', 'Push-back und Anlassen genehmigt', 'push-back e messa in moto approvati', 'push-back e acionamento aprovados'],
    'start-up approved': ['puesta en marcha aprobada', 'Anlassen genehmigt', 'messa in moto approvata', 'acionamento aprovado'],
    'Taxiing to holding point runway': ['Rodando al punto de espera pista', 'Rollen zum Rollhalt Piste', 'Rulliamo al punto attesa pista', 'Taxiando para o ponto de espera pista'],
    'taxi to holding point runway': ['ruede al punto de espera pista', 'rollen Sie zum Rollhalt Piste', 'rullate al punto attesa pista', 'taxie para o ponto de espera pista'],
    'Taxi to holding point runway': ['Rodamos al punto de espera pista', 'Rollen zum Rollhalt Piste', 'Rulliamo al punto attesa pista', 'Taxiando para o ponto de espera pista'],
    'traffic on short final,': ['tráfico en final corta,', 'Verkehr im kurzen Endanflug,', 'traffico in corto finale,', 'tráfego em final curta,'],
    'landing traffic,': ['tráfico aterrizando,', 'landender Verkehr,', 'traffico in atterraggio,', 'tráfego pousando,'],
    'landing traffic': ['tráfico aterrizando', 'landender Verkehr', 'traffico in atterraggio', 'tráfego pousando'],
    'departing traffic': ['tráfico saliendo', 'startender Verkehr', 'traffico in partenza', 'tráfego decolando'],
    'hold position,': ['mantenga posición,', 'halten Sie Position,', 'mantenete la posizione,', 'mantenha posição,'],
    'Holding position': ['Mantenemos posición', 'Halten Position', 'Manteniamo la posizione', 'Mantendo posição'],
    'line up and wait runway': ['entre y mantenga pista', 'rollen Sie auf und warten Sie Piste', 'allineatevi e attendete pista', 'alinhe e mantenha pista'],
    'Line up and wait runway': ['Entramos y mantenemos pista', 'Rollen auf und warten Piste', 'Ci allineiamo e attendiamo pista', 'Alinhando e mantendo pista'],
    'radar contact, climb': ['contacto radar, suba', 'Radarkontakt, steigen Sie', 'contatto radar, salite', 'contato radar, suba'],
    'radar contact': ['contacto radar', 'Radarkontakt', 'contatto radar', 'contato radar'],
    'radar contact, descend': ['contacto radar, descienda', 'Radarkontakt, sinken Sie', 'contatto radar, scendete', 'contato radar, desça'],
    'expect ILS approach runway': ['espere aproximación ILS pista', 'erwarten Sie ILS-Anflug Piste', 'prevedete avvicinamento ILS pista', 'espere aproximação ILS pista'],
    'ILS runway': ['ILS pista', 'ILS Piste', 'ILS pista', 'ILS pista'],
    'runway in use': ['pista en servicio', 'Piste in Betrieb', 'pista in uso', 'pista em uso'],
    'Runway in use': ['Pista en servicio', 'Piste in Betrieb', 'Pista in uso', 'Pista em uso'],
    'unable, maintain': ['imposible, mantenga', 'nicht möglich, halten Sie', 'negativo, mantenete', 'impossível, mantenha'],
    'expect descent shortly': ['espere descenso en breve', 'erwarten Sie Sinkflug in Kürze', 'prevedete la discesa a breve', 'espere descida em breve'],
    'unable at this time due to traffic, maintain': ['imposible por el momento debido al tráfico, mantenga', 'derzeit wegen Verkehr nicht möglich, halten Sie', 'negativo al momento per traffico, mantenete', 'impossível no momento devido ao tráfego, mantenha'],
    'expect higher in a few minutes': ['espere más alto en unos minutos', 'erwarten Sie höher in einigen Minuten', 'prevedete livello superiore tra qualche minuto', 'espere nível mais alto em alguns minutos'],
    'expect lower in a few minutes': ['espere más bajo en unos minutos', 'erwarten Sie tiefer in einigen Minuten', 'prevedete livello inferiore tra qualche minuto', 'espere nível mais baixo em alguns minutos'],
    'Maintain': ['Mantenemos', 'Halten', 'Manteniamo', 'Mantendo'],
    'roger, climb': ['recibido, suba', 'verstanden, steigen Sie', 'ricevuto, salite', 'ciente, suba'],
    'taxi to your stand': ['ruede a su puesto de estacionamiento', 'rollen Sie zu Ihrer Parkposition', 'rullate al vostro parcheggio', 'taxie para sua posição de estacionamento'],
    'Taxi to stand': ['Rodamos al puesto', 'Rollen zur Parkposition', 'Rulliamo al parcheggio', 'Taxiando para a posição'],
    'visibility 10 kilometres or more': ['visibilidad 10 kilómetros o más', 'Sicht 10 Kilometer oder mehr', 'visibilità 10 chilometri o più', 'visibilidade 10 quilômetros ou mais'],
    'few': ['pocas nubes', 'wenige Wolken', 'poche nubi', 'poucas nuvens'],
    'scattered': ['nubes dispersas', 'aufgelockerte Bewölkung', 'nubi sparse', 'nuvens esparsas'],
    'broken': ['nubes fragmentadas', 'aufgerissene Bewölkung', 'nubi frammentate', 'nublado'],
    'overcast': ['cubierto', 'bedeckt', 'coperto', 'encoberto'],
    'at': ['a', 'in', 'a', 'a'],
    'feet': ['pies', 'Fuß', 'piedi', 'pés'],
    'No significant cloud.': ['Sin nubes significativas.', 'Keine signifikante Bewölkung.', 'Nessuna nube significativa.', 'Sem nuvens significativas.'],
    'Transition level': ['Nivel de transición', 'Übergangsfläche', 'Livello di transizione', 'Nível de transição'],
    'continue approach, traffic on the runway': ['continúe la aproximación, tráfico en la pista', 'setzen Sie den Anflug fort, Verkehr auf der Piste', "continuate l'avvicinamento, traffico sulla pista", 'continue a aproximação, tráfego na pista'],
    'go around, I say again, go around': ['motor y al aire, repito, motor y al aire', 'durchstarten, ich wiederhole, durchstarten', 'riattaccate, ripeto, riattaccate', 'arremeta, repito, arremeta'],
    'Going around': ['Motor y al aire', 'Starten durch', 'Riattacchiamo', 'Arremetendo'],
    'vacate when able, contact Ground': ['abandone la pista cuando pueda, contacte Rodadura', 'verlassen Sie die Piste wenn möglich, rufen Sie Rollkontrolle', 'liberate appena possibile, contattate Ground', 'livre a pista quando possível, contate Solo'],
    'Vacating': ['Abandonamos la pista', 'Verlassen die Piste', 'Liberiamo', 'Livrando'],
  };
  const DICT_IDX = { es: 0, de: 1, it: 2, pt: 3 };
  // variantes des phrases ILS pour les autres procédures (RNAV, VOR, NDB, localizer, à vue)
  for (const k of ['localizer', 'RNAV', 'VOR', 'NDB', 'visual']) for (const key of Object.keys(DICT)) if (key.includes('ILS')) DICT[key.replace(/ILS/g, k)] = DICT[key].map((v) => v.replace(/ILS/g, k));
  const DIG_X = {
    es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'],
    de: ['null', 'eins', 'zwo', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'],
    it: ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'],
    pt: ['zero', 'uno', 'dois', 'três', 'quatro', 'cinco', 'meia', 'sete', 'oito', 'nove'],
  };
  const DECIMAL = { fr: 'décimal', en: 'decimal', es: 'decimal', de: 'Komma', it: 'virgola', pt: 'decimal' };
  const SIDE_WORD = { L: { fr: 'gauche', en: 'left', es: 'izquierda', de: 'links', it: 'sinistra', pt: 'esquerda' }, R: { fr: 'droite', en: 'right', es: 'derecha', de: 'rechts', it: 'destra', pt: 'direita' }, C: { fr: 'centre', en: 'center', es: 'central', de: 'Mitte', it: 'centro', pt: 'central' } };
  const WIND_W = {
    fr: { na: 'vent non disponible', kt: 'nœuds', calm: 'vent calme', vrb: 'vent variable', g: 'rafales', w: 'vent', deg: 'degrés' },
    en: { na: 'wind not available', kt: 'knots', calm: 'wind calm', vrb: 'wind variable', g: 'gusting', w: 'wind', deg: 'degrees' },
    es: { na: 'viento no disponible', kt: 'nudos', calm: 'viento en calma', vrb: 'viento variable', g: 'rachas', w: 'viento', deg: 'grados' },
    de: { na: 'Wind nicht verfügbar', kt: 'Knoten', calm: 'Wind still', vrb: 'Wind umlaufend', g: 'Böen', w: 'Wind', deg: 'Grad' },
    it: { na: 'vento non disponibile', kt: 'nodi', calm: 'vento calmo', vrb: 'vento variabile', g: 'raffiche', w: 'vento', deg: 'gradi' },
    pt: { na: 'vento não disponível', kt: 'nós', calm: 'vento calmo', vrb: 'vento variável', g: 'rajadas', w: 'vento', deg: 'graus' },
  };
  const letterSay = (c) => (/[A-Z]/.test(c) ? PHON[c.charCodeAt(0) - 65] : c);
  function digits(s, lang) {
    return String(s).split('').map((c) => {
      if (/\d/.test(c)) return (DIG[lang] || DIG_X[lang] || DIG.en)[+c];
      if (c === '.') return DECIMAL[lang] || 'decimal';
      if (/[A-Z]/.test(c)) return letterSay(c);
      return c;
    }).filter((x) => x.trim()).join(' ');
  }
  function freqTxt(f) { return f == null ? '—' : Number(f).toFixed(3); }
  function freqSay(f, lang) {
    let s = Number(f).toFixed(3).replace(/0+$/, '');
    if (s.endsWith('.')) s += '0';
    return digits(s, lang);
  }
  function rwySay(r, lang) {
    const m = String(r || '').toUpperCase().match(/^(\d{1,2})([LRC]?)$/);
    if (!m) return String(r || '');
    const side = SIDE_WORD[m[2]];
    return digits(m[1].padStart(2, '0'), lang) + (side ? ' ' + side[lang] : '');
  }
  function procSay(p, lang) {
    const m = String(p || '').toUpperCase().match(/^([A-Z]+)(\d)([A-Z]?)$/);
    if (!m) return p;
    const name = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    return name + ' ' + (DIG[lang] || DIG_X[lang] || DIG.en)[+m[2]] + (m[3] ? ' ' + letterSay(m[3]) : '');
  }
  function splitCallsign(cs) {
    const m = String(cs || '').toUpperCase().replace(/\s/g, '').match(/^([A-Z]{3})(\d[0-9A-Z]*)$/);
    return m ? { airline: m[1], number: m[2] } : null;
  }
  function callsignSay(cs, lang) {
    const p = splitCallsign(cs);
    if (p && TELEPHONY[p.airline]) return TELEPHONY[p.airline] + ' ' + digits(p.number, lang);
    return digits(String(cs || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), lang);
  }
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  }
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------- Géographie ----------
  const R_NM = 3440.065;
  const rad = (d) => (d * Math.PI) / 180;
  function distNm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  // ---------- Fréquences de secours (si le simulateur ne les donne pas) ----------
  const RANGES = { DEL: [121.0, 121.45], GND: [121.6, 121.975], TWR: [118.0, 120.975], DEP: [119.0, 128.0], APP: [119.0, 136.0], CTR: [125.0, 135.975], ATIS: [126.0, 128.975] };
  function fakeFreq(seed, role) {
    const [lo, hi] = RANGES[role];
    const steps = Math.round((hi - lo) / 0.025);
    return +(lo + (hash(seed + role) % (steps + 1)) * 0.025).toFixed(3);
  }

  // ---------- Météo (METAR -> phrases) ----------
  function parseMetar(m) {
    if (!m) return null;
    const raw = m.rawOb || m.raw || '';
    const out = { raw, temp: m.temp, dew: m.dewp, wdir: m.wdir, wspd: m.wspd, wgst: m.wgst, qnh: m.altim != null ? Math.round(m.altim) : null, clouds: [], vis: null, cavok: /\bCAVOK\b/.test(raw), time: m.reportTime || m.obsTime };
    const v = raw.match(/\s(\d{4})(NDV)?\s/); if (v) out.vis = { m: +v[1] };
    const sm = raw.match(/\s(\d+)SM\s/); if (sm) out.vis = { sm: +sm[1] };
    for (const c of raw.matchAll(/\b(FEW|SCT|BKN|OVC)(\d{3})/g)) out.clouds.push({ cover: c[1], base: +c[2] * 100 });
    out.nsc = /\b(NSC|SKC|CLR|NCD)\b/.test(raw);
    return out;
  }
  function windParts(w, lang) {
    const W = WIND_W[lang] || WIND_W.en;
    if (!w || w.wspd == null) return { text: W.na, speech: W.na };
    if (w.wspd < 1) return { text: W.calm, speech: W.calm };
    if (w.wdir === 'VRB' || w.wdir == null) return { text: `${W.vrb} ${w.wspd} kt`, speech: `${W.vrb}, ${w.wspd} ${W.kt}` };
    const d = String(Math.round(w.wdir / 10) * 10 % 360 || 360).padStart(3, '0');
    const g = w.wgst ? `, ${W.g} ${w.wgst} ${W.kt}` : '';
    return {
      text: `${W.w} ${d}° ${w.wspd} kt${w.wgst ? ' G' + w.wgst : ''}`,
      speech: `${W.w} ${digits(d, lang)} ${W.deg}, ${w.wspd} ${W.kt}${g}`,
    };
  }
  function usesInHg(icao) { return /^[KPC]/.test(icao || '') && !/^PA$/.test(icao); }

  // ---------- Libellés ----------
  const ROLE = {
    fr: { DEL: 'Délivrance', GND: 'Sol', TWR: 'Tour', DEP: 'Départ', APP: 'Approche', CTR: 'Contrôle' },
    en: { DEL: 'Delivery', GND: 'Ground', TWR: 'Tower', DEP: 'Departure', APP: 'Approach', CTR: 'Control' },
    es: { DEL: 'Autorizaciones', GND: 'Rodadura', TWR: 'Torre', DEP: 'Salidas', APP: 'Aproximación', CTR: 'Control' },
    de: { DEL: 'Delivery', GND: 'Rollkontrolle', TWR: 'Turm', DEP: 'Abflug', APP: 'Anflug', CTR: 'Radar' },
    it: { DEL: 'Delivery', GND: 'Ground', TWR: 'Torre', DEP: 'Partenze', APP: 'Avvicinamento', CTR: 'Controllo' },
    pt: { DEL: 'Autorização', GND: 'Solo', TWR: 'Torre', DEP: 'Saída', APP: 'Aproximação', CTR: 'Controle' },
  };
  const PHASE_LABEL = {
    fr: { IDLE: 'Aucun vol', PRE: 'Clearance', CLEARED: 'Autorisé', STARTUP: 'Mise en route', TAXI_OUT: 'Roulage', HOLDING: "Point d'arrêt", LINEUP: 'Alignement', TAKEOFF: 'Décollage', DEP_CHECKIN: 'Départ', CLIMB: 'Montée', CTR_CHECKIN: 'Contrôle', CRUISE: 'Croisière', DESCENT: 'Descente', APP_CHECKIN: 'Approche', APPROACH: 'Approche', FINAL: 'Finale', TWR_CHECKIN: 'Finale', LANDING: 'Atterrissage', VACATING: 'Dégagement', TAXI_IN: 'Roulage arrivée', DONE: 'Terminé' },
    en: { IDLE: 'No flight', PRE: 'Preflight', CLEARED: 'Cleared', STARTUP: 'Start-up', TAXI_OUT: 'Taxi', HOLDING: 'Holding point', LINEUP: 'Line-up', TAKEOFF: 'Take-off', DEP_CHECKIN: 'Departure', CLIMB: 'Climb', CTR_CHECKIN: 'Control', CRUISE: 'Cruise', DESCENT: 'Descent', APP_CHECKIN: 'Approach', APPROACH: 'Approach', FINAL: 'Final', TWR_CHECKIN: 'Final', LANDING: 'Landing', VACATING: 'Vacating', TAXI_IN: 'Taxi-in', DONE: 'Done' },
  };
  const AIRBORNE = ['TAKEOFF', 'DEP_CHECKIN', 'CLIMB', 'CTR_CHECKIN', 'CRUISE', 'DESCENT', 'APP_CHECKIN', 'APPROACH', 'FINAL', 'TWR_CHECKIN', 'LANDING'];
  const RESUME_POINTS = ['PRE', 'HOLDING', 'DEP_CHECKIN', 'CRUISE', 'DESCENT', 'APP_CHECKIN', 'TWR_CHECKIN', 'VACATING'];

  // ---------- Moteur ----------
  class AtcEngine {
    constructor(opts = {}) {
      this.uiLang = opts.uiLang || opts.lang || 'fr';      // langue de l'interface
      this.radioMode = opts.radioMode || opts.lang || 'fr'; // 'auto' (anglais + langue du pays), 'fr' ou 'en'
      this.lang = this.radioMode === 'auto' ? 'en' : this.radioMode; // langue parlée en ce moment sur la fréquence
      this.speak = 'en'; // langue dans laquelle le pilote parle (mode auto)
      this.onMessage = opts.onMessage || (() => {});
      this.onChange = opts.onChange || (() => {});
      this.rand = opts.rand || Math.random;
      this.delay = opts.delay || [1600, 3200];
      this.now = 0;
      this.queue = [];
      this.tel = null;
      this.reset();
    }

    reset() {
      this.greeted = {};
      this.flight = null; this.phase = 'IDLE'; this.station = null; this.pending = null; this.busy = false;
      this.cleared = null; this.clearDir = null; this.flags = {}; this.queue = []; this.lastWarn = 0; this.target = null; this.offer = null;
      this.onChange();
    }

    // phrase radio dans la langue en cours ; x = { es, de, it, pt } pour les phrases avec variables
    T(fr, en, x) {
      const l = this.lang;
      if (l === 'fr') return fr;
      if (l === 'en') return en;
      if (x && x[l] != null) return x[l];
      const d = DICT[en];
      return d && d[DICT_IDX[l]] != null ? d[DICT_IDX[l]] : en;
    }
    // texte de l'interface (boutons, messages système)
    U(fr, en) { return this.uiLang === 'en' ? en : fr; }
    withLang(l, fn) { const p = this.lang; this.lang = l || p; try { return fn(); } finally { this.lang = p; } }
    // langue du pays d'un poste (règle OACI : anglais + langue locale)
    stationLang(st) {
      st = st || this.station; const f = this.flight; if (!st || !f) return 'en';
      const a = st.side === 'ctr1' ? f.dep : st.side === 'ctr2' ? f.arr : f[st.side];
      return localLang(a && a.icao);
    }
    pilotLang() { return this.radioMode === 'auto' ? (this.speak || 'en') : this.lang; }
    setLang(l) {
      if (!l || l === this.lang) return;
      this.lang = l;
      if (this.flight && this.station) this.station = this._st(this.station.role, this.station.side);
      this.onChange();
    }
    setRadioMode(mode) {
      this.radioMode = mode;
      this.setLang(mode === 'auto' ? (this.speak || 'en') : mode);
    }
    setSpeak(l) { this.speak = RADIO_LANGS.includes(l) ? l : 'en'; this.onChange(); }
    // langue d'un avion IA : sa langue s'il est chez lui, sinon l'anglais
    aiLang(cs, side) {
      if (this.radioMode !== 'auto') return this.lang;
      const loc = this.flight ? localLang(this.flight[side === 'arr' ? 'arr' : 'dep'].icao) : 'en';
      const p = splitCallsign(cs);
      return p && AIRLINE_LANG[p.airline] === loc ? loc : 'en';
    }

    // ----- chargement d'un vol -----
    load(fl) {
      this.reset();
      const f = (this.flight = fl);
      for (const side of ['dep', 'arr']) {
        const a = f[side];
        a.wx = parseMetar(a.metar);
        a.freqs = a.freqs || {};
        const need = side === 'dep' ? ['GND', 'TWR', 'DEP', 'ATIS'] : ['APP', 'TWR', 'GND', 'ATIS'];
        for (const r of need) if (!a.freqs[r]) a.freqs[r] = r === 'DEP' && a.freqs.APP ? a.freqs.APP : fakeFreq(a.icao, r);
        if (side === 'dep' && a.freqs.DEL === undefined) a.freqs.DEL = fakeFreq(a.icao, 'DEL');
        if (a.ta == null) a.ta = usesInHg(a.icao) ? 18000 : 5000;
        if (a.tl == null) a.tl = usesInHg(a.icao) ? 18000 : a.ta + 1000;
        a.city = STATION_NAMES[a.icao] || a.city || a.icao;
      }
      f.ctr = f.ctr || [fakeFreq(f.dep.icao, 'CTR'), fakeFreq(f.arr.icao, 'CTR')];
      f.squawk = f.squawk || this._squawk();
      f.total = distNm(f.dep, f.arr) || 0;
      f.initAlt = Math.min(f.cruise, Math.max(4000, Math.ceil(((f.dep.elev || 0) + 3000) / 1000) * 1000));
      f.depLevel = Math.min(f.cruise, f.cruise > 15000 ? 15000 : f.cruise);
      f.descAlt = 11000;
      f.steps = (f.steps || []).filter((x) => x && x.alt && x.lat != null).map((x) => ({ ...x, done: false }));
      this.target = f.cruise;
      f.appAlt = Math.max(3000, Math.ceil(((f.arr.elev || 0) + 2500) / 1000) * 1000);
      this.phase = 'PRE';
      if (this.radioMode === 'auto') { this.speak = 'en'; this.lang = 'en'; }
      this.station = f.dep.freqs.DEL ? this._st('DEL', 'dep') : this._st('GND', 'dep');
      this._sys(this.U(
        `Plan de vol chargé : ${f.callsign} ${f.dep.icao} → ${f.arr.icao}, niveau ${Math.round(f.cruise / 100)}. Contactez ${this.station.name} sur ${freqTxt(this.station.freq)}.`,
        `Flight plan loaded: ${f.callsign} ${f.dep.icao} → ${f.arr.icao}, FL${Math.round(f.cruise / 100)}. Contact ${this.station.name} on ${freqTxt(this.station.freq)}.`));
      this.onChange();
    }

    _squawk() {
      let s; do { s = Array.from({ length: 4 }, () => Math.floor(this.rand() * 8)).join(''); } while (/^(7500|7600|7700|1200|2000|7000|0000)$/.test(s));
      return s;
    }

    _st(role, side) {
      const f = this.flight;
      if (role === 'CTR') {
        const a = side === 'ctr2' ? f.arr : f.dep;
        return { role, side, name: `${a.city} ${ROLE[this.lang].CTR}`, freq: f.ctr[side === 'ctr2' ? 1 : 0] };
      }
      const a = f[side];
      return { role, side, name: `${a.city} ${ROLE[this.lang][role]}`, freq: a.freqs[role] };
    }

    // ----- mots -----
    cs() { return { text: this.flight.callsign, speech: callsignSay(this.flight.callsign, this.lang) }; }
    alt(ft, ref) {
      const fl = ft >= ref;
      if (fl) {
        const n = String(Math.round(ft / 100)).padStart(3, '0');
        const k = Math.round(ft / 100), dn = digits(n, this.lang);
        return { text: this.T(`niveau ${k}`, `FL${k}`, { es: `nivel ${k}`, de: `Flugfläche ${k}`, it: `livello ${k}`, pt: `nível ${k}` }), speech: this.T(`niveau ${dn}`, `flight level ${dn}`, { es: `nivel ${dn}`, de: `Flugfläche ${dn}`, it: `livello ${dn}`, pt: `nível ${dn}` }) };
      }
      const r = Math.round(ft / 100) * 100;
      const ftx = { es: `${r} pies`, de: `${r} Fuß`, it: `${r} piedi`, pt: `${r} pés` };
      return { text: this.T(`${r} pieds`, `${r} ft`, ftx), speech: this.T(`${r} pieds`, `${r} feet`, ftx) };
    }
    qnh(side) {
      const a = this.flight[side];
      const q = a.wx && a.wx.qnh ? a.wx.qnh : 1013;
      if (usesInHg(a.icao)) {
        const inhg = (q * 0.02953).toFixed(2);
        const w = this.T('altimètre', 'altimeter', { es: 'altímetro', de: 'Höhenmesser', it: 'altimetro', pt: 'altímetro' });
        return { text: `${w} ${inhg}`, speech: `${w} ${digits(inhg.replace('.', ''), this.lang)}` };
      }
      return { text: `QNH ${q}`, speech: `QNH ${digits(String(q), this.lang)}` };
    }
    rwy(side) { const r = this.flight[side].rwy || '—'; return { text: r, speech: rwySay(r, this.lang) }; }
    fq(f) { return { text: freqTxt(f), speech: freqSay(f, this.lang) }; }
    sid() { const s = this.flight.sid; return s ? { text: s, speech: procSay(s, this.lang) } : null; }
    wind(side) { return windParts(this.flight[side].wx, this.lang); }
    atisLetter(side) {
      const a = this.flight[side];
      const h = a.wx && a.wx.time ? new Date(a.wx.time.replace(' ', 'T') + (/(Z|[+-]\d\d:?\d\d)$/.test(a.wx.time) ? '' : 'Z')).getUTCHours() : new Date().getUTCHours();
      return PHON[(hash(a.icao) + (isNaN(h) ? 0 : h)) % 26];
    }
    notamSide() { return ['PRE', 'CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'LINEUP'].includes(this.phase) ? 'dep' : 'arr'; }
    // « piste 06/24 fermée pour travaux jusqu'à 1800 UTC »
    closureMsg(c) {
      const names = c.rwys.map((r) => ({ text: r, speech: rwySay(r, this.lang) }));
      const rw = { text: names.map((n) => n.text).join('/'), speech: names.map((n) => n.speech).join(this.T(' barre ', ' slash ')) };
      let until = null;
      if (c.until) {
        const d = new Date(c.until), now = new Date();
        const hhmm = String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0');
        const U2 = (h) => this.T(`jusqu'à ${h} UTC`, `until ${h} UTC`, { es: `hasta las ${h} UTC`, de: `bis ${h} UTC`, it: `fino alle ${h} UTC`, pt: `até ${h} UTC` });
        if (d - now < 20 * 3600000) until = { text: U2(hhmm), speech: U2(digits(hhmm, this.lang)) };
        else {
          const day = d.getUTCDate(), mo = d.getUTCMonth();
          const MO = { fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
          const t = this.T(`jusqu'au ${day} ${MO.fr[mo]}`, `until ${MO.en[mo]} ${day}`, { es: `hasta el ${day}/${mo + 1}`, de: `bis zum ${day}.${mo + 1}.`, it: `fino al ${day}/${mo + 1}`, pt: `até ${day}/${mo + 1}` });
          until = { text: t, speech: t };
        }
      }
      return this.M(this.T('piste', 'runway'), rw, this.T(c.works ? 'fermée pour travaux' : 'fermée', c.works ? 'closed for works' : 'closed'), until);
    }
    faceSay(h) {
      const fr = ['au nord', 'au nord-est', "à l'est", 'au sud-est', 'au sud', 'au sud-ouest', "à l'ouest", 'au nord-ouest'];
      const en = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const i = Math.round((((h % 360) + 360) % 360) / 45) % 8;
      const X = { es: ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'], de: ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'], it: ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'], pt: ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'] };
      const t = this.T('face ' + fr[i], 'facing ' + en[i], { es: 'cara al ' + X.es[i], de: 'Nase nach ' + X.de[i], it: 'prua a ' + X.it[i], pt: 'de frente para ' + X.pt[i] });
      return { text: t, speech: t };
    }
    // ---- Traversées de piste au roulage ----
    rwyPair(ref) {
      const parts = String(ref).split('/');
      return { text: parts.join('/'), speech: parts.map((r) => rwySay(r.trim(), this.lang)).join(this.T(' barre ', ' slash ')) };
    }
    holdShort(ref) {
      return { atc: this.M(this.T('maintenez avant la piste', 'hold short runway'), this.rwyPair(ref)), pilot: this.M(this.T('maintenons avant la piste', 'holding short runway'), this.rwyPair(ref)) };
    }
    // piste devant l'avion (moins de 250 m) pas encore autorisée à la traversée
    crossAhead() {
      const g = this.ground; if (!g || !g.ahead || this.pending) return null;
      if (!['TAXI_OUT', 'TAXI_IN'].includes(this.phase)) return null;
      const ref = g.ahead.ref;
      if (this.phase === 'TAXI_OUT' && this.flight && ref === this.flight.dep.rwyStrip) return null; // piste de départ : c'est le point d'arrêt
      if ((this.crossOK || new Set()).has(ref) || this.flags.crossWait === ref) return null;
      return g.ahead.dist < 250 ? ref : null;
    }
    crossLabel() { const c = this.crossAhead(); return this.U(`Avant la piste ${c}`, `Holding short ${c}`); }
    _crossClear(ref) {
      const f = this.flight, cs = this.cs();
      this.crossOK = this.crossOK || new Set();
      // prochaine traversée prévue sur l'itinéraire
      const list = (this.phase === 'TAXI_OUT' && f.dep.crossings) || [];
      const next = list[list.indexOf(ref) + 1];
      const hs = next ? this.holdShort(next) : null;
      const m = this.M(cs, ',', this.T('traversez la piste', 'cross runway'), this.rwyPair(ref), hs ? [',', hs.atc] : null);
      const rb = this.M(this.T('Traversons la piste', 'Crossing runway'), this.rwyPair(ref), hs ? [',', hs.pilot] : null, ',', cs);
      this._instruct(m, rb, () => { this.crossOK.add(ref); this.flags.crossWait = null; });
    }
    via(list) {
      if (!list || !list.length) return null;
      return { text: list.join(', '), speech: list.map((n) => digits(n, this.lang)).join(', ') };
    }
    curAlt() { const t = this.tel; return t && t.alt != null ? t.alt : null; }

    // Compose {text, speech} à partir de morceaux
    M(...parts) {
      const t = [], s = [];
      for (const p of parts.flat()) {
        if (p == null || p === '') continue;
        if (typeof p === 'string') { t.push(p); s.push(p); } else { t.push(p.text); s.push(p.speech); }
      }
      let sp = s.join(' ').replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim();
      if (this.lang === 'fr') sp = sp.replace(/\bclearance\b/gi, 'cliranse'); // prononcé à l'anglaise par la voix française
      return { text: t.join(' ').replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim(), speech: sp };
    }

    // ----- émission -----
    _sys(text) { this.onMessage({ from: 'system', text, speech: text, at: this.now }); }
    // « bonjour » au premier échange avec chaque poste (comme à la radio en France)
    _greet(msg, who) {
      if ((msg.lang || this.lang) !== 'fr' || !this.station || /bonjour|arrêtez immédiatement|remettez les gaz|sans autorisation/i.test(msg.text)) return msg;
      this.greeted = this.greeted || {};
      const key = who + ':' + this.station.name;
      if (this.greeted[key]) return msg;
      this.greeted[key] = true;
      const cs = this.cs(), st = this.station.name;
      const ins = (m, after) => {
        const i = m.indexOf(after); if (i < 0) return null;
        const j = i + after.length;
        return m.slice(0, j) + ', bonjour' + m.slice(j);
      };
      // contrôleur : « AFR1511, bonjour, … » ; pilote : « Orly Sol, AFR1511, bonjour, … »
      const anchorT = who === 'atc' ? cs.text : (msg.text.startsWith(st) ? st + ', ' + cs.text : null);
      const anchorS = who === 'atc' ? cs.speech : (msg.speech.startsWith(st) ? st + ', ' + cs.speech : null);
      if (!anchorT || !msg.text.startsWith(anchorT)) return msg;
      const t = ins(msg.text, anchorT), s = ins(msg.speech, anchorS);
      return t && s ? { ...msg, text: t, speech: s } : msg;
    }
    _pilot(msg) { msg = { lang: this.lang, ...msg }; msg = this._greet(msg, 'pilot'); this.onMessage({ from: 'pilot', station: this.station && this.station.name, ...msg, at: this.now }); }
    _atc(msg, after, delay) {
      this.busy = true;
      msg = { lang: this.lang, ...msg };
      const st = this.station;
      const d = delay != null ? delay : this.delay[0] + this.rand() * (this.delay[1] - this.delay[0]);
      this._at(d, () => {
        this.busy = false;
        const cur = this.station; this.station = st; msg = this._greet(msg, 'atc'); this.station = cur;
        this.onMessage({ from: 'atc', station: st && st.name, freq: st && st.freq, role: st && st.role, ...msg, at: this.now });
        if (after) after();
        this.onChange();
      });
      this.onChange();
    }
    _at(delay, fn) { this.queue.push({ at: this.now + delay, fn }); }
    _expect(readback, after) { this.pending = { readback, after }; }
    _instruct(msg, readback, after, delay) { this._atc(msg, () => this._expect(readback, after), delay); }
    _handoff(role, side, extra, after) {
      const st = this._st(role, side);
      const msg = this.M(this.cs(), ',', extra ? [extra, ','] : null, this.T('contactez', 'contact'), { text: st.name, speech: st.name }, this.fq(st.freq), ',', this.T('au revoir', 'good day'));
      const rb = this.M(this.fq(st.freq), ',', this.T('au revoir', 'good day'), ',', this.cs());
      this._instruct(msg, rb, () => { this.station = st; if (after) after(); this.onChange(); });
    }
    // Échange libre (IA) : le message du pilote puis la réponse du contrôleur, sans changer le déroulement du vol.
    // Règle OACI : une langue que le contrôleur ne comprend pas reçoit « say again in English ».
    freeExchange(pilotText, atcText, lang) {
      if (!this.flight || this.busy) return false;
      const L = RADIO_LANGS.includes(lang) ? lang : this.lang;
      if (pilotText) this.withLang(L, () => this._pilot({ text: pilotText, speech: pilotText }));
      if (this.radioMode === 'auto' && L !== 'en' && L !== this.stationLang()) {
        this.withLang('en', () => this._atc(this.M(this.cs(), ',', 'I do not understand, say again in English.')));
        return false;
      }
      if (this.radioMode === 'auto') this.setLang(L);
      if (atcText) this.withLang(L, () => this._atc({ text: atcText, speech: atcText }));
      return true;
    }
    // urgence déclarée : priorité absolue (le trafic IA s'écarte)
    declareEmergency(kind) { this.flags.emergency = kind === 'mayday' ? 'mayday' : 'panpan'; this.onChange(); }
    // « répétez » quand le message n'a pas été compris (micro)
    sayAgain() {
      if (!this.flight || this.busy) return;
      this._atc(this.M(this.cs(), ',', this.T('répétez', 'say again', { es: 'repita', de: 'wiederholen Sie', it: 'ripetete', pt: 'repita' })));
    }
    _setCleared(ft) {
      const cur = this.curAlt();
      this.clearDir = cur == null ? (ft >= (this.cleared || 0) ? 'up' : 'down') : (ft > cur + 200 ? 'up' : ft < cur - 200 ? 'down' : 'level');
      this.cleared = ft;
    }

    // ----- boucle -----
    tick(now, tel) {
      this.now = now;
      if (tel) this.tel = tel;
      const due = this.queue.filter((q) => q.at <= now);
      this.queue = this.queue.filter((q) => q.at > now);
      due.sort((a, b) => a.at - b.at).forEach((q) => q.fn());
      if (this.flight && this.tel && this.tel.connected && this.tel.inFlight !== false && !this.busy) this._auto(this.tel);
    }

    dist() {
      const t = this.tel; if (!this.flight || !t || t.lat == null) return { arr: null, dep: null };
      return { arr: distNm(t, this.flight.arr), dep: distNm(t, this.flight.dep) };
    }

    _auto(t) {
      const f = this.flight, ph = this.phase, cs = this.cs();
      const { arr: dArr, dep: dDep } = this.dist();
      const airborne = t.onGround === false && (t.agl == null || t.agl > 50);
      // On ne juge un décollage « sans autorisation » que si l'avion a d'abord été vu au sol près de l'aéroport de départ
      const nearDep = dDep != null && dDep < 15;
      if (t.onGround && nearDep) this.flags.seenGround = true;
      const illegalCheck = this.flags.seenGround && nearDep;

      // --- Infractions au sol ---
      if (['PRE', 'CLEARED', 'STARTUP'].includes(ph) && !this.pending) {
        if (airborne && illegalCheck) {
          this.flags.illegalTo = true;
          this.station = this._st('TWR', 'dep');
          this.phase = 'TAKEOFF';
          return this._atc(this.M(cs, ',', this.T('vous avez décollé sans autorisation, poursuivez et contactez le Départ.', 'you took off without a clearance, continue and contact Departure.')));
        }
        if (t.onGround && nearDep && t.gs > 12 && !this.flags.taxiWarn) {
          this.flags.taxiWarn = true;
          return this._atc(this.M(cs, ',', this.T("vous n'êtes pas autorisé à rouler, maintenez position.", 'you are not cleared to taxi, hold position.')));
        }
      }
      if (['TAXI_OUT', 'HOLDING', 'LINEUP'].includes(ph) && airborne && illegalCheck && !this.flags.illegalTo) {
        this.flags.illegalTo = true; this.pending = null;
        this.station = this._st('TWR', 'dep'); this.phase = 'TAKEOFF';
        return this._atc(this.M(cs, ',', this.T("décollage sans autorisation noté, poursuivez.", 'take-off without clearance noted, continue.')));
      }
      if (this.pending) return;

      // --- Surveillance en vol ---
      if (AIRBORNE.includes(ph) && airborne && this.now - this.lastWarn > 90000) {
        const a = this.curAlt();
        if (this.cleared != null && a != null && ['CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'CTR_CHECKIN', 'APP_CHECKIN'].includes(ph)) {
          const bust = (this.clearDir !== 'down' && a > this.cleared + 500) || (this.clearDir === 'down' && a < this.cleared - 500) || (this.clearDir === 'level' && Math.abs(a - this.cleared) > 500);
          if (bust) {
            this.lastWarn = this.now;
            const ref = ['DESCENT', 'APPROACH', 'APP_CHECKIN'].includes(ph) ? f.arr.tl : f.dep.ta;
            return this._atc(this.M(cs, ',', this.T('vérifiez altitude, vous êtes autorisé', 'check altitude, you are cleared'), this.alt(this.cleared, ref)));
          }
        }
        if (a != null && a < 10000 && t.ias > 262 && !['TAKEOFF'].includes(ph)) {
          const key = ['DESCENT', 'APP_CHECKIN', 'APPROACH', 'FINAL', 'TWR_CHECKIN', 'LANDING'].includes(ph) ? 'spdArr' : 'spdDep';
          if (!this.flags[key]) {
            this.flags[key] = true; this.lastWarn = this.now;
            return this._atc(this.M(cs, ',', this.T('réduisez vitesse 250 nœuds ou moins en dessous du niveau 100.', 'reduce speed 250 knots or less below flight level 100.')));
          }
        }
      }

      // --- Pistes au sol : traversée en attente, incursion ---
      const g = this.ground;
      if (g && this.flags.crossWait && !(this.traffic && this.traffic.stripBusy && this.traffic.stripBusy(this.flags.crossWait))) {
        const ref = this.flags.crossWait; this.flags.crossWait = null; return this._crossClear(ref);
      }
      if (g && g.onRunway && ['CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'TAXI_IN'].includes(ph) && t.onGround) {
        const ref = g.onRunway;
        this.crossOK = this.crossOK || new Set(); this.incursion = this.incursion || new Set();
        const landedStrip = ph === 'TAXI_IN' && this.flight.arr.rwyStrip === ref;
        if (!landedStrip && !this.crossOK.has(ref) && !this.incursion.has(ref)) {
          this.incursion.add(ref);
          return this._atc(this.M(cs, ',', this.T('arrêtez immédiatement, vous êtes sur la piste', 'stop immediately, you are on runway'), this.rwyPair(ref), this.T('sans autorisation', 'without clearance')));
        }
      }

      // --- Infos trafic en route (Départ, Contrôle, Approche) ---
      if (airborne && this.traffic && this.traffic.trafficInfo && ['CLIMB', 'CRUISE', 'DESCENT', 'APPROACH'].includes(ph) && this.now - (this.lastTfc || 0) > 45000) {
        const ti = this.traffic.trafficInfo(t);
        if (ti) {
          this.lastTfc = this.now;
          const dz = Math.abs(ti.dz), up = ti.dz > 0, pl = ti.nm > 1;
          const lvl = ti.dz === 0 ? this.T('même niveau', 'same level') : this.T(`${dz} pieds ${up ? 'au-dessus' : 'au-dessous'}`, `${dz} feet ${up ? 'above' : 'below'}`, { es: `${dz} pies ${up ? 'por encima' : 'por debajo'}`, de: `${dz} Fuß ${up ? 'höher' : 'tiefer'}`, it: `${dz} piedi ${up ? 'sopra' : 'sotto'}`, pt: `${dz} pés ${up ? 'acima' : 'abaixo'}` });
          const ck = { es: `${ti.clock}`, de: `${ti.clock} Uhr`, it: `${ti.clock}`, pt: `${ti.clock} horas` };
          const clk = { text: this.T(`${ti.clock} heures`, `${ti.clock} o'clock`, ck), speech: this.T(`${ti.clock === 1 ? 'une heure' : ti.clock + ' heures'}`, `${ti.clock} o'clock`, ck) };
          const nm = this.T(`${ti.nm} nautique${pl ? 's' : ''}`, `${ti.nm} mile${pl ? 's' : ''}`, { es: `${ti.nm} milla${pl ? 's' : ''}`, de: `${ti.nm} Meile${pl ? 'n' : ''}`, it: `${ti.nm} migli${pl ? 'a' : 'o'}`, pt: `${ti.nm} milha${pl ? 's' : ''}` });
          const type = ti.type ? { text: ti.type, speech: ti.type.replace(/^A(\d)/, 'A $1') } : null;
          const m = this.M(cs, ',', this.T('trafic à', 'traffic', { es: 'tráfico a las', de: 'Verkehr auf', it: 'traffico a ore', pt: 'tráfego às' }), clk, ',', nm, ',', lvl, type ? [',', this.T('un', 'a'), type] : null);
          const rb = this.M(this.T('Recherchons le trafic', 'Looking out'), ',', cs);
          return this._instruct(m, rb, null);
        }
      }

      // --- Déclencheurs automatiques ---
      switch (ph) {
        case 'TAKEOFF':
          if (airborne && (t.agl == null ? this.curAlt() - (f.dep.elev || 0) > 800 : t.agl > 800)) {
            return this._handoff('DEP', 'dep', null, () => { this.phase = 'DEP_CHECKIN'; });
          }
          break;
        case 'CLIMB': {
          const a = this.curAlt();
          if (this.station.role === 'DEP' && a != null && a >= this.cleared - 1500) {
            this.flags.ctrIdx = 1;
            return this._handoff('CTR', 'ctr1', null, () => { this.phase = 'CTR_CHECKIN'; });
          }
          if (this.station.role === 'CTR' && a != null && this.cleared >= this.target && a >= this.target - 300) { this.phase = 'CRUISE'; this.clearDir = 'level'; this.onChange(); }
          break;
        }
        case 'CRUISE': {
          if (dArr == null) break;
          const tod = this.tod();
          const a = this.curAlt();
          if (this.clearDir !== 'level' && a != null && Math.abs(a - this.cleared) < 200) { this.clearDir = 'level'; this.onChange(); }
          if (f.cruise > 12000 && dArr <= tod && !this.flags.descent) return this._giveDescent(true);
          if (f.cruise <= 12000 && dArr < 45) return this._handoff('APP', 'arr', null, () => { this.phase = 'APP_CHECKIN'; });
          if (!this.flags.midHandoff && f.total > 120 && dDep > f.total / 2 && dArr > tod + 30 && this.station.side === 'ctr1') {
            this.flags.midHandoff = true; this.flags.ctrIdx = 2;
            return this._handoff('CTR', 'ctr2', null, () => { this.phase = 'CTR_CHECKIN'; });
          }
          // Offre différée après un refus (trafic)
          if (this.offer && this.now >= this.offer.at && dArr > tod + 20) {
            const lvl = this.offer.alt; this.offer = null;
            if (lvl !== this.target) return this._levelClearance(lvl, 'offer');
          } else if (this.offer && dArr <= tod + 20) this.offer = null;
          // Paliers prévus dans le plan SimBrief
          const step = this.nextStep();
          if (step && !this.offer && this.clearDir === 'level') {
            const dDepFix = distNm(f.dep, step), dFix = distNm(t, step);
            if (dArr <= tod + 20) { step.done = true; }
            else if (dFix < 6 || dDep >= dDepFix - 2) {
              step.done = true;
              if (step.alt !== this.target) return this._levelClearance(step.alt, 'step', step);
            }
          }
          break;
        }
        case 'DESCENT':
          if (dArr != null && (dArr < 45 || (this.curAlt() < 12000 && dArr < 70))) {
            return this._handoff('APP', 'arr', null, () => { this.phase = 'APP_CHECKIN'; });
          }
          break;
        case 'APPROACH':
          if (this._nextDescentStep(dArr)) return;
          if (dArr != null && ((dArr < 18 && this.cleared != null && this.cleared <= f.appAlt + 100) || dArr < 12)) return this._approachClearance();
          break;
        case 'FINAL':
          if (dArr != null && dArr < 8) return this._handoff('TWR', 'arr', null, () => { this.phase = 'TWR_CHECKIN'; });
          break;
        case 'TWR_CHECKIN':
          if (this.station.role === 'TWR' && this.flags.contApp && !t.onGround) {
            if (!(this.traffic && this.traffic.landingBlock())) return this._landingClearance(true);
            if (dArr != null && dArr < 0.8) return this._atcGoAround();
            break;
          }
          if (this.station.role === 'TWR' && dArr != null && dArr < 3.5 && !t.onGround && !this.flags.twrClr) { this.flags.twrClr = true; return this._landingClearance(true); }
          break;
        case 'HOLDING':
          if (this.flags.waitDep && !(this.traffic && this.traffic.departureBlock())) {
            this.flags.waitDep = false;
            const m = this.M(cs, ',', this.wind('dep'), ',', this.T('piste', 'runway'), this.rwy('dep'), ',', this.T('autorisé décollage', 'cleared for take-off'));
            const rb = this.M(this.T('Autorisé décollage piste', 'Cleared for take-off runway'), this.rwy('dep'), ',', cs);
            return this._instruct(m, rb, () => { this.phase = 'TAKEOFF'; });
          }
          break;
        case 'LANDING':
          if (t.onGround && t.gs < 60) return this._vacate();
          break;
        case 'TAXI_IN':
          if (t.gs < 1 && t.parkingBrake && t.engineOn === false && !this.flags.autoEnd) { this.flags.autoEnd = true; return this.pilotAction('on_stand'); }
          break;
      }
      if (['APPROACH', 'FINAL', 'TWR_CHECKIN', 'APP_CHECKIN'].includes(ph) && t.onGround && this.flags.wasAirborne && dArr != null && dArr < 3) {
        this.phase = 'LANDING';
        this.station = this._st('TWR', 'arr');
        return this._atc(this.M(cs, ',', this.T("atterrissage sans autorisation noté.", 'landing without clearance noted.')));
      }
      if (airborne) this.flags.wasAirborne = true;
    }

    tod() {
      const f = this.flight; const a = this.curAlt();
      return ((Math.max(this.target || f.cruise, a || 0) - (f.arr.elev || 0)) / 1000) * 3 + 10;
    }
    nextStep() { return this.flight ? this.flight.steps.find((x) => !x.done) : null; }
    _levelClearance(lvl, reason, step) {
      const f = this.flight, up = lvl > (this.curAlt() || this.target);
      const alt = this.alt(lvl, f.dep.ta);
      const fx = step && step.fix;
      const pre = reason === 'step' ? this.T(`pour votre palier${fx ? ' à ' + fx : ''},`, `for your step climb${fx ? ' at ' + fx : ''},`, { es: `para su ascenso escalonado${fx ? ' en ' + fx : ''},`, de: `für Ihre Stufe${fx ? ' bei ' + fx : ''},`, it: `per il vostro cambio di livello${fx ? ' a ' + fx : ''},`, pt: `para sua mudança de nível${fx ? ' em ' + fx : ''},` })
        : reason === 'offer' ? this.T('niveau demandé maintenant disponible,', 'requested level now available,') : null;
      const msg = this.M(this.cs(), ',', pre, up ? this.T('montez', 'climb') : this.T('descendez', 'descend'), alt);
      const rb = this.M(up ? this.T('Montons', 'Climb') : this.T('Descendons', 'Descend'), alt, ',', this.cs());
      this._instruct(msg, rb, () => { this.target = lvl; this._setCleared(lvl); this.clearDir = up ? 'up' : 'down'; this.phase = 'CRUISE'; });
    }
    levelOptions() {
      if (!this.flight) return [];
      const cur = Math.round((this.target || this.flight.cruise) / 1000) * 10, out = [];
      for (let fl = Math.max(100, cur - 60); fl <= Math.min(450, cur + 60); fl += 10) if (fl * 100 !== this.target) out.push(fl * 100);
      return out;
    }

    _giveDescent(atcInitiated) {
      const f = this.flight;
      this.flags.descent = true;
      const target = f.descAlt;
      const alt = this.alt(target, f.arr.tl);
      const q = target < f.arr.tl ? [',', this.qnh('arr')] : null;
      const msg = this.M(this.cs(), ',', this.T('descendez', 'descend'), alt, q, atcInitiated ? this.T(', à votre convenance', ', when ready') : null);
      const rb = this.M(this.T('Descendons', 'Descend'), alt, q, ',', this.cs());
      this._instruct(msg, rb, () => { this._setCleared(target); this.clearDir = 'down'; this.phase = 'DESCENT'; });
    }
    // vitesse : « 220 nœuds » / « two two zero knots »
    spd(kt) {
      const l = this.lang;
      const w = { fr: 'nœuds', en: 'knots', es: 'nudos', de: 'Knoten', it: 'nodi', pt: 'nós' }[l] || 'knots';
      return { text: `${kt} kt`, speech: l === 'en' ? `${digits(String(kt), 'en')} ${w}` : `${kt} ${w}` };
    }
    // consigne de vitesse en finale : « réduisez 160 nœuds jusqu'à 4 nautiques »
    finalSpeed() {
      const kt = 160, nm = 4;
      const until = this.T(`jusqu'à ${nm} nautiques de la piste`, `until ${nm} miles final`, { es: `hasta ${nm} millas en final`, de: `bis ${nm} Meilen Endanflug`, it: `fino a ${nm} miglia in finale`, pt: `até ${nm} milhas na final` });
      return {
        atc: [this.T('réduisez', 'reduce speed', { es: 'reduzca velocidad', de: 'reduzieren Sie auf', it: 'riducete velocità', pt: 'reduza velocidade' }), this.spd(kt), until],
        rb: [this.T('réduisons', 'reducing', { es: 'reducimos', de: 'reduzieren auf', it: 'riduciamo', pt: 'reduzindo' }), this.spd(kt), until],
      };
    }
    // ----- paliers de descente d'approche -----
    descentLadder() {
      const f = this.flight;
      return [...new Set([11000, 9000, 7000, 6000, 5000, 4000].filter((l) => l > f.appAlt && l <= f.descAlt).concat([f.appAlt]))].sort((a, b) => b - a);
    }
    // distance (NM) à partir de laquelle on peut descendre au palier l (pente d'environ 3°, avec de la marge)
    stepGate(l) { return (l - (this.flight.arr.elev || 0)) / 300 + 8; }
    // palier le plus bas autorisé à cette distance, strictement sous « below »
    stepFor(d, below) {
      const L = this.descentLadder().filter((l) => l < below && this.stepGate(l) >= d);
      return L.length ? Math.min(...L) : null;
    }
    _descentMsg(lvl) {
      const f = this.flight, cur = this.curAlt();
      const verb = cur != null && cur <= lvl + 200 ? this.T('maintenez', 'maintain') : this.T('descendez', 'descend');
      const q = lvl < f.arr.tl ? [',', this.qnh('arr')] : null;
      const rbv = cur != null && cur <= lvl + 200 ? this.T('Maintenons', 'Maintaining') : this.T('Descendons', 'Descend');
      return { m: this.M(this.cs(), ',', verb, this.alt(lvl, f.arr.tl), q), rb: this.M(rbv, this.alt(lvl, f.arr.tl), q, ',', this.cs()) };
    }
    // palier suivant quand l'avion est stabilisé au palier précédent
    _nextDescentStep(dArr) {
      const f = this.flight, cur = this.curAlt();
      if (cur == null || dArr == null || this.cleared == null || this.cleared <= f.appAlt) return false;
      if (cur > this.cleared + 400) return false;
      const next = this.stepFor(dArr, this.cleared);
      if (next == null) return false;
      const x = this._descentMsg(next);
      this._instruct(x.m, x.rb, () => { this._setCleared(next); this.clearDir = 'down'; });
      return true;
    }
    // altitude minimale de la procédure (indicative, à vérifier sur la carte)
    minimums() {
      const f = this.flight, k = this.apKind(), elev = Math.round(f.arr.elev || 0);
      const h = { ILS: 200, LOC: 400, RNAV: 350, VOR: 500, NDB: 600, VIS: 0 }[k];
      return { kind: k, h, alt: elev + h };
    }
    // Meilleure procédure pour la piste d'arrivée : ILS > localizer > RNAV > VOR > NDB > à vue
    apKind() {
      const f = this.flight, list = f && f.arr.approaches;
      if (!list || !list.length) return 'ILS'; // pas de donnée : ILS par défaut
      const rw = String(f.arr.rwy || '').toUpperCase(), num = rw.replace(/[LRC]$/, '');
      const mine = list.filter((a) => a.rwy === rw || (!/[LRC]$/.test(a.rwy) && a.rwy === num));
      for (const k of ['ILS', 'LOC', 'RNAV', 'VOR', 'NDB']) if (mine.some((a) => a.kind === k)) return k;
      return 'VIS';
    }
    apWord() {
      const k = this.apKind();
      return { kind: k, fr: k === 'LOC' ? 'localizer' : k === 'VIS' ? 'à vue' : k, en: k === 'LOC' ? 'localizer' : k === 'VIS' ? 'visual' : k };
    }
    // conseil au pilote (interface) : quelle approche préparer et comment
    approachAdvice() {
      const f = this.flight, a = this.apWord(), list = f.arr.approaches, rw = f.arr.rwy;
      const have = list && list.length ? [...new Set(list.filter((x) => x.rwy === rw || (!/[LRC]$/.test(x.rwy) && x.rwy === String(rw).replace(/[LRC]$/, ''))).map((x) => x.kind === 'LOC' ? 'LOC' : x.kind))] : null;
      const hv = have && have.length ? have.join(', ') : null;
      const frTip = { ILS: "Affichez la fréquence ILS dans le FMC/la radio nav, puis armez APPR.", LOC: "Pas de guidage vertical : suivez le localizer et descendez selon la procédure (LOC/APPR en latéral).", RNAV: "Chargez l'approche RNAV (GNSS) dans le FMC, vérifiez le FAF, puis armez APPR.", VOR: "Réglez le VOR de la piste sur la radio nav et suivez la radiale ; descente par paliers selon la carte.", NDB: "Réglez la balise NDB sur l'ADF et suivez le relèvement ; descente par paliers selon la carte.", VIS: "Aucune approche aux instruments publiée pour cette piste : approche à vue (PAPI, trajectoire à 3°)." };
      const enTip = { ILS: 'Set the ILS frequency in the FMC / nav radio, then arm APPR.', LOC: 'No glide path: fly the localizer and descend per the chart.', RNAV: 'Load the RNAV (GNSS) approach in the FMC, check the FAF, then arm APPR.', VOR: 'Tune the runway VOR and follow the radial; step-down descent per the chart.', NDB: 'Tune the NDB on the ADF and follow the bearing; step-down descent per the chart.', VIS: 'No instrument approach published for this runway: visual approach (PAPI, 3° path).' };
      const tail = hv ? this.U(` Disponibles : ${hv}.`, ` Available: ${hv}.`) : this.U(' (procédures non lues dans MSFS : ILS supposé).', ' (procedures not read from MSFS: ILS assumed).');
      const lad = this.descentLadder().filter((l) => l <= (this.cleared || 99999)), mn = this.minimums();
      const ladTxt = lad.length ? lad.join(' → ') + ' ft' : null;
      const minFr = a.kind === 'VIS' ? ' Pas de minimum publié : stabilisé à 1000 ft sol, PAPI 3°.' : ` Altitude minimale ${mn.alt} ft (${mn.h} ft sol) : remettez les gaz si la piste n'est pas en vue.`;
      const minEn = a.kind === 'VIS' ? ' No published minimum: stabilised by 1000 ft AGL, PAPI 3°.' : ` Minimum altitude ${mn.alt} ft (${mn.h} ft AGL): go around if the runway is not in sight.`;
      return this.U(`Approche conseillée piste ${rw} : ${a.kind === 'VIS' ? 'à vue' : a.fr}. ${frTip[a.kind]}${tail}${ladTxt ? ' Paliers de descente : ' + ladTxt + '.' : ''}${minFr} (valeurs indicatives, voir la carte)`, `Recommended approach runway ${rw}: ${a.kind === 'VIS' ? 'visual' : a.en}. ${enTip[a.kind]}${tail}${ladTxt ? ' Step-down levels: ' + ladTxt + '.' : ''}${minEn} (indicative, check the chart)`);
    }
    _approachClearance(afterGoAround) {
      const ap = this.apWord();
      const ils = this.T(`approche ${ap.fr} piste`, `${ap.en} approach runway`);
      const fs = this.finalSpeed();
      const msg = this.M(this.cs(), ',', afterGoAround ? this.T('identifié radar,', 'radar contact,') : null, this.T('autorisé', 'cleared'), ils, this.rwy('arr'), ',', fs.atc, ',', this.T('rappelez établi', 'report established'));
      const rb = this.M(this.T(`Autorisé ${ap.fr} piste`, `Cleared ${ap.en} runway`), this.rwy('arr'), ',', fs.rb, ',', this.T('rappellerons établi', 'wilco'), ',', this.cs());
      this._instruct(msg, rb, () => { this.phase = 'FINAL'; this.flags.appClr = true; this.clearDir = 'down'; this.cleared = this.flight.appAlt; });
    }
    _landingClearance(unprompted) {
      const blk = this.traffic && this.traffic.landingBlock();
      if (blk) {
        this.flags.contApp = true;
        const m = this.M(this.cs(), ',', unprompted ? [this.station.name, ','] : null, this.T('continuez l\'approche,', 'continue approach,'), blk.reason === 'departure' ? this.T('trafic au départ,', 'departing traffic,') : this.T('trafic sur la piste,', 'traffic on the runway,'), this.traffic.typeSay(blk.who));
        const rb = this.M(this.T('Continuons', 'Continuing'), ',', this.cs());
        this._instruct(m, rb, () => { this.phase = 'TWR_CHECKIN'; this.station = this._st('TWR', 'arr'); });
        return;
      }
      this.flags.contApp = false;
      const msg = this.M(this.cs(), ',', unprompted ? [this.station.name, ','] : null, this.wind('arr'), ',', this.T('piste', 'runway'), this.rwy('arr'), ',', this.T('autorisé atterrissage', 'cleared to land'));
      const rb = this.M(this.T('Autorisé atterrissage piste', 'Cleared to land runway'), this.rwy('arr'), ',', this.cs());
      this._instruct(msg, rb, () => { this.phase = 'LANDING'; });
    }
    _atcGoAround() {
      const f = this.flight, cs = this.cs(), ap = this._st('APP', 'arr');
      this.flags.contApp = false;
      const m = this.M(cs, ',', this.T('remettez les gaz, je répète, remettez les gaz, montez', 'go around, I say again, go around, climb'), this.alt(f.appAlt, f.arr.tl), ',', this.T('contactez', 'contact'), ap.name, this.fq(ap.freq));
      const rb = this.M(this.T('Remettons les gaz, montons', 'Going around, climb'), this.alt(f.appAlt, f.arr.tl), ',', ap.name, this.fq(ap.freq), ',', cs);
      this._instruct(m, rb, () => { this.station = ap; this.flags.goAround = true; this.flags.twrClr = false; this._setCleared(f.appAlt); this.clearDir = 'up'; this.phase = 'APP_CHECKIN'; });
    }
    _vacate() {
      const g = this._st('GND', 'arr');
      const msg = this.M(this.cs(), ',', this.T('dégagez dès que possible, contactez', 'vacate when able, contact'), g.name, this.fq(g.freq), this.T('une fois dégagé', 'when vacated'));
      const rb = this.M(this.T('Dégageons,', 'Wilco,'), g.name, this.fq(g.freq), ',', this.cs());
      this.phase = 'VACATING';
      this._instruct(msg, rb, () => { this.station = g; });
    }

    // ----- actions du pilote -----
    actions() {
      if (!this.flight || this.phase === 'IDLE') return [];
      if (this.busy) return [];
      if (this.pending) return [{ id: 'readback', label: this.U('Collationner', 'Read back'), preview: this.pending.readback.text, primary: true }];
      const L = (fr, en) => this.U(fr, en);
      const list = [];
      const add = (id, label, primary) => { const m = this.withLang(this.pilotLang(), () => this._pilotMsg(id)); if (m) list.push({ id, label, preview: m.text, primary: !!primary }); };
      switch (this.phase) {
        case 'PRE': add('req_clearance', L('Demander la clearance', 'Request clearance'), true); break;
        case 'CLEARED': add('req_push', L('Repoussage + mise en route', 'Push-back + start-up'), true); add('req_start', L('Mise en route seule', 'Start-up only')); break;
        case 'STARTUP': add('req_taxi', L('Prêt à rouler', 'Ready to taxi'), true); break;
        case 'TAXI_OUT': if (this.crossAhead()) add('cross_req', this.crossLabel(), true); add('at_holding', L("Au point d'arrêt", 'At holding point'), !this.crossAhead()); break;
        case 'HOLDING': if (!this.flags.waitDep) add('ready_dep', L('Prêt au départ', 'Ready for departure'), true); break;
        case 'DEP_CHECKIN': case 'CTR_CHECKIN': case 'APP_CHECKIN': add('checkin', L('Premier contact', 'Check in'), true); break;
        case 'CRUISE': {
          const d = this.dist().arr, tod = this.tod();
          if (this.flight.cruise > 12000 && !this.flags.descent && (d == null || d < tod + 60)) add('req_descent', L('Demander la descente', 'Request descent'));
          if (d == null || d > tod + 20) list.push({ id: 'req_level', label: L('Demander un niveau', 'Request level'), preview: L('Choisissez un niveau de vol', 'Choose a flight level'), needsLevel: true, options: this.levelOptions() });
          break;
        }
        case 'CLIMB':
          if (this.station && this.station.role === 'CTR') list.push({ id: 'req_level', label: L('Demander un niveau', 'Request level'), preview: L('Choisissez un niveau de vol', 'Choose a flight level'), needsLevel: true, options: this.levelOptions() });
          break;
        case 'FINAL': add('established', L('Établi ' + this.apWord().fr, 'Established'), true); break;
        case 'TWR_CHECKIN': add('checkin_twr', L('Premier contact Tour', 'Check in with Tower'), true); break;
        case 'LANDING': add('go_around', L('Remise de gaz', 'Going around')); break;
        case 'VACATING': add('vacated', L('Piste dégagée', 'Runway vacated'), true); break;
        case 'TAXI_IN': if (this.crossAhead()) add('cross_req', this.crossLabel(), true); add('on_stand', L('Au parking', 'On stand'), !this.crossAhead()); break;
        case 'DONE': break;
      }
      if (['PRE', 'CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'CLIMB', 'CRUISE', 'DESCENT', 'APPROACH'].includes(this.phase)) add('req_notam', L('Infos piste (NOTAM)', 'Runway info (NOTAM)'));
      return list;
    }

    _pilotMsg(id, arg) {
      const f = this.flight, cs = this.cs();
      const stName = this.station ? this._st(this.station.role, this.station.side).name : null;
      const st = stName ? { text: stName, speech: stName } : '';
      const a = this.curAlt();
      switch (id) {
        case 'readback': return this.pending && this.pending.readback;
        case 'req_clearance': return this.M(st, ',', cs, ',', this.T('bonjour, demande clearance IFR pour', 'request IFR clearance to'), { text: f.arr.city, speech: f.arr.city }, ',', this.T('information', 'information'), this.atisLetter('dep'));
        case 'req_push': return this.M(st, ',', cs, ',', this.T('demande repoussage et mise en route', 'request push-back and start-up'));
        case 'req_start': return this.M(st, ',', cs, ',', this.T('demande mise en route', 'request start-up'));
        case 'req_taxi': return this.M(st, ',', cs, ',', this.T('prêt à rouler', 'ready to taxi'));
        case 'at_holding': return this.M(cs, ',', this.T("au point d'arrêt piste", 'holding point runway'), this.rwy('dep'));
        case 'ready_dep': return this.M(st, ',', cs, ',', this.T("point d'arrêt piste", 'holding point runway'), this.rwy('dep'), ',', this.T('prêt au départ', 'ready for departure'));
        case 'checkin': {
          const ref = this.phase === 'APP_CHECKIN' ? f.arr.tl : f.dep.ta;
          const cur = a != null ? this.alt(Math.round(a / 100) * 100, ref) : null;
          if (this.phase === 'APP_CHECKIN') {
            if (this.flags.goAround) return this.M(st, ',', cs, ',', this.T('remise de gaz, montée', 'missed approach, climbing'), this.alt(f.appAlt, f.arr.tl));
            const lvl = this.cleared != null && a != null && Math.abs(a - this.cleared) < 300;
            return this.M(st, ',', cs, ',', cur && !lvl ? [this.T('passant', 'passing'), cur, ','] : null, this.cleared ? [this.T('descente', 'descending'), this.alt(this.cleared, f.arr.tl), ','] : null, this.T('information', 'information'), this.atisLetter('arr'));
          }
          const level = this.cleared != null && a != null && Math.abs(a - this.cleared) < 300;
          if (level) return this.M(st, ',', cs, ',', this.alt(this.cleared, f.dep.ta));
          const climbTo = this.phase === 'DEP_CHECKIN' ? f.initAlt : this.cleared;
          return this.M(st, ',', cs, ',', cur ? [this.T('passant', 'passing'), cur, ','] : null, this.T('montée', 'climbing'), this.alt(climbTo || f.initAlt, f.dep.ta));
        }
        case 'req_descent': return this.M(st, ',', cs, ',', this.T('prêt pour la descente', 'ready for descent'));
        case 'cross_req': { const c = this.crossAhead(); return c ? this.M(st, ',', cs, ',', this.T('avant la piste', 'holding short runway'), this.rwyPair(c)) : null; }
        case 'req_notam': { const a = this.flight[this.notamSide()]; return this.M(st, ',', cs, ',', this.T('demande état des pistes à', 'request runway status at'), { text: a.city, speech: a.city }); }
        case 'req_level': return arg ? this.M(st, ',', cs, ',', this.T('demande', 'request'), this.alt(arg, 0)) : null;
        case 'established': { const ap = this.apWord(); return this.M(cs, ',', this.T(`établi ${ap.fr} piste`, `established ${ap.en} runway`), this.rwy('arr')); }
        case 'checkin_twr': { const ap = this.apWord(); return this.M(st, ',', cs, ',', this.T(`établi ${ap.fr} piste`, `established ${ap.en} runway`), this.rwy('arr')); }
        case 'go_around': return this.M(cs, ',', this.T('remise de gaz', 'going around'));
        case 'vacated': return this.M(st, ',', cs, ',', this.T('piste', 'runway'), this.rwy('arr'), this.T('dégagée', 'vacated'));
        case 'on_stand': return this.M(cs, ',', this.T('au parking, merci et au revoir', 'on stand, thanks, good day'));
        case 'radio_check': return this.station ? this.M(st, ',', cs, ',', this.T('essai radio', 'radio check', { es: 'prueba de radio', de: 'Radiocheck', it: 'prova radio', pt: 'teste de rádio' }), this.fq(this.station.freq)) : null;
      }
      return null;
    }

    pilotAction(id, arg) {
      if (!this.flight || this.busy) return;
      // Règle OACI (mode auto) : le contrôleur comprend l'anglais et la langue de son pays.
      if (this.radioMode === 'auto' && id !== 'readback') {
        const P = this.speak || 'en', loc = this.stationLang();
        if (P !== 'en' && P !== loc) {
          const said = this.withLang(P, () => this._pilotMsg(id, arg));
          if (!said) return;
          this.withLang(P, () => this._pilot(said));
          this.withLang('en', () => this._atc(this.M(this.cs(), ',', 'I do not understand, say again in English.')));
          this.onChange();
          return;
        }
        this.setLang(P);
      }
      const msg = this._pilotMsg(id, arg);
      if (!msg) return;
      this._pilot(msg);
      const f = this.flight, cs = this.cs();
      switch (id) {
        case 'radio_check': {
          // « je vous reçois 5 sur 5 » : ne change rien au déroulement du vol
          const stName = this._st(this.station.role, this.station.side).name;
          this._atc(this.M(cs, ',', { text: stName, speech: stName }, ',', this.T('je vous reçois 5 sur 5', 'readability 5', { es: 'le recibo 5', de: 'Verständlichkeit 5', it: 'vi ricevo 5', pt: 'leitura 5' })));
          break;
        }
        case 'readback': { const after = this.pending.after; this.pending = null; if (after) after(); break; }
        case 'req_clearance': {
          const sid = this.sid();
          const dest = { text: f.arr.city, speech: f.arr.city };
          const chg = f.dep.rwyChange && f.dep.rwyChange.to ? [this.closureMsg({ rwys: [f.dep.rwyChange.from], until: f.dep.rwyChange.until, works: f.dep.rwyChange.works }), ','] : null;
          const msg2 = this.M(cs, ',', chg, this.T('autorisé', 'cleared to'), dest,
            sid ? [this.T(', départ', 'via', { es: ', salida', de: ',', it: ', partenza', pt: ', saída' }), sid, this.T('', 'departure', { es: '', de: 'Abflug', it: '', pt: '' })] : this.T(', comme déposé', 'as filed'), ',',
            this.T('piste', 'runway'), this.rwy('dep'), ',', this.T('montée initiale', 'climb initially'), this.alt(f.initAlt, f.dep.ta), ',',
            this.T('transpondeur', 'squawk'), { text: f.squawk, speech: digits(f.squawk, this.lang) });
          const rb = this.M(this.T('Autorisé', 'Cleared to'), dest, sid ? [this.T(', départ', 'via', { es: ', salida', de: ',', it: ', partenza', pt: ', saída' }), sid, this.T('', 'departure', { es: '', de: 'Abflug', it: '', pt: '' })] : this.T(', comme déposé', 'as filed'), ',', this.T('piste', 'runway'), this.rwy('dep'), ',',
            this.T('montée initiale', 'climb initially'), this.alt(f.initAlt, f.dep.ta), ',', this.T('transpondeur', 'squawk'), { text: f.squawk, speech: digits(f.squawk, this.lang) }, ',', cs);
          this._instruct(msg2, rb, () => {
            this._setCleared(f.initAlt);
            if (this.station.role === 'DEL') {
              const g = this._st('GND', 'dep');
              const m3 = this.M(cs, ',', this.T('collationnement correct, contactez', 'readback correct, contact'), g.name, this.fq(g.freq), this.T('pour la mise en route, au revoir', 'for start-up, good day'));
              this._instruct(m3, this.M(this.fq(g.freq), ',', this.T('au revoir', 'good day'), ',', cs), () => { this.station = g; this.phase = 'CLEARED'; });
            } else {
              this._atc(this.M(cs, ',', this.T('collationnement correct, rappelez prêt pour la mise en route', 'readback correct, report ready for start-up')), () => { this.phase = 'CLEARED'; });
            }
          });
          break;
        }
        case 'req_push': case 'req_start': {
          const what = id === 'req_push' ? this.T('repoussage et mise en route approuvés', 'push-back and start-up approved') : this.T('mise en route approuvée', 'start-up approved');
          // orientation après repoussage (d'après l'itinéraire de roulage) : « face à l'est »
          const face = id === 'req_push' && f.dep.pushFace != null ? this.faceSay(f.dep.pushFace) : null;
          const m = this.M(cs, ',', what, face ? [',', face] : null, ',', this.qnh('dep'));
          const rb = this.M(what.charAt(0).toUpperCase() + what.slice(1), face ? [',', face] : null, ',', this.qnh('dep'), ',', cs);
          this._instruct(m, rb, () => { this.phase = 'STARTUP'; if (id === 'req_push') { this.flags.pushApproved = true; if (this.onPush) this.onPush(f.dep.pushFace); } });
          break;
        }
        case 'req_taxi': {
          const via = this.via(f.dep.taxiVia);
          const hs = f.dep.crossings && f.dep.crossings.length ? this.holdShort(f.dep.crossings[0]) : null;
          const m = this.M(cs, ',', this.T("roulez point d'arrêt piste", 'taxi to holding point runway'), this.rwy('dep'), via ? [',', this.T('via', 'via'), via] : null, hs ? [',', hs.atc] : null);
          const rb = this.M(this.T("Roulons point d'arrêt piste", 'Taxi to holding point runway'), this.rwy('dep'), via ? [',', this.T('via', 'via'), via] : null, hs ? [',', hs.pilot] : null, ',', cs);
          this._instruct(m, rb, () => { this.phase = 'TAXI_OUT'; this.crossOK = new Set(); this.incursion = new Set(); });
          break;
        }
        case 'at_holding': this._handoff('TWR', 'dep', null, () => { this.phase = 'HOLDING'; }); break;
        case 'ready_dep': {
          const blk = this.traffic && this.traffic.departureBlock();
          if (blk) {
            const why = blk.reason === 'final' ? this.T('trafic en courte finale,', 'traffic on short final,') : blk.reason === 'landing' ? this.T('trafic à l\'atterrissage,', 'landing traffic,') : this.T('trafic au départ,', 'departing traffic,');
            const m = this.M(cs, ',', this.T('maintenez position,', 'hold position,'), why, this.traffic.typeSay(blk.who));
            const rb = this.M(this.T('Maintenons position', 'Holding position'), ',', cs);
            this.flags.waitDep = true;
            this._instruct(m, rb, null);
            break;
          }
          const takeoff = () => {
            const m = this.M(cs, ',', this.wind('dep'), ',', this.T('piste', 'runway'), this.rwy('dep'), ',', this.T('autorisé décollage', 'cleared for take-off'));
            const rb = this.M(this.T('Autorisé décollage piste', 'Cleared for take-off runway'), this.rwy('dep'), ',', cs);
            return [m, rb];
          };
          if (this.rand() < 0.4) {
            const m = this.M(cs, ',', this.T('alignez-vous piste', 'line up and wait runway'), this.rwy('dep'), this.T('et maintenez', ''));
            const rb = this.M(this.T('Alignons et maintenons piste', 'Line up and wait runway'), this.rwy('dep'), ',', cs);
            this._instruct(m, rb, () => {
              this.phase = 'LINEUP';
              const [m2, rb2] = takeoff();
              this._instruct(m2, rb2, () => { this.phase = 'TAKEOFF'; }, 15000 + this.rand() * 25000);
            });
          } else {
            const [m, rb] = takeoff();
            this._instruct(m, rb, () => { this.phase = 'TAKEOFF'; });
          }
          break;
        }
        case 'checkin': {
          if (this.phase === 'DEP_CHECKIN') {
            const lvl = f.depLevel;
            const m = this.M(cs, ',', this.T('identifié radar, montez', 'radar contact, climb'), this.alt(lvl, f.dep.ta));
            const rb = this.M(this.T('Montons', 'Climb'), this.alt(lvl, f.dep.ta), ',', cs);
            this._instruct(m, rb, () => { this._setCleared(lvl); this.clearDir = 'up'; this.phase = 'CLIMB'; });
          } else if (this.phase === 'CTR_CHECKIN') {
            if ((this.cleared || 0) < this.target) {
              const m = this.M(cs, ',', this.T('identifié radar, montez', 'radar contact, climb'), this.alt(this.target, f.dep.ta));
              const rb = this.M(this.T('Montons', 'Climb'), this.alt(this.target, f.dep.ta), ',', cs);
              this._instruct(m, rb, () => { this._setCleared(this.target); this.clearDir = 'up'; this.phase = 'CLIMB'; });
            } else {
              this._atc(this.M(cs, ',', this.T('identifié radar', 'radar contact')), () => { this.phase = (this.curAlt() != null && this.curAlt() < this.target - 300) ? 'CLIMB' : 'CRUISE'; });
            }
          } else if (this.phase === 'APP_CHECKIN') {
            if (this.flags.goAround) { this.flags.goAround = false; this._approachClearance(true); break; }
            const ap = this.apWord();
            const dist0 = this.dist().arr;
            const lvl0 = this.stepFor(dist0 == null ? 0 : dist0, Infinity), lvlA = lvl0 != null ? Math.min(lvl0, this.cleared != null ? this.cleared : lvl0) : (this.cleared != null ? this.cleared : f.descAlt);
            const alt = this.alt(lvlA, f.arr.tl);
            const chgA = f.arr.rwyChange && f.arr.rwyChange.to ? [this.closureMsg({ rwys: [f.arr.rwyChange.from], until: f.arr.rwyChange.until, works: f.arr.rwyChange.works }), ','] : null;
            // vitesse d'approche intermédiaire
            const sp = [this.T('réduisez', 'reduce speed', { es: 'reduzca velocidad', de: 'reduzieren Sie auf', it: 'riducete velocità', pt: 'reduza velocidade' }), this.spd(220)];
            const spR = [this.T('réduisons', 'reducing', { es: 'reducimos', de: 'reduzieren auf', it: 'riduciamo', pt: 'reduzindo' }), this.spd(220)];
            const m = this.M(cs, ',', this.T('identifié radar, descendez', 'radar contact, descend'), alt, ',', this.qnh('arr'), ',', sp, ',', chgA, this.T(`prévoyez approche ${ap.fr} piste`, `expect ${ap.en} approach runway`), this.rwy('arr'));
            const rb = this.M(this.T('Descendons', 'Descend'), alt, ',', this.qnh('arr'), ',', spR, ',', this.T(`${ap.fr} piste`, `${ap.en} runway`), this.rwy('arr'), ',', cs);
            this._instruct(m, rb, () => { this._setCleared(lvlA); this.clearDir = 'down'; this.phase = 'APPROACH'; this._sys(this.approachAdvice()); });
          }
          break;
        }
        case 'req_descent': this._giveDescent(false); break;
        case 'cross_req': {
          const ref = this.crossAhead(); if (!ref) break;
          const busy = this.traffic && this.traffic.stripBusy && this.traffic.stripBusy(ref);
          if (busy) {
            const m = this.M(cs, ',', this.T('maintenez avant la piste', 'hold short runway'), this.rwyPair(ref), ',', busy.reason === 'landing' ? this.T('trafic à l\'atterrissage', 'landing traffic') : this.T('trafic au départ', 'departing traffic'));
            const rb = this.M(this.T('Maintenons avant la piste', 'Holding short runway'), this.rwyPair(ref), ',', cs);
            this._instruct(m, rb, () => { this.flags.crossWait = ref; });
          } else this._crossClear(ref);
          break;
        }
        case 'req_notam': {
          const side = this.notamSide(), a = f[side];
          const cl = (a.closures || []).filter((c) => !c.partial);
          const parts = [cs, ','];
          const c = a.city;
          if (!a.notamOk) parts.push(this.T(`pas d'information NOTAM disponible pour ${c}`, `no NOTAM information available for ${c}`, { es: `no hay información NOTAM disponible para ${c}`, de: `keine NOTAM-Information für ${c} verfügbar`, it: `nessuna informazione NOTAM disponibile per ${c}`, pt: `nenhuma informação NOTAM disponível para ${c}` }));
          else if (!cl.length) parts.push(this.T(`aucune fermeture de piste signalée à ${c}`, `no runway closures reported at ${c}`, { es: `no se notifican cierres de pista en ${c}`, de: `keine Pistensperrungen in ${c} gemeldet`, it: `nessuna chiusura pista segnalata a ${c}`, pt: `nenhum fechamento de pista reportado em ${c}` }));
          else {
            parts.push(this.T(`à ${c},`, `at ${c},`, { es: `en ${c},`, de: `in ${c},`, it: `a ${c},`, pt: `em ${c},` }));
            cl.forEach((c, i) => { parts.push(this.closureMsg(c)); parts.push(i < cl.length - 1 ? ',' : ''); });
          }
          parts.push(',', this.T('piste en service', 'runway in use'), this.rwy(side));
          this._atc(this.M(...parts));
          break;
        }
        case 'req_level': {
          const lvl = +arg;
          const near = (this.dist().arr || 9999) <= this.tod() + 20;
          if (near || this.rand() < 0.2) {
            const keep = this.alt(this.target, f.dep.ta);
            if (near) {
              this._atc(this.M(cs, ',', this.T('impossible, maintenez', 'unable, maintain'), keep, ',', this.T('prévoyez la descente sous peu', 'expect descent shortly')));
            } else {
              const m = this.M(cs, ',', this.T('impossible pour le moment en raison du trafic, maintenez', 'unable at this time due to traffic, maintain'), keep, ',', (lvl > this.target ? this.T('je vous rappelle', 'expect higher in a few minutes') : this.T('je vous rappelle', 'expect lower in a few minutes')));
              const rb = this.M(this.T('Maintenons', 'Maintain'), keep, ',', cs);
              this._instruct(m, rb, () => { this.offer = { alt: lvl, at: this.now + 120000 + this.rand() * 120000 }; });
            }
          } else this._levelClearance(lvl, 'request');
          break;
        }
        case 'established': this._handoff('TWR', 'arr', null, () => { this.phase = 'TWR_CHECKIN'; }); break;
        case 'checkin_twr': this._landingClearance(false); break;
        case 'go_around': {
          const ap = this._st('APP', 'arr');
          const m = this.M(cs, ',', this.T('bien reçu, montez', 'roger, climb'), this.alt(f.appAlt, f.arr.tl), ',', this.T('contactez', 'contact'), ap.name, this.fq(ap.freq));
          const rb = this.M(this.T('Montons', 'Climb'), this.alt(f.appAlt, f.arr.tl), ',', ap.name, this.fq(ap.freq), ',', cs);
          this._instruct(m, rb, () => { this.station = ap; this.flags.goAround = true; this.flags.twrClr = false; this._setCleared(f.appAlt); this.clearDir = 'up'; this.phase = 'APP_CHECKIN'; });
          break;
        }
        case 'vacated': {
          const m = this.M(cs, ',', this.T('roulez vers votre poste de stationnement', 'taxi to your stand'));
          const rb = this.M(this.T('Roulons vers le poste', 'Taxi to stand'), ',', cs);
          this._instruct(m, rb, () => { this.phase = 'TAXI_IN'; });
          break;
        }
        case 'on_stand':
          this._atc(this.M(cs, ',', this.T('bonne journée, au revoir', 'good day')), () => {
            this.phase = 'DONE';
            this._sys(this.U('Vol terminé. Bon retour au parking !', 'Flight complete. Welcome to the stand!'));
          });
          break;
      }
      this.onChange();
    }

    // ----- reprendre à une étape -----
    jumpTo(phase) {
      const f = this.flight; if (!f) return;
      this.queue = []; this.busy = false; this.pending = null;
      const set = (role, side) => { this.station = this._st(role, side); };
      switch (phase) {
        case 'PRE': set(f.dep.freqs.DEL ? 'DEL' : 'GND', 'dep'); this.cleared = null; break;
        case 'HOLDING': set('TWR', 'dep'); this.cleared = f.initAlt; break;
        case 'DEP_CHECKIN': set('DEP', 'dep'); this.cleared = f.initAlt; break;
        case 'CRUISE': set('CTR', 'ctr1'); this.cleared = this.target; this.clearDir = 'level'; break;
        case 'DESCENT': set('CTR', 'ctr2'); this.flags.descent = true; this.cleared = f.descAlt; this.clearDir = 'down'; break;
        case 'APP_CHECKIN': set('APP', 'arr'); this.flags.descent = true; this.cleared = f.descAlt; this.clearDir = 'down'; break;
        case 'TWR_CHECKIN': set('TWR', 'arr'); this.flags.appClr = true; this.cleared = f.appAlt; break;
        case 'VACATING': set('GND', 'arr'); break;
      }
      this.phase = phase;
      this._sys(this.U(`Reprise : ${PHASE_LABEL.fr[phase]}. Contactez ${this.station.name} sur ${freqTxt(this.station.freq)}.`, `Resuming: ${PHASE_LABEL.en[phase]}. Contact ${this.station.name} on ${freqTxt(this.station.freq)}.`));
      this.onChange();
    }

    // ----- ATIS -----
    atis(side) {
      const f = this.flight; if (!f) return null;
      const a = f[side], w = a.wx || {}, fr = this.lang === 'fr', L = this.atisLetter(side);
      const parts = [];
      parts.push(this.T(`Ici ${a.city}, information ${L}.`, `This is ${a.city} information ${L}.`, { es: `Aquí ${a.city}, información ${L}.`, de: `Hier ist ${a.city} Information ${L}.`, it: `Questo è ${a.city} informazione ${L}.`, pt: `Aqui ${a.city}, informação ${L}.` }));
      parts.push(this.M(this.T('Piste en service', 'Runway in use'), this.rwy(side), '.'));
      (a.closures || []).filter((c) => !c.partial).forEach((c) => parts.push(this.M(this.closureMsg(c), '.')));
      parts.push(this.M(this.wind(side), '.'));
      let vis;
      if (w.cavok) vis = 'CAVOK';
      else if (w.vis && w.vis.m != null) vis = w.vis.m >= 9999 ? this.T('visibilité 10 kilomètres ou plus', 'visibility 10 kilometres or more') : this.T(`visibilité ${w.vis.m} mètres`, `visibility ${w.vis.m} metres`, { es: `visibilidad ${w.vis.m} metros`, de: `Sicht ${w.vis.m} Meter`, it: `visibilità ${w.vis.m} metri`, pt: `visibilidade ${w.vis.m} metros` });
      else if (w.vis && w.vis.sm != null) vis = this.T(`visibilité ${w.vis.sm} miles`, `visibility ${w.vis.sm} miles`, { es: `visibilidad ${w.vis.sm} millas`, de: `Sicht ${w.vis.sm} Meilen`, it: `visibilità ${w.vis.sm} miglia`, pt: `visibilidade ${w.vis.sm} milhas` });
      if (vis) parts.push(vis + '.');
      if (!w.cavok) {
        if (w.clouds && w.clouds.length) {
          const C = { FEW: this.T('quelques nuages', 'few'), SCT: this.T('nuages épars', 'scattered'), BKN: this.T('nuages fragmentés', 'broken'), OVC: this.T('couvert', 'overcast') };
          parts.push(w.clouds.map((c) => `${C[c.cover]} ${this.T('à', 'at')} ${c.base} ${this.T('pieds', 'feet')}`).join(', ') + '.');
        } else if (w.nsc) parts.push(this.T('Pas de nuages significatifs.', 'No significant cloud.'));
      }
      if (w.temp != null) parts.push(this.T(`Température ${Math.round(w.temp)}, point de rosée ${Math.round(w.dew)}.`, `Temperature ${Math.round(w.temp)}, dew point ${Math.round(w.dew)}.`, { es: `Temperatura ${Math.round(w.temp)}, punto de rocío ${Math.round(w.dew)}.`, de: `Temperatur ${Math.round(w.temp)}, Taupunkt ${Math.round(w.dew)}.`, it: `Temperatura ${Math.round(w.temp)}, punto di rugiada ${Math.round(w.dew)}.`, pt: `Temperatura ${Math.round(w.temp)}, ponto de orvalho ${Math.round(w.dew)}.` }));
      parts.push(this.M(this.qnh(side), '.'));
      const tl = String(Math.round(a.tl / 100)).padStart(2, '0');
      parts.push(this.M(this.T('Niveau de transition', 'Transition level'), { text: tl, speech: digits(tl, this.lang) }, '.'));
      parts.push(this.T(`Accusez réception de l'information ${L} au premier contact.`, `Advise on initial contact you have information ${L}.`, { es: `Notifique en el contacto inicial que tiene la información ${L}.`, de: `Bestätigen Sie beim Erstanruf Information ${L}.`, it: `Riportate al primo contatto di avere l'informazione ${L}.`, pt: `Informe no contato inicial que possui a informação ${L}.` }));
      const cap = (p) => (typeof p === 'string' ? p.charAt(0).toUpperCase() + p.slice(1) : { text: cap(p.text), speech: cap(p.speech) });
      const msg = this.M(...parts.map(cap));
      msg.letter = L;
      return msg;
    }

    phaseLabel() { return PHASE_LABEL[this.uiLang === 'en' ? 'en' : 'fr'][this.phase] || this.phase; }
  }

  return { AtcEngine, RADIO_LANGS, LANG_NAMES, localLang, utils: { rwySay, distNm, bearing, digits, freqTxt, freqSay, callsignSay, fakeFreq, parseMetar, titleCase, hash, usesInHg }, PHASE_LABEL, RESUME_POINTS, AIRBORNE };
});

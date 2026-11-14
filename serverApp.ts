import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { SYSTEM_INSTRUCTION, CONATIVE_KNOWLEDGE_BASE } from './constants.js';
import {
  SportCategory,
  SessionContext,
  PrivacyMode,
  PoseBiomechanicsFrame,
  getSportCategory,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_CONFIG_PATH = process.env.VERCEL
  ? '/tmp/.auth-config.json'
  : path.join(__dirname, '.auth-config.json');

interface AuthConfig {
  gateEnabled: boolean;
  friendPin: string;
  ownerKey: string;
  pinVersion: number;
}

function getDefaultOwnerKey(): string {
  const envOwnerKey = (process.env.OWNER_ACCESS_KEY || '').trim();
  if (envOwnerKey.length >= 16) return envOwnerKey;
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (geminiKey) {
    return crypto
      .createHmac('sha256', geminiKey)
      .update('conative-owner-key-v1')
      .digest('hex')
      .slice(0, 32);
  }
  return crypto.randomBytes(16).toString('hex');
}

function loadAuthConfig(): AuthConfig {
  const defaultPin = (process.env.APP_ACCESS_PIN || 'SPORT2026').trim() || 'SPORT2026';
  const envOwnerKey = (process.env.OWNER_ACCESS_KEY || '').trim();
  try {
    if (fs.existsSync(AUTH_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf-8'));
      const cfg: AuthConfig = {
        gateEnabled: typeof raw.gateEnabled === 'boolean' ? raw.gateEnabled : true,
        friendPin:
          typeof raw.friendPin === 'string' && raw.friendPin.trim().length >= 4
            ? raw.friendPin.trim()
            : defaultPin,
        ownerKey:
          envOwnerKey ||
          (typeof raw.ownerKey === 'string' && raw.ownerKey.length >= 16
            ? raw.ownerKey
            : getDefaultOwnerKey()),
        pinVersion: typeof raw.pinVersion === 'number' && raw.pinVersion >= 1 ? raw.pinVersion : 1,
      };
      return cfg;
    }
  } catch (err) {
    console.warn('Unable to read .auth-config.json, recreating defaults:', err);
  }
  const initial: AuthConfig = {
    gateEnabled: true,
    friendPin: defaultPin,
    ownerKey: getDefaultOwnerKey(),
    pinVersion: 1,
  };
  saveAuthConfig(initial);
  return initial;
}

function saveAuthConfig(cfg: AuthConfig): void {
  try {
    fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Unable to persist .auth-config.json:', err);
  }
}

const authConfig = loadAuthConfig();

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', authConfig.ownerKey).update(payload).digest('hex');
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createOwnerToken(): string {
  return `owner.${signPayload('owner')}`;
}

function createFriendToken(): string {
  const v = authConfig.pinVersion;
  return `friend.${v}.${signPayload(`friend:${v}`)}`;
}

function verifyToken(token: string | undefined): 'owner' | 'friend' | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts[0] === 'owner' && parts.length === 2) {
    const expectedSig = signPayload('owner');
    if (safeEqualStrings(parts[1], expectedSig)) return 'owner';
    return null;
  }
  if (parts[0] === 'friend' && parts.length === 3) {
    const version = parseInt(parts[1], 10);
    if (!Number.isFinite(version) || version !== authConfig.pinVersion) return null;
    const expectedSig = signPayload(`friend:${version}`);
    if (safeEqualStrings(parts[2], expectedSig)) return 'friend';
    return null;
  }
  return null;
}

function isDevOwnerRequest(req: Request): boolean {
  if (process.env.VERCEL) {
    return false;
  }
  const candidates = [
    String(req.headers['x-forwarded-host'] || ''),
    String(req.headers.host || ''),
    String(req.headers.origin || ''),
    String(req.headers.referer || ''),
  ].filter(Boolean);

  if (candidates.some((val) => val.includes('ais-pre-'))) {
    return false;
  }

  return candidates.some(
    (val) => val.includes('ais-dev-') || val.includes('localhost') || val.includes('127.0.0.1')
  );
}

function getSharedAppUrl(req: Request): string {
  const origin = String(req.headers.origin || '');
  const fwdHost = String(req.headers['x-forwarded-host'] || '');
  const host = String(req.headers.host || '');
  const rawBase = origin || (fwdHost ? `https://${fwdHost}` : host ? `https://${host}` : '');
  if (rawBase.includes('ais-dev-')) {
    return rawBase.replace('ais-dev-', 'ais-pre-').replace(/\/$/, '');
  }
  if (rawBase.startsWith('http://localhost') || rawBase.startsWith('http://127.0.0.1')) {
    return rawBase.replace(/\/$/, '');
  }
  return (
    rawBase || 'https://ais-pre-edziazo74dbunm3vbga4v4-39012190101.europe-west3.run.app'
  ).replace(/\/$/, '');
}

function resolveRequestRole(
  req: Request
): { authorized: boolean; role: 'owner' | 'friend' | 'guest'; viaDevBypass: boolean } {
  const headerToken =
    typeof req.headers['x-conative-token'] === 'string' ? req.headers['x-conative-token'] : '';
  const tokenRole = verifyToken(headerToken);

  if (tokenRole === 'owner') {
    return { authorized: true, role: 'owner', viaDevBypass: false };
  }
  if (isDevOwnerRequest(req)) {
    return { authorized: true, role: 'owner', viaDevBypass: true };
  }
  if (tokenRole === 'friend') {
    return { authorized: true, role: 'friend', viaDevBypass: false };
  }
  if (!authConfig.gateEnabled) {
    return { authorized: true, role: 'friend', viaDevBypass: false };
  }
  return { authorized: false, role: 'guest', viaDevBypass: false };
}

function requireApiAccess(req: Request, res: Response, next: NextFunction) {
  const status = resolveRequestRole(req);
  if (!status.authorized) {
    return res.status(401).json({
      error: "Accesso non autorizzato. Inserisci il codice di accesso amici per utilizzare l'analisi AI.",
    });
  }
  next();
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chiave GEMINI_API_KEY non configurata sul server. Aggiungila nelle variabili ambiente.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function createApiApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ConativeSport Analyst' });
  });

  // Auth status endpoint
  app.get('/api/auth/status', (req, res) => {
    const resolved = resolveRequestRole(req);
    const sharedAppUrl = getSharedAppUrl(req);
    if (resolved.role === 'owner') {
      return res.json({
        authorized: true,
        role: 'owner',
        gateEnabled: authConfig.gateEnabled,
        autoToken: resolved.viaDevBypass ? createOwnerToken() : undefined,
        friendPin: authConfig.friendPin,
        ownerInviteKey: authConfig.ownerKey,
        sharedAppUrl,
      });
    }
    return res.json({
      authorized: resolved.authorized,
      role: resolved.role,
      gateEnabled: authConfig.gateEnabled,
    });
  });

  // Verify Friend PIN or Owner Magic Link key
  app.post('/api/auth/verify', (req, res) => {
    const { pin, ownerKey } = req.body || {};
    const sharedAppUrl = getSharedAppUrl(req);

    if (typeof ownerKey === 'string' && ownerKey.trim().length > 0) {
      if (safeEqualStrings(ownerKey.trim(), authConfig.ownerKey)) {
        return res.json({
          authorized: true,
          role: 'owner',
          token: createOwnerToken(),
          gateEnabled: authConfig.gateEnabled,
          friendPin: authConfig.friendPin,
          ownerInviteKey: authConfig.ownerKey,
          sharedAppUrl,
        });
      }
      return res.status(401).json({ error: 'Link proprietario non valido o scaduto.' });
    }

    if (typeof pin === 'string' && pin.trim().length > 0) {
      const normalizedInput = crypto
        .createHash('sha256')
        .update(pin.trim().toUpperCase())
        .digest('hex');
      const normalizedExpected = crypto
        .createHash('sha256')
        .update(authConfig.friendPin.trim().toUpperCase())
        .digest('hex');
      if (safeEqualStrings(normalizedInput, normalizedExpected)) {
        return res.json({
          authorized: true,
          role: 'friend',
          token: createFriendToken(),
          gateEnabled: authConfig.gateEnabled,
        });
      }
    }

    return res.status(401).json({
      error: 'Codice di accesso errato. Controlla il codice ricevuto e riprova.',
    });
  });

  // Owner-only access configuration update
  app.post('/api/auth/config', (req, res) => {
    const resolved = resolveRequestRole(req);
    if (resolved.role !== 'owner') {
      return res
        .status(403)
        .json({ error: 'Solo il proprietario può modificare le regole di accesso.' });
    }

    const { gateEnabled, friendPin } = req.body || {};
    if (typeof gateEnabled === 'boolean') {
      authConfig.gateEnabled = gateEnabled;
    }
    if (typeof friendPin === 'string') {
      const cleaned = friendPin.trim();
      if (cleaned.length < 4 || cleaned.length > 32) {
        return res
          .status(400)
          .json({ error: 'Il codice amici deve essere lungo tra 4 e 32 caratteri.' });
      }
      if (cleaned !== authConfig.friendPin) {
        authConfig.friendPin = cleaned;
        authConfig.pinVersion += 1;
      }
    }
    saveAuthConfig(authConfig);

    return res.json({
      gateEnabled: authConfig.gateEnabled,
      friendPin: authConfig.friendPin,
      ownerInviteKey: authConfig.ownerKey,
      sharedAppUrl: getSharedAppUrl(req),
    });
  });

  // API endpoint for conative video analysis (protected by Access Gate)
  app.post('/api/analyze', requireApiAccess, async (req, res) => {
    try {
      const ai = getGeminiClient();
      const {
        sport,
        sportCategory: rawCategory,
        sessionContext: rawSessionContext,
        privacyMode: rawPrivacyMode,
        focusSpecificAthlete: rawFocusSpecific,
        notes,
        fullContext,
        targetAthleteDescription,
        opponentDescription,
        teamName,
        athleteRole,
        athleteCategory,
        frames,
        biomechanics,
        videoMetadata,
      } = req.body;

      const resolvedCategory: SportCategory =
        rawCategory && Object.values(SportCategory).includes(rawCategory)
          ? rawCategory
          : getSportCategory(sport || 'JUDO');

      const resolvedSessionContext: SessionContext =
        rawSessionContext && Object.values(SessionContext).includes(rawSessionContext)
          ? rawSessionContext
          : SessionContext.PALESTRA;

      const resolvedPrivacyMode: PrivacyMode =
        rawPrivacyMode && Object.values(PrivacyMode).includes(rawPrivacyMode)
          ? rawPrivacyMode
          : PrivacyMode.STANDARD;

      const focusSpecificAthlete = Boolean(rawFocusSpecific);

      const biomechanicsSummaryText =
        Array.isArray(biomechanics) && biomechanics.length > 0
          ? biomechanics
              .map((b: PoseBiomechanicsFrame) => {
                const athletesDesc = (b.athletes || [])
                  .map(
                    (a) =>
                      `  * ${a.label}: busto=${a.torsoLeanDeg}°, ginocchia=${a.leftKneeAngle ?? '-'}/${a.rightKneeAngle ?? '-'}°, gomiti=${a.leftElbowAngle ?? '-'}/${a.rightElbowAngle ?? '-'}°, ampiezzaBase=${a.stanceWidthRatio} (${a.postureSummary})`
                  )
                  .join('\n');
                return `- Secondo [${String(Math.floor(b.timestamp / 60)).padStart(2, '0')}:${String(
                  b.timestamp % 60
                ).padStart(2, '0')}] (${b.detectedCount} figure rilevate):\n${athletesDesc}`;
              })
              .join('\n')
          : '';

      const privacyDirective =
        resolvedPrivacyMode === PrivacyMode.SKELETON_ONLY
          ? `**MODALITÀ PRIVACY TOTALE ATTIVA: SOLO SCHELETRO MOTORIO (GDPR MINORI)**
- Le immagini allegate sono scheletri biomeccanici sintetici estratti localmente sul dispositivo (nessun volto, divisa o foto reale degli allievi è stata inviata).
- Usa le geometrie degli scheletri (Atleta #1, Atleta #2...) e la TELEMETRIA BIOMECCANICA CALCOLATA ON-DEVICE qui sotto per valutare:
  * **Struttura (Tai)**: inclinazione del busto, ampiezza della base di appoggio, baricentro basso vs rigidità verticale/difensiva.
  * **Tecnica (Gi)**: angoli di flessione di ginocchia e gomiti, simmetria o estensione degli arti.
  * **Funzionalità (Shin)**: orientamento spaziale reciproco tra scheletri, variazioni posturali nel tempo e anticipazione motoria.
- NON inventare colori di maglie, judogi o espressioni facciali non presenti negli scheletri: fai riferimento a "Atleta #1 (Sinistra / Ciano)", "Atleta #2 (Destra / Ambra)", ecc. e agli angoli reali misurati.${
              biomechanicsSummaryText
                ? `\n\n**TELEMETRIA BIOMECCANICA ESTRATTA SUL DISPOSITIVO:**\n${biomechanicsSummaryText}`
                : ''
            }`
          : resolvedPrivacyMode === PrivacyMode.BLUR_FACES
          ? `**MODALITÀ PRIVACY ATTIVA: VOLTI SFOCATI ON-DEVICE**
- Per tutela della privacy degli alunni, tutti i volti sono stati oscurati localmente sul dispositivo prima della trasmissione.
- Osserva normalmente postura, gestualità tecnica, colori delle divise/maglie, attrezzi e dinamica spaziale senza riferimenti alle espressioni facciali.${
              biomechanicsSummaryText
                ? `\n\n**TELEMETRIA BIOMECCANICA SUPPLEMENTARE:**\n${biomechanicsSummaryText}`
                : ''
            }`
          : '';

      const sessionContextDirective =
        resolvedSessionContext === SessionContext.SCUOLA
          ? `**CONTESTO OPERATIVO: SCUOLA (ORA DI EDUCAZIONE FISICA)**
- L'analisi avviene in ambito scolastico: privilegia l'inclusione, il piacere di agire, la sicurezza emotiva e situazioni-problema realizzabili con attrezzatura scolastica standard e gruppi eterogenei.`
          : resolvedSessionContext === SessionContext.GARA
          ? `**CONTESTO OPERATIVO: GARA / COMPETIZIONE**
- L'analisi avviene in contesto agonistico/competitivo: valuta attentamente la tenuta o l'eventuale regressione conativa sotto stress da risultato (es. blocco emozionale da paura di perdere) e orienta i consigli al debriefing tattico ed emotivo.`
          : `**CONTESTO OPERATIVO: PALESTRA / ALLENAMENTO**
- L'analisi avviene in allenamento sportivo (dojo/campo/piscina): orienta la scheda di intervento alla progressione tecnico-tattica e al décalage pedagogico tra una tappa e la successiva.`;

      let categoryDirective = '';
      if (resolvedCategory === SportCategory.DUAL_OPPOSITION) {
        categoryDirective = `
**TIPOLOGIA SPORT: SPORT CON DUE GIOCATORI OPPOSTI (Opposizione Duale 1 vs 1 - es. Judo, Tennis, Scherma, Badminton, Arti Marziali)**
In questi sport due avversari si affrontano direttamente per il punteggio o il dominio tattico/spaziale.
${
  focusSpecificAthlete
    ? `
**MODALITÀ RICHIESTA: FOCUS SU UN ATLETA SPECIFICO**
L'utente ha richiesto espressamente di analizzare l'atleta target con queste caratteristiche:
"${targetAthleteDescription || athleteRole || 'Atleta target indicato'}"
${opponentDescription ? `Avversario di riferimento: "${opponentDescription}"` : ''}
- DEVI FOCALIZZARE LA DIAGNOSI PRINCIPALE (tappa, preoccupazione, consonanza, scheda, grafico Tai/Gi/Shin) ESCLUSIVAMENTE sull'atleta target specificato.
- Nel campo 'targetAthleteConfirmation', dichiara come hai individuato visivamente l'atleta target nei fotogrammi (colore divisa/judogi/maglia, lato del campo, ruolo) e conferma che l'analisi appartiene solo a lui.
- REGOLA ANTI-ERRORE DI ATTRIBUZIONE: È severamente vietato attribuire Tappa 4 o 5 a un atleta che subisce passivamente, non sferra attacchi o perde per blocco/paura (in tal caso è Tappa 1 Emozionale o Tappa 2 Funzionale). NON confondere la bravura dell'avversario con quella del target!
- Compila il campo 'comparison' confrontando targetAthlete (Atleta Target) e opponentAthlete (Avversario) per spiegare chi combatte al livello più alto e come impone il proprio ritmo costringendo l'altro a regredire.`
    : `
**MODALITÀ RICHIESTA: ANALISI GLOBALE DEL DUELLO TRA I DUE CONTENDENTI (NESSUN ATLETA SPECIFICO ISOLATO)**
L'utente NON ha richiesto l'analisi su un singolo atleta isolato, ma vuole comprendere la dinamica conativa del confronto 1 vs 1 tra i due giocatori opposti visibili nel video.
- Identifica oggettivamente i due contendenti (es. Giocatore A / Primo Piano vs Giocatore B / Fondo Campo, oppure Judogi Bianco vs Judogi Blu).
- Valuta nei campi principali la lettura conativa complessiva del duello e dello scambio (collocando come riferimento il livello prevalente espresso nella sequenza o dall'atleta che determina l'andamento dello scambio).
- Compila obbligatoriamente 'comparison' mettendo a confronto Contendente A ('targetAthlete') e Contendente B ('opponentAthlete'): per ciascuno specifica tappa conativa (1-5), azioni oggettive con timestamps, preoccupazione e volume Tai/Gi/Shin, e nel sotto-oggetto 'duel' spiega chi combatte al livello più alto, come impone il proprio senso del gioco (ritmo, spazio, squilibrio/kuzushi, profondità dei colpi) e come costringe l'altro a regredire di livello.
- Lascia 'targetAthleteConfirmation' vuoto o generico, specificando invece chiaramente in 'analysisScopeSummary' che si tratta di un confronto bilanciato 1 vs 1 tra entrambi i giocatori.`
}
`;
      } else if (resolvedCategory === SportCategory.TEAM_SPORT) {
        categoryDirective = `
**TIPOLOGIA SPORT: GIOCO DI SQUADRA (Sport Collettivo di Cooperazione/Opposizione - es. Calcio a 5, Pallavolo, Calcio, Basket, Rugby, Pallamano)**
In questi sport l'essenza motoria secondo Bui-Xuân riguarda la co-costruzione di soluzioni spaziali e temporali con i compagni contro gli avversari (Modalità di vittoria tipica: Punteggio / Efficacia Tattica Collettiva).
- Tappa 1 (Emozionale): gioco a grappolo attorno alla palla, paura del contatto o dell'errore, liberarsi subito del pallone senza guardare.
- Tappa 2 (Funzionale): ricerca di efficacia immediata (passare avanti o tirare appena possibile, primi smarcamenti empirici).
- Tappa 3 (Tecnica): ricerca del bel gesto scolastico (stop, palleggio, passaggio) eseguito in modo rigido o slegato dal contesto tattico.
- Tappa 4 (Contestuale): lettura attiva degli spazi liberi, gioco senza palla, appoggio/sostegno, scelte adattate alla difesa avversaria (Gi + Shin).
- Tappa 5 (Esperta): anticipazione collettiva, variazione di ritmo e creatività tattica di gioco.
${
  focusSpecificAthlete
    ? `
**MODALITÀ RICHIESTA: FOCUS SU UN ATLETA SPECIFICO DELLA SQUADRA**
L'utente ha richiesto espressamente di isolare e valutare un singolo giocatore:
"${targetAthleteDescription || athleteRole || 'Giocatore specificato'}"
${teamName ? `(Squadra: ${teamName})` : ''}
- Valuta esclusivamente il comportamento motorio, le scelte con e senza palla, i movimenti di smarcamento/copertura e la tappa conativa di QUESTO specifico giocatore.
- Nel campo 'targetAthleteConfirmation', descrivi come hai individuato il giocatore nei fotogrammi (colore maglia/pettorina, posizione in campo, ruolo).
- Compila il campo 'teamDynamics' descrivendo comunque come la squadra intorno a lui si organizza e influenza le sue scelte.
- La Scheda di Allenamento Orizzontale deve proporre una situazione-problema mirata a far evolvere questo giocatore dentro il gioco collettivo.`
    : `
**MODALITÀ RICHIESTA: ANALISI COLLETTIVA DELLA SQUADRA (NESSUN ATLETA SINGOLO ISOLATO)**
L'utente NON ha richiesto l'analisi su un atleta specifico, ma l'analisi conativa collettiva della squadra / dinamica di gioco osservata${teamName ? ` (Squadra: ${teamName})` : ''}.
- Analizza il comportamento collettivo della squadra (o della squadra principale in azione nei fotogrammi): occupazione dello spazio (ampiezza e profondità), gioco a grappolo vs circolazione fluida della palla, sostegno al portatore, transizioni attacco-difesa.
- I campi 'stage', 'stageName', 'consonance', 'mobilization', 'graphData' e 'metaReflection' devono riferirsi alla SQUADRA / GRUPPO nel suo complesso.
- La 'trainingSheet' deve proporre una Situazione-Problema COLLETTIVA (gioco ridotto o a tema) per far progredire la squadra alla tappa conativa successiva.
- Compila obbligatoriamente 'teamDynamics' analizzando organizzazione collettiva, gestione spazio-tempo e risposta alla pressione avversaria.`
}
`;
      } else {
        categoryDirective = `
**TIPOLOGIA SPORT: SPORT SINGOLO / INDIVIDUALE (Rapporto con l'Ambiente, l'Attrezzo o il Modello - es. Ginnastica, Nuoto, Atletica Leggera, Danza, Arrampicata, Pattinaggio)**
In questi sport NON esiste un duello diretto 1 vs 1 contro un avversario da proiettare o respingere: la motricità è centrata sul rapporto con il proprio corpo, l'ambiente fisico (acqua, pista, parete, pedana), l'attrezzo o la musica/codice.
- La Modalità di Vittoria prevalente è 'Conformità' (Ginnastica, Danza, Pattinaggio) oppure 'Misura' (Nuoto, Atletica Leggera, Arrampicata), pur potendo l'atleta attraversare tutte e 5 le tappe di Bui-Xuân:
  - Tappa 1 (Emozionale): ricerca di sicurezza, paura dell'elemento/vuoto/acqua, blocco strutturale (Tai).
  - Tappa 2 (Funzionale): ricerca empirica di efficacia ("come avanzare / superare l'ostacolo / restare in equilibrio") con soluzioni personali grezze (Shin).
  - Tappa 3 (Tecnica): ricerca della conformità formale al modello tecnico codificato (Gi).
  - Tappa 4 (Contestuale): adattamento fluido della tecnica alle variazioni di ritmo, spazio, fatica o condizioni ambientali (Gi + Shin).
  - Tappa 5 (Esperta): stile personale, massima economia energetica e maestria espressiva/prestazionale (Tai + Gi + Shin).
${
  focusSpecificAthlete
    ? `
**MODALITÀ RICHIESTA: IDENTIFICAZIONE DI UN ATLETA SPECIFICO TRA PIÙ PARTECIPANTI**
Nel video potrebbero esserci più atleti (es. più corsie in piscina o batterie in pista). L'utente ha richiesto di analizzare specificamente:
"${targetAthleteDescription || athleteRole || 'Atleta indicato'}"
- Isola visivamente questo specifico atleta e conferma nei fotogrammi come l'hai riconosciuto nel campo 'targetAthleteConfirmation'.`
    : `
**MODALITÀ RICHIESTA: ANALISI DIRETTA DELL'ATLETA SINGOLO PROTAGONISTA**
Analizza direttamente l'atleta singolo che esegue la prova nel video senza forzare confronti con avversari inesistenti.`
}
- Compila obbligatoriamente 'individualDynamics' analizzando il rapporto corpo-ambiente/attrezzo, l'equilibrio tra tecnica (Gi) e funzionalità (Shin), e l'economia del gesto.
`;
      }

      const prompt = `
**DATI DELLA SESSIONE & CONTESTO:**
- Disciplina Sportiva: ${sport || 'Non specificata'}
- Contesto Operativo: ${resolvedSessionContext} (Scuola / Palestra / Gara)
- Categoria Strutturale Rilevata: ${resolvedCategory}
- Analisi su Atleta Specifico Richiesta: ${focusSpecificAthlete ? 'SÌ' : 'NO'}
${teamName ? `- Nome Squadra/Club: ${teamName}` : ''}
${athleteCategory ? `- Categoria/Livello: ${athleteCategory}` : ''}
${athleteRole ? `- Ruolo/Specialità: ${athleteRole}` : ''}
${focusSpecificAthlete && targetAthleteDescription ? `- Identificazione Visiva Target: ${targetAthleteDescription}` : ''}
${resolvedCategory === SportCategory.DUAL_OPPOSITION && opponentDescription ? `- Identificazione Avversario: ${opponentDescription}` : ''}
- Note di Campo e Consegna Iniziale: ${notes || 'Nessuna nota aggiuntiva fornita.'}
${videoMetadata ? `- Dati Video: Durata ${videoMetadata.duration || 'N/D'} sec, Risoluzione ${videoMetadata.width || 'N/D'}x${videoMetadata.height || 'N/D'}` : ''}
${fullContext ? `- Contesto Aggiuntivo & Materiale Didattico:\n${fullContext}` : ''}

**TEORIA FONDAMENTALE DELLA PEDAGOGIA CONATIVA (Gilles Bui-Xuân, Maurice Reuchlin):**
${CONATIVE_KNOWLEDGE_BASE}

${sessionContextDirective}

${privacyDirective ? `${privacyDirective}\n` : ''}${categoryDirective}

**OBIETTIVO DELL'ANALISI MULTIMODALE BASATA SUI FOTOGRAMMI DEL VIDEO:**
1. Esamina attentamente i fotogrammi catturati inserendo sempre TIMESTAMPS precisi nel formato [MM:SS] per ogni riscontro osservato.
2. Compila 'analysisScopeSummary' con una frase sintetica e chiara che indichi l'oggetto effettivo dell'analisi (es. "Analisi Collettiva della Squadra di Pallavolo", "Confronto Duello 1 vs 1 nel Tennis", "Analisi Individuale di Nuoto", oppure "Focus su Atleta Specifico: ...").
3. Identifica la TAPPA CONATIVA (1-5) secondo Gilles Bui-Xuân:
   - Tappa 1 = EMOZIONALE (sicurezza, integrità fisica, risposte d'urgenza, blocco, gioco a grappolo).
   - Tappa 2 = FUNZIONALE (ricerca pratica di efficacia per prove ed errori).
   - Tappa 3 = TECNICA (conformità al modello esterno, ricerca del bel gesto isolato).
   - Tappa 4 = CONTESTUALE (adattamento situazionale e tattico, lettura attiva del contesto).
   - Tappa 5 = ESPERTA (sintesi totale Tai+Gi+Shin, stile personale, economia e anticipazione).
4. Spiega la PREOCCUPAZIONE DOMINANTE (dell'atleta o della squadra a seconda della modalità) con timestamps [MM:SS].
5. Valuta lo stato di CONSONANZA o CONFLITTO rispetto al senso dell'attività con timestamps [MM:SS].
6. Individua la principale MODALITÀ DI VITTORIA percepita: 'Misura', 'Conformità' oppure 'Punteggio'.
7. Formula una SCHEDA DI ALLENAMENTO ORIZZONTALE (Situazione-Problema) coerente con la tipologia di sport e con l'oggetto dell'analisi (individuale o di squadra), in Markdown:
   ### 🎯 OBIETTIVO PEDAGOGICO
   ### 🛠️ SITUAZIONE-PROBLEMA
   ### 📏 CRITERI DI RIUSCITA
   ### 🔄 VARIANTI (DÉCALAGE)
8. Formula una DOMANDA DI RIFLESSIONE METACONATIVA per stimolare la presa di coscienza.
9. Determina la ripartizione percentuale del Volume Conativo (interi 0-100) per Struttura (Tai), Tecnica (Gi), Funzionalità (Shin).
`;

      const parts: any[] = [];

      if (Array.isArray(frames) && frames.length > 0) {
        for (const frame of frames) {
          if (frame.data && frame.mimeType) {
            parts.push({
              inlineData: {
                mimeType: frame.mimeType,
                data: frame.data,
              },
            });
            if (frame.timestamp !== undefined) {
              const minutes = Math.floor(frame.timestamp / 60);
              const seconds = Math.floor(frame.timestamp % 60);
              const timeStr = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
              parts.push({
                text: `Fotogramma video al secondo ${timeStr}`,
              });
            }
          }
        }
      }

      parts.push({ text: prompt });

      const schemaProperties: Record<string, any> = {
        stage: {
          type: Type.INTEGER,
          description: 'Numero della tappa conativa da 1 a 5',
        },
        stageName: {
          type: Type.STRING,
          description: 'Nome della tappa conativa (EMOZIONALE, FUNZIONALE, TECNICA, CONTESTUALE, ESPERTA)',
        },
        analysisScopeSummary: {
          type: Type.STRING,
          description:
            "Descrizione sintetica dell'oggetto dell'analisi (es. Analisi Collettiva Squadra, Duello Completo 1vs1, Analisi Individuale o Focus su Atleta Specifico)",
        },
        consonance: {
          type: Type.STRING,
          description: 'Spiegazione approfondita di consonanza o conflitto con timestamps [MM:SS]',
        },
        mobilization: {
          type: Type.STRING,
          description: 'Analisi della preoccupazione dominante e della mobilitazione conativa con timestamps [MM:SS]',
        },
        victoryModality: {
          type: Type.STRING,
          description: 'Modalità di vittoria rilevata: Misura, Conformità o Punteggio',
        },
        trainingSheet: {
          type: Type.STRING,
          description: 'Scheda di allenamento orizzontale come situazione-problema in formato Markdown',
        },
        metaReflection: {
          type: Type.STRING,
          description: 'Domanda stimolo di riflessione metaconativa',
        },
        graphData: {
          type: Type.OBJECT,
          properties: {
            structural: { type: Type.INTEGER, description: 'Percentuale 0-100 Struttura (Tai)' },
            functional: { type: Type.INTEGER, description: 'Percentuale 0-100 Funzionalità (Shin)' },
            technical: { type: Type.INTEGER, description: 'Percentuale 0-100 Tecnica (Gi)' },
          },
          required: ['structural', 'functional', 'technical'],
        },
      };

      const requiredFields = [
        'stage',
        'stageName',
        'analysisScopeSummary',
        'consonance',
        'mobilization',
        'victoryModality',
        'trainingSheet',
        'metaReflection',
        'graphData',
      ];

      if (focusSpecificAthlete) {
        schemaProperties.targetAthleteConfirmation = {
          type: Type.STRING,
          description:
            "Dichiarazione dell'atleta specifico identificato visivamente nei fotogrammi e conferma che l'analisi è focalizzata su di lui.",
        };
        requiredFields.push('targetAthleteConfirmation');
      }

      if (resolvedCategory === SportCategory.DUAL_OPPOSITION) {
        schemaProperties.comparison = {
          type: Type.OBJECT,
          description: 'Confronto comparativo del Duello Conativo tra i due atleti opposti nel video',
          properties: {
            targetAthlete: {
              type: Type.OBJECT,
              description: focusSpecificAthlete
                ? "Profilo dell'atleta target"
                : 'Profilo del primo contendente (Giocatore A)',
              properties: {
                name: { type: Type.STRING },
                visualIdentifier: { type: Type.STRING },
                role: { type: Type.STRING },
                actionSummary: { type: Type.STRING },
                stage: { type: Type.INTEGER },
                stageName: { type: Type.STRING },
                preoccupation: { type: Type.STRING },
                graphData: {
                  type: Type.OBJECT,
                  properties: {
                    structural: { type: Type.INTEGER },
                    functional: { type: Type.INTEGER },
                    technical: { type: Type.INTEGER },
                  },
                  required: ['structural', 'functional', 'technical'],
                },
              },
              required: [
                'visualIdentifier',
                'role',
                'actionSummary',
                'stage',
                'stageName',
                'preoccupation',
                'graphData',
              ],
            },
            opponentAthlete: {
              type: Type.OBJECT,
              description: focusSpecificAthlete
                ? "Profilo dell'atleta avversario"
                : 'Profilo del secondo contendente (Giocatore B)',
              properties: {
                name: { type: Type.STRING },
                visualIdentifier: { type: Type.STRING },
                role: { type: Type.STRING },
                actionSummary: { type: Type.STRING },
                stage: { type: Type.INTEGER },
                stageName: { type: Type.STRING },
                preoccupation: { type: Type.STRING },
                graphData: {
                  type: Type.OBJECT,
                  properties: {
                    structural: { type: Type.INTEGER },
                    functional: { type: Type.INTEGER },
                    technical: { type: Type.INTEGER },
                  },
                  required: ['structural', 'functional', 'technical'],
                },
              },
              required: [
                'visualIdentifier',
                'role',
                'actionSummary',
                'stage',
                'stageName',
                'preoccupation',
                'graphData',
              ],
            },
            duel: {
              type: Type.OBJECT,
              description: 'Analisi della dominanza conativa e della regressione indotta',
              properties: {
                higherStageAthlete: { type: Type.STRING },
                lowerStageAthlete: { type: Type.STRING },
                levelGap: { type: Type.INTEGER },
                impositionMechanism: { type: Type.STRING },
                regressionEffect: { type: Type.STRING },
              },
              required: [
                'higherStageAthlete',
                'lowerStageAthlete',
                'levelGap',
                'impositionMechanism',
                'regressionEffect',
              ],
            },
          },
          required: ['targetAthlete', 'opponentAthlete', 'duel'],
        };
        requiredFields.push('comparison');
      } else if (resolvedCategory === SportCategory.TEAM_SPORT) {
        schemaProperties.teamDynamics = {
          type: Type.OBJECT,
          description: 'Analisi conativa della dinamica collettiva del gioco di squadra',
          properties: {
            teamFocus: { type: Type.STRING, description: 'Squadra o reparto osservato nel video' },
            collectiveOrganization: {
              type: Type.STRING,
              description: 'Organizzazione collettiva (es. gioco a grappolo vs circolazione strutturata)',
            },
            spaceTimeManagement: {
              type: Type.STRING,
              description: 'Gestione dello spazio, smarcamento, gioco senza palla e transizioni',
            },
            opponentPressureEffect: {
              type: Type.STRING,
              description: 'Reazione della squadra alla pressione avversaria',
            },
          },
          required: ['teamFocus', 'collectiveOrganization', 'spaceTimeManagement', 'opponentPressureEffect'],
        };
        requiredFields.push('teamDynamics');
      } else {
        schemaProperties.individualDynamics = {
          type: Type.OBJECT,
          description: 'Analisi conativa specifica per sport individuali (rapporto corpo-ambiente/attrezzo/modello)',
          properties: {
            environmentOrApparatus: {
              type: Type.STRING,
              description: 'Rapporto con acqua, attrezzo, pista, parete o spazio scenico',
            },
            technicalVsFunctionalBalance: {
              type: Type.STRING,
              description: 'Equilibrio tra fedeltà al modello tecnico (Gi) ed efficacia pratica/misura (Shin/Tai)',
            },
            motorEconomy: {
              type: Type.STRING,
              description: 'Economia del gesto, fluidità e autonomia esecutiva',
            },
          },
          required: ['environmentOrApparatus', 'technicalVsFunctionalBalance', 'motorEconomy'],
        };
        requiredFields.push('individualDynamics');
      }

      const schemaConfig = {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: schemaProperties,
          required: requiredFields,
        },
      };

      let responseText: string | undefined;
      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      let lastError: any = null;

      for (const modelCandidate of candidateModels) {
        try {
          console.log(
            `Tentativo di generazione con modello: ${modelCandidate} (Categoria: ${resolvedCategory}, FocusSpecifico: ${focusSpecificAthlete})`
          );
          const callPromise = ai.models.generateContent({
            model: modelCandidate,
            contents: { parts },
            config: schemaConfig,
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tempo di risposta superato per ${modelCandidate}`)), 55000)
          );

          const response = (await Promise.race([callPromise, timeoutPromise])) as any;

          if (response && response.text) {
            responseText = response.text;
            console.log(`Generazione riuscita con modello: ${modelCandidate}`);
            break;
          }
        } catch (candidateErr: any) {
          console.warn(`Modello ${modelCandidate} non disponibile o errore:`, candidateErr.message?.slice(0, 150));
          lastError = candidateErr;
        }
      }

      if (!responseText) {
        throw new Error(lastError?.message || 'Nessuna risposta generata dai modelli Gemini disponibili.');
      }

      const parsedResult = JSON.parse(responseText);

      let sanitizedComparison = undefined;
      if (resolvedCategory === SportCategory.DUAL_OPPOSITION && parsedResult.comparison) {
        const c = parsedResult.comparison;
        sanitizedComparison = {
          targetAthlete: {
            name: c.targetAthlete?.name || (focusSpecificAthlete ? 'Atleta Target' : 'Contendente A'),
            visualIdentifier:
              c.targetAthlete?.visualIdentifier || (focusSpecificAthlete ? 'Atleta Target' : 'Contendente A'),
            role: c.targetAthlete?.role || 'Ruolo non specificato',
            actionSummary: c.targetAthlete?.actionSummary || '',
            stage: Math.max(1, Math.min(5, Number(c.targetAthlete?.stage) || 1)),
            stageName: c.targetAthlete?.stageName || 'EMOZIONALE',
            preoccupation: c.targetAthlete?.preoccupation || '',
            graphData: {
              structural: Math.max(0, Math.min(100, Number(c.targetAthlete?.graphData?.structural) || 0)),
              functional: Math.max(0, Math.min(100, Number(c.targetAthlete?.graphData?.functional) || 0)),
              technical: Math.max(0, Math.min(100, Number(c.targetAthlete?.graphData?.technical) || 0)),
            },
          },
          opponentAthlete: {
            name: c.opponentAthlete?.name || (focusSpecificAthlete ? 'Atleta Avversario' : 'Contendente B'),
            visualIdentifier:
              c.opponentAthlete?.visualIdentifier || (focusSpecificAthlete ? 'Atleta Avversario' : 'Contendente B'),
            role: c.opponentAthlete?.role || 'Ruolo non specificato',
            actionSummary: c.opponentAthlete?.actionSummary || '',
            stage: Math.max(1, Math.min(5, Number(c.opponentAthlete?.stage) || 1)),
            stageName: c.opponentAthlete?.stageName || 'EMOZIONALE',
            preoccupation: c.opponentAthlete?.preoccupation || '',
            graphData: {
              structural: Math.max(0, Math.min(100, Number(c.opponentAthlete?.graphData?.structural) || 0)),
              functional: Math.max(0, Math.min(100, Number(c.opponentAthlete?.graphData?.functional) || 0)),
              technical: Math.max(0, Math.min(100, Number(c.opponentAthlete?.graphData?.technical) || 0)),
            },
          },
          duel: {
            higherStageAthlete: c.duel?.higherStageAthlete || '',
            lowerStageAthlete: c.duel?.lowerStageAthlete || '',
            levelGap: Math.abs(Number(c.duel?.levelGap) || 0),
            impositionMechanism: c.duel?.impositionMechanism || '',
            regressionEffect: c.duel?.regressionEffect || '',
          },
        };
      }

      const validatedResult = {
        ...parsedResult,
        sportCategory: resolvedCategory,
        sessionContext: resolvedSessionContext,
        privacyMode: resolvedPrivacyMode,
        focusSpecificAthlete,
        targetAthleteConfirmation: focusSpecificAthlete ? parsedResult.targetAthleteConfirmation : undefined,
        graphData: {
          structural: Math.max(0, Math.min(100, Number(parsedResult.graphData?.structural) || 0)),
          functional: Math.max(0, Math.min(100, Number(parsedResult.graphData?.functional) || 0)),
          technical: Math.max(0, Math.min(100, Number(parsedResult.graphData?.technical) || 0)),
        },
        comparison: sanitizedComparison,
        teamDynamics: resolvedCategory === SportCategory.TEAM_SPORT ? parsedResult.teamDynamics : undefined,
        individualDynamics: resolvedCategory === SportCategory.INDIVIDUAL ? parsedResult.individualDynamics : undefined,
      };

      res.json(validatedResult);
    } catch (error: any) {
      console.error('Server Gemini Analysis Error:', error);
      let errorMsg = error?.message || 'Errore durante la diagnosi conativa';
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed?.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // use raw errorMsg
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // Ultra-fast endpoint for real-time live camera assessment
  app.post('/api/analyze-live', requireApiAccess, async (req, res) => {
    try {
      const ai = getGeminiClient();
      const {
        frames,
        biomechanics,
        privacyMode: rawPrivacyMode,
        sport,
        sportCategory: rawCategory,
        sessionContext: rawSessionContext,
        focusSpecificAthlete: rawFocusSpecific,
        targetAthleteDescription,
        opponentDescription,
        teamName,
        notes,
      } = req.body;

      if (!Array.isArray(frames) || frames.length === 0) {
        return res.status(400).json({ error: 'Nessun fotogramma live ricevuto dalla fotocamera.' });
      }

      const resolvedCategory: SportCategory =
        rawCategory && Object.values(SportCategory).includes(rawCategory)
          ? rawCategory
          : getSportCategory(sport || 'JUDO');

      const resolvedSessionContext: SessionContext =
        rawSessionContext && Object.values(SessionContext).includes(rawSessionContext)
          ? rawSessionContext
          : SessionContext.SCUOLA;

      const resolvedPrivacyMode: PrivacyMode =
        rawPrivacyMode && Object.values(PrivacyMode).includes(rawPrivacyMode)
          ? rawPrivacyMode
          : PrivacyMode.STANDARD;

      const focusSpecificAthlete = Boolean(rawFocusSpecific);

      const liveBioSummary =
        Array.isArray(biomechanics) && biomechanics.length > 0
          ? biomechanics
              .map(
                (b: PoseBiomechanicsFrame, idx: number) =>
                  `Scatto ${idx + 1}: ${(b.athletes || [])
                    .map(
                      (a) =>
                        `${a.label} [busto=${a.torsoLeanDeg}°, gin=${a.leftKneeAngle ?? '-'}/${a.rightKneeAngle ?? '-'}°, ${a.postureSummary}]`
                    )
                    .join('; ')}`
              )
              .join(' | ')
          : '';

      const livePrivacyNote =
        resolvedPrivacyMode === PrivacyMode.SKELETON_ONLY
          ? `- MODALITÀ PRIVACY TOTALE (SOLO SCHELETRO MOTORIO): I fotogrammi contengono solo scheletri biomeccanici anonimizzati. Valuta Tai/Gi/Shin da postura, angoli e dinamica spaziale senza inventare colori di abbigliamento.${
              liveBioSummary ? `\n- Telemetria angoli rilevata: ${liveBioSummary}` : ''
            }`
          : resolvedPrivacyMode === PrivacyMode.BLUR_FACES
          ? `- MODALITÀ PRIVACY (VOLTI SFOCATI ON-DEVICE): I volti sono oscurati; osserva corpo, attrezzo, spazi e divise.${
              liveBioSummary ? `\n- Telemetria angoli: ${liveBioSummary}` : ''
            }`
          : '';

      const livePrompt = `
VALUTAZIONE CONATIVA ISTANTANEA IN TEMPO REALE (${resolvedSessionContext})
- Disciplina: ${sport || 'Non specificata'} (${resolvedCategory})
- Contesto: ${
        resolvedSessionContext === SessionContext.SCUOLA
          ? 'Ora di Educazione Fisica a Scuola'
          : resolvedSessionContext === SessionContext.GARA
          ? 'Gara / Competizione Ufficiale'
          : 'Palestra / Allenamento'
      }
${livePrivacyNote}
${teamName ? `- Squadra: ${teamName}` : ''}
${
  focusSpecificAthlete && targetAthleteDescription
    ? `- FOCUS SU ATLETA SPECIFICO: ${targetAthleteDescription}`
    : '- MODALITÀ GENERALE (non isolare un singolo target non richiesto)'
}
${resolvedCategory === SportCategory.DUAL_OPPOSITION && opponentDescription ? `- Avversario: ${opponentDescription}` : ''}
${notes ? `- Note docente/allenatore: ${notes}` : ''}

Analizza questa sequenza istantanea di fotogrammi appena catturati dalla fotocamera live secondo la Pedagogia Conativa di Gilles Bui-Xuân:
1. Determina la TAPPA CONATIVA attuale (1=EMOZIONALE, 2=FUNZIONALE, 3=TECNICA, 4=CONTESTUALE, 5=ESPERTA).
   ATTENZIONE: negli sport 1vs1 se un atleta target è passivo, bloccato o non porta attacchi, è Tappa 1 o 2 (MAI 4 o 5!).
2. Descrivi in 1-2 frasi chiare e oggettive cosa sta succedendo in questo istante ('liveObservation').
3. Indica la preoccupazione dominante visibile ora ('dominantPreoccupation').
4. Formula un CONSIGLIO PEDAGOGICO / TATTICO IMMEDIATO ('immediateCue'): una frase pratica e diretta che il docente/allenatore può dire o applicare SUBITO sul campo (adattata a ${resolvedSessionContext}).
${
  resolvedCategory === SportCategory.DUAL_OPPOSITION
    ? "5. Indica in 'duelLeader' chi dei due contendenti sta combattendo al livello più alto e imponendo il proprio gioco in questo momento."
    : ''
}
6. Fornisci le percentuali 0-100 di Struttura (Tai), Tecnica (Gi) e Funzionalità (Shin).
`;

      const parts: any[] = [];
      for (const frame of frames) {
        if (frame.data && frame.mimeType) {
          parts.push({
            inlineData: {
              mimeType: frame.mimeType,
              data: frame.data,
            },
          });
        }
      }
      parts.push({ text: livePrompt });

      const liveSchemaProps: Record<string, any> = {
        stage: { type: Type.INTEGER, description: 'Tappa conativa 1-5' },
        stageName: {
          type: Type.STRING,
          description: 'EMOZIONALE, FUNZIONALE, TECNICA, CONTESTUALE o ESPERTA',
        },
        liveObservation: {
          type: Type.STRING,
          description: 'Cosa sta succedendo oggettivamente nei fotogrammi live (max 2 frasi)',
        },
        dominantPreoccupation: {
          type: Type.STRING,
          description: 'Preoccupazione dominante in questo istante',
        },
        immediateCue: {
          type: Type.STRING,
          description: 'Feedback verbale o variazione pedagogica immediata pronta da usare ora sul campo',
        },
        graphData: {
          type: Type.OBJECT,
          properties: {
            structural: { type: Type.INTEGER },
            functional: { type: Type.INTEGER },
            technical: { type: Type.INTEGER },
          },
          required: ['structural', 'functional', 'technical'],
        },
      };

      const liveRequired = [
        'stage',
        'stageName',
        'liveObservation',
        'dominantPreoccupation',
        'immediateCue',
        'graphData',
      ];
      if (resolvedCategory === SportCategory.DUAL_OPPOSITION) {
        liveSchemaProps.duelLeader = {
          type: Type.STRING,
          description: 'Chi sta imponendo il livello conativo più alto in questo istante nel confronto 1vs1',
        };
        liveRequired.push('duelLeader');
      }

      const liveSchemaConfig = {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: liveSchemaProps,
          required: liveRequired,
        },
      };

      let responseText: string | undefined;
      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      let lastError: any = null;

      for (const modelCandidate of candidateModels) {
        try {
          const callPromise = ai.models.generateContent({
            model: modelCandidate,
            contents: { parts },
            config: liveSchemaConfig,
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout Live su ${modelCandidate}`)), 25000)
          );
          const response = (await Promise.race([callPromise, timeoutPromise])) as any;
          if (response && response.text) {
            responseText = response.text;
            break;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!responseText) {
        throw new Error(lastError?.message || 'Impossibile completare la valutazione live.');
      }

      const parsed = JSON.parse(responseText);
      const now = new Date();
      const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      res.json({
        id: `${Date.now()}`,
        capturedAt: timeLabel,
        stage: Math.max(1, Math.min(5, Number(parsed.stage) || 1)),
        stageName: parsed.stageName || 'EMOZIONALE',
        liveObservation: parsed.liveObservation || '',
        dominantPreoccupation: parsed.dominantPreoccupation || '',
        immediateCue: parsed.immediateCue || '',
        duelLeader: resolvedCategory === SportCategory.DUAL_OPPOSITION ? parsed.duelLeader : undefined,
        sportCategory: resolvedCategory,
        privacyMode: resolvedPrivacyMode,
        graphData: {
          structural: Math.max(0, Math.min(100, Number(parsed.graphData?.structural) || 0)),
          functional: Math.max(0, Math.min(100, Number(parsed.graphData?.functional) || 0)),
          technical: Math.max(0, Math.min(100, Number(parsed.graphData?.technical) || 0)),
        },
      });
    } catch (error: any) {
      console.error('Server Live Analysis Error:', error);
      res.status(500).json({ error: error?.message || 'Errore durante la valutazione live' });
    }
  });

  return app;
}

export function vercelRouteHandler(fixedPath: string) {
  const app = createApiApp();
  return (req: any, res: any) => {
    const rawUrl = typeof req.url === 'string' ? req.url : '';
    const queryIndex = rawUrl.indexOf('?');
    const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
    req.url = `${fixedPath}${query}`;
    return app(req, res);
  };
}

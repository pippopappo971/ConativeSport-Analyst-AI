export enum SportCategory {
  DUAL_OPPOSITION = 'DUAL_OPPOSITION',
  TEAM_SPORT = 'TEAM_SPORT',
  INDIVIDUAL = 'INDIVIDUAL',
}

export enum SessionContext {
  SCUOLA = 'SCUOLA',
  PALESTRA = 'PALESTRA',
  GARA = 'GARA',
}

export enum PrivacyMode {
  STANDARD = 'STANDARD',
  BLUR_FACES = 'BLUR_FACES',
  SKELETON_ONLY = 'SKELETON_ONLY',
}

export interface AthletePoseMetrics {
  label: string;
  centerX: number; // normalized 0-1
  torsoLeanDeg: number;
  leftKneeAngle?: number;
  rightKneeAngle?: number;
  leftElbowAngle?: number;
  rightElbowAngle?: number;
  stanceWidthRatio: number;
  postureSummary: string;
}

export interface PoseBiomechanicsFrame {
  timestamp: number;
  detectedCount: number;
  athletes: AthletePoseMetrics[];
}

export interface LiveEvaluationResult {
  id: string;
  capturedAt: string;
  stage: number;
  stageName: string;
  liveObservation: string;
  dominantPreoccupation: string;
  immediateCue: string;
  duelLeader?: string;
  sportCategory: SportCategory;
  privacyMode?: PrivacyMode;
  graphData: {
    structural: number;
    functional: number;
    technical: number;
  };
}

export interface ConativeDuelProfile {
  name?: string;
  visualIdentifier: string; // es. "Judogi Bianco, Cintura Rossa (Aka)" o "Giocatore in Primo Piano"
  role: string; // es. "Uke (Difensore)" o "Tori (Attaccante)" o "Battitore / Ribattitore"
  actionSummary: string; // Descrizione oggettiva di cosa ha fatto
  stage: number; // 1-5
  stageName: string; // EMOZIONALE, FUNZIONALE, TECNICA, CONTESTUALE, ESPERTA
  preoccupation: string; // Preoccupazione dominante
  graphData: {
    structural: number;
    functional: number;
    technical: number;
  };
}

export interface ConativeDuelAnalysis {
  higherStageAthlete: string; // Nome/identificativo dell'atleta al livello più alto
  lowerStageAthlete: string; // Nome/identificativo dell'atleta al livello più basso
  levelGap: number; // Differenza di tappe conative
  impositionMechanism: string; // Come l'atleta superiore ha imposto il proprio senso dell'azione
  regressionEffect: string; // Come l'atleta inferiore è stato abbassato/costretto a regredire
}

export interface TeamDynamicsAnalysis {
  teamFocus: string; // Squadra osservata o dinamica collettiva principale
  collectiveOrganization: string; // Come si organizza la squadra (gioco a grappolo vs circolazione strutturata)
  spaceTimeManagement: string; // Gestione dello spazio, smarcamento, gioco senza palla e transizioni
  opponentPressureEffect: string; // Reazione collettiva alla pressione avversaria
}

export interface IndividualDynamicsAnalysis {
  environmentOrApparatus: string; // Rapporto con ambiente/attrezzo/acqua/spazio/musica
  technicalVsFunctionalBalance: string; // Equilibrio tra conformità al modello (Gi) ed efficacia/misura (Tai/Shin)
  motorEconomy: string; // Fluidità, gestione energetica e autonomia motoria
}

export interface AnalysisResult {
  stage: number;
  stageName: string;
  consonance: string;
  mobilization: string;
  victoryModality: string; // Misura, Conformità o Punteggio
  trainingSheet: string;
  metaReflection: string;
  sportCategory?: SportCategory;
  sessionContext?: SessionContext;
  privacyMode?: PrivacyMode;
  focusSpecificAthlete?: boolean;
  analysisScopeSummary?: string; // Riepilogo chiaro dell'oggetto dell'analisi (es. "Analisi Collettiva Squadra", "Duello 1 vs 1 Completo", "Focus su Atleta Specifico")
  targetAthleteConfirmation?: string; // Conferma esplicita dell'identificazione visiva dell'atleta target (solo se richiesto focus specifico)
  graphData: {
    structural: number; // 0-100
    functional: number; // 0-100
    technical: number; // 0-100
  };
  comparison?: {
    targetAthlete: ConativeDuelProfile;
    opponentAthlete: ConativeDuelProfile;
    duel: ConativeDuelAnalysis;
  };
  teamDynamics?: TeamDynamicsAnalysis;
  individualDynamics?: IndividualDynamicsAnalysis;
}

export interface StudentProfile {
  id: string;
  date: string;
  sport: string;
  sportCategory?: SportCategory;
  sessionContext?: SessionContext;
  privacyMode?: PrivacyMode;
  focusSpecificAthlete?: boolean;
  name: string;
  notes: string;
  teamName?: string;
  athleteRole?: string;
  athleteCategory?: string;
  targetAthleteDescription?: string;
  opponentDescription?: string;
  analysis?: AnalysisResult;
}

export enum SportType {
  JUDO = 'JUDO',
  KARATE = 'KARATE / ARTI MARZIALI',
  SCHERMA = 'SCHERMA',
  TENNIS = 'TENNIS',
  TENNIS_TAVOLO = 'TENNIS TAVOLO',
  BADMINTON = 'BADMINTON',
  PALLAVOLO = 'PALLAVOLO',
  CALCIO_A_5 = 'CALCIO A 5',
  CALCIO = 'CALCIO',
  BASKET = 'BASKET',
  RUGBY = 'RUGBY',
  PALLAMANO = 'PALLAMANO',
  GINNASTICA_ARTISTICA = 'GINNASTICA ARTISTICA',
  GINNASTICA_RITMICA = 'GINNASTICA RITMICA',
  ATLETICA_LEGGERA = 'ATLETICA LEGGERA',
  NUOTO = 'NUOTO',
  DANZA = 'DANZA',
  ARRAMPICATA = 'ARRAMPICATA SPORTIVA',
  PATTINAGGIO = 'PATTINAGGIO'
}

export const DEFAULT_SPORT_CATEGORIES: Record<string, SportCategory> = {
  [SportType.JUDO]: SportCategory.DUAL_OPPOSITION,
  [SportType.KARATE]: SportCategory.DUAL_OPPOSITION,
  [SportType.SCHERMA]: SportCategory.DUAL_OPPOSITION,
  [SportType.TENNIS]: SportCategory.DUAL_OPPOSITION,
  [SportType.TENNIS_TAVOLO]: SportCategory.DUAL_OPPOSITION,
  [SportType.BADMINTON]: SportCategory.DUAL_OPPOSITION,
  [SportType.PALLAVOLO]: SportCategory.TEAM_SPORT,
  [SportType.CALCIO_A_5]: SportCategory.TEAM_SPORT,
  [SportType.CALCIO]: SportCategory.TEAM_SPORT,
  [SportType.BASKET]: SportCategory.TEAM_SPORT,
  [SportType.RUGBY]: SportCategory.TEAM_SPORT,
  [SportType.PALLAMANO]: SportCategory.TEAM_SPORT,
  [SportType.GINNASTICA_ARTISTICA]: SportCategory.INDIVIDUAL,
  [SportType.GINNASTICA_RITMICA]: SportCategory.INDIVIDUAL,
  [SportType.ATLETICA_LEGGERA]: SportCategory.INDIVIDUAL,
  [SportType.NUOTO]: SportCategory.INDIVIDUAL,
  [SportType.DANZA]: SportCategory.INDIVIDUAL,
  [SportType.ARRAMPICATA]: SportCategory.INDIVIDUAL,
  [SportType.PATTINAGGIO]: SportCategory.INDIVIDUAL,
};

export const getSportCategory = (sport: string, customMap?: Record<string, SportCategory>): SportCategory => {
  if (customMap && customMap[sport]) return customMap[sport];
  if (DEFAULT_SPORT_CATEGORIES[sport]) return DEFAULT_SPORT_CATEGORIES[sport];
  const upper = sport.toUpperCase();
  if (/JUDO|TENNIS|PADEL|BOXE|PUGILAT|LOTTA|TAEKWONDO|KARATE|SCHERMA|BADMINTON|PING PONG|SQUASH|MMA/.test(upper)) {
    return SportCategory.DUAL_OPPOSITION;
  }
  if (/CALCIO|CALCETTO|PALLAVOLO|VOLLEY|BASKET|PALLACANESTRO|RUGBY|PALLAMANO|HOCKEY|PALLANUOTO|BASEBALL|FOOTBALL/.test(upper)) {
    return SportCategory.TEAM_SPORT;
  }
  return SportCategory.INDIVIDUAL;
};
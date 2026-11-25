import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Video,
  FileText,
  Save,
  Trash2,
  Plus,
  AlertCircle,
  Loader2,
  Download,
  Play,
  Pause,
  Trophy,
  X,
  Target,
  Zap,
  Maximize2,
  Calendar,
  User,
  Users,
  Eye,
  Award,
  Sparkles,
  Layers,
  ChevronRight,
  RotateCcw,
  Swords,
  Shield,
  Scale,
  TrendingDown,
  Compass,
  Activity,
  UserCheck,
  Camera,
  School,
  Dumbbell,
  Radio,
  ShieldCheck,
  EyeOff,
  Lock,
  KeyRound,
  Copy,
  Check,
  LogOut,
  UserPlus,
  Smile,
  CheckCircle2,
  XCircle,
  UserX,
} from 'lucide-react';
import { analyzeVideo, analyzeGroupMobilization } from './services/geminiService';
import { exportWordReport, WordReportProfile } from './services/wordReportService';
import { preloadPrivacyEngine } from './services/privacyPoseService';
import {
  checkAuthStatus,
  verifyAccessCode,
  updateAccessConfig,
  setStoredAuthToken,
  AuthRole,
} from './services/authService';
import {
  AnalysisResult,
  GroupMobilizationAnalysis,
  StudentProfile,
  SportType,
  SportCategory,
  SessionContext,
  PrivacyMode,
  getSportCategory,
  DEFAULT_SPORT_CATEGORIES,
} from './types';
import ConativeGraph from './components/ConativeGraph';
import LiveCameraPanel from './components/LiveCameraPanel';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import ReactMarkdown from 'react-markdown';

// Helper to parse text and return array of nodes (strings + interactive timestamp buttons)
const parseTextToElements = (text: string, onTimestampClick: (seconds: number) => void) => {
  const regex = /\[(\d{1,2}):(\d{2})\]/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const totalSeconds = minutes * 60 + seconds;

    elements.push(
      <button
        key={`ts-${match.index}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTimestampClick(totalSeconds);
        }}
        className="inline-flex items-center px-2 py-0.5 mx-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-900 transition-all cursor-pointer border border-blue-200 shadow-sm align-middle transform hover:scale-105 active:scale-95"
        title="Clicca per andare al momento esatto del video"
      >
        ⏱ {match[0]}
      </button>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }
  return elements;
};

// Recursive function to process markdown children and inject interactive timestamps
const processMarkdownChildren = (children: React.ReactNode, onTimestampClick: (seconds: number) => void): React.ReactNode => {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return parseTextToElements(child, onTimestampClick);
    }
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (element.props && element.props.children) {
        return React.cloneElement(element, {
          ...element.props,
          children: processMarkdownChildren(element.props.children, onTimestampClick),
        } as any);
      }
    }
    return child;
  });
};

// Component to render text with clickable timestamps
const TextWithTimestamps: React.FC<{ text: string; onTimestampClick: (seconds: number) => void }> = ({ text, onTimestampClick }) => {
  if (!text) return null;
  return (
    <div className="whitespace-pre-line leading-relaxed">
      {parseTextToElements(text, onTimestampClick)}
    </div>
  );
};

// Category metadata & quick visual tags per sport type
const CATEGORY_META: Record<
  SportCategory,
  {
    label: string;
    shortLabel: string;
    description: string;
    defaultScopeLabel: string;
    specificFocusLabel: string;
    specificFocusHint: string;
    badgeBg: string;
  }
> = {
  [SportCategory.DUAL_OPPOSITION]: {
    label: 'Sport con 2 Giocatori Opposti (1 vs 1)',
    shortLabel: '2 Giocatori Opposti',
    description: 'Combattimento o racchetta: analisi del duello, dominanza ritmica e regressione conativa.',
    defaultScopeLabel: 'Analisi Globale Duello (Entrambi i Giocatori)',
    specificFocusLabel: 'Focus su un Atleta Specifico',
    specificFocusHint: 'Isola e diagnostica un singolo contendente contro il suo avversario.',
    badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  [SportCategory.TEAM_SPORT]: {
    label: 'Gioco di Squadra (Sport Collettivo)',
    shortLabel: 'Gioco di Squadra',
    description: 'Calcetto, pallavolo, basket: analisi della dinamica collettiva, spazi e cooperazione.',
    defaultScopeLabel: 'Analisi Collettiva della Squadra',
    specificFocusLabel: 'Focus su un Giocatore Specifico',
    specificFocusHint: 'Isola un singolo giocatore dentro il contesto collettivo della squadra.',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  [SportCategory.INDIVIDUAL]: {
    label: 'Sport Singolo / Individuale',
    shortLabel: 'Sport Singolo',
    description: 'Nuoto, ginnastica, atletica: rapporto diretto corpo-ambiente, attrezzo, misura o modello.',
    defaultScopeLabel: 'Analisi Diretta Atleta Singolo (Protagonista)',
    specificFocusLabel: 'Identifica un Atleta Specifico tra Più Partecipanti',
    specificFocusHint: 'Utile solo se ci sono più corsie/atleti contemporaneamente nel video.',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
  },
};

const CONTEXT_META: Record<
  SessionContext,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeBg: string;
  }
> = {
  [SessionContext.SCUOLA]: {
    label: 'Scuola (Ora di Educazione Fisica)',
    shortLabel: 'Scuola • Ed. Fisica',
    description: 'Inclusione, sicurezza emotiva, piacere di agire e situazioni-problema per gruppi classe eterogenei.',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  [SessionContext.PALESTRA]: {
    label: 'Palestra / Allenamento',
    shortLabel: 'Palestra • Allenamento',
    description: 'Progressione tecnico-tattica e décalage pedagogico mirato tra le tappe conative.',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  [SessionContext.GARA]: {
    label: 'Gara / Competizione',
    shortLabel: 'Gara • Competizione',
    description: 'Valutazione della tenuta o regressione sotto stress agonistico e debriefing tattico immediato.',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
  },
};

const PRIVACY_META: Record<
  PrivacyMode,
  {
    shortLabel: string;
    badgeBg: string;
  }
> = {
  [PrivacyMode.STANDARD]: {
    shortLabel: 'Video Originale',
    badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  [PrivacyMode.BLUR_FACES]: {
    shortLabel: 'Volti Sfocati On-Device',
    badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
  [PrivacyMode.SKELETON_ONLY]: {
    shortLabel: 'Privacy Totale (Solo Scheletro)',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
};

const App: React.FC = () => {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [sports, setSports] = useState<string[]>(Object.values(SportType));
  const [selectedSport, setSelectedSport] = useState<string>(SportType.JUDO);
  const [customSportCategories, setCustomSportCategories] = useState<Record<string, SportCategory>>({});
  const [sportCategory, setSportCategory] = useState<SportCategory>(() => getSportCategory(SportType.JUDO));
  const [sessionContext, setSessionContext] = useState<SessionContext>(SessionContext.SCUOLA);
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(PrivacyMode.BLUR_FACES);
  const [videoInputMode, setVideoInputMode] = useState<'upload' | 'live'>('upload');
  const [focusSpecificAthlete, setFocusSpecificAthlete] = useState<boolean>(false);
  const [newSport, setNewSport] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [athleteCategory, setAthleteCategory] = useState<string>('');
  const [athleteRole, setAthleteRole] = useState<string>('');
  const [teamName, setTeamName] = useState<string>('');
  const [targetAthleteDescription, setTargetAthleteDescription] = useState<string>('');
  const [opponentDescription, setOpponentDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [extraFilesContent, setExtraFilesContent] = useState<string>('');

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [archive, setArchive] = useState<StudentProfile[]>(() => {
    try {
      const saved = localStorage.getItem('conative_archive');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedArchiveItem, setSelectedArchiveItem] = useState<StudentProfile | null>(null);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [extractedThumbnails, setExtractedThumbnails] = useState<Array<{ data: string; timestamp: number }>>([]);
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);
  const [mobilizationFilter, setMobilizationFilter] = useState<'ALL' | 'MOBILITATO' | 'NON_INTERESSATO'>('ALL');
  const [groupMobilizationOnlyResult, setGroupMobilizationOnlyResult] =
    useState<GroupMobilizationAnalysis | null>(null);
  const [isAnalyzingMobilization, setIsAnalyzingMobilization] = useState<boolean>(false);
  const [lastActionMode, setLastActionMode] = useState<'analyze' | 'mobilization'>('analyze');

  // Access Gate & Zero-PIN Owner Authentication State
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authRole, setAuthRole] = useState<AuthRole>('guest');
  const [gateEnabled, setGateEnabled] = useState<boolean>(true);
  const [friendPinConfig, setFriendPinConfig] = useState<string>('');
  const [friendPinDraft, setFriendPinDraft] = useState<string>('');
  const [ownerInviteKey, setOwnerInviteKey] = useState<string>('');
  const [serverSharedAppUrl, setServerSharedAppUrl] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState<boolean>(false);
  const [isSavingAccessConfig, setIsSavingAccessConfig] = useState<boolean>(false);
  const [accessModalError, setAccessModalError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'owner' | 'friend' | 'pin' | null>(null);
  const [previewFriendScreen, setPreviewFriendScreen] = useState<boolean>(false);

  const toggleVisualTag = (tag: string) => {
    setTargetAthleteDescription((prev) => {
      const parts = prev.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.includes(tag)) {
        return parts.filter((p) => p !== tag).join(', ');
      } else {
        return [...parts, tag].join(', ');
      }
    });
  };

  const toggleOpponentVisualTag = (tag: string) => {
    setOpponentDescription((prev) => {
      const parts = prev.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.includes(tag)) {
        return parts.filter((p) => p !== tag).join(', ');
      } else {
        return [...parts, tag].join(', ');
      }
    });
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Sync archive with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('conative_archive', JSON.stringify(archive));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }, [archive]);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [videoFile]);

  // Warm up on-device MediaPipe privacy engine whenever privacy protection is enabled
  useEffect(() => {
    if (privacyMode !== PrivacyMode.STANDARD) {
      preloadPrivacyEngine();
    }
  }, [privacyMode]);

  // Bootstrap Owner Zero-PIN / Friend PIN Gate state
  useEffect(() => {
    let active = true;
    const initAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const ownerParam = params.get('owner');
        if (ownerParam) {
          try {
            const res = await verifyAccessCode({ ownerKey: ownerParam });
            if (!active) return;
            setIsAuthorized(res.authorized);
            setAuthRole(res.role);
            setGateEnabled(res.gateEnabled);
            if (res.friendPin) {
              setFriendPinConfig(res.friendPin);
              setFriendPinDraft(res.friendPin);
            }
            if (res.ownerInviteKey) setOwnerInviteKey(res.ownerInviteKey);
            if (res.sharedAppUrl) setServerSharedAppUrl(res.sharedAppUrl);
            window.history.replaceState({}, '', window.location.pathname);
            setAuthLoading(false);
            return;
          } catch (err: any) {
            if (active) {
              setPinError(err?.message || 'Link proprietario non valido.');
            }
            window.history.replaceState({}, '', window.location.pathname);
          }
        }

        const status = await checkAuthStatus();
        if (!active) return;
        setIsAuthorized(status.authorized);
        setAuthRole(status.role);
        setGateEnabled(status.gateEnabled);
        if (status.friendPin) {
          setFriendPinConfig(status.friendPin);
          setFriendPinDraft(status.friendPin);
        }
        if (status.ownerInviteKey) setOwnerInviteKey(status.ownerInviteKey);
        if (status.sharedAppUrl) setServerSharedAppUrl(status.sharedAppUrl);
      } catch (err) {
        console.warn('Auth status check error:', err);
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    initAuth();
    return () => {
      active = false;
    };
  }, []);

  const getEffectiveSharedBaseUrl = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('ais-dev-')) {
        return origin.replace('ais-dev-', 'ais-pre-');
      }
      if (serverSharedAppUrl && !serverSharedAppUrl.includes('localhost')) {
        return serverSharedAppUrl;
      }
      return origin;
    }
    return serverSharedAppUrl || '';
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!pinInput.trim()) {
      setPinError('Inserisci il codice di accesso.');
      return;
    }
    if (previewFriendScreen) {
      setPinError('Sei in modalità Anteprima Proprietario: usa il pulsante qui sopra per tornare subito dentro senza codice.');
      return;
    }
    setIsVerifyingPin(true);
    try {
      const res = await verifyAccessCode({ pin: pinInput.trim() });
      setIsAuthorized(res.authorized);
      setAuthRole(res.role);
      setGateEnabled(res.gateEnabled);
      setPinInput('');
    } catch (err: any) {
      setPinError(err?.message || 'Codice di accesso errato.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleSaveAccessConfig = async (nextGateEnabled: boolean = gateEnabled) => {
    setAccessModalError(null);
    setIsSavingAccessConfig(true);
    try {
      const updated = await updateAccessConfig({
        gateEnabled: nextGateEnabled,
        friendPin: friendPinDraft.trim() || friendPinConfig,
      });
      setGateEnabled(updated.gateEnabled);
      setFriendPinConfig(updated.friendPin);
      setFriendPinDraft(updated.friendPin);
      if (updated.ownerInviteKey) setOwnerInviteKey(updated.ownerInviteKey);
      if (updated.sharedAppUrl) setServerSharedAppUrl(updated.sharedAppUrl);
      setSuccessBanner(
        updated.gateEnabled
          ? `Accesso amici aggiornato! Codice attivo: ${updated.friendPin}`
          : 'Protezione disattivata: chiunque abbia il link condiviso può accedere.'
      );
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: any) {
      setAccessModalError(err?.message || 'Errore aggiornamento impostazioni.');
    } finally {
      setIsSavingAccessConfig(false);
    }
  };

  const handleCopyText = async (text: string, type: 'owner' | 'friend' | 'pin') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      setAccessModalError('Copia automatica non supportata dal browser: seleziona e copia manualmente il testo.');
    }
  };

  const handleFriendLogout = async () => {
    setStoredAuthToken('');
    setIsAuthorized(false);
    setAuthRole('guest');
    setPinInput('');
    try {
      const status = await checkAuthStatus();
      setIsAuthorized(status.authorized);
      setAuthRole(status.role);
    } catch {
      // ignore
    }
  };

  const handleAddSport = () => {
    const trimmed = newSport.trim().toUpperCase();
    if (trimmed && !sports.includes(trimmed)) {
      const detected = getSportCategory(trimmed);
      setCustomSportCategories((prev) => ({ ...prev, [trimmed]: detected }));
      setSports([...sports, trimmed]);
      setSelectedSport(trimmed);
      setSportCategory(detected);
      setNewSport('');
    }
  };

  const handleRemoveSport = (sportToRemove: string) => {
    const updated = sports.filter((s) => s !== sportToRemove);
    setSports(updated);
    if (selectedSport === sportToRemove && updated.length > 0) {
      const next = updated[0];
      setSelectedSport(next);
      setSportCategory(getSportCategory(next, customSportCategories));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      for (let i = 0; i < e.target.files.length; i++) {
        const text = await e.target.files[i].text();
        setExtraFilesContent((prev) => prev + `\n\n--- DOCUMENTO: ${e.target.files![i].name} ---\n${text}`);
      }
    }
  };

  const handleAnalyze = async () => {
    setLastActionMode('analyze');
    setErrorMessage(null);
    setSuccessBanner(null);

    if (!videoFile) {
      setErrorMessage("Per favore, carica un video della performance prima di avviare l'analisi conativa.");
      const el = document.getElementById('sezione-video');
      el?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setGroupMobilizationOnlyResult(null);
    setIsAnalyzing(true);
    setAnalysisStatus('Inizializzazione campionamento fotogrammi video...');

    try {
      const fullContext = `${instructions}\n\n${extraFilesContent}`.trim();
      const result = await analyzeVideo(
        videoFile,
        selectedSport,
        notes,
        fullContext,
        focusSpecificAthlete ? targetAthleteDescription : '',
        teamName,
        focusSpecificAthlete ? athleteRole : '',
        athleteCategory,
        sportCategory === SportCategory.DUAL_OPPOSITION ? opponentDescription : '',
        sportCategory,
        focusSpecificAthlete,
        sessionContext,
        (progressMsg) => setAnalysisStatus(progressMsg),
        (frames) => setExtractedThumbnails(frames),
        privacyMode
      );

      setMobilizationFilter('ALL');
      setAnalysisResult(result);
      setAnalysisStatus('');
      setSuccessBanner('Analisi conativa completata con successo! Scorri in basso per visualizzare il report.');

      setTimeout(() => {
        const el = document.getElementById('report-conativo');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    } catch (error: any) {
      console.error('Errore durante l\'analisi conativa:', error);
      let msg = error?.message || 'Si è verificato un errore durante la diagnosi.';
      if (typeof msg === 'string') {
        if (msg.includes('Timeout') || msg.includes('Tempo di risposta superato') || msg.includes('timeout')) {
          msg = 'L\'elaborazione visiva ha richiesto più tempo del previsto a causa della complessità del video o di una congestione di rete. Clicca su "Riprova" per riavviare l\'elaborazione.';
        } else if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
          msg = 'Il server AI sta gestendo un carico elevato temporaneo. Clicca sul pulsante "Riprova" tra pochi istanti.';
        } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          msg = 'Limite di richieste raggiunto. Riprova tra 60 secondi.';
        } else if (msg.includes('Accesso non autorizzato')) {
          setStoredAuthToken('');
          checkAuthStatus()
            .then((s) => {
              setIsAuthorized(s.authorized);
              setAuthRole(s.role);
            })
            .catch(() => setIsAuthorized(false));
        }
      }
      setErrorMessage(msg);
      setAnalysisStatus('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeMobilization = async () => {
    setLastActionMode('mobilization');
    setErrorMessage(null);
    setSuccessBanner(null);

    if (!videoFile) {
      setVideoInputMode('upload');
      setErrorMessage('Carica prima un video della classe o dell\'allenamento per contare alunni/atleti mobilitati e non interessati.');
      const el = document.getElementById('sezione-video');
      el?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setIsAnalyzingMobilization(true);
    setAnalysisStatus('Analisi rapida mobilitazione gruppo (movimento, espressioni facciali, postura)...');

    try {
      const gmResult = (await analyzeGroupMobilization(
        videoFile,
        selectedSport,
        sessionContext,
        privacyMode,
        teamName,
        notes,
        (progressMsg) => setAnalysisStatus(progressMsg),
        (frames) => setExtractedThumbnails(frames)
      )) as GroupMobilizationAnalysis;

      setMobilizationFilter('ALL');
      setGroupMobilizationOnlyResult(gmResult);
      setAnalysisStatus('');
      setSuccessBanner(
        `Conteggio completato: ${gmResult.mobilizedCount} mobilitati su ${gmResult.totalDetected} osservati (${gmResult.disengagedCount} non interessati).`
      );

      setTimeout(() => {
        const el = document.getElementById('report-mobilizzazione');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (error: any) {
      console.error('Errore analisi mobilitazione gruppo:', error);
      let msg = error?.message || 'Errore durante il conteggio della mobilitazione del gruppo.';
      if (typeof msg === 'string' && msg.includes('Accesso non autorizzato')) {
        setStoredAuthToken('');
        checkAuthStatus()
          .then((s) => {
            setIsAuthorized(s.authorized);
            setAuthRole(s.role);
          })
          .catch(() => setIsAuthorized(false));
      }
      setErrorMessage(msg);
      setAnalysisStatus('');
    } finally {
      setIsAnalyzingMobilization(false);
    }
  };

  const handleSave = () => {
    if (!analysisResult) return;
    const defaultSubjectName =
      sportCategory === SportCategory.TEAM_SPORT && !focusSpecificAthlete
        ? teamName.trim() || `Squadra ${selectedSport}`
        : sportCategory === SportCategory.DUAL_OPPOSITION && !focusSpecificAthlete
        ? `Duello ${selectedSport}`
        : studentName.trim() || 'Allievo Senza Nome';

    const newProfile: StudentProfile = {
      id: Date.now().toString(),
      date,
      sport: selectedSport,
      sportCategory,
      sessionContext: analysisResult.sessionContext || sessionContext,
      privacyMode: analysisResult.privacyMode || privacyMode,
      focusSpecificAthlete,
      name: focusSpecificAthlete ? studentName.trim() || 'Atleta Specifico' : defaultSubjectName,
      notes,
      teamName: sportCategory === SportCategory.TEAM_SPORT || teamName ? teamName : undefined,
      athleteRole: focusSpecificAthlete && athleteRole.trim() ? athleteRole.trim() : undefined,
      athleteCategory: athleteCategory.trim() || undefined,
      targetAthleteDescription: focusSpecificAthlete && targetAthleteDescription.trim() ? targetAthleteDescription.trim() : undefined,
      opponentDescription: sportCategory === SportCategory.DUAL_OPPOSITION && opponentDescription.trim() ? opponentDescription.trim() : undefined,
      analysis: analysisResult,
    };
    setArchive([newProfile, ...archive]);
    setSuccessBanner('Diagnosi conativa salvata con successo nell’Archivio Storico!');
    setTimeout(() => {
      setSuccessBanner(null);
    }, 4000);
  };

  const handleExportWord = async (profile: WordReportProfile) => {
    setIsExportingWord(true);
    setErrorMessage(null);
    try {
      await exportWordReport(profile);
      setSuccessBanner('Report Word (.docx) generato e scaricato con grafico e percentuali!');
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: any) {
      console.error('Errore esportazione Word:', err);
      setErrorMessage(err?.message || 'Impossibile generare il documento Word.');
    } finally {
      setIsExportingWord(false);
    }
  };

  const exportReport = (profile: { name: string; sport: string; sportCategory?: SportCategory; sessionContext?: SessionContext; focusSpecificAthlete?: boolean; date: string; teamName?: string; analysis?: AnalysisResult }) => {
    if (!profile.analysis) return;
    const { stage, stageName, victoryModality, consonance, mobilization, metaReflection, trainingSheet, graphData, comparison, teamDynamics, individualDynamics, groupMobilization, analysisScopeSummary } = profile.analysis;
    const ctx = profile.analysis.sessionContext || profile.sessionContext || SessionContext.PALESTRA;

    let extraSection = '';
    if (groupMobilization) {
      const individualsLines = (groupMobilization.observedIndividuals || [])
        .map(
          (ind) =>
            `  * ${ind.identifier}: [${ind.status === 'MOBILITATO' ? 'MOBILITATO' : 'NON INTERESSATO'} | Movimento: ${ind.movementLevel}] ${ind.postureAndExpressionCue} -> ${ind.conativeInterpretation}`
        )
        .join('\n');
      extraSection += `
------------------------------------------------------------------------
CENSIMENTO MOBILITAZIONE CONATIVA (ALUNNI / ATLETI)
------------------------------------------------------------------------
- Totale Osservati: ${groupMobilization.totalDetected}
- Mobilitati a Livello Conativo: ${groupMobilization.mobilizedCount} (${groupMobilization.mobilizationRatePct}%)
- Non Interessati / Disimpegnati: ${groupMobilization.disengagedCount}
- Livello Coinvolgimento Globale: ${groupMobilization.overallEngagementLevel}
- Quantita di Movimento/Attivita (${groupMobilization.movementActivityScore}/100): ${groupMobilization.movementActivityAnalysis}
- Espressioni Facciali & Sguardo: ${groupMobilization.facialExpressionAnalysis}
- Postura Generale del Corpo: ${groupMobilization.bodyPostureAnalysis}
- Dettaglio Soggetti Osservati:
${individualsLines || '  (Nessun dettaglio individuale)'}
- Sintesi Gruppo: ${groupMobilization.groupSummary}
- Strategia per Riattivare i Non Interessati: ${groupMobilization.reengagementStrategy}
`;
    }

    if (comparison) {
      extraSection += `
------------------------------------------------------------------------
DUELLO CONATIVO (CONFRONTO 2 GIOCATORI OPPOSTI)
------------------------------------------------------------------------
CONTENDENTE 1:
- Identificativo: ${comparison.targetAthlete.visualIdentifier}
- Ruolo: ${comparison.targetAthlete.role}
- Azione Osservata: ${comparison.targetAthlete.actionSummary}
- Tappa Conativa: TAPPA ${comparison.targetAthlete.stage} - ${comparison.targetAthlete.stageName}
- Preoccupazione Dominante: ${comparison.targetAthlete.preoccupation}
- Volume: Tai ${comparison.targetAthlete.graphData.structural}% | Gi ${comparison.targetAthlete.graphData.technical}% | Shin ${comparison.targetAthlete.graphData.functional}%

CONTENDENTE 2:
- Identificativo: ${comparison.opponentAthlete.visualIdentifier}
- Ruolo: ${comparison.opponentAthlete.role}
- Azione Osservata: ${comparison.opponentAthlete.actionSummary}
- Tappa Conativa: TAPPA ${comparison.opponentAthlete.stage} - ${comparison.opponentAthlete.stageName}
- Preoccupazione Dominante: ${comparison.opponentAthlete.preoccupation}
- Volume: Tai ${comparison.opponentAthlete.graphData.structural}% | Gi ${comparison.opponentAthlete.graphData.technical}% | Shin ${comparison.opponentAthlete.graphData.functional}%

DINAMICA DEL DUELLO:
- Dominanza Conativa (Livello più Alto): ${comparison.duel.higherStageAthlete}
- Livello Conativo Inferiore: ${comparison.duel.lowerStageAthlete} (Divario di ${comparison.duel.levelGap} tappe)
- Meccanismo di Imposizione:
  ${comparison.duel.impositionMechanism}
- Effetto di Regressione sull'Atleta Inferiore:
  ${comparison.duel.regressionEffect}
`;
    }

    if (teamDynamics) {
      extraSection += `
------------------------------------------------------------------------
DINAMICA COLLETTIVA DI SQUADRA
------------------------------------------------------------------------
- Focus Squadra: ${teamDynamics.teamFocus}
- Organizzazione Collettiva: ${teamDynamics.collectiveOrganization}
- Gestione Spazio-Tempo & Gioco senza Palla: ${teamDynamics.spaceTimeManagement}
- Risposta alla Pressione Avversaria: ${teamDynamics.opponentPressureEffect}
`;
    }

    if (individualDynamics) {
      extraSection += `
------------------------------------------------------------------------
RAPPORTO CORPO-AMBIENTE / ATTREZZO (SPORT SINGOLO)
------------------------------------------------------------------------
- Rapporto con Ambiente / Attrezzo: ${individualDynamics.environmentOrApparatus}
- Equilibrio Modello Tecnico (Gi) vs Efficacia (Shin): ${individualDynamics.technicalVsFunctionalBalance}
- Economia Motoria: ${individualDynamics.motorEconomy}
`;
    }

    const reportText = `========================================================================
CONATIVE SPORT ANALYST - REPORT DI ANALISI PEDAGOGICA
========================================================================
Data Sessione: ${profile.date}
Contesto Operativo: ${CONTEXT_META[ctx].label}
Disciplina: ${profile.sport} (${CATEGORY_META[profile.analysis.sportCategory || profile.sportCategory || SportCategory.INDIVIDUAL].shortLabel})
Oggetto Analisi: ${analysisScopeSummary || profile.name}
${profile.teamName ? `Squadra: ${profile.teamName}\n` : ''}

------------------------------------------------------------------------
DIAGNOSI CONATIVA (Modello Gilles Bui-Xuân / Jigoro Kano / Maurice Reuchlin)
------------------------------------------------------------------------
Tappa Rilevata: TAPPA ${stage} - ${stageName}
Modalità di Vittoria: ${victoryModality}
${profile.analysis.targetAthleteConfirmation ? `\nCONFERMA IDENTIFICAZIONE ATLETA SPECIFICO:\n${profile.analysis.targetAthleteConfirmation}\n` : ''}
${extraSection}
Assetto Volumetrico:
- Struttura (Tai):     ${graphData.structural}%
- Tecnica (Gi):        ${graphData.technical}%
- Funzionalità (Shin): ${graphData.functional}%

CONSONANZA / CONFLITTO:
${consonance}

PREOCCUPAZIONE DOMINANTE & MOBILITAZIONE (TAPPA CONATIVA):
${mobilization}

DOMANDA DI RIFLESSIONE METACONATIVA:
"${metaReflection}"

------------------------------------------------------------------------
SCHEDA DI ALLENAMENTO ORIZZONTALE (SITUAZIONE-PROBLEMA)
------------------------------------------------------------------------
${trainingSheet}
========================================================================
Generato con ConativeSport Analyst AI
`;

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Report_Conativo_${(profile.name || 'Analisi').replace(/\s+/g, '_')}_${profile.date}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play();
      else videoRef.current.pause();
    }
  };

  const changeSpeed = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const jumpToTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setTimeout(() => {
        videoRef.current?.play().catch(console.warn);
      }, 50);
      videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const markdownComponents = {
    h3: ({ children }: any) => (
      <h3 className="text-emerald-800 font-black uppercase tracking-wider text-sm mt-6 mb-3 flex items-center gap-2 border-b border-emerald-100 pb-1">
        {children}
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="mb-3 text-slate-700 leading-relaxed text-sm">
        {processMarkdownChildren(children, jumpToTime)}
      </p>
    ),
    ul: ({ children }: any) => <ul className="space-y-2 mb-4">{children}</ul>,
    li: ({ children }: any) => (
      <li className="text-slate-700 text-sm flex gap-2">
        <span className="text-emerald-500 font-bold shrink-0">•</span>
        <div>{processMarkdownChildren(children, jumpToTime)}</div>
      </li>
    ),
    strong: ({ children }: any) => (
      <strong className="font-bold text-slate-900">{processMarkdownChildren(children, jumpToTime)}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic">{processMarkdownChildren(children, jumpToTime)}</em>
    ),
  };

  const renderGroupMobilizationCard = (gm: GroupMobilizationAnalysis) => (
    <div className="bg-white rounded-3xl border-2 border-teal-200/90 shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-emerald-950 p-5 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-500/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-teal-500/20 rounded-lg text-teal-300 border border-teal-400/30">
              <Users size={18} />
            </span>
            <span className="text-[10px] font-black tracking-widest uppercase text-teal-300">
              Censimento Comportamentale (Movimento • Espressioni • Postura)
            </span>
          </div>
          <h3 className="text-xl font-black tracking-tight mt-1">
            MOBILITAZIONE CONATIVA DEL GRUPPO / ALUNNI
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-3 py-1 text-xs font-black rounded-xl border uppercase tracking-wider ${
              gm.overallEngagementLevel === 'ALTA'
                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                : gm.overallEngagementLevel === 'MEDIA'
                ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                : 'bg-rose-500/25 text-rose-200 border-rose-400/40'
            }`}
          >
            Coinvolgimento: {gm.overallEngagementLevel}
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* 4 KPI Contatori Immediati */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              Totale Osservati
            </span>
            <span className="text-3xl font-black text-slate-900 tabular-nums mt-1 block">
              {gm.totalDetected}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">alunni / atleti</span>
          </div>

          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center justify-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-600" />
              Mobilitati
            </span>
            <span className="text-3xl font-black text-emerald-700 tabular-nums mt-1 block">
              {gm.mobilizedCount}
            </span>
            <span className="text-[10px] text-emerald-700 font-bold">
              {gm.mobilizationRatePct}% del gruppo
            </span>
          </div>

          <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 text-center shadow-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center justify-center gap-1">
              <UserX size={12} className="text-rose-600" />
              Non Interessati
            </span>
            <span className="text-3xl font-black text-rose-700 tabular-nums mt-1 block">
              {gm.disengagedCount}
            </span>
            <span className="text-[10px] text-rose-700 font-bold">
              {Math.max(0, 100 - gm.mobilizationRatePct)}% passivi / disimpegnati
            </span>
          </div>

          <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4 text-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 flex items-center justify-center gap-1">
              <Activity size={12} className="text-cyan-600" />
              Movimento / Attività
            </span>
            <span className="text-3xl font-black text-cyan-700 tabular-nums mt-1 block">
              {gm.movementActivityScore}
              <span className="text-sm font-bold text-cyan-500">/100</span>
            </span>
            <span className="text-[10px] text-cyan-700 font-semibold">intensità motoria</span>
          </div>
        </div>

        {/* Barra visiva proporzione Mobilitati vs Non Interessati */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
            <span className="text-emerald-700">
              Mobilitati conativamente: {gm.mobilizedCount}
            </span>
            <span className="text-rose-700">
              Non interessati: {gm.disengagedCount}
            </span>
          </div>
          <div className="w-full h-3.5 bg-rose-200 rounded-full overflow-hidden flex border border-slate-200">
            <div
              className="bg-emerald-500 h-full transition-all duration-700"
              style={{ width: `${gm.mobilizationRatePct}%` }}
            />
          </div>
        </div>

        {/* 3 Pilastri Comportamentali: Movimento, Espressioni Facciali, Postura */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-cyan-50/60 p-4 rounded-2xl border border-cyan-200/80 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-900 flex items-center gap-1.5">
              <Activity size={14} className="text-cyan-600" />
              1. Quantità di Movimento & Attività
            </span>
            <div className="text-xs text-slate-700 leading-relaxed">
              <TextWithTimestamps text={gm.movementActivityAnalysis} onTimestampClick={jumpToTime} />
            </div>
          </div>

          <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Smile size={14} className="text-amber-600" />
              2. Espressioni Facciali & Sguardo
            </span>
            <div className="text-xs text-slate-700 leading-relaxed">
              <TextWithTimestamps text={gm.facialExpressionAnalysis} onTimestampClick={jumpToTime} />
            </div>
          </div>

          <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-200/80 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
              <UserCheck size={14} className="text-indigo-600" />
              3. Postura Generale del Corpo
            </span>
            <div className="text-xs text-slate-700 leading-relaxed">
              <TextWithTimestamps text={gm.bodyPostureAnalysis} onTimestampClick={jumpToTime} />
            </div>
          </div>
        </div>

        {/* Elenco Individuale Osservato con Filtro */}
        {gm.observedIndividuals.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Dettaglio Alunni / Atleti Osservati ({gm.observedIndividuals.length})
              </span>
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
                {[
                  { key: 'ALL' as const, label: 'Tutti' },
                  { key: 'MOBILITATO' as const, label: `Mobilitati (${gm.mobilizedCount})` },
                  { key: 'NON_INTERESSATO' as const, label: `Non Interessati (${gm.disengagedCount})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setMobilizationFilter(tab.key)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      mobilizationFilter === tab.key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gm.observedIndividuals
                .filter((ind) => mobilizationFilter === 'ALL' || ind.status === mobilizationFilter)
                .map((ind, idx) => {
                  const isMob = ind.status === 'MOBILITATO';
                  return (
                    <div
                      key={`${ind.identifier}-${idx}`}
                      className={`p-3.5 rounded-2xl border-2 space-y-1.5 ${
                        isMob
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-xs font-black text-slate-900">{ind.identifier}</strong>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                            Mov: {ind.movementLevel}
                          </span>
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ${
                              isMob ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            }`}
                          >
                            {isMob ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {isMob ? 'MOBILITATO' : 'NON INTERESSATO'}
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-700 leading-snug">
                        <TextWithTimestamps text={ind.postureAndExpressionCue} onTimestampClick={jumpToTime} />
                      </div>
                      <p className="text-[11px] font-semibold text-slate-600 italic">
                        {ind.conativeInterpretation}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Sintesi & Strategia di Riattivazione */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
              Sintesi Conativa del Gruppo
            </span>
            <div className="text-xs text-slate-800 leading-relaxed font-medium">
              <TextWithTimestamps text={gm.groupSummary} onTimestampClick={jumpToTime} />
            </div>
          </div>
          <div className="bg-teal-50 p-4 rounded-2xl border border-teal-200 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 block">
              Leva Orizzontale per Coinvolgere i Non Interessati
            </span>
            <div className="text-xs text-teal-950 leading-relaxed font-medium">
              <TextWithTimestamps text={gm.reengagementStrategy} onTimestampClick={jumpToTime} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <div className="p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
        <h1 className="text-lg font-black tracking-tight">ConativeSport Analyst AI</h1>
        <p className="text-xs text-slate-400 mt-1">Verifica accesso in corso...</p>
      </div>
    );
  }

  if (!isAuthorized || previewFriendScreen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-4 sm:p-6">
        {previewFriendScreen && (
          <div className="w-full max-w-md mb-4 bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="text-xs">
              <strong className="block font-black uppercase tracking-wider text-amber-300">
                Anteprima Schermata Amici
              </strong>
              <span>Questo è ciò che vedono i tuoi amici quando aprono il link pubblico.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewFriendScreen(false);
                setPinError(null);
              }}
              className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shrink-0 cursor-pointer transition-colors"
            >
              ← Torna in App
            </button>
          </div>
        )}

        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 p-6 sm:p-8 text-white text-center relative overflow-hidden">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight">ConativeSport Analyst AI</h1>
            <p className="text-xs text-slate-400 mt-1">
              Pedagogia Conativa & Biomeccanica Sportiva
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">
                Accesso Riservato agli Invitati
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Inserisci il <strong>Codice di Accesso Amici</strong> fornito dall'amministratore per sbloccare l'analisi video e la fotocamera live.
              </p>
            </div>

            {pinError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700 font-semibold">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{pinError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                Codice di Accesso
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Inserisci il codice (es. SPORT2026)..."
                  autoComplete="off"
                  autoCapitalize="none"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold tracking-wider text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifyingPin}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isVerifyingPin ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {isVerifyingPin ? 'Verifica in corso...' : "Entra nell'App"}
            </button>

            <div className="pt-2 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Sei il proprietario su un nuovo dispositivo? Apri una volta il tuo <strong>Link Proprietario</strong> per accedere sempre senza codice.
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="bg-slate-900 text-white p-5 lg:p-6 shadow-xl sticky top-0 z-40 border-b border-slate-800">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="ConativeSport Analyst"
              className="w-12 h-12 rounded-2xl shadow-lg shadow-blue-500/20 border border-blue-400/30 object-cover shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  ConativeSport Analyst AI
                </h1>
                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-400/30 uppercase tracking-widest">
                  Conative Lab
                </span>
              </div>
              <p className="text-slate-400 text-xs italic tracking-wide">
                Pedagogia Conativa & Mobilitazione (Gilles Bui-Xuân • Jigoro Kano • Maurice Reuchlin)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => {
                setVideoInputMode('upload');
                setTimeout(() => {
                  const el = document.getElementById('card-mobilitazione-gruppo') || document.getElementById('sezione-video');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
              }}
              className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors border border-teal-400/40 font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Users size={13} />
              Mobilitazione Alunni
            </button>
            <button
              type="button"
              onClick={() => {
                setVideoInputMode('live');
                setTimeout(() => {
                  const el = document.getElementById('sezione-video');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors border border-emerald-400/30 font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Radio size={13} className="animate-pulse" />
              Ripresa & Valutazione Live
            </button>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('modulo-anagrafica');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700 font-semibold cursor-pointer"
            >
              📝 Dati Allievo
            </button>
            {archive.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('archivio-sezione');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/40 text-blue-200 rounded-lg transition-colors border border-blue-500/30 font-semibold cursor-pointer"
              >
                🗂 Archivio ({archive.length})
              </button>
            )}
            {authRole === 'owner' && (
              <button
                type="button"
                onClick={() => {
                  setAccessModalError(null);
                  setFriendPinDraft(friendPinConfig);
                  setIsAccessModalOpen(true);
                }}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg transition-colors border border-amber-400/40 font-bold flex items-center gap-1.5 cursor-pointer"
                title="Gestisci il codice per i tuoi amici (tu entri sempre senza codice)"
              >
                <KeyRound size={13} />
                Accesso Amici
                <span className={`w-2 h-2 rounded-full ${gateEnabled ? 'bg-emerald-400' : 'bg-slate-400'}`} />
              </button>
            )}
            {authRole === 'friend' && gateEnabled && (
              <button
                type="button"
                onClick={handleFriendLogout}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700 font-semibold flex items-center gap-1 cursor-pointer"
                title="Blocca sessione"
              >
                <LogOut size={13} /> Esci
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 lg:p-8 space-y-8 max-w-7xl">
        {/* --- 📝 MODULO ANAGRAFICA --- */}
        <section
          id="modulo-anagrafica"
          className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 lg:p-8 border-l-4 border-l-blue-600 transition-all hover:shadow-md"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center gap-2 text-blue-800">
                <FileText size={22} className="text-blue-600" />
                <h2 className="text-xl font-black tracking-tight uppercase">
                  📝 MODULO ANAGRAFICA
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Compila i dati identificativi della sessione e dell'allievo per inquadrare il contesto di osservazione
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${PRIVACY_META[privacyMode].badgeBg} flex items-center gap-1`}>
                <ShieldCheck size={12} />
                <strong>{PRIVACY_META[privacyMode].shortLabel}</strong>
              </span>
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${CONTEXT_META[sessionContext].badgeBg}`}>
                Contesto: <strong className="font-black">{CONTEXT_META[sessionContext].shortLabel}</strong>
              </span>
              <span className="text-[11px] font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                Disciplina: <strong className="font-black">{selectedSport}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Campo 1: DATA */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600" />
                  DATA: [Inserisci Data]
                </label>
                <button
                  type="button"
                  onClick={() => setDate(new Date().toISOString().split('T')[0])}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline"
                >
                  Imposta Oggi
                </button>
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-semibold text-slate-800"
              />
            </div>

            {/* Campo 2: SPORT (Elenco a Discesa Raggruppato per Categoria) */}
            <div className="space-y-2 lg:col-span-2">
              <label className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Award size={14} className="text-blue-600" />
                  SPORT: ELENCO A DISCESA ({sports.length} Discipline)
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CATEGORY_META[sportCategory].badgeBg}`}>
                  {CATEGORY_META[sportCategory].shortLabel}
                </span>
              </label>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedSport}
                    onChange={(e) => {
                      const newSelected = e.target.value;
                      setSelectedSport(newSelected);
                      setSportCategory(getSportCategory(newSelected, customSportCategories));
                    }}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-bold text-slate-800 appearance-none pr-10 cursor-pointer shadow-sm"
                  >
                    <optgroup label="⚔️ Sport con 2 Giocatori Opposti (1 vs 1)">
                      {sports
                        .filter((s) => getSportCategory(s, customSportCategories) === SportCategory.DUAL_OPPOSITION)
                        .map((sportItem) => (
                          <option key={sportItem} value={sportItem}>
                            {sportItem}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="👥 Giochi di Squadra (Sport Collettivi)">
                      {sports
                        .filter((s) => getSportCategory(s, customSportCategories) === SportCategory.TEAM_SPORT)
                        .map((sportItem) => (
                          <option key={sportItem} value={sportItem}>
                            {sportItem}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="🏅 Sport Singoli / Individuali">
                      {sports
                        .filter((s) => getSportCategory(s, customSportCategories) === SportCategory.INDIVIDUAL)
                        .map((sportItem) => (
                          <option key={sportItem} value={sportItem}>
                            {sportItem}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                    <ChevronRight size={18} className="transform rotate-90" />
                  </div>
                </div>

                {/* Pulsante rimuovi sport personalizzato se non standard */}
                {!Object.values(SportType).includes(selectedSport as SportType) && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSport(selectedSport)}
                    className="p-3 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                    title="Rimuovi questo sport personalizzato"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              {/* Aggiunta rapida di un nuovo sport */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Aggiungi altra disciplina sportiva..."
                  value={newSport}
                  onChange={(e) => setNewSport(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSport();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={handleAddSport}
                  className="px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-blue-200 shrink-0"
                >
                  <Plus size={14} /> Aggiungi
                </button>
              </div>
            </div>

            {/* Contesto Operativo della Sessione: Scuola / Palestra / Gara */}
            <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-sky-50/80 via-emerald-50/50 to-amber-50/70 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <School size={16} className="text-sky-600" />
                  Contesto Operativo di Osservazione (Scuola • Palestra • Gara)
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Adatta i feedback in tempo reale e la scheda pedagogica al contesto in cui operi
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    ctx: SessionContext.SCUOLA,
                    icon: <School size={18} />,
                    title: 'Scuola (Ora di Ed. Fisica)',
                    desc: 'Inclusione, piacere di agire, sicurezza emotiva e gruppi classe eterogenei.',
                    activeClass: 'bg-sky-600 text-white border-sky-600 shadow-md',
                    iconIdle: 'bg-sky-100 text-sky-700',
                  },
                  {
                    ctx: SessionContext.PALESTRA,
                    icon: <Dumbbell size={18} />,
                    title: 'Palestra / Allenamento',
                    desc: 'Progressione tecnico-tattica e décalage pedagogico guidato tra le tappe.',
                    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md',
                    iconIdle: 'bg-emerald-100 text-emerald-700',
                  },
                  {
                    ctx: SessionContext.GARA,
                    icon: <Trophy size={18} />,
                    title: 'Gara / Competizione',
                    desc: 'Tenuta o regressione sotto stress da risultato e debriefing tattico immediato.',
                    activeClass: 'bg-amber-600 text-white border-amber-600 shadow-md',
                    iconIdle: 'bg-amber-100 text-amber-700',
                  },
                ].map((item) => {
                  const active = sessionContext === item.ctx;
                  return (
                    <button
                      key={item.ctx}
                      type="button"
                      onClick={() => setSessionContext(item.ctx)}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                        active
                          ? item.activeClass
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          active ? 'bg-white/20 text-white' : item.iconIdle
                        }`}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide">{item.title}</div>
                        <div className={`text-[10px] mt-0.5 leading-snug ${active ? 'text-white/90' : 'text-slate-500'}`}>
                          {item.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tutela Privacy Alunni & Minori (Elaborazione Locale On-Device) */}
            <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-emerald-50/80 via-cyan-50/50 to-slate-50 p-4 rounded-2xl border border-emerald-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  Protezione Privacy Alunni & Minori (Elaborazione Sul Dispositivo prima dell'invio)
                </span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Elaborazione Locale 100% On-Device
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    mode: PrivacyMode.SKELETON_ONLY,
                    icon: <Activity size={18} />,
                    title: 'Privacy Totale: Solo Scheletro Motorio',
                    desc: 'Zero foto reali inviate! Estrae in locale solo scheletro biomeccanico + angoli articolari su sfondo scuro.',
                    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md',
                    iconIdle: 'bg-emerald-100 text-emerald-700',
                  },
                  {
                    mode: PrivacyMode.BLUR_FACES,
                    icon: <EyeOff size={18} />,
                    title: 'Sfocatura Volti Automatica',
                    desc: 'Oscura i volti sul dispositivo mantenendo visibili postura, colori maglie/judogi, palla e campo.',
                    activeClass: 'bg-cyan-600 text-white border-cyan-600 shadow-md',
                    iconIdle: 'bg-cyan-100 text-cyan-700',
                  },
                  {
                    mode: PrivacyMode.STANDARD,
                    icon: <Eye size={18} />,
                    title: 'Standard (Fotogrammi Originali)',
                    desc: 'Invia i fotogrammi senza mascheratura (consigliato solo con liberatoria o atleti maggiorenni).',
                    activeClass: 'bg-slate-800 text-white border-slate-800 shadow-md',
                    iconIdle: 'bg-slate-100 text-slate-600',
                  },
                ].map((opt) => {
                  const active = privacyMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => setPrivacyMode(opt.mode)}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                        active
                          ? opt.activeClass
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          active ? 'bg-white/20 text-white' : opt.iconIdle
                        }`}
                      >
                        {opt.icon}
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide">{opt.title}</div>
                        <div className={`text-[10px] mt-0.5 leading-snug ${active ? 'text-white/90' : 'text-slate-500'}`}>
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {privacyMode !== PrivacyMode.STANDARD && (
                <p className="text-[11px] text-emerald-900/80 bg-white/70 px-3 py-2 rounded-xl border border-emerald-200/70">
                  <strong>Nota per la lettura delle espressioni facciali:</strong> con "{PRIVACY_META[privacyMode].shortLabel}" i volti sono protetti sul dispositivo, quindi l'AI stima il coinvolgimento da quantità di movimento, postura e orientamento del capo. Per valutare anche la mimica facciale seleziona <strong>Standard</strong>.
                </p>
              )}
            </div>

            {/* Selettore Struttura Sportiva (3 Macro-Categorie Pedagogiche) */}
            <div className="md:col-span-2 lg:col-span-3 bg-slate-50/90 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass size={16} className="text-blue-600" />
                  Struttura della Disciplina (Adatta Automaticamente l'Analisi Conativa)
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Puoi cambiare categoria se il filmato ha un formato particolare (es. doppio vs singolo)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    cat: SportCategory.DUAL_OPPOSITION,
                    icon: <Swords size={18} />,
                    title: '2 Giocatori Opposti',
                    examples: 'Judo, Tennis, Scherma, Badminton, Karate...',
                  },
                  {
                    cat: SportCategory.TEAM_SPORT,
                    icon: <Users size={18} />,
                    title: 'Giochi di Squadra',
                    examples: 'Calcio a 5, Pallavolo, Basket, Rugby, Pallamano...',
                  },
                  {
                    cat: SportCategory.INDIVIDUAL,
                    icon: <Activity size={18} />,
                    title: 'Sport Singoli',
                    examples: 'Ginnastica, Nuoto, Atletica, Danza, Arrampicata...',
                  },
                ].map((opt) => {
                  const active = sportCategory === opt.cat;
                  return (
                    <button
                      key={opt.cat}
                      type="button"
                      onClick={() => {
                        setSportCategory(opt.cat);
                        if (!DEFAULT_SPORT_CATEGORIES[selectedSport]) {
                          setCustomSportCategories((prev) => ({ ...prev, [selectedSport]: opt.cat }));
                        }
                      }}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          active ? 'bg-white/20 text-white' : 'bg-slate-100 text-blue-600'
                        }`}
                      >
                        {opt.icon}
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide">{opt.title}</div>
                        <div className={`text-[10px] mt-0.5 leading-snug ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                          {opt.examples}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo Categoria/Livello & Nome Squadra (se Team Sport) */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-blue-600" />
                Categoria / Livello
              </label>
              <input
                type="text"
                value={athleteCategory}
                onChange={(e) => setAthleteCategory(e.target.value)}
                placeholder="Es. Under 14, Cadetti, Principiante, 3° Anno Liceo..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-slate-800"
              />
            </div>

            {sportCategory === SportCategory.TEAM_SPORT && (
              <div className="space-y-2 lg:col-span-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-600" />
                  Nome o Colore Squadra Osservata (Opzionale)
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold ml-1">
                    Gioco di Squadra
                  </span>
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Es. Maglie Blu / Aquile Volley U16..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none text-slate-800 font-semibold"
                />
              </div>
            )}

            {/* Toggle Esplicito: Analisi su Atleta Specifico (SOLO SE RICHIESTO) */}
            <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-br from-slate-50 to-indigo-50/40 p-5 rounded-2xl border border-indigo-200/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <UserCheck size={18} className="text-indigo-600" />
                    Oggetto dell'Analisi: Atleta Specifico solo su Richiesta
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    {CATEGORY_META[sportCategory].description}
                  </p>
                </div>

                {/* Segmented Toggle: Analisi Generale vs Atleta Specifico */}
                <div className="inline-flex bg-slate-200/80 p-1 rounded-xl shrink-0 border border-slate-300/60">
                  <button
                    type="button"
                    onClick={() => setFocusSpecificAthlete(false)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      !focusSpecificAthlete
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sportCategory === SportCategory.TEAM_SPORT
                      ? '👥 Analisi Collettiva Squadra'
                      : sportCategory === SportCategory.DUAL_OPPOSITION
                      ? '⚔️ Analisi Entrambi (Duello 1vs1)'
                      : '🏅 Analisi Diretta Singolo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFocusSpecificAthlete(true)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      focusSpecificAthlete
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Target size={14} />
                    Atleta Specifico
                  </button>
                </div>
              </div>

              {/* Caso 1: Nessun atleta specifico richiesto */}
              {!focusSpecificAthlete && (
                <div className="bg-white/80 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-start gap-3">
                  <AlertCircle size={18} className="text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-black text-slate-900 uppercase tracking-wide text-[11px]">
                      {CATEGORY_META[sportCategory].defaultScopeLabel} Attiva
                    </div>
                    {sportCategory === SportCategory.DUAL_OPPOSITION && (
                      <p className="text-slate-600 leading-relaxed">
                        L'AI analizzerà l'intero confronto 1 vs 1 mettendo a paragone i due giocatori opposti (livello conativo di entrambi, chi impone il gioco e come abbassa il livello dell'altro), senza focalizzarsi su un solo target.
                      </p>
                    )}
                    {sportCategory === SportCategory.TEAM_SPORT && (
                      <p className="text-slate-600 leading-relaxed">
                        L'AI valuterà la squadra nel suo insieme (organizzazione collettiva, gioco a grappolo vs circolazione, occupazione degli spazi, transizioni) senza isolare un singolo giocatore.
                      </p>
                    )}
                    {sportCategory === SportCategory.INDIVIDUAL && (
                      <p className="text-slate-600 leading-relaxed">
                        L'AI analizzerà direttamente la prova dell'atleta protagonista nel suo rapporto con l'ambiente, l'attrezzo, la misura o il modello tecnico. Se nel video ci sono più corsie o atleti e vuoi isolarne uno solo, attiva <strong>"Atleta Specifico"</strong>.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Caso 2: L'utente ha richiesto espressamente l'analisi su un atleta specifico */}
              {focusSpecificAthlete && (
                <div className="space-y-4 pt-2 border-t border-indigo-200/60">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <User size={14} className="text-blue-600" />
                        Nome / Identificativo Allievo Specifico
                      </label>
                      <input
                        type="text"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="Es. Mario Rossi o Atleta #1"
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Target size={14} className="text-blue-600" />
                        Ruolo / Specialità Motoria
                      </label>
                      <input
                        type="text"
                        value={athleteRole}
                        onChange={(e) => setAthleteRole(e.target.value)}
                        placeholder={
                          sportCategory === SportCategory.DUAL_OPPOSITION
                            ? 'Es. Tori, Uke, Battitore, Difensore...'
                            : sportCategory === SportCategory.TEAM_SPORT
                            ? 'Es. Alzatore, Pivot, Portiere, Ala...'
                            : 'Es. Dorso 100m, Corpo libero, Salto in lungo...'
                        }
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-xs"
                      />
                    </div>
                  </div>

                  {/* Selettori Visivi Contestuali alla Categoria */}
                  <div className={`grid grid-cols-1 ${sportCategory === SportCategory.DUAL_OPPOSITION ? 'md:grid-cols-2' : ''} gap-4`}>
                    {/* Target Box */}
                    <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Eye size={15} className="text-blue-600" />
                          Identificazione Visiva Atleta Specifico
                        </label>
                        <span className="text-[9px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                          Isolamento AI Richiesto
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(sportCategory === SportCategory.DUAL_OPPOSITION
                          ? selectedSport === SportType.JUDO || selectedSport === SportType.KARATE
                            ? [
                                { label: '🥋 Judogi Bianco', val: 'Judogi Bianco' },
                                { label: '🥋 Judogi Blu', val: 'Judogi Blu' },
                                { label: '🔴 Cintura Rossa (Aka)', val: 'Cintura Rossa (Aka)' },
                                { label: '⚪ Cintura Bianca (Shiro)', val: 'Cintura Bianca (Shiro)' },
                                { label: '🛡️ Uke (Subisce/Non attacca)', val: 'Uke (ha subito la proiezione, non attacca)' },
                                { label: '🎯 Tori (Attaccante)', val: 'Tori (Chi esegue la tecnica)' },
                              ]
                            : [
                                { label: '📍 In Primo Piano / Lato Vicino', val: 'Giocatore in primo piano (lato vicino)' },
                                { label: '🔭 A Fondo Campo / Lato Lontano', val: 'Giocatore a fondo campo (lato lontano)' },
                                { label: '⬅️ Lato Sinistro', val: 'Sul lato sinistro' },
                                { label: '➡️ Lato Destro', val: 'Sul lato destro' },
                                { label: '👕 Maglia Chiara', val: 'Maglia Chiara' },
                                { label: '👕 Maglia Scura', val: 'Maglia Scura' },
                              ]
                          : sportCategory === SportCategory.TEAM_SPORT
                          ? [
                              { label: '👕 Maglia Chiara', val: 'Maglia Chiara' },
                              { label: '👕 Maglia Scura', val: 'Maglia Scura' },
                              { label: '🎽 Con Pettorina', val: 'Con Pettorina' },
                              { label: '🧤 Portiere / Libero', val: 'Portiere / Maglia diversa' },
                              { label: '⚡ Giocatore sulla Palla', val: 'Giocatore che inizia con la palla' },
                            ]
                          : [
                              { label: '🏊 Corsia Centrale', val: 'In corsia centrale' },
                              { label: '⬅️ Atleta a Sinistra', val: 'Atleta sul lato sinistro' },
                              { label: '➡️ Atleta a Destra', val: 'Atleta sul lato destro' },
                              { label: '🔴 Cuffia / Divisa Rossa', val: 'Cuffia o divisa rossa' },
                              { label: '🔵 Cuffia / Divisa Blu', val: 'Cuffia o divisa blu' },
                            ]
                        ).map((item) => {
                          const isActive = targetAthleteDescription.includes(item.val);
                          return (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => toggleVisualTag(item.val)}
                              className={`
                                px-2 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 cursor-pointer
                                ${
                                  isActive
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                }
                              `}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>

                      <input
                        type="text"
                        value={targetAthleteDescription}
                        onChange={(e) => setTargetAthleteDescription(e.target.value)}
                        placeholder={
                          sportCategory === SportCategory.DUAL_OPPOSITION
                            ? "Es. 'Judogi Bianco, Uke passivo' oppure 'Giocatore in primo piano con maglia bianca'..."
                            : sportCategory === SportCategory.TEAM_SPORT
                            ? "Es. 'Maglia blu numero 10, fascia destra, scarpini arancioni'..."
                            : "Es. 'Corsia 4, cuffia rossa' o 'Pettorale n. 12'..."
                        }
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-xs text-slate-800 font-semibold"
                      />
                    </div>

                    {/* Avversario Box solo per DUAL_OPPOSITION */}
                    {sportCategory === SportCategory.DUAL_OPPOSITION && (
                      <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                            <Swords size={15} className="text-indigo-600" />
                            Avversario (Termine di Confronto)
                          </label>
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                            Duello 1 vs 1
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(selectedSport === SportType.JUDO || selectedSport === SportType.KARATE
                            ? [
                                { label: '🥋 Judogi Blu', val: 'Judogi Blu' },
                                { label: '🥋 Judogi Bianco', val: 'Judogi Bianco' },
                                { label: '⚪ Cintura Bianca (Shiro)', val: 'Cintura Bianca (Shiro)' },
                                { label: '🔴 Cintura Rossa (Aka)', val: 'Cintura Rossa (Aka)' },
                                { label: '🎯 Tori (Attaccante/Esegue)', val: 'Tori (Chi esegue la tecnica con Kuzushi)' },
                                { label: '🛡️ Uke (Subisce)', val: 'Uke (Chi subisce la proiezione)' },
                              ]
                            : [
                                { label: '🔭 A Fondo Campo / Lato Lontano', val: 'Avversario a fondo campo' },
                                { label: '📍 In Primo Piano / Lato Vicino', val: 'Avversario in primo piano' },
                                { label: '➡️ Lato Destro', val: 'Sul lato destro' },
                                { label: '⬅️ Lato Sinistro', val: 'Sul lato sinistro' },
                                { label: '👕 Maglia Scura', val: 'Maglia Scura' },
                                { label: '👕 Maglia Chiara', val: 'Maglia Chiara' },
                              ]
                          ).map((item) => {
                            const isActive = opponentDescription.includes(item.val);
                            return (
                              <button
                                key={item.val}
                                type="button"
                                onClick={() => toggleOpponentVisualTag(item.val)}
                                className={`
                                  px-2 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 cursor-pointer
                                  ${
                                    isActive
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                  }
                                `}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>

                        <input
                          type="text"
                          value={opponentDescription}
                          onChange={(e) => setOpponentDescription(e.target.value)}
                          placeholder="Es. 'Judogi Blu, Tori' o 'Avversario in fondo al campo'..."
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-xs text-slate-800 font-semibold"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Module 2: Contesto Pedagogico & Note */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 lg:p-8 border-l-4 border-l-amber-500">
          <div className="pb-4 mb-6 border-b border-slate-100">
            <h2 className="text-xl font-black flex items-center gap-2 text-amber-900 tracking-tight uppercase">
              <AlertCircle size={22} className="text-amber-600" />
              Contesto Pedagogico & Materiale Didattico
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Fornisci dettagli sull'intento della lezione, la consegna iniziale e documenti di testo per affinare la diagnosi
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-600 uppercase tracking-wider">
                Note di Campo & Consegna Iniziale
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Descrivi la situazione di gioco o esercizio, la consegna data all'allievo, eventuali difficoltà osservate dall'insegnante..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl h-36 focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none resize-none text-sm text-slate-800 leading-relaxed"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider">
                  Istruzioni Speciali per l'AI
                </label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Es. 'Valuta se lo squilibrio è subito passivo o provocato attivamente'..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none text-sm text-slate-800"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider">
                  Materiale Teorico Aggiuntivo (TXT / Markdown)
                </label>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:bg-amber-50/50 hover:border-amber-300 transition-all group"
                  onClick={() => docInputRef.current?.click()}
                >
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".txt,.md"
                    multiple
                    className="hidden"
                    onChange={handleDocUpload}
                  />
                  <FileText className="mx-auto text-slate-400 group-hover:text-amber-600 transition-colors" size={28} />
                  <p className="text-slate-600 text-xs font-semibold mt-2">
                    Carica file con griglie di osservazione o estratti teorici
                  </p>
                  {extraFilesContent ? (
                    <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                      ✓ Materiale caricato ({extraFilesContent.length} caratteri)
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">Opzionale: supporta file .txt e .md</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Video & Action Section */}
        <section id="sezione-video" className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 lg:p-8 border-l-4 border-l-emerald-600 overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-black flex items-center gap-2 text-emerald-900 tracking-tight uppercase">
                <Video size={22} className="text-emerald-600" />
                Video Performance, Ripresa Live & Diagnosi
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Carica un filmato esistente oppure avvia la fotocamera per riprendere e valutare dal vivo in tempo reale ({CONTEXT_META[sessionContext].shortLabel})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Switcher Carica Video vs Ripresa Live */}
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setVideoInputMode('upload')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    videoInputMode === 'upload'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload size={14} />
                  Carica Video
                </button>
                <button
                  type="button"
                  onClick={() => setVideoInputMode('live')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    videoInputMode === 'live'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <Camera size={14} />
                  Ripresa Live
                </button>
              </div>

              {videoInputMode === 'upload' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnalyzeMobilization}
                    disabled={!videoFile || isAnalyzing || isAnalyzingMobilization}
                    className={`
                      px-4 py-2.5 rounded-xl font-black shadow-md transition-all flex items-center gap-2 uppercase tracking-wider text-xs shrink-0 border
                      ${
                        !videoFile || isAnalyzing || isAnalyzingMobilization
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none'
                          : 'bg-teal-600 hover:bg-teal-700 text-white border-teal-500 hover:scale-[1.02] active:scale-95 shadow-teal-500/25 cursor-pointer'
                      }
                    `}
                    title="Analizza e conta quanti alunni/atleti sono mobilitati vs non interessati (movimento, espressioni facciali e postura)"
                  >
                    {isAnalyzingMobilization ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Users size={16} />
                    )}
                    {isAnalyzingMobilization ? 'CONTEGGIO IN CORSO...' : 'CONTA MOBILITATI VS NON INTERESSATI'}
                  </button>

                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={!videoFile || isAnalyzing || isAnalyzingMobilization}
                    className={`
                      px-6 py-2.5 rounded-xl font-black shadow-lg transition-all flex items-center gap-2 uppercase tracking-wider text-xs shrink-0
                      ${
                        !videoFile || isAnalyzing || isAnalyzingMobilization
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-[1.02] active:scale-95 shadow-emerald-500/25 cursor-pointer'
                      }
                    `}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <Sparkles size={18} fill="currentColor" />
                    )}
                    {isAnalyzing ? 'DIAGNOSI IN CORSO...' : 'AVVIA ANALISI CONATIVA'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card Feature Sempre Visibile: Censimento Mobilitazione Alunni / Atleti */}
          <div
            id="card-mobilitazione-gruppo"
            className="mb-6 bg-gradient-to-r from-teal-50 via-emerald-50/70 to-cyan-50 border-2 border-teal-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs"
          >
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-black uppercase tracking-wider">
                  <Users size={11} /> Nuova Funzione Attiva
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-teal-900">
                  Conteggio Alunni / Atleti Mobilitati vs Non Interessati
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                L&apos;AI valuta automaticamente <strong>quantità di movimento/attività</strong>, <strong>espressioni facciali &amp; sguardo</strong> e <strong>postura generale del corpo</strong> per dirti quanti partecipanti sono <strong>mobilitati conativamente</strong> e quanti <strong>non sono interessati</strong> (disponibile sia con il pulsante rapido <strong>&ldquo;CONTA MOBILITATI VS NON INTERESSATI&rdquo;</strong>, sia dentro il report completo o in <strong>Ripresa Live</strong>).
              </p>
              {privacyMode !== PrivacyMode.STANDARD && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-amber-800 font-semibold">
                    Nota: al momento è attiva la modalità Privacy (<em>{PRIVACY_META[privacyMode].shortLabel}</em>) che oscura o nasconde i volti.
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrivacyMode(PrivacyMode.STANDARD)}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-black transition-colors cursor-pointer"
                  >
                    Attiva lettura Espressioni Facciali (Privacy Standard)
                  </button>
                </div>
              )}
            </div>

            {videoInputMode === 'upload' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!videoFile) {
                      fileInputRef.current?.click();
                    } else {
                      handleAnalyzeMobilization();
                    }
                  }}
                  disabled={isAnalyzing || isAnalyzingMobilization}
                  className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {isAnalyzingMobilization ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
                  {videoFile ? 'Conta Ora dal Video' : 'Carica Video & Conta'}
                </button>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-900 shadow-sm animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={22} />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-red-800">
                    Notifica di Sistema
                  </h4>
                  <p className="text-xs text-red-700 mt-0.5 leading-relaxed font-medium">
                    {errorMessage}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={lastActionMode === 'mobilization' ? handleAnalyzeMobilization : handleAnalyze}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  Riprova
                </button>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="p-1.5 text-red-400 hover:text-red-700 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successBanner && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-900 shadow-sm animate-fade-in">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  ✓
                </div>
                <span className="text-xs font-bold text-emerald-800">{successBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessBanner(null)}
                className="p-1 text-emerald-600 hover:text-emerald-800 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {(isAnalyzing || isAnalyzingMobilization) && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 animate-pulse">
              <Loader2 className="animate-spin text-blue-700 shrink-0" size={22} />
              <div className="text-xs text-blue-900 font-semibold">
                <span className="font-black">
                  {isAnalyzingMobilization
                    ? 'Conteggio mobilitazione gruppo in elaborazione: '
                    : 'Analisi conativa in elaborazione: '}
                </span>
                {analysisStatus || 'Estrazione fotogrammi chiave e diagnosi in corso...'}
              </div>
            </div>
          )}

          {videoInputMode === 'live' ? (
            <div className="space-y-4">
              {/* Quick Context & Privacy Switcher right above Live Camera for field convenience */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                    <Radio size={14} className="text-emerald-600" />
                    Contesto:
                  </span>
                  {[
                    { ctx: SessionContext.SCUOLA, label: '🏫 Scuola' },
                    { ctx: SessionContext.PALESTRA, label: '🏋️ Palestra' },
                    { ctx: SessionContext.GARA, label: '🏆 Gara' },
                  ].map((c) => (
                    <button
                      key={c.ctx}
                      type="button"
                      onClick={() => setSessionContext(c.ctx)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        sessionContext === c.ctx
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1 mr-1">
                    <ShieldCheck size={14} className="text-emerald-600" />
                    Privacy:
                  </span>
                  {[
                    { mode: PrivacyMode.SKELETON_ONLY, label: '🦴 Solo Scheletro' },
                    { mode: PrivacyMode.BLUR_FACES, label: '😶‍🌫️ Sfoca Volti' },
                    { mode: PrivacyMode.STANDARD, label: '📷 Originale' },
                  ].map((p) => (
                    <button
                      key={p.mode}
                      type="button"
                      onClick={() => setPrivacyMode(p.mode)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        privacyMode === p.mode
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <LiveCameraPanel
                sport={selectedSport}
                sportCategory={sportCategory}
                sessionContext={sessionContext}
                privacyMode={privacyMode}
                focusSpecificAthlete={focusSpecificAthlete}
                targetAthleteDescription={targetAthleteDescription}
                opponentDescription={opponentDescription}
                teamName={teamName}
                notes={notes}
                onClipRecorded={(file) => {
                  setVideoFile(file);
                  setExtractedThumbnails([]);
                  setVideoInputMode('upload');
                  setSuccessBanner(
                    `Clip "${file.name}" acquisita dalla fotocamera! Ora puoi rivederla, scaricarla o premere "AVVIA ANALISI CONATIVA".`
                  );
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Video Player */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              {/* Active Analysis Mode Indicator Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-blue-50/90 border border-blue-200 rounded-xl text-xs text-blue-900 gap-2 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg shrink-0">
                    {focusSpecificAthlete ? (
                      <Target size={15} />
                    ) : sportCategory === SportCategory.TEAM_SPORT ? (
                      <Users size={15} />
                    ) : sportCategory === SportCategory.DUAL_OPPOSITION ? (
                      <Swords size={15} />
                    ) : (
                      <Activity size={15} />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-black text-blue-600 tracking-wider block">
                      Modalità Analisi Attiva • {CATEGORY_META[sportCategory].shortLabel}
                    </span>
                    <strong className="text-slate-800 text-xs">
                      {focusSpecificAthlete
                        ? `Atleta Specifico: ${targetAthleteDescription || studentName || 'Specifica le caratteristiche in Anagrafica'}`
                        : sportCategory === SportCategory.TEAM_SPORT
                        ? `Analisi Collettiva di Squadra${teamName ? ` (${teamName})` : ''}`
                        : sportCategory === SportCategory.DUAL_OPPOSITION
                        ? 'Confronto Duello 1 vs 1 Completo (Entrambi i Giocatori)'
                        : 'Analisi Diretta Atleta Singolo Protagonista'}
                    </strong>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border flex items-center gap-1 ${PRIVACY_META[privacyMode].badgeBg}`}>
                    <ShieldCheck size={11} />
                    {PRIVACY_META[privacyMode].shortLabel}
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border border-blue-200">
                    {focusSpecificAthlete ? 'Focus Individuale' : 'Generale'}
                  </span>
                </div>
              </div>

              <div className="relative group bg-slate-950 rounded-2xl overflow-hidden aspect-video shadow-2xl border border-slate-800 flex items-center justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {videoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-contain"
                      muted
                      playsInline
                      onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                      onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                    />

                    {/* Overlay Player Controls */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 transition-opacity">
                      <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="0.1"
                        value={currentTime}
                        onChange={(e) => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = parseFloat(e.target.value);
                          }
                        }}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 mb-3"
                      />
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-white">
                          <button
                            type="button"
                            onClick={togglePlay}
                            className="p-1.5 hover:text-emerald-400 transition-colors"
                          >
                            {videoRef.current?.paused ? (
                              <Play size={20} fill="currentColor" />
                            ) : (
                              <Pause size={20} fill="currentColor" />
                            )}
                          </button>
                          <span className="text-[11px] font-mono tracking-wider bg-black/60 px-2.5 py-1 rounded-md border border-white/10">
                            {new Date(currentTime * 1000).toISOString().substr(14, 5)} /{' '}
                            {new Date(duration * 1000).toISOString().substr(14, 5)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {[0.25, 0.5, 1.0, 1.5].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => changeSpeed(rate)}
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all ${
                                playbackRate === rate
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex flex-col items-center justify-center text-emerald-400 hover:bg-emerald-950/30 transition-all cursor-pointer p-6 text-center"
                  >
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-3 border border-emerald-500/20">
                      <Upload size={32} className="text-emerald-400 animate-bounce" />
                    </div>
                    <p className="text-sm font-black tracking-wider uppercase text-emerald-300">
                      CARICA VIDEO DELLA PERFORMANCE
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Trascina o clicca per selezionare MP4, MOV o WebM</p>
                  </div>
                )}
              </div>

              {videoFile && (
                <div className="flex justify-between items-center p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <Video size={16} className="text-emerald-700 shrink-0" />
                    <span className="text-xs font-bold text-emerald-900 truncate">{videoFile.name}</span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-mono shrink-0">
                      {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {videoUrl && (
                      <a
                        href={videoUrl}
                        download={videoFile.name}
                        className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                        title="Scarica il file video registrato o caricato"
                      >
                        <Download size={13} /> Scarica Clip
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setVideoFile(null);
                        setVideoUrl(null);
                        setExtractedThumbnails([]);
                      }}
                      className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Rimuovi video"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Fotogrammi Chiave Estratti & Analizzati dall'AI */}
              {extractedThumbnails.length > 0 && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 mt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      {privacyMode !== PrivacyMode.STANDARD ? (
                        <ShieldCheck size={14} className="text-emerald-600" />
                      ) : (
                        <Eye size={13} className="text-blue-600" />
                      )}
                      {privacyMode === PrivacyMode.SKELETON_ONLY
                        ? `Scheletri Biomeccanici Inviati a Gemini (${extractedThumbnails.length}) — Zero Foto Reali`
                        : privacyMode === PrivacyMode.BLUR_FACES
                        ? `Fotogrammi con Volti Oscurati Inviati a Gemini (${extractedThumbnails.length})`
                        : `Fotogrammi Chiave Analizzati da Gemini (${extractedThumbnails.length})`}
                    </span>
                    <span className="text-[10px] text-slate-500">Clicca per saltare al timestamp</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5">
                    {extractedThumbnails.map((frame, idx) => {
                      const minutes = Math.floor(frame.timestamp / 60);
                      const seconds = Math.floor(frame.timestamp % 60);
                      const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => jumpToTime(frame.timestamp)}
                          className="relative shrink-0 group rounded-xl overflow-hidden border-2 border-slate-200 hover:border-blue-500 transition-all shadow-xs cursor-pointer"
                          title={`Salta al secondo ${timeStr}`}
                        >
                          <img
                            src={`data:image/jpeg;base64,${frame.data}`}
                            alt={`Frame ${timeStr}`}
                            className="w-20 h-14 object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/75 text-white text-[9px] font-mono font-bold text-center py-0.5">
                            ⏱ {timeStr}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Guida Metodologica */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200/80">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Zap size={16} className="text-amber-500 fill-amber-500" />
                  Principi Guida di Gilles Bui-Xuân: Le 5 Tappe Conative
                </h3>
                <p className="text-xs text-slate-600 italic border-l-2 border-blue-500 pl-3 py-1 my-2.5 bg-white p-2 rounded-r-lg">
                  "Non si osserva il gesto per correggerlo rigidamente, ma per comprendere il senso che l'allievo dà alla propria azione motoria."
                </p>

                <div className="space-y-2 mt-3">
                  {/* Tappa 1 */}
                  <div className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-black flex items-center justify-center shrink-0 text-[10px]">
                      1
                    </span>
                    <div>
                      <strong className="text-slate-800 font-bold block">Livello 1: Tappa Emozionale (Preservazione di sé / Tai)</strong>
                      <span className="text-slate-500 text-[11px] leading-tight block">
                        Focalizzato su se stesso, difende la propria integrità di fronte all'ignoto usando le capacità strutturali già disponibili.
                      </span>
                    </div>
                  </div>

                  {/* Tappa 2 */}
                  <div className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center shrink-0 text-[10px]">
                      2
                    </span>
                    <div>
                      <strong className="text-slate-800 font-bold block">Livello 2: Tappa Funzionale ("Come funziona" / Shin)</strong>
                      <span className="text-slate-500 text-[11px] leading-tight block">
                        Cerca di capire i principi d'azione per prove ed errori usando i propri processi funzionali per trovare risposte al compito.
                      </span>
                    </div>
                  </div>

                  {/* Tappa 3 */}
                  <div className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-black flex items-center justify-center shrink-0 text-[10px]">
                      3
                    </span>
                    <div>
                      <strong className="text-slate-800 font-bold block">Livello 3: Tappa Tecnica (Miglioramento dei Mezzi / Gi)</strong>
                      <span className="text-slate-500 text-[11px] leading-tight block">
                        Acquisisce modelli efficaci ("cosa fanno quelli che riescono?"): accumulo tecnico, savoir-faire e ripetizione per automatizzare.
                      </span>
                    </div>
                  </div>

                  {/* Tappa 4 */}
                  <div className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center shrink-0 text-[10px]">
                      4
                    </span>
                    <div>
                      <strong className="text-slate-800 font-bold block">Livello 4: Tappa di Contestualizzazione (Azione Concettuale / Gi + Shin)</strong>
                      <span className="text-slate-500 text-[11px] leading-tight block">
                        Decentrazione dalla tecnica pura: comprende il senso dell'azione e adatta le tecniche in tempo reale alle esigenze del contesto.
                      </span>
                    </div>
                  </div>

                  {/* Tappa 5 */}
                  <div className="flex items-start gap-2.5 text-xs bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center shrink-0 text-[10px]">
                      5
                    </span>
                    <div>
                      <strong className="text-slate-800 font-bold block">Livello 5: Espertezza e Creazione (Padronanza Totale / Tai + Gi + Shin)</strong>
                      <span className="text-slate-500 text-[11px] leading-tight block">
                        Piena padronanza di tutte le componenti: produzione originale e singolare, crea nuove tecniche e innova in modo autonomo.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                <span>⏱ Timestamp interattivi generati nel report</span>
                <span className="font-bold text-emerald-700">Curriculum Conativo 1-5</span>
              </div>
            </div>
          </div>
          )}
        </section>

        {/* STANDALONE GROUP MOBILIZATION RESULT */}
        {groupMobilizationOnlyResult && (
          <section id="report-mobilizzazione" className="space-y-4">
            {renderGroupMobilizationCard(groupMobilizationOnlyResult)}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-600 font-medium">
                Vuoi anche la diagnosi delle <strong>5 Tappe Conative</strong>, assetto <strong>Tai/Gi/Shin</strong>, Scheda di Allenamento e Export Word (.docx)?
              </span>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!videoFile || isAnalyzing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={14} />
                Genera Report Conativo Completo
              </button>
            </div>
          </section>
        )}

        {/* RESULTS SECTION */}
        {analysisResult && (
          <section id="report-conativo" className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            {/* Header Report */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 lg:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-blue-400 text-[10px] font-black uppercase tracking-widest">
                    Diagnosi Pedagogica Eseguita con Successo
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/10 text-blue-200 border border-white/15">
                    {CATEGORY_META[analysisResult.sportCategory || sportCategory].shortLabel}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                    {CONTEXT_META[analysisResult.sessionContext || sessionContext].shortLabel}
                  </span>
                  {(analysisResult.privacyMode || privacyMode) !== PrivacyMode.STANDARD && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 flex items-center gap-1">
                      <ShieldCheck size={11} />
                      {PRIVACY_META[analysisResult.privacyMode || privacyMode].shortLabel}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-3">
                  {analysisResult.focusSpecificAthlete
                    ? "REPORT CONATIVO DELL'ATLETA"
                    : (analysisResult.sportCategory || sportCategory) === SportCategory.TEAM_SPORT
                    ? 'REPORT CONATIVO DI SQUADRA'
                    : (analysisResult.sportCategory || sportCategory) === SportCategory.DUAL_OPPOSITION
                    ? 'REPORT DUELLO CONATIVO (1 VS 1)'
                    : 'REPORT CONATIVO INDIVIDUALE'}
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  {analysisResult.analysisScopeSummary ||
                    (focusSpecificAthlete ? studentName || 'Atleta Specifico' : selectedSport)}{' '}
                  • {selectedSport}
                  {teamName ? ` (${teamName})` : ''} • {CONTEXT_META[analysisResult.sessionContext || sessionContext].shortLabel} • Data: {date}
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-all shadow-md active:scale-95 uppercase tracking-wider cursor-pointer"
                >
                  <Save size={16} /> Salva in Archivio
                </button>
                <button
                  type="button"
                  disabled={isExportingWord}
                  onClick={() =>
                    handleExportWord({
                      name: focusSpecificAthlete ? studentName || 'Atleta Specifico' : teamName || selectedSport,
                      sport: selectedSport,
                      sportCategory: analysisResult.sportCategory || sportCategory,
                      sessionContext: analysisResult.sessionContext || sessionContext,
                      privacyMode: analysisResult.privacyMode || privacyMode,
                      focusSpecificAthlete: analysisResult.focusSpecificAthlete ?? focusSpecificAthlete,
                      date,
                      teamName,
                      athleteRole,
                      athleteCategory,
                      notes,
                      analysis: analysisResult,
                    })
                  }
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 hover:bg-blue-50 rounded-xl font-black text-xs transition-all shadow-md active:scale-95 uppercase tracking-wider cursor-pointer disabled:opacity-60"
                >
                  {isExportingWord ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <FileText size={16} className="text-blue-600" />}
                  {isExportingWord ? 'Creazione Word...' : 'Scarica Word (.docx)'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportReport({
                      name: focusSpecificAthlete ? studentName || 'Atleta Specifico' : teamName || selectedSport,
                      sport: selectedSport,
                      sportCategory: analysisResult.sportCategory || sportCategory,
                      sessionContext: analysisResult.sessionContext || sessionContext,
                      focusSpecificAthlete: analysisResult.focusSpecificAthlete ?? focusSpecificAthlete,
                      date,
                      teamName,
                      analysis: analysisResult,
                    })
                  }
                  title="Scarica versione testuale semplice (.txt)"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl font-bold text-xs transition-all cursor-pointer uppercase tracking-wider"
                >
                  <Download size={14} /> TXT
                </button>
              </div>
            </div>

            <div className="p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Main Analysis Content (Left) */}
              <div className="lg:col-span-8 space-y-8">
                {/* Certificazione Visiva Atleta Specifico (SOLO SE RICHIESTO) */}
                {analysisResult.focusSpecificAthlete && analysisResult.targetAthleteConfirmation && (
                  <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-blue-400/30 shadow-md flex items-start gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl border border-blue-400/30 text-blue-300 shrink-0">
                      <Target size={24} />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-300 flex items-center gap-1.5">
                          <Eye size={12} /> Certificazione di Tracciamento Atleta Specifico
                        </span>
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-400/30">
                          ✓ Isolamento Target Confermato
                        </span>
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-white">
                        Atleta Osservato: {targetAthleteDescription || studentName || 'Atleta Specifico'}
                      </h4>
                      <p className="text-xs text-blue-100 leading-relaxed font-medium bg-black/25 p-3 rounded-xl border border-white/10">
                        {analysisResult.targetAthleteConfirmation}
                      </p>
                    </div>
                  </div>
                )}

                {/* CARD RADAR MOBILITAZIONE CONATIVA GRUPPO / ALUNNI (CONTEGGIO + MOVIMENTO + ESPRESSIONI + POSTURA) */}
                {analysisResult.groupMobilization &&
                  renderGroupMobilizationCard(analysisResult.groupMobilization)}

                {/* CARD SPECIFICA 1: DUELLO CONATIVO (SOLO SPORT CON 2 GIOCATORI OPPOSTI) */}
                {analysisResult.comparison && (
                  <div className="bg-white rounded-3xl border-2 border-indigo-200/90 shadow-lg overflow-hidden">
                    {/* Card Header */}
                    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-500/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-300 border border-indigo-400/30">
                            <Swords size={18} />
                          </span>
                          <span className="text-[10px] font-black tracking-widest uppercase text-indigo-300">
                            Analisi Pedagogica del Duello Conativo (Bui-Xuân)
                          </span>
                        </div>
                        <h3 className="text-xl font-black tracking-tight mt-1">
                          CONFRONTO DIRETTO DEI 2 GIOCATORI OPPOSTI
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 bg-amber-500/20 text-amber-300 text-xs font-black rounded-xl border border-amber-400/30 flex items-center gap-1.5">
                          <Trophy size={14} className="text-amber-400" />
                          Livello Più Alto: {analysisResult.comparison.duel.higherStageAthlete}
                        </span>
                        <span className="px-3 py-1 bg-white/10 text-slate-200 text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1">
                          <Scale size={14} className="text-blue-400" />
                          Divario: {analysisResult.comparison.duel.levelGap} {analysisResult.comparison.duel.levelGap === 1 ? 'tappa' : 'tappe'}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 space-y-6">
                      {/* 2 Side-by-Side Profiles */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Athlete 1 Box */}
                        <div className="bg-blue-50/40 rounded-2xl p-5 border-2 border-blue-200/90 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between border-b border-blue-200/70 pb-2 mb-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 flex items-center gap-1">
                                <Target size={13} className="text-blue-600" />
                                {analysisResult.focusSpecificAthlete
                                  ? '1. Atleta Target (Sotto Diagnosi)'
                                  : 'Contendente A'}
                              </span>
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                                {analysisResult.comparison.targetAthlete.role}
                              </span>
                            </div>

                            <h4 className="font-black text-slate-900 text-base">
                              {analysisResult.comparison.targetAthlete.visualIdentifier}
                            </h4>

                            {/* Stage Badge */}
                            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black bg-blue-600 text-white shadow-xs">
                              <span>TAPPA {analysisResult.comparison.targetAthlete.stage}</span>
                              <span className="opacity-75">•</span>
                              <span>{analysisResult.comparison.targetAthlete.stageName}</span>
                            </div>

                            {/* Real action summary */}
                            <div className="mt-3">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                Azione Reale nel Filmato
                              </span>
                              <div className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-blue-100 leading-relaxed">
                                <TextWithTimestamps text={analysisResult.comparison.targetAthlete.actionSummary} onTimestampClick={jumpToTime} />
                              </div>
                            </div>

                            {/* Preoccupation */}
                            <div className="mt-2.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                Preoccupazione Dominante
                              </span>
                              <p className="text-xs text-slate-600 italic bg-white/70 p-2.5 rounded-xl border border-blue-100">
                                "{analysisResult.comparison.targetAthlete.preoccupation}"
                              </p>
                            </div>
                          </div>

                          {/* Mini Volume Bar */}
                          <div className="pt-2 border-t border-blue-200/60 text-[10px] space-y-1">
                            <span className="font-bold text-slate-500 uppercase tracking-wider block">Volume Conativo Target:</span>
                            <div className="grid grid-cols-3 gap-1 text-center font-bold">
                              <div className="bg-red-50 text-red-700 p-1 rounded border border-red-200">
                                Tai {analysisResult.comparison.targetAthlete.graphData.structural}%
                              </div>
                              <div className="bg-blue-50 text-blue-700 p-1 rounded border border-blue-200">
                                Gi {analysisResult.comparison.targetAthlete.graphData.technical}%
                              </div>
                              <div className="bg-emerald-50 text-emerald-700 p-1 rounded border border-emerald-200">
                                Shin {analysisResult.comparison.targetAthlete.graphData.functional}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Opponent Athlete Box */}
                        <div className="bg-indigo-50/40 rounded-2xl p-5 border-2 border-indigo-200/90 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between border-b border-indigo-200/70 pb-2 mb-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                                <Swords size={13} className="text-indigo-600" />
                                {analysisResult.focusSpecificAthlete
                                  ? '2. Atleta Avversario / Partner'
                                  : 'Contendente B'}
                              </span>
                              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                                {analysisResult.comparison.opponentAthlete.role}
                              </span>
                            </div>

                            <h4 className="font-black text-slate-900 text-base">
                              {analysisResult.comparison.opponentAthlete.visualIdentifier}
                            </h4>

                            {/* Stage Badge */}
                            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-600 text-white shadow-xs">
                              <span>TAPPA {analysisResult.comparison.opponentAthlete.stage}</span>
                              <span className="opacity-75">•</span>
                              <span>{analysisResult.comparison.opponentAthlete.stageName}</span>
                            </div>

                            {/* Real action summary */}
                            <div className="mt-3">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                Azione Reale nel Filmato
                              </span>
                              <div className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-indigo-100 leading-relaxed">
                                <TextWithTimestamps text={analysisResult.comparison.opponentAthlete.actionSummary} onTimestampClick={jumpToTime} />
                              </div>
                            </div>

                            {/* Preoccupation */}
                            <div className="mt-2.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                                Preoccupazione Dominante
                              </span>
                              <p className="text-xs text-slate-600 italic bg-white/70 p-2.5 rounded-xl border border-indigo-100">
                                "{analysisResult.comparison.opponentAthlete.preoccupation}"
                              </p>
                            </div>
                          </div>

                          {/* Mini Volume Bar */}
                          <div className="pt-2 border-t border-indigo-200/60 text-[10px] space-y-1">
                            <span className="font-bold text-slate-500 uppercase tracking-wider block">Volume Conativo Avversario:</span>
                            <div className="grid grid-cols-3 gap-1 text-center font-bold">
                              <div className="bg-red-50 text-red-700 p-1 rounded border border-red-200">
                                Tai {analysisResult.comparison.opponentAthlete.graphData.structural}%
                              </div>
                              <div className="bg-blue-50 text-blue-700 p-1 rounded border border-blue-200">
                                Gi {analysisResult.comparison.opponentAthlete.graphData.technical}%
                              </div>
                              <div className="bg-emerald-50 text-emerald-700 p-1 rounded border border-emerald-200">
                                Shin {analysisResult.comparison.opponentAthlete.graphData.functional}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Meccanismo di Imposizione & Regressione Conativa Card */}
                      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-5 sm:p-6 space-y-4 shadow-md border border-indigo-400/30">
                        <div className="flex items-center gap-2.5 border-b border-indigo-500/30 pb-3">
                          <TrendingDown size={20} className="text-amber-400" />
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-amber-300">
                              Dinamica del Duello: Imposizione & Regressione Conativa
                            </h4>
                            <p className="text-[11px] text-slate-300">
                              Spiegazione pedagogica di come l'atleta dominante ha imposto il proprio senso dell'azione abbassando il livello dell'altro
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-black/35 p-4 rounded-xl border border-white/10 space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                              <Sparkles size={12} className="text-indigo-400" />
                              1. Meccanismo di Imposizione del Senso
                            </span>
                            <p className="text-xs text-slate-100 leading-relaxed font-medium">
                              {analysisResult.comparison.duel.impositionMechanism}
                            </p>
                          </div>

                          <div className="bg-black/35 p-4 rounded-xl border border-white/10 space-y-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-red-300 flex items-center gap-1">
                              <TrendingDown size={12} className="text-red-400" />
                              2. Effetto di Regressione sull'Atleta Inferiore (Abbassamento)
                            </span>
                            <p className="text-xs text-slate-100 leading-relaxed font-medium">
                              {analysisResult.comparison.duel.regressionEffect}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CARD SPECIFICA 2: DINAMICA COLLETTIVA DI SQUADRA (SOLO GIOCHI DI SQUADRA) */}
                {analysisResult.teamDynamics && (
                  <div className="bg-white rounded-3xl border-2 border-emerald-200/90 shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-5 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-300 border border-emerald-400/30">
                            <Users size={18} />
                          </span>
                          <span className="text-[10px] font-black tracking-widest uppercase text-emerald-300">
                            Analisi Pedagogica del Gioco Collettivo
                          </span>
                        </div>
                        <h3 className="text-xl font-black tracking-tight mt-1">
                          DINAMICA DI SQUADRA & GESTIONE DEGLI SPAZI
                        </h3>
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-200 text-xs font-bold rounded-xl border border-emerald-400/30">
                        Focus: {analysisResult.teamDynamics.teamFocus}
                      </span>
                    </div>

                    <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
                          1. Organizzazione Collettiva
                        </span>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <TextWithTimestamps text={analysisResult.teamDynamics.collectiveOrganization} onTimestampClick={jumpToTime} />
                        </div>
                      </div>
                      <div className="bg-teal-50/50 p-4 rounded-2xl border border-teal-200/80 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 block">
                          2. Spazio-Tempo & Senza Palla
                        </span>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <TextWithTimestamps text={analysisResult.teamDynamics.spaceTimeManagement} onTimestampClick={jumpToTime} />
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">
                          3. Pressione Avversaria
                        </span>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <TextWithTimestamps text={analysisResult.teamDynamics.opponentPressureEffect} onTimestampClick={jumpToTime} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CARD SPECIFICA 3: RAPPORTO CORPO-AMBIENTE (SOLO SPORT SINGOLI) */}
                {analysisResult.individualDynamics && (
                  <div className="bg-white rounded-3xl border-2 border-amber-200/90 shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-950 via-orange-950 to-slate-900 p-5 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-amber-500/20 rounded-lg text-amber-300 border border-amber-400/30">
                            <Activity size={18} />
                          </span>
                          <span className="text-[10px] font-black tracking-widest uppercase text-amber-300">
                            Analisi Pedagogica degli Sport Individuali
                          </span>
                        </div>
                        <h3 className="text-xl font-black tracking-tight mt-1">
                          RAPPORTO CORPO-AMBIENTE, ATTREZZO & ECONOMIA
                        </h3>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/80 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                          1. Ambiente / Attrezzo
                        </span>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <TextWithTimestamps text={analysisResult.individualDynamics.environmentOrApparatus} onTimestampClick={jumpToTime} />
                        </div>
                      </div>
                      <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-200/80 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-800 block">
                          2. Tecnica (Gi) vs Efficacia (Shin)
                        </span>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <TextWithTimestamps text={analysisResult.individualDynamics.technicalVsFunctionalBalance} onTimestampClick={jumpToTime} />
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">
                          3. Economia & Fluidità
                        </span>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          <TextWithTimestamps text={analysisResult.individualDynamics.motorEconomy} onTimestampClick={jumpToTime} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stage Badge & Diagnosis Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8 shadow-sm">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-blue-500/30">
                        {analysisResult.stage}
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                          Tappa Conativa Rilevata
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                          {analysisResult.stageName}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-amber-50 text-amber-800 px-4 py-2 rounded-xl border border-amber-200/80 font-bold text-xs">
                      <Trophy size={16} className="text-amber-600" />
                      <span>Vittoria: <strong>{analysisResult.victoryModality}</strong></span>
                    </div>
                  </div>

                  {/* Consonance / Conflict */}
                  <div className="mt-6">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                      Consonanza o Conflitto con il Compito Motorio
                    </h4>
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 text-slate-700 text-sm leading-relaxed">
                      <TextWithTimestamps text={analysisResult.consonance} onTimestampClick={jumpToTime} />
                    </div>
                  </div>
                </div>

                {/* Preoccupazione Dominante & Mobilitazione */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-8 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-slate-900">
                    <div className="w-2 h-6 bg-blue-600 rounded-full" />
                    <h4 className="text-base font-black uppercase tracking-wider">
                      Preoccupazione Dominante & Mobilitazione (Tappa Conativa)
                    </h4>
                  </div>
                  <div className="text-slate-700 text-sm leading-relaxed bg-slate-50 p-5 rounded-xl border border-slate-100">
                    <TextWithTimestamps text={analysisResult.mobilization} onTimestampClick={jumpToTime} />
                  </div>
                </div>

                {/* Metaconative Reflection */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-6 lg:p-8 rounded-2xl border border-amber-200 shadow-sm relative overflow-hidden">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-black uppercase tracking-widest mb-3">
                    <AlertCircle size={16} className="text-amber-600" />
                    Domanda di Riflessione Metaconativa (Bui-Xuân / Reuchlin)
                  </div>
                  <p className="text-lg lg:text-xl font-serif text-amber-950 italic leading-relaxed">
                    "{analysisResult.metaReflection}"
                  </p>
                  <p className="text-[11px] text-amber-700 mt-3 font-medium">
                    Stimolo di presa di coscienza per permettere all'allievo di passare dalla riuscita pratica alla comprensione del senso.
                  </p>
                </div>

                {/* Horizontal Training Sheet */}
                <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-sm">
                  <div className="bg-emerald-600 px-6 py-4 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                      <Target size={18} />
                      <span className="text-xs font-black uppercase tracking-wider">
                        Scheda di Intervento Pedagogico Orizzontale (Situazione-Problema)
                      </span>
                    </div>
                  </div>
                  <div className="p-6 lg:p-8 bg-emerald-50/20">
                    <ReactMarkdown components={markdownComponents}>
                      {analysisResult.trainingSheet}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Conative Graph Sidebar (Right) */}
              <div className="lg:col-span-4 space-y-6">
                <div className="sticky top-28 space-y-6">
                  {/* Graph preview container */}
                  <div
                    className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm relative cursor-zoom-in group transition-transform hover:scale-[1.01]"
                    onClick={() => setIsGraphModalOpen(true)}
                  >
                    <div className="absolute top-6 right-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white p-2 rounded-xl shadow-lg">
                      <Maximize2 size={18} />
                    </div>
                    <ConativeGraph data={analysisResult.graphData} />
                    <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2">
                      Clicca per visualizzare a tutto schermo
                    </p>
                  </div>

                  {/* Volume breakdown summary */}
                  <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-5">
                    <h4 className="text-[11px] font-black text-blue-300 uppercase tracking-widest border-b border-slate-800 pb-2">
                      Ripartizione Volume Conativo
                    </h4>

                    <div className="space-y-4">
                      {/* Tai */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                          <span className="text-red-400 uppercase">Struttura (Tai)</span>
                          <span className="tabular-nums font-black text-base">
                            {analysisResult.graphData.structural}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-red-500 h-full rounded-full transition-all duration-700"
                            style={{ width: `${analysisResult.graphData.structural}%` }}
                          />
                        </div>
                      </div>

                      {/* Gi */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                          <span className="text-blue-400 uppercase">Tecnica (Gi)</span>
                          <span className="tabular-nums font-black text-base">
                            {analysisResult.graphData.technical}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-700"
                            style={{ width: `${analysisResult.graphData.technical}%` }}
                          />
                        </div>
                      </div>

                      {/* Shin */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                          <span className="text-emerald-400 uppercase">Funzionalità (Shin)</span>
                          <span className="tabular-nums font-black text-base">
                            {analysisResult.graphData.functional}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-700"
                            style={{ width: `${analysisResult.graphData.functional}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Modal Graph Fullscreen */}
        {isGraphModalOpen && analysisResult && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
            <button
              type="button"
              onClick={() => setIsGraphModalOpen(false)}
              className="absolute top-6 right-6 text-white hover:text-red-400 transition-colors bg-white/10 p-3 rounded-full border border-white/20 shadow-xl z-[70] cursor-pointer"
            >
              <X size={24} />
            </button>
            <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-10 max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col items-center">
              <div className="mb-4 text-center">
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                  Volume di Mobilitazione Conativa
                </h3>
                <p className="text-blue-600 font-bold uppercase tracking-widest text-xs mt-1">
                  Proiezione Assi 3D: Struttura (Tai) • Funzione (Shin) • Tecnica (Gi)
                </p>
              </div>
              <div className="w-full">
                <ConativeGraph data={analysisResult.graphData} />
              </div>
            </div>
          </div>
        )}

        {/* ARCHIVIO STORICO */}
        <section id="archivio-sezione" className="pt-8 border-t border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tight">
                🗂 Archivio Storico Diagnosi
                <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-black">
                  {archive.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Profili e analisi conative memorizzate per il monitoraggio longitudinale degli allievi
              </p>
            </div>
            {archive.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Vuoi svuotare tutto l’archivio storico?')) {
                    setArchive([]);
                  }
                }}
                className="text-xs text-red-600 hover:text-red-800 font-bold"
              >
                Svuota Archivio
              </button>
            )}
          </div>

          {archive.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-dashed border-slate-300 text-center text-slate-500">
              <p className="text-sm font-semibold">Nessuna analisi salvata in archivio.</p>
              <p className="text-xs text-slate-400 mt-1">
                Esegui un'analisi video e clicca su "Salva in Archivio" per conservare la scheda di diagnosi.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {archive.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedArchiveItem(item)}
                  className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group relative"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-xs">
                      {item.analysis?.stage}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                      {item.date}
                    </span>
                  </div>

                  <h3 className="font-black text-slate-900 text-lg truncate">{item.name}</h3>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                    {item.sport} {item.teamName ? `• ${item.teamName}` : ''}
                  </p>
                  {(item.sessionContext || item.analysis?.sessionContext) && (
                    <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full border mb-2 ${CONTEXT_META[item.sessionContext || item.analysis?.sessionContext || SessionContext.PALESTRA].badgeBg}`}>
                      {CONTEXT_META[item.sessionContext || item.analysis?.sessionContext || SessionContext.PALESTRA].shortLabel}
                    </span>
                  )}
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                    Tappa: <strong>{item.analysis?.stageName}</strong> — Vittoria: {item.analysis?.victoryModality}
                  </p>
                  {item.analysis?.groupMobilization && (
                    <div className="flex items-center gap-2 text-[10px] font-bold mb-3">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Mobilitati: {item.analysis.groupMobilization.mobilizedCount}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                        Non interessati: {item.analysis.groupMobilization.disengagedCount}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 border-t border-slate-100 pt-3">
                    <span className="text-emerald-700">Clicca per visualizzare</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Eliminare l'analisi di ${item.name}?`)) {
                          setArchive(archive.filter((a) => a.id !== item.id));
                        }
                      }}
                      className="p-1 hover:text-red-600 rounded text-slate-300"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Modal Dettaglio Archivio */}
        {selectedArchiveItem && selectedArchiveItem.analysis && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto border border-white/20">
              <div className="p-6 lg:p-8 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-20">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md">
                    {selectedArchiveItem.analysis.stage}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">{selectedArchiveItem.name}</h3>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                      {selectedArchiveItem.sport}
                      {selectedArchiveItem.teamName ? ` • ${selectedArchiveItem.teamName}` : ''}
                      {(selectedArchiveItem.sessionContext || selectedArchiveItem.analysis.sessionContext)
                        ? ` • ${CONTEXT_META[selectedArchiveItem.sessionContext || selectedArchiveItem.analysis.sessionContext || SessionContext.PALESTRA].shortLabel}`
                        : ''}{' '}
                      • {selectedArchiveItem.date}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isExportingWord}
                    onClick={() =>
                      handleExportWord({
                        name: selectedArchiveItem.name,
                        sport: selectedArchiveItem.sport,
                        sportCategory: selectedArchiveItem.sportCategory,
                        sessionContext: selectedArchiveItem.sessionContext,
                        privacyMode: selectedArchiveItem.privacyMode || selectedArchiveItem.analysis?.privacyMode,
                        focusSpecificAthlete: selectedArchiveItem.focusSpecificAthlete,
                        date: selectedArchiveItem.date,
                        teamName: selectedArchiveItem.teamName,
                        athleteRole: selectedArchiveItem.athleteRole,
                        athleteCategory: selectedArchiveItem.athleteCategory,
                        notes: selectedArchiveItem.notes,
                        analysis: selectedArchiveItem.analysis!,
                      })
                    }
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-sm disabled:opacity-60"
                  >
                    {isExportingWord ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                    {isExportingWord ? 'Esporto...' : 'Word (.docx)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportReport(selectedArchiveItem)}
                    title="Scarica versione testuale (.txt)"
                    className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Download size={14} /> TXT
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedArchiveItem(null)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 lg:p-8 space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">
                    Diagnosi Registrata
                  </div>
                  <h4 className="text-xl font-black text-slate-900 uppercase">
                    Tappa {selectedArchiveItem.analysis.stage}: {selectedArchiveItem.analysis.stageName}
                  </h4>
                  <div className="mt-4 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {selectedArchiveItem.analysis.consonance}
                  </div>
                </div>

                {selectedArchiveItem.analysis.comparison && (
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl border border-indigo-400/30 space-y-3">
                    <div className="flex items-center justify-between border-b border-indigo-500/30 pb-2">
                      <span className="text-xs font-black uppercase text-amber-300 flex items-center gap-1.5">
                        <Swords size={16} /> Duello Conativo Registrato
                      </span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/30 font-bold">
                        Dominanza: {selectedArchiveItem.analysis.comparison.duel.higherStageAthlete}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                        <strong className="text-blue-300 block mb-0.5">
                          {selectedArchiveItem.analysis.focusSpecificAthlete ? 'Target: ' : 'Contendente A: '}
                          {selectedArchiveItem.analysis.comparison.targetAthlete.visualIdentifier}
                        </strong>
                        <span>Tappa {selectedArchiveItem.analysis.comparison.targetAthlete.stage} ({selectedArchiveItem.analysis.comparison.targetAthlete.stageName})</span>
                        <p className="text-[11px] text-slate-300 mt-1">{selectedArchiveItem.analysis.comparison.targetAthlete.actionSummary}</p>
                      </div>
                      <div className="bg-white/10 p-3 rounded-xl border border-white/10">
                        <strong className="text-indigo-300 block mb-0.5">
                          {selectedArchiveItem.analysis.focusSpecificAthlete ? 'Avversario: ' : 'Contendente B: '}
                          {selectedArchiveItem.analysis.comparison.opponentAthlete.visualIdentifier}
                        </strong>
                        <span>Tappa {selectedArchiveItem.analysis.comparison.opponentAthlete.stage} ({selectedArchiveItem.analysis.comparison.opponentAthlete.stageName})</span>
                        <p className="text-[11px] text-slate-300 mt-1">{selectedArchiveItem.analysis.comparison.opponentAthlete.actionSummary}</p>
                      </div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-xl border border-white/10 text-xs">
                      <span className="text-[10px] uppercase font-bold text-red-300 block mb-1">Regressione & Abbassamento di Livello:</span>
                      <p className="text-[11px] text-slate-200">{selectedArchiveItem.analysis.comparison.duel.regressionEffect}</p>
                    </div>
                  </div>
                )}

                {selectedArchiveItem.analysis.teamDynamics && (
                  <div className="bg-emerald-950 text-white p-5 rounded-2xl border border-emerald-400/30 space-y-2 text-xs">
                    <span className="font-black uppercase text-emerald-300 flex items-center gap-1.5">
                      <Users size={16} /> Dinamica Collettiva ({selectedArchiveItem.analysis.teamDynamics.teamFocus})
                    </span>
                    <p className="text-slate-200">{selectedArchiveItem.analysis.teamDynamics.collectiveOrganization}</p>
                    <p className="text-slate-300">{selectedArchiveItem.analysis.teamDynamics.spaceTimeManagement}</p>
                  </div>
                )}

                {selectedArchiveItem.analysis.individualDynamics && (
                  <div className="bg-amber-950 text-white p-5 rounded-2xl border border-amber-400/30 space-y-2 text-xs">
                    <span className="font-black uppercase text-amber-300 flex items-center gap-1.5">
                      <Activity size={16} /> Rapporto Corpo-Ambiente / Attrezzo
                    </span>
                    <p className="text-slate-200">{selectedArchiveItem.analysis.individualDynamics.environmentOrApparatus}</p>
                    <p className="text-slate-300">{selectedArchiveItem.analysis.individualDynamics.technicalVsFunctionalBalance}</p>
                  </div>
                )}

                {selectedArchiveItem.analysis.groupMobilization && (
                  <div className="bg-teal-950 text-white p-5 rounded-2xl border border-teal-400/30 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-black uppercase text-teal-300 flex items-center gap-1.5">
                        <Users size={16} /> Censimento Mobilitazione Alunni / Atleti
                      </span>
                      <div className="flex items-center gap-2 font-black">
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/25 text-emerald-200 border border-emerald-400/40">
                          Mobilitati: {selectedArchiveItem.analysis.groupMobilization.mobilizedCount}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-rose-500/25 text-rose-200 border border-rose-400/40">
                          Non interessati: {selectedArchiveItem.analysis.groupMobilization.disengagedCount}
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-200">{selectedArchiveItem.analysis.groupMobilization.groupSummary}</p>
                    <p className="text-teal-200 font-semibold">
                      Strategia: {selectedArchiveItem.analysis.groupMobilization.reengagementStrategy}
                    </p>
                  </div>
                )}

                <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-xs">
                  <h5 className="font-black text-sm uppercase text-emerald-800 mb-3 flex items-center gap-2">
                    <Target size={18} /> Scheda di Intervento Pedagogico
                  </h5>
                  <ReactMarkdown components={markdownComponents}>
                    {selectedArchiveItem.analysis.trainingSheet}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal Gestione Accesso Amici (Solo Proprietario - Zero PIN) */}
        {isAccessModalOpen && authRole === 'owner' && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-slate-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white rounded-t-3xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-400/30">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">Gestione Accesso & Condivisione Amici</h3>
                    <p className="text-xs text-slate-400">
                      Tu accedi sempre senza PIN. I tuoi amici invece inseriscono il codice sul link pubblico.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAccessModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Conferma Zero-PIN Proprietario */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
                  <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-900 space-y-1">
                    <strong className="font-black uppercase tracking-wider block text-emerald-800">
                      Accesso Proprietario Automatico Attivo (Zero PIN per te)
                    </strong>
                    <p className="leading-relaxed">
                      Dal tuo spazio di lavoro entri sempre in automatico senza dover digitare nessun codice.
                    </p>
                  </div>
                </div>

                {accessModalError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2">
                    <AlertCircle size={15} />
                    <span>{accessModalError}</span>
                  </div>
                )}

                {/* Card 1: Link Diretto Proprietario per Smartphone / Altri Dispositivi */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck size={15} className="text-blue-600" />
                      1. Il Tuo Link Personale (Zero PIN su Smartphone / Tablet)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Vuoi usare l'app anche dal tuo cellulare sul link condiviso senza mettere il codice? Copialo e aprilo <strong>una sola volta</strong> sul tuo telefono (non condividerlo con gli amici):
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={
                        ownerInviteKey
                          ? `${getEffectiveSharedBaseUrl()}/?owner=${ownerInviteKey}`
                          : getEffectiveSharedBaseUrl()
                      }
                      className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-xl text-xs font-mono text-slate-700 select-all outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          ownerInviteKey
                            ? `${getEffectiveSharedBaseUrl()}/?owner=${ownerInviteKey}`
                            : getEffectiveSharedBaseUrl(),
                          'owner'
                        )
                      }
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                    >
                      {copiedType === 'owner' ? <Check size={14} /> : <Copy size={14} />}
                      {copiedType === 'owner' ? 'Link Copiato!' : 'Copia Mio Link'}
                    </button>
                  </div>
                </div>

                {/* Card 2: Codice Amici & Protezione */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <UserPlus size={15} className="text-indigo-600" />
                        2. Protezione & Codice per gli Amici
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Chi apre il link pubblico dovrà inserire questo codice una sola volta sul proprio dispositivo.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingAccessConfig}
                      onClick={() => handleSaveAccessConfig(!gateEnabled)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
                        gateEnabled
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      {gateEnabled ? 'Blocco Attivo' : 'Accesso Libero'}
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={friendPinDraft}
                      onChange={(e) => setFriendPinDraft(e.target.value)}
                      placeholder="Codice amici (min 4 caratteri)"
                      autoCapitalize="none"
                      className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black tracking-widest text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      disabled={isSavingAccessConfig}
                      onClick={() => handleSaveAccessConfig(gateEnabled)}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {isSavingAccessConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Salva Codice
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Cambiando il codice, chi aveva già effettuato l'accesso con il vecchio codice verrà scollegato automaticamente.
                  </p>

                  {/* Invito pronto per WhatsApp */}
                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          `Ciao! Ecco il link per provare ConativeSport Analyst AI:\n${getEffectiveSharedBaseUrl()}\nCodice di accesso amici: ${friendPinConfig || friendPinDraft}`,
                          'friend'
                        )
                      }
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {copiedType === 'friend' ? <Check size={15} /> : <Copy size={15} />}
                      {copiedType === 'friend' ? 'Invito Copiato!' : 'Copia Invito + Codice per Amici'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAccessModalOpen(false);
                        setPreviewFriendScreen(true);
                      }}
                      className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Eye size={15} />
                      Anteprima Schermata Amici
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <OfflineIndicator />
    </div>
  );
};

export default App;
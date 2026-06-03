
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ConnectionStatus } from './types';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { Copy, Check, Trash2, Download, Maximize2, Minimize2, RotateCcw, Zap, BookOpen, ChevronRight, AlertTriangle, AlertCircle, Info, Send, Anchor, Plus, X, Camera, Globe, Search, FileText, File, CheckCircle, Upload, Cpu, Mic } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const FRAME_RATE = 2; 
const JPEG_QUALITY = 0.6;

type AppView = 'home' | 'reading-room' | 'toolbox' | 'command' | 'system-prompt' | 'clients' | 'consult' | 'archive' | 'interaction-feed' | 'drafting' | 'convert' | 'knowledge' | 'brain-manager';

interface ClientRecord {
  id: string;
  name: string;
  caseType: string;
  status: 'Active' | 'Pending' | 'Closed';
  lastInteraction: string;
}

interface CaseCitation {
  id: string;
  title: string;
  paragraph: string;
  court: 'Supreme Court' | 'High Court';
  selected: boolean;
}

const parseCitations = (text: string): CaseCitation[] => {
  const citations: CaseCitation[] = [];
  const lowercaseText = text.toLowerCase();
  
  if (
    lowercaseText.includes("no_cases_found") || 
    lowercaseText.includes("no case is found now") || 
    lowercaseText.includes("no case find") || 
    lowercaseText.includes("no case found") ||
    text.trim() === ""
  ) {
    return [];
  }

  // Split on [CASE] blocks if present
  if (text.includes("[CASE]")) {
    const caseBlocks = text.split("[CASE]");
    caseBlocks.forEach((block, idx) => {
      if (!block.trim()) return;
      const endIdx = block.indexOf("[END_CASE]");
      const activeBlock = endIdx !== -1 ? block.substring(0, endIdx) : block;
      
      let title = "";
      let court: 'Supreme Court' | 'High Court' = 'Supreme Court';
      let paragraph = "";
      
      const lines = activeBlock.split("\n");
      lines.forEach(line => {
        const trimmedLine = line.trim().replace(/^\*\*|\*\*$/g, '').trim();
        if (trimmedLine.startsWith("Title:")) {
          title = trimmedLine.substring(6).trim().replace(/^\*\*|\*\*$/g, '').trim();
        } else if (trimmedLine.startsWith("Court:")) {
          const c = trimmedLine.substring(6).trim();
          court = c.toLowerCase().includes("high") ? "High Court" : "Supreme Court";
        } else if (trimmedLine.startsWith("Paragraph:")) {
          paragraph = trimmedLine.substring(10).trim();
        } else if (paragraph && !trimmedLine.startsWith("Title:") && !trimmedLine.startsWith("Court:")) {
          paragraph += "\n" + trimmedLine;
        }
      });
      
      if (title && paragraph) {
        citations.push({
          id: `citation-${idx}-${Date.now()}`,
          title,
          court,
          paragraph: paragraph.trim(),
          selected: false
        });
      }
    });
  }

  // If no block-based parsing succeeded, try markdown-style lists as fallback
  if (citations.length === 0) {
    const lines = text.split("\n");
    let currentTitle = "";
    let currentCourt: 'Supreme Court' | 'High Court' = 'Supreme Court';
    let currentParagraph = "";

    lines.forEach((line) => {
      const trimmedLine = line.trim().replace(/^[-*#\d.]+\s+/, '').trim(); // Remove list bullet/number
      const cleanLine = trimmedLine.replace(/^\*\*|\*\*$/g, '').trim();
      
      if (cleanLine.toLowerCase().startsWith("title:")) {
        if (currentTitle && currentParagraph) {
          citations.push({
            id: `citation-fb-${citations.length}-${Date.now()}`,
            title: currentTitle,
            court: currentCourt,
            paragraph: currentParagraph,
            selected: false
          });
          currentParagraph = "";
        }
        currentTitle = cleanLine.substring(6).trim();
      } else if (cleanLine.toLowerCase().startsWith("court:")) {
        const val = cleanLine.substring(6).trim();
        currentCourt = val.toLowerCase().includes("high") ? "High Court" : "Supreme Court";
      } else if (cleanLine.toLowerCase().startsWith("paragraph:") || cleanLine.toLowerCase().startsWith("ratio:") || cleanLine.toLowerCase().startsWith("held:")) {
        const labelIndex = cleanLine.indexOf(":");
        currentParagraph = cleanLine.substring(labelIndex + 1).trim();
      } else if (cleanLine && currentTitle) {
        if (currentParagraph) {
          currentParagraph += " " + cleanLine;
        } else {
          currentParagraph = cleanLine;
        }
      }
    });

    if (currentTitle && currentParagraph) {
      citations.push({
        id: `citation-fb-last-${Date.now()}`,
        title: currentTitle,
        court: currentCourt,
        paragraph: currentParagraph,
        selected: false
      });
    }
  }

  return citations;
};

const DEFAULT_SYSTEM_PROMPT = `You are Nexus Justice, a high-level legal AI assistant. 
When the camera is active, you perform real-time OCR and summarize documents. 
Focus on legal clauses, headers, and specific names or dates. 
Be precise, professional, and act as a senior legal counsel advisor.`;

const KNOWLEDGE_BASE_ACTS = [
  { 
    id: 'railways',
    title: 'The Railways Act, 1989', 
    category: 'Railway Law', 
    year: '1989',
    objective: 'An Act to consolidate and amend the law relating to railways, providing for technical standards, carriage of passengers and goods, and liability.',
    coreSections: [
      { num: 'Section 124', title: 'Right to Compensation', desc: 'Compensation for injury or death of a passenger due to an accident.' },
      { num: 'Section 147', title: 'Trespassing on Railway', desc: 'Penalties for unauthorized entry or trespassing on any railway property.' },
      { num: 'Section 151', title: 'Damaging Railway Property', desc: 'Slightest damage to railway lines, signals, or assets is a punishable offence.' }
    ],
    details: 'The Railways Act regulates the administration, technical infrastructure, safety and passenger-transit operations within India.'
  },
  { 
    id: 'property',
    title: 'Transfer of Property Act, 1882', 
    category: 'Property Law', 
    year: '1882',
    objective: 'An Act to regulate the transfer of property by act of parties, establishing rules for sale, mortgage, lease, exchange, and gift.',
    coreSections: [
      { num: 'Section 5', title: 'Transfer of Property Defined', desc: 'Statutes defining living persons transferring property to other living entities.' },
      { num: 'Section 54', title: 'Sale of Immovable Property', desc: 'Describes the legal definition of selling land or structures, requiring registration.' },
      { num: 'Section 122', title: 'Gifts of Property', desc: 'Defines voluntary transfers of existing moveable or immoveable property without consideration.' }
    ],
    details: 'This Act is the bedrock of transaction and title conveyance laws in India, governing how physical and digital real-estate assets change hands.'
  },
  { 
    id: 'ipc',
    title: 'Indian Penal Code', 
    category: 'Criminal Law', 
    year: '1860',
    objective: 'The official criminal code of India covering all substantive aspects of criminal law, definition of crimes, and prescribed punishments.',
    coreSections: [
      { num: 'Section 300', title: 'Murder', desc: 'Statutes defining murder and exceptions that reduce homicide culpability.' },
      { num: 'Section 378', title: 'Theft', desc: 'Moving moveable asset dishonestly out of ownership without consent.' },
      { num: 'Section 420', title: 'Cheating & Dishonesty', desc: 'Inducing delivery of property based on cheating or deceptive promises.' }
    ],
    details: 'Serving as the substantive cornerstone of Indian criminal law, the IPC sets out classifications for offences, criminal responsibility, and sentencing.'
  },
  { 
    id: 'cooperative',
    title: 'Cooperative Societies Act', 
    category: 'Cooperative Law', 
    year: '1912',
    objective: 'An Act to facilitate the formation and operational compliance of cooperative institutions for the promotion of mutual thrift and self-help.',
    coreSections: [
      { num: 'Section 4', title: 'Societies Which May Be Registered', desc: 'Guidelines for multi-member, democratic associations registering under the Act.' },
      { num: 'Section 12', title: 'Registered Societies to be Bodies Corporate', desc: 'Granted corporate status with perpetual succession and a common seal.' }
    ],
    details: 'Encouraging agricultural, credit, and community-driven collective economic empowerment under a structured legislative framework.'
  },
  { 
    id: 'industrial',
    title: 'Industrial Disputes Act', 
    category: 'Labour Law', 
    year: '1947',
    objective: 'An Act to make provision for the investigation and settlement of industrial disputes peacefully via tribunals and collective bargaining.',
    coreSections: [
      { num: 'Section 2(k)', title: 'Industrial Dispute 정의', desc: 'Any dispute between employers and employers, or employers and workmen.' },
      { num: 'Section 25(F)', title: 'Retrenchment Procedures', desc: 'Retrenching employees conditions precedent including notice with compensation.' }
    ],
    details: 'The central legislation safeguarding collective labor relations, workplace safety disputes, strikes, lockouts, and severance compensation.'
  }
];

const CONVERTER_STEPS = [
  { id: 1, title: 'Camera Capture', desc: 'Snap photos of physical documents', icon: <Camera size={14} />, color: '#6366f1' },
  { id: 2, title: 'File Upload', desc: 'Select images from your device', icon: <Upload size={14} />, color: '#10b981' },
  { id: 3, title: 'AI Extraction', desc: 'High-precision text recognition', icon: <Search size={14} />, color: '#f59e0b' },
  { id: 4, title: 'AI Translation', desc: 'Convert to any language', icon: <Globe size={14} />, color: '#8b5cf6' },
  { id: 5, title: 'PDF Export', desc: 'Save as professional PDF', icon: <FileText size={14} />, color: '#ef4444' },
  { id: 6, title: 'Word Export', desc: 'Save as editable .docx', icon: <File size={14} />, color: '#3b82f6' },
];

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('home');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isLoading, setIsLoading] = useState(true);
  
  // System Prompt State
  const [systemPrompt, setSystemPrompt] = useState(() => {
    return localStorage.getItem('nexus_system_prompt') || DEFAULT_SYSTEM_PROMPT;
  });
  const [tempPrompt, setTempPrompt] = useState(systemPrompt);
  const [isPromptSaved, setIsPromptSaved] = useState(false);

  // Hardware States
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toolbox Specific State
  const [toolboxImage, setToolboxImage] = useState<string | null>(null);
  const [isScanningToolbox, setIsScanningToolbox] = useState(false);

  // Doc Converter States
  const [converterImage, setConverterImage] = useState<string | null>(null);
  const [converterText, setConverterText] = useState('');
  const [converterStatus, setConverterStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [activeConvertPanel, setActiveConvertPanel] = useState(0);
  const [targetLanguage, setTargetLanguage] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isPreviewEnlarged, setIsPreviewEnlarged] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [scanPhase, setScanPhase] = useState<'idle' | 'live' | 'processing' | 'done' | 'error'>('idle');
  const [scannedText, setScannedText] = useState('');
  
  const convertContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const converterVideoRef = useRef<HTMLVideoElement>(null);
  const converterCanvasRef = useRef<HTMLCanvasElement>(null);
  const converterStreamRef = useRef<MediaStream | null>(null);

  // Refs for stable state access in callbacks
  const cameraEnabledRef = useRef(false);
  const micEnabledRef = useRef(false);

  // Transcription States
  const [userTranscription, setUserTranscription] = useState("");
  const [aiTranscription, setAiTranscription] = useState("");
  const userTranscriptionRef = useRef("");
  const aiTranscriptionRef = useRef("");
  
  // Direct text input fallback states
  const [textInput, setTextInput] = useState("");
  const [isAiGeneratingText, setIsAiGeneratingText] = useState(false);

  const [history, setHistory] = useState<{role: 'user' | 'ai', text: string, id: number}[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Drafting Page States
  const [draftPages, setDraftPages] = useState<string[]>(["IN THE COURT OF THE DISTRICT JUDGE OF ERNAKULAM\n\nDISPUTE CASE NO. 104 OF 2026\n\nBETWEEN:\nSreedharan K.\t\t...Petitioner\nAND\nNeighboring Owner\t\t...Respondent\n\nPETITION FOR INTERIM INJUNCTION UNDER ORDER XXXIX RULES 1 & 2 OF CPC\n\nMost Respectfully Showeth:\n1. The Petitioner is the absolute owner and in peaceful possession of the property described in the schedule hereunder.\n2. The Respondent is the owner of the property on the immediate southern boundary of the Petitioner's property.\n3. On 14/02/2026, the Respondent commenced unauthorized fence construction encroaching onto the Petitioner's boundary.\n\nTherefore, the Petitioner prays for a temporary injunction restraining the Respondent from carrying out any further construction.\n\nDate: 16/02/2026\nAdvocate for Petitioner\n\nVERIFICATION\nI, Sreedharan K., do hereby verify that the contents of paragraphs 1 to 3 are true to my personal knowledge.\n\nPetitioner"]);
  const [deskInput, setDeskInput] = useState('');
  const [deskLoading, setDeskLoading] = useState(false);
  const [deskChatHistory, setDeskChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: "Welcome to the Drafting Desk. I can help you generate or refine court complaints, petitions, and legal arguments." }
  ]);
  const [draftFacts, setDraftFacts] = useState('Property boundary dispute in Aluva. Neighbor is encroaching via new fence construction. Needs interim injunction against further work.');
  const [draftModel, setDraftModel] = useState('');
  const [draftSuggestions, setDraftSuggestions] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftCitations, setDraftCitations] = useState<CaseCitation[]>([]);
  const [isSearchingCitations, setIsSearchingCitations] = useState(false);
  const [showCitationsDropdown, setShowCitationsDropdown] = useState(false);
  const [isRewritingDraft, setIsRewritingDraft] = useState(false);
  const [citationSearchError, setCitationSearchError] = useState('');
  const [enlargedElement, setEnlargedElement] = useState<'facts' | 'model' | 'pad' | 'suggestions' | null>(null);
  const [draftEditorMode, setDraftEditorMode] = useState<'edit' | 'interactive'>('interactive');
  const [showCustomPromptPage, setShowCustomPromptPage] = useState(false);
  const [customPromptText, setCustomPromptText] = useState('');
  const [activePanel, setActivePanel] = useState(0);
  const [isCustomPromptProcessing, setIsCustomPromptProcessing] = useState(false);
  const [highlightedCitationId, setHighlightedCitationId] = useState<string | null>(null);
  const [newDirectiveName, setNewDirectiveName] = useState('');
  const [newDirectivePrompt, setNewDirectivePrompt] = useState('');

  // Knowledge Base States
  const [selectedActId, setSelectedActId] = useState<string | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [knowledgeAiQuery, setKnowledgeAiQuery] = useState('');
  const [knowledgeAiResponse, setKnowledgeAiResponse] = useState('');
  const [isQueryingKnowledge, setIsQueryingKnowledge] = useState(false);

  // Brain Manager States
  const [brain1Progress, setBrain1Progress] = useState(0);
  const [isBrain1Downloading, setIsBrain1Downloading] = useState(false);
  const [brain1Message, setBrain1Message] = useState('Nexus Gemma 4 E2B · ~1.2 GB · Q3_K_M · Next-Gen Intelligence');
  const [brain1Ready, setBrain1Ready] = useState(false);

  const [brain2Progress, setBrain2Progress] = useState(0);
  const [isBrain2Downloading, setIsBrain2Downloading] = useState(false);
  const [brain2Message, setBrain2Message] = useState('Nexus Gemma 4 E4B · ~2.1 GB · Q3_K_M · State-of-the-Art Legal Reasoning');
  const [brain2Ready, setBrain2Ready] = useState(false);

  const [whisperProgress, setWhisperProgress] = useState(0);
  const [isWhisperDownloading, setIsWhisperDownloading] = useState(false);
  const [whisperMessage, setWhisperMessage] = useState('WhisperMini (Xenova) · ~38 MB · whisper-tiny-quantized');
  const [whisperReady, setWhisperReady] = useState(false);

  const [simulatedDevice, setSimulatedDevice] = useState<'laptop' | 'mobile'>(() => {
    const isMobileString = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileString ? 'mobile' : 'laptop';
  });

  const [simulatedRam, setSimulatedRam] = useState<number>(() => {
    return (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) || 8;
  });

  const isLowRam = simulatedRam < 4;
  const isMobileHighRam = simulatedRam >= 4 && simulatedDevice === 'mobile';
  const isLaptopHighRam = simulatedRam >= 4 && simulatedDevice === 'laptop';

  const isBrain1Enabled = isLowRam || isLaptopHighRam;
  const isBrain2Enabled = !isLowRam;

  const [activeBrain, setActiveBrain] = useState<'brain1' | 'brain2'>('brain1');
  
  const [systemDirectives, setSystemDirectives] = useState<{ label: string; text: string }[]>(() => {
    try {
      const stored = localStorage.getItem('nexus_system_directives');
      return stored ? JSON.parse(stored) : [
        { label: "Kerala High Court Pleading Format", text: "Format this as a formal Writ Petition before the Hon'ble High Court of Kerala. Emphasize appropriate constitutional articles, add boilerplate headers, verification seals, and advocate signing margins." },
        { label: "Civil Injunction Restraint Specifics", text: "Formulate a standard relief of temporary injunction. Anchor it on prime principles: prima facie case, balance of convenience, and irreparable injury." },
        { label: "Highlight Lack Of Mens Rea / Intent", text: "Structure a strong defense emphasizing absolute lack of intention or knowledge. Elaborate the chronology of sequences point-by-point to substantiate lack of culpability." },
        { label: "Formal Show-cause Representation", text: "Prepare a detailed reply to the show-cause notice. Respond in a highly professional, respectful, yet robust legal defense style quoting standard administrative precedents." }
      ];
    } catch {
      return [
        { label: "Kerala High Court Pleading Format", text: "Format this as a formal Writ Petition before the Hon'ble High Court of Kerala. Emphasize appropriate constitutional articles, add boilerplate headers, verification seals, and advocate signing margins." },
        { label: "Civil Injunction Restraint Specifics", text: "Formulate a standard relief of temporary injunction. Anchor it on prime principles: prima facie case, balance of convenience, and irreparable injury." },
        { label: "Highlight Lack Of Mens Rea / Intent", text: "Structure a strong defense emphasizing absolute lack of intention or knowledge. Elaborate the chronology of sequences point-by-point to substantiate lack of culpability." },
        { label: "Formal Show-cause Representation", text: "Prepare a detailed reply to the show-cause notice. Respond in a highly professional, respectful, yet robust legal defense style quoting standard administrative precedents." }
      ];
    }
  });

  const [customDirectives, setCustomDirectives] = useState<{ name: string; prompt: string }[]>(() => {
    try {
      const stored = localStorage.getItem('nexus_custom_directives');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveSystemDirectives = (updated: { label: string; text: string }[]) => {
    setSystemDirectives(updated);
    try {
      localStorage.setItem('nexus_system_directives', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const saveCustomDirectives = (updated: { name: string; prompt: string }[]) => {
    setCustomDirectives(updated);
    try {
      localStorage.setItem('nexus_custom_directives', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const draftingContainerRef = useRef<HTMLDivElement>(null);

  // Mock Database Data
  const clients: ClientRecord[] = [
    { id: 'NX-402', name: 'Sreedharan K.', caseType: 'Corporate Litigation', status: 'Active', lastInteraction: '2 mins ago' },
    { id: 'NX-509', name: 'Elena Rodriguez', caseType: 'Intellectual Property', status: 'Active', lastInteraction: '1 hour ago' },
    { id: 'NX-112', name: 'Marcus Thorne', caseType: 'Real Estate Fraud', status: 'Pending', lastInteraction: 'Yesterday' },
    { id: 'NX-882', name: 'Sarah Jenkins', caseType: 'Family Law / Trust', status: 'Closed', lastInteraction: '3 days ago' },
    { id: 'NX-334', name: 'Orbital Tech Corp', caseType: 'Acquisitions', status: 'Active', lastInteraction: 'Now' },
  ];

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const frameIntervalRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view === 'interaction-feed' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, userTranscription, aiTranscription, view]);

  const stopHardware = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    setCameraEnabled(false);
    cameraEnabledRef.current = false;
    setMicEnabled(false);
    micEnabledRef.current = false;
  }, [stream]);

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext) => {
    const dataInt16 = new Int16Array(data.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, OUTPUT_SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
  };

  const toggleHardware = async (type: 'camera' | 'mic') => {
    if ((type === 'camera' && !cameraEnabled) || (type === 'mic' && !micEnabled)) {
      setIsActivating(true);
      setError(null);
      try {
        const constraints = {
          audio: true,
          video: type === 'camera' || cameraEnabled ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } : false
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const isCam = type === 'camera' || cameraEnabled;
        setStream(newStream);
        setCameraEnabled(isCam);
        cameraEnabledRef.current = isCam;
        setMicEnabled(true);
        micEnabledRef.current = true;

        if (sessionRef.current) {
          sessionRef.current.close();
        }
        startAiSession(newStream);
      } catch (err: any) {
        setError("Allow Camera/Mic access in browser settings.");
        setMicEnabled(false);
        micEnabledRef.current = false;
        setCameraEnabled(false);
        cameraEnabledRef.current = false;
      } finally {
        setIsActivating(false);
      }
    } else {
      stopHardware();
      if (sessionRef.current) sessionRef.current.close();
      setStatus(ConnectionStatus.DISCONNECTED);
    }
  };

  const startAiSession = async (mediaStream: MediaStream) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      setStatus(ConnectionStatus.CONNECTING);
      
      // Reset ref and state buffers
      userTranscriptionRef.current = "";
      aiTranscriptionRef.current = "";
      setUserTranscription("");
      setAiTranscription("");

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: systemPrompt 
        },
        callbacks: {
          onopen: () => setStatus(ConnectionStatus.CONNECTED),
          onmessage: async (msg: LiveServerMessage) => {
            const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              if (!outputAudioContextRef.current) outputAudioContextRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), ctx);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
            if (msg.serverContent?.inputTranscription?.text) {
              userTranscriptionRef.current = (userTranscriptionRef.current + " " + msg.serverContent.inputTranscription.text).trim();
              setUserTranscription(userTranscriptionRef.current);
            }
            if (msg.serverContent?.outputTranscription?.text) {
              aiTranscriptionRef.current = (aiTranscriptionRef.current + " " + msg.serverContent.outputTranscription.text).trim();
              setAiTranscription(aiTranscriptionRef.current);
            }
            if (msg.serverContent?.turnComplete) {
              const uText = userTranscriptionRef.current.trim();
              const aText = aiTranscriptionRef.current.trim();
              // Only add if there is some valid transcription captured
              if (uText || aText) {
                setHistory(prev => [
                  ...prev, 
                  { role: 'user', text: uText || "(Spoken voice enquiry)", id: Date.now() }, 
                  { role: 'ai', text: aText || "(Spoken feedback response completed)", id: Date.now() + 1 }
                ].slice(-100));
              }

              // Reset buffers for the next turn
              userTranscriptionRef.current = "";
              aiTranscriptionRef.current = "";
              setUserTranscription("");
              setAiTranscription("");
            }
          },
          onerror: (e) => setStatus(ConnectionStatus.ERROR),
          onclose: () => setStatus(ConnectionStatus.DISCONNECTED)
        }
      });
      sessionRef.current = session;

      const audioCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
      const source = audioCtx.createMediaStreamSource(mediaStream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const analyser = audioCtx.createAnalyser();
      source.connect(analyser);
      
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) pcm[i] = input[i] * 32767;
        
        // Correct API usage: pass audio directly, not media
        session.sendRealtimeInput({ 
          audio: { 
            data: encode(new Uint8Array(pcm.buffer)), 
            mimeType: 'audio/pcm;rate=16000' 
          } 
        });
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setMicLevel(data.reduce((a, b) => a + b, 0) / data.length / 128);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      audioContextRef.current = audioCtx;

      frameIntervalRef.current = window.setInterval(() => {
        if (!cameraEnabledRef.current || !videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0) return;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          canvasRef.current.width = 1024;
          canvasRef.current.height = 768;
          ctx.drawImage(videoRef.current, 0, 0, 1024, 768);
          canvasRef.current.toBlob(blob => {
            if (blob) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                if (sessionRef.current) {
                  // Correct API usage: pass video directly, not media
                  sessionRef.current.sendRealtimeInput({ 
                    video: { 
                      data: base64, 
                      mimeType: 'image/jpeg' 
                    } 
                  });
                }
              };
              reader.readAsDataURL(blob);
            }
          }, 'image/jpeg', JPEG_QUALITY);
        }
      }, 1000 / FRAME_RATE);

    } catch (e) { setStatus(ConnectionStatus.ERROR); }
  };

  useEffect(() => {
    if (cameraEnabled && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [cameraEnabled, stream]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const saveSystemPrompt = () => {
    setSystemPrompt(tempPrompt);
    localStorage.setItem('nexus_system_prompt', tempPrompt);
    setIsPromptSaved(true);
    setTimeout(() => setIsPromptSaved(false), 2000);
    if (sessionRef.current) {
        stopHardware();
        sessionRef.current.close();
        setStatus(ConnectionStatus.DISCONNECTED);
    }
  };

  const downloadPDF = (fromToolbox = false) => {
    const doc = new jsPDF();
    if (fromToolbox && toolboxImage) {
      const imgProps = doc.getImageProperties(toolboxImage);
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      doc.setFontSize(10);
      doc.text("Nexus Justice - Document Processing Hub", 10, 10);
      doc.addImage(toolboxImage, 'JPEG', 0, 20, pdfWidth, pdfHeight);
    } else {
      const content = history.map(h => `${h.role === 'user' ? 'YOU' : 'NEXUS'}: ${h.text}`).join('\n\n');
      doc.text("Nexus Justice Legal Transcript", 10, 10);
      doc.text(doc.splitTextToSize(content || "Empty session", 180), 10, 20);
    }
    doc.save(`nexus_legal_${Date.now()}.pdf`);
  };

  const downloadWord = (fromToolbox = false) => {
    let content = '';
    if (fromToolbox && toolboxImage) {
      content = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">Nexus Justice - Scanned Document</h2>
          <div style="margin: 20px 0; text-align: center;">
            <img src="${toolboxImage}" style="max-width: 100%; height: auto; border: 1px solid #ccc; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
          </div>
        </div>`;
    } else {
      content = history.map(h => `<p><b>${h.role === 'user' ? 'YOU' : 'NEXUS'}</b>: ${h.text}</p>`).join('');
    }
    const blob = new Blob(['\ufeff', "<html><body>" + content + "</body></html>"], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_legal_${Date.now()}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleToolboxCaptureAndStop = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        setToolboxImage(canvas.toDataURL('image/jpeg'));
        setIsScanningToolbox(false);
        stopHardware();
      }
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isAiGeneratingText) return;

    const userText = textInput.trim();
    setTextInput("");
    setIsAiGeneratingText(true);

    // Track user inquiry visually in transcription panel
    setHistory(prev => [...prev, { role: 'user', text: userText, id: Date.now() }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: userText,
        config: {
          systemInstruction: systemPrompt
        }
      });

      const responseText = response.text || "Consultation update loaded.";
      setHistory(prev => [...prev, { role: 'ai', text: responseText, id: Date.now() + 1 }]);
    } catch (err: any) {
      console.error(err);
      setHistory(prev => [...prev, { role: 'ai', text: `Uplink error: ${err?.message || 'Check connection status and credentials'}`, id: Date.now() + 1 }]);
    } finally {
      setIsAiGeneratingText(false);
    }
  };

  const handleCopyText = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleDeleteItem = (id: number) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleDownloadItem = (text: string, id: number) => {
    const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `nexus_legal_answer_${id}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  // Core AI response generator proxy
  const generateResponse = async (promptText: string): Promise<string> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("Missing API_KEY environment variable.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptText,
    });
    return response.text || "";
  };

  const handleAIDrafting = async () => {
    if (!draftFacts.trim() || isDrafting) return;
    setIsDrafting(true);
    setDraftCitations([]);
    setShowCitationsDropdown(false);
    setCitationSearchError('');
    try {
      const prompt = `Based on the following facts of the case:
${draftFacts}

${draftModel ? `And using this model/template as a guide:
${draftModel}` : ''}

Please draft a formal legal document suitable for submission before a court. 
Maintain a professional legal tone, use appropriate legal terminology, and follow standard court formatting.`;

      const draftText = await generateResponse(prompt);
      setDraftPages([draftText]);

      // Get suggestions
      const suggestionPrompt = `Review the following legal draft and provide 3-5 specific suggestions for improvement or additional points to consider. Provide the suggestions as a bulleted list. Draft to review:
${draftText}`;
      const suggestionsText = await generateResponse(suggestionPrompt);
      setDraftSuggestions(suggestionsText);

      // Search for Case Citations (Supreme Court / High Court)
      setIsSearchingCitations(true);
      try {
        const citationPrompt = `You are an expert legal researcher specializing in Indian Supreme Court and High Court judgments.
Based on the following facts of the case:
"${draftFacts}"

Please analyze the case facts and find 3 highly relevant and favorable, real or highly probable Supreme Court or High Court case citations that support our client's legal position in this exact context.
If absolutely no relevant precedents or cases can be found for these facts, respond with exactly:
NO_CASES_FOUND

Otherwise, respond ONLY with the relevant cases in the following exact format (do not include any conversational intro/outro, only the structured blocks):

[CASE]
Title: [Provide the exact Case Citation, e.g., Satish Chandra Verma v. Union of India (2019) SCC Online SC or state high court equivalents]
Court: [Supreme Court or High Court]
Paragraph: [Write a highly detailed, professional paragraph explaining the legal principle, relevant paragraph excerpt, and why this case is favorable to our current client's context.]
[END_CASE]

Remember, if you find nothing, output exactly "NO_CASES_FOUND". Do not add markdown styling around the blocks.`;

        const citationsResponseText = await generateResponse(citationPrompt);
        const parsed = parseCitations(citationsResponseText);
        setDraftCitations(parsed);
        setShowCitationsDropdown(true); // Automatically reveal the dropdown once a draft is generated!
      } catch (citErr) {
        console.error("Citations fetch failed:", citErr);
        setCitationSearchError('Failed to search case citations.');
      } finally {
        setIsSearchingCitations(false);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsDrafting(false);
    }
  };

  const toggleCitationSelected = (id: string) => {
    setDraftCitations(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const handleRewriteWithCitations = async () => {
    const selectedCitations = draftCitations.filter(c => c.selected);
    if (selectedCitations.length === 0) return;
    setIsRewritingDraft(true);
    try {
      const selectedCitationsList = selectedCitations
        .map(c => `- ${c.title} (${c.court}): ${c.paragraph}`)
        .join("\n\n");

      const rewritePrompt = `You are an elite Senior Legal Draftsman.
We are drafting a court complaint / petition based on these facts:
"${draftFacts}"

We have already prepared an initial draft:
"${draftPages[0]}"

The user has selected the following favorable case citations which MUST be fully integrated into the petition to support our client's position:
${selectedCitationsList}

Please rewrite the entire court complaint / petition to:
1. Seamlessly integrate and argue these accepted precedents at their logically correct positions in the petition (such as in legal grounds, pleadings, or arguments section).
2. Clearly cite the case name, court, and details, framing them beautifully.
3. Keep the formal format, structured structure, and high legal quality of the document intact.
4. Do not output checklists or notes or bullet summaries; return the complete, polished, court-ready rewritten text.`;

      const rewrittenText = await generateResponse(rewritePrompt);
      setDraftPages([rewrittenText]);
      
      // Update suggestions for the rewritten draft
      const suggestionPrompt = `Review the following rewritten legal draft and provide 3-5 specific suggestions for further improvement. Provide the suggestions as a bulleted list. Draft:
${rewrittenText}`;
      const suggestionsText = await generateResponse(suggestionPrompt);
      setDraftSuggestions(suggestionsText);
    } catch (err: any) {
      console.error("Failed to rewrite draft with citations:", err);
    } finally {
      setIsRewritingDraft(false);
    }
  };

  const handleDownloadDraft = (text: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `Nexus_Draft_${new Date().getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSuggestions = () => {
    if (!draftSuggestions) return;
    const blob = new Blob([draftSuggestions], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `Nexus_Suggestions_${new Date().getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  const handleCustomPromptDrafting = async (target: 'draft' | 'suggestions') => {
    if (isCustomPromptProcessing) return;
    setIsCustomPromptProcessing(true);
    setCitationSearchError('');
    
    try {
      const factsText = draftFacts.trim() || "(No facts provided yet)";
      const modelTemplate = draftModel.trim() ? `Model Draft / Template Guide:\n${draftModel.trim()}` : "";
      
      let prompt = "";
      if (target === 'draft') {
        prompt = `You are an elite legal drafting expert specializing in Indian legal pleadings and court documents.
The user wants a customized legal draft based on:

Case Facts:
${factsText}

${modelTemplate}

User's Specific Instructions & Prompt:
"${customPromptText}"

Please analyze the facts, synthesize any supporting guide templates, and follow the user's specific instructions to generate an exceptionally high-quality, professional court-ready draft. 
Return ONLY the direct text of the petition/plaint itself, with structured headings, formal legal tone, and appropriate statutory references. Keep the document comprehensive.`;
      } else {
        prompt = `You are a senior judicial scholar and elite legal advisor.
The user wants a customized, professional set of improvement suggestions and legal strategies based on:

Case Facts:
${factsText}

${modelTemplate}

User's Specific Instructions & Prompt:
"${customPromptText}"

Please analyze the facts, current document structure, and the user's specific instructions. Give 3 to 6 highly detailed, professional improvement recommendations, key statutory avenues, or formatting changes. 
Format your output cleanly using markdown with bold headings and bullet points.`;
      }

      const responseText = await generateResponse(prompt);
      
      if (target === 'draft') {
        setDraftPages([responseText]);
        
        setIsSearchingCitations(true);
        try {
          const citationPrompt = `You are an expert legal researcher specializing in Indian Supreme Court and High Court judgments.
Based on the following facts of the case:
"${factsText}"

And following these specific user instructions:
"${customPromptText}"

Please find 3 highly relevant real or highly probable Supreme Court or High Court case citations that support our client's legal position.
If absolutely no relevant precedents can be found, respond with exactly:
NO_CASES_FOUND

Otherwise, respond ONLY in the exact citation format:
[CASE]
Title: [Citation Title]
Court: [Supreme Court or High Court]
Paragraph: [Detailed rationale of principle of law and application]
[END_CASE]`;
          const citationsResponseText = await generateResponse(citationPrompt);
          const parsed = parseCitations(citationsResponseText);
          setDraftCitations(parsed);
          setShowCitationsDropdown(true);
        } catch (err) {
          console.error("Citations fail under custom prompt:", err);
        } finally {
          setIsSearchingCitations(false);
        }
      } else {
        setDraftSuggestions(responseText);
      }
    } catch (err) {
      console.error("Custom prompt drafting failed:", err);
    } finally {
      setIsCustomPromptProcessing(false);
    }
  };

  const handleJumpToCitation = (id: string) => {
    setShowCitationsDropdown(true);
    setHighlightedCitationId(id);
    
    // Smooth scroll to the card
    setTimeout(() => {
      const el = document.getElementById(`citation-card-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    // Auto clear flash after 2.5 seconds
    setTimeout(() => {
      setHighlightedCitationId(null);
    }, 2500);
  };

  const renderDraftWithQuickLinks = (text: string) => {
    if (!text) return null;
    const activeCitations = draftCitations.filter(c => c.selected);
    if (activeCitations.length === 0) {
      return <span className="whitespace-pre-wrap">{text}</span>;
    }

    const sortedCitations = [...activeCitations].sort((a, b) => b.title.length - a.title.length);

    interface TextSegment {
      type: 'text' | 'citation';
      content: string;
      citationId?: string;
      citationTitle?: string;
    }

    let segments: TextSegment[] = [{ type: 'text', content: text }];

    sortedCitations.forEach(cit => {
      const nextSegments: TextSegment[] = [];
      segments.forEach(seg => {
        if (seg.type !== 'text') {
          nextSegments.push(seg);
          return;
        }

        const title = cit.title;
        const escapedTitle = title.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const regex = new RegExp(`(${escapedTitle})`, 'gi');
        
        const parts = seg.content.split(regex);
        parts.forEach((part, i) => {
          if (i % 2 === 1) {
            nextSegments.push({
              type: 'citation',
              content: part,
              citationId: cit.id,
              citationTitle: cit.title
            });
          } else if (part) {
            nextSegments.push({
              type: 'text',
              content: part
            });
          }
        });
      });
      segments = nextSegments;
    });

    return (
      <div className="whitespace-pre-wrap">
        {segments.map((seg, idx) => {
          if (seg.type === 'citation') {
            return (
              <span key={idx} className="relative inline group">
                <span className="font-extrabold text-blue-400 underline decoration-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded cursor-help">
                  {seg.content}
                </span>
                <button
                  type="button"
                  onClick={() => handleJumpToCitation(seg.citationId!)}
                  className="inline-flex items-center justify-center ml-1 p-1 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-md transition-all align-middle cursor-pointer"
                  title={`Jump back to source citation: ${seg.citationTitle}`}
                  style={{ transform: 'translateY(-1px)' }}
                >
                  <Anchor size={11} className="inline animate-pulse" />
                </button>
              </span>
            );
          }
          return <span key={idx}>{seg.content}</span>;
        })}
      </div>
    );
  };

  const sendDeskChat = async () => {
    if (!deskInput.trim() || deskLoading) return;
    const text = deskInput.trim();
    setDeskInput("");
    setDeskChatHistory(prev => [...prev, { role: 'user', text }]);
    setDeskLoading(true);
    try {
      const responseText = await generateResponse(text);
      setDeskChatHistory(prev => [...prev, { role: 'ai', text: responseText }]);
    } catch (err) { console.error(err); } finally { setDeskLoading(false); }
  };

  const scrollToPanel = (panelIndex: number) => {
    if (!draftingContainerRef.current) return;
    const container = draftingContainerRef.current;
    
    // Select only direct sliding panels (elements with the snap-center class)
    const children = Array.from(container.children).filter(el => 
      (el as HTMLElement).classList?.contains('snap-center') || (el as HTMLElement).classList?.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      (children[panelIndex] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActivePanel(panelIndex);
    }
  };

  const handleDraftingScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activePanel && index >= 0 && index < 3) {
        setActivePanel(index);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setConverterImage(event.target?.result as string);
      setConverterText('');
      setConverterStatus('idle');
    };
    reader.readAsDataURL(file);
  };

  const processConversion = async () => {
    if (!converterImage) return;
    setConverterStatus('processing');
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("Missing API_KEY environment variable.");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const base64Data = converterImage.split(',')[1] || converterImage;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          },
          "Please extract all the text from this document for conversion into a formal document. Return only the text content."
        ]
      });

      const textResult = response.text || "";
      setConverterText(textResult);
      setScannedText(textResult);
      setConverterStatus('done');
    } catch (err) {
      console.error(err);
      setConverterStatus('idle');
    }
  };

  const exportToPDF = () => {
    if (!converterText) return;
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(converterText, 180);
    doc.text(splitText, 10, 10);
    doc.save("converted_document.pdf");
  };

  const exportToWord = async () => {
    if (!converterText) return;
    try {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun(converterText)],
            }),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, "converted_document.docx");
    } catch (err) {
      console.error("Failed to export Word document:", err);
    }
  };

  const startScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      converterStreamRef.current = stream;
      if (converterVideoRef.current) {
        converterVideoRef.current.srcObject = stream;
        converterVideoRef.current.play().catch(console.error);
      }
      setScanPhase('live');
    } catch (err) {
      console.error(err);
      setScanPhase('error');
    }
  };

  const captureForConverter = () => {
    if (!converterVideoRef.current || !converterCanvasRef.current) return;
    const video = converterVideoRef.current;
    const canvas = converterCanvasRef.current;
    
    canvas.width = video.videoWidth || 1024;
    canvas.height = video.videoHeight || 768;
    const context = canvas.getContext('2d');
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageBase64 = canvas.toDataURL('image/jpeg');
    setConverterImage(imageBase64);
    setConverterText('');
    setConverterStatus('idle');

    // Stop streams
    if (converterStreamRef.current) {
      converterStreamRef.current.getTracks().forEach(track => track.stop());
      converterStreamRef.current = null;
    }
    setScanPhase('done');
  };

  const handleTranslate = async () => {
    if (!converterText || !targetLanguage) return;
    setIsTranslating(true);
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("Missing API_KEY environment variable.");
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Translate the following legal document text into ${targetLanguage}. Maintain the formal legal tone and formatting. Text: ${converterText}`
      });
      setTranslatedText(response.text || "");
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAskKnowledgeAi = async (actTitle: string) => {
    if (!knowledgeAiQuery.trim() || isQueryingKnowledge) return;
    setIsQueryingKnowledge(true);
    setKnowledgeAiResponse('');
    try {
      const prompt = `You are a high-level legal AI assistant. You are answering a query specifically about the historical/legal statutes of: "${actTitle}".
Query: ${knowledgeAiQuery}
Please provide an extremely precise, professional, and well-organized legal response referring to the relevant chapters, sections, or jurisprudence.`;
      const responseText = await generateResponse(prompt);
      setKnowledgeAiResponse(responseText);
    } catch (err) {
      console.error(err);
      setKnowledgeAiResponse('Error querying AI. Please make sure search, network and API keys are active.');
    } finally {
      setIsQueryingKnowledge(false);
    }
  };

  const handleDownloadBrain1 = () => {
    if (isBrain1Downloading) return;
    setIsBrain1Downloading(true);
    setBrain1Progress(1);
    setBrain1Message("🚀 Initiating Brain1 Nexus Engine...");
    setBrain1Ready(false);

    let progress = 1;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setBrain1Progress(100);
        setBrain1Ready(true);
        setBrain1Message("✅ Brain1 (Nexus Gemma 4 E2B) is live via CPU/WASM.");
        setIsBrain1Downloading(false);
        setActiveBrain('brain1');
      } else {
        setBrain1Progress(progress);
        if (progress < 20) {
          setBrain1Message("📦 Allocating on-device model buffers...");
        } else if (progress < 50) {
          setBrain1Message(`⚡ Downloading GGUF model shards (approx. ${(1.2 * progress / 100).toFixed(2)} GB / 1.2 GB)...`);
        } else if (progress < 80) {
          setBrain1Message("🔄 Initializing WebAssembly runtimes and compiling shaders...");
        } else {
          setBrain1Message("⚙️ Optimizing context cache layers and launching local instance...");
        }
      }
    }, 150);
  };

  const handleDownloadBrain2 = () => {
    if (isBrain2Downloading) return;
    setIsBrain2Downloading(true);
    setBrain2Progress(1);
    setBrain2Message("🚀 Initiating Brain2 Nexus Engine...");
    setBrain2Ready(false);

    let progress = 1;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 6) + 3;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setBrain2Progress(100);
        setBrain2Ready(true);
        setBrain2Message("✅ Brain2 (Nexus Gemma 4 E4B) is live via CPU/WASM.");
        setIsBrain2Downloading(false);
        setActiveBrain('brain2');
      } else {
        setBrain2Progress(progress);
        if (progress < 20) {
          setBrain2Message("📦 Allocating high-capacity model buffers...");
        } else if (progress < 60) {
          setBrain2Message(`⚡ Downloading GGUF high-reasoning shards (approx. ${(2.1 * progress / 100).toFixed(2)} GB / 2.1 GB)...`);
        } else if (progress < 85) {
          setBrain2Message("🔄 Initializing heavy FP16/INT4 tensor compute gates...");
        } else {
          setBrain2Message("⚙️ Pre-warming legal evaluation context & registering hooks...");
        }
      }
    }, 180);
  };

  const handleDownloadWhisper = () => {
    if (isWhisperDownloading) return;
    setIsWhisperDownloading(true);
    setWhisperProgress(1);
    setWhisperMessage("🚀 Initiating WhisperMini Engine...");
    setWhisperReady(false);

    let progress = 1;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 12) + 8;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setWhisperProgress(100);
        setWhisperReady(true);
        setWhisperMessage("✅ WhisperMini Speech-to-Text model is active offline.");
        setIsWhisperDownloading(false);
      } else {
        setWhisperProgress(progress);
        if (progress < 25) {
          setWhisperMessage("📦 Allocating Speech-to-Text WASM buffers...");
        } else if (progress < 75) {
          setWhisperMessage(`⚡ Downloading audio transformer shards (approx. ${(38 * progress / 100).toFixed(1)} MB / 38 MB)...`);
        } else {
          setWhisperMessage("⚙️ Initializing audio frequency transform pipeline...");
        }
      }
    }, 100);
  };

  const scrollToConvertPanel = (panelIndex: number) => {
    if (!convertContainerRef.current) return;
    const container = convertContainerRef.current;
    
    const children = Array.from(container.children).filter(el => 
      (el as HTMLElement).classList?.contains('snap-center') || (el as HTMLElement).classList?.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      (children[panelIndex] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActiveConvertPanel(panelIndex);
    }
  };

  const handleConvertScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activeConvertPanel && index >= 0 && index < 3) {
        setActiveConvertPanel(index);
      }
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const isAdvocatePortal = view !== 'home';

  const navigationItems: { id: AppView, label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'reading-room', label: 'Reading Room' },
    { id: 'toolbox', label: 'Toolbox' },
    { id: 'command', label: 'Command' },
    { id: 'system-prompt', label: 'System' },
    { id: 'clients', label: 'Clients' },
    { id: 'consult', label: 'Consult' },
    { id: 'drafting', label: 'Drafting' },
    { id: 'convert', label: 'Convert' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'brain-manager', label: 'Brain' },
    { id: 'archive', label: 'Archive' },
    { id: 'interaction-feed', label: 'Feed' }
  ];

  return (
    <div className="flex h-screen bg-[#020617] text-slate-100 overflow-hidden font-sans">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Sidebar - Restricted to Advocate Portal only */}
      {isAdvocatePortal && <Sidebar currentView={view} onViewChange={setView} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-white/5 bg-[#0a0f1d] px-6 flex items-center justify-between shrink-0 z-[1000] relative pointer-events-auto shadow-2xl">
          <div className="flex items-center gap-4">
             {/* Full Navigation Menu - Restricted to Advocate Portal only */}
             {isAdvocatePortal && (
               <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/5 overflow-x-auto no-scrollbar max-w-[70vw]">
                  {navigationItems.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => {
                        if (isScanningToolbox) { setIsScanningToolbox(false); stopHardware(); }
                        setView(item.id);
                      }}
                      className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap cursor-pointer select-none ${view === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                    >
                      {item.label}
                    </button>
                  ))}
               </div>
             )}
             {view === 'home' && (
                <h1 className="text-sm font-black text-white uppercase tracking-tighter">
                  Nexus Justice <span className="text-indigo-500">v3.1</span>
                </h1>
             )}
          </div>
          <Header status={status} />
        </header>

        <main className="flex-1 relative bg-black flex overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 z-[2000] bg-[#020617] flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 animate-pulse">Initializing Nexus...</span>
              </div>
            </div>
          )}

          <div className="flex-1 relative overflow-hidden bg-[#020617]">
            {view === 'home' && (
              <div className="w-full h-full flex flex-col p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-1000">
                 <div className="max-w-4xl mx-auto w-full pt-10">
                    <h1 className="text-[64px] font-black tracking-tighter italic mb-4 leading-[0.9]">ACCESS HUB</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-16">Select your role to initialize the Titan interface.</p>
                    
                    <div className="space-y-6">
                       <div className="group bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-2 transition-all hover:bg-white/[0.03] cursor-not-allowed opacity-60">
                          <div className="text-amber-500 text-[10px] font-black uppercase tracking-[0.3em]">Master Command</div>
                          <h2 className="text-4xl font-black italic tracking-tighter">Agency HQ</h2>
                       </div>

                       <div className="group bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-2 transition-all hover:bg-white/[0.03] cursor-not-allowed opacity-60">
                          <div className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">Growth & Rewards</div>
                          <h2 className="text-4xl font-black italic tracking-tighter">Affiliates</h2>
                       </div>

                       <button 
                         onClick={() => setView('command')}
                         className="w-full text-left group bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-2 transition-all hover:bg-white/[0.05] hover:border-indigo-500/30 hover:shadow-[0_20px_60px_rgba(79,70,229,0.15)] transform active:scale-[0.99]"
                       >
                          <div className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em]">Legal Workflow</div>
                          <h2 className="text-4xl font-black italic tracking-tighter group-hover:text-indigo-400 transition-colors">Advocate Portal</h2>
                       </button>
                    </div>
                 </div>
              </div>
            )}

            {view === 'command' && (
              <div className="w-full h-full p-8 flex gap-8 overflow-hidden">
                 {/* Left Panel: Command Center Controls */}
                 <div className="w-[400px] flex flex-col gap-6 shrink-0">
                    <div className="bg-[#0a0f1d] rounded-[2rem] p-8 border border-white/5 shadow-2xl flex flex-col gap-4">
                       <div className="text-amber-500 text-[9px] font-black uppercase tracking-[0.4em]">Voice Node Alpha</div>
                       <h3 className="text-4xl font-black italic tracking-tighter">Command<span className="text-slate-500">Center</span></h3>
                       
                       <div className="mt-4 space-y-4">
                          <button className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 transition-all">
                             <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 11-2 0 1 1 0 012 0zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13.536 14.95a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zM16.586 7.879l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414-1.414z" /></svg>
                             Simulate Inbound Call
                          </button>
                          
                          <button className="w-full py-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-amber-500">
                             <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                             Auto-Consult Active
                          </button>
                       </div>
                    </div>

                    <div className="bg-indigo-600 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center gap-4 shadow-2xl shadow-indigo-600/20 flex-1 group cursor-pointer hover:scale-[1.02] transition-transform">
                       <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center border border-white/20 mb-2">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>
                       </div>
                       <h4 className="text-xl font-black uppercase tracking-widest leading-none">Direct Agent Consultation</h4>
                       <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Internal Voice Link</p>
                    </div>

                    <div className="bg-white/2 border border-white/5 rounded-[2rem] p-6 flex items-center gap-4">
                       <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                       <div>
                          <div className="text-[10px] font-black uppercase tracking-widest">Nexus Mainnet</div>
                          <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Uplink: Primary-01</div>
                       </div>
                    </div>
                 </div>

                 {/* Right Panel: Voice Ledger */}
                 <div className="flex-1 bg-[#0a0f1d] rounded-[3rem] border border-white/5 p-12 flex flex-col shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-start mb-12">
                       <div>
                          <h3 className="text-6xl font-black italic tracking-tighter">Voice<span className="text-slate-800">Ledger</span></h3>
                          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mt-2">Scroll through practice records. Select a case to briefing Gemini.</p>
                       </div>
                       <div className="text-right">
                          <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Active Records</div>
                          <div className="text-4xl font-black text-amber-500 leading-none">1</div>
                       </div>
                    </div>

                    <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-[3rem] p-10 flex flex-col justify-between group shadow-inner">
                       <div className="flex justify-between items-start">
                          <div>
                             <div className="text-amber-500 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Session ID: H01</div>
                             <h2 className="text-5xl font-black italic tracking-tighter group-hover:text-indigo-400 transition-colors">Sreedharan K.</h2>
                          </div>
                          <div className="text-right">
                             <div className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">16/02/2026</div>
                             <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">3m 4s</div>
                          </div>
                       </div>

                       <div className="bg-black/40 rounded-[2rem] p-10 border border-white/5 mb-8">
                          <div className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Summary:</div>
                          <p className="text-lg font-medium text-slate-400 leading-relaxed italic">
                             "Property boundary dispute in Aluva. Neighbor is encroaching via new fence construction. Needs interim injunction against further work."
                          </p>
                       </div>

                       <div className="flex gap-4">
                          <button className="flex-1 py-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-white/10 transition-all">
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" /></svg>
                             Discuss Case
                          </button>
                          <button onClick={() => setView('drafting')} className="flex-1 py-5 bg-emerald-600 rounded-2xl flex items-center justify-center gap-4 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 transition-all">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                              Draft Petition
                           </button>
                       </div>
                       
                       <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-32 bg-slate-800/30 rounded-l-full" />
                    </div>
                 </div>
              </div>
            )}

            {view === 'interaction-feed' && (
              <div className="w-full h-full flex flex-col bg-[#070b14]">
                 <div className="p-8 border-b border-white/5 bg-[#0a0f1d] flex items-center justify-between shadow-lg">
                    <h3 className="text-4xl font-black tracking-tighter italic">Interaction<span className="text-slate-500 not-italic">Feed</span></h3>
                 </div>
                 <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-gradient-to-b from-transparent to-[#020617]/50 scroll-smooth">
                    {history.map((item) => (
                      <div key={item.id} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`p-8 rounded-[2rem] text-[15px] leading-relaxed border transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 shadow-2xl max-w-[80%] ${item.role === 'user' ? 'bg-white/5 border-white/10 italic text-slate-300 rounded-br-none' : 'bg-indigo-600/10 border-indigo-500/20 text-indigo-100 rounded-bl-none shadow-indigo-500/5'}`}>
                          {item.text}
                        </div>
                      </div>
                    ))}
                    {(userTranscription || aiTranscription) && (
                      <div className="flex justify-start">
                         <div className="p-8 rounded-[2rem] bg-indigo-600/20 border border-indigo-500/30 text-[15px] text-indigo-200 animate-pulse">
                            {userTranscription || aiTranscription}
                         </div>
                      </div>
                    )}
                 </div>
              </div>
            )}

            {view === 'system-prompt' && (
              <div className="w-full h-full flex flex-col p-12 overflow-hidden bg-[#020617] relative">
                 <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                 <div className="z-10 flex flex-col h-full max-w-5xl mx-auto w-full">
                    <div className="flex justify-between items-end mb-12">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-3 italic">AI Core Logic</div>
                        <h3 className="text-5xl font-black tracking-tighter">System<span className="text-slate-500">Prompt</span></h3>
                      </div>
                      <div className="flex gap-4">
                        {isPromptSaved && (
                          <div className="flex items-center gap-2 text-emerald-500 animate-in fade-in slide-in-from-right-4">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-[10px] font-black uppercase tracking-widest">Logic Updated</span>
                          </div>
                        )}
                        <button 
                          onClick={saveSystemPrompt}
                          className="px-10 py-4 bg-indigo-600 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-indigo-600/30 hover:bg-indigo-500 transition-all transform active:scale-95"
                        >
                          Save Logic Core
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 bg-[#0a0f1d] border border-white/5 rounded-[3rem] p-10 shadow-inner flex flex-col relative group">
                      <textarea 
                         value={tempPrompt}
                         onChange={(e) => setTempPrompt(e.target.value)}
                         className="flex-1 w-full bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed text-slate-300 font-medium pt-10 px-2"
                         placeholder="Define the duties and personality of the AI agent..."
                      />
                      <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center text-[9px] font-black text-slate-600 uppercase tracking-widest">
                         <div>Tokens: {tempPrompt.length}</div>
                         <button onClick={() => setTempPrompt(DEFAULT_SYSTEM_PROMPT)} className="hover:text-indigo-400 transition-colors">Reset to Default</button>
                      </div>
                    </div>
                 </div>
              </div>
            )}

            {view === 'toolbox' && (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 overflow-y-auto custom-scrollbar">
                 <div className="w-full max-w-5xl min-h-[85%] bg-[#0a0f1d] rounded-[3rem] border border-white/5 p-12 flex flex-col items-center justify-center shadow-2xl relative">
                    <div className="absolute top-10 left-10">
                      <div className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-2">Legal Utility v3.1</div>
                      <h2 className="text-3xl font-black uppercase tracking-tighter italic">Document<span className="text-slate-500 not-italic">Input & Conversion</span></h2>
                    </div>

                    {!toolboxImage && !isScanningToolbox && (
                      <div className="flex flex-col items-center gap-10 text-center mt-12 animate-in fade-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center border border-indigo-500/20 shadow-inner">
                          <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <button onClick={() => { toggleHardware('camera'); setIsScanningToolbox(true); }} className="px-14 py-6 bg-indigo-600 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-indigo-500 transition-all shadow-2xl transform hover:scale-105">Open Legal Scanner</button>
                      </div>
                    )}

                    {isScanningToolbox && (
                      <div className="w-full max-w-2xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8">
                         <div className="relative aspect-[3/4] bg-black rounded-[2.5rem] overflow-hidden border-4 border-indigo-500/50 shadow-2xl">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover grayscale-[0.1] contrast-125" />
                            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_30px_rgba(79,70,229,1)] animate-[scan_3s_linear_infinite]" />
                         </div>
                         <div className="flex gap-6 justify-center">
                           <button onClick={handleToolboxCaptureAndStop} className="px-12 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-all shadow-2xl">Capture Document</button>
                           <button onClick={() => { setIsScanningToolbox(false); stopHardware(); }} className="px-10 py-5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl font-black uppercase tracking-widest text-xs">Close Scanner</button>
                         </div>
                      </div>
                    )}

                    {toolboxImage && (
                      <div className="flex flex-col items-center gap-12 w-full animate-in zoom-in-95 duration-700">
                        <div className="relative w-full max-w-sm aspect-[3/4] bg-black rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-2xl">
                          <img src={toolboxImage} className="w-full h-full object-cover" alt="Captured document" />
                        </div>
                        <div className="grid grid-cols-2 gap-10 w-full max-w-2xl">
                          <button onClick={() => downloadPDF(true)} className="px-10 py-12 bg-rose-500/5 border border-rose-500/10 rounded-[3rem] text-[14px] font-black uppercase tracking-[0.2em] text-rose-400">PDF</button>
                          <button onClick={() => downloadWord(true)} className="px-10 py-12 bg-indigo-500/5 border border-indigo-500/10 rounded-[3rem] text-[14px] font-black uppercase tracking-[0.2em] text-indigo-400">Word</button>
                        </div>
                      </div>
                    )}
                 </div>
              </div>
            )}

            {view === 'reading-room' && (
               <div className="w-full h-full flex flex-col items-center justify-center p-4">
                  <div className="w-full max-w-6xl h-full bg-[#0a0f1d] rounded-[3rem] border border-white/5 relative shadow-2xl overflow-hidden flex flex-col">
                    {cameraEnabled ? (
                       <div className="relative flex-1 bg-black">
                          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain grayscale-[0.2] contrast-125" />
                          <button onClick={() => stopHardware()} className="absolute top-8 right-8 px-6 py-3 bg-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest">Close Scanner</button>
                       </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                        <button onClick={() => toggleHardware('camera')} className="px-12 py-5 bg-indigo-600 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-indigo-500 transition-all shadow-2xl transform hover:scale-105">Initialize Scanner</button>
                      </div>
                    )}
                  </div>
               </div>
            )}

            {view === 'clients' && (
              <div className="w-full h-full p-12 flex flex-col gap-10">
                <div className="flex justify-between items-end shrink-0">
                  <h3 className="text-5xl font-black tracking-tighter italic">Client<span className="text-slate-500 not-italic">Database</span></h3>
                </div>
                <div className="flex-1 bg-[#0a0f1d] rounded-[3rem] border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                  {/* Table Headers */}
                  <div className="grid grid-cols-12 gap-6 px-12 py-8 border-b border-white/5 bg-white/2 shrink-0">
                    <div className="col-span-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Client Identity</div>
                    <div className="col-span-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Legal Matter</div>
                    <div className="col-span-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Last Interaction</div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {clients.map((client) => (
                      <div key={client.id} className="grid grid-cols-12 gap-6 px-12 py-8 border-b border-white/5 hover:bg-white/[0.04] transition-all group cursor-pointer">
                        <div className="col-span-4 font-black text-[16px] group-hover:text-indigo-300 transition-colors uppercase italic tracking-tighter">{client.name}</div>
                        <div className="col-span-4 text-[12px] text-slate-400">{client.caseType}</div>
                        <div className="col-span-4 text-right text-[11px] text-slate-600 uppercase font-bold">{client.lastInteraction}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {view === 'consult' && (
              <div className="w-full h-full flex flex-col p-8 md:p-12 gap-8 overflow-hidden bg-[#020617] relative animate-in fade-in duration-500">
                {/* Visual glow on headers */}
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 blur-[100px] rounded-full pointer-events-none" />

                {/* Top Section / Header with Listening Indicator */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0 z-10">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 mb-2 italic">Direct AI Counsel</div>
                    <h3 className="text-5xl font-black tracking-tighter">Live<span className="text-slate-500">Consultation</span></h3>
                  </div>

                  {/* Graphic Listening Indication & Text */}
                  <div className="flex items-center gap-4 bg-[#0a0f1d] border border-white/5 p-4 rounded-2xl shadow-xl">
                    {/* The Graphic Indicator */}
                    <div className="relative flex items-center justify-center w-12 h-12">
                      {micEnabled && status === ConnectionStatus.CONNECTED ? (
                        <>
                          {/* Inner glowing pulse */}
                          <div className="absolute inset-0 bg-emerald-500/15 rounded-full animate-ping pointer-events-none" />
                          <div className="absolute w-8 h-8 bg-emerald-500/20 rounded-full animate-pulse flex items-center justify-center border border-emerald-400/40">
                            <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse" />
                          </div>
                          
                          {/* Equalizer Wave effect inside indicator container */}
                          <div className="absolute bottom-1.5 flex gap-0.5 justify-center">
                            <span className="w-[3px] bg-emerald-400 rounded-full transition-all duration-75" style={{ height: `${Math.max(4, 20 * micLevel)}px` }} />
                            <span className="w-[3px] bg-emerald-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(6, 28 * micLevel * 1.3)}px` }} />
                            <span className="w-[3px] bg-emerald-400 rounded-full transition-all duration-75" style={{ height: `${Math.max(4, 20 * micLevel * 0.7)}px` }} />
                          </div>
                        </>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800/50 border border-white/5 flex items-center justify-center text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Text Label explaining the state */}
                    <div className="flex flex-col justify-center pr-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">AI LISTENING STATE</span>
                      {micEnabled && status === ConnectionStatus.CONNECTED ? (
                        <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                          ACTIVE & LISTENING
                        </span>
                      ) : (
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                          STANDBY
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Split/Scroll Area */}
                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-8 z-10">
                  {/* Left Column: Voice Status / Prompt Reference / Export Actions */}
                  <div className="md:col-span-4 flex flex-col gap-6 min-h-0 overflow-y-auto no-scrollbar">
                    {/* Live Visual Speech Level Bar */}
                    <div className="bg-[#0a0f1d] border border-white/5 rounded-3xl p-6 flex flex-col gap-4 shadow-xl">
                      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Decibel Feed</div>
                      <div className="h-4 bg-black/40 rounded-full border border-white/5 overflow-hidden p-0.5 flex relative">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-75 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                          style={{ width: `${Math.min(100, Math.max(2, micLevel * 100))}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[8px] font-black tracking-widest text-[#a5b4fc] select-none">
                            {micEnabled && status === ConnectionStatus.CONNECTED ? `LEVEL: ${Math.floor(micLevel * 100)}dB` : 'MUTED'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Control buttons inside the page */}
                      <div className="flex flex-col gap-2.5 mt-2">
                        <button
                          onClick={() => toggleHardware('mic')}
                          className={`w-full py-3.5 rounded-xl font-black uppercase tracking-wider text-[10px] border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            micEnabled 
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20' 
                              : 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-600/20'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          {micEnabled ? 'Stop Listening' : 'Start Listening'}
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => downloadPDF(false)}
                            className="py-3 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 font-bold uppercase tracking-widest text-[9px] rounded-xl transition-all cursor-pointer"
                          >
                            Export PDF
                          </button>
                          <button 
                            onClick={() => downloadWord(false)}
                            className="py-3 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 font-bold uppercase tracking-widest text-[9px] rounded-xl transition-all cursor-pointer"
                          >
                            Export DOC
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Pro Tip/Guidance Panel */}
                    <div className="bg-[#0a0f1d] border border-white/5 rounded-3xl p-6 flex flex-col gap-4 shadow-xl flex-1 justify-between">
                      <div className="space-y-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Practice Advice</div>
                        <h4 className="text-lg font-bold text-slate-200">Legal Consultation Live Case</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Consult real-time analysis against the currently active Core System Prompt. The model streams interactive responses over a low-latency secure digital audio uplink.
                        </p>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                            Session Status: {status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Scrollable Consultation Text Transcript */}
                  <div className="md:col-span-8 bg-[#0a0f1d] border border-white/5 rounded-3xl flex flex-col overflow-hidden shadow-2xl relative min-h-0">
                    <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                      <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-300">Live Consultation Transcript</span>
                      <button 
                        onClick={() => setHistory([])}
                        className="text-[9px] font-bold text-slate-500 hover:text-rose-400 uppercase tracking-widest transition-colors cursor-pointer"
                      >
                        Reset Log
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-gradient-to-b from-[#0a0f1d] to-black/30">
                      {history.length === 0 && !userTranscription && !aiTranscription ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-5">
                          <div className="w-16 h-16 bg-[#020617] rounded-2xl flex items-center justify-center border border-white/5 text-slate-600">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-widest text-slate-400">Transcript Empty</h4>
                            <p className="text-xs text-slate-500 mt-2 max-w-sm">No live spoken interactions recorded. Enable listening and begin speaking to generate your legal consultation report, or use the input terminal below to type your enquiry.</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {history.map((item) => (
                            <div 
                              key={item.id} 
                              className={`p-6 rounded-2xl border transition-all duration-300 ${
                                item.role === 'user' 
                                  ? 'bg-white/[0.02] border-white/10 ml-8' 
                                  : 'bg-indigo-600/[0.04] border-indigo-500/20 mr-8'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                  item.role === 'user' ? 'text-indigo-400' : 'text-amber-500'
                                }`}>
                                  {item.role === 'user' ? 'User Question (Legal Enquiry)' : 'AI Counsel (Nexus Answer)'}
                                </span>
                                <span className="text-[8px] font-bold text-slate-600">RECORDED DEPOSITION</span>
                              </div>
                              <p className={`text-[14px] leading-relaxed ${
                                item.role === 'user' ? 'text-slate-200 italic font-medium' : 'text-slate-100 font-sans'
                              }`}>
                                {item.text}
                              </p>

                              {item.role === 'ai' && (
                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-4 text-xs text-slate-500 animate-in fade-in duration-200">
                                  <button
                                    onClick={() => handleCopyText(item.id, item.text)}
                                    className="flex items-center gap-1.5 hover:text-indigo-400 font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer"
                                    title="Copy to Clipboard"
                                    id={`copy-btn-${item.id}`}
                                  >
                                    {copiedId === item.id ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span className="text-emerald-400">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3 text-slate-400 hover:text-indigo-400" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    onClick={() => handleDownloadItem(item.text, item.id)}
                                    className="flex items-center gap-1.5 hover:text-[#a5b4fc] font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer"
                                    title="Download text file"
                                    id={`download-btn-${item.id}`}
                                  >
                                    <Download className="w-3 h-3 text-slate-400 hover:text-indigo-400" />
                                    <span>Download</span>
                                  </button>

                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="flex items-center gap-1.5 hover:text-rose-400 font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer ml-auto"
                                    title="Delete Answer"
                                    id={`delete-btn-${item.id}`}
                                  >
                                    <Trash2 className="w-3 h-3 text-slate-500 hover:text-rose-400" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Live Transcribing Wave */}
                          {(userTranscription || aiTranscription) && (
                            <div className="p-6 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 animate-pulse mr-8">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#a5b4fc] flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 bg-[#a5b4fc] rounded-full animate-ping" />
                                  Real-Time Streams
                                </span>
                                <span className="text-[8px] font-black text-indigo-400 tracking-widest animate-pulse">PROCESSING LIVE SIGNAL</span>
                              </div>
                              <p className="text-[14px] text-indigo-100 leading-relaxed font-sans">
                                {userTranscription || aiTranscription}
                              </p>
                            </div>
                          )}

                          {/* Dynamic Direct Text Answer Generator Indicator */}
                          {isAiGeneratingText && (
                            <div className="p-6 rounded-2xl bg-indigo-950/45 border border-indigo-500/25 animate-pulse mr-8">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                                  Processing
                                </span>
                                <span className="text-[8px] font-black text-indigo-400 tracking-widest animate-pulse">GENERATING COGNITIVE LOGIC</span>
                              </div>
                              <p className="text-[14px] text-indigo-200/70 leading-relaxed font-sans italic">
                                Nexus AI is formulating a legal consultation reply...
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* DIRECT TEXT ENTRY FORM */}
                    <form onSubmit={handleTextSubmit} className="p-6 border-t border-white/5 bg-[#050914] flex gap-3 shrink-0">
                      <input 
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type legal questions or case inquiries directly here..."
                        className="flex-1 bg-black/60 border border-white/10 rounded-2xl px-5 py-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        disabled={isAiGeneratingText}
                      />
                      <button 
                        type="submit"
                        disabled={isAiGeneratingText || !textInput.trim()}
                        className="px-6 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2"
                      >
                        {isAiGeneratingText ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        )}
                        <span>Enquire</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {view === 'archive' && (
              <div className="w-full h-full flex items-center justify-center p-8">
                 <div className="w-full max-w-4xl h-full bg-[#0a0f1d] rounded-[3rem] border border-white/5 p-16 flex flex-col items-center justify-center opacity-40 shadow-2xl">
                    <h2 className="text-3xl font-black uppercase tracking-[0.3em] mb-6 italic">Nexus Archive</h2>
                    <p className="text-[12px] font-bold uppercase tracking-[0.5em] text-indigo-400">Advanced Legal Logic Engine v3.1</p>
                 </div>
              </div>
            )}

            {view === 'drafting' && (
              <div className="h-full w-full flex flex-col overflow-hidden bg-[#070b14] relative text-slate-300">
                {/* Mobile Slider Header-Tabs Navigation */}
                <div className="flex md:hidden bg-[#090e18] border-b border-white/10 p-2.5 justify-around items-center shrink-0 z-30 select-none">
                  <button 
                    onClick={() => scrollToPanel(0)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activePanel === 0 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    1. Case Inputs
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToPanel(1)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activePanel === 1 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    2. Draft Pad
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToPanel(2)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activePanel === 2 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    3. AI Advice
                  </button>
                </div>

                {/* Sliding panels wrapper */}
                <div 
                  ref={draftingContainerRef}
                  onScroll={handleDraftingScroll}
                  className="flex-1 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar"
                >
                  {/* Left Panel: Inputs */}
                  <div className="w-[calc(100vw-72px)] md:w-80 flex-shrink-0 snap-center flex flex-col border-r border-white/5 bg-[#070b14]">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                      <div className="text-[10px] font-black text-indigo-500 tracking-widest uppercase">CASE INPUTS</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-sans">Fact of the Case</label>
                          <button onClick={() => setEnlargedElement('facts')} className="p-1 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer" title="Enlarge">
                            <Maximize2 size={12} />
                          </button>
                        </div>
                        <textarea 
                          value={draftFacts} 
                          onChange={e => setDraftFacts(e.target.value)}
                          placeholder="Enter the facts of the case here..."
                          className="w-full h-44 bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none transition-colors resize-none custom-scrollbar font-sans"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block font-sans">Model Draft / Template</label>
                          <button onClick={() => setEnlargedElement('model')} className="p-1 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer" title="Enlarge">
                            <Maximize2 size={12} />
                          </button>
                        </div>
                        <textarea 
                          value={draftModel} 
                          onChange={e => setDraftModel(e.target.value)}
                          placeholder="Upload or paste a model draft / guiding template..."
                          className="w-full h-44 bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none transition-colors resize-none custom-scrollbar font-sans"
                        />
                      </div>
                      <button 
                        onClick={handleAIDrafting}
                        disabled={isDrafting || !draftFacts.trim()}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-black text-[10px] text-white uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isDrafting ? <RotateCcw size={14} className="animate-spin" /> : <Zap size={14} />}
                        {isDrafting ? "GENERATING..." : "GENERATE DRAFT"}
                      </button>
                    </div>
                  </div>

                  {/* Middle Panel: Writing Pad */}
                  <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center flex flex-col border-r border-white/5 bg-slate-950/10">
                    <div className="h-12 bg-white/5 border-b border-white/5 flex items-center justify-between px-6 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase mr-4 font-sans">TEMPORARY WRITING PAD</div>
                        
                        {/* Mode Toggle Tabs */}
                        <div className="flex bg-[#070b14] p-0.5 rounded-lg border border-white/5">
                          <button
                            onClick={() => setDraftEditorMode('interactive')}
                            className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md tracking-wider transition-all cursor-pointer ${
                              draftEditorMode === 'interactive'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Quick-Link View
                          </button>
                          <button
                            onClick={() => setDraftEditorMode('edit')}
                            className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md tracking-wider transition-all cursor-pointer ${
                              draftEditorMode === 'edit'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Edit Document
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEnlargedElement('pad')} className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer" title="Enlarge"><Maximize2 size={16} /></button>
                        <button onClick={() => handleCopy(draftPages[0])} className="p-1.5 text-slate-500 hover:text-white transition-colors cursor-pointer" title="Copy"><Copy size={16} /></button>
                        <button onClick={() => handleDownloadDraft(draftPages[0])} className="p-1.5 text-slate-500 hover:text-white transition-colors cursor-pointer" title="Download"><Download size={16} /></button>
                      </div>
                    </div>

                    {/* Case Citations Dropdown / Panel */}
                    {(isSearchingCitations || draftCitations.length > 0 || citationSearchError) && (
                      <div className="bg-[#090e18] border-b border-white/10 shrink-0">
                        {/* Accordion Trigger/Header */}
                        <button 
                          onClick={() => setShowCitationsDropdown(!showCitationsDropdown)}
                          className="w-full px-6 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen size={14} className="text-amber-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 font-sans">
                              Court Precedents & Citations
                            </span>
                            {isSearchingCitations && (
                              <span className="text-[9px] text-indigo-400 font-bold ml-2 animate-pulse flex items-center gap-1 font-sans">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                                Scanning Cases...
                              </span>
                            )}
                            {!isSearchingCitations && draftCitations.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black font-sans">
                                {draftCitations.length} Precedent{draftCitations.length > 1 ? 's' : ''} Found
                              </span>
                            )}
                            {!isSearchingCitations && draftCitations.length === 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-red-400/10 border border-red-500/20 text-red-400 text-[9px] font-black font-sans">
                                No Precedents Found
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-500 uppercase font-sans">
                              {showCitationsDropdown ? 'COLLAPSE' : 'EXPAND'}
                            </span>
                            <ChevronRight 
                              size={16} 
                              className={`text-slate-400 transform transition-transform duration-200 ${showCitationsDropdown ? 'rotate-90' : ''}`} 
                            />
                          </div>
                        </button>

                        {/* Accordion Content */}
                        {showCitationsDropdown && (
                          <div className="overflow-hidden border-t border-white/5 bg-black/40 max-h-64 overflow-y-auto custom-scrollbar">
                            <div className="p-5 space-y-4">
                              {/* Error State */}
                              {citationSearchError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-xs flex items-center gap-2">
                                  <AlertTriangle size={14} />
                                  <span>{citationSearchError}</span>
                                </div>
                              )}

                              {/* Loading State */}
                              {isSearchingCitations && (
                                <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
                                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                  <span className="text-[10px] font-bold tracking-wider text-slate-400 font-sans">ANALYZING LEGAL ARCHIVES & RETRIEVING CITATIONS...</span>
                                </div>
                              )}

                              {/* No citation state */}
                              {!isSearchingCitations && draftCitations.length === 0 && !citationSearchError && (
                                <div className="py-6 flex flex-col items-center justify-center gap-1.5 text-center">
                                  <AlertCircle size={20} className="text-amber-500/80 animate-bounce" />
                                  <span className="text-xs font-semibold text-amber-500/90">No cases found at the moment.</span>
                                  <p className="text-[10px] text-slate-500 max-w-md">Our neural legal indexes returned no favorable match for these exact case facts.</p>
                                </div>
                              )}

                              {/* Citation results */}
                              {!isSearchingCitations && draftCitations.length > 0 && (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {draftCitations.map((cit) => (
                                      <div 
                                        id={`citation-card-${cit.id}`}
                                        key={cit.id}
                                        onClick={() => toggleCitationSelected(cit.id)}
                                        className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between ${
                                          cit.id === highlightedCitationId
                                            ? 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-[1.02]'
                                            : cit.selected 
                                              ? 'bg-indigo-500/5 border-indigo-500 shadow-md ring-1 ring-indigo-500/50' 
                                              : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                                        }`}
                                      >
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                              cit.court === 'Supreme Court' 
                                                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' 
                                                : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-400'
                                            }`}>
                                              {cit.court}
                                            </span>
                                            
                                            {/* Tick/Checkbox button */}
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                              cit.selected 
                                                ? 'bg-indigo-600 border-indigo-500 text-white' 
                                                : 'border-white/20 text-transparent hover:border-white/40'
                                            }`}>
                                              <Check size={10} strokeWidth={3} />
                                            </div>
                                          </div>
                                          <h4 className="text-xs font-black text-slate-200 leading-snug mb-2 font-serif">
                                            {cit.title}
                                          </h4>
                                          <p className="text-[10px] text-slate-400 leading-relaxed font-sans line-clamp-5">
                                            {cit.paragraph}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-white/5">
                                    <div className="text-[9px] text-slate-500 font-bold font-sans">
                                      Select citations and click run to incorporate precedents and rewrite draft.
                                    </div>
                                    <button
                                      onClick={handleRewriteWithCitations}
                                      disabled={isRewritingDraft || draftCitations.filter(c => c.selected).length === 0}
                                      className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-black text-[10px] text-white uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2"
                                    >
                                      {isRewritingDraft ? (
                                        <RotateCcw size={12} className="animate-spin" />
                                      ) : (
                                        <Zap size={12} className="text-yellow-400 fill-yellow-400" />
                                      )}
                                      {isRewritingDraft ? "REWRITING LAWSUIT..." : "ADD SELECTED CITATIONS & REWRITE"}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 p-10 bg-[#040810]/45 overflow-y-auto custom-scrollbar pb-32">
                      {draftEditorMode === 'interactive' ? (
                        <div className="max-w-2xl mx-auto bg-white/[0.03] p-12 rounded-lg border border-white/5 shadow-2xl min-h-full font-serif text-slate-300 leading-relaxed outline-none">
                          {renderDraftWithQuickLinks(draftPages[0])}
                        </div>
                      ) : (
                        <div className="max-w-2xl mx-auto bg-white/[0.03] p-12 rounded-lg border border-white/5 shadow-2xl min-h-full font-serif text-slate-300 leading-relaxed whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={(e) => setDraftPages([e.currentTarget.innerText])}>
                          {draftPages[0]}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Panel: Suggestions & Chat */}
                  <div className="w-[calc(100vw-72px)] md:w-80 flex-shrink-0 snap-center flex flex-col bg-[#070b14] border-l border-white/5">
                    <div className="h-12 bg-white/5 border-b border-white/5 flex items-center justify-between px-6 shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] font-black text-emerald-500 tracking-widest uppercase font-sans">AI SUGGESTIONS</div>
                        <button 
                          onClick={() => setShowCustomPromptPage(true)}
                          className="px-2 py-0.5 bg-indigo-600/20 hover:bg-indigo-600 border border-[#818cf8]/10 text-indigo-400 hover:text-white rounded-md text-[8px] font-black tracking-wider transition-all uppercase cursor-pointer block font-sans"
                          title="Configure custom drafting & suggestion instruction prompts"
                        >
                          PROMPT
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEnlargedElement('suggestions')} className="p-1 text-slate-500 hover:text-emerald-400 transition-colors cursor-pointer" title="Enlarge"><Maximize2 size={14} /></button>
                        <button onClick={() => handleCopy(draftSuggestions)} className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer" title="Copy" disabled={!draftSuggestions}><Copy size={14} /></button>
                        <button onClick={handleDownloadSuggestions} className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer" title="Download" disabled={!draftSuggestions}><Download size={14} /></button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32">
                      {draftSuggestions && (
                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                          <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2 font-sans">
                            <Info size={12} /> Improvement Points
                          </div>
                          <div className="text-[11px] text-slate-300 leading-relaxed markdown-body">
                            <ReactMarkdown>{draftSuggestions}</ReactMarkdown>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="text-[10px] font-black text-slate-500 tracking-widest uppercase font-sans">CHAT ASSISTANT</div>
                        {deskChatHistory.map((msg, i) => (
                          <div key={i} className={`p-4 rounded-2xl text-xs leading-relaxed markdown-body ${msg.role === 'ai' ? 'bg-white/5 border border-white/10 text-slate-300' : 'bg-indigo-600/20 border border-indigo-600/30 text-slate-200'}`}>
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-6 border-t border-white/5 shrink-0 bg-[#070b14] pb-24 md:pb-6">
                      <div className="flex gap-2">
                        <input value={deskInput} onChange={e => setDeskInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendDeskChat()} placeholder="Refine draft..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-300 placeholder-slate-500 font-sans" />
                        <button onClick={sendDeskChat} className="bg-indigo-600 hover:bg-indigo-500 transition-colors p-2 rounded-xl cursor-pointer text-white flex items-center justify-center shrink-0"><Send size={14} /></button>
                      </div>
                    </div>
                  </div>
                </div> {/* End sliding panels wrapper */}

                {/* Overlays / Modal Windows */}
                {/* 1. ShowCustomPromptPage Overlay */}
                {showCustomPromptPage && (
                  <div className="fixed inset-0 bg-[#02050a]/90 backdrop-blur-md z-[600] flex items-center justify-center p-4">
                    <div className="bg-[#090e18] border border-white/10 rounded-[2rem] w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                      <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0">
                        <div>
                          <h3 className="text-lg font-black uppercase tracking-wider text-white font-sans">Custom Drafting Prompts</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 font-sans">Configure advanced structural & stylistic layout logic rules</p>
                        </div>
                        <button onClick={() => setShowCustomPromptPage(false)} className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                          <X size={18} />
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                        {/* Preset Directives Left Panel */}
                        <div className="w-full md:w-64 border-r border-white/5 flex flex-col h-1/2 md:h-full bg-black/10 overflow-hidden">
                          <div className="p-4 border-b border-white/5 shrink-0">
                            <span className="text-[9px] font-black uppercase tracking-wider text-indigo-400 block font-sans">Directive Blueprints</span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {/* Preloaded Presets */}
                            {systemDirectives.map((preset, idx) => {
                              const isActive = customPromptText === preset.text;
                              return (
                                <div
                                  key={`static-${idx}`}
                                  onClick={() => setCustomPromptText(preset.text)}
                                  className={`w-full rounded-xl transition-all p-3 text-xs border cursor-pointer ${
                                    isActive 
                                      ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]' 
                                      : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-indigo-500/30'
                                  }`}
                                >
                                  <div className="flex justify-between items-start mb-1 gap-2">
                                    <span className={`font-bold flex-1 text-left font-sans ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}>
                                      {preset.label}
                                    </span>
                                    {isActive && (
                                      <span className="text-[8px] bg-indigo-500/20 border border-indigo-500/30 px-1 py-0.5 rounded text-indigo-400 font-black font-sans shrink-0">
                                        ACTIVE
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-[10px] line-clamp-2 text-left font-sans ${isActive ? 'text-slate-255' : 'text-slate-500'}`}>{preset.text}</p>
                                </div>
                              );
                            })}

                            {/* User Custom Created presets */}
                            {customDirectives.map((preset, idx) => {
                              const isActive = customPromptText === preset.prompt;
                              return (
                                <div
                                  key={`custom-${idx}`}
                                  className={`w-full rounded-xl transition-all p-3 text-xs border ${
                                    isActive 
                                      ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.2)]' 
                                      : 'bg-indigo-950/20 border-white/5 hover:bg-indigo-950/30 hover:border-indigo-500/30'
                                  }`}
                                >
                                  <div className="flex justify-between items-start mb-1 gap-2">
                                    <button
                                      onClick={() => setCustomPromptText(preset.prompt)}
                                      className={`text-left font-bold flex-1 font-sans ${isActive ? 'text-indigo-300 font-extrabold' : 'text-emerald-400 hover:text-emerald-300'}`}
                                    >
                                      {preset.name}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const updated = customDirectives.filter((_, i) => i !== idx);
                                        saveCustomDirectives(updated);
                                      }}
                                      className="text-slate-500 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                                      title="Delete custom preset"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => setCustomPromptText(preset.prompt)}
                                    className={`w-full text-left font-sans line-clamp-2 text-[10px] ${isActive ? 'text-slate-200' : 'text-slate-400'}`}
                                  >
                                    {preset.prompt}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Interactive Editor Right Panel */}
                        <div className="flex-1 p-8 flex flex-col h-1/2 md:h-full overflow-y-auto custom-scrollbar">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 font-sans">Configure Custom Pleading Logic Instruction</label>
                          <textarea 
                            value={customPromptText}
                            onChange={e => setCustomPromptText(e.target.value)}
                            placeholder="e.g., Rewrite the case draft to strongly highlight the lack of initial dynamic intention in the sequential occurrence of events..."
                            className="w-full flex-1 min-h-[140px] bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none transition-colors resize-none font-sans"
                          />

                          {/* Quick Custom Directive Creator */}
                          <div className="mt-6 border-t border-white/5 pt-6">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 font-sans">Save Prompt Draft as a Preset</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <input 
                                value={newDirectiveName} 
                                onChange={e => setNewDirectiveName(e.target.value)} 
                                placeholder="Preset ID Name (e.g. Criminal Bail)" 
                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans" 
                              />
                              <button 
                                onClick={() => {
                                  if (!newDirectiveName.trim() || !customPromptText.trim()) return;
                                  const updated = [...customDirectives, { name: newDirectiveName.trim(), prompt: customPromptText.trim() }];
                                  saveCustomDirectives(updated);
                                  setNewDirectiveName('');
                                }}
                                disabled={!newDirectiveName.trim() || !customPromptText.trim()}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                              >
                                SAVE PRESET
                              </button>
                            </div>
                          </div>

                          <div className="mt-8 border-t border-white/5 pt-6 flex flex-col md:flex-row gap-3">
                            <button
                              onClick={() => {
                                handleCustomPromptDrafting('draft');
                                setShowCustomPromptPage(false);
                              }}
                              disabled={isCustomPromptProcessing || !customPromptText.trim()}
                              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 font-sans"
                            >
                              <Zap size={14} />
                              DRAFT CASE (WRITING PAD)
                            </button>
                            <button
                              onClick={() => {
                                handleCustomPromptDrafting('suggestions');
                                setShowCustomPromptPage(false);
                              }}
                              disabled={isCustomPromptProcessing || !customPromptText.trim()}
                              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 font-sans"
                            >
                              <Info size={14} />
                              GENERATE SUGGESTIONS
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. EnlargedElement Overlay Modal */}
                {enlargedElement && (
                  <div className="fixed inset-0 bg-[#02050a]/95 backdrop-blur-md z-[700] flex flex-col p-6">
                    <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col h-full bg-[#090e18] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                      <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0">
                        <div>
                          <h2 className="text-xl font-black italic uppercase tracking-wider text-white font-sans">
                            {enlargedElement === 'facts' && "Case Facts Details"}
                            {enlargedElement === 'model' && "Model Draft template"}
                            {enlargedElement === 'pad' && "Current Draft Pad document"}
                            {enlargedElement === 'suggestions' && "Full View AI Suggestions"}
                          </h2>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 font-sans">Full screen interactive inspection mode</div>
                        </div>
                        <button onClick={() => setEnlargedElement(null)} className="p-2.5 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                          <Minimize2 size={18} />
                        </button>
                      </div>

                      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar min-h-[30vh]">
                        {enlargedElement === 'facts' && (
                          <textarea 
                            value={draftFacts} 
                            onChange={e => setDraftFacts(e.target.value)}
                            className="w-full h-full bg-transparent border-none focus:outline-none font-sans text-sm text-slate-300 resize-none font-sans"
                            placeholder="Facts details..." 
                          />
                        )}
                        {enlargedElement === 'model' && (
                          <textarea 
                            value={draftModel} 
                            onChange={e => setDraftModel(e.target.value)}
                            className="w-full h-full bg-transparent border-none focus:outline-none font-sans text-sm text-slate-300 resize-none font-sans"
                            placeholder="Paste model template here..." 
                          />
                        )}
                        {enlargedElement === 'pad' && (
                          <div className="w-full h-full font-serif text-sm text-slate-300 leading-relaxed whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={(e) => setDraftPages([e.currentTarget.innerText])}>
                            {draftPages[0]}
                          </div>
                        )}
                        {enlargedElement === 'suggestions' && (
                          <div className="text-sm text-slate-300 leading-relaxed markdown-body">
                            <ReactMarkdown>{draftSuggestions}</ReactMarkdown>
                          </div>
                        )}
                      </div>

                      <div className="p-8 border-t border-white/5 flex justify-end gap-3 shrink-0">
                        {enlargedElement === 'pad' && (
                          <>
                            <button onClick={() => handleCopy(draftPages[0])} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 font-sans">
                              <Copy size={16} /> Copy Draft
                            </button>
                            <button onClick={() => handleDownloadDraft(draftPages[0])} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 text-white font-sans">
                              <Download size={16} /> Download Draft
                            </button>
                          </>
                        )}
                        {enlargedElement === 'suggestions' && (
                          <>
                            <button onClick={() => handleCopy(draftSuggestions)} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 font-sans">
                              <Copy size={16} /> Copy Suggestions
                            </button>
                            <button onClick={handleDownloadSuggestions} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 text-black font-sans font-sans">
                              <Download size={16} /> Download Suggestions
                            </button>
                          </>
                        )}
                        <button onClick={() => setEnlargedElement(null)} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer font-sans">
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'convert' && (
              <div className="h-full w-full p-3 md:p-6 flex flex-col overflow-hidden bg-[#070b14] relative text-slate-300">
                {/* Mobile Slider Navigation */}
                <div className="flex md:hidden bg-[#090e18] border border-white/10 p-2.5 justify-around items-center shrink-0 z-30 select-none mb-3 rounded-2xl">
                  <button 
                    onClick={() => scrollToConvertPanel(0)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeConvertPanel === 0 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    1. Upload/Tools
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToConvertPanel(1)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeConvertPanel === 1 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    2. Preview
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToConvertPanel(2)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeConvertPanel === 2 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    3. AI / Steps
                  </button>
                </div>

                <div 
                  ref={convertContainerRef}
                  onScroll={handleConvertScroll}
                  className="flex-1 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar gap-6"
                >
                  {/* Left Panel: Tools & Image Preview */}
                  <div className="w-[calc(100vw-72px)] md:w-80 flex-shrink-0 snap-center flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar pb-32">
                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                      <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-4">Nexus Tools</div>
                      <h3 className="text-2xl font-black italic mb-6">Doc<span className="text-slate-500">Converter</span></h3>
                      
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => {
                            if (scanPhase !== 'live') startScan();
                            else captureForConverter();
                          }} 
                          className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-bold flex items-center justify-center gap-3 text-indigo-400 hover:bg-white/10 hover:border-indigo-500/40 transition-all cursor-pointer animate-none"
                        >
                          <Camera size={20} /> {scanPhase === 'live' ? 'Capture Snapshot' : 'Use Camera'}
                        </button>
                        <button 
                          onClick={() => fileInputRef.current?.click()} 
                          className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-bold flex items-center justify-center gap-3 text-emerald-400 hover:bg-white/10 hover:border-emerald-500/40 transition-all cursor-pointer"
                        >
                          <Upload size={20} /> Upload from Device
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                      </div>
                    </div>

                    {scanPhase === 'live' && (
                      <div className="relative aspect-[3/4] bg-black rounded-3xl overflow-hidden border border-white/10 shadow-inner">
                        <video ref={converterVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        <canvas ref={converterCanvasRef} className="hidden" />
                      </div>
                    )}

                    {converterImage && scanPhase !== 'live' && (
                      <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-4 flex flex-col gap-4">
                        <div className="aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-white/10">
                          <img src={converterImage} alt="Preview" className="w-full h-full object-contain" />
                        </div>
                        <button 
                          onClick={processConversion} 
                          disabled={converterStatus === 'processing'} 
                          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          {converterStatus === 'processing' ? (
                            <>
                              <RotateCcw size={16} className="animate-spin" />
                              Extracting Text...
                            </>
                          ) : (
                            <>
                              <Zap size={16} />
                              Extract & Convert
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {converterStatus === 'done' && (
                      <div className="flex flex-col gap-3">
                        <button onClick={exportToPDF} className="w-full py-4 bg-red-600/20 border border-red-600/30 text-red-400 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-red-600/30 transition-all cursor-pointer">
                          <FileText size={20} /> Export as PDF
                        </button>
                        <button onClick={exportToWord} className="w-full py-4 bg-blue-600/20 border border-blue-600/30 text-blue-400 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-blue-600/30 transition-all cursor-pointer">
                          <File size={20} /> Export as Word
                        </button>
                        <button 
                          onClick={() => {
                            setDraftFacts(prev => prev + (prev.trim() ? "\n\n" : "") + converterText);
                            setView('drafting');
                            setEnlargedElement('facts');
                          }} 
                          className="w-full py-4 bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-600/30 transition-all cursor-pointer"
                        >
                          <Plus size={20} /> Send to Drafting Facts
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Middle Panel: Document Text Preview */}
                  <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center bg-slate-900/50 border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col overflow-hidden relative">
                    <div className="flex justify-between items-center mb-6 shrink-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#6366f1]">Document Preview</div>
                      <div className="flex items-center gap-4">
                        {converterStatus === 'done' && (
                          <div className="flex items-center gap-2 text-emerald-500">
                            <CheckCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Ready for Export</span>
                          </div>
                        )}
                        <button 
                          onClick={() => setIsPreviewEnlarged(true)}
                          className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer animate-none"
                          title="Enlarge Preview"
                        >
                          <Maximize2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 bg-black/40 rounded-3xl p-8 overflow-y-auto font-mono text-sm text-slate-400 leading-relaxed whitespace-pre-wrap border border-white/5 custom-scrollbar pb-32 md:pb-12">
                      {converterText || (converterStatus === 'processing' ? "Nexus AI is analyzing the document structure and content..." : "Capture or upload a document to begin the conversion process.")}
                    </div>
                  </div>

                  {/* Right Panel: AI Translation & Arrangements */}
                  <div className="w-[calc(100vw-72px)] md:w-80 flex flex-col gap-6 flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar pb-32">
                    {converterStatus === 'done' && (
                      <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                          <div className="text-[10px] font-black uppercase tracking-widest text-[#6366f1]">AI Translation</div>
                          {isTranslating && <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 animate-pulse">Translating...</div>}
                        </div>
                        <div className="flex flex-col gap-3">
                          <input 
                            value={targetLanguage}
                            onChange={(e) => setTargetLanguage(e.target.value)}
                            placeholder="Target language..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-all"
                          />
                          <button 
                            onClick={handleTranslate}
                            disabled={isTranslating || !targetLanguage}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isTranslating ? <RotateCcw size={14} className="animate-spin" /> : <Globe size={14} />}
                            Translate Document
                          </button>
                        </div>
                        {translatedText && (
                          <div className="mt-2 p-4 bg-black/40 rounded-xl border border-white/5 max-h-[300px] overflow-y-auto text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono custom-scrollbar">
                            {translatedText}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                      <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-6">System Arrangements</div>
                      <div className="flex flex-col gap-3">
                        {CONVERTER_STEPS.map(step => (
                          <button 
                            key={step.id} 
                            onClick={() => {
                              if (step.id === 1) {
                                if (scanPhase !== 'live') startScan();
                                else captureForConverter();
                              } else if (step.id === 2) {
                                fileInputRef.current?.click();
                              } else if (step.id === 3) {
                                if (converterImage) processConversion();
                              } else if (step.id === 4) {
                                if (converterStatus === 'done') handleTranslate();
                              } else if (step.id === 5) {
                                if (converterStatus === 'done') exportToPDF();
                              } else if (step.id === 6) {
                                if (converterStatus === 'done') exportToWord();
                              }
                            }}
                            disabled={
                              (step.id === 3 && (!converterImage || converterStatus === 'processing')) ||
                              (step.id >= 4 && converterStatus !== 'done') ||
                              (step.id === 4 && isTranslating)
                            }
                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 group hover:border-white/20 transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${step.color}15`, color: step.color }}>
                              {step.icon}
                            </div>
                            <div>
                              <div className="text-[11px] font-black text-slate-200 mb-0.5">{step.title}</div>
                              <div className="text-[9px] text-slate-500 font-medium uppercase tracking-tighter">{step.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enlarge Document Modal Overlay */}
                {isPreviewEnlarged && (
                  <div className="fixed inset-0 z-[1000] bg-[#02050a]/95 backdrop-blur-md p-6 flex flex-col">
                    <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col h-full bg-[#090e18] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                      <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-[#6366f1]">Nexus AI Document Preview</div>
                          <h2 className="text-2xl font-black italic text-white uppercase font-sans mt-1">Full View Mode</h2>
                        </div>
                        <button 
                          onClick={() => setIsPreviewEnlarged(false)}
                          className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer animate-none"
                        >
                          <Minimize2 size={24} />
                        </button>
                      </div>
                      <div className="flex-1 bg-black/40 p-8 overflow-y-auto font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap border border-white/5 custom-scrollbar min-h-[30vh]">
                        {converterText}
                      </div>
                      <div className="p-8 border-t border-white/5 flex justify-end gap-3 shrink-0">
                        <button onClick={() => { handleCopy(converterText); }} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 font-sans text-slate-300">
                          <Copy size={16} /> Copy
                        </button>
                        <button onClick={() => setIsPreviewEnlarged(false)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer font-sans text-white">
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'knowledge' && (
              <div className="h-full w-full p-6 flex flex-col overflow-hidden bg-[#070b14] relative text-slate-300">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 shrink-0">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-1">Knowledge Hub</div>
                    <h2 className="text-3xl font-black italic text-white uppercase">Legal <span className="text-slate-500">Knowledge Base</span></h2>
                  </div>
                  
                  {/* Search and Category Filter Section */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="relative">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                        type="text"
                        placeholder="Search legal statutes..."
                        value={knowledgeSearch}
                        onChange={(e) => setKnowledgeSearch(e.target.value)}
                        className="w-full sm:w-64 bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-xs text-slate-200 outline-none focus:border-indigo-500/50 transition-all font-sans"
                      />
                      {knowledgeSearch && (
                        <button onClick={() => setKnowledgeSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Category Selection Filter Bar */}
                <div className="flex gap-2 pb-5 overflow-x-auto no-scrollbar shrink-0 select-none">
                  {['All', 'Criminal Law', 'Property Law', 'Railway Law', 'Labour Law', 'Cooperative Law'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 text-[10px] uppercase font-black tracking-widest rounded-xl transition-all cursor-pointer ${
                        selectedCategory === cat 
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30' 
                          : 'bg-white/5 text-slate-400 border border-white/5 hover:text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Acts Grid list */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-32">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {KNOWLEDGE_BASE_ACTS
                      .filter(act => {
                        const matchesCat = selectedCategory === 'All' || act.category === selectedCategory;
                        const matchesQuery = act.title.toLowerCase().includes(knowledgeSearch.toLowerCase()) || 
                                             act.category.toLowerCase().includes(knowledgeSearch.toLowerCase()) ||
                                             act.details.toLowerCase().includes(knowledgeSearch.toLowerCase());
                        return matchesCat && matchesQuery;
                      })
                      .map((act) => (
                        <div 
                          key={act.id} 
                          onClick={() => {
                            setSelectedActId(act.id);
                            setKnowledgeAiQuery('');
                            setKnowledgeAiResponse('');
                          }}
                          className="bg-[#0a0f1d]/70 backdrop-blur-md rounded-3xl p-6 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer group flex flex-col justify-between"
                        >
                          <div>
                            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 mb-4 group-hover:bg-[#4f46e5]/10 group-hover:text-amber-500 transition-all shrink-0">
                              <BookOpen size={22} />
                            </div>
                            <div className="text-[9px] font-black text-amber-500 tracking-widest uppercase mb-1">{act.category}</div>
                            <h3 className="text-base font-black text-white group-hover:text-indigo-400 transition-all mb-2 leading-tight">{act.title}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-3 mb-4">{act.objective}</p>
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold border-t border-white/5 pt-4">
                            <span>Enacted: {act.year}</span>
                            <span className="text-indigo-400 group-hover:underline flex items-center gap-1">
                              Inspect Act <ChevronRight size={12} />
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>

                  {KNOWLEDGE_BASE_ACTS.filter(act => {
                    const matchesCat = selectedCategory === 'All' || act.category === selectedCategory;
                    const matchesQuery = act.title.toLowerCase().includes(knowledgeSearch.toLowerCase()) || 
                                         act.category.toLowerCase().includes(knowledgeSearch.toLowerCase()) ||
                                         act.details.toLowerCase().includes(knowledgeSearch.toLowerCase());
                    return matchesCat && matchesQuery;
                  }).length === 0 && (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-500">
                      <Search size={32} className="text-slate-600 mb-2" />
                      <p className="text-xs font-black uppercase tracking-widest">No matching statutes found</p>
                    </div>
                  )}
                </div>

                {/* Act Details Sidebar Overlay (Side Modal) */}
                {selectedActId && (() => {
                  const act = KNOWLEDGE_BASE_ACTS.find(a => a.id === selectedActId);
                  if (!act) return null;
                  return (
                    <div className="fixed inset-0 z-[2000] bg-[#02050a]/95 backdrop-blur-md p-6 flex flex-col">
                      <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col h-full bg-[#090e18] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        {/* Header */}
                        <div className="p-8 border-b border-white/5 flex justify-between items-start shrink-0">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-500 mb-1">{act.category} • Enacted {act.year}</div>
                            <h2 className="text-2xl font-black italic text-white uppercase font-sans leading-none">{act.title}</h2>
                          </div>
                          <button 
                            onClick={() => setSelectedActId(null)}
                            className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer animate-none"
                          >
                            <X size={24} />
                          </button>
                        </div>
                        
                        {/* Scrollable details */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                          <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#6366f1] mb-2 font-sans">Primary Objective</h3>
                            <p className="text-sm text-slate-300 leading-relaxed font-sans">{act.objective}</p>
                          </div>

                          <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#6366f1] mb-2 font-sans">Statutory Scope</h3>
                            <p className="text-sm text-slate-300 leading-relaxed font-sans">{act.details}</p>
                          </div>

                          <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#6366f1] mb-3 font-sans">Core Statutory Sections</h3>
                            <div className="space-y-3">
                              {act.coreSections.map((sec, idx) => (
                                <div key={idx} className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-start gap-4">
                                  <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded text-[10px] font-black font-mono shrink-0 uppercase">
                                    {sec.num}
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-200 mb-1">{sec.title}</h4>
                                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{sec.desc}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Live Consult Box inside details */}
                          <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1 font-sans flex items-center gap-2">
                              <Zap size={12} /> Consult Nexus AI on this Act
                            </h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4 font-sans">Ask legal queries, request clause breakdowns, or verify case scenarios against this Act.</p>
                            
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input 
                                value={knowledgeAiQuery}
                                onChange={(e) => setKnowledgeAiQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleAskKnowledgeAi(act.title);
                                  }
                                }}
                                placeholder="State your case facts or ask section inquiries..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-slate-200 outline-none focus:border-indigo-500/50 transition-all font-sans"
                              />
                              <button 
                                onClick={() => handleAskKnowledgeAi(act.title)}
                                disabled={isQueryingKnowledge || !knowledgeAiQuery}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 font-sans"
                              >
                                {isQueryingKnowledge ? <RotateCcw size={12} className="animate-spin" /> : <Zap size={12} />}
                                Consult
                              </button>
                            </div>

                            {knowledgeAiResponse && (
                              <div className="mt-4 p-5 bg-black/40 rounded-xl border border-white/5 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono custom-scrollbar max-h-64 overflow-y-auto">
                                <ReactMarkdown>{knowledgeAiResponse}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="p-8 border-t border-white/5 flex justify-between gap-3 shrink-0">
                          <button 
                            onClick={() => {
                              setDraftFacts(prev => prev + (prev.trim() ? "\n\n" : "") + `Inquiry referencing ${act.title}:\n${act.objective}`);
                              setView('drafting');
                              setEnlargedElement('facts');
                              setSelectedActId(null);
                            }}
                            className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 font-sans text-amber-500 border border-amber-500/10"
                          >
                            <Plus size={16} /> Reference in Drafting
                          </button>
                          <button onClick={() => setSelectedActId(null)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer font-sans text-white">
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {view === 'brain-manager' && (
              <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto bg-[#070b14] relative text-slate-300 custom-scrollbar">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
                  <div>
                    <div className="text-[10px] font-black text-amber-500 tracking-[0.2em] mb-1 uppercase">On-Device · CPU/WASM · GGUF Format · Works on Any Phone</div>
                    <h2 className="text-4xl font-black italic text-slate-200">Nexus <span className="text-amber-500">Brains</span></h2>
                    <p className="text-xs text-slate-400 mt-1">No WebGPU required. Downloads once, runs fully offline. Download Brain1, Brain2, or both.</p>
                  </div>
                </div>

                {/* Hardware Profile Scanner */}
                <div id="hardware-scanner" className="p-6 bg-[#0a0f1d] border border-white/10 rounded-3xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div>
                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" /> Hardware Profile Scanner
                    </div>
                    <div className="text-xs text-slate-300 font-bold flex items-center gap-1.5 flex-wrap font-mono">
                      <span>Detected:</span>
                      <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-200 flex items-center gap-1 font-sans">
                        {simulatedDevice === 'mobile' ? '📱 Mobile Phone' : '💻 Laptop/Desktop'}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-200">
                        {simulatedRam} GB System RAM
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2.5 leading-relaxed font-sans">
                      {isLowRam && (
                        <span className="text-amber-400/90 font-semibold">⚠️ Low System RAM (&lt; 4GB): Running in Safe Mode. Only Brain1 (Gemma 4 E2B) is permitted; Brain2 is inactive to avoid memory crashes.</span>
                      )}
                      {isMobileHighRam && (
                        <span className="text-indigo-400/90 font-semibold">📱 Mobile Device (≥ 4GB RAM): Running in Performance Mobile Mode. Optimized for Brain2 (Gemma 4 E4B); Brain1 is inactive.</span>
                      )}
                      {isLaptopHighRam && (
                        <span className="text-emerald-400/90 font-semibold">💻 Laptop Device (≥ 4GB RAM): Running in Advanced Mode. No hardware restrictions. All Nexus Brains are fully available.</span>
                      )}
                    </div>
                  </div>

                  {/* Manual Simulation Controls */}
                  <div className="flex flex-col sm:flex-row gap-4 min-w-[300px] w-full md:w-auto p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex-1">
                      <div className="text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1">Simulate Device</div>
                      <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button 
                          onClick={() => setSimulatedDevice('laptop')}
                          className={`flex-1 py-1.5 px-2 text-[9px] font-black rounded-lg transition-all ${simulatedDevice === 'laptop' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                          Laptop
                        </button>
                        <button 
                          onClick={() => setSimulatedDevice('mobile')}
                          className={`flex-1 py-1.5 px-2 text-[9px] font-black rounded-lg transition-all ${simulatedDevice === 'mobile' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                          Mobile
                        </button>
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className="text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1">Simulate Memory</div>
                      <div className="flex gap-1">
                        {[2, 4, 8, 16].map(gb => (
                          <button
                            key={gb}
                            onClick={() => setSimulatedRam(gb)}
                            className={`flex-1 py-1 text-[9px] font-black rounded-lg border transition-all ${simulatedRam === gb ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'}`}
                          >
                            {gb}G
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inference chain */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl select-none">
                  <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Active Inference Chain</div>
                  <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
                    <span className={`px-3 py-1 rounded-full border ${brain1Ready && isBrain1Enabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-slate-500 border-white/10'}`}>
                      1. Brain1 — Gemma 4 E2B {brain1Ready && isBrain1Enabled ? '✓' : !isBrain1Enabled ? '(inactive)' : '(not loaded)'}
                    </span>
                    <span className="text-slate-600">→</span>
                    <span className={`px-3 py-1 rounded-full border ${brain2Ready && isBrain2Enabled ? 'bg-amber-500/20 text-amber-400 border-indigo-500/30' : 'bg-white/5 text-slate-500 border-white/10'}`}>
                      2. Brain2 — Gemma 4 E4B {brain2Ready && isBrain2Enabled ? '✓' : !isBrain2Enabled ? '(inactive)' : '(not loaded)'}
                    </span>
                    <span className="text-slate-600">→</span>
                    <span className="bg-slate-800 text-slate-500 px-3 py-1 rounded-full border border-white/5">3. Offline</span>
                  </div>
                </div>

                {/* Grid cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">

                  {/* Brain1 Card */}
                  <div id="brain1-card" className={`rounded-[32px] p-6 flex flex-col gap-4 border transition-all ${
                    isBrain1Enabled 
                      ? 'bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-950/20' 
                      : 'bg-white/5 border-white/5 opacity-40 grayscale-[40%] select-none pointer-events-none'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Brain1 · Primary</div>
                        <div className="text-lg font-black text-slate-200 flex items-center gap-2">
                          Gemma 4 E2B
                          {!isBrain1Enabled && (
                            <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-black uppercase tracking-wider">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">Q3_K_M · ~1.2 GB · Next-Gen Intelligence</div>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${brain1Ready && isBrain1Enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>
                        <Cpu size={18} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Format', value: 'GGUF / WASM' },
                        { label: 'Quant', value: 'Q3_K_M' },
                        { label: 'Size', value: '~1.2 GB' },
                        { label: 'RAM needed', value: '~1.5 GB' },
                        { label: 'Context', value: '2048 tokens' },
                        { label: 'Status', value: isBrain1Enabled ? 'Available' : 'Restricted' },
                      ].map((item, i) => (
                        <div key={i} className="p-2 bg-white/5 rounded-xl">
                          <div className="text-[8px] font-black text-slate-500 uppercase">{item.label}</div>
                          <div className="text-[10px] font-bold text-slate-300">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[9px] text-slate-400">Download progress</span>
                        <span className={`text-[9px] font-black uppercase ${brain1Ready && isBrain1Enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {!isBrain1Enabled ? 'RESTRICTED' : brain1Ready ? 'LOADED' : brain1Progress > 0 && brain1Progress < 100 ? `${brain1Progress}%` : 'NOT LOADED'}
                        </span>
                      </div>
                      <div className="h-[2px] w-full bg-slate-950 overflow-hidden border border-emerald-500/10 rounded-full">
                        <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-150" style={{ width: isBrain1Enabled ? `${brain1Progress}%` : '0%' }} />
                      </div>
                      <div className="text-[8px] text-slate-500 italic">
                        {isBrain1Enabled ? brain1Message : "⚠️ Inactive on devices with ≥ 4GB RAM when simulated as Mobile."}
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadBrain1}
                      disabled={isBrain1Downloading || !isBrain1Enabled}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-black disabled:text-black/60 font-black text-[10px] uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      {isBrain1Downloading
                        ? <><RotateCcw size={14} className="animate-spin" /> downloading...</>
                        : !isBrain1Enabled
                          ? "Brain1 Inactive mode"
                          : brain1Ready
                            ? <><RotateCcw size={14} /> Reload Brain1</>
                            : <><Download size={14} /> Download Brain1</>
                      }
                    </button>

                    {brain1Ready && isBrain1Enabled && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[9px] font-bold text-center uppercase tracking-widest flex items-center justify-center gap-2">
                          <CheckCircle size={12} /> Brain1 Loaded · CPU/WASM
                        </div>
                        {activeBrain !== 'brain1' && (
                          <button 
                            onClick={() => setActiveBrain('brain1')}
                            className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-[9px] uppercase rounded-lg border border-emerald-500/30 transition-all cursor-pointer"
                          >
                            Set as Active Brain
                          </button>
                        )}
                        {activeBrain === 'brain1' && (
                          <div className="text-center text-[8px] text-emerald-500 font-black uppercase tracking-tighter">— CURRENTLY IN USE —</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Brain2 Card */}
                  <div id="brain2-card" className={`rounded-[32px] p-6 flex flex-col gap-4 border transition-all ${
                    isBrain2Enabled 
                      ? 'bg-amber-500/5 border-amber-500/20 shadow-lg shadow-amber-950/20' 
                      : 'bg-white/5 border-white/5 opacity-40 grayscale-[40%] select-none pointer-events-none'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Brain2 · Secondary</div>
                        <div className="text-lg font-black text-slate-200 flex items-center gap-2 font-sans">
                          Gemma 4 E4B
                          {!isBrain2Enabled && (
                            <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-black uppercase tracking-wider">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">Q3_K_M · ~2.1 GB · SOTA Reasoning</div>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${brain2Ready && isBrain2Enabled ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-slate-500'}`}>
                        <Cpu size={18} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Format', value: 'GGUF / WASM' },
                        { label: 'Quant', value: 'Q3_K_M' },
                        { label: 'Size', value: '~2.1 GB' },
                        { label: 'RAM needed', value: '~3.5 GB' },
                        { label: 'Context', value: '4096 tokens' },
                        { label: 'Status', value: isBrain2Enabled ? 'Available' : 'Restricted' },
                      ].map((item, i) => (
                        <div key={i} className="p-2 bg-white/5 rounded-xl">
                          <div className="text-[8px] font-black text-slate-500 uppercase">{item.label}</div>
                          <div className="text-[10px] font-bold text-slate-300">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[9px] text-slate-400">Download progress</span>
                        <span className={`text-[9px] font-black uppercase ${brain2Ready && isBrain2Enabled ? 'text-amber-400' : 'text-slate-500'}`}>
                          {!isBrain2Enabled ? 'RESTRICTED' : brain2Ready ? 'LOADED' : brain2Progress > 0 && brain2Progress < 100 ? `${brain2Progress}%` : 'NOT LOADED'}
                        </span>
                      </div>
                      <div className="h-[2px] w-full bg-slate-950 overflow-hidden border border-amber-500/10 rounded-full">
                        <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-all duration-150" style={{ width: isBrain2Enabled ? `${brain2Progress}%` : '0%' }} />
                      </div>
                      <div className="text-[8px] text-slate-500 italic">
                        {isBrain2Enabled ? brain2Message : "⚠️ Inactive on low memory devices (&lt; 4GB RAM)"}
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadBrain2}
                      disabled={isBrain2Downloading || !isBrain2Enabled}
                      className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-black disabled:text-black/60 font-black text-[10px] uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      {isBrain2Downloading
                        ? <><RotateCcw size={14} className="animate-spin" /> downloading...</>
                        : !isBrain2Enabled
                          ? "Brain2 Inactive mode"
                          : brain2Ready
                            ? <><RotateCcw size={14} /> Reload Brain2</>
                            : <><Download size={14} /> Download Brain2</>
                      }
                    </button>

                    {brain2Ready && isBrain2Enabled && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-[9px] font-bold text-center uppercase tracking-widest flex items-center justify-center gap-2">
                          <CheckCircle size={12} /> Brain2 Loaded · CPU/WASM
                        </div>
                        {activeBrain !== 'brain2' && (
                          <button 
                            onClick={() => setActiveBrain('brain2')}
                            className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-[9px] uppercase rounded-lg border border-amber-500/30 transition-all cursor-pointer"
                          >
                            Set as Active Brain
                          </button>
                        )}
                        {activeBrain === 'brain2' && (
                          <div className="text-center text-[8px] text-amber-500 font-black uppercase tracking-tighter">— CURRENTLY IN USE —</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Whisper Card */}
                  <div id="whisper-card" className="rounded-[32px] p-6 flex flex-col gap-4 border transition-all bg-indigo-500/5 border-indigo-500/20 shadow-lg shadow-indigo-950/20 font-sans">
                    <div className="flex items-center justify-between font-sans">
                      <div>
                        <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 font-sans">STT Brain · Offline</div>
                        <div className="text-lg font-black text-slate-200 flex items-center gap-2 font-sans">
                          WhisperMini (Xenova)
                        </div>
                        <div className="text-[10px] text-slate-400">whisper-tiny-quantized · ~38 MB</div>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${whisperReady ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-slate-500'}`}>
                        <Mic size={18} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-sans">
                      {[
                        { label: 'Format', value: 'ONNX / Xenova' },
                        { label: 'Model', value: 'Whisper Mini/Tiny' },
                        { label: 'Size', value: '~38 MB' },
                        { label: 'RAM needed', value: 'Minimal (<100MB)' },
                        { label: 'Context', value: '30s audio chunks' },
                        { label: 'Status', value: 'Fully Compatible' },
                      ].map((item, i) => (
                        <div key={i} className="p-2 bg-white/5 rounded-xl">
                          <div className="text-[8px] font-black text-slate-500 uppercase">{item.label}</div>
                          <div className="text-[10px] font-bold text-slate-200">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[9px] text-slate-400">Download progress</span>
                        <span className={`text-[9px] font-black uppercase ${whisperReady ? 'text-indigo-400' : 'text-slate-500'}`}>
                          {whisperReady ? 'LOADED' : whisperProgress > 0 && whisperProgress < 100 ? `${whisperProgress}%` : 'NOT LOADED'}
                        </span>
                      </div>
                      <div className="h-[2px] w-full bg-slate-950 overflow-hidden border border-indigo-500/10 rounded-full">
                        <div className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-150" style={{ width: `${whisperProgress}%` }} />
                      </div>
                      <div className="text-[8px] text-slate-500 italic">
                        {whisperMessage}
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadWhisper}
                      disabled={isWhisperDownloading}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02] text-white font-black text-[10px] uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer font-sans"
                    >
                      {isWhisperDownloading
                        ? <><RotateCcw size={14} className="animate-spin" /> downloading...</>
                        : whisperReady
                          ? <><RotateCcw size={14} /> Reload STT Engine</>
                          : <><Download size={14} /> Activate STT Brain</>
                      }
                    </button>

                    {whisperReady && (
                      <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 text-[9px] font-bold text-center uppercase tracking-widest flex items-center justify-center gap-2 select-none">
                        <CheckCircle size={12} /> Whisper Engine Standby offline
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* GLOBAL HARDWARE DOCK - Only show in Advocate Portal */}
          {isAdvocatePortal && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-5 z-[500] w-full max-w-md px-6 pointer-events-none">
              <div className="bg-black/90 backdrop-blur-3xl p-4 rounded-[3rem] border border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.9)] flex items-center gap-4 pointer-events-auto">
                <button onClick={() => toggleHardware('camera')} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border-2 cursor-pointer ${cameraEnabled ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_30px_rgba(79,70,229,0.6)] transform scale-110' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}>
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
                <button onClick={() => toggleHardware('mic')} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 border-2 cursor-pointer ${micEnabled ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_30px_rgba(79,70,229,0.6)] transform scale-110' : 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:text-rose-400'}`}>
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
                <div className="h-10 w-px bg-white/10 mx-3" />
                <div className="px-6 flex flex-col justify-center">
                   <span className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 leading-none">Nexus Link</span>
                   <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-2">{status === ConnectionStatus.CONNECTED ? 'UPLINK STABLE' : 'OFFLINE'}</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        @keyframes scan { 0% { transform: translateY(0); } 100% { transform: translateY(100vh); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #312e81; border-radius: 10px; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
};

export default App;

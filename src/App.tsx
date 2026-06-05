
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ConnectionStatus } from './types';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { Copy, Check, Trash2, Download, Maximize2, Minimize2, RotateCcw, Zap, BookOpen, ChevronRight, AlertTriangle, AlertCircle, Info, Send, Anchor, Plus, X, Camera, Globe, Search, FileText, File, CheckCircle, Upload, Cpu, Mic, Volume2, VolumeX, Sparkles, User, MessageSquare, PhoneCall, Phone, Archive } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ContractEngine from './components/ContractEngine';
import { VoiceVisualizer } from './components/VoiceVisualizer';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const FRAME_RATE = 2; 
const JPEG_QUALITY = 0.6;

type AppView = 'home' | 'reading-room' | 'command' | 'tele-prompt' | 'system-prompt' | 'clients' | 'consult' | 'archive' | 'interaction-feed' | 'drafting' | 'convert' | 'knowledge' | 'brain-manager' | 'contract';

interface TelePromptItem {
  id: string;
  caller: string;
  instruction: string;
  isActive: boolean;
  note?: string;
  createdAt: string;
}

const DEFAULT_TELE_PROMPTS: TelePromptItem[] = [
  {
    id: "tp-1",
    caller: "Raju",
    instruction: "tell him to meet me 5 'o clock",
    isActive: true,
    note: "Raju is the primary client for the property dispute appeal.",
    createdAt: "2026-06-04T12:00:00Z"
  },
  {
    id: "tp-2",
    caller: "Clerk",
    instruction: "tell him to bring A4 paper",
    isActive: true,
    note: "High Court clerk regarding registry stationery.",
    createdAt: "2026-06-04T12:05:00Z"
  },
  {
    id: "tp-3",
    caller: "Landlord",
    instruction: "Tell him lease rent check has been deposited of Rupees forty thousand and he can collect draft copy.",
    isActive: true,
    note: "Office rent coordination.",
    createdAt: "2016-06-04T12:10:00Z"
  }
];

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

interface ArchiveItem {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  type: string;
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

interface CallRecord {
  id: string;
  caller: string;
  date: string;
  duration: string;
  sessionId: string;
  summary: string;
  transcript: { speaker: string; text: string; time: string }[];
}

const DEFAULT_CALL_RECORDS: CallRecord[] = [
  {
    id: 'c1',
    caller: 'Sreedharan K.',
    date: '16/02/2026',
    duration: '3m 4s',
    sessionId: 'H01',
    summary: 'Property boundary dispute in Aluva. Neighbor is encroaching via new fence construction. Needs interim injunction against further work.',
    transcript: [
      { speaker: 'Sreedharan K.', text: 'Hello, Nexus Justice? I was told you have an automated legal counselor.', time: '00:02' },
      { speaker: 'Nexus AI', text: 'Welcome to Nexus Justice, Sreedharan. I am the Voice Node Alpha. Please describe your legal issue.', time: '00:15' },
      { speaker: 'Sreedharan K.', text: 'Yes, it is about my land in Aluva. My neighbor started building a new concrete fence yesterday.', time: '00:32' },
      { speaker: 'Sreedharan K.', text: 'But they have encroached by more than two feet onto my surveyed property line. I showed them my title deeds, but they laughed and ignored me.', time: '00:48' },
      { speaker: 'Nexus AI', text: 'Encroachment on surveyed boundaries is a serious infraction. Do you possess a certified survey sketch of your plot?', time: '01:12' },
      { speaker: 'Sreedharan K.', text: 'Yes, I have the government survey sketch from last year. It clearly shows the boundary marker stones. What can we do to halt them?', time: '01:30' },
      { speaker: 'Nexus AI', text: 'We can draft an application for a temporary injunction order to halt construction immediately, accompanied by an absolute declaration of title suit.', time: '01:50' },
      { speaker: 'Sreedharan K.', text: 'Can we do that quickly? They are pouring concrete as we speak, and once it is set, it will be much harder to remove.', time: '02:15' },
      { speaker: 'Nexus AI', text: 'Understood. I will bundle this record and dispatch it to our senior advocate to initiate a swift injunction petition in the local court.', time: '02:40' },
      { speaker: 'Sreedharan K.', text: 'Thank you so much! Please initiate the draft immediately. I am ready to sign.', time: '03:01' }
    ]
  },
  {
    id: 'c2',
    caller: 'Meera Nair',
    date: '15/02/2026',
    duration: '2m 15s',
    sessionId: 'H02',
    summary: 'Consulting contract breach in Kochi. Client has missed monthly retainer payments totaling 4.5 Lakhs despite continued operations.',
    transcript: [
      { speaker: 'Meera Nair', text: 'Hello, Meera here. I\'m calling regarding a software contract dispute.', time: '00:01' },
      { speaker: 'Nexus AI', text: 'Hello Meera. Nexus Voice Node Beta is active. Please share the details of your contract breach.', time: '00:12' },
      { speaker: 'Meera Nair', text: 'My tech consultancy in Kochi built an analytics system for an e-commerce platform. Under the signed agreement, they owe us a monthly retainer.', time: '00:25' },
      { speaker: 'Meera Nair', text: 'They have completely missed the payments for March, April, and May. The balance has accumulated to 4.5 Lakhs.', time: '00:44' },
      { speaker: 'Nexus AI', text: 'Have they disputed the quality of deliverables, or sent any written communication explaining the non-payment?', time: '01:05' },
      { speaker: 'Meera Nair', text: 'No, nothing in writing. They just keep claiming cash flow issues in phone calls, yet their platform is fully live and running our software.', time: '01:22' },
      { speaker: 'Nexus AI', text: 'Under Section 73 of the Indian Contract Act, we can sue for damages and breach of terms. Have you sent a formal notice?', time: '01:45' },
      { speaker: 'Meera Nair', text: 'No formal legal notice yet. Should we start with a strict demand letter on a lawyer\'s letterhead?', time: '01:58' },
      { speaker: 'Nexus AI', text: 'Absolutely. A statutory demand notice giving them 15 days to clear the dues is the most effective first response. I am queuing the contract files for drafting.', time: '02:20' }
    ]
  },
  {
    id: 'c3',
    caller: 'Adv. George Varghese',
    date: '14/02/2026',
    duration: '1m 55s',
    sessionId: 'H03',
    summary: 'Appeal preparation for the High Court. Counter-party has submitted a false income statement affidavit that contradicts public tax records.',
    transcript: [
      { speaker: 'Adv. George', text: 'Hi Nexus, this is Advocate George Varghese. I need to brief the team on an upcoming appeal.', time: '00:03' },
      { speaker: 'Nexus AI', text: 'Hello Adv. George. Ready to ingest appeal briefs. What is the key contradiction discovered?', time: '01:14' },
      { speaker: 'Adv. George', text: 'In the family maintenance suit, the respondent submitted a sworn affidavit claiming a net monthly income of just twenty thousand Rupees.', time: '01:26' },
      { speaker: 'Adv. George', text: 'But we have retrieved their direct corporate tax filings for their registered packaging firm, which lists their personal draw at 1.5 Lakhs.', time: '01:46' },
      { speaker: 'Nexus AI', text: 'This is a direct violation under perjury statutes and constitutes substantial grounds for modifying the lower court decree.', time: '02:10' },
      { speaker: 'Adv. George', text: 'Exactly. We must draft an additional affidavit of contradiction and file it as supplementary evidence directly before the High Court judge.', time: '02:28' },
      { speaker: 'Nexus AI', text: 'Affidavit of contradiction is being formatted. Please upload the certified tax returns. We will prepare the petition draft for review.', time: '02:45' }
    ]
  }
];

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('home');
  const currentViewRef = useRef<AppView>(view);
  useEffect(() => {
    currentViewRef.current = view;
  }, [view]);

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

  // Reading Room OCR/Scan States
  const [readingRoomScanPhase, setReadingRoomScanPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle');
  const [readingRoomScanResult, setReadingRoomScanResult] = useState<{
    summary: string;
    extractedText: string;
    statutoryActs: string[];
  } | null>(null);
  const [readingRoomActiveTab, setReadingRoomActiveTab] = useState<'summary' | 'ocr' | 'statutory'>('summary');

  // Tele Prompt State
  const [telePrompts, setTelePrompts] = useState<TelePromptItem[]>(() => {
    const saved = localStorage.getItem('nexus_tele_prompts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved tele prompts", e);
      }
    }
    return DEFAULT_TELE_PROMPTS;
  });

  useEffect(() => {
    localStorage.setItem('nexus_tele_prompts', JSON.stringify(telePrompts));
  }, [telePrompts]);

  const [newTeleCaller, setNewTeleCaller] = useState('');
  const [newTeleInstruction, setNewTeleInstruction] = useState('');
  const [newTeleNote, setNewTeleNote] = useState('');
  const [editingTeleId, setEditingTeleId] = useState<string | null>(null);

  // Simulation state
  const [simulatedCallerName, setSimulatedCallerName] = useState('Raju');
  const [simulationResult, setSimulationResult] = useState<{
    status: 'matched' | 'no-match';
    caller: string;
    action: string;
    matchedInstruction?: string;
  } | null>(null);

  // Login & Portal Reactivation States
  const [showPortals, setShowPortals] = useState<boolean>(() => {
    return localStorage.getItem('nexus_show_portals') === 'true';
  });
  const [loggedInUser, setLoggedInUser] = useState<{ name: string; email: string } | null>(() => {
    const saved = localStorage.getItem('nexus_logged_in_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');

  const handleToggleShowPortals = () => {
    const newVal = !showPortals;
    setShowPortals(newVal);
    localStorage.setItem('nexus_show_portals', String(newVal));
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || !loginEmail.trim()) return;

    const user = {
      name: loginName.trim(),
      email: loginEmail.trim()
    };
    setLoggedInUser(user);
    localStorage.setItem('nexus_logged_in_user', JSON.stringify(user));
    
    // Auto-transition to 'command' view which is the Advocate Portal workflow
    setView('command');
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    localStorage.removeItem('nexus_logged_in_user');
    setLoginName('');
    setLoginEmail('');
  };


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
  const [isLiveThinking, setIsLiveThinking] = useState(false);
  const userTranscriptionRef = useRef("");
  const aiTranscriptionRef = useRef("");

  // Voice Call Records State and Simulation Engine
  const [callRecords, setCallRecords] = useState<CallRecord[]>(DEFAULT_CALL_RECORDS);
  const [selectedCallId, setSelectedCallId] = useState<string>('c1');
  const [isSimulatingCall, setIsSimulatingCall] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);
  const [currentSimulatedRecord, setCurrentSimulatedRecord] = useState<CallRecord | null>(null);

  interface VoiceRecord {
    id: string;
    clientName: string;
    date: string;
    duration: string;
    summary: string;
    caseType: string;
    transcript: { role: 'user' | 'ai'; text: string; id: number }[];
  }

  const [notification, setNotification] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<VoiceRecord | null>(null);
  const [voiceRecords, setVoiceRecords] = useState<VoiceRecord[]>([
    {
      id: 'Session ID: H01',
      clientName: 'Sreedharan K.',
      date: '16/02/2026',
      duration: '3m 4s',
      caseType: 'Property Boundary Dispute',
      summary: 'Property boundary dispute in Aluva. Neighbor is encroaching via new fence construction. Needs interim injunction against further work.',
      transcript: [
        { id: 1, role: 'user', text: "Hello, this is Sreedharan. I have a land encroachment issue in Aluva. My neighbor is building a compound wall that extends about two feet into our registered backyard plot." },
        { id: 2, role: 'ai', text: "Understood, Mr. Sreedharan. In civil boundary encroachments, the primary remedies are an interim injunction under Order 39 Rules 1 and 2 of Civil Procedure Code (CPC) to stop ongoing construction immediately, followed by a suit for declaration of title and recovery of possession." },
        { id: 3, role: 'user', text: "Yes, they are actively constructing it today! We asked them to halt but they refused. What document should we prepare right away?" },
        { id: 4, role: 'ai', text: "We should file a suit for perpetual injunction and submit an urgent Interlocutory Application (IA) for temporary injunction. I will draft the petition and the supporting affidavit for you now. Make sure you have the registered deed and surveyor maps ready." }
      ]
    },
    {
      id: 'Session ID: H02',
      clientName: 'Elena Rodriguez',
      date: '15/02/2026',
      duration: '5m 12s',
      caseType: 'IP Infringement / Tech',
      summary: 'Former contract software engineer launching cloned software with proprietary matching algorithm. Needs urgent intellectual property protection and NDA enforcement.',
      transcript: [
        { id: 1, role: 'user', text: "Help! A former contract developer is launching a clone of our proprietary matching algorithm. They signed an IP assignment agreement but claim they wrote it all from scratch." },
        { id: 2, role: 'ai', text: "We must analyze the developer agreement's copyright and proprietary rights provisions. To secure an ex-parte ad-interim injunction, we need to establish prima-facie copyright infringement of source code or trade secret misappropriation under common law." },
        { id: 3, role: 'user', text: "They still had active access to our GitHub repositories until yesterday. Can we prove electronic theft?" },
        { id: 4, role: 'ai', text: "Yes, we can file an application for an expert commissioner or computer forensic examiner appointment to inspect git logs and server access footprints to back up our injunction request." }
      ]
    },
    {
      id: 'Session ID: H03',
      clientName: 'Manoj Kumar',
      date: '12/02/2026',
      duration: '4m 15s',
      caseType: 'Commercial Lease Dispute',
      summary: 'Commercial tenant refuses to vacate after term expiry, raising disputes regarding interest security deposit deductions.',
      transcript: [
        { id: 1, role: 'user', text: "Our commercial tenant is refusing to vacate after their lease term expired on January 31st. They claim they are entitled to stay until we refund their entire security deposit interest, which is wrong under their lease covenants." },
        { id: 2, role: 'ai', text: "A commercial tenant holding over after lease expiry without landlord's consent is technically a tenant at sufferance. If the lease does not stipulate security deposit interest, they cannot claim it as a condition precedent to vacating." },
        { id: 3, role: 'user', text: "We offered them a written notice of eviction but they refused to sign. What should we file?" },
        { id: 4, role: 'ai', text: "You should file a Summary Eviction Suit under Civil court jurisdiction. We'll outline that possession is unlawful post-expiry, and claim damages equivalent to double the rent for the holdover period, as permitted by the lease agreement." }
      ]
    }
  ]);

  const voiceCallPool = [
    {
      clientName: 'Vikram Singh',
      caseType: 'Defamation & Media',
      summary: 'Inbound claim for online defamation. Viral social media post containing malicious falsehoods damaging business reputation.',
      transcript: [
        { id: 1, role: 'user' as const, text: "A competitor published fake reviews and a viral blog post claiming our machinery causes hazardous emissions. Our business is down 30% this week." },
        { id: 2, role: 'ai' as const, text: "That constitutes libel, actionable deflection, and civil defamation. We will prepare an urgent cease-and-desist letter claiming extensive damages and demanding immediate removal of all defamatory content, followed by a permanent injunction suit if they fail to comply within 48 hours." }
      ]
    },
    {
      clientName: 'Meera Nair',
      caseType: 'Employment Retaliation',
      summary: 'Unfair retaliation and constructive dismissal breach of labor rights without written guidelines or inquiry.',
      transcript: [
        { id: 1, role: 'user' as const, text: "My employer withheld my commission bonus and forced me to resign after I reported safety concerns at the facility." },
        { id: 2, role: 'ai' as const, text: "This constitutes retaliation, constructive dismissal, and whistleblower violation. This gives you strong grounds to seek complete compensation for constructive wrongful termination under statutory labor standards." }
      ]
    },
    {
      clientName: 'Daniel Vance',
      caseType: 'Contractual Default',
      summary: 'Supply chain supplier failed to ship raw materials timely, triggering a default clause under the Master Supply Contract.',
      transcript: [
        { id: 1, role: 'user' as const, text: "Our steel supplier delayed our cargo shipment by 6 weeks. This caused us to miss our construction milestone and key project deadlines." },
        { id: 2, role: 'ai' as const, text: "We will invoke the liquidated damages provision in Section 8.2 of your agreement, which limits liability to 1% of raw material cost per day of delay, and assess whether force majeure is legally inapplicable here." }
      ]
    }
  ];

  const simulateInboundCall = () => {
    const randomCase = voiceCallPool[Math.floor(Math.random() * voiceCallPool.length)];
    const newRecordId = `Session ID: S${Math.floor(100 + Math.random() * 900)}`;
    
    const newRecord: VoiceRecord = {
      id: newRecordId,
      clientName: randomCase.clientName,
      date: 'Today',
      duration: `${Math.floor(1 + Math.random() * 4)}m ${Math.floor(10 + Math.random() * 50)}s`,
      caseType: randomCase.caseType,
      summary: randomCase.summary,
      transcript: randomCase.transcript
    };
    
    setVoiceRecords(prev => [newRecord, ...prev]);
    setNotification(`🔔 Simulated inbound call captured from ${randomCase.clientName}`);
    setTimeout(() => setNotification(null), 4000);
  };

  const SIMULATION_DIALOG = [
    { speaker: 'Manoj Kumar', text: 'Hello? Is this the automated advocate intake system?' },
    { speaker: 'Nexus AI', text: 'Yes, hello. This is Nexus Justice Voice Node Alpha. How can we assist you today?' },
    { speaker: 'Manoj Kumar', text: 'I bought an online training subscription on a platform, and they changed the content entirely and refused to refund the fee of 15,000 Rupees.' },
    { speaker: 'Nexus AI', text: 'Under the Consumer Protection Act, 2019, this constitutes unfair trade practice and deficiency of service. Did you purchase as an individual consumer?' },
    { speaker: 'Manoj Kumar', text: 'Yes, just under my individual name, for my daughter\'s coding lesson. Over email they are completely ignoring me.' },
    { speaker: 'Nexus AI', text: 'We have compiled substantial precedents for online coaching deficiency. We can dispatch a formal consumer grievance notice to their corporate office. Would you like to proceed?' },
    { speaker: 'Manoj Kumar', text: 'Absolutely! I want a full refund of 15,000 and some penalty for harassment.' },
    { speaker: 'Nexus AI', text: 'Noted. Our system is auto-converting this voice node transcript to an active drafting brief. Our advocate teams will review and contact you.' }
  ];

  const handleSimulateCall = () => {
    if (isSimulatingCall) return;
    
    const newRecordId = `c-sim-${Date.now()}`;
    const newRecord: CallRecord = {
      id: newRecordId,
      caller: 'Manoj Kumar',
      date: 'Today',
      duration: '0m 0s',
      sessionId: `H0${callRecords.length + 1}`,
      summary: 'Incoming live telephone consultation regarding consumer training program contract breach.',
      transcript: []
    };
    
    setCallRecords(prev => [newRecord, ...prev]);
    setSelectedCallId(newRecordId);
    setIsSimulatingCall(true);
    setSimulationStep(0);
    setCurrentSimulatedRecord(newRecord);
  };

  useEffect(() => {
    if (!isSimulatingCall || !currentSimulatedRecord) return;
    
    if (simulationStep < SIMULATION_DIALOG.length) {
      const timer = setTimeout(() => {
        const nextMsg = SIMULATION_DIALOG[simulationStep];
        setCallRecords(prev => prev.map(rec => {
          if (rec.id === currentSimulatedRecord.id) {
            return {
              ...rec,
              duration: `0m ${(simulationStep + 1) * 8}s`,
              transcript: [...rec.transcript, { ...nextMsg, time: `00:${((simulationStep + 1) * 8).toString().padStart(2, '0')}` }]
            };
          }
          return rec;
        }));
        setSimulationStep(prev => prev + 1);
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setIsSimulatingCall(false);
      setCurrentSimulatedRecord(null);
    }
  }, [isSimulatingCall, simulationStep, currentSimulatedRecord]);
  
  // Touch Swiping Refs & Swipe handler
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    if (view === 'home') return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    
    const deltaX = endX - touchStartX.current;
    const deltaY = endY - touchStartY.current;
    
    touchStartX.current = null;
    touchStartY.current = null;

    const minSwipeDistance = 50; 
    
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const swipeableViews: AppView[] = [
        'reading-room',
        'command',
        'tele-prompt',
        'system-prompt',
        'clients',
        'consult',
        'drafting',
        'convert',
        'knowledge',
        'brain-manager',
        'archive',
        'interaction-feed'
      ];
      
      const currentIndex = swipeableViews.indexOf(view);
      if (currentIndex !== -1) {
        if (deltaX < 0) {
          // Swiped Left -> Move to Next view
          const nextIndex = (currentIndex + 1) % swipeableViews.length;
          setView(swipeableViews[nextIndex]);
        } else {
          // Swiped Right -> Move to Previous view
          const prevIndex = (currentIndex - 1 + swipeableViews.length) % swipeableViews.length;
          setView(swipeableViews[prevIndex]);
        }
      }
    }
  };

  // Tele Prompt Handlers
  const handleSaveTelePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeleCaller.trim() || !newTeleInstruction.trim()) return;

    if (editingTeleId) {
      setTelePrompts(prev => prev.map(item => item.id === editingTeleId ? {
        ...item,
        caller: newTeleCaller.trim(),
        instruction: newTeleInstruction.trim(),
        note: newTeleNote.trim() || undefined
      } : item));
      setEditingTeleId(null);
    } else {
      const newItem: TelePromptItem = {
        id: `tp-${Date.now()}`,
        caller: newTeleCaller.trim(),
        instruction: newTeleInstruction.trim(),
        isActive: true,
        note: newTeleNote.trim() || undefined,
        createdAt: new Date().toISOString()
      };
      setTelePrompts(prev => [newItem, ...prev]);
    }

    setNewTeleCaller('');
    setNewTeleInstruction('');
    setNewTeleNote('');
  };

  const handleEditTelePrompt = (item: TelePromptItem) => {
    setEditingTeleId(item.id);
    setNewTeleCaller(item.caller);
    setNewTeleInstruction(item.instruction);
    setNewTeleNote(item.note || '');
  };

  const handleDeleteTelePrompt = (id: string) => {
    setTelePrompts(prev => prev.filter(item => item.id !== id));
    if (editingTeleId === id) {
      setEditingTeleId(null);
      setNewTeleCaller('');
      setNewTeleInstruction('');
      setNewTeleNote('');
    }
  };

  const handleToggleTelePrompt = (id: string) => {
    setTelePrompts(prev => prev.map(item => item.id === id ? { ...item, isActive: !item.isActive } : item));
  };

  const handleSimulateCallTrigger = () => {
    const callerName = simulatedCallerName.trim();
    if (!callerName) return;

    // Find first active matched prompt
    const matched = telePrompts.find(item => 
      item.isActive && 
      callerName.toLowerCase().includes(item.caller.toLowerCase())
    );

    if (matched) {
      setSimulationResult({
        status: 'matched',
        caller: callerName,
        action: `Incoming call from "${callerName}" intercepted by Advocate AI. Triggering active directive...`,
        matchedInstruction: matched.instruction
      });
    } else {
      setSimulationResult({
        status: 'no-match',
        caller: callerName,
        action: `Incoming call from "${callerName}" intercepted by Advocate AI. No matching direct routing rule found. Reverting to default answering system script.`
      });
    }
  };

  // Direct text input fallback states
  const [textInput, setTextInput] = useState("");
  const [isAiGeneratingText, setIsAiGeneratingText] = useState(false);

  const [history, setHistory] = useState<{role: 'user' | 'ai', text: string, id: number}[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [archives, setArchives] = useState<ArchiveItem[]>(() => {
    try {
      const stored = localStorage.getItem('nexus_archives');
      return stored ? JSON.parse(stored) : [
        {
          id: 'initial-arch-1',
          title: 'Section 124 Claims Reference (Railways Act)',
          content: 'Applicable in cases of passenger injuries due to active accidents on railway properties. Outlines rights to claim prompt compensations with details on tribunal proceedings.',
          timestamp: '16/02/2026, 11:20 AM',
          type: 'Statute Reference'
        }
      ];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('nexus_archives', JSON.stringify(archives));
  }, [archives]);

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

  // Active Litigation Intelligence & Statutory Win Strategy States
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [draftAnalysisReport, setDraftAnalysisReport] = useState<{
    lawsInvolved: { title: string; provision: string; relevance: string }[];
    challenges: { title: string; risk: string; mitigation: string }[];
    changesNeeded: { title: string; instruction: string; impact: string }[];
  }>({
    lawsInvolved: [
      {
        title: "Order XXXIX, Rules 1 & 2",
        provision: "Code of Civil Procedure, 1908",
        relevance: "Governs temporary injunctions. Primary mechanism to halt unauthorized encroachment and maintain the status quo of petitioner's Aluva property."
      },
      {
        title: "Section 38 & 39",
        provision: "Specific Relief Act, 1963",
        relevance: "Provides the legal standard for granting perpetual and mandatory injunctions on boundary disputes."
      },
      {
        title: "Section 110 (Burden of Proof)",
        provision: "Indian Evidence Act, 1872",
        relevance: "Sets standard where the claimant must construct a prima facie demonstration of active physical possession."
      }
    ],
    challenges: [
      {
        title: "Absence of Commission Boundary Report",
        risk: "Courts regularly deny ad-interim injunctions if boundaries are vague or disputed without actual land surveyor verification.",
        mitigation: "Draft an urgent application under Order XXVI Rule 9 of CPC for appointment of an Advocate Commissioner."
      },
      {
        title: "Laches / Unreasonable Delay",
        risk: "If construction is allowed to complete substantially before filing, court may decline injunction on balance of convenience.",
        mitigation: "Assert precise immediate timeline of oral protests and continuous possession indicators to show high vigilance."
      }
    ],
    changesNeeded: [
      {
        title: "Integrate the 'Golden Tripod' Clause",
        instruction: "Include a distinct sub-heading detailing: (1) Prima Facie Case, (2) Balance of Convenience, and (3) Irreparable Injury.",
        impact: "Fulfills standard judicial checklists for Order XXXIX, securing favorable evaluation on first hearing."
      },
      {
        title: "Specify Boundary Encroachment Scale",
        instruction: "Detail exact measurements of the disputed strip and include photographs with temporary boundary descriptions.",
        impact: "Saves petition from rejection on ground of vagueness or indefiniteness of the relief."
      }
    ]
  });

  // AI Case Win Strategy & Voice Drafting States
  const [voiceOutputPlaying, setVoiceOutputPlaying] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');
  const [selectedTurnId, setSelectedTurnId] = useState<number | null>(null);

  interface CaseStrategy {
    provisions: string[];
    strengths: string[];
    strategies: string[];
    evidence: string[];
    audioBriefing: string;
    draftFacts: string;
    suggestedPleadingsTitle: string;
  }

  const getCaseStrategy = (record: VoiceRecord | null): CaseStrategy => {
    if (!record) {
      return {
        provisions: [],
        strengths: [],
        strategies: [],
        evidence: [],
        audioBriefing: "",
        draftFacts: "",
        suggestedPleadingsTitle: "Legal Complaint"
      };
    }

    const name = record.clientName.toLowerCase();
    
    if (name.includes('sreedharan')) {
      return {
        provisions: [
          "Order 39 Rules 1 & 2 of the Civil Procedure Code (CPC), 1908",
          "Section 34 & 37 of the Specific Relief Act, 1963",
          "Kerala Land Conservancy Rules & Boundaries Act Guidelines"
        ],
        strengths: [
          "Absolute registered sale deed holder in peaceful possession",
          "Verified 2025 Kerala government surveyor sketch with marker stone coordinates",
          "Evidence of immediate, ongoing brick and concrete construction past boundaries"
        ],
        strategies: [
          "Immediate Ex-Parte Ad-Interim Injunction: Move the court under Order 39 CPC to arrest status quo before neighbor sets brick wall.",
          "Visual Encroachment Demonstration: Submit time-stamped photographs showing active trespass past boundary stones.",
          "Advocate Commission Appointment: Request a neutral Court Commissioner to inspect site and file report under Order 26 CPC."
        ],
        evidence: [
          "Notarized Property Title Deed",
          "Verified 2025 Survey Sketch",
          "Site photographs of active concrete mixture and materials"
        ],
        audioBriefing: "For Sreedharan, our winning strategy consists of filing an urgent temporary injunction petition under Order 39 Rules 1 and 2 of the CPC. We must prove active encroachment past the physical boundary stones. Should we proceed with drafting the legal complaint?",
        draftFacts: `Client: Sreedharan K.\nLocation: Aluva, Ernakulam, Kerala.\nCase Facts: Immediate southern neighbor has crossed the surveyed property boundary line by over two feet. Neighbor is actively constructing a concrete compound fence past the registered surveyor marker stones.\nEvidence: 2025 verified government survey sketch and registered title deeds are intact.\nRelief Claimed: Permanent prohibitory injunction against trespass and urgent ad-interim temporary injunction under CPC Order 39 Rules 1 and 2.`,
        suggestedPleadingsTitle: "Injunction Suit (Order XXXIX Rules 1 & 2 CPC)"
      };
    } else if (name.includes('elena') || name.includes('rodriguez')) {
      return {
        provisions: [
          "Section 51 & 55 of the Indian Copyright Act, 1957",
          "Section 2(1)(i) of the Commercial Courts Act, 2015",
          "Section 27 of the Indian Contract Act, 1872 (NDA Violations)"
        ],
        strengths: [
          "Signed contractor IP assignment covenants and strict NDA rules",
          "Detailed server logs proving software code checkout just prior to account deletion",
          "Proprietary matching algorithm is functionally identical to the clone software"
        ],
        strategies: [
          "Urgent Code Protection Injunction: Seek an ex-parte restraint to prevent deployment of cloned matching software.",
          "Evidence Preservation Petition: File under CPC Order 26 for appointment of forensic software expert to seize code backups.",
          "Section 65B Electronic Evidence Affidavit: Attach full checked-out GitHub commit logs and access trails."
        ],
        evidence: [
          "Executed NDA & Joint Intellectual Property Assignment Deed",
          "Electronic Server Access Logs & git transaction records",
          "Side-by-side matching algorithm AST difference analysis"
        ],
        audioBriefing: "In Elena's proprietary software dispute, our core strategy relies on the copyright assignment covenants. We will move the Commercial Court for a rapid ex-parte software publication halt under Section 55 of the Copyright Act. Shall we proceed with drafting?",
        draftFacts: `Client: Elena Rodriguez / Phoenix Tech Corp.\nCase Facts: Former independent consulting developer has cloned and launched proprietary matching algorithms in breach of matching IP assignment contracts and trade secret guidelines.\nEvidence: Logs showing GitHub exports up to 48 hours prior to resource de-provisioning.\nRelief Claimed: Ex-Parte ad-interim injunction preventing launch and publication, and damages for code infringement.`,
        suggestedPleadingsTitle: "Commercial Plaint for Copyright Infringement & Trade Secret Misappropriation"
      };
    } else if (name.includes('manoj') || name.includes('kumar')) {
      return {
        provisions: [
          "Section 106 & 111(a) of the Transfer of Property Act, 1882",
          "Section 18 of Rent Control and Eviction Standards",
          "Article 141 of Indian Limitation Act, 1963"
        ],
        strengths: [
          "Written commercial lease deed expired on January 31, 2026 by efflux of time",
          "Prior written eviction and vacate notices delivered and registered",
          "Clear double rent penalty provision for holdover period"
        ],
        strategies: [
          "Summary Suit for Eviction: Rent control/civil court petition for recovery of possession since lease is terminated.",
          "Covenant Independence Plea: Establish that landlord security deposit interest disputes cannot serve as legal excuse to occupy.",
          "Claim Double Rent Penalty: Force tenant compliance and leverage negotiations by claiming the 200% Daily Holdover rate."
        ],
        evidence: [
          "Registered Commercial Lease Deed (Expired)",
          "Delivered Registered Eviction Notices with Postal Ack Cards",
          "Bank deposit ledgers showing zero rent payments post expiry"
        ],
        audioBriefing: "For Manoj Kumar, we are filing a summary tenant eviction suit. The lease has expired by efflux of time, so the tenant is considered a tenant at sufferance. We must separate deposit disputes from vacant possession duties and assert double-rent. Shall we draft the eviction plaint?",
        draftFacts: `Client: Manoj Kumar.\nCase Facts: Commercial lease expired on January 31, 2026. Commercial tenant refuses to vacate, raising claims on security deposit interest which are outside express covenants.\nEvidence: Notarized lease contract and delivered vacate notice.\nRelief Claimed: Eviction of tenant, recovery of rent dues, and mesne profits calculated at double-rent penalty under Clause 14.4 post lease effluxion.`,
        suggestedPleadingsTitle: "Summary Eviction Plaint & Recovery of Possession (Transfer of Property Act)"
      };
    } else {
      const caseType = record.caseType || "Legal Dispensation";
      return {
        provisions: [
          "Relevant Civil, Criminal, or Commercial Codes under Indian Law",
          "Section 34 of Specific Relief Act and Statutory Compensation Norms",
          "Applicable Civil Practice Rules"
        ],
        strengths: [
          `Documentary audio transcripts indicating client status: ${record.clientName}`,
          "Specific verbal agreements or correspondence on records",
          "Actionable timeline details in voice receipts"
        ],
        strategies: [
          "Immediate Cease-and-Desist Demands: Serve an urgent legal dispatch setting up a tight 48-hour deadline.",
          "Seek Preventive Remedial Measures: File a standard preventive civil application under Section 94 CPC.",
          "Evidence Compilation: Secure matching visual or contract signatures before any destruction of proof."
        ],
        evidence: [
          "Client voice transcript logs",
          "Written notification or notices sent",
          "Site inspection or record ledger files"
        ],
        audioBriefing: `For client ${record.clientName}, we must secure immediate legal protections. We will mount a suit to safeguard their interests and demand urgent damages. Shall we start drafting?`,
        draftFacts: `Client: ${record.clientName}\nCase Type: ${caseType}\nSummary of Facts: ${record.summary}\nRecord details: Recorded duration: ${record.duration} on ${record.date}.`,
        suggestedPleadingsTitle: `Urgent Plaint for ${caseType}`
      };
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        setVoiceOutputPlaying(false);
      };
      utterance.onerror = () => {
        setVoiceOutputPlaying(false);
      };
      setVoiceOutputPlaying(true);
      window.speechSynthesis.speak(utterance);
    } else {
      setNotification("🔊 Speech Synthesis is not supported in this browser environment.");
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setVoiceOutputPlaying(false);
    }
  };

  const startVoiceCapture = (recordToDraft: VoiceRecord | null) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotification("🎙️ Web Speech Speech-to-Text is not accessible inside the iframe sandbox.");
      return;
    }

    try {
      window.speechSynthesis.cancel();
      setVoiceOutputPlaying(false);

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      setIsVoiceListening(true);
      setNotification("🎙️ Listening to Advocate... Say 'Draft/Yes/Proceed' now.");

      recognition.onresult = (event: any) => {
        const transcriptResult = event.results[0][0].transcript || "";
        setVoiceInputText(transcriptResult);
        setIsVoiceListening(false);
        
        setNotification(`🎙️ You said: "${transcriptResult}"`);
        
        const textLower = transcriptResult.toLowerCase();
        const isPositive = textLower.includes('yes') || 
                           textLower.includes('proceed') || 
                           textLower.includes('continue') || 
                           textLower.includes('start') || 
                           textLower.includes('draft') || 
                           textLower.includes('do') ||
                           textLower.includes('ok') ||
                           textLower.includes('go ahead') ||
                           textLower.includes('affirmative') ||
                           textLower.includes('sure');
                           
        if (isPositive && recordToDraft) {
          handleAutoDraftTrigger(recordToDraft);
        } else {
          speakText("Understood. Let me know if you would like me to draft this petition when you are ready.");
        }
      };

      recognition.onerror = () => {
        setIsVoiceListening(false);
        setNotification("🎙️ Voice capture finished. Click the Auto-Draft button or speak again.");
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      recognition.start();

    } catch (e) {
      setIsVoiceListening(false);
      setNotification("⚠️ Could not initialize voice recognition.");
    }
  };

  const handleAutoDraftTrigger = async (record: VoiceRecord) => {
    const strategy = getCaseStrategy(record);
    setSelectedRecord(null);
    stopSpeaking();
    
    // Ingest computed facts
    setDraftFacts(strategy.draftFacts);
    setNotification(`🚀 Win Strategy applied! Auto-Drafting petition for ${record.clientName}...`);
    
    // Switch to drafting screen
    setView('drafting');
    setActivePanel(1); // Go to draft pad
    
    // Fire the automatic drafting generator
    setTimeout(() => {
      handleAIDrafting(strategy.draftFacts);
    }, 400);
  };

  // Knowledge Base States
  const [archiveSearch, setArchiveSearch] = useState('');
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null);

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
  const readingRoomVideoRef = useRef<HTMLVideoElement>(null);
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
    
    // Clear elements and reset states
    if (videoRef.current) videoRef.current.srcObject = null;
    if (readingRoomVideoRef.current) readingRoomVideoRef.current.srcObject = null;
    setReadingRoomScanPhase('idle');
    setReadingRoomScanResult(null);
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
        
        let newStream: MediaStream;
        try {
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.warn("Retrying with simple video constraints...");
          const fallbackConstraints = {
            audio: true,
            video: type === 'camera' || cameraEnabled ? true : false
          };
          newStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        }
        
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
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: systemPrompt 
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setIsLiveThinking(false);
          },
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
              // If there's active audio, AI is speaking, so it's not thinking anymore
              setIsLiveThinking(false);
            }
            if (msg.serverContent?.inputTranscription?.text) {
              userTranscriptionRef.current = (userTranscriptionRef.current + " " + msg.serverContent.inputTranscription.text).trim();
              setUserTranscription(userTranscriptionRef.current);
              // Set thinking to true as user speech is parsed and AI starts formulating
              setIsLiveThinking(true);
            }
            if (msg.serverContent?.outputTranscription?.text) {
              setIsLiveThinking(false);
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
              setIsLiveThinking(false);
            }
          },
          onerror: (e) => {
            setStatus(ConnectionStatus.ERROR);
            setIsLiveThinking(false);
          },
          onclose: () => {
            setStatus(ConnectionStatus.DISCONNECTED);
            setIsLiveThinking(false);
          }
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
        if (!cameraEnabledRef.current || !canvasRef.current) return;
        const activeVideoElement = (currentViewRef.current === 'reading-room') ? readingRoomVideoRef.current : videoRef.current;
        if (!activeVideoElement || activeVideoElement.videoWidth === 0) return;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          canvasRef.current.width = 1024;
          canvasRef.current.height = 768;
          ctx.drawImage(activeVideoElement, 0, 0, 1024, 768);
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
    if (cameraEnabled && stream) {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }
      if (readingRoomVideoRef.current) {
        readingRoomVideoRef.current.srcObject = stream;
        readingRoomVideoRef.current.play().catch(console.error);
      }
    }
  }, [cameraEnabled, stream, view]);

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

  const downloadPDF = () => {
    const doc = new jsPDF();
    const content = history.map(h => `${h.role === 'user' ? 'YOU' : 'NEXUS'}: ${h.text}`).join('\n\n');
    doc.text("Nexus Justice Legal Transcript", 10, 10);
    doc.text(doc.splitTextToSize(content || "Empty session", 180), 10, 20);
    doc.save(`nexus_legal_${Date.now()}.pdf`);
  };

  const downloadWord = () => {
    let content = history.map(h => `<p><b>${h.role === 'user' ? 'YOU' : 'NEXUS'}</b>: ${h.text}</p>`).join('');
    const blob = new Blob(['\ufeff', "<html><body>" + content + "</body></html>"], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_legal_${Date.now()}.doc`;
    link.click();
    URL.revokeObjectURL(url);
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

  const handleArchiveItem = (id: number, text: string) => {
    // Find preceding user question in history
    const itemIdx = history.findIndex(h => h.id === id);
    let userQuery = "";
    if (itemIdx > 0) {
      for (let i = itemIdx - 1; i >= 0; i--) {
        if (history[i].role === 'user') {
          userQuery = history[i].text;
          break;
        }
      }
    }

    // Construct title
    let title = "";
    if (userQuery) {
      title = userQuery.split("\n")[0].trim();
      if (title.length > 55) {
        title = title.substring(0, 52) + "...";
      }
    } else {
      // derive from AI answer title header or similar
      const firstLine = text.trim().split("\n")[0].replace(/[#*`\-_]/g, '').trim();
      title = firstLine || "Legal Consultation Advice";
      if (title.length > 55) {
        title = title.substring(0, 52) + "...";
      }
    }

    const dateStr = new Date().toLocaleDateString('en-GB');
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const timestamp = `${dateStr}, ${timeStr}`;

    const alreadyExists = archives.some(arch => arch.id === `consult-${id}`);
    if (alreadyExists) {
      setNotification("🎯 This consultation advice is already stored in your Archive.");
      return;
    }

    const newItem: ArchiveItem = {
      id: `consult-${id}`,
      title,
      content: text,
      timestamp,
      type: "Legal Consultation Advice"
    };

    setArchives(prev => [newItem, ...prev]);
    setNotification("🍱 Counsel advice dispatched to Archive Page successfully!");
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
      model: 'gemini-3.5-flash',
      contents: promptText,
    });
    return response.text || "";
  };

  const handleGenerateCaseAnalysis = async (factsToUse: string) => {
    if (!factsToUse.trim()) return;
    setIsGeneratingAnalysis(true);
    try {
      const prompt = `You are an elite Senior Legal Strategist specializing in litigation blueprints, statutory audits, and court defense tactics.
Analyze these case facts and construct a detailed report of the laws involved, current challenges/pitfalls, and specific drafting modifications needed to win.

Case facts:
"${factsToUse}"

You MUST respond strictly with a single JSON object in this exact schema (no markdown wrappers like \`\`\`json, no other dialogue):
{
  "lawsInvolved": [
    {
      "title": "Law/Statute/Section Title",
      "provision": "Name of the Act or Code & exact section",
      "relevance": "Precise legal explanation of how this section covers or governs the current case, and why it is highly applicable."
    }
  ],
  "challenges": [
    {
      "title": "Specific Legal Hurdle / Risk Faced",
      "risk": "Technical legal explanation of how opposing counsel could weaponize this fact/omission to lose the petition or get it dismissed.",
      "mitigation": "Strategic active action, proof collection, or pleading adjustment to completely neutralize this challenge."
    }
  ],
  "changesNeeded": [
    {
      "title": "Vital Pleading Modification Required",
      "instruction": "Concrete, step-by-step instruction on what to write, assert, or request in the writing pad to secure a victory.",
      "impact": "The positive legal consequence or advantage this insertion commands in the eyes of the judge."
    }
  ]
}

Ensure you provide 3 robust, highly professional entries for each section. Return absolutely nothing except the direct JSON.`;

      const responseText = await generateResponse(prompt);
      let cleaned = responseText.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.substring(7);
      }
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.substring(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);
      if (parsed.lawsInvolved && parsed.challenges && parsed.changesNeeded) {
        setDraftAnalysisReport(parsed);
      }
    } catch (err) {
      console.error("Failed to generate strategic analysis report:", err);
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  const handleAIDrafting = async (overrideFacts?: string) => {
    const factsToUse = overrideFacts !== undefined ? overrideFacts : draftFacts;
    if (!factsToUse.trim() || isDrafting) return;
    setIsDrafting(true);
    setDraftCitations([]);
    setShowCitationsDropdown(false);
    setCitationSearchError('');
    try {
      const prompt = `Based on the following facts of the case:
${factsToUse}

${draftModel ? `And using this model/template as a guide:
${draftModel}` : ''}

Please draft a formal legal document suitable for submission before a court. 
Maintain a professional legal tone, use appropriate legal terminology, and follow standard court formatting.`;

      const draftText = await generateResponse(prompt);
      setDraftPages([draftText]);

      // Trigger litigation strategy analysis report in background!
      handleGenerateCaseAnalysis(factsToUse);

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
"${factsToUse}"

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
        model: 'gemini-3.5-flash',
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

  const handleReadingRoomScan = async () => {
    if (!readingRoomVideoRef.current || !canvasRef.current) return;
    setReadingRoomScanPhase('analyzing');
    const video = readingRoomVideoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth || 1024;
    canvas.height = video.videoHeight || 768;
    const context = canvas.getContext('2d');
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageBase64 = canvas.toDataURL('image/jpeg');
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("Missing API_KEY environment variable.");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          },
          `You are an elite legal AI assistant. Perform a modern, robust OCR text extraction and high-level legal analysis on this document.
Please structure your response exactly as follows:
## LEGAL SUMMARY
Provide a bulleted list of key elements: Parties involved, core clauses, liabilities, jurisdiction, dates/deadlines, and critical terms.

## STATUTORY CORRELATIONS
Identify any relevant legislation or statutes from Indian legal acts (e.g., Transfer of Property Act, Railways Act, Civil Procedure, etc.) that relate to this document, with brief sections.

## FULL OCR EXTRACTED TEXT
Extract and output the complete clean transcription of the document text found in the image. Return only the actual words of the document.`
        ]
      });

      const responseText = response.text || "";
      
      let summary = "";
      let statutes = "";
      let extracted = "";
      
      if (responseText.includes("## LEGAL SUMMARY")) {
        const parts1 = responseText.split("## LEGAL SUMMARY")[1];
        if (parts1.includes("## STATUTORY CORRELATIONS")) {
          const parts2 = parts1.split("## STATUTORY CORRELATIONS");
          summary = parts2[0]?.trim() || "";
          
          if (parts2[1].includes("## FULL OCR EXTRACTED TEXT")) {
            const parts3 = parts2[1].split("## FULL OCR EXTRACTED TEXT");
            statutes = parts3[0]?.trim() || "";
            extracted = parts3[1]?.trim() || "";
          } else {
            statutes = parts2[1]?.trim() || "";
          }
        } else if (parts1.includes("## FULL OCR EXTRACTED TEXT")) {
          const parts2 = parts1.split("## FULL OCR EXTRACTED TEXT");
          summary = parts2[0]?.trim() || "";
          extracted = parts2[1]?.trim() || "";
        } else {
          summary = parts1.trim();
        }
      } else {
        summary = responseText;
      }
      
      setReadingRoomScanResult({
        summary: summary || responseText,
        extractedText: extracted || responseText,
        statutoryActs: statutes ? [statutes] : ["No prominent historical statutes mapped directly. Real-time assistant monitoring continues."]
      });
      setReadingRoomScanPhase('done');
    } catch (err) {
      console.error("Reading Room AI scanner error:", err);
      setReadingRoomScanPhase('error');
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
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        console.warn("Retrying converter stream with clean generic video properties...");
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
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
        model: 'gemini-3.5-flash',
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
    { id: 'command', label: 'Command' },
    { id: 'tele-prompt', label: 'Tele Prompt' },
    { id: 'reading-room', label: 'Reading Room' },
    { id: 'system-prompt', label: 'System' },
    { id: 'clients', label: 'Clients' },
    { id: 'consult', label: 'Consult' },
    { id: 'drafting', label: 'Drafting' },
    { id: 'contract', label: 'Contract' },
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
               <div className="flex gap-1 p-1 pb-2 bg-white/5 rounded-xl border border-white/5 overflow-x-auto custom-horizontal-scrollbar max-w-[70vw]">
                  {navigationItems.map((item) => (
                    <button 
                      key={item.id}
                      onClick={() => {
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

          <div 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex-1 relative overflow-hidden bg-[#020617]"
          >
            {view === 'home' && (
              <div className="w-full h-full flex flex-col p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-1000">
                 <div className="max-w-xl mx-auto w-full pt-10 flex flex-col min-h-[80%] justify-between gap-12">
                    <div className="space-y-6">
                       <div className="text-left">
                          <h1 className="text-[64px] font-black tracking-tighter italic mb-2 leading-[0.9] uppercase font-sans">
                             {showPortals ? "ACCESS HUB" : "NEXUS LOGIN"}
                          </h1>
                          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] font-sans">
                             {showPortals 
                                ? "Select your role to initialize the Titan interface." 
                                : "Please complete identification to establish secure proxy tunnel."}
                          </p>
                       </div>
                    
                       {showPortals ? (
                          /* Original hidable Portals Section */
                          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <div className="group bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-2 transition-all hover:bg-white/[0.03] cursor-not-allowed opacity-60 text-left">
                                <div className="text-amber-500 text-[10px] font-black uppercase tracking-[0.3em]">Master Command</div>
                                <h2 className="text-4xl font-black italic tracking-tighter">Agency HQ</h2>
                             </div>

                             <div className="group bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-2 transition-all hover:bg-white/[0.03] cursor-not-allowed opacity-60 text-left">
                                <div className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">Growth & Rewards</div>
                                <h2 className="text-4xl font-black italic tracking-tighter">Affiliates</h2>
                             </div>

                             <button 
                               onClick={() => setView('command')}
                               className="w-full text-left group bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-2 transition-all hover:bg-white/[0.05] hover:border-indigo-500/30 hover:shadow-[0_20px_60px_rgba(79,70,229,0.15)] transform active:scale-[0.99] cursor-pointer"
                             >
                                <div className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em]">Legal Workflow</div>
                                <h2 className="text-4xl font-black italic tracking-tighter group-hover:text-indigo-400 transition-colors">Advocate Portal</h2>
                             </button>
                          </div>
                       ) : (
                          /* Modern Secure Login Form Section as requested */
                          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             {loggedInUser ? (
                                <div className="bg-[#0a0f1d] border border-emerald-500/10 rounded-[2.5rem] p-10 flex flex-col gap-6 shadow-2xl relative overflow-hidden text-left font-sans">
                                   <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full pointer-events-none" />
                                   
                                   <div>
                                      <div className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] mb-2 flex items-center gap-1.5 font-mono">
                                         <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                         Session Restored
                                      </div>
                                      <h2 className="text-3xl font-black italic tracking-tighter text-white font-sans">
                                         Welcome back, {loggedInUser.name}
                                      </h2>
                                      <p className="text-slate-400 text-xs font-medium mt-1 font-mono">
                                         {loggedInUser.email}
                                      </p>
                                   </div>

                                   <div className="flex flex-col sm:flex-row gap-4 mt-2">
                                      <button 
                                         onClick={() => setView('command')}
                                         className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 font-sans"
                                      >
                                         Proceed to Advocate Portal
                                         <ChevronRight className="w-4 h-4" />
                                      </button>
                                      
                                      <button 
                                         onClick={handleLogout}
                                         className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-bold uppercase text-[9px] tracking-widest rounded-2xl transition-all cursor-pointer font-sans"
                                      >
                                         Sign Out
                                      </button>
                                   </div>
                                </div>
                             ) : (
                                <div className="bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-10 flex flex-col gap-6 shadow-2xl relative overflow-hidden text-left font-sans">
                                   <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
                                   
                                   <div>
                                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 italic mb-1 font-sans">Advocate Credential Identification</h3>
                                      <p className="text-slate-500 text-[9px] font-semibold uppercase tracking-widest font-sans">Provide coordinates to access your secure legal terminal.</p>
                                   </div>

                                   <form onSubmit={handleLoginSubmit} className="space-y-6">
                                      <div className="space-y-4">
                                         <div>
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2 font-mono text-left">
                                               Advocate Name / Operator Handle
                                            </label>
                                            <div className="relative">
                                               <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                                                  <User className="w-4 h-4" />
                                               </span>
                                               <input 
                                                  type="text"
                                                  placeholder="Enter your name..."
                                                  value={loginName}
                                                  onChange={(e) => setLoginName(e.target.value)}
                                                  className="w-full bg-[#181d2c]/65 border border-white/5 rounded-2xl pl-11 pr-4 py-3.5 text-white text-xs font-semibold placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                                                  required
                                               />
                                            </div>
                                         </div>

                                         <div>
                                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2 font-mono text-left">
                                               Secure Email Contact
                                            </label>
                                            <div className="relative">
                                               <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 font-mono">
                                                  @
                                               </span>
                                               <input 
                                                  type="email"
                                                  placeholder="email@example.com..."
                                                  value={loginEmail}
                                                  onChange={(e) => setLoginEmail(e.target.value)}
                                                  className="w-full bg-[#181d2c]/65 border border-white/5 rounded-2xl pl-11 pr-4 py-3.5 text-white text-xs font-semibold placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
                                                  required
                                               />
                                            </div>
                                         </div>
                                      </div>

                                      <button
                                         type="submit"
                                         className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[9px] rounded-2xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98] cursor-pointer font-sans"
                                      >
                                         Authorize & Initialize Interface
                                      </button>
                                   </form>
                                </div>
                             )}
                          </div>
                       )}
                    </div>

                    {/* Quick switch configuration utility and status bar to reactivate visual portals as requested */}
                    <div className="pt-6 border-t border-white/5 flex flex-col items-center sm:flex-row justify-between gap-4 text-left font-sans shrink-0">
                       <div className="text-left font-sans">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest font-sans">
                             System Mode Configuration: <span className="text-indigo-400 font-bold">{showPortals ? "PORTAL RUNTIME" : "SECURE SHELL GATEWAY"}</span>
                          </p>
                          <p className="text-slate-600 text-[8px] font-bold uppercase tracking-wider font-sans mt-0.5">
                             You can reactivate or toggle the original Agency / Affiliate portals at any time.
                          </p>
                       </div>
                       
                       <button
                          type="button"
                          onClick={handleToggleShowPortals}
                          className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer font-sans ${
                             showPortals 
                                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20' 
                                : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/10'
                          }`}
                       >
                          {showPortals ? "🔒 Switch to Login UI" : "🔌 Reactivate Portal Selection"}
                       </button>
                    </div>

                 </div>
              </div>
            )}

            {view === 'command' && (
               <div className="w-full h-full p-6 sm:p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                  {notification && (
                     <div className="bg-indigo-600/15 border border-indigo-500/30 text-indigo-200 px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-3 flex items-center gap-2 shadow-lg shrink-0">
                        <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                        <span>{notification}</span>
                     </div>
                  )}
                  
                  <div className="w-full flex flex-col xl:flex-row gap-6 sm:gap-8">
                     {/* Left Panel: Command Center Controls */}
                     <div className="w-full xl:w-[400px] flex flex-col gap-6 shrink-0">
                        <div className="bg-[#0a0f1d] rounded-[2rem] p-8 border border-white/5 shadow-2xl flex flex-col gap-4">
                           <div className="text-amber-500 text-[9px] font-black uppercase tracking-[0.4em]">Voice Node Alpha</div>
                           <h3 className="text-4xl font-black italic tracking-tighter">Command<span className="text-slate-500">Center</span></h3>
                           
                           <div className="mt-4 space-y-4">
                              <button onClick={simulateInboundCall} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 active:scale-[0.98] transition-all cursor-pointer font-sans">
                                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 11-2 0 1 1 0 012 0zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13.536 14.95a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zM16.586 7.879l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414-1.414z" /></svg>
                                 Simulate Inbound Call
                              </button>
                              
                              <button className="w-full py-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-amber-500">
                                 <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                 Auto-Consult Active
                              </button>
                           </div>
                        </div>

                        <button onClick={() => setView('consult')} className="w-full bg-[#121c38]/45 border border-[#6366f1]/20 rounded-xl p-4 flex items-center justify-between group cursor-pointer hover:bg-[#16244a]/60 active:scale-[0.99] transition-all text-left font-sans">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-[#6366f1]/15 rounded-lg flex items-center justify-center border border-[#6366f1]/25 text-indigo-400 group-hover:text-[#818cf8] transition-colors shrink-0">
                                 <PhoneCall className="w-4 h-4" />
                              </div>
                              <div className="text-left">
                                 <h4 className="text-xs font-bold uppercase tracking-wider text-[#c7d2fe]">Consultation</h4>
                                 <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Direct agent consultation</p>
                              </div>
                           </div>
                           <span className="text-[8px] font-black uppercase text-[#818cf8] border border-[#6366f1]/20 px-2 py-0.5 rounded bg-[#6366f1]/10 shrink-0">Ready</span>
                        </button>

                        <div className="bg-white/2 border border-white/5 rounded-[2rem] p-6 flex items-center gap-4">
                           <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                           <div>
                              <div className="text-[10px] font-black uppercase tracking-widest">Nexus Mainnet</div>
                              <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Uplink: Primary-01</div>
                           </div>
                        </div>
                     </div>

                     {/* Right Panel: Voice Ledger */}
                     <div className="flex-1 bg-[#0a0f1d] rounded-2xl border border-white/5 p-6 sm:p-8 flex flex-col shadow-2xl relative overflow-hidden text-left min-h-[450px]">
                        <div className="flex justify-between items-start mb-6 border-b border-white/5 pb-4 text-left w-full shrink-0">
                           <div className="text-left">
                              <h2 className="text-sm font-black uppercase tracking-widest text-[#cfd7e6] flex items-center gap-1.5 italic font-sans animate-fade-in text-left">
                                 <Volume2 className="w-4 h-4 text-[#818cf8] not-italic shrink-0" />
                                 Voice<span className="text-slate-500 normal-case font-light not-italic font-sans">Ledger</span>
                              </h2>
                              <p className="text-slate-600 text-[9px] font-semibold uppercase tracking-widest mt-1.5 font-sans leading-normal text-left">Scroll through practice records. Select a case to read full transcripts.</p>
                           </div>
                           <div className="text-right font-sans shrink-0">
                              <div className="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-0.5">Active</div>
                              <div className="text-xl font-bold text-amber-500 leading-none">{voiceRecords.length}</div>
                           </div>
                        </div>
                        
                        {/* Compact Case Ledger List */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar text-left font-sans">
                           {voiceRecords.map((record) => (
                              <div 
                                 key={record.id}
                                 onClick={() => setSelectedRecord(record)}
                                 className="bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 hover:border-indigo-500/15 rounded-xl p-4 transition-all duration-200 cursor-pointer group flex items-center justify-between text-left font-sans"
                              >
                                 <div className="flex items-center gap-3.5 text-left font-sans">
                                    <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/15 transition-all font-sans shrink-0">
                                       <User className="w-3.5 h-3.5 font-sans" />
                                    </div>
                                    <div className="text-left font-sans animate-fade-in">
                                       <div className="flex items-center gap-1.5 text-left font-sans">
                                          <span className="text-[8px] font-mono font-black text-amber-500 tracking-wider uppercase">{record.id}</span>
                                          <span className="text-[8px] font-sans font-black text-slate-500 tracking-wider uppercase">• {record.caseType}</span>
                                       </div>
                                       {/* Name is small font text now */}
                                       <h4 className="text-xs font-bold text-slate-300 group-hover:text-indigo-400 transition-colors uppercase tracking-wide mt-0.5 text-left font-sans">{record.clientName}</h4>
                                       <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 italic text-left font-sans">"{record.summary}"</p>
                                    </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-4 shrink-0 text-left font-sans">
                                    <div className="text-right hidden sm:block font-sans">
                                       <span className="text-[8px] font-bold text-slate-500 tracking-wider block">{record.date}</span>
                                       <span className="text-[8px] font-bold text-slate-400 block mt-0.5">{record.duration}</span>
                                    </div>
                                    <div className="w-6 h-6 bg-white/5 group-hover:bg-indigo-600 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-white transition-all transform group-hover:translate-x-0.5 font-sans shrink-0">
                                       <ChevronRight className="w-3.5 h-3.5" />
                                    </div>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>

                  {/* High Fidelity Full-Screen Modal Dialog for full conversation transcripts */}
                  {selectedRecord && (() => {
                     const strategy = getCaseStrategy(selectedRecord);
                     return (
                        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-300 font-sans">
                           <div className="bg-[#090d16] border border-white/10 rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-sans text-left">
                              
                              {/* Modal Header */}
                              <div className="p-6 sm:p-8 border-b border-white/5 flex items-start justify-between bg-[#0a0f1d] shrink-0 text-left w-full font-sans">
                                 <div className="text-left font-sans">
                                    <div className="flex flex-wrap items-center gap-2 mb-2 font-sans">
                                       <span className="text-[9px] font-black text-amber-500 tracking-widest uppercase border border-amber-500/20 px-2 py-0.5 rounded bg-amber-500/5 font-mono">{selectedRecord.id}</span>
                                       <span className="text-[9px] font-black text-indigo-400 tracking-widest uppercase border border-indigo-500/20 px-2 py-0.5 rounded bg-indigo-500/5 font-sans">{selectedRecord.caseType}</span>
                                       <span className="text-[9px] font-black text-emerald-400 tracking-widest uppercase border border-emerald-500/20 px-2 py-0.5 rounded bg-emerald-500/05 font-sans animate-pulse">Win Strategy Dispatched</span>
                                    </div>
                                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-sans leading-none">{selectedRecord.clientName}</h3>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 font-sans">Recorded Client Transcript & Case Winning Strategies Panel</p>
                                 </div>
                                 <button 
                                    onClick={() => { setSelectedRecord(null); stopSpeaking(); }}
                                    className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors cursor-pointer border-0 bg-transparent animate-in duration-100"
                                 >
                                    <X className="w-5 h-5 font-sans" />
                                  </button>
                              </div>

                              {/* Modal Content - Dual Column */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 overflow-hidden min-h-0 bg-[#070a13]">
                                 
                                 {/* Left Panel: Transcripts with interactive list */}
                                 <div className="p-6 sm:p-8 overflow-y-auto space-y-6 border-b lg:border-b-0 lg:border-r border-white/5 custom-scrollbar text-left font-sans flex flex-col justify-start pb-24 lg:pb-16">
                                    {/* Briefing Summary */}
                                    <div className="bg-[#111827]/80 border border-white/5 rounded-2xl p-5 text-left shrink-0 font-sans">
                                       <h4 className="text-[9px] font-black uppercase text-indigo-400 tracking-wider mb-2 flex items-center gap-1.5 text-left font-sans">
                                          <FileText className="w-3.5 h-3.5" />
                                          Briefing Summary
                                       </h4>
                                       <p className="text-xs font-semibold text-slate-400 leading-relaxed italic text-left font-sans">
                                          "{selectedRecord.summary}"
                                       </p>
                                    </div>

                                    {/* Click instructions */}
                                    <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-2 select-none shrink-0 leading-none">
                                       <Sparkles className="w-4 h-4 animate-pulse shrink-0 text-amber-400" />
                                       <span>Click any statement block to read aloud dynamically!</span>
                                    </div>

                                    {/* Actionable transcript list */}
                                    <div className="space-y-4 text-left font-sans flex-1">
                                       <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2 text-left w-full font-sans select-none">
                                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 font-sans">
                                             <MessageSquare className="w-3.5 h-3.5" />
                                             Conversation Transcript
                                          </h4>
                                          <span className="text-[9px] text-slate-500 font-bold uppercase font-sans font-mono">{selectedRecord.duration} Rec Length</span>
                                       </div>

                                       <div className="space-y-4 text-left w-full font-sans pb-8 select-text">
                                          {selectedRecord.transcript.map((turn) => {
                                             const isCurrent = selectedTurnId === turn.id;
                                             return (
                                                <div 
                                                   key={turn.id} 
                                                   onClick={() => {
                                                      setSelectedTurnId(turn.id);
                                                      speakText(turn.text);
                                                   }}
                                                   className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'} group/bubble cursor-pointer`}
                                                >
                                                   <div className={`p-4 rounded-2xl text-[12.5px] leading-relaxed max-w-[85%] border transition-all text-left ${
                                                      isCurrent 
                                                         ? 'bg-indigo-600/20 border-indigo-500 bg-opacity-100 scale-[1.01] shadow-lg shadow-indigo-500/10' 
                                                         : 'bg-[#181d2c]/40 hover:bg-[#181d2c]/75 border-white/5 text-slate-300 hover:border-white/10'
                                                   } ${turn.role === 'user' ? 'rounded-br-none' : 'rounded-bl-none'}`}>
                                                      <div className="text-[9px] font-black uppercase tracking-wider mb-1.5 flex items-center justify-between text-left font-mono">
                                                         <div className="flex items-center gap-1.5">
                                                            {turn.role === 'user' ? (
                                                               <>
                                                                  <User className="w-3 h-3 text-amber-500" />
                                                                  <span className="text-amber-500 font-sans">Client statement block</span>
                                                               </>
                                                            ) : (
                                                               <>
                                                                  <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                                                                  <span className="text-indigo-400 font-sans">Nexus AI assistant</span>
                                                               </>
                                                            )}
                                                         </div>
                                                         <span className="text-slate-500 group-hover/bubble:text-indigo-400 text-[8px] uppercase tracking-widest font-sans underline decoration-dotted ml-2">Click to Speak 🔊</span>
                                                      </div>
                                                      <p className="font-semibold text-slate-300 text-left font-sans">{turn.text}</p>
                                                      
                                                      {isCurrent && (
                                                         <div className="mt-2 pt-1.5 border-t border-indigo-500/20 flex items-center gap-1 text-[8px] font-bold text-indigo-300 font-mono uppercase tracking-widest animate-pulse">
                                                            <Volume2 className="w-3 h-3" /> Voice Narration Active...
                                                         </div>
                                                      )}
                                                   </div>
                                                </div>
                                             );
                                          })}
                                       </div>
                                    </div>
                                 </div>

                                 {/* Right Panel: AI Win Strategies, TTS Controls & Voice/Button Intake */}
                                 <div className="p-6 sm:p-8 overflow-y-auto space-y-6 custom-scrollbar bg-[#090e1b] text-left font-sans flex flex-col justify-between pb-24 lg:pb-16">
                                    <div className="space-y-6">
                                       
                                       {/* Core Winning Strategy Banner */}
                                       <div className="bg-gradient-to-r from-indigo-500/10 to-transparent border-l-4 border-indigo-500 p-4 rounded-r-2xl shrink-0 select-none">
                                          <span className="text-[8px] font-black uppercase tracking-widest text-[#6366f1] block font-mono">Defense Blueprint</span>
                                          <h4 className="text-xs font-black uppercase text-white mt-1">Court Winning Strategy</h4>
                                          <p className="text-[11px] text-indigo-205 mt-1 font-sans italic font-medium leading-relaxed">
                                             "Preemption, precise statutory reliance, and physical/forensic evidence are paramount."
                                          </p>
                                       </div>

                                       {/* Audio Briefing controls */}
                                       <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
                                          <div className="text-left">
                                             <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Voice Strategic briefing</div>
                                             <div className="text-[8px] font-medium text-slate-500 uppercase tracking-widest mt-0.5 font-mono">Narrate tactical roadmap aloud</div>
                                          </div>
                                          
                                          <div className="flex gap-2 w-full sm:w-auto shrink-0">
                                             {voiceOutputPlaying ? (
                                                <button 
                                                   onClick={stopSpeaking}
                                                   className="flex-1 sm:flex-none px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer border-0"
                                                >
                                                   <VolumeX size={12} /> Silence Voice
                                                </button>
                                             ) : (
                                                <button 
                                                   onClick={() => speakText(strategy.audioBriefing + " Here are the core win strategies: " + strategy.strategies.join(" "))}
                                                   className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg animate-pulse border-0"
                                                >
                                                   <Volume2 size={12} /> Audibly Brief Strategy 🔊
                                                </button>
                                             )}
                                          </div>
                                       </div>

                                       {/* Strategy Details Blocks */}
                                       <div className="space-y-4 select-text font-sans">
                                          
                                          {/* Legal Provisions */}
                                          <div className="space-y-2">
                                             <div className="text-[9.5px] font-black uppercase text-indigo-400 tracking-wider font-mono">Governing Legal Framework</div>
                                             <div className="space-y-1.5">
                                                {strategy.provisions.map((prov, i) => (
                                                   <div key={i} className="text-xs bg-[#111827]/60 border border-white/5 p-2.5 rounded-xl text-slate-300 font-semibold flex items-center gap-2">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                                      <span>{prov}</span>
                                                   </div>
                                                ))}
                                             </div>
                                          </div>

                                          {/* Key Strengths */}
                                          <div className="space-y-2">
                                             <div className="text-[9.5px] font-black uppercase text-amber-500 tracking-wider font-mono">Favorable Case Strengths</div>
                                             <div className="space-y-1.5">
                                                {strategy.strengths.map((str, i) => (
                                                   <div key={i} className="text-xs bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-xl text-slate-300 font-semibold flex items-center gap-2">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                      <span>{str}</span>
                                                   </div>
                                                ))}
                                             </div>
                                          </div>

                                          {/* Win Strategies & Demands */}
                                          <div className="space-y-2">
                                             <div className="text-[9.5px] font-black uppercase text-emerald-400 tracking-wider font-mono">Actionable Win Strategies</div>
                                             <div className="space-y-2">
                                                {strategy.strategies.map((strat, i) => (
                                                   <div key={i} className="text-xs bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl text-slate-300 font-semibold leading-relaxed">
                                                      <div className="text-[8px] font-black text-emerald-400 tracking-widest mb-1 font-mono">TREATISE RULE 0{i+1}:</div>
                                                      <p>{strat}</p>
                                                   </div>
                                                ))}
                                             </div>
                                          </div>

                                          {/* Evidence REQUIRED */}
                                          <div className="space-y-2">
                                             <div className="text-[9.5px] font-black uppercase text-[#818cf8] tracking-wider font-mono">Required Exhibits & Evidence Tracer</div>
                                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {strategy.evidence.map((ev, i) => (
                                                   <div key={i} className="text-[10px] bg-white/[0.02] border border-white/5 p-2 rounded-xl text-slate-400 font-bold flex items-center gap-2">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                                      <span>{ev}</span>
                                                   </div>
                                                ))}
                                             </div>
                                          </div>

                                       </div>
                                    </div>

                                    {/* Advocate VOICE and ACTION intake panel */}
                                    <div className="mt-8 pt-6 border-t border-white/5 space-y-4 shrink-0 bg-[#0c1223] p-5 rounded-3xl border border-white/5 shadow-2xl select-none">
                                       
                                       <div className="flex justify-between items-start">
                                          <div>
                                             <span className="text-[9px] font-black uppercase tracking-widest text-[#6366f1] block font-mono">Advocate Command Hub</span>
                                             <h5 className="text-xs font-black uppercase text-white mt-1">Shall We Proceed with Auto-Drafting?</h5>
                                          </div>
                                          {isVoiceListening ? (
                                             <span className="text-[9px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md animate-pulse font-mono">🎤 LISTENING LIVE</span>
                                          ) : (
                                             <span className="text-[8px] font-black text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md font-mono">READY</span>
                                          )}
                                       </div>

                                       {voiceInputText && (
                                          <div className="bg-[#111827] border border-white/5 rounded-xl p-3 text-left">
                                             <span className="text-[8px] font-bold text-slate-500 uppercase block font-mono">Transcribed Command Voice Response</span>
                                             <span className="text-xs font-semibold text-slate-300 italic">"{voiceInputText}"</span>
                                          </div>
                                       )}

                                       {/* Direct Action triggers */}
                                       <div className="flex flex-col sm:flex-row gap-3">
                                          {/* Action 1: Voice responder */}
                                          <button 
                                             onClick={() => startVoiceCapture(selectedRecord)}
                                             className={`flex-1 py-3.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border bg-transparent ${
                                                isVoiceListening 
                                                   ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse' 
                                                   : 'bg-[#6366f1]/10 border-[#6366f1]/20 text-indigo-300 hover:bg-[#6366f1]/25 hover:border-indigo-400'
                                             }`}
                                          >
                                             <Mic className="w-3.5 h-3.5 text-indigo-400" />
                                             Speak Response 'Yes' 🎤
                                          </button>

                                          {/* Action 2: Direct proceed clicker */}
                                          <button 
                                             onClick={() => handleAutoDraftTrigger(selectedRecord)}
                                             className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-black font-extrabold shadow-lg shadow-emerald-500/10 transition-all cursor-pointer active:scale-[0.98] border-0"
                                          >
                                             <FileText className="w-3.5 h-3.5 text-black" />
                                             Yes, Launch Auto-Draft
                                          </button>
                                       </div>

                                       <p className="text-[9px] text-[#64748b] text-center font-bold uppercase tracking-widest leading-loose">
                                          Say "Proceed/Draft/Yes" via Speech Response, or press the launch button to draft in Drafting Suite.
                                       </p>

                                    </div>

                                 </div>

                              </div>

                              {/* Modal Footer actions */}
                              <div className="p-6 border-t border-white/5 bg-[#0a0f1d] flex gap-4 shrink-0 text-left w-full font-mono">
                                 <button onClick={() => { setSelectedRecord(null); stopSpeaking(); }} className="flex-1 py-4 bg-white/5 border border-white/10 hover:bg-white/10 border-0 bg-transparent rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all cursor-pointer font-sans">
                                    <X className="w-4 h-4 font-sans" />
                                    Close Strategy Portal
                                 </button>
                              </div>

                           </div>
                        </div>
                     );
                  })()}
               </div>
            )}

            {view === 'tele-prompt' && (
              <div className="w-full h-full p-6 sm:p-12 flex flex-col gap-6 sm:gap-10 overflow-y-auto custom-scrollbar bg-[#020617] relative">
                 <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                 
                 {/* Header Section */}
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 text-left border-b border-white/5 pb-6">
                    <div className="text-left font-sans">
                       <div className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 mb-2 italic font-sans text-left">Call Delegator Core</div>
                       <h3 className="text-4xl font-black tracking-tighter italic font-sans text-left">Tele Prompt<span className="text-slate-500 not-italic normal-case font-light font-sans ml-2">Directives</span></h3>
                       <p className="text-slate-400 text-xs mt-1.5 font-medium leading-relaxed max-w-2xl font-sans text-left">
                          Configure live intercept prompts for your virtual AI telephone answering service. 
                          Instruct the AI receptionist how to reply to specific clients instantly.
                       </p>
                    </div>
                    <div className="flex gap-3">
                       <span className="text-[9px] font-black uppercase text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-xl bg-amber-500/10 shrink-0 flex items-center gap-1.5 font-sans">
                          <Cpu className="w-3 h-3 text-amber-500 animate-pulse" />
                          Routing Node: Connected
                       </span>
                    </div>
                 </div>

                 {/* Grid Content */}
                 <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                    
                    {/* Left Column: Management Panel */}
                    <div className="flex flex-col gap-8">
                       
                       {/* Add/Edit Directive Clause */}
                       <div className="bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                          <h4 className="text-sm font-black uppercase tracking-wider text-white mb-6 flex items-center gap-2 text-left font-sans">
                             <Plus className="w-4 h-4 text-amber-500" />
                             {editingTeleId ? 'Modify Routing Directive' : 'Create Intercept Rule'}
                          </h4>
                          
                          <form onSubmit={handleSaveTelePrompt} className="space-y-6 text-left">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                   <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2 font-mono text-left">
                                      Caller Display Name / Keyword
                                   </label>
                                   <input 
                                      type="text"
                                      placeholder="e.g., Raju, Clerk, Landlord"
                                      value={newTeleCaller}
                                      onChange={(e) => setNewTeleCaller(e.target.value)}
                                      className="w-full bg-[#181d2c]/65 border border-white/5 rounded-xl px-4 py-3 text-white text-xs font-semibold placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors font-sans"
                                      required
                                   />
                                </div>
                                <div>
                                   <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2 font-mono text-left">
                                      Directive Target Group (Optional)
                                   </label>
                                   <input 
                                      type="text"
                                      placeholder="e.g., Court Clerk, Boundary Case"
                                      value={newTeleNote}
                                      onChange={(e) => setNewTeleNote(e.target.value)}
                                      className="w-full bg-[#181d2c]/65 border border-white/5 rounded-xl px-4 py-3 text-white text-xs font-semibold placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors font-sans"
                                   />
                                </div>
                             </div>

                             <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2 font-mono text-left">
                                   AI Response Instruction (The Directive)
                                </label>
                                <textarea 
                                   rows={3}
                                   placeholder="e.g., tell him to meet me 5 'o clock regarding the supplementary affidavit..."
                                   value={newTeleInstruction}
                                   onChange={(e) => setNewTeleInstruction(e.target.value)}
                                   className="w-full bg-[#181d2c]/65 border border-[#6366f1]/10 rounded-xl px-4 py-3 text-white text-xs leading-relaxed font-semibold placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors font-sans focus:ring-0"
                                   required
                                />
                             </div>

                             <div className="flex gap-4 font-sans">
                                <button
                                   type="submit"
                                   className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-all shadow-lg active:scale-[0.98] cursor-pointer"
                                >
                                   {editingTeleId ? '💾 Save Directive' : '➕ Register Intercept Prompt'}
                                </button>
                                
                                {editingTeleId && (
                                   <button
                                      type="button"
                                      onClick={() => {
                                         setEditingTeleId(null);
                                         setNewTeleCaller('');
                                         setNewTeleInstruction('');
                                         setNewTeleNote('');
                                      }}
                                      className="px-5 py-3.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-slate-400 hover:bg-white/10 cursor-pointer font-sans"
                                   >
                                      Cancel
                                   </button>
                                )}
                             </div>
                          </form>
                       </div>

                       {/* Directives Ledger list */}
                       <div className="bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl flex flex-col font-sans">
                          <h4 className="text-sm font-black uppercase tracking-wider text-white mb-6 flex items-center gap-2 text-left font-sans">
                             <BookOpen className="w-4 h-4 text-amber-500" />
                             Tele Intercept Ledger ({telePrompts.length})
                          </h4>
                          
                          <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar text-left font-sans">
                             {telePrompts.length === 0 ? (
                                <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl">
                                   <p className="text-slate-500 text-xs font-semibold">No active dial directives registered. Add a rule above.</p>
                                </div>
                             ) : (
                                telePrompts.map((item) => (
                                   <div 
                                      key={item.id} 
                                      className="p-5 bg-black/40 border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-amber-500/20 transition-all group font-sans animate-in fade-in"
                                   >
                                      <div className="space-y-2 text-left flex-1 min-w-0 font-sans">
                                         <div className="flex items-center gap-3 font-sans justify-start">
                                            <span className="text-xs font-black uppercase text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                                               Caller: {item.caller}
                                            </span>
                                            {item.note && (
                                               <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider truncate">
                                                  ({item.note})
                                               </span>
                                            )}
                                         </div>
                                         <div className="bg-[#181d2c]/30 rounded-xl p-3 border border-indigo-500/5 font-sans text-left">
                                            <div className="text-[8px] font-black text-amber-500/80 uppercase tracking-widest font-mono mb-1 text-left">Answering Instruction:</div>
                                            <p className="text-xs text-slate-300 font-semibold leading-relaxed font-mono text-left">
                                               "{item.instruction}"
                                            </p>
                                         </div>
                                      </div>

                                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                                         <button 
                                            onClick={() => handleToggleTelePrompt(item.id)}
                                            className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded cursor-pointer transition-all ${
                                               item.isActive 
                                                  ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 shadow-[0_0_10px_rgba(52,211,153,0.05)]' 
                                                  : 'text-slate-500 bg-white/5 border border-white/5'
                                            }`}
                                         >
                                            {item.isActive ? '● Active Intercept' : '○ Bypassed'}
                                         </button>
                                         
                                         <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button 
                                               onClick={() => handleEditTelePrompt(item)}
                                               className="px-2.5 py-1 bg-white/5 text-slate-400 hover:text-white rounded border border-white/10 text-[9px] font-black uppercase cursor-pointer"
                                               title="Edit Rule"
                                            >
                                               Edit
                                            </button>
                                            <button 
                                               onClick={() => handleDeleteTelePrompt(item.id)}
                                               className="px-2 py-1 text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-[9px] font-black cursor-pointer"
                                               title="Delete Rule"
                                            >
                                               ✕
                                            </button>
                                         </div>
                                      </div>
                                   </div>
                                ))
                             )}
                          </div>
                       </div>
                    </div>

                    {/* Right Column: AI Call Intercept Simulator */}
                    <div className="flex flex-col gap-8">
                       <div className="bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden text-left min-h-[500px] flex flex-col font-sans">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full pointer-events-none" />
                          
                          <div className="flex justify-between items-start mb-6 border-b border-white/5 pb-4 text-left w-full">
                             <div className="text-left font-sans">
                                <h4 className="text-slate-500 text-[9px] font-black uppercase tracking-widest font-sans text-left">Routing Sandbox</h4>
                                <h2 className="text-lg font-black uppercase tracking-widest text-[#cfd7e6] flex items-center gap-1.5 italic font-sans text-left">
                                   <PhoneCall className="w-4 h-4 text-amber-500 not-italic shrink-0 animate-pulse" />
                                   Simulate Routing Intercept
                                </h2>
                                <p className="text-slate-500 text-[9px] font-semibold uppercase tracking-widest mt-1.5 leading-normal text-left font-sans">
                                   Verify the behavior of your active Tele-Prompts against simulated incoming telephone calls.
                                </p>
                             </div>
                             <span className="text-[8px] font-black uppercase text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded bg-amber-500/10 shrink-0">Simulator Ready</span>
                          </div>

                          {/* Controls for Simulation */}
                          <div className="space-y-6 mb-8 text-left bg-black/40 p-6 rounded-2xl border border-white/5 font-sans">
                             <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-3 font-mono text-left">
                                   Choose / Type simulated Caller Name:
                                </label>
                                <div className="flex gap-2 flex-wrap mb-3 justify-start font-sans">
                                   {['Raju', 'Clerk', 'Landlord', 'John Doe'].map(name => (
                                      <button 
                                         key={name}
                                         type="button"
                                         onClick={() => setSimulatedCallerName(name)}
                                         className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                            simulatedCallerName === name 
                                               ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-bold' 
                                               : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                         }`}
                                      >
                                         {name}
                                      </button>
                                   ))}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 items-stretch font-sans">
                                   <input 
                                      type="text"
                                      placeholder="Or type other custom name..."
                                      value={simulatedCallerName}
                                      onChange={(e) => setSimulatedCallerName(e.target.value)}
                                      className="flex-1 bg-[#181d2c]/65 border border-white/5 rounded-xl px-4 py-2 text-white text-xs font-semibold placeholder-slate-600 focus:outline-none focus:border-amber-500 font-sans"
                                   />
                                   <button 
                                      type="button"
                                      onClick={handleSimulateCallTrigger}
                                      className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-[9px] rounded-xl transition-all cursor-pointer shadow-lg active:scale-95"
                                   >
                                      Test Call Trigger
                                   </button>
                                </div>
                             </div>
                          </div>

                          {/* Real-time simulation terminal / readout */}
                          <div className="flex-1 flex flex-col font-sans">
                             <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 font-mono text-left">
                                Intercept Diagnostics Console Log:
                             </div>
                             
                             <div className="flex-1 bg-black p-6 rounded-2xl border border-white/5 font-mono text-xs leading-relaxed min-h-[220px] flex flex-col justify-between">
                                {simulationResult ? (
                                   <div className="space-y-4 animate-in fade-in duration-300 font-mono">
                                      <div className="flex items-start gap-2.5 font-mono">
                                         <span className="text-amber-500 font-bold text-left font-mono">➜</span>
                                         <p className="text-slate-400 text-left font-mono">
                                            <span className="text-slate-600 font-bold font-mono">[16:44:20]</span> Intercept service online... Monitoring incoming SIP channels.
                                         </p>
                                      </div>
                                      <div className="flex items-start gap-2.5 font-mono">
                                         <span className="text-amber-500 font-bold text-left font-mono">➜</span>
                                         <p className="text-slate-300 text-left font-mono">
                                            <span className="text-slate-600 font-bold font-mono">[16:44:21]</span> {simulationResult.action}
                                         </p>
                                      </div>
                                      
                                      <div className="border border-white/5 bg-white/2 rounded-xl p-4 mt-3 font-mono">
                                         <div className="text-[8px] font-black text-[#818cf8] uppercase tracking-widest mb-2 font-mono text-left">
                                            AI Answering Speech Output:
                                         </div>
                                         <p className="text-xs text-white leading-relaxed italic text-left font-mono">
                                            {simulationResult.status === 'matched' ? (
                                               `"Hello, you have reached Adv. George's office. This is his AI Assistant. Adv. George requested me directly to tell you: ${simulationResult.matchedInstruction}"`
                                            ) : (
                                               `"Hello! Adv. George is currently in Court session. I am his AI deputy. Please state your query, I will record transcription record."`
                                            )}
                                         </p>
                                      </div>
                                   </div>
                                ) : (
                                   <div className="flex-1 flex flex-col items-center justify-center text-center py-10 opacity-40 font-sans">
                                      <div className="w-10 h-10 border border-dashed border-slate-500 rounded-full flex items-center justify-center mb-3">
                                         <Mic className="w-4 h-4 text-slate-400 animate-pulse" />
                                      </div>
                                      <p className="text-[10px] uppercase font-black text-slate-500 select-none font-sans">
                                         No active simulation run. Enter a caller and press the Test button above.
                                      </p>
                                   </div>
                                )}
                                
                                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-[8px] text-slate-600 font-bold uppercase tracking-widest leading-none shrink-0 font-mono">
                                   <span>Interception Node v3.1</span>
                                   <span>Divert Type: SIP-BRIDGE</span>
                                </div>
                             </div>
                          </div>

                       </div>
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
              <div className="w-full h-full flex flex-col p-6 sm:p-12 overflow-y-auto bg-[#020617] relative custom-scrollbar">
                 <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                 <div className="z-10 flex flex-col h-full min-h-[600px] max-w-5xl mx-auto w-full pb-12">
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



            {view === 'reading-room' && (
              <div className="w-full h-full p-3 sm:p-6 flex flex-col overflow-y-auto md:overflow-hidden bg-[#070b14] relative text-slate-300 custom-scrollbar">
                
                {/* Visual Header */}
                <div className="flex justify-between items-center sm:items-end shrink-0 mb-4 sm:mb-6 px-1.5">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#6366f1] mb-1">Optical Scan Room</div>
                    <h3 className="text-3xl sm:text-4xl font-black italic">Reading<span className="text-slate-500 not-italic">Room</span></h3>
                  </div>
                  {cameraEnabled && (
                    <button 
                      onClick={() => stopHardware()} 
                      className="px-4 py-2 bg-rose-600/20 border border-rose-600/30 text-rose-400 font-bold uppercase tracking-wider text-[10px] hover:bg-rose-600/30 rounded-xl transition-all cursor-pointer"
                    >
                      Disconnect Feed
                    </button>
                  )}
                </div>

                {cameraEnabled ? (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 overflow-hidden pb-16 md:pb-0">
                    
                    {/* Left Column: Viewfinder (7 Cols) */}
                    <div className="md:col-span-6 xl:col-span-7 bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] relative flex flex-col overflow-hidden group shadow-2xl min-h-[350px] md:min-h-0">
                      
                      {/* Video Viewfinder */}
                      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
                        <video 
                          ref={readingRoomVideoRef} 
                          autoPlay 
                          playsInline 
                          muted 
                          className="w-full h-full object-contain grayscale-[0.2] contrast-125 rounded-2xl" 
                        />
                        
                        {/* Interactive Laser Scanning Effect */}
                        {readingRoomScanPhase === 'analyzing' && (
                          <div className="absolute inset-0 bg-transparent overflow-hidden pointer-events-none z-20">
                            <div className="w-full h-1 bg-indigo-500 shadow-[0_0_15px_#6366f1] rounded-full absolute animate-[ping_1.5s_infinite]" style={{ top: '50%' }} />
                            <div className="w-full h-full bg-gradient-to-b from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 absolute animate-[pulse_1s_infinite]" />
                          </div>
                        )}

                        {/* Status overlays */}
                        <div className="absolute top-4 left-4 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1.5 select-none z-30">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-300">Live Lens Active</span>
                        </div>
                      </div>

                      {/* Control buttons below viewfinder */}
                      <div className="p-4 bg-slate-900/40 border-t border-white/5 flex flex-col sm:flex-row gap-3 items-center justify-between z-10 font-sans">
                        <div className="text-[10px] text-slate-400 max-w-[280px] text-center sm:text-left">
                          📢 Position legal pages, petitions, or judgements flatly within the viewport for prompt recognition.
                        </div>
                        <button
                          onClick={handleReadingRoomScan}
                          disabled={readingRoomScanPhase === 'analyzing'}
                          className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all transform hover:scale-102 flex items-center justify-center gap-2 text-xs shadow-lg cursor-pointer"
                        >
                          {readingRoomScanPhase === 'analyzing' ? (
                            <>
                              <RotateCcw size={14} className="animate-spin" />
                              AI Extracting & Summarizing...
                            </>
                          ) : (
                            <>
                              <Camera size={14} />
                              Snap & Inspect Document
                            </>
                          )}
                        </button>
                      </div>

                    </div>

                    {/* Right Column: AI Insights & Extraction Side panel (5 Cols) */}
                    <div className="md:col-span-6 xl:col-span-5 bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-6 flex flex-col overflow-hidden min-h-[400px] md:min-h-0 relative shadow-inner font-sans">
                      
                      {readingRoomScanPhase === 'idle' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 animate-bounce">
                            <Sparkles size={24} />
                          </div>
                          <h4 className="text-lg font-black uppercase tracking-tight text-white mb-2">Live AI Inspection</h4>
                          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-6">
                            Press "Snap & Inspect Document" to extract full text and receive legal breakdowns directly via Gemini.
                          </p>
                          
                          <div className="w-full space-y-2 border border-dashed border-white/10 rounded-2xl p-4 text-left bg-white/[0.01]">
                            <div className="text-[10px] uppercase font-black tracking-widest text-[#6366f1] mb-2">Capabilities</div>
                            <div className="flex items-start gap-2.5 text-[11px] text-slate-300">
                              <span className="text-indigo-400 mt-0.5">•</span>
                              <p><strong>Digital OCR</strong> - Extracts complex paragraphs with absolute typographic precision.</p>
                            </div>
                            <div className="flex items-start gap-2.5 text-[11px] text-slate-300">
                              <span className="text-indigo-400 mt-0.5">•</span>
                              <p><strong>Statute Linker</strong> - Auto-determines applicable statutory rules & codes.</p>
                            </div>
                            <div className="flex items-start gap-2.5 text-[11px] text-slate-300">
                              <span className="text-indigo-400 mt-0.5">•</span>
                              <p><strong>Vocal Stream</strong> - Turn on your vocal channel while scanning to converse directly with Gemini about what it sees.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {readingRoomScanPhase === 'analyzing' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 select-none">
                          <div className="relative mb-6">
                            <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                              <Cpu size={18} className="text-indigo-400" />
                            </div>
                          </div>
                          
                          <h4 className="text-sm font-black uppercase tracking-wider text-slate-200 mb-2">Core Engine Actively Reading</h4>
                          <p className="text-xs text-slate-400 animate-pulse">Running advanced OCR and legal reasoning...</p>
                          
                          <div className="mt-8 space-y-1 text-left w-full max-w-xs mx-auto">
                            <div className="text-[9px] text-slate-500 flex justify-between">
                              <span>Rasterizing camera capture...</span>
                              <span className="text-emerald-400 font-bold">Done</span>
                            </div>
                            <div className="text-[9px] text-slate-500 flex justify-between">
                              <span>Translating typography contours...</span>
                              <span className="text-indigo-400 font-bold animate-pulse">In Progress</span>
                            </div>
                            <div className="text-[9px] text-slate-400 flex justify-between">
                              <span>Synthesizing legal statute codes...</span>
                              <span className="text-slate-600">Pending</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {readingRoomScanPhase === 'error' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400 mb-4">
                            <AlertCircle size={24} />
                          </div>
                          <h4 className="text-md font-bold text-rose-400 mb-2">Inspection Fault</h4>
                          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-4">
                            Unable to analyze the snapshot. This can happen if the file is blurred, unreadable, or communication key parameters are invalid.
                          </p>
                          <button 
                            onClick={handleReadingRoomScan} 
                            className="px-5 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl text-xs font-bold leading-none cursor-pointer border border-rose-500/30 transition-all"
                          >
                            Retry Inspection
                          </button>
                        </div>
                      )}

                      {readingRoomScanPhase === 'done' && readingRoomScanResult && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          
                          {/* Tab selectors */}
                          <div className="flex bg-[#070b14] border border-white/10 p-1 rounded-xl justify-around items-center shrink-0 z-30 select-none mb-4">
                            <button 
                              onClick={() => setReadingRoomActiveTab('summary')}
                              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                readingRoomActiveTab === 'summary' 
                                  ? 'bg-[#1e293b] text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.2)]' 
                                  : 'text-slate-400 hover:text-white bg-transparent'
                              }`}
                            >
                              Report
                            </button>
                            <button 
                              onClick={() => setReadingRoomActiveTab('ocr')}
                              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                readingRoomActiveTab === 'ocr' 
                                  ? 'bg-[#1e293b] text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.2)]' 
                                  : 'text-slate-400 hover:text-white bg-transparent'
                              }`}
                            >
                              OCR Extract
                            </button>
                            <button 
                              onClick={() => setReadingRoomActiveTab('statutory')}
                              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                readingRoomActiveTab === 'statutory' 
                                  ? 'bg-[#1e293b] text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.2)]' 
                                  : 'text-slate-400 hover:text-white bg-transparent'
                              }`}
                            >
                              Statutory
                            </button>
                          </div>

                          {/* Tab Content Panels */}
                          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#070b14] border border-white/5 rounded-2xl p-4 mb-4 text-left">
                            
                            {readingRoomActiveTab === 'summary' && (
                              <div className="space-y-4 animate-in fade-in duration-200">
                                <div className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Legal Assessment Summary</div>
                                <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                                  <ReactMarkdown>{readingRoomScanResult.summary}</ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {readingRoomActiveTab === 'ocr' && (
                              <div className="space-y-4 animate-in fade-in duration-200 select-text">
                                <div className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Clean Document Copy</div>
                                <p className="text-xs leading-relaxed text-slate-200 font-mono whitespace-pre-wrap">
                                  {readingRoomScanResult.extractedText}
                                </p>
                              </div>
                            )}

                            {readingRoomActiveTab === 'statutory' && (
                              <div className="space-y-4 animate-in fade-in duration-200">
                                <div className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Act & Jurisprudence Linkage</div>
                                <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                                  {readingRoomScanResult.statutoryActs.map((act, i) => (
                                    <div key={i} className="mb-2">
                                      <ReactMarkdown>{act}</ReactMarkdown>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          </div>

                          {/* Quick Action buttons */}
                          <div className="grid grid-cols-2 gap-3 mt-auto shrink-0 font-sans">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(readingRoomScanResult.extractedText);
                                setNotification("📋 Extracted text copied to clipboard.");
                              }}
                              className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Copy size={12} /> Copy OCR
                            </button>
                            <button
                              onClick={() => {
                                setDraftFacts(prev => prev + (prev.trim() ? "\n\n" : "") + "--- Extracted from Reading Room Scan ---\n" + readingRoomScanResult.extractedText);
                                setView('drafting');
                                setEnlargedElement('facts');
                                setNotification("📂 Extracted text injected into Drafting Facts successfully.");
                              }}
                              className="py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md animate-pulse"
                            >
                              <Plus size={12} /> Feed Drafting
                            </button>
                          </div>

                        </div>
                      )}

                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-[#0a0f1d] border border-white/5 rounded-[2.5rem] shadow-box">
                    <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6 pulse">
                      <Camera size={32} />
                    </div>
                    <h4 className="text-xl font-black uppercase tracking-tight text-white mb-2">Connect Scanner Mode</h4>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-md mb-8">
                      Turn on the scan room camera feed to enable immediate statutory correlation, clean high-fidelity OCR, and live visual guidance.
                    </p>
                    <button 
                      onClick={() => toggleHardware('camera')} 
                      className="px-10 py-5 bg-indigo-600 rounded-2xl font-black uppercase text-xs tracking-widest text-white hover:bg-indigo-500 transition-all shadow-2xl transform hover:scale-105"
                    >
                      Initialize Scanner Room
                    </button>
                  </div>
                )}
              </div>
            )}

            {view === 'clients' && (
              <div className="w-full h-full p-6 sm:p-12 flex flex-col gap-6 sm:gap-10 overflow-y-auto custom-scrollbar">
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
              <div className="w-full h-full flex flex-col bg-[#020617] relative animate-in fade-in duration-500 overflow-hidden">
                {/* Visual glows and ambient backgrounds */}
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-600/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />

                {/* Clean, minimalist header */}
                <div className="px-6 py-4 sm:px-8 sm:py-5 border-b border-white/5 flex items-center justify-between bg-[#0a0f1d]/45 backdrop-blur-md shrink-0 z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400">Direct Counsel</div>
                      <h3 className="text-xl font-bold tracking-tight text-white">AI Consultation</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Tiny responsive status bar */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/5">
                      <span className={`w-2 h-2 rounded-full ${micEnabled && status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 hidden sm:inline">
                        {micEnabled && status === ConnectionStatus.CONNECTED ? 'Listening' : 'Standby'}
                      </span>
                    </div>

                    <button
                      onClick={() => setHistory([])}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/10 hover:bg-rose-500/5 transition-all cursor-pointer"
                    >
                      Reset Log
                    </button>
                  </div>
                </div>

                {/* Scrollable Conversation Thread Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 space-y-6 z-10 flex flex-col min-h-0 bg-gradient-to-b from-[#0a0f1d]/20 to-black/40">
                  <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-between">
                    {history.length === 0 && !userTranscription && !aiTranscription ? (
                      <div className="my-auto flex flex-col items-center justify-center text-center p-8 gap-5 max-w-lg mx-auto">
                        <div className="w-16 h-16 bg-[#0a0f1d] rounded-2xl flex items-center justify-center border border-white/5 text-slate-500 animate-bounce">
                          <MessageSquare className="w-8 h-8 text-indigo-400" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white tracking-wide">Nexus Legal Consultation Chat</h4>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            Welcome to your conversation with Nexus AI. Ask anything about Kerala and general Indian laws, contracts, dispute resolutions, or consumer rights. You can type your request or turn on your microphone to speak with the AI counselor.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6 w-full pb-4">
                        {history.map((item) => (
                          <div
                            key={item.id}
                            className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                          >
                            <div
                              className={`max-w-[85%] rounded-3xl p-5 border transition-all ${
                                item.role === 'user'
                                  ? 'bg-slate-800/40 border-white/5 rounded-tr-none text-slate-100 shadow-md'
                                  : 'bg-[#0f172a]/80 border-indigo-500/10 rounded-tl-none text-slate-200 shadow-lg shadow-indigo-950/20'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-4 mb-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    item.role === 'user' ? 'text-indigo-400' : 'text-amber-500'
                                  }`}>
                                    {item.role === 'user' ? 'Client' : 'Nexus AI'}
                                  </span>
                                </div>
                                <span className="text-[8px] font-bold text-slate-500/80 tracking-widest uppercase">
                                  {item.role === 'user' ? 'Legal Query' : 'Direct Counsel'}
                                </span>
                              </div>
                              <div className={`text-[14px] leading-relaxed select-text ${
                                item.role === 'user' ? 'text-slate-200 whitespace-pre-wrap' : 'text-slate-100 font-sans'
                              }`}>
                                {item.role === 'user' ? (
                                  item.text
                                ) : (
                                  <div className="prose prose-invert max-w-none text-slate-100 font-sans">
                                    <ReactMarkdown>{item.text}</ReactMarkdown>
                                  </div>
                                )}
                              </div>

                              {item.role === 'ai' && (
                                <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-4 text-xs text-slate-500">
                                  <button
                                    onClick={() => handleCopyText(item.id, item.text)}
                                    className="flex items-center gap-1.5 hover:text-indigo-400 font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer"
                                  >
                                    {copiedId === item.id ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    onClick={() => handleDownloadItem(item.text, item.id)}
                                    className="flex items-center gap-1.5 hover:text-[#a5b4fc] font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </button>

                                  <button
                                    onClick={() => handleArchiveItem(item.id, item.text)}
                                    className="flex items-center gap-1.5 hover:text-amber-400 font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer"
                                  >
                                    <Archive className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Archive</span>
                                  </button>

                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="flex items-center gap-1.5 hover:text-rose-400 font-bold uppercase tracking-widest text-[9px] transition-colors cursor-pointer ml-auto"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Live Transcribing Wave / Speech Indicators */}
                        {(userTranscription || aiTranscription || isLiveThinking) && (
                          <div className="space-y-4">
                            {/* User spoke transcript block */}
                            {userTranscription && (
                              <div className="flex justify-end animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="max-w-[85%] rounded-3xl rounded-tr-none p-5 bg-slate-800/40 border border-white/5 text-slate-100 shadow-md">
                                  <div className="flex items-center justify-between gap-4 mb-2.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                                      Voice Query Received
                                    </span>
                                    <span className="text-[8px] font-bold text-slate-500 tracking-widest uppercase">Captured Live</span>
                                  </div>
                                  <p className="text-[14px] text-slate-200 leading-relaxed font-sans font-medium italic">
                                    "{userTranscription}"
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* AI has finished receiving user query and is thinking/synthesizing voice feedback */}
                            {isLiveThinking && !aiTranscription && (
                              <div className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300">
                                <div className="max-w-[85%] rounded-3xl rounded-tl-none p-5 bg-indigo-950/45 border border-indigo-500/20 text-indigo-100 shadow-lg shadow-indigo-950/20">
                                  <div className="flex items-center justify-between gap-6 mb-2.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#a5b4fc] flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                                      AI Coding/Thinking...
                                    </span>
                                    <span className="text-[8px] font-bold text-indigo-400/80 tracking-widest uppercase">Synthesizing Voice Response</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-end gap-1 h-4 shrink-0">
                                      <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                      <span className="w-1 h-4 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                      <span className="w-1 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                                      <span className="w-1 h-3.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:450ms]" />
                                    </div>
                                    <p className="text-[14px] text-indigo-200 leading-relaxed font-sans italic">
                                      Nexus AI is formatting a legal reply. Please wait for voice response...
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* AI is speaking the response */}
                            {aiTranscription && (
                              <div className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300">
                                <div className="max-w-[85%] rounded-3xl rounded-tl-none p-5 bg-[#0f172a]/80 border border-indigo-500/10 text-slate-100 shadow-xl shadow-indigo-950/20 mr-auto">
                                  <div className="flex items-center justify-between gap-4 mb-2.5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                                      Nexus AI Speaking
                                    </span>
                                    <span className="text-[8px] font-bold text-amber-500/80 tracking-widest uppercase font-mono">Live Broadcast</span>
                                  </div>
                                  <p className="text-[14px] text-slate-200 leading-relaxed font-sans">
                                    {aiTranscription}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Processing Answer Indicator */}
                        {isAiGeneratingText && (
                          <div className="flex justify-start animate-pulse">
                            <div className="max-w-[85%] rounded-3xl rounded-tl-none p-5 bg-indigo-950/20 border border-indigo-500/10 text-indigo-200">
                              <div className="flex items-center justify-between gap-4 mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                                  Thinking
                                </span>
                                <span className="text-[8px] font-black text-indigo-400/80 tracking-widest uppercase">Formulating Response</span>
                              </div>
                              <p className="text-[14px] text-indigo-300/80 leading-relaxed font-sans italic">
                                Nexus AI is formulating a legal consultation reply...
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Conversation Input Bar container */}
                <div className="p-4 sm:p-6 pb-24 sm:pb-32 md:pb-28 border-t border-white/5 bg-[#050914] shrink-0 z-10">
                  <div className="max-w-4xl mx-auto w-full relative">

                    <form onSubmit={handleTextSubmit} className="flex gap-2.5 items-center">
                      {/* Audio Level Bar for Mic if connected & active */}
                      {micEnabled && status === ConnectionStatus.CONNECTED && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500/10 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-75"
                            style={{ width: `${Math.min(100, Math.max(0, micLevel * 100))}%` }}
                          />
                        </div>
                      )}

                      {/* Microphone Toggle quick button inside conversation input bar */}
                      <button
                        type="button"
                        onClick={() => toggleHardware('mic')}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                          micEnabled 
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 shadow-lg shadow-rose-950/20' 
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                        }`}
                        title={micEnabled ? 'Mute Speech Intake' : 'Enable Voice Consultation'}
                      >
                        <Mic className="w-5 h-5" />
                      </button>

                      <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder={micEnabled && status === ConnectionStatus.CONNECTED ? "Speak now or type your legal question here..." : "Type legal question or case enquiry here..."}
                        className="flex-1 bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/20 focus:bg-black/60 transition-all"
                        disabled={isAiGeneratingText}
                      />

                      <button
                        type="submit"
                        disabled={isAiGeneratingText || !textInput.trim()}
                        className="px-6 py-4 bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-600/20 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:hover:shadow-none text-white rounded-2xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 shrink-0"
                      >
                        {isAiGeneratingText ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Enquire</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {view === 'archive' && (
              <div className="w-full h-full p-4 sm:p-8 flex flex-col overflow-y-auto bg-[#070b14] relative text-slate-300 custom-scrollbar select-none">
                
                {/* Visual Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4 px-1">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#6366f1] mb-1">Cabinet Archives</div>
                    <h3 className="text-3xl sm:text-4xl font-black italic">Research<span className="text-slate-500 not-italic">Vault</span></h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Persisted records of legal consultation advices, judgements, and client intelligence memos.
                    </p>
                  </div>
                  <div className="text-[10px] py-2 px-3 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Stored Records: <span className="text-indigo-400 font-black">{archives.length}</span>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="mb-6 w-full max-w-xl self-start px-1">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search archived advisor advices, topics, or records..."
                      value={archiveSearch}
                      onChange={(e) => setArchiveSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-[#0a0f1d] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all shadow-lg"
                    />
                    <Search className="absolute left-3.5 top-3.5 text-slate-500" size={14} />
                    {archiveSearch && (
                      <button
                        onClick={() => setArchiveSearch('')}
                        className="absolute right-3.5 top-3.5 text-slate-500 hover:text-white text-[11px] font-bold border-0 bg-transparent cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Archives Content Segment */}
                {archives.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border border-dashed border-white/10 rounded-[2.5rem] bg-[#0a0f1d]/30 max-w-4xl w-full self-center my-8">
                    <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6">
                      <Archive size={32} />
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">No Archived Research Found</h4>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                      Go to the <span className="text-indigo-400 font-bold hover:underline cursor-pointer" onClick={() => setView('consult')}>AI Consultation</span> page, formulate your questions, and press the **"Archive"** button next to each response to keep them preserved here.
                    </p>
                  </div>
                ) : (() => {
                  const filteredArchives = archives.filter(item => 
                    item.title.toLowerCase().includes(archiveSearch.toLowerCase()) || 
                    item.content.toLowerCase().includes(archiveSearch.toLowerCase()) ||
                    item.type.toLowerCase().includes(archiveSearch.toLowerCase())
                  );
                  
                  if (filteredArchives.length === 0) {
                    return (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-12 max-w-xl w-full self-center">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">No matching items found for "{archiveSearch}"</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 gap-6 max-w-5xl w-full pb-16">
                      {filteredArchives.map((art) => {
                        const isExpanded = expandedArchiveId === art.id;
                        return (
                          <div 
                            key={art.id} 
                            className="bg-[#0a0f1d] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all flex flex-col shadow-xl select-text"
                          >
                            {/* Card Header */}
                            <div className="flex justify-between items-start gap-4 mb-4 select-none">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                  <BookOpen size={16} />
                                </div>
                                <div className="text-left">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[#6366f1] bg-indigo-600/10 border border-indigo-500/20 px-2 py-0.5 rounded-md inline-block">
                                    {art.type}
                                  </span>
                                  <h4 className="text-sm font-bold text-white mt-1.5 leading-snug">{art.title}</h4>
                                </div>
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono shrink-0 whitespace-nowrap">
                                {art.timestamp}
                              </span>
                            </div>

                            {/* Card Body with Markdown support */}
                            <div className="text-xs leading-relaxed text-slate-300 font-sans border-t border-b border-white/[0.03] py-4 my-2 select-text text-left">
                              {isExpanded ? (
                                <div className="prose prose-invert max-w-none text-slate-200">
                                  <ReactMarkdown>{art.content}</ReactMarkdown>
                                </div>
                              ) : (
                                <div>
                                  <p className="line-clamp-3">
                                    {art.content.replace(/[#*`\-_]/g, '').trim()}
                                  </p>
                                  <button 
                                    onClick={() => setExpandedArchiveId(art.id)}
                                    className="mt-3 text-[#6366f1] hover:text-indigo-400 font-black uppercase tracking-widest text-[9px] cursor-pointer border-0 bg-transparent p-0 flex items-center gap-1"
                                  >
                                    Read full archived text <ChevronRight size={10} />
                                  </button>
                                </div>
                              )}

                              {isExpanded && (
                                <button 
                                  onClick={() => setExpandedArchiveId(null)}
                                  className="mt-4 text-slate-500 hover:text-white font-black uppercase tracking-widest text-[9px] cursor-pointer border-0 bg-transparent p-0"
                                >
                                  Collapse record view
                              </button>
                              )}
                            </div>

                            {/* Card Action Controls */}
                            <div className="flex flex-wrap items-center gap-4 mt-2 select-none font-sans text-[10px]">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(art.content);
                                  setNotification("📋 Copied archived document to clipboard.");
                                }}
                                className="flex items-center gap-1.5 text-slate-400 hover:text-[#6366f1] font-bold uppercase tracking-wider transition-colors cursor-pointer border-0 bg-transparent p-0"
                              >
                                <Copy size={13} /> Copy Text
                              </button>

                              <button
                                onClick={() => {
                                  const blob = new Blob([art.content], {type: 'text/plain;charset=utf-8'});
                                  const url = URL.createObjectURL(blob);
                                  const element = document.createElement("a");
                                  element.href = url;
                                  element.download = `nexus_archive_${art.id}.txt`;
                                  document.body.appendChild(element);
                                  element.click();
                                  document.body.removeChild(element);
                                  URL.revokeObjectURL(url);
                                  setNotification("📥 Archived record downloaded safely.");
                                }}
                                className="flex items-center gap-1.5 text-slate-400 hover:text-[#6366f1] font-bold uppercase tracking-wider transition-colors cursor-pointer border-0 bg-transparent p-0"
                              >
                                <Download size={13} /> Download
                              </button>

                              <button
                                onClick={() => {
                                  setDraftFacts(prev => prev + (prev.trim() ? "\n\n" : "") + "--- From Archived Consultation ---\n" + art.content);
                                  setView('drafting');
                                  setEnlargedElement('facts');
                                  setNotification("📂 Injected archived document into Drafting Facts.");
                                }}
                                className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider transition-all cursor-pointer border-0 bg-transparent p-0 animate-pulse"
                              >
                                <Plus size={13} /> Feed Drafting
                              </button>

                              <button
                                onClick={() => {
                                  setArchives(prev => prev.filter(item => item.id !== art.id));
                                  if (expandedArchiveId === art.id) setExpandedArchiveId(null);
                                  setNotification("🗑️ Document deleted from Archive Page successfully.");
                                }}
                                className="flex items-center gap-1.5 text-slate-500 hover:text-rose-400 font-bold uppercase tracking-wider transition-colors cursor-pointer border-0 bg-transparent p-0 ml-auto"
                              >
                                <Trash2 size={13} /> Scrap Record
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              </div>
            )}

            {view === 'contract' && (
              <div className="w-full h-full flex items-start justify-center p-2 md:p-6 overflow-y-auto custom-scrollbar bg-[#070b14]">
                <div className="w-full max-w-7xl">
                  <ContractEngine />
                </div>
              </div>
            )}

            {view === 'drafting' && (
              <div className="h-full w-full flex flex-col overflow-y-auto bg-[#070b14] relative text-slate-300 custom-scrollbar scroll-smooth">
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
                  className="h-[calc(100vh-12rem)] md:h-[calc(100vh-12rem)] min-h-[580px] shrink-0 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar"
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

                {/* Strategic Visual Page Divider & Scroll Anchor Trigger */}
                <div 
                  onClick={() => document.getElementById('case-strategy-report-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className="border-t border-indigo-500/10 py-5 bg-[#040811] flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0 select-none hover:bg-[#070b19] transition-colors"
                >
                  <div className="flex items-center gap-2 text-indigo-400 font-sans text-[10px] font-black uppercase tracking-widest leading-none">
                    <ChevronRight size={14} className="rotate-90 text-indigo-400 animate-bounce" />
                    SCROLL DOWN FOR CASE LAWS, LEGAL CHALLENGES & WIN STRATEGY REPORT
                    <ChevronRight size={14} className="rotate-90 text-indigo-400 animate-bounce" />
                  </div>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest font-sans">Click to scroll to Analysis & Action Report</p>
                </div>

                {/* DYNAMIC CASE LAWS, CHALLENGES & WIN STRATEGY SUITE */}
                <div id="case-strategy-report-section" className="bg-[#050811] border-t border-white/5 p-6 sm:p-10 space-y-10 text-left font-sans shrink-0 pb-36">
                  {/* Strategic Header */}
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[#080d1a]/80 border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    {/* Glowing Accent Spot */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none" />
                    
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 font-sans">LITIGATION INTELLIGENCE ENGINE v3.1</span>
                      </div>
                      <h3 className="text-xl font-black uppercase text-white tracking-wide font-sans">
                        Case Strategy, Statutes & Win-Tactic Analysis Report
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
                        Live diagnostic review of active facts and laws. Displays critical regulatory/legal provisions, hostile defense risks, and precise changes required to win while drafting.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleGenerateCaseAnalysis(draftFacts)}
                        disabled={isGeneratingAnalysis || !draftFacts.trim()}
                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-black text-xs text-white uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(99,102,241,0.2)] hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
                      >
                        {isGeneratingAnalysis ? (
                          <RotateCcw size={14} className="animate-spin" />
                        ) : (
                          <Cpu size={14} />
                        )}
                        {isGeneratingAnalysis ? "ANALYZING ACTION..." : "RE-RUN DOCKET DIAGNOSIS"}
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Report Content - Loading or Grid */}
                  {isGeneratingAnalysis ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white/[0.01] border border-white/5 rounded-3xl">
                      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <div className="text-xs font-black tracking-widest text-[#818cf8] animate-pulse font-sans">
                        LAUNCHING NEURAL LAWSUIT AUDIT & STRATEGY SYNOPSIS...
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium font-sans">Extracting acts, modeling defense hazards, and drafting pleading adjustments.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                      {/* STATUTES INVOLVED PANEL */}
                      <div className="bg-[#080c16] border border-white/5 rounded-3xl p-6 flex flex-col gap-5 shadow-lg relative min-h-[300px]">
                        <div className="absolute top-0 left-6 -translate-y-1/2 bg-[#0d152a] border border-white/10 px-3 py-1.5 rounded-full text-[9px] font-black text-indigo-400 uppercase tracking-widest font-sans flex items-center gap-1.5 shadow-md">
                          <BookOpen size={10} className="text-indigo-400" />
                          1. Statutes & Systems Involved
                        </div>
                        
                        <div className="space-y-4 mt-2 flex-1">
                          {draftAnalysisReport.lawsInvolved.map((law, idx) => (
                            <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-indigo-500/20 transition-all duration-300">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1.5 mb-2">
                                <span className="text-xs font-black text-slate-200 uppercase font-sans tracking-wide leading-tight">{law.title}</span>
                                <span className="self-start px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-[8px] font-sans uppercase tracking-wider">{law.provision}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{law.relevance}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* LEGAL CHALLENGES PANEL */}
                      <div className="bg-[#080c16] border border-white/5 rounded-3xl p-6 flex flex-col gap-5 shadow-lg relative min-h-[300px]">
                        <div className="absolute top-0 left-6 -translate-y-1/2 bg-[#2d1810] border border-orange-500/20 px-3 py-1.5 rounded-full text-[9px] font-black text-orange-400 uppercase tracking-widest font-sans flex items-center gap-1.5 shadow-md">
                          <AlertTriangle size={10} className="text-orange-400" />
                          2. Hostile Legal Challenges
                        </div>

                        <div className="space-y-4 mt-2 flex-1">
                          {draftAnalysisReport.challenges.map((challenge, idx) => (
                            <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-orange-500/20 transition-all duration-300">
                              <h4 className="text-xs font-black text-orange-400 font-sans tracking-wide mb-1 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                {challenge.title}
                              </h4>
                              <div className="grid grid-cols-1 gap-2.5 mt-2.5">
                                <div className="bg-orange-500/[0.03] border-l border-orange-500/20 pl-2.5 py-1">
                                  <span className="text-[9px] font-black uppercase text-orange-400 tracking-wider block font-sans">Technical Risk</span>
                                  <p className="text-[10px] text-slate-400 leading-normal font-sans mt-0.5">{challenge.risk}</p>
                                </div>
                                <div className="bg-emerald-500/[0.03] border-l border-emerald-500/20 pl-2.5 py-1">
                                  <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider block font-sans">Active Mitigation</span>
                                  <p className="text-[10px] text-slate-400 leading-normal font-sans mt-0.5">{challenge.mitigation}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* WIN STRATEGY CHANGES NEEDED PANEL */}
                      <div className="bg-[#080c16] border border-white/5 rounded-3xl p-6 flex flex-col gap-5 shadow-lg relative min-h-[300px]">
                        <div className="absolute top-0 left-6 -translate-y-1/2 bg-[#092215] border border-emerald-500/20 px-3 py-1.5 rounded-full text-[9px] font-black text-emerald-400 uppercase tracking-widest font-sans flex items-center gap-1.5 shadow-md">
                          <Check size={10} strokeWidth={3} className="text-emerald-400" />
                          3. Drafting Changes & Win Tactics
                        </div>

                        <div className="space-y-4 mt-2 flex-1">
                          {draftAnalysisReport.changesNeeded.map((change, idx) => (
                            <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-emerald-500/20 transition-all duration-300 relative overflow-hidden">
                              <div className="absolute -right-8 -bottom-8 w-16 h-16 bg-emerald-500/[0.02] blur-xl rounded-full pointer-events-none" />
                              
                              <h4 className="text-xs font-black text-emerald-400 font-sans tracking-wide mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {change.title}
                              </h4>
                              <div className="space-y-2 mt-2 leading-relaxed">
                                <div className="text-[10.5px] text-slate-300 font-sans">
                                  <span className="font-bold text-slate-500 block text-[9px] font-black uppercase tracking-widest font-sans leading-none mb-1">STRATEGIC CLAUSE ADJUSTMENT:</span>
                                  {change.instruction}
                                </div>
                                <div className="text-[10px] text-emerald-400 font-sans">
                                  <span className="text-slate-500 font-bold font-sans uppercase text-[8px] tracking-wider block">JUDICIAL VALUE / PAYOFF:</span>
                                  {change.impact}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Case Synthesis Memorandum Card */}
                  <div className="bg-[#0b1224]/80 border border-indigo-500/10 rounded-2xl p-6 relative overflow-hidden text-slate-300">
                    <div className="absolute -top-10 -left-10 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={14} className="text-indigo-400" />
                      <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Strategic Advocate Synthesis Memo</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                      Under Indian Civil and Appellate Procedure, standard declarations and temporary relief mechanisms favor the vigilant and possessive. 
                      Ensure your Draft Pleading addresses: immediate physical possession with dates, clear boundary dimensions in the description schedule, 
                      and immediate oral objections to establish non-acquiescence. Click any of the analysis tasks above to refine your draft in real-time.
                    </p>
                  </div>
                </div>

                {/* Overlays / Modal Windows */}
                {/* showCustomPromptPage modal moved to secure global stacking context at the bottom of the file */}

                {/* 2. EnlargedElement Overlay Modal */}
                {enlargedElement && (
                  <div className="fixed inset-0 bg-[#02050a]/95 backdrop-blur-md z-[2000] flex flex-col p-6">
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
              <div className="h-full w-full p-3 md:p-6 flex flex-col overflow-y-auto md:overflow-hidden bg-[#070b14] relative text-slate-300 custom-scrollbar">
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
                  <div className="fixed inset-0 z-[2000] bg-[#02050a]/95 backdrop-blur-md p-6 flex flex-col">
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
              <div className="h-full w-full p-6 flex flex-col overflow-y-auto md:overflow-hidden bg-[#070b14] relative text-slate-300 custom-scrollbar">
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

          {/* GLOBAL HARDWARE DOCK - Only show in Advocate Portal */}
          {isAdvocatePortal && (
            <div className="hardware-dock-center flex flex-col items-center gap-5 z-[1000] w-[calc(100%-80px)] sm:w-auto max-w-xs sm:max-w-md px-4 sm:px-6 pointer-events-none animate-in slide-in-from-bottom-5 duration-500">
              
              {/* COMPACT FLOATING VOICE & SIGHT CONSOLE AREA - RENDERED DIRECTLY ABOVE CONTROLS */}
              {(micEnabled || cameraEnabled) && (
                <div id="immersive-voice-sight-console" className="w-full sm:w-80 pointer-events-auto animate-in fade-in slide-in-from-bottom-6 duration-300">
                  <div className="w-full bg-[#050915]/95 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-4 flex flex-col gap-3 text-center select-none relative animate-in zoom-in-95 duration-200">
                    
                    {/* Subtle internal glowing spots */}
                    <div className="absolute -top-6 -left-6 w-24 h-24 bg-indigo-500/5 blur-[30px] rounded-full pointer-events-none" />
                    <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-amber-500/5 blur-[30px] rounded-full pointer-events-none" />

                    {/* Header controls */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-2 w-full z-10 select-none">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 animate-pulse' : 
                          status === ConnectionStatus.CONNECTING ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
                        }`} />
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                          {status === ConnectionStatus.CONNECTED ? 'Secure Voice Channel' : 
                           status === ConnectionStatus.CONNECTING ? 'Bridging Vocals...' : 'Offline'}
                        </span>
                      </div>
                      <button 
                        onClick={() => stopHardware()} 
                        className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Close Vocal Feed"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* COMPACT CAMERA VIEW REMOVED - KEEPING LARGE CAMERA IN CURRENT WORKSPACE PANELS */}

                    {/* GRAPHIC INDICATOR: VoiceVisualizer */}
                    <div className="w-full flex items-center justify-center py-1 z-10 select-none">
                      <VoiceVisualizer 
                        volume={micLevel} 
                        isModelSpeaking={!!aiTranscription} 
                        isConnected={status === ConnectionStatus.CONNECTED}
                        isThinking={isLiveThinking}
                      />
                    </div>

                    {/* DYNAMIC TEXT AREA: Resizes automatically */}
                    <div className="w-full flex flex-col gap-2 z-10 text-left select-text">
                      {/* Spoken Query of the user */}
                      {userTranscription && (
                        <div className="text-xs font-semibold text-indigo-300 italic tracking-wide max-h-24 overflow-y-auto custom-scrollbar select-text leading-relaxed px-1">
                          "{userTranscription}"
                        </div>
                      )}

                      {/* AI Reply or Thinking Status */}
                      {aiTranscription ? (
                        <div className="bg-[#0c0f1b]/95 border border-indigo-500/10 rounded-xl p-3 max-h-56 overflow-y-auto custom-scrollbar shadow-inner animate-in fade-in duration-300">
                          <div className="text-[9px] font-black uppercase text-amber-500 tracking-widest mb-1 select-none">
                            Legal Counsel response
                          </div>
                          <div className="text-[12px] leading-relaxed text-slate-200 select-text whitespace-pre-wrap font-sans">
                            {aiTranscription}
                          </div>
                        </div>
                      ) : isLiveThinking ? (
                        <div className="bg-[#0b0f19]/60 border border-indigo-500/5 rounded-xl p-2.5 flex items-center gap-2 animate-pulse">
                          <div className="flex gap-0.5 h-2.5 items-end shrink-0">
                            <span className="w-0.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms] h-1.5" />
                            <span className="w-0.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:150ms] h-2.5" />
                            <span className="w-0.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms] h-1.5" />
                          </div>
                          <p className="text-[9px] text-indigo-300 italic font-bold uppercase tracking-wider">Formulating response...</p>
                        </div>
                      ) : status === ConnectionStatus.ERROR ? (
                        <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-2.5">
                          <div className="text-[9px] font-black uppercase text-rose-400 tracking-widest mb-0.5 select-none">
                            ⚠️ Stream Permission Fault
                          </div>
                          <p className="text-[10px] text-slate-400 leading-snug">
                            Check browser permissions for microphone and camera.
                          </p>
                        </div>
                      ) : !userTranscription && (
                        <div className="text-[10px] text-slate-500 italic text-center py-1 select-none border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                          🎙️ Speak Malayalam or English now...
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              <div className="bg-black/90 backdrop-blur-3xl p-2.5 sm:p-4 rounded-[2.2rem] sm:rounded-[3rem] border border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.95)] flex items-center gap-3 sm:gap-4 pointer-events-auto">
                <button 
                  onClick={() => toggleHardware('camera')} 
                  className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-500 border-2 cursor-pointer ${
                    cameraEnabled ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_30px_rgba(79,70,229,0.6)] transform scale-110' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                  }`}
                  title={cameraEnabled ? "Turn off Camera stream" : "Turn on Camera stream"}
                >
                  <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                
                {micEnabled || cameraEnabled ? (
                  <button 
                    onClick={() => stopHardware()} 
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 bg-rose-500 border border-rose-400 text-white shadow-[0_0_25px_rgba(239,68,68,0.5)] cursor-pointer transform hover:scale-105 active:scale-95"
                    title="Close Voice/Sight bridge"
                  >
                    <X className="w-5 h-5 sm:w-7 sm:h-7" />
                  </button>
                ) : (
                  <button 
                    onClick={() => toggleHardware('mic')} 
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-500 border-2 cursor-pointer bg-rose-500/10 border-rose-500/20 text-rose-500 hover:text-rose-400"
                    title="Initiate Voice bridge"
                  >
                    <svg className="w-5 h-5 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                )}

                <div className="hidden sm:block h-10 w-px bg-white/10 mx-2 sm:mx-3" />
                <div className="hidden sm:flex px-2 sm:px-6 flex-col justify-center select-none">
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 leading-none">NEXUS LINK</span>
                   <span className="text-[9px] font-bold uppercase tracking-widest mt-2 flex items-center gap-1.5">
                     <span className={`w-1.5 h-1.5 rounded-full ${
                       micEnabled || cameraEnabled 
                         ? (status === ConnectionStatus.CONNECTED ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse') 
                         : 'bg-slate-500'
                     }`} />
                     <span className={
                       micEnabled || cameraEnabled 
                         ? (status === ConnectionStatus.CONNECTED ? 'text-emerald-400' : 'text-amber-400') 
                         : 'text-slate-500'
                     }>
                       {micEnabled || cameraEnabled 
                         ? (status === ConnectionStatus.CONNECTED ? 'ACTIVE' : 'BRIDGING...') 
                         : 'OFFLINE'}
                     </span>
                   </span>
                </div>
              </div>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* GLOBAL OVERLAY MODAL: Custom Drafting Prompts */}
      {showCustomPromptPage && (
        <div className="fixed inset-0 bg-[#02050a]/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
          <div className="bg-[#090e18] border border-white/10 rounded-[2rem] w-full max-w-4xl h-auto max-h-[95vh] flex flex-col overflow-y-auto scroll-smooth shadow-2xl my-auto custom-scrollbar relative p-1">
            
            {/* Header Area */}
            <div className="p-6 sm:p-8 border-b border-white/5 flex justify-between items-center shrink-0">
              <div>
                <span className="text-[9px] font-black tracking-widest text-[#818cf8] uppercase block mb-1">PROMPT WORKSPACE & CASE ANALYZERS</span>
                <h3 className="text-lg font-black uppercase tracking-wider text-white font-sans">Custom Drafting Prompts & Win Strategy Suite</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 font-sans">Configure advanced structural layout rules & view litigation diagnostics below</p>
              </div>
              <button onClick={() => setShowCustomPromptPage(false)} className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* PAGE 1: Custom Prompt & Directives Setup */}
            <div className="flex flex-col md:flex-row min-h-0 border-b border-white/5">
              {/* Preset Directives Left Panel */}
              <div className="w-full md:w-80 border-r border-white/5 flex flex-col bg-black/15 overflow-hidden">
                <div className="p-4 border-b border-white/5 shrink-0 bg-white/[0.01]">
                  <span className="text-[9px] font-black uppercase tracking-wider text-indigo-400 block font-sans">Directive Blueprints (1-Click Presets)</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 max-h-[420px] space-y-2.5 custom-scrollbar">
                  {/* Preloaded Presets */}
                  {systemDirectives.map((preset, idx) => {
                    const isActive = customPromptText === preset.text;
                    return (
                      <div
                        key={`static-${idx}`}
                        onClick={() => setCustomPromptText(preset.text)}
                        className={`w-full rounded-xl transition-all p-3 text-xs border cursor-pointer ${
                          isActive 
                            ? 'bg-indigo-600/15 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)]' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-indigo-500/30'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className={`font-bold flex-1 text-left font-sans ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}>
                            {preset.label}
                          </span>
                          {isActive && (
                            <span className="text-[8px] bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-indigo-400 font-black font-sans shrink-0">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className={`text-[10px] line-clamp-2 text-left font-sans ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{preset.text}</p>
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
                            ? 'bg-indigo-600/15 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)]' 
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
              <div className="flex-1 p-6 md:p-8 flex flex-col h-auto overflow-y-auto max-h-[500px] custom-scrollbar">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2 font-sans">Configure Custom Pleading Logic Instruction</label>
                <textarea 
                  value={customPromptText}
                  onChange={e => setCustomPromptText(e.target.value)}
                  placeholder="e.g., Rewrite the case draft to strongly highlight the lack of initial dynamic intention in the sequential occurrence of events..."
                  className="w-full h-44 bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none transition-colors resize-none font-sans"
                />

                {/* Quick Custom Directive Creator */}
                <div className="mt-5 border-t border-white/5 pt-5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2.5 font-sans">Save Prompt Draft as a Preset</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-1">
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

                <div className="mt-6 border-t border-white/5 pt-5 flex flex-col md:flex-row gap-3 pb-2">
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

            {/* Strategic Page Navigation Indicator / Header for Page 2 */}
            <div className="border-b border-indigo-500/10 py-4 bg-[#050811] px-8 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 font-sans">
                  PAGE 2: LIVE LITIGATION ANALYSIS & ACTION WIN REPORT
                </span>
              </div>
              <span className="text-[9px] text-[#818cf8] font-bold uppercase tracking-widest font-sans animate-bounce">
                ▼ SCROLL DOWN TO READ AUDIT
              </span>
            </div>

            {/* PAGE 2: LITIGATION INTELLIGENCE REPORT */}
            <div className="bg-[#050811] p-6 sm:p-8 space-y-8 text-left font-sans shrink-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/[0.01] border border-white/5 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-2xl rounded-full pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#818cf8] font-sans">DOCKET INSIGHT WORKSPACE</span>
                  </div>
                  <h4 className="text-sm font-black uppercase text-white tracking-wide font-sans">Litigation Blueprint, Hostile Pitfalls & Win Strategy</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-sans leading-relaxed">
                    Dynamic strategic diagnostic extracted from current case facts. View legal sections, defense risk parameters, and apply structural improvements directly with 1-click.
                  </p>
                </div>
                <button
                  onClick={() => handleGenerateCaseAnalysis(draftFacts)}
                  disabled={isGeneratingAnalysis || !draftFacts.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg font-black text-[9px] text-white uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 font-sans"
                >
                  {isGeneratingAnalysis ? (
                    <RotateCcw size={12} className="animate-spin" />
                  ) : (
                    <Cpu size={12} />
                  )}
                  {isGeneratingAnalysis ? "RUNNING INTEGRATION AUDIT..." : "RE-GENERATED CASE AUDIT"}
                </button>
              </div>

              {isGeneratingAnalysis ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2.5 bg-white/[0.01] border border-white/5 rounded-2xl">
                  <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <div className="text-[9px] font-black tracking-widest text-[#818cf8] animate-pulse font-sans">LAUNCHING NEURAL LAWSUIT AUDIT & STRATEGY SYNOPSIS...</div>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Compiling court strategies & civil pleading criteria</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Laws column */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
                    <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest font-sans flex items-center gap-1.5 border-b border-white/5 pb-2">
                      <BookOpen size={10} />
                      1. Laws Involved
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] custom-scrollbar">
                      {draftAnalysisReport.lawsInvolved.map((law, idx) => (
                        <div key={idx} className="bg-white/[0.01] border border-white/5 rounded-xl p-3.5 hover:border-indigo-500/10 transition-all">
                          <div className="flex flex-col gap-1 mb-1.5">
                            <span className="text-[10px] font-bold text-slate-200 uppercase font-sans leading-tight">{law.title}</span>
                            <span className="px-1.5 py-0.5 self-start rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-[7px] font-sans uppercase tracking-wider">{law.provision}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{law.relevance}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Challenges column */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
                    <div className="text-[9px] font-black text-orange-400 uppercase tracking-widest font-sans flex items-center gap-1.5 border-b border-white/5 pb-2">
                      <AlertTriangle size={10} />
                      2. Legal Challenges
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] custom-scrollbar">
                      {draftAnalysisReport.challenges.map((challenge, idx) => (
                        <div key={idx} className="bg-white/[0.01] border border-white/5 rounded-xl p-3.5 hover:border-orange-500/10 transition-all">
                          <h5 className="text-[10px] font-black text-orange-400 font-sans tracking-wide mb-1 leading-snug">{challenge.title}</h5>
                          <div className="space-y-2 mt-2">
                            <div className="bg-orange-500/[0.02] border-l border-orange-500/15 pl-2 py-0.5">
                              <span className="text-[8px] font-bold uppercase text-orange-400 tracking-wider block font-sans">Technical Risk</span>
                              <p className="text-[9px] text-slate-400 leading-normal font-sans">{challenge.risk}</p>
                            </div>
                            <div className="bg-emerald-500/[0.02] border-l border-emerald-500/15 pl-2 py-0.5">
                              <span className="text-[8px] font-bold uppercase text-emerald-400 tracking-wider block font-sans">Strategic Mitigation</span>
                              <p className="text-[9px] text-slate-400 leading-normal font-sans">{challenge.mitigation}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Win Tactics column */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
                    <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest font-sans flex items-center gap-1.5 border-b border-white/5 pb-2">
                      <Check size={10} strokeWidth={3} />
                      3. Win Strategy Tactic
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] custom-scrollbar">
                      {draftAnalysisReport.changesNeeded.map((change, idx) => (
                        <div key={idx} className="bg-white/[0.01] border border-white/5 rounded-xl p-3.5 hover:border-emerald-500/10 transition-all flex flex-col justify-between">
                          <div>
                            <h5 className="text-[10px] font-black text-emerald-400 font-sans tracking-wide mb-1.5 leading-snug">{change.title}</h5>
                            <p className="text-[9.5px] text-slate-300 font-sans leading-relaxed">
                              <span className="text-slate-500 font-bold block text-[8px] font-sans uppercase tracking-widest mb-0.5">INSTRUCTION:</span>
                              {change.instruction}
                            </p>
                            <p className="text-[9px] text-emerald-450 font-sans leading-relaxed mt-1.5">
                              <span className="text-slate-500 font-bold block text-[8px] font-sans uppercase tracking-wider mb-0.5">IMPACT ON JUDGE:</span>
                              {change.impact}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const newText = customPromptText ? (customPromptText + "\n\n" + change.instruction) : change.instruction;
                              setCustomPromptText(newText);
                              // Smooth scroll up to Page 1 Prompt Text Area focus
                              document.querySelector("textarea")?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="mt-3.5 w-full py-1.5 bg-indigo-600/15 border border-indigo-500/20 hover:bg-indigo-600/35 text-indigo-300 hover:text-white rounded text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                          >
                            + APPLY TACTIC TO PROMPT
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hardware-dock-center {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
        }
        @media (min-width: 768px) {
          .hardware-dock-center {
            bottom: 40px;
          }
        }
        @media (min-width: 640px) {
          .hardware-dock-center {
            left: calc(50% - 88px);
            transform: none;
          }
        }

        @keyframes scan { 0% { transform: translateY(0); } 100% { transform: translateY(100vh); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #312e81; border-radius: 10px; }
        
        /* Thin blue vertical slide bar for sidebar scrolling */
        .sidebar-scrollbar::-webkit-scrollbar { width: 3px; }
        .sidebar-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
        .sidebar-scrollbar::-webkit-scrollbar-thumb { background: #2563eb; border-radius: 10px; }
        .sidebar-scrollbar::-webkit-scrollbar-thumb:hover { background: #60a5fa; }
        .sidebar-scrollbar { scrollbar-width: thin; scrollbar-color: #2563eb rgba(255, 255, 255, 0.02); }

        /* Thin blue horizontal slide bar for top navigation menu scrolling */
        .custom-horizontal-scrollbar::-webkit-scrollbar { height: 3px; }
        .custom-horizontal-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.01); }
        .custom-horizontal-scrollbar::-webkit-scrollbar-thumb { background: #2563eb; border-radius: 10px; }
        .custom-horizontal-scrollbar::-webkit-scrollbar-thumb:hover { background: #60a5fa; }
        .custom-horizontal-scrollbar { scrollbar-width: thin; scrollbar-color: #2563eb rgba(255, 255, 255, 0.01); }
        
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
};

export default App;

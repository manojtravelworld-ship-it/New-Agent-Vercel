import React, { useState, useRef, useEffect, useCallback } from "react";
import { ParallelDownloader } from "../lib/parallel-downloader";
import { get } from "idb-keyval";
import { 
  Mic, Camera, FileText, Users, Bell, HelpCircle, 
  BookOpen, Edit3, Layout, MessageSquare, Settings, 
  Download, Globe, Wifi, WifiOff, Shield, Save, Trash2,
  ChevronLeft, ChevronRight, Play, Square, Copy, ExternalLink,
  CheckCircle, AlertTriangle, Info, X, Search, Plus, RotateCcw,
  Volume2, Send, Trash, Check, AlertCircle, LogOut, Upload, File,
  Maximize2, Minimize2, Cpu, Zap, Anchor, ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from 'react-markdown';
import { useGeminiLive } from "../hooks/useGeminiLive";
import { VoiceVisualizer } from './VoiceVisualizer';
import { HybridAIEngine, AIMessage, AIResponse, cleanStreamingText } from "../lib/ai-engine";
import { MalayalamEngine } from "../lib/malayalam-engine";
import { LocalDB } from "../lib/local-db";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

// --- Custom Icon Component ---
const Icon = ({ path, size = 20, strokeWidth = 2, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {Array.isArray(path) ? path.map((d: string, i: number) => <path key={i} d={d} />) : <path d={path} />}
  </svg>
);

// --- Constants ---
const SIMULATED_CALLS = [
  {
    id: 1,
    clientName: "John Doe",
    phone: "+1 555-0123",
    timestamp: "2026-03-24 10:30 AM",
    duration: "5m 12s",
    transcript: [
      { role: "client", text: "Hello Advocate, I have a property dispute with my brother over our ancestral land in the village." },
      { role: "advocate", text: "I understand. Do you have the title deeds and the family tree document?" },
      { role: "client", text: "Yes, I have all the documents ready." }
    ],
    summary: "Property dispute over ancestral land. Needs to file a partition suit. Documents ready."
  },
  {
    id: 2,
    clientName: "Elena Rodriguez",
    phone: "+1 555-0199",
    timestamp: "2026-03-23 02:15 PM",
    duration: "2m 45s",
    transcript: [
      { role: "client", text: "Advocate, I received a notice from the cooperative society regarding my membership. They are saying I haven't paid the maintenance for 6 months, but I have the receipts." },
      { role: "advocate", text: "Please send me the receipts and the notice. We can reply to them under the Cooperative Societies Act." }
    ],
    summary: "Cooperative society membership notice. Maintenance payment dispute. Client has receipts."
  },
  {
    id: 3,
    clientName: "Sarah Smith",
    phone: "+1 555-0456",
    timestamp: "2026-03-22 11:00 AM",
    duration: "3m 20s",
    transcript: [
      { role: "client", text: "I'm starting a new job and I want you to review the employment contract, especially the non-compete clause." },
      { role: "advocate", text: "Sure, send it over. I'll check if the clause is reasonable and enforceable in your jurisdiction." }
    ],
    summary: "Employment contract review. Non-compete clause concerns. Needs legal opinion."
  }
];

const sideNav = [
  { id: 'command', label: 'Command', icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
  { id: 'feed', label: 'Feed', icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { id: 'consult', label: 'Consult', icon: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" },
  { id: 'clients', label: 'Clients', icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: 'knowledge', label: 'Knowledge', icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { id: 'instructions', label: 'Instructions', icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { id: 'drafting', label: 'Drafting', icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" },
  { id: 'notif', label: 'Notifications', icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
  { id: 'support', label: 'Support', icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" },
  { id: 'read', label: 'Read', icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: 'convert', label: 'Convert', icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { id: 'brain2', label: 'BRAINS', icon: "M9.5 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm5 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM5 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm14 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM9.5 17a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm5 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" },
];

const topTabs = [
  { id: 'command', label: 'COMMAND' },
  { id: 'feed', label: 'FEED' },
  { id: 'consult', label: 'CONSULT' },
  { id: 'clients', label: 'CLIENTS' },
  { id: 'knowledge', label: 'KNOWLEDGE' },
  { id: 'instructions', label: 'INSTRUCTIONS' },
  { id: 'drafting', label: 'DRAFTING' },
  { id: 'notif', label: 'NOTIF.' },
  { id: 'support', label: 'SUPPORT' },
  { id: 'read', label: 'READ' },
  { id: 'convert', label: 'CONVERT' },
  { id: 'brain2', label: 'BRAINS' },
];

const CONVERTER_STEPS = [
  { id: 1, title: 'Camera Capture', desc: 'Snap photos of physical documents', icon: <Camera size={14} />, color: '#6366f1' },
  { id: 2, title: 'File Upload', desc: 'Select images from your device', icon: <Upload size={14} />, color: '#10b981' },
  { id: 3, title: 'AI Extraction', desc: 'High-precision text recognition', icon: <Search size={14} />, color: '#f59e0b' },
  { id: 4, title: 'AI Translation', desc: 'Convert to any language', icon: <Globe size={14} />, color: '#8b5cf6' },
  { id: 5, title: 'PDF Export', desc: 'Save as professional PDF', icon: <FileText size={14} />, color: '#ef4444' },
  { id: 6, title: 'Word Export', desc: 'Save as editable .docx', icon: <File size={14} />, color: '#3b82f6' },
];

const S = {
  page: { display: 'flex', height: '100vh', background: '#020617', color: '#e2e8f0', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', fontSize: 14 },
  sidebar: { width: 72, background: '#070b14', borderRight: '1px solid rgba(255,255,255,.05)', display: 'flex' as const, flexDirection: 'column' as const, alignItems: 'center', padding: '0', gap: 8, flexShrink: 0, overflowY: 'auto' as const },
  sideBtn: (active: boolean) => ({ width: '100%', height: 56, background: active ? 'rgba(245,158,11,.05)' : 'transparent', border: 'none', color: active ? '#f59e0b' : '#475569', cursor: 'pointer', display: 'flex' as const, alignItems: 'center', justifyContent: 'center', position: 'relative' as const, transition: 'all .2s', flexShrink: 0 }),
  header: { height: 64, background: '#0a0f1d', borderBottom: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 },
  card: { background: 'rgba(10,15,29,0.7)', borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,.05)', backdropFilter: 'blur(10px)' },
};

const NeuralFlow = () => (
  <div className="absolute top-0 left-0 right-0 h-[320px] overflow-hidden pointer-events-none opacity-30 z-0">
    <style>{`
      @keyframes flowWaveA {
        0% { transform: translateX(0) translateY(0) scaleY(1); }
        50% { transform: translateX(-15%) translateY(-5px) scaleY(1.1); }
        100% { transform: translateX(0) translateY(0) scaleY(1); }
      }
      @keyframes flowWaveB {
        0% { transform: translateX(0) translateY(0) scaleY(1.05); }
        50% { transform: translateX(12%) translateY(6px) scaleY(0.95); }
        100% { transform: translateX(0) translateY(0) scaleY(1.05); }
      }
      @keyframes glowPulse {
        0%, 100% { opacity: 0.25; filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.3)); }
        50% { opacity: 0.55; filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.8)); }
      }
      @keyframes shimmerDot {
        0%, 100% { transform: translate(150px, 120px); opacity: 0.2; }
        40% { transform: translate(450px, 140px); opacity: 0.8; }
        75% { transform: translate(750px, 110px); opacity: 0.4; }
      }
    `}</style>
    <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent" />
    <svg className="absolute w-[120%] h-full -left-[10%]" viewBox="0 0 1200 400" preserveAspectRatio="none">
      <defs>
        <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.05" />
          <stop offset="30%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="70%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      
      {/* Animated wave 1 */}
      <path
        d="M 0,150 C 200,80 400,220 600,150 C 800,80 1000,220 1200,150 L 1200,400 L 0,400 Z"
        fill="none"
        stroke="url(#waveGrad1)"
        strokeWidth="3.5"
        className="transition-all"
        style={{
          animation: 'flowWaveA 14s ease-in-out infinite, glowPulse 7s ease-in-out infinite',
          transformOrigin: '50% 50%'
        }}
      />
      
      {/* Animated wave 2 */}
      <path
        d="M 0,180 C 150,220 350,110 550,180 C 750,250 950,110 1200,180"
        fill="none"
        stroke="url(#waveGrad2)"
        strokeWidth="2"
        style={{
          animation: 'flowWaveB 18s ease-in-out infinite',
          transformOrigin: '50% 50%'
        }}
      />

      {/* Third finer cyber grid wave */}
      <path
        d="M 0,120 Q 300,60 600,120 T 1200,120"
        fill="none"
        stroke="rgba(168, 85, 247, 0.15)"
        strokeWidth="1.5"
        strokeDasharray="6 3"
        style={{
          animation: 'flowWaveA 22s linear infinite',
          transformOrigin: '50% 50%'
        }}
      />

      {/* Small floating energy particles along the waves */}
      <circle
        r="4"
        fill="#8b5cf6"
        className="shadow-lg blur-[1px]"
        style={{
          animation: 'shimmerDot 10s ease-in-out infinite',
          filter: 'drop-shadow(0 0 8px #c084fc)'
        }}
      />
      <circle
        r="2.5"
        fill="#3b82f6"
        style={{
          animation: 'shimmerDot 14s ease-in-out infinite',
          animationDelay: '-4s',
          filter: 'drop-shadow(0 0 6px #60a5fa)'
        }}
      />
    </svg>
  </div>
);

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

export default function AdvocatePortal({ onBack }: { onBack: () => void }) {
  const aiEngine = HybridAIEngine.getInstance();
  const geminiLive = useGeminiLive();
  const [connectionType, setConnectionType] = useState<'wifi' | 'mobile' | 'unknown'>('unknown');
  const [view, setView] = useState("command");
  const [aiStatus, setAiStatus] = useState<any>(aiEngine.getStatus());
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Connectivity Monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setVoiceAiStatus("System Online");
      setVoiceAiTranscript("Internet connection restored.");
    };
    const handleOffline = () => {
      setIsOffline(true);
      setVoiceAiStatus("Offline Mode");
      setVoiceAiTranscript("Internet connection lost. Some features limited.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Doc Converter State
  const [converterImage, setConverterImage] = useState<string | null>(null);
  const [converterText, setConverterText] = useState('');
  const [converterStatus, setConverterStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPreviewEnlarged, setIsPreviewEnlarged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localDB = LocalDB.getInstance();

  const [clients, setClients] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<AIMessage[]>([]);
  const [consoleInput, setConsoleInput] = useState("");
  const [consoleLoading, setConsoleLoading] = useState(false);
  
  const [scanPhase, setScanPhase] = useState<'idle' | 'starting' | 'live' | 'processing' | 'done' | 'error'>('idle');
  const [scannedText, setScannedText] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of dynamic live voice transcript feed
  useEffect(() => {
    if (geminiLive.isConnected && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [geminiLive.messages, geminiLive.isConnected]);

  const [draftPages, setDraftPages] = useState(["IN THE COURT OF THE DISTRICT JUDGE...\n\n[Drafting starts here]"]);
  const [deskInput, setDeskInput] = useState('');
  const [deskLoading, setDeskLoading] = useState(false);
  const [deskChatHistory, setDeskChatHistory] = useState<any[]>([
    { role: 'ai', text: "Welcome to the Writing Desk. I can help you draft petitions and plaints." }
  ]);

  const [draftFacts, setDraftFacts] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [draftSuggestions, setDraftSuggestions] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);

  const activeSpeechIdRef = useRef<any>(null);
  const speechBaseFactsRef = useRef<string>('');

  // Automatically type spoken client/advocate turn transcriptions into draftFacts in real-time
  useEffect(() => {
    if (!geminiLive.isConnected) {
      activeSpeechIdRef.current = null;
      speechBaseFactsRef.current = '';
      return;
    }

    const messages = geminiLive.messages;
    if (messages.length === 0) {
      activeSpeechIdRef.current = null;
      speechBaseFactsRef.current = draftFacts;
      return;
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      const turnId = lastMsg.timestamp;
      
      if (activeSpeechIdRef.current !== turnId) {
        // Brand new user spoken segment, capture current draftFacts as base
        speechBaseFactsRef.current = draftFacts;
        activeSpeechIdRef.current = turnId;
      }

      const base = speechBaseFactsRef.current.trim();
      const speech = lastMsg.text.trim();
      if (speech) {
        const appended = base ? `${base}\n${speech}` : speech;
        setDraftFacts(appended);
      }
    } else {
      // User is not speaking (model reply or standby), reset turn tracking
      activeSpeechIdRef.current = null;
      speechBaseFactsRef.current = draftFacts;
    }
  }, [geminiLive.messages, geminiLive.isConnected]);
  const [draftCitations, setDraftCitations] = useState<CaseCitation[]>([]);
  const [isSearchingCitations, setIsSearchingCitations] = useState(false);
  const [showCitationsDropdown, setShowCitationsDropdown] = useState(false);
  const [isRewritingDraft, setIsRewritingDraft] = useState(false);
  const [citationSearchError, setCitationSearchError] = useState('');
  const [enlargedElement, setEnlargedElement] = useState<'facts' | 'model' | 'pad' | 'suggestions' | null>(null);

  // Synchronize muting Gemini Live voice playout during drafting / fact entry
  useEffect(() => {
    if (view === 'drafting' || enlargedElement === 'facts') {
      geminiLive.setMuteAudio(true);
    } else {
      geminiLive.setMuteAudio(false);
    }
  }, [view, enlargedElement, geminiLive.setMuteAudio]);

  const [draftEditorMode, setDraftEditorMode] = useState<'edit' | 'interactive'>('interactive');
  const [highlightedCitationId, setHighlightedCitationId] = useState<string | null>(null);
  const [showCustomPromptPage, setShowCustomPromptPage] = useState(false);
  const [customPromptText, setCustomPromptText] = useState('');
  const [isCustomPromptProcessing, setIsCustomPromptProcessing] = useState(false);
  const [autoSpeakWorkbenchResult, setAutoSpeakWorkbenchResult] = useState(false);
  const [customDirectives, setCustomDirectives] = useState<{ name: string; prompt: string }[]>(() => {
    try {
      const stored = localStorage.getItem('nexus_custom_directives');
      return stored ? JSON.parse(stored) : [
        { name: "MACT Claim Petition", prompt: "Format this as a comprehensive Motor Accident Claims Tribunal (MACT) claim petition. Include detailed columns for itemized expenses, exact ages, daily earnings, statutory interest, and specific medical disability categories under standard Indian motor vehicles protocols." }
      ];
    } catch (e) {
      return [
        { name: "MACT Claim Petition", prompt: "Format this as a comprehensive Motor Accident Claims Tribunal (MACT) claim petition. Include detailed columns for itemized expenses, exact ages, daily earnings, statutory interest, and specific medical disability categories under standard Indian motor vehicles protocols." }
      ];
    }
  });
  const [newDirectiveName, setNewDirectiveName] = useState('');
  const [newDirectivePrompt, setNewDirectivePrompt] = useState('');
  const [showAddDirectiveForm, setShowAddDirectiveForm] = useState(false);

  const [activeWorkbenchPanel, setActiveWorkbenchPanel] = useState(0);
  const workbenchContainerRef = useRef<HTMLDivElement>(null);

  const scrollToWorkbenchPanel = (panelIndex: number) => {
    if (!workbenchContainerRef.current) return;
    const container = workbenchContainerRef.current;
    
    const children = Array.from(container.children).filter(el => 
      el.classList.contains('snap-center') || el.classList.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      children[panelIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActiveWorkbenchPanel(panelIndex);
    }
  };

  const handleWorkbenchScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activeWorkbenchPanel && index >= 0 && index < 2) {
        setActiveWorkbenchPanel(index);
      }
    }
  };

  const [systemDirectives, setSystemDirectives] = useState<{ label: string; text: string }[]>(() => {
    try {
      const stored = localStorage.getItem('nexus_system_directives');
      return stored ? JSON.parse(stored) : [
        { label: "Kerala High Court Pleading Format", text: "Format this as a formal Writ Petition before the Hon'ble High Court of Kerala. Emphasize appropriate constitutional articles, add boilerplate headers, verification seals, and advocate signing margins." },
        { label: "Civil Injunction Restraint Specifics", text: "Formulate a standard relief of temporary injunction. Anchor it on prime principles: prima facie case, balance of convenience, and irreparable injury." },
        { label: "Highlight Lack Of Mens Rea / Intent", text: "Structure a strong defense emphasizing absolute lack of intention or knowledge. Elaborate the chronology of sequences point-by-point to substantiate lack of culpability." },
        { label: "Formal Show-cause Representation", text: "Prepare a detailed reply to the show-cause notice. Respond in a highly professional, respectful, yet robust legal defense style quoting standard administrative precedents." }
      ];
    } catch (e) {
      return [
        { label: "Kerala High Court Pleading Format", text: "Format this as a formal Writ Petition before the Hon'ble High Court of Kerala. Emphasize appropriate constitutional articles, add boilerplate headers, verification seals, and advocate signing margins." },
        { label: "Civil Injunction Restraint Specifics", text: "Formulate a standard relief of temporary injunction. Anchor it on prime principles: prima facie case, balance of convenience, and irreparable injury." },
        { label: "Highlight Lack Of Mens Rea / Intent", text: "Structure a strong defense emphasizing absolute lack of intention or knowledge. Elaborate the chronology of sequences point-by-point to substantiate lack of culpability." },
        { label: "Formal Show-cause Representation", text: "Prepare a detailed reply to the show-cause notice. Respond in a highly professional, respectful, yet robust legal defense style quoting standard administrative precedents." }
      ];
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
  const [workbenchDocuments, setWorkbenchDocuments] = useState<{
    id: string;
    name: string;
    size: string;
    type: string;
    content: string;
    base64Url?: string;
    status: 'idle' | 'processing' | 'done' | 'error';
  }[]>([]);
  const workbenchFileInputRef = useRef<HTMLInputElement>(null);

  const [workbenchCameraActive, setWorkbenchCameraActive] = useState(false);
  const workbenchVideoRef = useRef<HTMLVideoElement>(null);
  const workbenchStreamRef = useRef<MediaStream | null>(null);

  const [activePanel, setActivePanel] = useState(0);
  const draftingContainerRef = useRef<HTMLDivElement>(null);

  const scrollToPanel = (panelIndex: number) => {
    if (!draftingContainerRef.current) return;
    const container = draftingContainerRef.current;
    
    // Select only direct sliding panels (elements with the snap-center class)
    const children = Array.from(container.children).filter(el => 
      el.classList.contains('snap-center') || el.classList.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      children[panelIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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

  const [activeCommandPanel, setActiveCommandPanel] = useState(0);
  const commandContainerRef = useRef<HTMLDivElement>(null);

  const scrollToCommandPanel = (panelIndex: number) => {
    if (!commandContainerRef.current) return;
    const container = commandContainerRef.current;
    
    const children = Array.from(container.children).filter(el => 
      el.classList.contains('snap-center') || el.classList.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      children[panelIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActiveCommandPanel(panelIndex);
    }
  };

  const handleCommandScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activeCommandPanel && index >= 0 && index < 2) {
        setActiveCommandPanel(index);
      }
    }
  };

  const [activeReadPanel, setActiveReadPanel] = useState(0);
  const readContainerRef = useRef<HTMLDivElement>(null);

  const scrollToReadPanel = (panelIndex: number) => {
    if (!readContainerRef.current) return;
    const container = readContainerRef.current;
    
    const children = Array.from(container.children).filter(el => 
      el.classList.contains('snap-center') || el.classList.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      children[panelIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActiveReadPanel(panelIndex);
    }
  };

  const handleReadScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activeReadPanel && index >= 0 && index < 2) {
        setActiveReadPanel(index);
      }
    }
  };

  const [activeConvertPanel, setActiveConvertPanel] = useState(0);
  const convertContainerRef = useRef<HTMLDivElement>(null);

  const scrollToConvertPanel = (panelIndex: number) => {
    if (!convertContainerRef.current) return;
    const container = convertContainerRef.current;
    
    const children = Array.from(container.children).filter(el => 
      el.classList.contains('snap-center') || el.classList.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      children[panelIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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

  const [activeInstructionsPanel, setActiveInstructionsPanel] = useState(0);
  const instructionsContainerRef = useRef<HTMLDivElement>(null);

  const scrollToInstructionsPanel = (panelIndex: number) => {
    if (!instructionsContainerRef.current) return;
    const container = instructionsContainerRef.current;
    
    const children = Array.from(container.children).filter(el => 
      el.classList.contains('snap-center') || el.classList.contains('snap-start')
    );
    
    if (children && children[panelIndex]) {
      children[panelIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActiveInstructionsPanel(panelIndex);
    }
  };

  const handleInstructionsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const index = Math.round(scrollLeft / width);
      if (index !== activeInstructionsPanel && index >= 0 && index < 2) {
        setActiveInstructionsPanel(index);
      }
    }
  };

  const [isPromptDictating, setIsPromptDictating] = useState(false);
  const promptRecognitionRef = useRef<any>(null);

  const startPromptDictation = () => {
    if (isPromptDictating) {
      stopPromptDictation();
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Web Speech API is not supported in this browser.");
      return;
    }
    
    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = voiceLang;
      
      rec.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setCustomPromptText(prev => prev ? prev + " " + finalTranscript : finalTranscript);
        }
      };
      
      rec.onend = () => {
        setIsPromptDictating(false);
      };
      
      rec.start();
      promptRecognitionRef.current = rec;
      setIsPromptDictating(true);
    } catch (err) {
      console.error("Failed to start prompt dictation:", err);
    }
  };

  const stopPromptDictation = () => {
    if (promptRecognitionRef.current) {
      try {
        promptRecognitionRef.current.stop();
      } catch (e) {}
    }
    setIsPromptDictating(false);
  };

  const startWorkbenchCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      workbenchStreamRef.current = stream;
      setWorkbenchCameraActive(true);
      setTimeout(() => {
        if (workbenchVideoRef.current) {
          workbenchVideoRef.current.srcObject = stream;
        }
      }, 200);
    } catch (err) {
      alert("Could not start device camera. Please check camera permissions.");
    }
  };

  const captureWorkbenchCamera = () => {
    if (!workbenchVideoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = workbenchVideoRef.current.videoWidth || 640;
    canvas.height = workbenchVideoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(workbenchVideoRef.current, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg');
    
    if (workbenchStreamRef.current) {
      workbenchStreamRef.current.getTracks().forEach(t => t.stop());
      workbenchStreamRef.current = null;
    }
    setWorkbenchCameraActive(false);

    const docId = Math.random().toString(36).substr(2, 9);
    const sizeKB = (base64.length * 0.75 / 1024).toFixed(1) + ' KB';
    const newDoc = {
      id: docId,
      name: `Camera_${new Date().toLocaleTimeString().replace(/:/g, '-')}.jpg`,
      size: sizeKB,
      type: 'image/jpeg',
      content: '',
      base64Url: base64,
      status: 'processing' as const
    };

    setWorkbenchDocuments(prev => [...prev, newDoc]);

    aiEngine.generateResponse(
      "Please extract all legible text from this legal document image. Return only the raw text content without any other conversational output.", 
      [], 
      base64,
      'drafting'
    ).then(response => {
      setWorkbenchDocuments(prev => prev.map(d => d.id === docId ? { ...d, content: response.text, status: 'done' } : d));
    }).catch(error => {
      console.error("Camera OCR failed:", error);
      setWorkbenchDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'error' } : d));
    });
  };

  const cancelWorkbenchCamera = () => {
    if (workbenchStreamRef.current) {
      workbenchStreamRef.current.getTracks().forEach(t => t.stop());
      workbenchStreamRef.current = null;
    }
    setWorkbenchCameraActive(false);
  };

  const closeCustomPromptPage = () => {
    if (workbenchStreamRef.current) {
      workbenchStreamRef.current.getTracks().forEach(t => t.stop());
      workbenchStreamRef.current = null;
    }
    setWorkbenchCameraActive(false);
    setShowCustomPromptPage(false);
  };

  const handleWorkbenchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newDocs = Array.from(files).map(file => {
      const sizeKB = (file.size / 1024).toFixed(1) + ' KB';
      return {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: sizeKB,
        type: file.type,
        content: '',
        base64Url: '',
        status: 'idle' as const
      };
    });
    
    setWorkbenchDocuments(prev => [...prev, ...newDocs]);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const docId = newDocs[i].id;
      
      const reader = new FileReader();
      if (file.type.startsWith('image/')) {
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          setWorkbenchDocuments(prev => prev.map(d => d.id === docId ? { ...d, base64Url: base64, status: 'processing' } : d));
          
          try {
            const response = await aiEngine.generateResponse(
              "Please extract all legible text from this legal document image. Return only the raw text content without any other conversational output.", 
              [], 
              base64,
              'drafting'
            );
            setWorkbenchDocuments(prev => prev.map(d => d.id === docId ? { ...d, content: response.text, status: 'done' } : d));
          } catch (error) {
            console.error("OCR failed on workbench file:", error);
            setWorkbenchDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'error' } : d));
          }
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (event) => {
          const textContent = event.target?.result as string;
          setWorkbenchDocuments(prev => prev.map(d => d.id === docId ? { ...d, content: textContent, status: 'done' } : d));
        };
        reader.readAsText(file);
      }
    }
  };
  const enlargedElementRef = useRef(enlargedElement);
  useEffect(() => { enlargedElementRef.current = enlargedElement; }, [enlargedElement]);

  const [voiceAiOn, setVoiceAiOn] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'en-US' | 'ml-IN'>('en-US');
  const [sttEngine, setSttEngine] = useState<'webspeech' | 'chirp3' | 'whisper' | 'android'>(() => {
    const isMobileDetect = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileDetect ? 'android' : 'webspeech';
  });
  const [voiceAiTranscript, setVoiceAiTranscript] = useState("");
  const [voiceAiReply, setVoiceAiReply] = useState("");
  const [voiceAiStatus, setVoiceAiStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | string>('idle');
  const [voiceHistory, setVoiceHistory] = useState<AIMessage[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const voiceAiOnRef = useRef(false);
  const voiceAiStatusRef = useRef<'idle' | 'listening' | 'thinking' | 'speaking' | string>('idle');

  // Sync refs with state
  useEffect(() => { voiceAiOnRef.current = voiceAiOn; }, [voiceAiOn]);
  useEffect(() => { voiceAiStatusRef.current = voiceAiStatus; }, [voiceAiStatus]);

  // Synchronize state with geminiLive
  useEffect(() => {
    setVoiceAiOn(geminiLive.isConnected);
    setWhisperReady(geminiLive.isWhisperReady);
    setWhisperProgress(geminiLive.whisperProgress);
    setIsWhisperDownloading(geminiLive.isWhisperLoading);

    if (geminiLive.isConnected) {
      if (geminiLive.isModelSpeaking) {
        setVoiceAiStatus('speaking');
      } else if (geminiLive.isConnecting) {
        setVoiceAiStatus('thinking');
      } else {
        setVoiceAiStatus('listening');
      }

      setMicLevel(Math.min(100, Math.round(geminiLive.volume * 500)));

      // Populate voiceAiTranscript & voiceAiReply dynamically from newest messages
      const msgs = geminiLive.messages;
      if (msgs.length > 0) {
        const lastUser = [...msgs].reverse().find(m => m.role === 'user');
        const lastModel = [...msgs].reverse().find(m => m.role === 'model');
        if (lastUser) setVoiceAiTranscript(lastUser.text);
        if (lastModel) setVoiceAiReply(lastModel.text);
      }
    } else {
      setVoiceAiStatus('idle');
      setMicLevel(0);
    }
  }, [geminiLive.isConnected, geminiLive.isModelSpeaking, geminiLive.isConnecting, geminiLive.messages, geminiLive.volume, geminiLive.isWhisperReady, geminiLive.whisperProgress, geminiLive.isWhisperLoading]);

  // Restart voice AI when language changes
  useEffect(() => {
    if (voiceAiOn && voiceAiStatus === 'listening') {
      startVoiceAi();
    }
  }, [voiceLang]);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const networkErrorCountRef = useRef<number>(0);

  // Gemma 4 E4B Download State
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSlice, setDownloadSlice] = useState(0); // 0: none, 1: complete
  const [downloadMessage, setDownloadMessage] = useState('Nexus Justice Smart Download Active.');

  // Brain1 — Gemma-4 E2B Q3_K_M (primary)
  const [brain1Progress, setBrain1Progress] = useState(0);
  const [isBrain1Downloading, setIsBrain1Downloading] = useState(false);
  const [brain1Message, setBrain1Message] = useState('Nexus Gemma 4 E2B · ~1.2 GB · Q3_K_M · Next-Gen Intelligence');
  const [brain1Ready, setBrain1Ready] = useState(false);
  // Brain2 — Gemma-4 E4B (secondary)
  const [brain2Progress, setBrain2Progress] = useState(0);
  const [isBrain2Downloading, setIsBrain2Downloading] = useState(false);
  const [brain2Message, setBrain2Message] = useState('Nexus Gemma 4 E4B · ~2.1 GB · Q3_K_M · State-of-the-Art Legal Reasoning');
  const [brain2Ready, setBrain2Ready] = useState(false);

  // Whisper Speech-to-Text Model States
  const [whisperProgress, setWhisperProgress] = useState(0);
  const [isWhisperDownloading, setIsWhisperDownloading] = useState(false);
  const [whisperMessage, setWhisperMessage] = useState('WhisperMini (Xenova) · ~38 MB · whisper-tiny-quantized');
  const [whisperReady, setWhisperReady] = useState(false);

  // --- Hardware Scan & RAM constraints ---
  const [simulatedDevice, setSimulatedDevice] = useState<'laptop' | 'mobile'>(() => {
    const isMobileString = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileString ? 'mobile' : 'laptop';
  });

  const [simulatedRam, setSimulatedRam] = useState<number>(() => {
    return (navigator as any).deviceMemory || 8; // Default to 8 GB if not supported
  });

  const isLowRam = simulatedRam < 4;
  const isMobileHighRam = simulatedRam >= 4 && simulatedDevice === 'mobile';
  const isLaptopHighRam = simulatedRam >= 4 && simulatedDevice === 'laptop';

  const isBrain1Enabled = isLowRam || isLaptopHighRam;
  const isBrain2Enabled = !isLowRam;

  const [showCompatibilityBanner, setShowCompatibilityBanner] = useState(true);
  const [browserCompatibility, setBrowserCompatibility] = useState<{isCompatible: boolean, message: string}>({
    isCompatible: true,
    message: ''
  });

  useEffect(() => {
    const checkCompatibility = async () => {
      // @ts-ignore - Chrome built-in AI API
      const ai = (window as any).ai;
      if (!ai || !ai.languageModel) {
        setBrowserCompatibility({
          isCompatible: false,
          message: "🔒 High-Privacy Active: Local Gemma 4 Neural Core is managing all legal research. All data remains strictly on-device."
        });
      }
    };
    checkCompatibility();
  }, []);

  // Malayalam Model States
  const [malayalamStatus, setMalayalamStatus] = useState({
    ttsReady: false,
    sttReady: false,
    ttsProgress: 0,
    sttProgress: 0,
    isTTSLoading: false,
    isSTTLoading: false
  });

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const gemmaAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const watchdogTimerRef = useRef<any>(null);
  const sentenceQueueRef = useRef<string[]>([]);
  const isSpeakingQueueRef = useRef(false);
  const speechFinishedIntervalRef = useRef<any>(null);

  const startMicLevelMonitoring = async () => {
    try {
      const isMicActive = micStreamRef.current && micStreamRef.current.getTracks().some(t => t.readyState === 'live');
      if (isMicActive) {
        return; // Don't re-request and recreate if already active
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { await audioContextRef.current.close(); } catch(e) {}
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!voiceAiOnRef.current || !analyserRef.current) {
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
          }
          return;
        }
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setMicLevel(average);
        requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error("Mic level monitoring error:", err);
    }
  };

  const startSTTWatchdog = () => {
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = setTimeout(() => {
      if (voiceAiOnRef.current && voiceAiStatusRef.current === 'listening') {
        console.warn("STT watchdog triggered: No results for 10s. Restarting...");
        startVoiceAi();
      }
    }, 10000);
  };

  const startLocalSTT = async () => {
    setVoiceAiOn(true);
    setVoiceAiStatus('listening');
    const displayLang = voiceLang === 'ml-IN' ? "Malayalam" : "English";
    setVoiceAiTranscript(`Local Whisper STT Active (${displayLang})...`);
    
    const engine = MalayalamEngine.getInstance();
    if (!engine.getStatus().sttReady) {
      setVoiceAiStatus('thinking');
      setVoiceAiTranscript("Initializing local Whisper model weights. Please wait...");
      try {
        await handleDownloadWhisper(false);
      } catch (err) {
        console.error("Local STT initialization failed:", err);
        setVoiceAiTranscript("Error starting Whisper. Falling back to default Web Speech...");
        setSttEngine('webspeech');
        setTimeout(() => { if (voiceAiOnRef.current) startVoiceAi(); }, 1500);
        return;
      }
    }

    try {
      const audio = await engine.recordAudio(5000);
      if (audio && voiceAiOnRef.current) {
        setVoiceAiStatus('thinking');
        setVoiceAiTranscript("WhisperMini is transcribing...");
        const langCode = voiceLang === 'ml-IN' ? 'malayalam' : 'english';
        const text = await engine.transcribe(audio, langCode);
        if (text && voiceAiOnRef.current) {
          setVoiceAiTranscript(text);
          processVoiceCommand(text);
        } else if (voiceAiOnRef.current) {
          startLocalSTT(); // Loop restart
        }
      }
    } catch (err) {
      console.error("Local STT Error:", err);
      if (voiceAiOnRef.current) {
        startLocalSTT();
      }
    }
  };

  const startLocalMalayalamSTT = async () => {
    await startLocalSTT();
  };

  const startAndroidSTT = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Android/Mobile Speech recognition is not supported in this browser. Please use Chrome on Android.");
      return;
    }

    if (recognitionRef.current) {
      const old = recognitionRef.current;
      old.onend = null;
      old.onresult = null;
      old.onerror = null;
      old.onstart = null;
      try { old.stop(); } catch(e) {}
      recognitionRef.current = null;
      await new Promise(r => setTimeout(r, 150));
    }

    const isMicActive = micStreamRef.current && micStreamRef.current.getTracks().some(t => t.readyState === 'live');
    if (!isMicActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("Microphone access error for Android STT:", err);
        setVoiceAiOn(false);
        return;
      }
    }

    setVoiceAiOn(true);
    setVoiceAiStatus('listening');
    setVoiceAiTranscript("Listening (Android STT Optimized)...");
    setVoiceAiReply("");

    if (!isMicActive) {
      startMicLevelMonitoring();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Single-shot mode is exceptionally stable on mobile/Android
    recognition.interimResults = true;
    recognition.lang = voiceLang;

    let androidFinalTranscript = "";
    let isProcessed = false;

    recognition.onstart = () => {
      console.log("Android Speech Recognition session started");
      setVoiceAiStatus('Listening (Android)');
    };

    recognition.onspeechstart = () => {
      if (voiceAiStatusRef.current === 'speaking' || voiceAiStatusRef.current === 'thinking') {
        window.speechSynthesis.cancel();
        if (gemmaAudioRef.current) {
          try { gemmaAudioRef.current.pause(); } catch(e) {}
          gemmaAudioRef.current = null;
        }
        sentenceQueueRef.current = [];
        isSpeakingQueueRef.current = false;
        setVoiceAiStatus('listening');
      }
    };

    recognition.onresult = (event: any) => {
      const isListening = voiceAiStatusRef.current === 'listening' || voiceAiStatusRef.current.includes('Listening');
      if (!isListening) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          androidFinalTranscript = event.results[i][0].transcript;
        } else {
          interim = event.results[i][0].transcript;
        }
      }

      const text = (androidFinalTranscript || interim).trim();
      if (text) {
        setVoiceAiTranscript(text);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("Android Speech Recognition error event:", event.error);
      (recognition as any).lastError = event.error;
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      if (event.error === 'network') {
        setVoiceAiTranscript("Unstable mobile network. Reconnecting...");
      }
    };

    recognition.onend = () => {
      console.log("Android Speech Recognition session completed.");
      
      const currentText = voiceAiTranscript.trim();
      const hasContent = currentText && 
                         currentText !== "Listening..." && 
                         currentText !== "Listening (Android STT Optimized)..." && 
                         currentText !== "Speak now..." && 
                         currentText.length > 1;

      if (hasContent && !isProcessed) {
        isProcessed = true;
        processVoiceCommand(currentText);
      }

      if (voiceAiOnRef.current && (voiceAiStatusRef.current === 'listening' || voiceAiStatusRef.current.includes('Listening'))) {
        const cooldown = (recognition as any).lastError === 'network' ? 1200 : 150;
        setTimeout(() => {
          if (voiceAiOnRef.current && (voiceAiStatusRef.current === 'listening' || voiceAiStatusRef.current.includes('Listening'))) {
            startAndroidSTT();
          }
        }, cooldown);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to start Android speech recognizer:", e);
      setTimeout(() => { if (voiceAiOnRef.current) startAndroidSTT(); }, 500);
    }
  };

  const startVoiceAi = async () => {
    if (sttEngine === 'whisper') {
      startLocalSTT();
      return;
    }

    if (sttEngine === 'android') {
      startAndroidSTT();
      return;
    }

    if (!navigator.onLine) {
      if (sttEngine === 'chirp3' && whisperReady) {
        setVoiceAiStatus('thinking');
        setVoiceAiTranscript("Chirp 3 Cloud Offline. Seamlessly routing to local on-device Whisper engine...");
        setTimeout(() => {
          if (voiceAiOnRef.current) {
            startLocalSTT();
          }
        }, 1200);
        return;
      }
      if (voiceLang === 'ml-IN' && malayalamStatus.sttReady) {
        startLocalMalayalamSTT();
        return;
      }
      setVoiceAiStatus("Offline: STT requires internet.");
      setVoiceAiTranscript("Voice recognition is currently unavailable offline.");
      setVoiceAiOn(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    // Ensure we are starting fresh and the previous instance is fully disposed
    if (recognitionRef.current) {
      const old = recognitionRef.current;
      old.onend = null;
      old.onresult = null;
      old.onerror = null;
      old.onstart = null;
      try { old.stop(); } catch(e) {}
      recognitionRef.current = null;
      // Brief pause to allow the browser to release the audio device
      await new Promise(r => setTimeout(r, 200));
    }

    // Check if we already have an active mic stream
    const isMicActive = micStreamRef.current && micStreamRef.current.getTracks().some(t => t.readyState === 'live');

    if (!isMicActive) {
      // Check for microphone permission explicitly only if not active
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // We don't need to keep the stream, startMicLevelMonitoring will capture its own
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("Microphone access error:", err);
        alert("Microphone access denied or not available. Please check your browser settings.");
        setVoiceAiOn(false);
        return;
      }
    }

    setVoiceAiOn(true);
    setVoiceAiStatus('listening');
    setVoiceAiTranscript(sttEngine === 'chirp3' ? "Listening (Chirp 3 Premium)..." : "Listening...");
    setVoiceAiReply("");
    
    if (!isMicActive) {
      startMicLevelMonitoring();
    }
    startSTTWatchdog();

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.interimResults = true;
    recognition.lang = voiceLang;

    let finalTranscript = "";
    recognition.onstart = () => {
      console.log("Speech recognition started (Continuous)");
      setVoiceAiStatus(sttEngine === 'chirp3' ? 'Listening (Chirp 3)' : 'listening');
      // Reset network error counter when successfully started
      networkErrorCountRef.current = 0;
    };

    recognition.onspeechstart = () => {
      if (voiceAiStatusRef.current === 'speaking' || voiceAiStatusRef.current === 'thinking') {
        console.log("User barge-in (speechstart)");
        window.speechSynthesis.cancel();
        if (gemmaAudioRef.current) {
          try { gemmaAudioRef.current.pause(); } catch(e) {}
          gemmaAudioRef.current = null;
        }
        sentenceQueueRef.current = [];
        isSpeakingQueueRef.current = false;
        if (speechFinishedIntervalRef.current) {
          clearInterval(speechFinishedIntervalRef.current);
          speechFinishedIntervalRef.current = null;
        }
        setVoiceAiStatus('listening');
      }
    };

    recognition.onresult = (event: any) => {
      // Barge-in check
      if (voiceAiStatusRef.current === 'speaking' || voiceAiStatusRef.current === 'thinking') {
        window.speechSynthesis.cancel();
        if (gemmaAudioRef.current) { try { gemmaAudioRef.current.pause(); } catch(e) {} gemmaAudioRef.current = null; }
        sentenceQueueRef.current = [];
        isSpeakingQueueRef.current = false;
        setVoiceAiStatus('listening');
      }

      const isListening = voiceAiStatusRef.current === 'listening' || voiceAiStatusRef.current.includes('Listening');
      if (!isListening) return;

      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      const currentText = (finalTranscript + interimTranscript).trim();
      if (currentText) {
        setVoiceAiTranscript(currentText);
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          startSTTWatchdog();
        }
      }

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      // If we have any text, wait for 1.5s of silence before processing
      if (currentText.length > 2) {
        silenceTimerRef.current = setTimeout(() => {
          const stillListening = voiceAiStatusRef.current === 'listening' || voiceAiStatusRef.current.includes('Listening');
          if (stillListening) {
            processVoiceCommand(currentText);
            finalTranscript = ""; // Reset for next utterance
          }
        }, 1500); 
      }
    };

    recognition.onerror = (event: any) => {
      (recognition as any).lastError = event.error;
      if (event.error === 'aborted' || event.error === 'no-speech') {
        return; // onend handles restart silently
      }
      console.error("Speech Recognition Error:", event.error);
      
      if (sttEngine === 'chirp3' && (event.error === 'network' || event.error === 'not-allowed')) {
        console.warn("Chirp 3 Cloud connection dropped. Initiating on-device Whisper hybrid fallback...");
        setVoiceAiTranscript("Chirp 3 Cloud lost. Seamlessly running Local Whisper nodes...");
        setTimeout(() => {
          if (voiceAiOnRef.current) {
            startLocalSTT();
          }
        }, 1200);
        return;
      }

      if (event.error === 'not-allowed') {
        alert("Microphone access denied. Please check your browser permissions.");
        stopVoiceAi();
      } else if (event.error === 'network') {
        networkErrorCountRef.current += 1;
        if (networkErrorCountRef.current >= 3) {
          setVoiceAiReply("The browser speech recognition service is temporarily disconnected (Cloud Neural network error). Voice dictation has been paused to prevent connection errors. You can type directly or retry again shortly.");
          stopVoiceAi();
        } else {
          setVoiceAiReply(`Speech recognition struggling (network issue, reconnect attempt ${networkErrorCountRef.current}/3). Retrying shortly...`);
        }
      } else {
        console.warn(`Speech recognition encountered error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log("Speech recognition session ended.");
      // Clear watchdog on end
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      
      // If we are still in listening mode, it means it ended because continuous=false
      // We should restart it to keep listening for the next command
      if (voiceAiOnRef.current && voiceAiStatusRef.current === 'listening') {
        // Guard: do not restart if networkErrorCount >= 3
        if (networkErrorCountRef.current >= 3) {
          console.log("Pausing speech recognition due to continuous network failures.");
          return;
        }

        // Use a staggered backoff if the network was the issue
        const restartDelay = recognition.lastError === 'network' ? 3000 : 500;
        
        setTimeout(() => {
          if (voiceAiOnRef.current && voiceAiStatusRef.current === 'listening' && networkErrorCountRef.current < 3) {
            console.log("Restarting speech recognition instance...");
            startVoiceAi();
          }
        }, restartDelay);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to start recognition:", e);
      // If it fails because it's already started, that's fine, but if it's another error, try restart
      if (!String(e).includes('already started')) {
        setTimeout(() => { if (voiceAiOn) startVoiceAi(); }, 500);
      }
    }
  };

  const stopVoiceAi = () => {
    setVoiceAiOn(false);
    setVoiceAiStatus('idle');
    setMicLevel(0);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch(e) {}
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (gemmaAudioRef.current) {
      gemmaAudioRef.current.pause();
      gemmaAudioRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
  };

  const toggleVoiceAi = async () => {
    if (voiceAiOn) {
      stopVoiceAi();
    } else {
      const isMalayalam = voiceLang === 'ml-IN';
      const promptText = isMalayalam 
        ? "നമസ്കാരം, ഞാൻ എങ്ങനെ സഹായിക്കണം?"
        : " Good day, How can I help you today?";
        
      setVoiceAiOn(true);
      await speakResponse({
        text: promptText,
        model: "NEXUS ASSISTANT"
      });
    }
  };

  // Doc Converter Logic
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
      const response = await aiEngine.generateResponse(
        "Please extract all the text from this document for conversion into a formal document. Return only the text content.", 
        [], 
        converterImage,
        'drafting'
      );
      setConverterText(response.text);
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
  };

  const captureForConverter = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context?.drawImage(videoRef.current, 0, 0);
    const imageBase64 = canvasRef.current.toDataURL('image/jpeg');
    setConverterImage(imageBase64);
    setConverterText('');
    setConverterStatus('idle');
  };

  const handleTranslate = async () => {
    if (!converterText || !targetLanguage) return;
    setIsTranslating(true);
    try {
      const response = await aiEngine.generateResponse(
        `Translate the following legal document text into ${targetLanguage}. Maintain the formal legal tone and formatting. Text: ${converterText}`,
        [],
        undefined,
        'drafting'
      );
      setTranslatedText(response.text);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranslating(false);
    }
  };

  const processVoiceCommand = async (text: string) => {
    if (!text.trim() || text.trim().length < 2) {
      // If text is too short, just restart listening if it was stopped
      if (voiceAiOnRef.current && voiceAiStatusRef.current === 'listening') {
        setTimeout(() => {
          try { if (recognitionRef.current) recognitionRef.current.start(); } catch(e) {}
        }, 100);
      }
      return;
    }

    // Dictation mode for drafting facts
    if (enlargedElementRef.current === 'facts' || view === 'drafting') {
      setDraftFacts(prev => prev + (prev.trim() ? " " : "") + text);
      
      // Stop recognition while playing back transcript to prevent self-transcribing
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }

      setVoiceAiStatus('thinking');
      let aiReplyText = "";
      try {
        const isMalayalam = /[\u0D00-\u0D7F]/.test(text);
        let dynamicPrompt = "";
        
        const engineLabel = sttEngine === 'chirp3' ? 'Google Chirp 3 (Premium Cloud)' : sttEngine === 'whisper' ? 'whisper.cpp (Local high-performance)' : sttEngine === 'android' ? 'Android Speech Recogniser' : 'Web Speech Engine';
        
        if (isMalayalam) {
          dynamicPrompt = `You are a professional legal AI assistant for Kerala. Under the ${engineLabel} transcription, the user narrated a key case detail / story snippet: "${text}".
Please repeat or acknowledge the user's sentence in beautiful Malayalam, and then warmly, cordially encourage them to continue detailing the complete story of their case so we have all necessary facts recorded. Keep your feedback highly short, engaging, and brief (under 40 words) in Malayalam characters.`;
        } else {
          dynamicPrompt = `You are a professional legal AI assistant. Under the ${engineLabel} transcription, the user narrated a key case detail / story snippet: "${text}".
Please repeat or acknowledge what they narrated to confirm you received it correctly, and then warmly encourage them to keep going and tell the complete story of their case. Keep your response very conversational, concise, and short (under 40 words).`;
        }
        
        const responseRes = await aiEngine.generateResponse(dynamicPrompt, []);
        aiReplyText = responseRes.text;
      } catch (err) {
        const isMalayalam = /[\u0D00-\u0D7F]/.test(text);
        if (isMalayalam) {
          aiReplyText = `നിങ്ങൾ പറഞ്ഞത്: "${text}". ഞാൻ ഇത് രേഖപ്പെടുത്തിയിട്ടുണ്ട്. ദയവായി നിങ്ങളുടെ കേസിന്റെ ബാക്കി കഥ കൂടി വിശദമായി എന്നോട് പറയൂ.`;
        } else {
          aiReplyText = `You said: "${text}". I have recorded this fact. Please keep going and continue telling the complete story of your case.`;
        }
      }

      setVoiceAiReply(aiReplyText);
      await speakResponse({
        text: aiReplyText,
        model: sttEngine === 'chirp3' ? "Chirp 3" : sttEngine === 'whisper' ? "whisper.cpp" : sttEngine === 'android' ? "Android STT" : "AI Encourager"
      });
      return;
    }
    
    // Set state first to block STT restarts in onend
    setVoiceAiStatus('thinking');

    // Stop recognition while AI is thinking/speaking to avoid echo
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    
    // Clear any previous speech immediately
    window.speechSynthesis.cancel();
    if (gemmaAudioRef.current) {
      try { gemmaAudioRef.current.pause(); } catch(e) {}
      gemmaAudioRef.current = null;
    }
    
    setVoiceAiReply("");
    setView('consult');
    
    const userMsg: AIMessage = { role: 'user', content: text };
    setVoiceHistory(prev => [...prev, userMsg].slice(-10));
    setChatHistory(prev => [...prev, userMsg]);

    const currentHistory = [...voiceHistory, userMsg];

    // Watchdog for AI response
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = setTimeout(() => {
      if (voiceAiStatusRef.current === 'thinking') {
        console.warn("AI response watchdog triggered");
        setVoiceAiReply("I'm sorry, I'm taking too long to think. Please try again.");
        setVoiceAiStatus('idle');
        if (voiceAiOnRef.current) setTimeout(() => startVoiceAi(), 1000);
      }
    }, 15000);

    try {
      let fullText = "";
      const stream = aiEngine.generateResponseStream(text, currentHistory, 'voice');
      
      let currentSentence = "";
      sentenceQueueRef.current = [];
      isSpeakingQueueRef.current = false;

      const playNextInQueue = async () => {
        if (!voiceAiOnRef.current) return;
        if (sentenceQueueRef.current.length === 0) {
          isSpeakingQueueRef.current = false;
          return;
        }
        isSpeakingQueueRef.current = true;
        const nextSentence = sentenceQueueRef.current.shift()!;
        await speakTextChunk(nextSentence);
        playNextInQueue();
      };

      const speakTextChunk = async (chunk: string) => {
        return new Promise<void>(async (resolve) => {
          if (!voiceAiOnRef.current) {
            resolve();
            return;
          }

          // Safety timeout to prevent hanging the queue
          const timeout = setTimeout(() => {
            console.warn("speakTextChunk timeout reached for:", chunk.substring(0, 20));
            resolve();
          }, 10000);

          const safeResolve = () => {
            clearTimeout(timeout);
            resolve();
          };

          const cleanChunk = cleanStreamingText(chunk)
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#/g, '')
            .replace(/__/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .trim();
          
          if (!cleanChunk) {
            safeResolve();
            return;
          }

          const isMalayalam = /[\u0D00-\u0D7F]/.test(cleanChunk);
          if (isMalayalam) {
            try {
              const base64Audio = await aiEngine.generateGemmaTTS(cleanChunk);
              if (base64Audio) {
                setVoiceAiStatus('Speaking (Gemma Voice Sync)...');
                const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
                gemmaAudioRef.current = audio;
                audio.onended = () => {
                  gemmaAudioRef.current = null;
                  safeResolve();
                };
                audio.onerror = () => {
                  gemmaAudioRef.current = null;
                  safeResolve();
                };
                audio.play();
                return;
              }
            } catch (e) { console.error(e); }
          }

          // Fallback to browser TTS (Optimized for speed)
          setVoiceAiStatus(`Answering (${isMalayalam ? 'Malayalam' : 'English'})...`);
          
          const utterance = new SpeechSynthesisUtterance(cleanChunk);
          (window as any).currentUtterance = utterance; // Prevent GC
          utterance.rate = 1.25; // Faster for immediate feedback
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          
          // Get voices with a retry mechanism if none are available
          let voices = window.speechSynthesis.getVoices();
          if (voices.length === 0) {
            // Wait briefly for voices to load
            await new Promise(r => setTimeout(r, 100));
            voices = window.speechSynthesis.getVoices();
          }
          
          let selectedVoice = null;
          if (isMalayalam) {
            selectedVoice = voices.find(v => v.lang.startsWith('ml')) || voices.find(v => v.lang.startsWith('hi'));
          } else {
            selectedVoice = voices.find(v => (v.name.includes('Google') || v.name.includes('Natural')) && v.lang.startsWith('en')) 
                            || voices.find(v => v.lang.startsWith('en'));
          }
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang; // Match voice language code precisely
          } else {
            utterance.lang = isMalayalam ? 'ml-IN' : 'en-US';
          }

          utterance.onstart = () => {
            setVoiceAiStatus(`Speaking...`);
          };

          utterance.onend = () => {
            safeResolve();
          };
          
          utterance.onerror = (e) => {
            console.error("Speech Error:", e);
            safeResolve();
          };

          // CRITICAL: Some browsers require a kickstart
          window.speechSynthesis.speak(utterance);
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        });
      };

      let sourceModel = aiStatus.voiceModel;
      
      for await (const chunk of stream) {
        if (!voiceAiOnRef.current) break;
        if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        
        const { text, model, status } = chunk;
        if (model) sourceModel = model;
        
        if (status) {
          setVoiceAiStatus(status);
          continue;
        }

        if (text) {
          fullText += text;
          setVoiceAiReply(fullText);
          
          // Only update status label once when answering starts
          if (voiceAiStatusRef.current !== 'Answering...') {
            setVoiceAiStatus('Answering...');
          }

          currentSentence += text;
          
          // FAST CHUNKING: Split by punctuation marks (., !, ?, \n, ,, ;) for immediate reading
          if (/[.!?\n,;:]/.test(text)) {
            const parts = currentSentence.split(/([.!?\n,;:])/);
            // Process chunks that have a delimiter
            for (let i = 0; i < parts.length - 1; i += 2) {
              const sentencePart = (parts[i] + (parts[i+1] || "")).trim();
              if (sentencePart.length > 3) {
                sentenceQueueRef.current.push(sentencePart);
                if (!isSpeakingQueueRef.current) {
                  playNextInQueue();
                }
              }
            }
            currentSentence = parts[parts.length - 1] || "";
          }

          // Force chunking for long mid-sentence pauses (over 60 chars)
          if (currentSentence.length > 60) {
            sentenceQueueRef.current.push(currentSentence.trim());
            currentSentence = "";
            if (!isSpeakingQueueRef.current) playNextInQueue();
          }
        }
      }

      // Final sentence if any
      if (currentSentence.trim() && voiceAiOnRef.current) {
        sentenceQueueRef.current.push(currentSentence.trim());
        if (!isSpeakingQueueRef.current) playNextInQueue();
      }

      const newAssistantMsg: AIMessage = { 
        role: 'assistant', 
        content: fullText, 
        model: sourceModel 
      };
      setVoiceHistory(prev => [...prev, newAssistantMsg].slice(-10));
      setChatHistory(prev => [...prev, newAssistantMsg]);
      
      // Language Auto-Switching: If AI responded in Malayalam, switch user input to Malayalam for next turn
      const isReplyMalayalam = /[\u0D00-\u0D7F]/.test(fullText);
      if (isReplyMalayalam && voiceLang !== 'ml-IN') {
        console.log("Switching voice STT to Malayalam for next turn");
        setVoiceLang('ml-IN');
      }

      // Wait for all speech to finish before restarting listener
      if (speechFinishedIntervalRef.current) clearInterval(speechFinishedIntervalRef.current);
      speechFinishedIntervalRef.current = setInterval(() => {
        if (!isSpeakingQueueRef.current && !window.speechSynthesis.speaking && !gemmaAudioRef.current) {
          clearInterval(speechFinishedIntervalRef.current);
          speechFinishedIntervalRef.current = null;
          if (voiceAiOnRef.current) {
            setVoiceAiStatus('listening');
            setVoiceAiTranscript("Listening...");
            setTimeout(() => {
              if (voiceAiOnRef.current) startVoiceAi();
            }, 500);
          }
        }
      }, 500);

    } catch (err) {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      setVoiceAiReply("Error: Failed to connect to AI engine. Please check your connection.");
      setVoiceAiStatus('idle');
      // Restart listening if still on
      if (voiceAiOnRef.current) {
        setTimeout(() => startVoiceAi(), 1000);
      }
    }
  };

  const speakResponse = async (response: AIResponse) => {
    const text = response.text;
    const model = response.model;
    
    setVoiceAiStatus(`Answering (${model})...`);
    
    if (text.startsWith("Error:")) {
      setVoiceAiStatus('idle');
      if (voiceAiOn) setTimeout(() => startVoiceAi(), 3000);
      return;
    }

    // Cancel any ongoing speech to prevent overlap or stuck state
    window.speechSynthesis.cancel();

    setVoiceAiStatus('speaking');
    const cleanText = cleanStreamingText(text)
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/__/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // Detect if the text contains Malayalam characters
    const isMalayalam = /[\u0D00-\u0D7F]/.test(cleanText);

    // If Malayalam, try local Malayalam TTS first
    if (isMalayalam && malayalamStatus.ttsReady) {
      try {
        const audioBuffer = await MalayalamEngine.getInstance().speak(cleanText);
        if (audioBuffer) {
          if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.onended = () => {
            setVoiceAiStatus('listening');
            setVoiceAiTranscript("Listening...");
            if (voiceAiOnRef.current) {
              setTimeout(() => {
                if (voiceAiOnRef.current) startVoiceAi();
              }, 500);
            }
          };
          source.start();
          return;
        }
      } catch (err) {
        console.error("Local Malayalam TTS Error:", err);
      }
    }

    // If Malayalam, try Gemma TTS first
    if (isMalayalam) {
      try {
        const base64Audio = await aiEngine.generateGemmaTTS(cleanText);
        if (base64Audio) {
          const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
          gemmaAudioRef.current = audio;
          audio.onended = () => {
            console.log("Gemma TTS ended");
            gemmaAudioRef.current = null;
            setVoiceAiStatus('listening');
            setVoiceAiTranscript("Listening...");
            if (voiceAiOnRef.current) {
              setTimeout(() => {
                if (voiceAiOnRef.current) startVoiceAi();
              }, 500);
            }
          };
          audio.onerror = (e) => {
            console.error("Gemma TTS error:", e);
            gemmaAudioRef.current = null;
            // Fallback to browser TTS if Gemma fails
            fallbackToBrowserTTS(cleanText, true);
          };
          audio.play();
          return;
        }
      } catch (err) {
        console.error("Failed to use Gemma TTS:", err);
      }
    }

    // Fallback to browser TTS
    fallbackToBrowserTTS(cleanText, isMalayalam);
  };

  const fallbackToBrowserTTS = (cleanText: string, isMalayalam: boolean) => {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance; // Keep reference to prevent GC
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Attempt to select a high-quality English voice
    const voices = window.speechSynthesis.getVoices();
    
    let selectedVoice = null;
    if (isMalayalam) {
      selectedVoice = voices.find(v => v.lang.startsWith('ml')) || voices.find(v => v.lang.startsWith('hi'));
    } else {
      selectedVoice = voices.find(v => (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Natural')) && v.lang.startsWith('en')) 
                      || voices.find(v => v.lang.startsWith('en'));
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang; // Match voice language precisely
    } else {
      utterance.lang = isMalayalam ? 'ml-IN' : 'en-US';
    }

    utterance.onstart = () => {
      console.log("Speech started");
    };

    utterance.onend = () => {
      console.log("Speech synthesis ended");
      setVoiceAiStatus('listening');
      setVoiceAiTranscript("Listening...");
      utteranceRef.current = null;
      // Restart listening after speaking
      if (voiceAiOnRef.current) {
        setTimeout(() => {
          if (voiceAiOnRef.current) {
            startVoiceAi();
          }
        }, 500);
      }
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setVoiceAiStatus('listening');
      setVoiceAiTranscript("Listening...");
      utteranceRef.current = null;
      if (voiceAiOnRef.current) startVoiceAi();
    };

    // Small delay to ensure cancel() has finished
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);
  };
  const [autoAnswerEnabled, setAutoAnswerEnabled] = useState(false);
  const [callInstructions, setCallInstructions] = useState<{ caller: string, instruction: string }[]>([
    { caller: 'Babu', instruction: 'meet me after 5\'o clock' },
    { caller: 'Clerk', instruction: 'Bring A4 paper' }
  ]);
  const [newCaller, setNewCaller] = useState('');
  const [newInstruction, setNewInstruction] = useState('');
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [selectedCall, setSelectedCall] = useState<any>(null);
  useEffect(() => {
    // Warm up speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
    
    setAiStatus(aiEngine.getStatus());
    const timer = setInterval(() => {
      setAiStatus(aiEngine.getStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [callViewTab, setCallViewTab] = useState<'log' | 'transcript'>('log');

  useEffect(() => {
    // Check connection type if supported
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    const updateConnection = () => {
      if (!conn) {
        setConnectionType('wifi'); // Default to wifi if API not supported (common on desktop)
        return;
      }

      // 'type' is more specific (wifi, cellular, etc.) but not always available
      // 'effectiveType' is more about speed (4g, 3g, etc.)
      const type = conn.type;
      const effectiveType = conn.effectiveType;

      if (type) {
        if (type === 'wifi' || type === 'ethernet') {
          setConnectionType('wifi');
        } else if (type === 'cellular') {
          setConnectionType('mobile');
        } else {
          setConnectionType('unknown');
        }
      } else if (effectiveType) {
        // Fallback for browsers that only support effectiveType
        // On desktop, effectiveType '4g' is common for both Wifi and fast Mobile.
        // We'll assume wifi if it's not explicitly cellular (which 'type' would have caught)
        // or if we're on a desktop-like environment.
        if (effectiveType === '4g') setConnectionType('wifi');
        else setConnectionType('mobile');
      } else {
        setConnectionType('wifi');
      }
    };

    if (conn) {
      conn.addEventListener('change', updateConnection);
      updateConnection();
      return () => conn.removeEventListener('change', updateConnection);
    } else {
      updateConnection();
    }
  }, []);

  // handleDownloadGemma4 redirects to Brain2 tab and starts download
  const handleDownloadGemma4 = () => {
    setView('brain2');
    // We add a slight delay to ensure the view has switched before starting the heavy load
    setTimeout(() => {
      if (isLowRam) {
        handleDownloadBrain1();
      } else {
        handleDownloadBrain2();
      }
    }, 100);
  };

  const handleDownloadBrain1 = async () => {
    setIsBrain1Downloading(true);
    setBrain1Progress(1); 
    setBrain1Message("🚀 Initiating Brain1 Nexus Engine...");
    setBrain1Ready(false);
    setDownloadProgress(1);
    setIsDownloading(true);
    setDownloadMessage("🚀 Initiating Brain1 Nexus Engine...");

    const engine = HybridAIEngine.getInstance();
    try {
      await engine.loadBrain1((progress, text) => {
        setBrain1Progress(progress);
        setBrain1Message(text);
        // Sync with legacy state for components using it
        setDownloadProgress(progress);
        setIsDownloading(progress < 100);
        setDownloadMessage(text);
      }, false);

      const status = engine.getStatus();
      setBrain1Ready(status.isBrain1Ready);
      setBrain1Message(status.isBrain1Ready 
        ? "✅ Brain1 (Nexus Gemma 4 E2B) is live via CPU/WASM."
        : `⚠️ ${status.brain1Message}`);
      
      if (status.isBrain1Ready) {
        engine.setActiveBrain('brain1');
      }
    } catch (err) {
      console.error("Brain1 load exception:", err);
      setBrain1Message(`⚠️ Exception: ${(err as Error).message}`);
      setDownloadMessage(`⚠️ Exception: ${(err as Error).message}`);
    } finally {
      setIsBrain1Downloading(false);
      setIsDownloading(false);
    }
    setAiStatus(engine.getStatus());
  };

  const handleDownloadBrain2 = async () => {
    setIsBrain2Downloading(true);
    setBrain2Progress(1);
    setBrain2Message("🚀 Initiating Brain2 Nexus Engine...");
    setBrain2Ready(false);

    const engine = HybridAIEngine.getInstance();
    try {
      await engine.loadBrain2((progress, text) => {
        setBrain2Progress(progress);
        setBrain2Message(text);
        // Sync with legacy state for components using it
        setDownloadProgress(progress);
        setIsDownloading(progress < 100);
        setDownloadMessage(text);
      }, false);

      const status = engine.getStatus();
      setBrain2Ready(status.isBrain2Ready);
      setBrain2Message(status.isBrain2Ready 
        ? "✅ Brain2 (Nexus Gemma-4 E4B) is live via CPU/WASM."
        : `⚠️ ${status.brain2Message}`);

      if (status.isBrain2Ready) {
        engine.setActiveBrain('brain2');
      }
    } catch (err) {
      console.error("Brain2 load exception:", err);
      setBrain2Message(`⚠️ Exception: ${(err as Error).message}`);
    } finally {
      setIsBrain2Downloading(false);
    }
    setAiStatus(engine.getStatus());
  };

  const activateBrain = (brain: 'brain1' | 'brain2') => {
    const engine = HybridAIEngine.getInstance();
    engine.setActiveBrain(brain);
    setAiStatus(engine.getStatus());
  };

  const handleDownloadMalayalamTTS = async () => {
    const engine = MalayalamEngine.getInstance();
    await engine.loadTTS((progress) => {
      setMalayalamStatus(prev => ({ ...prev, ttsProgress: progress, isTTSLoading: progress < 100 }));
    });
    setMalayalamStatus(engine.getStatus());
  };

  const handleDownloadMalayalamSTT = async () => {
    const engine = MalayalamEngine.getInstance();
    await engine.loadSTT((progress) => {
      setMalayalamStatus(prev => ({ ...prev, sttProgress: progress, isSTTLoading: progress < 100 }));
    });
    setMalayalamStatus(engine.getStatus());
  };

  const handleDownloadWhisper = async (force = false) => {
    if (isWhisperDownloading) return;

    const engine = MalayalamEngine.getInstance();
    if (engine.getStatus().sttReady && !force) {
      setWhisperProgress(100);
      setWhisperReady(true);
      setWhisperMessage("✅ Local WhisperMini (Xenova) model cached & active.");
      return;
    }

    try {
      setIsWhisperDownloading(true);
      setWhisperProgress(1);
      setWhisperMessage("🚀 Initiating WhisperMini (Xenova) download...");
      setWhisperReady(false);

      await engine.loadSTT((progress) => {
        setWhisperProgress(progress);
        setWhisperMessage(`📥 Torrenting model: ${progress}% processed...`);
      });

      setWhisperProgress(100);
      setWhisperReady(true);
      setWhisperMessage("✅ Local WhisperMini (Xenova) model loaded successfully.");
    } catch (err) {
      console.error("Whisper download error:", err);
      setWhisperProgress(0);
      setWhisperReady(false);
      setWhisperMessage(`⚠️ Error: ${(err as Error).message}. Check network connection.`);
    } finally {
      setIsWhisperDownloading(false);
    }
  };

  // Automatically trigger Whisper background check and download when the app opens
  useEffect(() => {
    handleDownloadWhisper(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      await localDB.init();
      const savedClients = localDB.query("SELECT * FROM clients");
      if (savedClients.length > 0) {
        setClients(savedClients);
      } else {
        const initial = [
          { id: 1, name: 'Elena Rodriguez', phone: '+1 555-0199', court: 'District Court, Aluva', case_number: 'OS 145/2025', next_date: '2026-03-15', purpose: 'Filing Written Statement' },
        ];
        initial.forEach(c => {
          localDB.run("INSERT INTO clients (name, phone, case_number, court, next_date, purpose) VALUES (?, ?, ?, ?, ?, ?)", 
            [c.name, c.phone, c.case_number, c.court, c.next_date, c.purpose]);
        });
        setClients(initial);
      }
      setAiStatus(aiEngine.getStatus());
      setMalayalamStatus(MalayalamEngine.getInstance().getStatus());
      
      // Auto-trigger Whisper local model download on app open
      handleDownloadWhisper();
    };
    init();
  }, []);

  const sendConsult = async (initialText?: string) => {
    const text = initialText || consoleInput.trim();
    if (!text || consoleLoading) return;
    
    if (!initialText) setConsoleInput("");

    if (!aiStatus.isLocalReady) {
      const userMsg: AIMessage = { role: 'user', content: text };
      setChatHistory(prev => [...prev, userMsg, { role: 'assistant', content: "⚠️ Local Neural Core is not active. Please go to the **BRAIN** tab and download Brain1 or Brain2 to enable local AI consulting.", model: "System" } as AIMessage]);
      return;
    }
    
    const userMsg: AIMessage = { role: 'user', content: text };
    setChatHistory(prev => [...prev, userMsg]);
    setConsoleLoading(true);
    
    // Determine task type: Search if it starts with "search" or "find"
    const isSearch = text.toLowerCase().startsWith('search') || text.toLowerCase().startsWith('find');
    const task = isSearch ? 'search' : 'general';

    const currentHistory = [...chatHistory, userMsg];

    try {
      console.log("Sending request to AI Engine (Streaming):", text, task);
      const stream = aiEngine.generateResponseStream(text, currentHistory, task);
      
      let fullText = "";
      let sourceModel = aiStatus.voiceModel;
    
    // Add a placeholder assistant message with a status indicator
    setChatHistory(prev => [...prev, { role: 'assistant', content: "*Neural engine processing...*", model: sourceModel } as AIMessage]);
    
    for await (const chunk of stream) {
      const { text: fragment, model, status } = chunk;
      if (model) sourceModel = model;
      
      if (status) {
        setChatHistory(prev => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant' && !fullText) {
            last.content = `*${status}*`;
          }
          return h;
        });
        continue;
      }

      if (fragment) {
        if (!fullText) fullText = "";
        fullText += fragment;
        
        // Immediate state update for responsiveness
        setChatHistory(prev => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant') {
            last.content = fullText;
            last.model = sourceModel;
          }
          return h;
        });
      }
    }
      
      // Update voice history for continuity
      setVoiceHistory(prev => {
        const h = [...prev, userMsg, { role: 'assistant', content: fullText, model: sourceModel } as AIMessage];
        return h.slice(-10);
      });

    } catch (err) { 
      console.error("Consultation Error:", err); 
      setChatHistory(prev => [...prev, { role: 'assistant', content: "⚠️ Neural connection interrupted. Please try again.", model: "Error" } as AIMessage]);
    } finally { 
      setConsoleLoading(false); 
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDownloadMessage = (text: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_answer_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteMessage = (index: number) => {
    setChatHistory(prev => prev.filter((_, i) => i !== index));
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

      const response = await aiEngine.generateResponse(prompt, [], undefined, 'drafting');
      setDraftPages([response.text]);

      // Get suggestions
      const suggestionPrompt = `Review the following legal draft and provide 3-5 specific suggestions for improvement or additional points to consider. Provide the suggestions as a bulleted list. Draft to review:
${response.text}`;
      const suggestions = await aiEngine.generateResponse(suggestionPrompt, [], undefined, 'drafting');
      setDraftSuggestions(suggestions.text);

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

        const citationsResponse = await aiEngine.generateResponse(citationPrompt, [], undefined, 'drafting');
        const parsed = parseCitations(citationsResponse.text);
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

      const response = await aiEngine.generateResponse(rewritePrompt, [], undefined, 'drafting');
      setDraftPages([response.text]);
      
      // Update suggestions for the rewritten draft
      const suggestionPrompt = `Review the following rewritten legal draft and provide 3-5 specific suggestions for further improvement. Provide the suggestions as a bulleted list. Draft:
${response.text}`;
      const suggestions = await aiEngine.generateResponse(suggestionPrompt, [], undefined, 'drafting');
      setDraftSuggestions(suggestions.text);
    } catch (err: any) {
      console.error("Failed to rewrite draft with citations:", err);
    } finally {
      setIsRewritingDraft(false);
    }
  };

  const handleDownloadDraft = (text: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    saveAs(blob, `Nexus_Draft_${new Date().getTime()}.txt`);
  };

  const handleDownloadSuggestions = () => {
    if (!draftSuggestions) return;
    const blob = new Blob([draftSuggestions], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `Nexus_Suggestions_${new Date().getTime()}.txt`);
  };

  const handleCustomPromptDrafting = async (target: 'draft' | 'suggestions') => {
    if (isCustomPromptProcessing) return;
    setIsCustomPromptProcessing(true);
    setCitationSearchError('');
    
    try {
      const factsText = draftFacts.trim() || "(No facts provided yet)";
      const modelTemplate = draftModel.trim() ? `Model Draft / Template Guide:\n${draftModel.trim()}` : "";
      
      let docsContentSection = "";
      if (workbenchDocuments.length > 0) {
        docsContentSection = "\n\nUploaded Supporting Case Documents:\n" + workbenchDocuments.map((doc, idx) => {
          return `--- Document #${idx + 1}: ${doc.name} (Type: ${doc.type}) ---
Extracted Content / Refined Text:
${doc.content || "(No extracted text or processing error)"}
`;
        }).join("\n");
      }
      
      let prompt = "";
      if (target === 'draft') {
        prompt = `You are an elite legal drafting expert specializing in Indian legal pleadings and court documents.
The user wants a customized legal draft based on:

Case Facts:
${factsText}

${modelTemplate}
${docsContentSection}

User's Specific Instructions & Prompt:
"${customPromptText}"

Please analyze the facts, synthesize any uploaded supporting case documents, and follow the user's specific instructions to generate an exceptionally high-quality, professional court-ready draft. 
Return ONLY the direct text of the petition/plaint itself, with structured headings, formal legal tone, and appropriate statutory references. Keep the document comprehensive.`;
      } else {
        prompt = `You are a senior judicial scholar and elite legal advisor.
The user wants a customized, professional set of improvement suggestions and legal strategies based on:

Case Facts:
${factsText}

${modelTemplate}
${docsContentSection}

User's Specific Instructions & Prompt:
"${customPromptText}"

Please analyze the facts, the uploaded supporting case documents, current document structure, and the user's specific instructions. Give 3 to 6 highly detailed, professional improvement recommendations, key statutory avenues, or formatting changes. 
Format your output cleanly using markdown with bold headings and bullet points.`;
      }

      // If we have an image among uploaded documents, leverage it as visual model input!
      const firstImageDoc = workbenchDocuments.find(d => d.base64Url);
      const payloadImage = firstImageDoc ? firstImageDoc.base64Url : undefined;

      const response = await aiEngine.generateResponse(prompt, [], payloadImage, 'drafting');
      
      if (target === 'draft') {
        setDraftPages([response.text]);
        
        setIsSearchingCitations(true);
        try {
          const citationPrompt = `You are an expert legal researcher specializing in Indian Supreme Court and High Court judgments.
Based on the following facts of the case:
"${factsText}"

${docsContentSection}

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
          const citationsResponse = await aiEngine.generateResponse(citationPrompt, [], undefined, 'drafting');
          const parsed = parseCitations(citationsResponse.text);
          setDraftCitations(parsed);
          setShowCitationsDropdown(true);
        } catch (err) {
          console.error("Citations fail under custom prompt:", err);
        } finally {
          setIsSearchingCitations(false);
        }
      } else {
        setDraftSuggestions(response.text);
      }
      
      if (workbenchStreamRef.current) {
        workbenchStreamRef.current.getTracks().forEach(t => t.stop());
        workbenchStreamRef.current = null;
      }
      setWorkbenchCameraActive(false);

      setShowCustomPromptPage(false);

      if (autoSpeakWorkbenchResult) {
        speakResponse({ text: response.text, model: target === 'draft' ? "Custom Case Draft" : "Case Suggestions" });
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
      const response = await aiEngine.generateResponse(text, [], undefined, 'drafting');
      setDeskChatHistory(prev => [...prev, { role: 'ai', text: response }]);
    } catch (err) { console.error(err); } finally { setDeskLoading(false); }
  };

  const simulateIncomingCall = () => {
    setIncomingCall({
      id: Date.now(),
      clientName: "Elena Rodriguez",
      phone: "+1 555-0199",
      timestamp: new Date().toLocaleString(),
      duration: "0s",
      transcript: [],
      summary: "Incoming Call..."
    });
  };

  const handleAutoAnswer = async () => {
    if (!incomingCall) return;
    setIsAnswering(true);
    
    // Check for specific instructions
    const callerName = incomingCall?.clientName || '';
    const instruction = callInstructions.find(i => 
      callerName.toLowerCase().includes(i.caller.toLowerCase())
    );

    const isMalayalam = voiceLang === 'ml-IN';
    let greeting = "";
    
    if (isMalayalam) {
      greeting = instruction 
        ? `നമസ്കാരം, ഇത് നെക്സസ് ജസ്റ്റിസ് AI അസിസ്റ്റന്റ് ആണ്. നിങ്ങളുടെ കോളിനെക്കുറിച്ച്, ${instruction.instruction}.`
        : `നമസ്കാരം, ${callerName || 'നിങ്ങളുടെ'} കോളിനായി നെക്സസ് ജസ്റ്റിസ് AI അസിസ്റ്റന്റ് സംസാരിക്കുന്നു. ഞാൻ എങ്ങനെ സഹായിക്കണം?`;
    } else {
      greeting = instruction 
        ? `Hello, this is the Nexus Justice AI assistant. Regarding your call, ${instruction.instruction}.`
        : `Hello, this is the Nexus Justice AI assistant for ${callerName || 'your call'}. How can I assist you today?`;
    }
    
    // Use local Malayalam TTS if ready
    if (isMalayalam && malayalamStatus.ttsReady) {
      try {
        const audioBuffer = await MalayalamEngine.getInstance().speak(greeting);
        if (audioBuffer) {
          if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.start();
        }
      } catch (err) {
        console.error("Auto-answer Malayalam TTS Error:", err);
      }
    } else {
      const utterance = new SpeechSynthesisUtterance(greeting);
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => isMalayalam ? v.lang.startsWith('ml') : v.lang.startsWith('en'));
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang; // Match voice language precisely
      } else {
        utterance.lang = isMalayalam ? 'ml-IN' : 'en-US';
      }
      window.speechSynthesis.speak(utterance);
    }

    setTimeout(() => {
      setIncomingCall(null);
      setIsAnswering(false);
      // Automatically start Voice AI session after answering to continue the conversation
      startVoiceAi();
    }, 5000);
  };

  useEffect(() => {
    if (incomingCall && autoAnswerEnabled && !isAnswering) {
      const timer = setTimeout(() => {
        handleAutoAnswer();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [incomingCall, autoAnswerEnabled, isAnswering]);

  const startScan = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanPhase('live');
    } catch (err) { setScanPhase('error'); }
  };

  const captureScan = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setScanPhase('processing');
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context?.drawImage(videoRef.current, 0, 0);
    const imageBase64 = canvasRef.current.toDataURL('image/jpeg');
    try {
      const response = await aiEngine.generateResponse("Extract text from this legal document. Provide only the text found.", [], imageBase64);
      setScannedText(response.text);
      setScanPhase('done');
      // Auto-read the extracted text
      speakResponse(response);
    } catch (err) { setScanPhase('error'); } finally {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  };

  return (
    <div style={S.page} className="fixed inset-0 z-[100] selection:bg-indigo-500/30">
      {/* SIDEBAR */}
      <div style={S.sidebar} className="custom-scrollbar">
        <div className="w-full aspect-square bg-amber-500 flex items-center justify-center mb-4">
          <span className="text-2xl font-black text-black">T</span>
        </div>
        {sideNav.map(item => {
          const label = item.id === 'brain2' 
            ? ((brain1Ready && brain2Ready) ? 'Brains Ready' : (isBrain1Downloading || isBrain2Downloading ? 'Downloading...' : 'Brain Manager'))
            : item.label;
          return (
            <button key={item.id} onClick={() => setView(item.id)} title={label} style={S.sideBtn(view === item.id)}>
              <Icon path={item.icon} size={20} />
              {view === item.id && <div style={{ position: 'absolute', left: 0, width: 3, height: 24, background: '#f59e0b', borderRadius: '0 3px 3px 0' }} />}
            </button>
          );
        })}
        <div className="mt-auto pb-4">
          <button onClick={onBack} className="w-12 h-12 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors" title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={S.header}>
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-black tracking-widest uppercase flex items-center gap-2">
              <span className="text-slate-200">NEXUS</span>
              <span className="text-indigo-500">JUSTICE</span>
              <span className="text-[10px] text-slate-500 font-bold ml-2">GEMMA 4 EDITION</span>
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isOffline ? (
              <div className="bg-red-500/10 text-red-400 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border border-red-500/20 animate-pulse">
                <WifiOff size={12} /> OFFLINE MODE
              </div>
            ) : (
              <div className="bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border border-emerald-500/20">
                <Shield size={12} /> LOCAL ACTIVE
              </div>
            )}
            <div className="bg-indigo-500/10 text-indigo-400 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border border-indigo-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> {aiStatus.isLocalReady ? 'GEMMA 4 LOCAL ACTIVE' : 'GEMMA 4 NATIVE ACTIVE'}
            </div>
          </div>
        </header>

        <div className="flex bg-[#070b14] border-b border-white/5 px-6 overflow-x-auto whitespace-nowrap custom-scrollbar">
          {topTabs.map(tab => {
            const label = tab.id === 'brain2'
              ? ((brain1Ready && brain2Ready) ? 'BRAINS READY' : (isBrain1Downloading || isBrain2Downloading ? 'LOADING BRAINS...' : 'BRAIN MANAGER'))
              : tab.label;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-4 py-4 text-[10px] font-black tracking-widest transition-all relative inline-block ${view === tab.id ? 'text-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {label}
                {view === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
              </button>
            );
          })}
        </div>

        <main style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#020617' }}>
          <NeuralFlow />
          <AnimatePresence mode="wait">
            {view === 'command' && (
              <motion.div key="command" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="p-3 md:p-6 gap-3 md:gap-6">
                {/* Mobile Slider Navigation */}
                <div className="flex md:hidden bg-[#090e18] border border-white/10 p-2 rounded-2xl justify-around items-center shrink-0 z-30 select-none mb-2">
                  <button 
                    onClick={() => scrollToCommandPanel(0)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeCommandPanel === 0 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    1. Voice & Rules
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToCommandPanel(1)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeCommandPanel === 1 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    2. Call Logs
                  </button>
                </div>

                <div 
                  ref={commandContainerRef}
                  onScroll={handleCommandScroll}
                  className="flex-1 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar gap-6"
                >
                  {/* Left Column */}
                  <div className="w-[calc(100vw-72px)] md:w-[400px] flex-shrink-0 snap-center flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-1 pb-4">
                    <div style={S.card} className="relative overflow-hidden flex-shrink-0">
                      <div className="text-[10px] font-black text-amber-500 tracking-[0.2em] mb-2">HYBRID AI NODE</div>
                      <h2 className="text-4xl font-black italic text-slate-200 mb-8">Command<span className="text-slate-500">Center</span></h2>
                      
                      <div className="bg-white/5 border border-white/5 rounded-3xl p-6 mb-6">
                        <div className="flex justify-between items-center mb-6">
                          <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase">VOICE NODE</div>
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        </div>
                        
                        <div className="flex gap-3 mb-4">
                          <button onClick={toggleVoiceAi} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${voiceAiOn ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white shadow-[0_4px_15px_rgba(99,102,241,0.3)]'}`}>
                            {voiceAiOn ? 'Stop' : 'Start'}
                          </button>
                            <button 
                              onClick={() => handleDownloadGemma4()}
                              className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-black text-sm text-slate-300 hover:bg-white/10 transition-all"
                            >
                              {isDownloading ? 'Downloading...' : downloadProgress === 100 ? 'Reload Neural Weights' : 'Download Neural weights'}
                            </button>
                        </div>

                        {/* Local Whisper Speech-to-Text Model Auto-Download Progress */}
                        <div className="mb-6 p-3 bg-[#0a0f1d] border border-white/5 rounded-2xl space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${whisperReady ? 'bg-emerald-500' : 'bg-indigo-500 animate-pulse'}`} />
                              Offline Whisper STT
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-wider ${whisperReady ? 'text-emerald-400' : 'text-indigo-400'}`}>
                              {whisperReady ? 'ACTIVE' : whisperProgress > 0 && whisperProgress < 100 ? `${whisperProgress}%` : 'DOWNLOADING'}
                            </span>
                          </div>
                          <div className="h-[3px] w-full bg-slate-950 overflow-hidden rounded-full border border-white/5">
                            <motion.div 
                              className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                              animate={{ width: `${whisperProgress}%` }} 
                              transition={{ ease: 'easeOut' }} 
                            />
                          </div>
                          <div className="text-[10px] text-slate-400 leading-relaxed italic">
                            {whisperMessage}
                          </div>
                          {!whisperReady && !isWhisperDownloading && (
                            <button
                              onClick={() => handleDownloadWhisper(true)}
                              className="w-full mt-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 hover:text-white border border-indigo-500/20 text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Retry Whisper STT Download
                            </button>
                          )}
                        </div>

                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-slate-300">Enable auto answering?</span>
                          <button onClick={() => setAutoAnswerEnabled(!autoAnswerEnabled)} className={`w-10 h-5 rounded-full relative transition-all ${autoAnswerEnabled ? 'bg-indigo-500' : 'bg-slate-800'}`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${autoAnswerEnabled ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="text-[10px] text-slate-500 font-medium">Install app for best results</div>
                          <button onClick={simulateIncomingCall} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">Simulate Call</button>
                        </div>
                      </div>

                      {/* AI Auto-Responder Rules (Restored for convenience) */}
                      <div className="bg-white/5 border border-white/5 rounded-3xl p-6 mb-6">
                        <div className="text-[10px] font-black text-amber-400 tracking-widest uppercase mb-4">AUTO-RESPONDER RULES</div>
                        
                        <div className="space-y-3 mb-6 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                          {callInstructions.map((rule, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 group">
                              <div className="flex-1">
                                <div className="text-[10px] font-black text-indigo-400 uppercase">{rule.caller}</div>
                                <div className="text-xs text-slate-300 italic">"{rule.instruction}"</div>
                              </div>
                              <button 
                                onClick={() => setCallInstructions(callInstructions.filter((_, i) => i !== idx))}
                                className="text-slate-500 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          {callInstructions.length === 0 && (
                            <div className="text-[10px] text-slate-500 italic text-center py-4">No active rules</div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <input 
                            value={newCaller}
                            onChange={(e) => setNewCaller(e.target.value)}
                            placeholder="Caller name"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/50 transition-all"
                          />
                          <input 
                            value={newInstruction}
                            onChange={(e) => setNewInstruction(e.target.value)}
                            placeholder="Instruction"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/50 transition-all"
                          />
                          <button 
                            onClick={() => {
                              if (newCaller && newInstruction) {
                                setCallInstructions([...callInstructions, { caller: newCaller, instruction: newInstruction }]);
                                setNewCaller('');
                                setNewInstruction('');
                              }
                            }}
                            className="w-full py-2 bg-white/5 border border-white/10 rounded-xl font-black text-[10px] text-indigo-400 hover:bg-white/10 transition-all uppercase tracking-widest"
                          >
                            Add Rule
                          </button>
                        </div>
                      </div>

                      {/* Gemma 4 E4B Model Management */}
                      <div className="bg-white/5 border border-white/5 rounded-3xl p-6 mb-6">
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase">Model Management</div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold">{connectionType === 'wifi' ? 'Wi-Fi' : connectionType === 'mobile' ? 'Mobile Data' : 'Unknown'}</span>
                            <div className={`w-2 h-2 rounded-full ${connectionType === 'wifi' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-bold text-slate-200">Gemma 4 E4B</div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              {downloadProgress === 100 ? 'Downloaded' : 'Not Downloaded'}
                            </div>
                          </div>

                          {(isDownloading || (downloadProgress > 0 && downloadProgress < 100)) && (
                            <div className="space-y-2">
                              <div className="h-[2px] w-full bg-transparent overflow-hidden border border-blue-500/10 rounded-full">
                                <motion.div 
                                  className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${downloadProgress}%` }}
                                />
                              </div>
                              <div className="text-[9px] text-slate-400 italic">{downloadMessage}</div>
                            </div>
                          )}

                          {downloadMessage && !isDownloading && (downloadProgress === 0 || downloadProgress === 100) && (
                            <div className="text-[9px] text-slate-400 italic">{downloadMessage}</div>
                          )}

                          <div className="flex gap-2">
                            {downloadProgress < 100 && (
                              <button 
                                onClick={() => handleDownloadGemma4()}
                                disabled={isDownloading}
                                className="flex-1 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                              >
                                {isDownloading ? 'Downloading...' : 'Download Gemma 4 E4B'}
                              </button>
                            )}
                            <button 
                              onClick={() => speakResponse({ text: "Audio test successful. Nexus Justice is ready to assist you.", model: "System" })}
                              className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl font-black text-[10px] text-indigo-400 hover:bg-white/10 transition-all uppercase tracking-widest flex items-center gap-2"
                              title="Test Audio Output"
                            >
                              <Volume2 size={12} />
                              Test
                            </button>
                          </div>
                        </div>
                      </div>

                      <div style={S.card} className="flex-1 flex flex-col overflow-hidden p-0">
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                          <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase">Conversation History</div>
                          <div className="text-[10px] font-black text-slate-500 uppercase">{voiceHistory.length} MESSAGES</div>
                        </div>
                          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                            {voiceHistory.map((msg, i) => (
                              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} mb-2`}>
                                <div className={`max-w-[90%] p-5 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600/20 text-white border border-indigo-500/30' : 'bg-white/5 text-slate-300 border border-white/5'}`}>
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-1.5 h-1.5 rounded-full ${msg.role === 'user' ? 'bg-indigo-400' : 'bg-emerald-500'}`} />
                                    <span className="text-[9px] font-black text-slate-500 tracking-widest uppercase">{msg.role === 'user' ? 'USER QUERY' : (msg.model || 'NEXUS RESPONSE')}</span>
                                  </div>
                                  <div className="markdown-body text-sm leading-relaxed">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                      </div>

                      <div className="flex items-end gap-1.5 h-12 mb-6">
                        {[0.4, 0.7, 0.3, 0.9, 0.5, 0.8, 0.4, 0.6, 0.3, 0.7, 0.5, 0.9, 0.4, 0.6, 0.3, 0.8, 0.5, 0.7].map((h, i) => (
                          <div key={i} className="flex-1 bg-amber-500/80 rounded-full" style={{ height: `${h * 100}%` }} />
                        ))}
                      </div>

                      <div className="text-[10px] font-black text-slate-600 tracking-widest">SYSTEM: NEURAL CORE</div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center flex flex-col gap-6 overflow-hidden">
                    <div style={S.card} className="flex-1 flex flex-col overflow-hidden p-0">
                      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
                        <div className="text-[10px] font-black text-amber-500 tracking-widest uppercase">CALL LOGS & TRANSCRIPTS</div>
                        <div className="text-[10px] font-black text-slate-500 uppercase">{SIMULATED_CALLS.length} CALLS RECORDED</div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {SIMULATED_CALLS.map(call => (
                          <div 
                            key={call.id} 
                            onClick={() => setSelectedCall(selectedCall?.id === call.id ? null : call)} 
                            className={`p-5 bg-white/5 border transition-all group rounded-3xl cursor-pointer ${
                              selectedCall?.id === call.id ? 'border-amber-500/50 bg-white/10' : 'border-white/5 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                selectedCall?.id === call.id ? 'bg-amber-500 text-black' : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                              }`}>
                                <Users size={20} />
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                  <div className="font-black text-slate-200">{call.clientName}</div>
                                  <div className="text-[10px] font-black text-slate-500">{call.timestamp}</div>
                                </div>
                                <div className="text-xs text-slate-500 mb-3">{call.phone}</div>
                                <div className="text-xs text-slate-400 italic leading-relaxed">{call.summary}</div>
                              </div>
                              <div className="text-[10px] font-black text-slate-600 self-end">Duration: {call.duration}</div>
                            </div>

                            <AnimatePresence>
                              {selectedCall?.id === call.id && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                                    <div className="text-[9px] font-black text-indigo-400 tracking-widest uppercase mb-2">TRANSCRIPT</div>
                                    <div className="bg-black/20 p-4 rounded-2xl space-y-4 border border-white/5">
                                      {call.transcript?.map((t: any, i: number) => (
                                        <div key={i} className="space-y-1">
                                          <div className={`text-[9px] font-black uppercase tracking-widest ${t.role === 'client' ? 'text-amber-500' : 'text-indigo-400'}`}>{t.role}</div>
                                          <div className="text-sm text-slate-300 leading-relaxed">{t.text}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'consult' && (
              <motion.div key="consult" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#070b14]">
                  <div>
                    <h2 className="text-3xl font-black italic text-slate-200">AI <span className="text-indigo-500">Consult</span></h2>
                    <div className="text-[10px] font-black text-slate-500 tracking-widest uppercase mt-1">Legal Intelligence & Case Analysis</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      <span className="text-[9px] font-black text-indigo-400 tracking-widest uppercase">
                        {aiStatus.voiceModel} Active
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {chatHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 border border-indigo-500/20">
                        <MessageSquare size={40} className="text-indigo-500" />
                      </div>
                      <h3 className="text-xl font-black italic text-slate-300 mb-2">No Active Consultation</h3>
                      <p className="text-sm text-slate-500 max-w-xs">Ask a question or use voice commands to start a legal analysis session.</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] p-6 rounded-3xl border ${
                          msg.role === 'user' 
                            ? 'bg-indigo-600 border-indigo-500 text-white rounded-tr-none' 
                            : 'bg-white/5 border-white/10 text-slate-200 rounded-tl-none'
                        }`}>
                          {msg.role === 'assistant' && (
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-5 h-5 bg-indigo-500 rounded-lg flex items-center justify-center">
                                <Cpu size={12} className="text-white" />
                              </div>
                              <span className="text-[9px] font-black text-indigo-400 tracking-widest uppercase">
                                {msg.model || 'NEXUS AI'}
                              </span>
                            </div>
                          )}
                          <div className="markdown-body">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          
                          {msg.role === 'assistant' && (
                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                              <div className="w-4 h-4 bg-indigo-500/20 rounded flex items-center justify-center">
                                <Cpu size={10} className="text-indigo-400" />
                              </div>
                              <span className="text-[8px] font-black text-slate-500 tracking-widest uppercase">
                                Response Source: <span className={msg.model?.includes('Local') ? 'text-emerald-400' : 'text-indigo-400'}>{msg.model || 'Gemma 4 E4B'}</span>
                              </span>
                            </div>
                          )}

                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {msg.role === 'assistant' && (
                                <>
                                  <button 
                                    onClick={() => handleCopy(msg.content)}
                                    className="text-slate-500 hover:text-indigo-400 transition-all p-1.5 hover:bg-white/5 rounded-lg"
                                    title="Copy Answer"
                                  >
                                    <Copy size={13} />
                                  </button>
                                  <button 
                                    onClick={() => handleDownloadMessage(msg.content)}
                                    className="text-slate-500 hover:text-indigo-400 transition-all p-1.5 hover:bg-white/5 rounded-lg"
                                    title="Download Answer"
                                  >
                                    <Download size={13} />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => handleDeleteMessage(i)}
                                className={`${msg.role === 'user' ? 'text-white/40 hover:text-white' : 'text-slate-500 hover:text-red-400'} transition-all p-1.5 hover:bg-white/5 rounded-lg`}
                                title="Delete Message"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                <div className="p-6 bg-[#070b14] border-t border-white/5">
                  <div className="max-w-4xl mx-auto relative">
                    <input 
                      value={consoleInput}
                      onChange={(e) => setConsoleInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendConsult()}
                      placeholder="Ask the AI anything..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-slate-200 outline-none focus:border-indigo-500/50 transition-all pr-16"
                    />
                    <button 
                      onClick={() => sendConsult()}
                      disabled={consoleLoading}
                      className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all disabled:opacity-50"
                    >
                      {consoleLoading ? <RotateCcw size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'feed' && (
              <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-6 overflow-y-auto space-y-6">
                <h2 className="text-3xl font-black italic text-slate-200">Activity <span className="text-slate-500">Feed</span></h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div style={S.card}>
                    <div className="text-[10px] font-black text-amber-500 tracking-widest mb-4">UPCOMING HEARINGS</div>
                    <div className="space-y-4">
                      {clients.map(c => (
                        <div key={c.id} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 font-black">{c.name[0]}</div>
                          <div className="flex-1">
                            <div className="text-sm font-bold">{c.name}</div>
                            <div className="text-[10px] text-slate-500">{c.court}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-black text-emerald-500">{c.next_date}</div>
                            <div className="text-[9px] text-slate-600">{c.purpose}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={S.card}>
                    <div className="text-[10px] font-black text-indigo-500 tracking-widest mb-4">PLATFORM UPDATES</div>
                    <div className="space-y-4">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <div className="text-sm font-bold mb-1">Nexus v3.1 Released</div>
                        <div className="text-xs text-slate-500">New hybrid AI engine with offline support is now active.</div>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <div className="text-sm font-bold mb-1">Bar Council Integration</div>
                        <div className="text-xs text-slate-500">Direct filing integration for High Court is coming soon.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'clients' && (
              <motion.div key="clients" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-6 overflow-y-auto space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-black italic text-slate-200">Client <span className="text-slate-500">Registry</span></h2>
                  <button className="bg-indigo-600 px-6 py-2.5 rounded-2xl font-black text-xs tracking-widest uppercase">Add Client</button>
                </div>
                <div style={S.card} className="overflow-hidden p-0">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-[600px] text-left">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Name</th>
                          <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Case Number</th>
                          <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Court</th>
                          <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Next Date</th>
                          <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {clients.map(c => (
                          <tr key={c.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <div className="text-sm font-bold">{c.name}</div>
                              <div className="text-[10px] text-slate-500">{c.phone}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded text-[10px] font-black">{c.case_number}</span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">{c.court}</td>
                            <td className="px-6 py-4 text-xs text-emerald-500 font-bold">{c.next_date}</td>
                            <td className="px-6 py-4">
                              <button className="text-slate-500 hover:text-white transition-colors"><Edit3 size={16} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'knowledge' && (
              <motion.div key="knowledge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-6 overflow-y-auto space-y-6">
                <h2 className="text-3xl font-black italic text-slate-200">Legal <span className="text-slate-500">Knowledge Base</span></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { title: 'The Railways Act, 1989', category: 'Railway Law', year: '1989' },
                    { title: 'Transfer of Property Act, 1882', category: 'Property Law', year: '1882' },
                    { title: 'Indian Penal Code', category: 'Criminal Law', year: '1860' },
                    { title: 'Cooperative Societies Act', category: 'Cooperative Law', year: '1912' },
                    { title: 'Industrial Disputes Act', category: 'Labour Law', year: '1947' },
                  ].map((doc, i) => (
                    <div key={i} style={S.card} className="group hover:border-indigo-500/30 transition-all cursor-pointer">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 mb-4 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-all">
                        <BookOpen size={24} />
                      </div>
                      <div className="text-[9px] font-black text-indigo-500 tracking-widest uppercase mb-1">{doc.category}</div>
                      <div className="text-sm font-bold mb-2">{doc.title}</div>
                      <div className="text-[10px] text-slate-500">Enacted: {doc.year}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'drafting' && (
              <motion.div key="drafting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col overflow-hidden">
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
                  <div className="p-6 border-b border-white/5">
                    <div className="text-[10px] font-black text-indigo-500 tracking-widest uppercase">CASE INPUTS</div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Fact of the Case</label>
                        <button onClick={() => setEnlargedElement('facts')} className="p-1 text-slate-500 hover:text-indigo-400 transition-colors" title="Enlarge">
                          <Maximize2 size={12} />
                        </button>
                      </div>
                      <textarea 
                        value={draftFacts} 
                        onChange={e => setDraftFacts(e.target.value)}
                        placeholder="Enter the facts of the case here..."
                        className="w-full h-48 bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 focus:border-indigo-500 transition-colors resize-none custom-scrollbar"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Model Draft / Template</label>
                        <button onClick={() => setEnlargedElement('model')} className="p-1 text-slate-500 hover:text-indigo-400 transition-colors" title="Enlarge">
                          <Maximize2 size={12} />
                        </button>
                      </div>
                      <textarea 
                        value={draftModel} 
                        onChange={e => setDraftModel(e.target.value)}
                        placeholder="Upload or paste a model draft..."
                        className="w-full h-48 bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 focus:border-indigo-500 transition-colors resize-none custom-scrollbar"
                      />
                    </div>
                    <button 
                      onClick={handleAIDrafting}
                      disabled={isDrafting || !draftFacts.trim()}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-black text-[10px] text-white uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      {isDrafting ? <RotateCcw size={14} className="animate-spin" /> : <Zap size={14} />}
                      {isDrafting ? "GENERATING..." : "GENERATE DRAFT"}
                    </button>
                  </div>
                </div>

                {/* Middle Panel: Writing Pad */}
                <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center flex flex-col border-r border-white/5 bg-slate-950/10">
                  <div className="h-12 bg-white/5 border-b border-white/5 flex items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                      <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase mr-4">TEMPORARY WRITING PAD</div>
                      
                      {/* Mode Toggle Tabs */}
                      <div className="flex bg-[#070b14] p-0.5 rounded-lg border border-white/5">
                        <button
                          onClick={() => setDraftEditorMode('interactive')}
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md tracking-wider transition-all ${
                            draftEditorMode === 'interactive'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          Quick-Link View
                        </button>
                        <button
                          onClick={() => setDraftEditorMode('edit')}
                          className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-md tracking-wider transition-all ${
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
                      <button onClick={() => setEnlargedElement('pad')} className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors" title="Enlarge"><Maximize2 size={16} /></button>
                      <button onClick={() => handleCopy(draftPages[0])} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Copy"><Copy size={16} /></button>
                      <button onClick={() => handleDownloadDraft(draftPages[0])} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Download"><Download size={16} /></button>
                    </div>
                  </div>

                  {/* Case Citations Dropdown / Panel */}
                  {(isSearchingCitations || draftCitations.length > 0 || citationSearchError) && (
                    <div className="bg-[#090e18] border-b border-white/10">
                      {/* Accordion Trigger/Header */}
                      <button 
                        onClick={() => setShowCitationsDropdown(!showCitationsDropdown)}
                        className="w-full px-6 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen size={14} className="text-amber-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                            Court Precedents & Citations
                          </span>
                          {isSearchingCitations && (
                            <span className="text-[9px] text-indigo-400 font-bold ml-2 animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                              Scanning Cases...
                            </span>
                          )}
                          {!isSearchingCitations && draftCitations.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black">
                              {draftCitations.length} Precedent{draftCitations.length > 1 ? 's' : ''} Found
                            </span>
                          )}
                          {!isSearchingCitations && draftCitations.length === 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-400/10 border border-red-500/20 text-red-400 text-[9px] font-black">
                              No Precedents Found
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-500 uppercase">
                            {showCitationsDropdown ? 'COLLAPSE' : 'EXPAND'}
                          </span>
                          <ChevronRight 
                            size={16} 
                            className={`text-slate-400 transform transition-transform duration-200 ${showCitationsDropdown ? 'rotate-90' : ''}`} 
                          />
                        </div>
                      </button>

                      {/* Accordion Content */}
                      <AnimatePresence>
                        {showCitationsDropdown && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-white/5 bg-black/40"
                          >
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
                                  <span className="text-[10px] font-bold tracking-wider text-slate-400">ANALYZING LEGAL ARCHIVES & RETRIEVING CITATIONS...</span>
                                </div>
                              )}

                              {/* No citation state */}
                              {!isSearchingCitations && draftCitations.length === 0 && !citationSearchError && (
                                <div className="py-6 flex flex-col items-center justify-center gap-1.5 text-center">
                                  <AlertCircle size={20} className="text-amber-500/80 animate-bounce" />
                                  <span className="text-xs font-semibold text-amber-500/90">No case is found now.</span>
                                  <p className="text-[10px] text-slate-500 max-w-md">Our neural legal indexes returned no favorable match for these exact case facts at this moment.</p>
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
                                    <div className="text-[9px] text-slate-500 font-bold">
                                      Select citations and click run to incorporate precedents and rewrite draft.
                                    </div>
                                    <button
                                      onClick={handleRewriteWithCitations}
                                      disabled={isRewritingDraft || draftCitations.filter(c => c.selected).length === 0}
                                      className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-black text-[10px] text-white uppercase tracking-widest transition-all flex items-center gap-2"
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
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <div className="flex-1 p-10 bg-black/20 overflow-y-auto custom-scrollbar">
                    {draftEditorMode === 'interactive' ? (
                      <div className="max-w-2xl mx-auto bg-white/5 p-12 rounded-lg shadow-2xl min-h-full font-serif text-slate-300 leading-relaxed outline-none">
                        {renderDraftWithQuickLinks(draftPages[0])}
                      </div>
                    ) : (
                      <div className="max-w-2xl mx-auto bg-white/5 p-12 rounded-lg shadow-2xl min-h-full font-serif text-slate-300 leading-relaxed whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={(e) => setDraftPages([e.currentTarget.innerText])}>
                        {draftPages[0]}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel: Suggestions & Chat */}
                <div className="w-[calc(100vw-72px)] md:w-80 flex-shrink-0 snap-center flex flex-col bg-[#070b14] border-l border-white/5">
                  <div className="h-12 bg-white/5 border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-black text-emerald-500 tracking-widest uppercase">AI SUGGESTIONS</div>
                      <button 
                        onClick={() => setShowCustomPromptPage(true)}
                        className="px-2 py-0.5 bg-indigo-600/20 hover:bg-indigo-600 border border-[#818cf8]/10 text-indigo-400 hover:text-white rounded-md text-[8px] font-black tracking-wider transition-all uppercase cursor-pointer block"
                        title="Configure custom drafting & suggestion instruction prompts"
                      >
                        PROMPT
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEnlargedElement('suggestions')} className="p-1 text-slate-500 hover:text-emerald-400 transition-colors" title="Enlarge"><Maximize2 size={14} /></button>
                      <button onClick={() => handleCopy(draftSuggestions)} className="p-1 text-slate-500 hover:text-white transition-colors" title="Copy" disabled={!draftSuggestions}><Copy size={14} /></button>
                      <button onClick={handleDownloadSuggestions} className="p-1 text-slate-500 hover:text-white transition-colors" title="Download" disabled={!draftSuggestions}><Download size={14} /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {draftSuggestions && (
                      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                        <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Info size={12} /> Improvement Points
                        </div>
                        <div className="text-[11px] text-slate-300 leading-relaxed markdown-body">
                          <ReactMarkdown>{draftSuggestions}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="text-[10px] font-black text-slate-500 tracking-widest uppercase">CHAT ASSISTANT</div>
                      {deskChatHistory.map((msg, i) => (
                        <div key={i} className={`p-4 rounded-2xl text-xs leading-relaxed markdown-body ${msg.role === 'ai' ? 'bg-white/5 border border-white/10' : 'bg-indigo-600/20 border border-indigo-600/30'}`}>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-6 border-t border-white/5">
                    <div className="flex gap-2">
                      <input value={deskInput} onChange={e => setDeskInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendDeskChat()} placeholder="Refine draft..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs" />
                      <button onClick={sendDeskChat} className="bg-indigo-600 p-2 rounded-xl"><Send size={14} /></button>
                    </div>
                  </div>
                </div>
                </div> {/* End sliding panels wrapper */}
              </motion.div>
            )}

            {view === 'notif' && (
              <motion.div key="notif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-6 overflow-y-auto space-y-6">
                <h2 className="text-3xl font-black italic text-slate-200">Notifications</h2>
                <div className="space-y-4">
                  {[
                    { title: 'System Update', message: 'Nexus Justice v3.1 is now live with hybrid AI capabilities.', time: '2 hours ago', type: 'info' },
                    { title: 'New Case Assigned', message: 'You have a new case request from Elena Rodriguez.', time: '5 hours ago', type: 'case' },
                    { title: 'Subscription Renewal', message: 'Your Elite plan expires in 15 days.', time: '1 day ago', type: 'warning' },
                  ].map((n, i) => (
                    <div key={i} style={S.card} className="flex gap-4 items-start">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.type === 'warning' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'}`}>
                        {n.type === 'warning' ? <AlertTriangle size={20} /> : <Info size={20} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-sm font-bold">{n.title}</div>
                          <div className="text-[10px] text-slate-500">{n.time}</div>
                        </div>
                        <div className="text-xs text-slate-400 leading-relaxed">{n.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'support' && (
              <motion.div key="support" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-6 flex flex-col gap-4">
                <h2 className="text-3xl font-black italic text-slate-200">Help & <span className="text-slate-500">Support</span></h2>
                <div className="flex-1 bg-slate-900/50 border border-white/5 rounded-3xl p-6 overflow-y-auto space-y-4">
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed bg-white/5 border border-white/10">
                      Hello! I am the Nexus Support Assistant. How can I help you today?
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <input placeholder="Describe your issue..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm" />
                  <button className="bg-indigo-600 px-6 rounded-2xl font-bold">Send</button>
                </div>
              </motion.div>
            )}

            {view === 'read' && (
              <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-3 md:p-6 flex flex-col overflow-hidden">
                {/* Mobile Slider Navigation */}
                <div className="flex md:hidden bg-[#090e18] border border-white/10 p-2 rounded-2xl justify-around items-center shrink-0 z-30 select-none mb-3">
                  <button 
                    onClick={() => scrollToReadPanel(0)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeReadPanel === 0 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    1. Camera Scanner
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToReadPanel(1)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeReadPanel === 1 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    2. Extracted Result
                  </button>
                </div>

                <div 
                  ref={readContainerRef}
                  onScroll={handleReadScroll}
                  className="flex-1 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar gap-6"
                >
                  <div className="w-[calc(100vw-72px)] md:w-1/2 flex-shrink-0 snap-center flex flex-col gap-4">
                    <div className="flex-1 bg-black rounded-3xl overflow-hidden relative border border-white/10">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      <canvas ref={canvasRef} className="hidden" />
                      {scanPhase === 'processing' && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <div className="text-xs font-black tracking-widest uppercase text-indigo-400">Analyzing Document</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={scanPhase === 'live' ? captureScan : startScan} className="flex-1 py-4 bg-emerald-600 rounded-2xl font-bold flex items-center justify-center gap-2">
                        {scanPhase === 'live' ? <Camera size={20} /> : <Play size={20} />}
                        {scanPhase === 'live' ? 'Capture & Read' : 'Start Camera'}
                      </button>
                      {scannedText && (
                        <button onClick={() => speakResponse({ text: scannedText, model: "OCR" })} className="p-4 bg-indigo-600 rounded-2xl">
                          <Volume2 size={24} />
                        </button>
                      )}
                      {scannedText && (
                        <button 
                          onClick={() => {
                            setDraftFacts(prev => prev + (prev.trim() ? "\n\n" : "") + scannedText);
                            setView('drafting');
                            setEnlargedElement('facts');
                          }} 
                          className="p-4 bg-emerald-600 rounded-2xl"
                          title="Send to Drafting Facts"
                        >
                          <Plus size={24} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center bg-slate-900/50 border border-white/5 rounded-3xl p-6 overflow-y-auto relative">
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 font-mono">Extracted Text</div>
                      {scannedText && <button onClick={() => setScannedText("")} className="text-slate-500 hover:text-white text-[10px] uppercase font-black tracking-widest font-sans">Clear</button>}
                    </div>
                    <div className="text-sm text-slate-400 font-mono leading-relaxed whitespace-pre-wrap">{scannedText || "Waiting for capture..."}</div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'convert' && (
              <motion.div key="convert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-3 md:p-6 flex flex-col overflow-hidden">
                {/* Mobile Slider Navigation */}
                <div className="flex md:hidden bg-[#090e18] border border-white/10 p-2 rounded-2xl justify-around items-center shrink-0 z-30 select-none mb-3">
                  <button 
                    onClick={() => scrollToConvertPanel(0)}
                    className={`px-2 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
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
                    className={`px-2 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
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
                    className={`px-2 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all ${
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
                  {/* Left Sidebar: Tools & Image Preview */}
                  <div className="w-[calc(100vw-72px)] md:w-[280px] flex-shrink-0 snap-center flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar pb-4">
                  <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-4">Nexus Tools</div>
                    <h3 className="text-2xl font-black italic mb-6">Doc<span className="text-slate-500">Converter</span></h3>
                    
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={() => {
                          if (scanPhase !== 'live') startScan();
                          else captureForConverter();
                        }} 
                        className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-bold flex items-center justify-center gap-3 text-indigo-400 hover:bg-white/10 transition-all"
                      >
                        <Camera size={20} /> {scanPhase === 'live' ? 'Capture Document' : 'Use Camera'}
                      </button>
                      <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-bold flex items-center justify-center gap-3 text-emerald-400 hover:bg-white/10 transition-all"
                      >
                        <Upload size={20} /> Upload from Device
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    </div>
                  </div>

                  {converterImage && (
                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-4 flex flex-col gap-4">
                      <div className="aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-white/10">
                        <img src={converterImage} alt="Preview" className="w-full h-full object-contain" />
                      </div>
                      <button 
                        onClick={processConversion} 
                        disabled={converterStatus === 'processing'} 
                        className="w-full py-4 bg-indigo-600 rounded-2xl font-bold disabled:opacity-50"
                      >
                        {converterStatus === 'processing' ? 'AI Processing...' : 'Extract & Convert'}
                      </button>
                    </div>
                  )}

                  {converterStatus === 'done' && (
                    <div className="flex flex-col gap-3">
                      <button onClick={exportToPDF} className="w-full py-4 bg-red-600/20 border border-red-600/30 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-red-600/30 transition-all">
                        <FileText size={20} /> Export as PDF
                      </button>
                      <button onClick={exportToWord} className="w-full py-4 bg-blue-600/20 border border-blue-600/30 text-blue-500 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-blue-600/30 transition-all">
                        <File size={20} /> Export as Word
                      </button>
                      <button 
                        onClick={() => {
                          setDraftFacts(prev => prev + (prev.trim() ? "\n\n" : "") + scannedText);
                          setView('drafting');
                          setEnlargedElement('facts');
                        }} 
                        className="w-full py-4 bg-emerald-600/20 border border-emerald-600/30 text-emerald-500 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-600/30 transition-all"
                      >
                        <Plus size={20} /> Send to Drafting Facts
                      </button>
                    </div>
                  )}
                </div>

                {/* Main Area: Document Text Preview */}
                <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center bg-slate-900/50 border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col overflow-hidden relative">
                  <div className="flex justify-between items-center mb-6">
                    <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Document Preview</div>
                    <div className="flex items-center gap-4">
                      {converterStatus === 'done' && (
                        <div className="flex items-center gap-2 text-emerald-500">
                          <CheckCircle size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Ready for Export</span>
                        </div>
                      )}
                      <button 
                        onClick={() => setIsPreviewEnlarged(true)}
                        className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        title="Enlarge Preview"
                      >
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 bg-black/40 rounded-3xl p-8 overflow-y-auto font-mono text-sm text-slate-400 leading-relaxed whitespace-pre-wrap border border-white/5">
                    {converterText || (converterStatus === 'processing' ? "Nexus AI is analyzing the document structure and content..." : "Capture or upload a document to begin the conversion process.")}
                  </div>
                </div>

                {/* Enlarge Modal Overlay */}
                <AnimatePresence>
                  {isPreviewEnlarged && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-12 flex flex-col"
                    >
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">Nexus AI Document Preview</div>
                          <h2 className="text-3xl font-black italic">Full View<span className="text-slate-500">Mode</span></h2>
                        </div>
                        <button 
                          onClick={() => setIsPreviewEnlarged(false)}
                          className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <Minimize2 size={24} />
                        </button>
                      </div>
                      <div className="flex-1 bg-slate-900/50 border border-white/5 rounded-[40px] p-12 overflow-y-auto font-mono text-lg text-slate-300 leading-loose whitespace-pre-wrap">
                        {converterText}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Right Sidebar: AI Translation & Arrangements */}
                <div className="w-[calc(100vw-72px)] md:w-[340px] flex flex-col gap-6 flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar pb-4">
                  {converterStatus === 'done' && (
                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6 flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">AI Translation</div>
                        {isTranslating && <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 animate-pulse">Translating...</div>}
                      </div>
                      <div className="flex flex-col gap-3">
                        <input 
                          value={targetLanguage}
                          onChange={(e) => setTargetLanguage(e.target.value)}
                          placeholder="Target language..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-indigo-500/50 transition-all"
                        />
                        <button 
                          onClick={handleTranslate}
                          disabled={isTranslating || !targetLanguage}
                          className="w-full py-3 bg-indigo-600 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-500 transition-all flex items-center justify-center gap-2"
                        >
                          {isTranslating ? <RotateCcw size={14} className="animate-spin" /> : <Globe size={14} />}
                          Translate Document
                        </button>
                      </div>
                      {translatedText && (
                        <div className="mt-2 p-4 bg-black/40 rounded-xl border border-white/5 max-h-[300px] overflow-y-auto text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
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
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 group hover:border-white/10 transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed"
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
                </div> {/* End sliding panels wrapper */}
              </motion.div>
            )}
            {view === 'instructions' && (
              <motion.div key="instructions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-4 md:p-8 flex flex-col gap-4 md:gap-8 overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
                  <div>
                    <div className="text-[10px] font-black text-amber-500 tracking-[0.2em] mb-2 uppercase">System Configuration</div>
                    <h2 className="text-4xl md:text-5xl font-black italic text-slate-200">Auto-Responder<span className="text-slate-500">Rules</span></h2>
                  </div>
                  <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 md:px-6 md:py-4">
                    <div className="flex items-center justify-between sm:justify-start gap-3 pr-0 sm:pr-6 border-r-0 sm:border-r border-white/10 pb-3 sm:pb-0 border-b sm:border-b-0 border-white/5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enable auto answering?</span>
                      <button onClick={() => setAutoAnswerEnabled(!autoAnswerEnabled)} className={`w-10 h-5 rounded-full relative transition-all flex-shrink-0 ${autoAnswerEnabled ? 'bg-indigo-500' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${autoAnswerEnabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between sm:justify-start gap-4">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Rules</div>
                        <div className="text-2xl font-black text-indigo-500">{callInstructions.length}</div>
                      </div>
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
                        <Shield size={20} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Slider Navigation */}
                <div className="flex md:hidden bg-[#090e18] border border-white/10 p-2 rounded-2xl justify-around items-center shrink-0 z-30 select-none mb-2">
                  <button 
                    onClick={() => scrollToInstructionsPanel(0)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeInstructionsPanel === 0 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    1. Rule Registry
                  </button>
                  <div className="text-slate-800 text-[10px] font-bold">•</div>
                  <button 
                    onClick={() => scrollToInstructionsPanel(1)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      activeInstructionsPanel === 1 
                        ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    2. Add New Rule
                  </button>
                </div>

                <div 
                  ref={instructionsContainerRef}
                  onScroll={handleInstructionsScroll}
                  className="flex-1 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar gap-8"
                >
                  {/* Rules List */}
                  <div className="w-[calc(100vw-72px)] md:w-auto md:flex-1 flex-shrink-0 snap-center bg-slate-900/50 border border-white/5 rounded-[40px] p-6 md:p-8 flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-8">
                      <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Instruction Registry</div>
                      <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                        <Info size={12} />
                        AI will use these rules to answer calls automatically
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-4 space-y-4 custom-scrollbar">
                      {callInstructions.map((rule, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={idx} 
                          className="p-6 bg-white/5 border border-white/5 rounded-3xl flex justify-between items-center group hover:bg-white/10 transition-all"
                        >
                          <div className="flex items-center gap-6">
                            <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 font-black text-xl">
                              {rule.caller.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">{rule.caller}</div>
                              <div className="text-xl font-medium text-slate-200 italic">"{rule.instruction}"</div>
                            </div>
                          </div>
                          <button 
                            onClick={() => setCallInstructions(callInstructions.filter((_, i) => i !== idx))}
                            className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={20} />
                          </button>
                        </motion.div>
                      ))}
                      {callInstructions.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 py-20">
                          <Shield size={48} className="mb-4 opacity-20" />
                          <div className="text-sm font-bold uppercase tracking-widest">No Active Rules</div>
                          <div className="text-[10px] mt-2">Add a rule to enable automated responses</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Rule Sidebar */}
                  <div className="w-[calc(100vw-72px)] md:w-[400px] flex-shrink-0 snap-center flex flex-col gap-6 overflow-y-auto custom-scrollbar pb-4">
                    <div className="bg-slate-900/50 border border-white/5 rounded-[40px] p-8">
                      <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-8">Deploy New Rule</div>
                      
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Caller Identity</label>
                          <input 
                            value={newCaller}
                            onChange={(e) => setNewCaller(e.target.value)}
                            placeholder="e.g. Babu, Clerk, Client Name..."
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-slate-200 outline-none focus:border-indigo-500/50 transition-all font-medium"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">AI Instruction</label>
                          <textarea 
                            value={newInstruction}
                            onChange={(e) => setNewInstruction(e.target.value)}
                            placeholder="What should the AI say?..."
                            rows={4}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-slate-200 outline-none focus:border-indigo-500/50 transition-all font-medium resize-none"
                          />
                        </div>

                        <button 
                          onClick={() => {
                            if (newCaller && newInstruction) {
                              setCallInstructions([...callInstructions, { caller: newCaller, instruction: newInstruction }]);
                              setNewCaller('');
                              setNewInstruction('');
                            }
                          }}
                          disabled={!newCaller || !newInstruction}
                          className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 rounded-2xl font-black text-sm text-white transition-all uppercase tracking-[0.2em] shadow-[0_8px_30px_rgba(79,70,229,0.3)]"
                        >
                          Register Rule
                        </button>
                      </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-[40px] p-8">
                      <div className="flex items-center gap-3 text-amber-500 mb-4">
                        <AlertTriangle size={20} />
                        <div className="text-[10px] font-black uppercase tracking-widest">System Note</div>
                      </div>
                      <p className="text-xs text-amber-500/70 leading-relaxed font-medium">
                        Auto-responder rules are matched against incoming caller names. Ensure the names match your client registry for maximum accuracy.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'brain2' && (
              <motion.div key="brain2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full p-6 flex flex-col gap-6 overflow-y-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
                  <div>
                    <div className="text-[10px] font-black text-amber-500 tracking-[0.2em] mb-1 uppercase">On-Device · CPU/WASM · GGUF Format · Works on Any Phone</div>
                    <h2 className="text-4xl font-black italic text-slate-200">Nexus <span className="text-amber-500">Brains</span></h2>
                    <p className="text-xs text-slate-500 mt-1">No WebGPU required. Downloads once, runs fully offline. Download Brain1, Brain2, or both.</p>
                  </div>
                </div>

                {/* Hardware Profile Scanner */}
                <div id="hardware-scanner" className="p-6 bg-slate-900/60 border border-white/10 rounded-3xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div>
                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" /> Hardware Profile Scanner
                    </div>
                    <div className="text-xs text-slate-300 font-bold flex items-center gap-1.5 flex-wrap">
                      <span>Detected:</span>
                      <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-200 flex items-center gap-1">
                        {simulatedDevice === 'mobile' ? '📱 Mobile Phone' : '💻 Laptop/Desktop'}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-200">
                        {simulatedRam} GB System RAM
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2.5 leading-relaxed font-medium">
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
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Active Inference Chain</div>
                  <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
                    <span className={`px-3 py-1 rounded-full border ${brain1Ready && isBrain1Enabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-slate-500 border-white/10'}`}>
                      1. Brain1 — Gemma 4 E2B {brain1Ready && isBrain1Enabled ? '✓' : !isBrain1Enabled ? '(inactive)' : '(not loaded)'}
                    </span>
                    <span className="text-slate-600">→</span>
                    <span className={`px-3 py-1 rounded-full border ${brain2Ready && isBrain2Enabled ? 'bg-amber-500/20 text-amber-400 border-emerald-500/30' : 'bg-white/5 text-slate-500 border-white/10'}`}>
                      2. Brain2 — Gemma 4 E4B {brain2Ready && isBrain2Enabled ? '✓' : !isBrain2Enabled ? '(inactive)' : '(not loaded)'}
                    </span>
                    <span className="text-slate-600">→</span>
                    <span className="bg-slate-800 text-slate-500 px-3 py-1 rounded-full border border-white/5">3. Offline</span>
                  </div>
                </div>

                {/* Two-column download cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                  {/* Brain1 Card */}
                  <div id="brain1-card" className={`rounded-[32px] p-6 flex flex-col gap-4 border transition-all ${
                    isBrain1Enabled 
                      ? 'bg-emerald-500/5 border-emerald-500/20' 
                      : 'bg-white/5 border-white/5 opacity-50 grayscale-[40%] select-none pointer-events-none'
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
                      <div className="h-[2px] w-full bg-transparent overflow-hidden border border-blue-500/10 rounded-full">
                        <motion.div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" animate={{ width: isBrain1Enabled ? `${brain1Progress}%` : 0 }} transition={{ ease: 'easeOut' }} />
                      </div>
                      <div className="text-[8px] text-slate-500 italic">
                        {isBrain1Enabled ? brain1Message : "⚠️ Inactive on devices with ≥ 4GB RAM when simulated as Mobile."}
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadBrain1}
                      disabled={isBrain1Downloading || !isBrain1Enabled}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-black disabled:text-black/60 font-black text-[10px] uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isBrain1Downloading
                        ? <><RotateCcw size={14} className="animate-spin" /> Downloading...</>
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
                        {aiStatus?.activeBrain !== 'brain1' && (
                          <button 
                            onClick={() => activateBrain('brain1')}
                            className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-[9px] uppercase rounded-lg border border-emerald-500/30 transition-all"
                          >
                            Set as Active Brain
                          </button>
                        )}
                        {aiStatus?.activeBrain === 'brain1' && (
                          <div className="text-center text-[8px] text-emerald-500 font-black uppercase tracking-tighter">— CURRENTLY IN USE —</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Brain2 Card */}
                  <div id="brain2-card" className={`rounded-[32px] p-6 flex flex-col gap-4 border transition-all ${
                    isBrain2Enabled 
                      ? 'bg-amber-500/5 border-amber-500/20' 
                      : 'bg-white/5 border-white/5 opacity-50 grayscale-[40%] select-none pointer-events-none'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Brain2 · Secondary</div>
                        <div className="text-lg font-black text-slate-200 flex items-center gap-2">
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
                      <div className="h-[2px] w-full bg-transparent overflow-hidden border border-blue-500/10 rounded-full">
                        <motion.div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" animate={{ width: isBrain2Enabled ? `${brain2Progress}%` : 0 }} transition={{ ease: 'easeOut' }} />
                      </div>
                      <div className="text-[8px] text-slate-500 italic">
                        {isBrain2Enabled ? brain2Message : "⚠️ Inactive on low memory devices (&lt; 4GB RAM)"}
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadBrain2}
                      disabled={isBrain2Downloading || !isBrain2Enabled}
                      className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-black disabled:text-black/60 font-black text-[10px] uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isBrain2Downloading
                        ? <><RotateCcw size={14} className="animate-spin" /> Downloading...</>
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
                        {aiStatus?.activeBrain !== 'brain2' && (
                          <button 
                            onClick={() => activateBrain('brain2')}
                            className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-[9px] uppercase rounded-lg border border-amber-500/30 transition-all"
                          >
                            Set as Active Brain
                          </button>
                        )}
                        {aiStatus?.activeBrain === 'brain2' && (
                          <div className="text-center text-[8px] text-amber-500 font-black uppercase tracking-tighter">— CURRENTLY IN USE —</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Whisper Card */}
                  <div id="whisper-card" className="rounded-[32px] p-6 flex flex-col gap-4 border transition-all bg-indigo-500/5 border-indigo-500/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">STT Brain · Offline</div>
                        <div className="text-lg font-black text-slate-200 flex items-center gap-2 font-sans">
                          WhisperMini (Xenova)
                        </div>
                        <div className="text-[10px] text-slate-400">whisper-tiny-quantized · ~38 MB</div>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${whisperReady ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-slate-500'}`}>
                        <Mic size={18} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Format', value: 'ONNX / Xenova' },
                        { label: 'Model', value: 'Whisper Mini/Tiny' },
                        { label: 'Size', value: '~38 MB' },
                        { label: 'RAM needed', value: 'Minimal (<100MB)' },
                        { label: 'Platform', value: 'Local Voice AI' },
                        { label: 'Auto-load', value: 'On App Open' },
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
                        <span className={`text-[9px] font-black uppercase ${whisperReady ? 'text-indigo-400' : 'text-slate-500'}`}>
                          {whisperReady ? 'LOADED' : whisperProgress > 0 && whisperProgress < 100 ? `${whisperProgress}%` : 'PENDING'}
                        </span>
                      </div>
                      <div className="h-[2px] w-full bg-transparent overflow-hidden border border-indigo-500/10 rounded-full">
                        <motion.div className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" animate={{ width: `${whisperProgress}%` }} transition={{ ease: 'easeOut' }} />
                      </div>
                      <div className="text-[8px] text-slate-500 italic min-h-[24px]">
                        {whisperMessage}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownloadWhisper(true)}
                      disabled={isWhisperDownloading}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white disabled:text-white/60 font-black text-[10px] uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                      {isWhisperDownloading
                        ? <><RotateCcw size={14} className="animate-spin" /> Downloading...</>
                        : whisperReady
                          ? <><RotateCcw size={14} /> Redownload / Reload</>
                          : <><Download size={14} /> Download Local Whisper</>
                      }
                    </button>
                  </div>
                </div>

                {/* Bottom info */}
                <div className="p-5 bg-white/5 border border-white/5 rounded-2xl">
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">How it works</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] text-slate-400">
                    <div className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />Works on any Android phone — no WebGPU needed</div>
                    <div className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />Downloads once, cached in browser — fully offline</div>
                    <div className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />Brain1 is optimized for speed; Brain2 (Gemma) provides higher reasoning capacity if loaded</div>
                    <div className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />2–8 tokens/sec on budget phones; faster on mid-range</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Nexus Link Dock */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] flex flex-col items-center gap-4">
        <AnimatePresence>
          {voiceAiOn && (
            <motion.div 
              initial={{ y: 20, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.9 }}
              className="bg-black/90 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 w-[400px] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    voiceAiStatus === 'listening' ? 'bg-red-500' : 
                    voiceAiStatus === 'thinking' ? 'bg-amber-500' : 
                    voiceAiStatus === 'speaking' || voiceAiStatus.includes('Speaking') || voiceAiStatus.includes('Answering') ? 'bg-emerald-500' : 'bg-slate-500'
                  }`} />
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {voiceAiStatus === 'listening' 
                      ? `Listening (${sttEngine === 'chirp3' ? 'Chirp 3' : sttEngine === 'whisper' ? 'whisper.cpp' : sttEngine === 'android' ? 'Android Speech' : 'Web Speech'})` 
                      : voiceAiStatus === 'thinking' ? 'Nexus Processing' 
                      : voiceAiStatus.includes('Answering') || voiceAiStatus.includes('Speaking') ? voiceAiStatus 
                      : 'Nexus Ready'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 bg-white/10 rounded-xl p-1 shadow-inner max-w-xs">
                    <button 
                      onClick={() => setVoiceLang('en-US')}
                      className={`px-2 py-1 text-[9px] font-black rounded-lg transition-all ${voiceLang === 'en-US' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      EN
                    </button>
                    <button 
                      onClick={() => setVoiceLang('ml-IN')}
                      className={`px-2 py-1 text-[9px] font-black rounded-lg transition-all ${voiceLang === 'ml-IN' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      ML
                    </button>
                    <select
                      value={sttEngine}
                      onChange={(e) => setSttEngine(e.target.value as any)}
                      className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[8px] font-black text-indigo-400 cursor-pointer outline-none hover:bg-black/60 tracking-wider"
                      title="Select STT Engine"
                    >
                      <option value="webspeech">SPEECH API</option>
                      <option value="android">ANDROID SPEECH</option>
                      <option value="chirp3">CHIRP 3</option>
                      <option value="whisper">WHISPER.CPP</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      if (recognitionRef.current) {
                        try { recognitionRef.current.stop(); } catch(e) {}
                      }
                      startVoiceAi();
                    }}
                    className="p-2.5 bg-white/5 hover:bg-indigo-500/20 rounded-xl text-slate-500 hover:text-indigo-400 transition-all"
                    title="Restart Audio"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button 
                    onClick={stopVoiceAi}
                    className="p-2.5 bg-white/5 hover:bg-red-500/20 rounded-xl text-slate-500 hover:text-red-500 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4 py-4">
                  <VoiceVisualizer 
                    volume={micLevel / 128} 
                    isModelSpeaking={voiceAiStatus === 'speaking' || voiceAiStatus.includes('Answering')} 
                    isThinking={voiceAiStatus === 'thinking'}
                    isConnected={voiceAiOn} 
                  />
                  <div className="text-base font-bold text-white text-center w-full px-4 min-h-[3rem] flex items-center justify-center italic">
                    {voiceAiStatus === 'listening' && voiceAiTranscript === "Listening..." ? "Speak now..." : `"${voiceAiTranscript}"`}
                  </div>
                </div>

                {voiceAiReply && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                    <div className="text-xs text-slate-300 leading-relaxed markdown-body">
                      <ReactMarkdown>{voiceAiReply}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-black/80 backdrop-blur-2xl border border-white/10 rounded-full px-6 py-3 flex items-center gap-6 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <button 
            onClick={() => {
              setView('read');
              if (scanPhase !== 'live') startScan();
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              view === 'read' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            <Camera size={20} />
          </button>
          <button 
            onClick={toggleVoiceAi}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all relative ${
              voiceAiOn ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'
            }`}
          >
            {voiceAiOn ? <X size={24} /> : <Mic size={24} />}
            {voiceAiOn && (
              <motion.div 
                layoutId="mic-glow"
                className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
              />
            )}
          </button>
          <div className="flex flex-col">
            <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase">NEXUS LINK</div>
            <div className="text-[10px] font-black uppercase flex items-center gap-1.5">
              {voiceAiOn ? (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-500">ACTIVE</span>
                  <div className="w-8 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: `${Math.min(100, (micLevel / 128) * 100)}%` }}
                      className="h-full bg-emerald-500"
                    />
                  </div>
                </div>
              ) : (
                <span className="text-slate-500">READY</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Incoming Call Overlay */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-10 right-10 w-80 bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl z-[200]">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center animate-pulse"><Volume2 size={24} /></div>
              <div>
                <div className="font-bold">{incomingCall.clientName}</div>
                <div className="text-xs text-slate-500">Incoming Call...</div>
              </div>
            </div>
            {isAnswering ? (
              <div className="text-center text-emerald-500 font-bold text-sm animate-pulse">AI Answering...</div>
            ) : (
              <div className="flex gap-3">
                <button onClick={handleAutoAnswer} className="flex-1 py-3 bg-emerald-600 rounded-xl font-bold text-sm">Answer</button>
                <button onClick={() => setIncomingCall(null)} className="flex-1 py-3 bg-red-600 rounded-xl font-bold text-sm">Decline</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enlarged Element Modal */}
      <AnimatePresence>
        {enlargedElement && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[400] flex items-center justify-center p-10">
            <div className="max-w-5xl w-full h-full bg-slate-900 border border-white/10 rounded-[40px] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em]">
                  {enlargedElement === 'facts' && "ENLARGED: FACT OF THE CASE"}
                  {enlargedElement === 'model' && "ENLARGED: MODEL DRAFT / TEMPLATE"}
                  {enlargedElement === 'pad' && "ENLARGED: TEMPORARY WRITING PAD"}
                  {enlargedElement === 'suggestions' && "ENLARGED: AI SUGGESTIONS"}
                </div>
                <button onClick={() => setEnlargedElement(null)} className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 p-10 overflow-y-auto custom-scrollbar bg-black/20">
                {enlargedElement === 'facts' && (
                  <textarea 
                     value={draftFacts} 
                     onChange={e => setDraftFacts(e.target.value)}
                     className="w-full h-full bg-transparent text-lg text-slate-300 font-serif leading-relaxed outline-none resize-none"
                     placeholder="Enter facts..."
                     autoFocus
                  />
                )}
                {enlargedElement === 'model' && (
                  <textarea 
                     value={draftModel} 
                     onChange={e => setDraftModel(e.target.value)}
                     className="w-full h-full bg-transparent text-lg text-slate-300 font-serif leading-relaxed outline-none resize-none"
                     placeholder="Enter model draft..."
                     autoFocus
                  />
                )}
                {enlargedElement === 'pad' && (
                  <div 
                     className="w-full h-full bg-transparent text-xl text-slate-300 font-serif leading-relaxed outline-none whitespace-pre-wrap"
                     contentEditable 
                     suppressContentEditableWarning 
                     onBlur={(e) => setDraftPages([e.currentTarget.innerText])}
                     autoFocus
                  >
                    {draftPages[0]}
                  </div>
                )}
                {enlargedElement === 'suggestions' && (
                  <div className="w-full h-full bg-slate-950/40 p-8 rounded-3xl border border-white/5 overflow-y-auto custom-scrollbar text-slate-300 leading-relaxed markdown-body">
                    <ReactMarkdown>{draftSuggestions || "No suggestions available yet. Write custom prompts or request recommendations."}</ReactMarkdown>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-white/5 bg-white/5 flex justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                  {enlargedElement === 'facts' && (
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-center gap-2">
                        <button 
                          onClick={toggleVoiceAi}
                          className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-white transition-all relative ${
                            voiceAiOn ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                          }`}
                        >
                          {voiceAiOn ? <X size={28} /> : <Mic size={28} />}
                          {voiceAiOn && (
                            <motion.div 
                              layoutId="mic-glow-modal"
                              className="absolute inset-0 rounded-2xl bg-red-500/20 animate-ping"
                            />
                          )}
                        </button>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dictate Story</span>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <button 
                          onClick={() => {
                            setEnlargedElement(null);
                            setView('read');
                            if (scanPhase !== 'live') startScan();
                          }}
                          className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <Camera size={28} />
                        </button>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Scan Facts</span>
                      </div>

                      {voiceAiOn ? (
                        <div className="flex flex-col ml-4">
                          <div className="text-[10px] font-black text-indigo-400 tracking-widest uppercase">
                            STORYTELLING ACTIVE ({sttEngine === 'chirp3' ? 'Chirp 3 Cloud' : sttEngine === 'whisper' ? 'whisper.cpp Local' : sttEngine === 'android' ? 'Android Speech' : 'Web Speech'})
                          </div>
                          <div className="text-sm text-emerald-500 font-bold animate-pulse max-w-md truncate">
                            {voiceAiTranscript === "Listening..." ? "Narrate your case facts now..." : voiceAiTranscript}
                          </div>
                        </div>
                      ) : (
                        <div className="ml-4 hidden md:block">
                          <div className="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-1">Quick Tip</div>
                          <div className="text-xs text-slate-400 italic">"Use the mic to narrate the story of the case. AI will append it to the facts."</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-4">
                  {enlargedElement === 'pad' && (
                    <>
                      <button onClick={() => handleCopy(draftPages[0])} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                        <Copy size={16} /> Copy Content
                      </button>
                      <button onClick={() => handleDownloadDraft(draftPages[0])} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                        <Download size={16} /> Download Draft
                      </button>
                    </>
                  )}
                  {enlargedElement === 'suggestions' && (
                    <>
                      <button onClick={() => handleCopy(draftSuggestions)} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                        <Copy size={16} /> Copy Suggestions
                      </button>
                      <button onClick={handleDownloadSuggestions} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                        <Download size={16} /> Download Suggestions
                      </button>
                    </>
                  )}
                  <button onClick={() => setEnlargedElement(null)} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI CUSTOM PROMPT WORKBENCH PAGE */}
      <AnimatePresence>
        {showCustomPromptPage && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.98 }} 
            className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[500] flex items-center justify-center p-6 md:p-12"
          >
            <div className="max-w-6xl w-full h-[85vh] bg-[#070b14]/90 border border-white/15 rounded-[36px] flex flex-col overflow-hidden shadow-2xl relative">
              
              {/* Header */}
              <div className="p-6 md:px-10 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div>
                  <div className="text-[10px] font-black text-indigo-400 tracking-[0.2em] uppercase mb-1">AI CUSTOM PROMPT WORKBENCH</div>
                  <h2 className="text-xl md:text-2xl font-black text-white italic tracking-tight">Direct the AI Case Intelligence</h2>
                </div>
                <button 
                  onClick={closeCustomPromptPage} 
                  className="p-2.5 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                  title="Close Workbench"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Tab Navigation for Custom Prompt Workbench */}
              <div className="flex md:hidden bg-[#090e18] border-b border-white/10 p-2.5 justify-around items-center shrink-0 z-30 select-none">
                <button 
                  type="button"
                  onClick={() => scrollToWorkbenchPanel(0)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    activeWorkbenchPanel === 0 
                      ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                      : 'text-slate-400 hover:text-white bg-white/5'
                  }`}
                >
                  1. Context & Presets
                </button>
                <div className="text-slate-800 text-[10px] font-bold">•</div>
                <button 
                  type="button"
                  onClick={() => scrollToWorkbenchPanel(1)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    activeWorkbenchPanel === 1 
                      ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-[1.05]' 
                      : 'text-slate-400 hover:text-white bg-white/5'
                  }`}
                >
                  2. Prompt & Actions
                </button>
              </div>

              {/* Main Content Workspace */}
              <div 
                ref={workbenchContainerRef}
                onScroll={handleWorkbenchScroll}
                className="flex-1 flex flex-row overflow-x-auto md:overflow-hidden snap-x snap-mandatory scroll-smooth custom-scrollbar"
              >
                
                {/* Left side: Case context summary */}
                <div className="w-[calc(100vw-48px)] md:w-80 flex-shrink-0 snap-center bg-black/40 border-r border-white/5 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                  <div>
                    <h3 className="text-xs font-black text-indigo-400 tracking-wider uppercase mb-3">Case Context Status</h3>
                    <div className="space-y-4">
                      
                      {/* Facts preview */}
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Facts of the Case</div>
                        <div className="text-[11px] text-slate-400 line-clamp-3 italic">
                          {draftFacts.trim() ? `"${draftFacts}"` : "No facts provided yet. Speak or write case facts."}
                        </div>
                        <div className="text-[8px] text-indigo-400 font-mono mt-1.5">{draftFacts.length} characters</div>
                      </div>

                      {/* Template Preview */}
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Model Draft/Template</div>
                        <div className="text-[11px] text-slate-400 line-clamp-3 italic">
                          {draftModel.trim() ? `"${draftModel}"` : "None set. Will generate from scratch."}
                        </div>
                        <div className="text-[8px] text-indigo-400 font-mono mt-1.5">{draftModel.length} characters</div>
                      </div>

                      {/* Case Supporting Document Upload Area */}
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Supporting Case Documents</div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => workbenchFileInputRef.current?.click()}
                              className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 hover:text-white border border-[#818cf8]/10 text-indigo-400 rounded-md text-[8px] font-black tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1"
                              title="Upload Documents"
                            >
                              <Upload size={10} /> Upload
                            </button>
                            <button
                              onClick={startWorkbenchCamera}
                              className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 hover:text-white border border-emerald-500/10 text-emerald-400 rounded-md text-[8px] font-black tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1"
                              title="Capture document using camera"
                            >
                              <Camera size={10} /> Camera
                            </button>
                          </div>
                        </div>
                        <input
                          type="file"
                          ref={workbenchFileInputRef}
                          onChange={handleWorkbenchFileUpload}
                          multiple
                          accept="image/*,text/*,application/json,application/pdf"
                          className="hidden"
                        />

                        {workbenchCameraActive && (
                          <div className="mb-3 bg-black border border-white/10 rounded-xl overflow-hidden relative">
                            <video ref={workbenchVideoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />
                            <div className="absolute bottom-2 left-2 right-2 flex gap-2">
                              <button
                                onClick={captureWorkbenchCamera}
                                className="flex-1 py-1 px-2 bg-emerald-600 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-lg hover:bg-emerald-500 transition-colors"
                              >
                                Capture Photo
                              </button>
                              <button
                                onClick={cancelWorkbenchCamera}
                                className="py-1 px-2 bg-red-600 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-lg hover:bg-red-500 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {workbenchDocuments.length === 0 ? (
                          <div className="border border-dashed border-white/10 rounded-lg p-3 text-center text-[10px] text-slate-500 italic">
                            No files uploaded yet. Perfect for relevant deeds, notices, photos.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                            {workbenchDocuments.map(doc => (
                              <div key={doc.id} className="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg p-1.5 text-[10px]">
                                <div className="flex items-center gap-1.5 overflow-hidden flex-1 mr-1">
                                  <File size={12} className="text-indigo-400 flex-shrink-0" />
                                  <div className="text-slate-300 font-mono truncate" title={doc.name}>
                                    {doc.name}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {doc.status === 'processing' && (
                                    <span className="text-[7px] font-black text-amber-400 animate-pulse uppercase">OCR Running...</span>
                                  )}
                                  {doc.status === 'done' && (
                                    <span className="text-[7px] font-black text-emerald-500 uppercase">Ready</span>
                                  )}
                                  {doc.status === 'error' && (
                                    <span className="text-[7px] font-black text-red-500 uppercase">Error</span>
                                  )}
                                  <button
                                    onClick={() => setWorkbenchDocuments(prev => prev.filter(d => d.id !== doc.id))}
                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Delete file"
                                  >
                                    <Trash size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-[8px] text-slate-500 leading-tight mt-1.5 font-sans">
                          *Images undergo automatic high-fidelity real-time AI background transcription context extraction.
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Preset Helper Quick-Prompts */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs font-black text-indigo-400 tracking-wider uppercase">Preset Directives</h3>
                      <button
                        onClick={() => setShowAddDirectiveForm(!showAddDirectiveForm)}
                        className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 hover:text-white border border-[#818cf8]/10 text-indigo-400 rounded-md text-[8px] font-black tracking-wider transition-all uppercase cursor-pointer flex items-center gap-1"
                        title="Create Custom Preset Instruction"
                      >
                        {showAddDirectiveForm ? "Cancel" : "+ Add Custom"}
                      </button>
                    </div>

                    {showAddDirectiveForm && (
                      <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-2xl p-3 space-y-3">
                        <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">New Directive Preset</div>
                        <div>
                          <input
                            type="text"
                            placeholder="e.g., MACT Claim Specifics"
                            value={newDirectiveName}
                            onChange={(e) => setNewDirectiveName(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <textarea
                            placeholder="Prompt instructions, e.g., Include claim templates for medical bills, loss of dynamic earnings, permanent disability percentage..."
                            value={newDirectivePrompt}
                            onChange={(e) => setNewDirectivePrompt(e.target.value)}
                            className="w-full h-20 bg-black/40 border border-white/10 rounded-lg p-2 text-[11px] text-white placeholder-slate-500 focus:border-indigo-500 outline-none resize-none custom-scrollbar"
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (!newDirectiveName.trim() || !newDirectivePrompt.trim()) {
                              alert("Please fill in both the preset name and the instruction prompt.");
                              return;
                            }
                            const updated = [
                              ...customDirectives,
                              { name: newDirectiveName.trim(), prompt: newDirectivePrompt.trim() }
                            ];
                            saveCustomDirectives(updated);
                            setNewDirectiveName('');
                            setNewDirectivePrompt('');
                            setShowAddDirectiveForm(false);
                          }}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-widest rounded-lg transition-colors"
                        >
                          Save Custom Preset Directive
                        </button>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[35vh] overflow-y-auto custom-scrollbar pr-1">
                      {/* Preloaded Presets */}
                      {systemDirectives.map((preset, idx) => {
                        const isActive = customPromptText === preset.text;
                        return (
                          <div
                            key={`static-${idx}`}
                            className={`w-full relative group rounded-xl transition-all p-3 text-xs border ${
                              isActive 
                                ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/30' 
                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-indigo-500/30'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1 gap-2">
                              <button
                                onClick={() => setCustomPromptText(preset.text)}
                                className={`text-left font-bold flex-1 ${isActive ? 'text-indigo-300 font-extrabold' : 'text-indigo-400 hover:text-indigo-300'}`}
                              >
                                {preset.label}
                              </button>
                              <div className="flex items-center gap-1.5">
                                {isActive ? (
                                  <span className="flex items-center gap-1 text-[8px] bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-indigo-400 font-black tracking-widest uppercase">
                                    <Check size={9} strokeWidth={3} /> ACTIVE
                                  </span>
                                ) : (
                                  <span className="text-[7px] text-slate-500 font-mono tracking-widest uppercase">system</span>
                                )}
                                <button
                                  onClick={() => {
                                    const updated = systemDirectives.filter((_, i) => i !== idx);
                                    saveSystemDirectives(updated);
                                  }}
                                  className="text-slate-500 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                                  title="Delete preset"
                                >
                                  <Trash size={12} />
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => setCustomPromptText(preset.text)}
                              className={`w-full text-left font-sans line-clamp-2 ${isActive ? 'text-slate-200' : 'text-slate-400'}`}
                            >
                              {preset.text}
                            </button>
                          </div>
                        );
                      })}

                      {/* User Custom Created presets */}
                      {customDirectives.map((preset, idx) => {
                        const isActive = customPromptText === preset.prompt;
                        return (
                          <div
                            key={`custom-${idx}`}
                            className={`w-full relative group rounded-xl transition-all p-3 text-xs border ${
                              isActive 
                                ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/30' 
                                : 'bg-indigo-950/20 border-[#818cf8]/10 hover:bg-indigo-950/30 hover:border-indigo-500/30'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1 gap-2">
                              <button
                                onClick={() => setCustomPromptText(preset.prompt)}
                                className={`text-left font-bold flex-1 ${isActive ? 'text-indigo-300 font-extrabold' : 'text-emerald-400 hover:text-emerald-300'}`}
                              >
                                {preset.name}
                              </button>
                              <div className="flex items-center gap-1.5">
                                {isActive && (
                                  <span className="flex items-center gap-1 text-[8px] bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded text-indigo-400 font-black tracking-widest uppercase">
                                    <Check size={9} strokeWidth={3} /> ACTIVE
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    const updated = customDirectives.filter((_, i) => i !== idx);
                                    saveCustomDirectives(updated);
                                  }}
                                  className="text-slate-500 hover:text-red-400 p-0.5 transition-colors"
                                  title="Delete custom preset"
                                >
                                  <Trash size={12} />
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => setCustomPromptText(preset.prompt)}
                              className={`w-full text-left font-sans line-clamp-2 ${isActive ? 'text-slate-200' : 'text-slate-400'}`}
                            >
                              {preset.prompt}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right side: Active Custom Prompt Textarea & Triggers */}
                <div className="w-[calc(100vw-48px)] md:w-auto md:flex-1 flex-shrink-0 snap-center p-6 md:p-10 flex flex-col justify-between overflow-y-auto custom-scrollbar bg-black/10">
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest block font-sans">Write Prompt Instructions</label>
                        <button
                          onClick={startPromptDictation}
                          className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all pointer-events-auto cursor-pointer ${
                            isPromptDictating 
                              ? 'bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]' 
                              : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10'
                          }`}
                          title={isPromptDictating ? "Stop Voice Dictation" : "Dictate prompting instructions"}
                        >
                          <Mic size={10} />
                          {isPromptDictating ? "Dictating Active..." : "Dictate Prompt"}
                        </button>
                      </div>
                      <button 
                        onClick={() => setCustomPromptText('')}
                        className="text-[9px] text-red-400 hover:text-red-300 font-black uppercase tracking-wider block font-sans"
                      >
                        Clear Option
                      </button>
                    </div>
                    
                    <textarea
                      value={customPromptText}
                      onChange={(e) => setCustomPromptText(e.target.value)}
                      placeholder="e.g., Rewrite the case draft to strongly highlight the lack of initial dynamic intention in the sequential occurrence of events. Structure it using formal legal pleadings with prominent sections, add standard verification headings for the High Court of Kerala, and draft a clean legal grounds section citing standard statutory precedents..."
                      className="flex-1 min-h-[16rem] md:min-h-[20rem] bg-white/5 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded-3xl p-6 text-sm text-slate-200 font-serif leading-relaxed tracking-wide placeholder-slate-500 outline-none resize-none transition-colors custom-scrollbar"
                      autoFocus
                    />
                  </div>

                  {/* Operational Action Buttons */}
                  <div className="mt-8 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-3 max-w-sm">
                      <p className="text-[10px] text-slate-500 leading-normal font-sans">
                        Configure your prompt above, then trigger either a **customised case draft** or **improvement points** in response.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={autoSpeakWorkbenchResult} 
                          onChange={(e) => setAutoSpeakWorkbenchResult(e.target.checked)}
                          className="mr-1 accent-indigo-500 rounded border-white/10 bg-black/40"
                        />
                        <span className="text-[9px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-colors">
                          Give Voice Suggestion (Read Aloud)
                        </span>
                      </label>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => handleCustomPromptDrafting('draft')}
                        disabled={isCustomPromptProcessing || !customPromptText.trim()}
                        className="py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg min-w-[200px]"
                      >
                        {isCustomPromptProcessing ? <RotateCcw size={14} className="animate-spin" /> : <Zap size={14} />}
                        Draft Case (Writing Pad)
                      </button>

                      <button
                        onClick={() => handleCustomPromptDrafting('suggestions')}
                        disabled={isCustomPromptProcessing || !customPromptText.trim()}
                        className="py-4 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg min-w-[200px]"
                      >
                        {isCustomPromptProcessing ? <RotateCcw size={14} className="animate-spin" /> : <Info size={14} />}
                        Generate as AI Suggestions
                      </button>
                    </div>
                  </div>

                </div>

              </div>
              
              {/* Overlay Loader State */}
              <AnimatePresence>
                {isCustomPromptProcessing && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-[100]"
                  >
                    <RotateCcw size={40} className="text-indigo-500 animate-spin mb-4" />
                    <div className="text-sm font-bold text-white mb-1 animate-pulse uppercase tracking-wider font-sans">Advocate Case Intelligence Reading...</div>
                    <div className="text-[10px] text-slate-400 font-sans">Synthesizing case records & custom user prompts...</div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-[40px] p-10 text-center">
              <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-8"><span className="text-4xl font-black italic text-black">N</span></div>
              <h2 className="text-3xl font-black italic mb-4">Nexus Justice</h2>
              <p className="text-slate-400 mb-10 leading-relaxed">Your AI-powered legal command center. Manage calls, consult laws, and draft documents seamlessly.</p>
              <button onClick={() => setShowOnboarding(false)} className="w-full py-5 bg-indigo-600 rounded-2xl font-black uppercase tracking-widest">Enter Portal</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nexus Link Dock */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] flex flex-col items-center gap-4">
        <AnimatePresence>
          {geminiLive.isConnected && (
            <motion.div 
              initial={{ y: 20, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.9 }}
              className="bg-black/90 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 w-[400px] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    geminiLive.isModelSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                  }`} />
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {geminiLive.isModelSpeaking ? 'Nexus Speaking' : 'Listening...'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => geminiLive.disconnect()}
                    className="p-2 bg-white/5 hover:bg-red-500/20 rounded-xl text-slate-500 hover:text-red-500 transition-all flex items-center gap-2"
                    title="Close Conversation"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest px-1">Close</span>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-3">
                  <VoiceVisualizer 
                    volume={geminiLive.volume} 
                    isModelSpeaking={geminiLive.isModelSpeaking} 
                    isThinking={false}
                    isConnected={geminiLive.isConnected} 
                  />
                  
                  {/* Transcript panel of actual vocal back-and-forth */}
                  <div className="w-full max-h-[160px] overflow-y-auto custom-scrollbar flex flex-col gap-2 p-3 bg-white/5 rounded-2xl border border-white/5 text-left my-1">
                    {geminiLive.messages.length === 0 ? (
                      <div className="text-slate-500 text-xs text-center py-4 italic">
                        Start speaking to see transcript...
                      </div>
                    ) : (
                      geminiLive.messages.map((msg, idx) => (
                        <div 
                          key={idx} 
                          className={`flex flex-col gap-0.5 max-w-[85%] ${
                            msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
                          }`}
                        >
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                            {msg.role === 'user' ? 'You' : 'Nexus'}
                          </span>
                          <div 
                            className={`px-3 py-1.5 rounded-2xl text-xs leading-relaxed break-words ${
                              msg.role === 'user' 
                                ? 'bg-indigo-600 text-white rounded-tr-none' 
                                : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>

                  <div className="text-[10px] font-medium text-slate-400 italic text-center w-full">
                    {geminiLive.isWhisperTranscribing ? (
                      <span className="text-amber-400 font-bold animate-pulse">Whisper transcription active...</span>
                    ) : geminiLive.messages.length > 0 ? (
                      geminiLive.isModelSpeaking ? "Nexus is speaking..." : "Listening..."
                    ) : (
                      "Live audio transcriber ready"
                    )}
                  </div>
                </div>
                {voiceAiReply && (
                  <div className="text-sm text-slate-400 leading-relaxed border-t border-white/5 pt-3 flex justify-between items-start gap-4">
                    <div className="flex-1">{voiceAiReply}</div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

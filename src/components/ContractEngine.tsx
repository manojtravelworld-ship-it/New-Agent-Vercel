"use client";
import { useState, useRef, useCallback, useEffect, ChangeEvent, DragEvent } from "react";

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg:        "#0B1622",
  surface:   "#111E2E",
  surfaceHi: "#172539",
  border:    "rgba(180,150,80,0.18)",
  gold:      "#C9A050",
  goldBright:"#E8C470",
  sand:      "#F2E8CE",
  text:      "#E8DEC8",
  muted:     "#6B88A4",
  client:    "#3DBE7A",
  other:     "#E05A4E",
  neutral:   "#4A90D9",
  warning:   "#E8A030",
  purple:    "#9B6FD4",
};

// ── Types ──────────────────────────────────────────────────────
interface Provision {
  id: number;
  title: string;
  text: string;
  favour: "client" | "other" | "neutral";
  favourLabel: string;
  analysis: string;
  recommendation: string;
  severity: "high" | "medium" | "low";
  redline: string | null;
  redlineFixed: string | null;
}

// ── Default prompts (mirrors backend — loaded via GET on mount) ─
const EVAL_DEFAULT = `You are a senior Kerala advocate with 20+ years of experience in contract law.

Analyse the following contract and return a JSON array of provision objects. The client's role is: "{{clientRole}}".

For EACH identifiable provision/clause, return:
{
  "id": number,
  "title": "Short clause name",
  "text": "The exact original clause text (truncated to 300 chars if very long)",
  "favour": "client" | "other" | "neutral",
  "favourLabel": "Who the other party is (e.g. Landlord, Seller)",
  "analysis": "2-3 sentence legal analysis of WHY this clause favours that party under Kerala/Indian law",
  "recommendation": "Specific actionable amendment in plain English to make it client-favourable",
  "severity": "high" | "medium" | "low",
  "redline": "The exact phrase to strike out (null if no change needed)",
  "redlineFixed": "The replacement phrase (null if no change needed)"
}

Return ONLY a valid JSON array. No markdown, no preamble.`;

const DRAFT_DEFAULT = `You are a senior Kerala advocate. Draft a complete, professionally formatted {{type}} agreement.

INSTRUCTIONS:
- ALL clauses must be drafted in favour of {{clientName}} who is the {{clientRole}}
- Jurisdiction: {{district}}, Kerala
- Governing law: Kerala Rent Control Act 1965, Indian Contract Act 1872, CPC 1908
- Include standard Kerala-specific protections
- Mark each clause with [CLIENT-FAVOURABLE] or [BALANCED]
- Add footnote: "AI Draft – Attorney review mandatory before execution | Nexus Justice"

PARTIES:
- Client ({{clientRole}}): {{clientName}}
- Other Party: {{otherParty}}

SUBJECT MATTER: {{property}}
CONTRACT VALUE: {{value}}
DURATION: {{duration}}
SPECIAL TERMS: {{specialTerms}}

Draft the complete agreement now. Use proper legal formatting with numbered clauses.`;

// ── Sample provisions (demo) ───────────────────────────────────
const SAMPLE_PROVISIONS: Provision[] = [
  { id:1, title:"Rent Amount & Payment", favour:"other", favourLabel:"Landlord", severity:"high",
    text:"The Tenant shall pay a monthly rent of ₹45,000/- on or before the 5th day of each month. In case of delay beyond the 5th, a penalty of 5% per day shall be levied on the outstanding amount.",
    analysis:"The 5% per-day penalty is unconscionably high — equivalent to 1825% p.a. Kerala courts have struck down such clauses as void under Section 74 of the Indian Contract Act.",
    recommendation:"Replace with: 'In case of delay beyond the 10th day, simple interest at 12% per annum shall apply.' This aligns with Kerala Rent Control Act norms.",
    redline:"penalty of 5% per day", redlineFixed:"simple interest at 12% per annum for the period of delay" },
  { id:2, title:"Security Deposit Refund", favour:"other", favourLabel:"Landlord", severity:"high",
    text:"The Landlord may adjust the security deposit against any dues at termination at the Landlord's sole discretion. No refund timeline is specified.",
    analysis:"'Sole discretion' allows indefinite withholding. No timeline means your client has no legal hook to demand refund under limitation period.",
    recommendation:"Add: 'Security deposit shall be refunded within 30 days of vacation after deducting only documented, itemised damage costs agreed by both parties in writing.'",
    redline:"at the Landlord's sole discretion", redlineFixed:"within 30 days of vacation, after deducting only mutually agreed documented damages" },
  { id:3, title:"Lock-in Period", favour:"neutral", favourLabel:"Both Parties", severity:"medium",
    text:"This agreement shall have a lock-in period of 24 months from commencement. Either party may terminate after the lock-in with 3 months' prior written notice.",
    analysis:"24-month lock-in is balanced but 3-month notice is above Kerala market standard of 2 months. Acceptable for long-term plans, disadvantageous if plans change.",
    recommendation:"Reduce lock-in to 12 months and notice to 60 days if client wants flexibility.",
    redline:"3 months' prior written notice", redlineFixed:"2 months' (60 days') prior written notice" },
  { id:4, title:"Maintenance & Structural Repairs", favour:"other", favourLabel:"Landlord", severity:"high",
    text:"All repair and maintenance works including structural repairs, plumbing, and electrical systems shall be the sole responsibility of the Tenant during the lease period.",
    analysis:"Structural repairs on tenant is legally unusual and likely unenforceable under Kerala practice. Courts typically assign structural liability to landlord.",
    recommendation:"Amend: 'Day-to-day maintenance up to ₹5,000 is Tenant's. Structural repairs, main plumbing, and electrical mains are Landlord's obligation within 15 days of written notice.'",
    redline:"including structural repairs, plumbing, and electrical systems shall be the sole responsibility of the Tenant",
    redlineFixed:"of routine nature (up to ₹5,000 per instance) are Tenant's responsibility; structural and main-line repairs are Landlord's obligation" },
  { id:5, title:"Rent Escalation", favour:"other", favourLabel:"Landlord", severity:"high",
    text:"The Landlord reserves the right to revise the rent at any time during the lease period by giving 30 days' notice to the Tenant.",
    analysis:"No cap, no formula, unilateral right — effectively makes the lease month-to-month financially. Extremely prejudicial to tenant planning.",
    recommendation:"Replace: 'Rent fixed for first 12 months. Thereafter, max 10% revision once per year, with 60 days' advance notice.'",
    redline:"right to revise the rent at any time during the lease period by giving 30 days' notice",
    redlineFixed:"right to revise rent once per year on anniversary, by maximum 10%, with 60 days' written advance notice" },
  { id:6, title:"Sub-letting", favour:"neutral", favourLabel:"Both Parties", severity:"low",
    text:"The Tenant shall not sub-let or assign the premises or any part thereof without the prior written consent of the Landlord.",
    analysis:"Standard and reasonable clause. Consistent with Kerala practice and enforceable as written.",
    recommendation:"No change required. If sub-letting needed: add '…which consent shall not be unreasonably withheld for bona fide business sub-tenants.'",
    redline:null, redlineFixed:null },
  { id:7, title:"Dispute Resolution Jurisdiction", favour:"other", favourLabel:"Landlord", severity:"high",
    text:"Any disputes arising out of this agreement shall be subject to the exclusive jurisdiction of courts in Mumbai.",
    analysis:"Property is in Kochi — Mumbai jurisdiction clause forces client to litigate in an inconvenient forum. Common overreach, challengeable but prevention is better.",
    recommendation:"Replace: 'Disputes shall be subject to the exclusive jurisdiction of competent courts at Ernakulam, Kerala.'",
    redline:"exclusive jurisdiction of courts in Mumbai", redlineFixed:"exclusive jurisdiction of competent courts at Ernakulam, Kerala" },
  { id:8, title:"Force Majeure", favour:"client", favourLabel:"Tenant (Client)", severity:"low",
    text:"In the event of any act of God, natural calamity, government order, or epidemic, the obligations of both parties shall be suspended for the duration of such event.",
    analysis:"Fair clause protecting tenant during Kerala floods, government lockdowns, or pandemic restrictions. Rent suspension during such periods is client-favourable.",
    recommendation:"Good clause — retain. Consider adding 'Kerala State disaster declarations, monsoon flooding' to make it more specific.",
    redline:null, redlineFixed:null },
];

const CONTRACT_FIELDS = [
  { id:"type",         label:"Contract Type",      type:"select",   options:["Commercial Lease","Residential Lease","Sale Agreement","Service Agreement","Vendor Agreement","NDA / Confidentiality","Partnership Agreement","Employment Agreement"] },
  { id:"clientName",   label:"Client's Full Name", type:"text",     placeholder:"Adv. / M/s. full name" },
  { id:"clientRole",   label:"Client's Role",      type:"select",   options:["Tenant","Buyer","Service Provider","Employer","Vendor","Licensor","Disclosing Party"] },
  { id:"otherParty",   label:"Other Party's Name", type:"text",     placeholder:"Landlord / Seller / etc." },
  { id:"property",     label:"Subject Matter",     type:"text",     placeholder:"Property address / service description" },
  { id:"value",        label:"Contract Value / Rent", type:"text",  placeholder:"₹ amount" },
  { id:"duration",     label:"Duration",           type:"text",     placeholder:"e.g. 24 months from 01-07-2026" },
  { id:"district",     label:"Jurisdiction",       type:"select",   options:["Ernakulam (Kochi)","Thiruvananthapuram","Kozhikode","Thrissur","Kottayam","Kollam","Kannur","Palakkad","Malappuram","Alappuzha"] },
  { id:"specialTerms", label:"Special Instructions", type:"textarea", placeholder:"Specific clauses, client instructions, Kerala-specific requirements…" },
];

// ── Small reusable components ──────────────────────────────────
function FavourBadge({ favour, label }: { favour: string; label: string }) {
  const m: Record<string,{bg:string;color:string;icon:string}> = {
    client:  { bg:C.client+"22",  color:C.client,  icon:"✓" },
    other:   { bg:C.other+"22",   color:C.other,   icon:"✗" },
    neutral: { bg:C.neutral+"22", color:C.neutral, icon:"=" },
  };
  const s = m[favour] ?? m.neutral;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:s.bg, color:s.color,
      fontSize:10, fontFamily:"sans-serif", fontWeight:700, letterSpacing:0.8, textTransform:"uppercase",
      padding:"3px 9px", borderRadius:10 }}>
      {s.icon} {favour==="client"?"Favours Client":favour==="other"?`Favours ${label}`:"Balanced"}
    </span>
  );
}

function SeverityDot({ sev }: { sev: string }) {
  const m: Record<string,string> = { high:C.other, medium:C.warning, low:C.client };
  return <span style={{ width:8, height:8, borderRadius:"50%", background:m[sev]??C.muted, display:"inline-block", marginRight:6, flexShrink:0 }} />;
}

function ScoreBar({ label, count, total, color }: { label:string; count:number; total:number; color:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
      <span style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, width:110, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:6, background:"rgba(255,255,255,0.07)", borderRadius:3 }}>
        <div style={{ width:`${total?(count/total)*100:0}%`, height:"100%", background:color, borderRadius:3, transition:"width 0.8s" }} />
      </div>
      <span style={{ fontSize:12, fontFamily:"sans-serif", color, fontWeight:700, width:20, textAlign:"right" }}>{count}</span>
    </div>
  );
}

// ── Custom Prompt Panel ────────────────────────────────────────
function PromptPanel({
  mode, defaultPrompt, customPrompt, setCustomPrompt, isCustom, setIsCustom,
}: {
  mode: "evaluate" | "draft";
  defaultPrompt: string;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  isCustom: boolean;
  setIsCustom: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyDefault = () => {
    navigator.clipboard.writeText(defaultPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const resetToDefault = () => {
    setCustomPrompt("");
    setIsCustom(false);
  };

  return (
    <div style={{ marginBottom:16, border:`1px solid ${isCustom ? C.purple+"66" : C.border}`, borderRadius:10, overflow:"hidden" }}>
      {/* Header toggle */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between",
          cursor:"pointer", background:isCustom ? C.purple+"12" : C.surfaceHi,
          userSelect:"none" as const }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>🧠</span>
          <span style={{ fontSize:12, fontFamily:"sans-serif", color: isCustom ? C.purple : C.muted, fontWeight:600 }}>
            {mode === "evaluate" ? "Evaluation" : "Drafting"} Prompt
          </span>
          {isCustom && (
            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:C.purple+"22",
              color:C.purple, fontFamily:"sans-serif", fontWeight:700, letterSpacing:0.8 }}>
              CUSTOM
            </span>
          )}
          {!isCustom && (
            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, background:"rgba(255,255,255,0.06)",
              color:C.muted, fontFamily:"sans-serif", letterSpacing:0.8 }}>
              DEFAULT
            </span>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {isCustom && (
            <button onClick={e => { e.stopPropagation(); resetToDefault(); }}
              style={{ fontSize:10, padding:"3px 10px", borderRadius:6, background:"rgba(255,255,255,0.06)",
                border:`1px solid ${C.border}`, color:C.muted, cursor:"pointer", fontFamily:"sans-serif" }}>
              ↩ Reset
            </button>
          )}
          <span style={{ color:C.muted, fontSize:12 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding:16, background:C.surface, borderTop:`1px solid ${C.border}` }}>
          {/* Mode switcher */}
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <button onClick={() => { setIsCustom(false); if(!customPrompt) setCustomPrompt(""); }}
              style={{ flex:1, padding:"7px 0", borderRadius:7, fontSize:11, fontFamily:"sans-serif",
                border:`1px solid ${!isCustom ? C.gold : C.border}`,
                background: !isCustom ? C.gold+"22" : "transparent",
                color: !isCustom ? C.goldBright : C.muted, cursor:"pointer", fontWeight: !isCustom ? 700 : 400 }}>
              📋 Use Default Prompt
            </button>
            <button onClick={() => { setIsCustom(true); if(!customPrompt) setCustomPrompt(defaultPrompt); }}
              style={{ flex:1, padding:"7px 0", borderRadius:7, fontSize:11, fontFamily:"sans-serif",
                border:`1px solid ${isCustom ? C.purple : C.border}`,
                background: isCustom ? C.purple+"22" : "transparent",
                color: isCustom ? C.purple : C.muted, cursor:"pointer", fontWeight: isCustom ? 700 : 400 }}>
              ✏️ Use Custom Prompt
            </button>
          </div>

          {/* Default prompt preview */}
          {!isCustom && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase" }}>
                  Active System Prompt (read-only)
                </span>
                <button onClick={copyDefault}
                  style={{ fontSize:10, padding:"3px 10px", borderRadius:6, background:copied?"rgba(61,190,122,0.15)":"rgba(255,255,255,0.06)",
                    border:`1px solid ${copied ? C.client : C.border}`, color:copied ? C.client : C.muted, cursor:"pointer", fontFamily:"sans-serif" }}>
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
              <pre style={{ fontSize:11, color:C.muted, lineHeight:1.7, background:"rgba(0,0,0,0.25)",
                padding:12, borderRadius:7, whiteSpace:"pre-wrap", fontFamily:"'Courier New',monospace",
                maxHeight:200, overflowY:"auto", margin:0, borderLeft:`3px solid ${C.gold}` }}>
                {defaultPrompt}
              </pre>
              {mode === "draft" && (
                <div style={{ marginTop:8, fontSize:11, fontFamily:"sans-serif", color:C.muted }}>
                  💡 Template variables auto-filled from form fields:{" "}
                  {["{{type}}","{{clientName}}","{{clientRole}}","{{district}}","{{otherParty}}","{{property}}","{{value}}","{{duration}}","{{specialTerms}}"].map(v => (
                    <code key={v} style={{ background:"rgba(201,160,80,0.12)", color:C.gold, padding:"1px 4px", borderRadius:3, marginRight:4, fontSize:10 }}>{v}</code>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Custom prompt editor */}
          {isCustom && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase" }}>
                  Custom Prompt — sent directly to Gemini
                </span>
                <button onClick={() => setCustomPrompt(defaultPrompt)}
                  style={{ fontSize:10, padding:"3px 10px", borderRadius:6, background:"rgba(255,255,255,0.06)",
                    border:`1px solid ${C.border}`, color:C.muted, cursor:"pointer", fontFamily:"sans-serif" }}>
                  Load Default as Base
                </button>
              </div>
              <textarea
                rows={12}
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder={`Write your custom ${mode === "evaluate" ? "evaluation" : "drafting"} prompt here…\n\nFor evaluation: must instruct Gemini to return a JSON array with the required fields.\nFor drafting: write any instruction you need — jurisdiction, tone, language (e.g. Malayalam), special clauses.`}
                style={{ width:"100%", background:"rgba(0,0,0,0.3)", border:`1px solid ${C.purple}55`,
                  borderRadius:8, padding:"10px 14px", color:C.text, fontSize:12, fontFamily:"'Courier New',monospace",
                  lineHeight:1.7, resize:"vertical", outline:"none", boxSizing:"border-box" as const }}
              />
              <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap" as const }}>
                {mode === "evaluate" ? (
                  <>
                    <button onClick={() => setCustomPrompt(`You are a senior advocate specialising in Indian corporate law.\n\nAnalyse the contract below and return a JSON array. For each clause:\n{\n  "id": number,\n  "title": "...",\n  "text": "...",\n  "favour": "client" | "other" | "neutral",\n  "favourLabel": "...",\n  "analysis": "...",\n  "recommendation": "...",\n  "severity": "high" | "medium" | "low",\n  "redline": null,\n  "redlineFixed": null\n}\n\nReturn ONLY valid JSON array.`)}
                      style={snippetBtn}>📌 Corporate Law Template</button>
                    <button onClick={() => setCustomPrompt(`നിങ്ങൾ ഒരു മുതിർന്ന കേരള അഭിഭാഷകൻ ആണ്. ഈ കരാർ വിശകലനം ചെയ്ത് ഓരോ വ്യവസ്ഥയും ആരുടെ പക്ഷത്ത് ആണ് എന്ന് JSON array ൽ നൽകുക.\n\nEach object:\n{\n  "id": number, "title": "...", "text": "...", "favour": "client"|"other"|"neutral",\n  "favourLabel": "...", "analysis": "മലയാളത്തിൽ വിശകലനം", "recommendation": "ക്ലയൻ്റ്-അനുകൂലമാക്കാൻ എന്ത് ചെയ്യണം",\n  "severity": "high"|"medium"|"low", "redline": null, "redlineFixed": null\n}\n\nReturn ONLY valid JSON array.`)}
                      style={snippetBtn}>🇮🇳 Malayalam Prompt</button>
                    <button onClick={() => setCustomPrompt(`You are a consumer rights advocate under the Consumer Protection Act 2019.\n\nAnalyse this contract from the consumer's perspective and return a JSON array:\n{\n  "id": number, "title": "...", "text": "...",\n  "favour": "client"|"other"|"neutral", "favourLabel": "...",\n  "analysis": "Analysis referencing CPA 2019 and CCPA guidelines",\n  "recommendation": "How to protect consumer rights",\n  "severity": "high"|"medium"|"low", "redline": null, "redlineFixed": null\n}\n\nReturn ONLY valid JSON array.`)}
                      style={snippetBtn}>🛒 Consumer Rights Template</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setCustomPrompt(`Draft a complete Sale Agreement (Agreement to Sell) under the Transfer of Property Act 1882 and Registration Act 1908 for Kerala.\n\nClient: {{clientName}} (Buyer)\nSeller: {{otherParty}}\nProperty: {{property}}\nConsideration: {{value}}\nJurisdiction: {{district}}, Kerala\n\nDraft in favour of Buyer. Include: title verification clause, encumbrance-free warranty, possession timeline, penalty for delay, refund of advance with interest if seller defaults.\nMark each clause [BUYER-FAVOURABLE] or [BALANCED].\nAdd Malayalam disclaimer footer.`)}
                      style={snippetBtn}>🏠 Sale Agreement Template</button>
                    <button onClick={() => setCustomPrompt(`Draft a Vendor Service Agreement under Indian Contract Act 1872 for Kerala.\n\nClient: {{clientName}} (Service Recipient / Principal)\nVendor: {{otherParty}}\nServices: {{property}}\nValue: {{value}}\nDuration: {{duration}}\nJurisdiction: {{district}}, Kerala\n\nDraft strongly in favour of the Service Recipient. Include: milestone-based payment, penalty for delay, IP ownership with client, exit clause without penalty after 30 days, non-solicitation for 12 months.\nMark clauses [CLIENT-FAVOURABLE] or [BALANCED].`)}
                      style={snippetBtn}>⚙️ Vendor Agreement Template</button>
                    <button onClick={() => setCustomPrompt(`ഒരു കേരള വാണിജ്യ വാടക കരാർ (Commercial Lease) മലയാളത്തിൽ തയ്യാറാക്കുക.\n\nക്ലയൻ്റ് (വാടകക്കാരൻ): {{clientName}}\nഉടമ: {{otherParty}}\nസ്ഥലം: {{property}}\nവാടക: {{value}}\nകാലാവധി: {{duration}}\nജില്ല: {{district}}\n\nഎല്ലാ വ്യവസ്ഥകളും വാടകക്കാരന് അനുകൂലമായി ഉണ്ടാക്കുക. Kerala Rent Control Act 1965 അനുസരിച്ച് ആയിരിക്കണം.\nഓരോ ക്ലോസിലും [ക്ലയൻ്റ്-അനുകൂലം] അല്ലെങ്കിൽ [സന്തുലിതം] എന്ന് അടയാളപ്പെടുത്തുക.`)}
                      style={snippetBtn}>🇮🇳 Malayalam Draft</button>
                  </>
                )}
              </div>
              <div style={{ marginTop:8, fontSize:11, fontFamily:"sans-serif", color:C.muted, lineHeight:1.6 }}>
                ⚠ Custom prompt is sent verbatim to Gemini.{" "}
                {mode === "evaluate"
                  ? "Ensure it instructs the model to return a valid JSON array with the required fields, otherwise parsing will fail."
                  : "Template variables like {{clientName}} will NOT be auto-substituted in custom mode — include values directly or use them as shown in the snippets above."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const snippetBtn: React.CSSProperties = {
  fontSize:10, padding:"4px 10px", borderRadius:6,
  background:"rgba(155,111,212,0.12)", border:`1px solid ${C.purple}44`,
  color:C.purple, cursor:"pointer", fontFamily:"sans-serif",
};

// ── Law Framework Definitions (Knowledge Base) ──────────────────
export interface LawFramework {
  id: string;
  name: string;
  type: "preset" | "uploaded";
  description: string;
  guidelines: string;
}

const PRESET_LAWS: LawFramework[] = [
  {
    id: "indian-contract",
    name: "Indian Contract Act, 1872 & Kerala Laws",
    type: "preset",
    description: "Evaluates contracts under the Indian Contract Act 1872, Kerala Rent Control Act 1965, and applicable local provisions.",
    guidelines: `You must evaluate and draft terms strictly under Indian Contract Law, particularly the Indian Contract Act, 1872, the Specific Relief Act, 1963, and Local Kerala statutes (e.g. Kerala Rent Control Act, 1965).
Key legal principles to look for or draft:
1. Penalties (Section 74): High liquidating damages/daily penalties must be reasonable representations of loss or are void. Delay interests are capped under practice.
2. Section 56 (Force Majeure & Frustration): High standards of frustration in India, specific rent suspension agreements are required to survive lockdowns.
3. Unilateral Termination & Notice Periods: High-risk notice clauses, structural maintenance obligations assigned normally to owners in lease, etc.
4. Jurisdiction must be Ernakulam/Kochi or localized Kerala district competent courts. Exclusive foreign jurisdictions are problematic.`
  },
  {
    id: "american-contract",
    name: "American Contract Law (UCC & US Common Law)",
    type: "preset",
    description: "Evaluates contracts under US Common Law and the Uniform Commercial Code (UCC) with focus on Delaware & NY governance.",
    guidelines: `You must evaluate and draft terms strictly under US Contract Law (Uniform Commercial Code for sales of goods, and Common Law for services/leases), focusing on standard Delaware and New York governing frameworks.
Key compliance features to look for or draft:
1. Consideration: Ensure valid mutual exchange is clearly established and stated.
2. Indemnification: Unilateral vs Mutual indemnification clauses. Focus heavily on 'defense' mechanisms.
3. Limitation of Liability (LoL): Check if liability is capped to fees paid under 6/12 months. Ensure waiver of consequential/indirect damages is in ALL CAPS.
4. Boilerplate / Integration Clause: Presence of entire agreement rules, choice of law (Delaware/NY state courts or AAA/JAMS arbitration).
5. Warranties: Ensure disclaimers of fitness for a particular purpose are written in ALL CAPS.`
  }
];

// ── Main component ─────────────────────────────────────────────
export default function ContractEngine() {
  const [tab, setTab] = useState<"evaluate"|"draft"|"knowledge-base">("evaluate");
  const [apiKey, setApiKey] = useState("");
  // Enable connected key automatically if compiled process.env.API_KEY is available
  const [keyActive, setKeyActive] = useState(!!process.env.API_KEY);
  const [keyInput, setKeyInput] = useState("");

  // Knowledge Base State
  const [laws, setLaws] = useState<LawFramework[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexus_laws");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved laws", e);
        }
      }
    }
    return PRESET_LAWS;
  });

  const [activeLawId, setActiveLawId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexus_active_law_id");
      if (saved) return saved;
    }
    return "indian-contract";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("nexus_laws", JSON.stringify(laws));
    }
  }, [laws]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("nexus_active_law_id", activeLawId);
    }
  }, [activeLawId]);

  const [customLawName, setCustomLawName] = useState("");
  const [customLawGuidelines, setCustomLawGuidelines] = useState("");
  const [customLawDesc, setCustomLawDesc] = useState("");
  const [customLawError, setCustomLawError] = useState("");
  const [customSuccessMsg, setCustomSuccessMsg] = useState("");
  const [editingLawId, setEditingLawId] = useState<string | null>(null);

  const customLawFileRef = useRef<HTMLInputElement>(null);

  // Evaluate state
  const [uploadedFile, setUploadedFile] = useState<File|null>(null);
  const [contractText, setContractText] = useState("");
  const [clientRoleInput, setClientRoleInput] = useState("Tenant");
  const [evaluating, setEvaluating] = useState(false);
  const [provisions, setProvisions] = useState<Provision[]|null>(null);
  const [evalError, setEvalError] = useState("");
  const [expanded, setExpanded] = useState<number|null>(null);
  const [filterFavour, setFilterFavour] = useState("all");
  const [showRedlines, setShowRedlines] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Custom prompt — evaluate
  const [evalCustomPrompt, setEvalCustomPrompt] = useState("");
  const [evalIsCustom, setEvalIsCustom] = useState(false);

  // Draft state
  const [draftFields, setDraftFields] = useState<Record<string,string>>({});
  const [drafting, setDrafting] = useState(false);
  const [draftResult, setDraftResult] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftCopied, setDraftCopied] = useState(false);

  // Custom prompt — draft
  const [draftCustomPrompt, setDraftCustomPrompt] = useState("");
  const [draftIsCustom, setDraftIsCustom] = useState(false);

  // Load default prompts on mount
  useEffect(() => {
    if (!evalCustomPrompt) setEvalCustomPrompt(EVAL_DEFAULT);
    if (!draftCustomPrompt) setDraftCustomPrompt(DRAFT_DEFAULT);
  }, []);

  // ── Knowledge Base Handlers ──
  const handleLawFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!["txt", "md", "json"].includes(extension || "")) {
      setCustomLawError("Please upload a .txt, .md, or .json file. Other formats can be pasted below.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || "";
      let parsedGuidelines = text;

      if (extension === "json") {
        try {
          const js = JSON.parse(text);
          if (js.guidelines) parsedGuidelines = js.guidelines;
          if (js.name) setCustomLawName(js.name);
          if (js.description) setCustomLawDesc(js.description);
        } catch(err) {
          // ignore parsing error, treat as raw text
        }
      }

      setCustomLawGuidelines(parsedGuidelines);
      if (!customLawName) {
        setCustomLawName(file.name.replace(/\.[^/.]+$/, ""));
      }
      if (!customLawDesc) {
        setCustomLawDesc(`Imported custom standard reference (${(file.size / 1024).toFixed(1)} KB)`);
      }
      setCustomLawError("");
      setCustomSuccessMsg("File guidelines imported successfully! Review and save below.");
    };
    reader.readAsText(file);
  };

  const saveCustomLaw = () => {
    setCustomLawError("");
    setCustomSuccessMsg("");

    if (!customLawName.trim()) {
      setCustomLawError("Please enter a name for the custom law framework.");
      return;
    }
    if (!customLawGuidelines.trim()) {
      setCustomLawError("Please enter the detailed guidelines text.");
      return;
    }

    if (editingLawId) {
      setLaws(prev => prev.map(l => {
        if (l.id === editingLawId) {
          return {
            ...l,
            name: customLawName,
            description: customLawDesc || "Updated custom guidelines.",
            guidelines: customLawGuidelines
          };
        }
        return l;
      }));
      setCustomSuccessMsg(`Successfully updated "${customLawName}"!`);
      setEditingLawId(null);
    } else {
      const newLaw: LawFramework = {
        id: "custom-" + Date.now(),
        name: customLawName,
        type: "uploaded",
        description: customLawDesc || "User uploaded law / guidelines reference.",
        guidelines: customLawGuidelines
      };
      setLaws(prev => [...prev, newLaw]);
      setActiveLawId(newLaw.id);
      setCustomSuccessMsg(`Successfully created and activated "${customLawName}"!`);
    }

    setCustomLawName("");
    setCustomLawDesc("");
    setCustomLawGuidelines("");
  };

  const deleteCustomLaw = (id: string, name: string) => {
    setLaws(prev => prev.filter(l => l.id !== id));
    if (activeLawId === id) {
      setActiveLawId("indian-contract");
    }
    setCustomSuccessMsg(`Removed custom framework "${name}".`);
  };

  const startEditLaw = (law: LawFramework) => {
    setEditingLawId(law.id);
    setCustomLawName(law.name);
    setCustomLawDesc(law.description);
    setCustomLawGuidelines(law.guidelines);
    setCustomSuccessMsg("");
    setCustomLawError("");
    const element = document.getElementById("knowledge-base-form");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // ── File handling ──
  const handleFile = (f: File) => {
    setUploadedFile(f); setUsingDemo(false); setProvisions(null); setEvalError("");
    const reader = new FileReader();
    reader.onload = ev => setContractText((ev.target?.result as string) ?? "");
    reader.readAsText(f);
  };
  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => { if(e.target.files?.[0]) handleFile(e.target.files[0]); };
  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); if(e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  // ── Evaluate with direct Gemini ──
  const startEvaluate = async (demo = false) => {
    setEvaluating(true); setProvisions(null); setEvalError(""); setExpanded(null);
    if (demo) {
      setTimeout(() => { setEvaluating(false); setProvisions(SAMPLE_PROVISIONS); setUsingDemo(true); }, 2000);
      return;
    }
    try {
      const activeKey = apiKey || process.env.API_KEY;
      if (!activeKey) {
        setEvalError("API key required. Please enter an API Key in the top-right field or set it in your workspace env.");
        setEvaluating(false);
        return;
      }

      const selectedLaw = laws.find(l => l.id === activeLawId) || PRESET_LAWS[0];

      const baseInstruction = evalIsCustom && evalCustomPrompt.trim()
        ? evalCustomPrompt
        : EVAL_DEFAULT.replace("{{clientRole}}", clientRoleInput || "Tenant/Buyer");

      const systemInstruction = `${baseInstruction}

GOVERNING LAW & REGULATORY FRAMEWORK REFERENCE:
Framework: ${selectedLaw.name}
Guidelines / Focused Rules:
${selectedLaw.guidelines}

CRITICAL: Evaluate the contract provisions specifically with respect to this governing law framework. Adjust the favorability, risk levels, and recommendations to match these regulations.`;

      const prompt = `${systemInstruction}

CONTRACT:
${contractText.slice(0, 8000)}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setEvalError(err?.error?.message || "Gemini API error");
        setEvaluating(false);
        return;
      }

      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsedProvisions = JSON.parse(clean);
      setProvisions(parsedProvisions);
    } catch(e) { setEvalError(String(e)); }
    setEvaluating(false);
  };

  // ── Draft with direct Gemini ──
  const generateDraft = async () => {
    setDrafting(true); setDraftResult(""); setDraftError("");
    try {
      const activeKey = apiKey || process.env.API_KEY;
      if (!activeKey) {
        setDraftError("API key required. Please enter an API Key in the top-right field or set it in your workspace env.");
        setDrafting(false);
        return;
      }

      const fillTemplate = (template: string, fields: Record<string, string>): string => {
        return template
          .replace(/{{type}}/g,         fields.type         || "Commercial Lease")
          .replace(/{{clientName}}/g,   fields.clientName   || "the Client")
          .replace(/{{clientRole}}/g,   fields.clientRole   || "Tenant")
          .replace(/{{district}}/g,     fields.district     || "Ernakulam")
          .replace(/{{otherParty}}/g,   fields.otherParty   || "[OTHER PARTY]")
          .replace(/{{property}}/g,     fields.property     || "[PROPERTY/SERVICE]")
          .replace(/{{value}}/g,        fields.value        || "[VALUE]")
          .replace(/{{duration}}/g,     fields.duration     || "[DURATION]")
          .replace(/{{specialTerms}}/g, fields.specialTerms || "None");
      };

      const selectedLaw = laws.find(l => l.id === activeLawId) || PRESET_LAWS[0];

      const basePrompt = draftIsCustom && draftCustomPrompt.trim()
        ? draftCustomPrompt
        : fillTemplate(DRAFT_DEFAULT, draftFields || {});

      const prompt = `${basePrompt}

GOVERNING LAW & REGULATORY FRAMEWORK REFERENCE:
Framework: ${selectedLaw.name}
Guidelines / Focused Rules:
${selectedLaw.guidelines}

CRITICAL: Draft the entire contract fully embodying and respecting this governing law framework.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDraftError(err?.error?.message || "Gemini API error");
        setDrafting(false);
        return;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      setDraftResult(text);
    } catch(e) { setDraftError(String(e)); }
    setDrafting(false);
  };

  const copyDraft = () => { navigator.clipboard.writeText(draftResult); setDraftCopied(true); setTimeout(()=>setDraftCopied(false),2000); };

  const scoreStats = provisions ? {
    total: provisions.length,
    client: provisions.filter(p=>p.favour==="client").length,
    other:  provisions.filter(p=>p.favour==="other").length,
    neutral:provisions.filter(p=>p.favour==="neutral").length,
    highRisk:provisions.filter(p=>p.severity==="high").length,
  } : null;

  const filtered = provisions
    ? filterFavour==="all" ? provisions : provisions.filter(p=>p.favour===filterFavour)
    : [];

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", width:"100%", background:`linear-gradient(160deg,${C.bg} 0%,#0E1C2F 50%,#080F1A 100%)`, color:C.text, fontFamily:"Georgia,'Palatino Linotype',serif", position:"relative", borderRadius:"1.5rem" }} className="overflow-y-auto custom-scrollbar p-1">
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0,
        background:`radial-gradient(ellipse 60% 40% at 15% 90%,rgba(201,160,80,0.05) 0%,transparent 60%),
                   radial-gradient(ellipse 40% 60% at 85% 10%,rgba(61,190,122,0.04) 0%,transparent 60%)`, borderRadius:"1.5rem" }} />

      {/* Header */}
      <header style={{ position:"sticky", top:0, zIndex:100, background:"rgba(11,22,34,0.97)", backdropFilter:"blur(14px)", borderBottom:`1px solid ${C.border}`, borderTopLeftRadius:"1.5rem", borderTopRightRadius:"1.5rem" }}>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"0 20px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:`linear-gradient(135deg,${C.gold},${C.goldBright})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:C.bg, fontWeight:900 }}>N</div>
            <div>
              <div style={{ fontSize:14, letterSpacing:2, fontWeight:700, color:C.goldBright }}>NEXUS JUSTICE</div>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:2.5, marginTop:-1 }}>CONTRACT ENGINE · KERALA</div>
            </div>
          </div>
          {!keyActive ? (
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <input type="password" placeholder="Gemini API Key…" value={keyInput} onChange={e=>setKeyInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&keyInput){ setApiKey(keyInput); setKeyActive(true); }}}
                style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`, borderRadius:7, padding:"6px 12px", color:C.text, fontSize:11, fontFamily:"sans-serif", width:180, outline:"none" }} />
              <button onClick={()=>{ if(keyInput){ setApiKey(keyInput); setKeyActive(true); }}}
                style={{ background:C.gold, color:C.bg, border:"none", borderRadius:7, padding:"6px 14px", fontSize:11, fontFamily:"sans-serif", fontWeight:700, cursor:"pointer" }}>
                Activate
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:6, background:C.client+"18", border:`1px solid ${C.client}44`, borderRadius:20, padding:"5px 12px" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:C.client, display:"inline-block" }} />
              <span style={{ fontSize:11, fontFamily:"sans-serif", color:C.client }}>Gemini Connected</span>
              <button onClick={()=>{ setKeyActive(false); setApiKey(""); setKeyInput(""); }} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:11 }}>✕</button>
            </div>
          )}
        </div>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"0 20px", display:"flex", gap:2, borderTop:`1px solid ${C.border}` }}>
          {([["evaluate","🔍","Evaluate Contract"],["draft","✍️","Draft New Contract"],["knowledge-base","📚","Knowledge Base"]] as const).map(([id,icon,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{ background:tab===id?C.surfaceHi:"transparent",
                borderWidth: "0px 0px 2px 0px",
                borderStyle: "solid",
                borderColor: tab===id ? C.gold : "transparent",
                borderRadius:0, cursor:"pointer", padding:"11px 20px", fontSize:12, fontFamily:"sans-serif",
                color:tab===id?C.goldBright:C.muted, fontWeight:tab===id?700:400, letterSpacing:0.5,
                display:"flex", alignItems:"center", gap:6, transition:"all 0.15s" }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth:960, margin:"0 auto", padding:"28px 20px", position:"relative", zIndex:1 }} className="text-left">

        {/* ════════════ EVALUATE TAB ════════════ */}
        {tab==="evaluate" && (
          <div>
            {/* Active Law Indicator Badge / Bar */}
            <div style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 18px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:15 }}>⚖️</span>
                <div className="text-left">
                  <div style={{ fontSize:10, color:C.muted, fontFamily:"sans-serif", letterSpacing:1, textTransform:"uppercase" }}>Governing Evaluation Reference</div>
                  <div style={{ fontSize:13, color:C.goldBright, fontWeight:700 }}>{laws.find(l => l.id === activeLawId)?.name || "Indian Contract Act, 1872"}</div>
                </div>
              </div>
              <button onClick={() => setTab("knowledge-base")} style={{ background:"rgba(201,160,80,0.12)", border:`1px solid ${C.gold}44`, color:C.goldBright, padding:"5px 12px", borderRadius:6, fontSize:11, fontFamily:"sans-serif", cursor:"pointer", fontWeight:600 }}>
                ⚙️ Configure Reference Laws
              </button>
            </div>

            <div style={{ display:"flex", gap:16, marginBottom:20, flexWrap:"wrap" }} className="justify-start">
              {[[C.client,"Favours Client (Good)"],[C.other,"Favours Other Party (Risk)"],[C.neutral,"Balanced"]].map(([col,lbl])=>(
                <div key={lbl as string} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:10, height:10, borderRadius:"50%", background:col as string, display:"inline-block" }} />
                  <span style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted }}>{lbl as string}</span>
                </div>
              ))}
            </div>

            {!provisions && (
              <>
                {/* Upload zone */}
                <div onDrop={onDrop} onDragOver={e=>e.preventDefault()}
                  style={{ border:`2px dashed ${uploadedFile?C.gold+"88":C.border}`, borderRadius:14, padding:"36px 24px", textAlign:"center",
                    background:uploadedFile?C.gold+"08":"transparent", marginBottom:16, cursor:"pointer", transition:"all 0.2s" }}
                  onClick={()=>fileRef.current?.click()}>
                  <div style={{ fontSize:36, marginBottom:10 }}>{uploadedFile?"📄":"📂"}</div>
                  {uploadedFile ? (
                    <><div style={{ fontSize:15, color:C.goldBright, marginBottom:4 }}>{uploadedFile.name}</div>
                    <div style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted }}>Ready to evaluate</div></>
                  ) : (
                    <><div style={{ fontSize:14, color:C.text, marginBottom:6 }}>Drop contract PDF / DOCX / TXT here</div>
                    <div style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted }}>or click to browse</div></>
                  )}
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.doc" onChange={onFileInput} style={{ display:"none" }} />
                </div>

                {/* Paste */}
                <div style={{ marginBottom:16 }} className="text-left">
                  <div style={{ fontSize:11, color:C.muted, fontFamily:"sans-serif", marginBottom:6, letterSpacing:0.8, textTransform:"uppercase" }} className="text-left">Or paste contract text</div>
                  <textarea rows={5} value={contractText} onChange={e=>setContractText(e.target.value)}
                    placeholder="Paste full contract text here…"
                    style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 14px",
                      color:C.text, fontSize:12, fontFamily:"sans-serif", resize:"vertical", outline:"none", boxSizing:"border-box" }} />
                </div>

                {/* Client role */}
                <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16, flexWrap:"wrap" }} className="justify-start">
                  <div style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted }}>Client is the:</div>
                  {["Tenant","Buyer","Service Provider","Employer","Lender"].map(r=>(
                    <button key={r} onClick={()=>setClientRoleInput(r)}
                      style={{ background:clientRoleInput===r?C.gold+"22":"transparent", border:`1px solid ${clientRoleInput===r?C.gold:C.border}`,
                        borderRadius:20, padding:"5px 12px", fontSize:11, fontFamily:"sans-serif",
                        color:clientRoleInput===r?C.goldBright:C.muted, cursor:"pointer" }}>{r}</button>
                  ))}
                </div>

                {/* ── Custom Prompt Panel ── */}
                <PromptPanel
                  mode="evaluate"
                  defaultPrompt={EVAL_DEFAULT}
                  customPrompt={evalCustomPrompt}
                  setCustomPrompt={setEvalCustomPrompt}
                  isCustom={evalIsCustom}
                  setIsCustom={setEvalIsCustom}
                />

                {/* Buttons */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }} className="justify-start">
                  <button onClick={()=>startEvaluate(true)}
                    style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 18px",
                      color:C.muted, fontSize:12, fontFamily:"sans-serif", cursor:"pointer" }}>
                    📋 Use Sample Contract
                  </button>
                  <button onClick={()=>startEvaluate(false)} disabled={(!uploadedFile&&!contractText.trim())||evaluating||!keyActive}
                    style={{ background:((uploadedFile||contractText.trim())&&!evaluating&&keyActive)?C.gold:"rgba(255,255,255,0.05)",
                      color:((uploadedFile||contractText.trim())&&!evaluating&&keyActive)?C.bg:C.muted,
                      border:"none", borderRadius:8, padding:"9px 22px", fontSize:12, fontFamily:"sans-serif", fontWeight:700,
                      cursor:((uploadedFile||contractText.trim())&&!evaluating&&keyActive)?"pointer":"default" }}>
                    {evaluating?"⏳ Analysing with Gemini…":keyActive?"🔍 Evaluate Contract":"🔑 Activate API Key First"}
                  </button>
                  {evalIsCustom && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", background:C.purple+"12", border:`1px solid ${C.purple}44`, borderRadius:8 }}>
                      <span style={{ fontSize:10, color:C.purple, fontFamily:"sans-serif" }}>🧠 Using custom prompt</span>
                    </div>
                  )}
                </div>

                {evalError && <div style={{ marginTop:12, padding:"10px 14px", background:C.other+"18", border:`1px solid ${C.other}44`, borderRadius:8, fontSize:12, fontFamily:"sans-serif", color:C.other }}>⚠ {evalError}</div>}
              </>
            )}

            {evaluating && (
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginTop:8 }}>
                {["Extracting provisions…","Identifying parties and roles…","Analysing each clause for favour…","Generating client-favourable redlines…"].map((step,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${C.gold}`, borderTopColor:"transparent", animation:"spin 0.8s linear infinite", flexShrink:0 }} />
                    <span style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted }}>{step}</span>
                  </div>
                ))}
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {/* Results */}
            {provisions && scoreStats && (
              <div>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:24, marginBottom:20, display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
                  <div>
                    <div style={{ fontSize:11, color:C.muted, fontFamily:"sans-serif", letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>Provision Scorecard</div>
                    <ScoreBar label="Favours Client" count={scoreStats.client}  total={scoreStats.total} color={C.client} />
                    <ScoreBar label="Favours Other"  count={scoreStats.other}   total={scoreStats.total} color={C.other} />
                    <ScoreBar label="Balanced"       count={scoreStats.neutral} total={scoreStats.total} color={C.neutral} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:C.muted, fontFamily:"sans-serif", letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>Risk Summary</div>
                    <div style={{ fontSize:28, color:C.other, fontWeight:700, marginBottom:2 }}>{scoreStats.highRisk}</div>
                    <div style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted, marginBottom:16 }}>High-risk provisions need renegotiation</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <button onClick={()=>{ setProvisions(null); setUploadedFile(null); setContractText(""); setUsingDemo(false); }}
                        style={{ background:"rgba(255,255,255,0.06)", border:`1px solid ${C.border}`, borderRadius:7, padding:"6px 14px", fontSize:11, fontFamily:"sans-serif", color:C.muted, cursor:"pointer" }}>
                        ↩ New Contract
                      </button>
                      <button onClick={()=>setShowRedlines(!showRedlines)}
                        style={{ background:showRedlines?C.gold+"22":"rgba(255,255,255,0.06)", border:`1px solid ${showRedlines?C.gold:C.border}`,
                          borderRadius:7, padding:"6px 14px", fontSize:11, fontFamily:"sans-serif", color:showRedlines?C.goldBright:C.muted, cursor:"pointer" }}>
                        {showRedlines?"✓ Redlines ON":"Show Redlines"}
                      </button>
                    </div>
                    {usingDemo && <div style={{ marginTop:10, fontSize:10, fontFamily:"sans-serif", color:C.muted, fontStyle:"italic" }}>Sample contract — add your API key for real analysis</div>}
                  </div>
                </div>

                {/* Filter pills */}
                <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }} className="justify-start">
                  {[
                    { id:"all",     label:`All (${scoreStats.total})`,                   color:C.gold },
                    { id:"other",   label:`⚠ Risks (${scoreStats.other})`,              color:C.other },
                    { id:"client",  label:`✓ Client-Favourable (${scoreStats.client})`, color:C.client },
                    { id:"neutral", label:`= Balanced (${scoreStats.neutral})`,          color:C.neutral },
                  ].map(f=>(
                    <button key={f.id} onClick={()=>setFilterFavour(f.id)}
                      style={{ background:filterFavour===f.id?f.color+"22":"transparent", border:`1px solid ${filterFavour===f.id?f.color:C.border}`,
                        borderRadius:20, padding:"5px 13px", fontSize:11, fontFamily:"sans-serif",
                        color:filterFavour===f.id?f.color:C.muted, cursor:"pointer", transition:"all 0.15s" }}>{f.label}</button>
                  ))}
                </div>

                {/* Provision cards */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {filtered.map(p=>(
                    <div key={p.id} style={{ background:C.surface,
                      border:`1px solid ${p.favour==="other"?C.other+"44":p.favour==="client"?C.client+"33":C.border}`,
                      borderLeft:`4px solid ${p.favour==="other"?C.other:p.favour==="client"?C.client:C.neutral}`,
                      borderRadius:"0 10px 10px 0", overflow:"hidden" }}>
                      <div style={{ padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, justifyContent:"space-between" }}
                        onClick={()=>setExpanded(expanded===p.id?null:p.id)}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }} className="text-left">
                          <SeverityDot sev={p.severity} />
                          <span style={{ fontSize:14, fontWeight:600, color:C.text }}>{p.title}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          <FavourBadge favour={p.favour} label={p.favourLabel} />
                          <span style={{ color:C.muted, fontSize:12 }}>{expanded===p.id?"▲":"▼"}</span>
                        </div>
                      </div>
                      <div style={{ padding:"0 18px 12px", borderTop:`1px solid rgba(255,255,255,0.05)` }}>
                        <div style={{ fontSize:11, color:C.muted, fontFamily:"sans-serif", letterSpacing:0.8, textTransform:"uppercase", padding:"10px 0 6px" }} className="text-left">Original Provision</div>
                        <div style={{ fontSize:12.5, color:C.sand, lineHeight:1.7, fontStyle:"italic", background:"rgba(0,0,0,0.2)", padding:"10px 14px", borderRadius:7 }} className="text-left">
                          &ldquo;{p.text}&rdquo;
                        </div>
                      </div>
                      {expanded===p.id && (
                        <div style={{ borderTop:`1px solid rgba(255,255,255,0.06)`, padding:18 }} className="text-left">
                          <div style={{ marginBottom:14 }}>
                            <div style={{ fontSize:11, color:C.muted, fontFamily:"sans-serif", letterSpacing:0.8, textTransform:"uppercase", marginBottom:7 }}>
                              ⚖ Analysis — {p.favour==="other"?"Disadvantageous to Client":p.favour==="client"?"Favourable to Client":"Balanced"}
                            </div>
                            <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontFamily:"sans-serif" }}>{p.analysis}</div>
                          </div>
                          <div style={{ background:p.favour==="client"?C.client+"0F":p.favour==="other"?C.other+"0F":C.neutral+"0F",
                            border:`1px solid ${p.favour==="client"?C.client+"33":p.favour==="other"?C.other+"33":C.neutral+"33"}`,
                            borderRadius:8, padding:14, marginBottom:showRedlines&&p.redline?14:0 }}>
                            <div style={{ fontSize:11, fontFamily:"sans-serif", letterSpacing:0.8, textTransform:"uppercase", marginBottom:7,
                              color:p.favour==="client"?C.client:p.favour==="other"?C.other:C.neutral }}>
                              {p.favour==="other"?"🔧 What To Do — Make It Client-Favourable":p.favour==="client"?"✓ Recommendation":"💡 Recommendation"}
                            </div>
                            <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontFamily:"sans-serif" }}>{p.recommendation}</div>
                          </div>
                          {showRedlines && p.redline && (
                            <div style={{ background:"rgba(0,0,0,0.25)", border:`1px solid rgba(255,255,255,0.08)`, borderRadius:8, padding:14 }}>
                              <div style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:10 }}>Tracked Changes (Redline)</div>
                              <div style={{ fontSize:12, fontFamily:"'Courier New',monospace", lineHeight:1.8 }}>
                                <span style={{ color:C.other, textDecoration:"line-through", background:C.other+"15", padding:"1px 4px", borderRadius:3 }}>— {p.redline}</span><br />
                                <span style={{ color:C.client, background:C.client+"15", padding:"1px 4px", borderRadius:3 }}>+ {p.redlineFixed}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop:20, display:"flex", gap:10, padding:16, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, flexWrap:"wrap" }} className="justify-start">
                  <button style={{ background:C.gold, color:C.bg, border:"none", borderRadius:8, padding:"9px 18px", fontSize:12, fontFamily:"sans-serif", fontWeight:700, cursor:"pointer" }}>📥 Export Full Report</button>
                  <button style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 18px", fontSize:12, fontFamily:"sans-serif", color:C.muted, cursor:"pointer" }}>📄 Generate Redlined Contract</button>
                  <button onClick={()=>setTab("draft")} style={{ background:"transparent", border:`1px solid ${C.client+"55"}`, borderRadius:8, padding:"9px 18px", fontSize:12, fontFamily:"sans-serif", color:C.client, cursor:"pointer" }}>
                    ✍️ Draft Client-Favourable Version →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ DRAFT TAB ════════════ */}
        {tab==="draft" && (
          <div>
            {/* Active Law Indicator Badge / Bar */}
            <div style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 18px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:15 }}>⚖️</span>
                <div className="text-left">
                  <div style={{ fontSize:10, color:C.muted, fontFamily:"sans-serif", letterSpacing:1, textTransform:"uppercase" }}>Governing Drafting Reference</div>
                  <div style={{ fontSize:13, color:C.goldBright, fontWeight:700 }}>{laws.find(l => l.id === activeLawId)?.name || "Indian Contract Act, 1872"}</div>
                </div>
              </div>
              <button onClick={() => setTab("knowledge-base")} style={{ background:"rgba(201,160,80,0.12)", border:`1px solid ${C.gold}44`, color:C.goldBright, padding:"5px 12px", borderRadius:6, fontSize:11, fontFamily:"sans-serif", cursor:"pointer", fontWeight:600 }}>
                ⚙️ Configure Reference Laws
              </button>
            </div>

            <div style={{ marginBottom:22 }} className="text-left">
              <h2 style={{ fontSize:20, color:C.goldBright, margin:"0 0 6px", fontWeight:"normal", letterSpacing:0.5 }}>Draft New Contract</h2>
              <p style={{ fontSize:13, fontFamily:"sans-serif", color:C.muted, margin:0 }}>
                All clauses generated client-favourable by default · Kerala jurisdiction · Gemini 2.5 Flash
              </p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1.5fr", gap:14, marginBottom:20 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:14 }}>
                {CONTRACT_FIELDS.map(f=>(
                  <div key={f.id} style={{ gridColumn:f.type==="textarea"?"1 / -1":undefined }} className="text-left">
                    <label style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>{f.label}</label>
                    {f.type==="select" ? (
                      <select value={draftFields[f.id]||""} onChange={e=>setDraftFields(p=>({...p,[f.id]:e.target.value}))}
                        style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:draftFields[f.id]?C.text:C.muted, fontSize:13, fontFamily:"sans-serif", outline:"none" }}>
                        <option value="">Select…</option>
                        {(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type==="textarea" ? (
                      <textarea rows={3} value={draftFields[f.id]||""} placeholder={f.placeholder}
                        onChange={e=>setDraftFields(p=>({...p,[f.id]:e.target.value}))}
                        style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"sans-serif", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
                    ) : (
                      <input type="text" value={draftFields[f.id]||""} placeholder={f.placeholder}
                        onChange={e=>setDraftFields(p=>({...p,[f.id]:e.target.value}))}
                        style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"sans-serif", outline:"none", boxSizing:"border-box" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Custom Prompt Panel ── */}
            <PromptPanel
              mode="draft"
              defaultPrompt={DRAFT_DEFAULT}
              customPrompt={draftCustomPrompt}
              setCustomPrompt={setDraftCustomPrompt}
              isCustom={draftIsCustom}
              setIsCustom={setDraftIsCustom}
            />

            <div style={{ background:C.client+"0D", border:`1px solid ${C.client+"33"}`, borderRadius:8, padding:"10px 16px", marginBottom:16, fontFamily:"sans-serif", fontSize:12, color:C.client }} className="text-left">
              {draftIsCustom
                ? "🧠 Using custom prompt — form fields used only if your prompt includes {{template}} variables"
                : `✓ All provisions drafted in favour of ${draftFields.clientName||"your client"} as ${draftFields.clientRole||"the primary party"} · Kerala courts · enforceable clauses only`}
            </div>

            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:20 }} className="justify-start">
              <button onClick={generateDraft} disabled={drafting||!keyActive}
                style={{ background:(!drafting&&keyActive)?C.gold:"rgba(255,255,255,0.05)", color:(!drafting&&keyActive)?C.bg:C.muted,
                  border:"none", borderRadius:9, padding:"11px 28px", fontSize:13, fontFamily:"sans-serif", fontWeight:700,
                  cursor:(!drafting&&keyActive)?"pointer":"default" }}>
                {drafting?"⏳ Drafting via Gemini 2.5 Flash…":keyActive?"✍️ Generate Contract":"🔑 Activate API Key First"}
              </button>
              {draftIsCustom && (
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", background:C.purple+"12", border:`1px solid ${C.purple}44`, borderRadius:8 }}>
                  <span style={{ fontSize:10, color:C.purple, fontFamily:"sans-serif" }}>🧠 Custom prompt active</span>
                </div>
              )}
            </div>

            {draftError && <div style={{ marginBottom:16, padding:"10px 14px", background:C.other+"18", border:`1px solid ${C.other}44`, borderRadius:8, fontSize:12, fontFamily:"sans-serif", color:C.other }} className="text-left">⚠ {draftError}</div>}

            {draftResult && (
              <div style={{ background:C.surface, border:`1px solid ${C.client+"44"}`, borderRadius:12, overflow:"hidden" }} className="text-left animate-fade-in">
                <div style={{ padding:"12px 18px", background:C.client+"12", borderBottom:`1px solid ${C.client+"33"}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <span style={{ fontSize:13, fontFamily:"sans-serif", color:C.client, fontWeight:700 }}>✓ Contract Generated — {draftIsCustom?"Custom prompt":"All clauses client-favourable"}</span>
                  <button onClick={copyDraft}
                    style={{ background:draftCopied?C.client+"22":"rgba(255,255,255,0.07)", border:`1px solid ${draftCopied?C.client:C.border}`,
                      borderRadius:7, padding:"6px 14px", fontSize:11, fontFamily:"sans-serif", color:draftCopied?C.client:C.muted, cursor:"pointer" }}>
                    {draftCopied?"✓ Copied":"📋 Copy"}
                  </button>
                </div>
                <pre style={{ fontSize:12, color:C.sand, lineHeight:1.85, margin:0, fontFamily:"'Courier New',Courier,monospace",
                  whiteSpace:"pre-wrap", padding:22, maxHeight:520, overflowY:"auto", background:"rgba(0,0,0,0.18)" }} className="text-left">
                  {draftResult}
                </pre>
                <div style={{ padding:"10px 18px", borderTop:`1px solid ${C.border}`, fontFamily:"sans-serif", fontSize:11, color:C.muted }} className="text-left">
                  ⚠ ഇത് ഒരു AI ഡ്രാഫ്റ്റ് ആണ് — ഒപ്പിടുന്നതിന് മുമ്പ് അഭിഭാഷകൻ അന്തിമ അവലോകനം നടത്തേണ്ടതാണ്
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ KNOWLEDGE BASE TAB ════════════ */}
        {tab==="knowledge-base" && (
          <div>
            <div style={{ marginBottom:22 }} className="text-left">
              <h2 style={{ fontSize:20, color:C.goldBright, margin:"0 0 6px", fontWeight:"normal", letterSpacing:0.5 }}>Valuation Knowledge Base</h2>
              <p style={{ fontSize:13, fontFamily:"sans-serif", color:C.muted, margin:0 }}>
                Configure and select the active Governing Law. Your selection immediately calibrates both the artificial contract evaluations and standard legal drafting rules.
              </p>
            </div>

            {/* Current Selected Framework Spotlight */}
            {(() => {
              const current = laws.find(l => l.id === activeLawId) || laws[0];
              return (
                <div style={{ background:`linear-gradient(135deg,rgba(25,35,45,0.85),rgba(17,25,35,0.95))`, border:`1px solid ${C.gold}55`, borderRadius:14, padding:24, marginBottom:28, position:"relative", overflow:"hidden" }} className="text-left shadow-xl">
                  {/* Subtle decorative glowing badge in background */}
                  <div style={{ position:"absolute", top:-10, right:-10, fontSize:96, opacity:0.04, userSelect:"none" }}>⚖️</div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ padding:"2px 8px", background:C.gold+"22", border:`1px solid ${C.gold}`, borderRadius:6, fontSize:10, fontFamily:"sans-serif", color:C.gold, fontWeight:700 }}>ACTIVE STANDARD REFERENCE</div>
                  </div>
                  <h3 style={{ fontSize:18, color:C.goldBright, margin:"0 0 8px", fontWeight:700 }}>{current?.name}</h3>
                  <p style={{ fontSize:13, fontFamily:"sans-serif", color:C.sand, margin:"0 0 16px", fontStyle:"italic" }}>{current?.description}</p>
                  
                  <div style={{ background:"rgba(0,0,0,0.25)", borderRadius:8, padding:16, borderLeft:`3px solid ${C.gold}` }}>
                    <div style={{ fontSize:10, fontFamily:"sans-serif", color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Active Guidance Criteria Rules:</div>
                    <pre style={{ fontSize:11.5, color:C.text, lineHeight:1.7, fontFamily:"'Courier New', monospace", whiteSpace:"pre-wrap", margin:0, maxHeight:200, overflowY:"auto" }}>
                      {current?.guidelines}
                    </pre>
                  </div>
                </div>
              );
            })()}

            {/* Framework Catalogue */}
            <h3 style={{ fontSize:14, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase", marginBottom:14 }} className="text-left">Available Governing Law Frameworks</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(290px, 1fr))", gap:16, marginBottom:28 }}>
              {laws.map(l => {
                const isActive = l.id === activeLawId;
                return (
                  <div key={l.id} 
                    style={{ 
                      background: C.surface, 
                      border: `1px solid ${isActive ? C.gold : C.border}`, 
                      borderRadius:12, 
                      padding:18, 
                      display:"flex", 
                      flexDirection:"column", 
                      justifyContent:"space-between",
                      transition: "all 0.2s"
                    }}
                    className="text-left hover:border-white/20">
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                        <span style={{ padding:"2px 8px", borderRadius:6, background:l.type==="preset"?"rgba(255,255,255,0.06)":C.purple+"22", color:l.type==="preset"?C.muted:C.purple, fontFamily:"sans-serif", fontWeight:"bold", fontSize:9, letterSpacing:0.5 }}>
                          {l.type === "preset" ? "PRESET STANDARD" : "CUSTOM FRAMEWORK"}
                        </span>
                        {isActive && (
                          <span style={{ fontSize:10, color:C.client, fontFamily:"sans-serif", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                            ● SELECTED
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize:14, color: C.text, margin:"0 0 6px", fontWeight:700 }}>{l.name}</h4>
                      <p style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted, margin:"0 0 12px", minHeight:36, lineHeight:1.4 }}>{l.description}</p>
                    </div>

                    <div style={{ borderTop:`1px solid rgba(255,255,255,0.05)`, paddingTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
                      {!isActive && (
                        <button onClick={() => setActiveLawId(l.id)} 
                          style={{ background:C.gold+"22", border:`1px solid ${C.gold}55`, color:C.goldBright, borderRadius:6, padding:"4px 10px", fontSize:11, fontFamily:"sans-serif", cursor:"pointer", fontWeight:600 }}>
                          Activate
                        </button>
                      )}
                      
                      <button onClick={() => startEditLaw(l)}
                        style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"4px 10px", fontSize:11, fontFamily:"sans-serif", cursor:"pointer" }}>
                        View / Edit
                      </button>

                      {l.type === "uploaded" && (
                        <button onClick={() => deleteCustomLaw(l.id, l.name)}
                          style={{ background:"rgba(224,90,78,0.1)", border:`1px solid ${C.other}44`, color:C.other, borderRadius:6, padding:"4px 10px", fontSize:11, fontFamily:"sans-serif", cursor:"pointer", marginLeft:"auto" }}>
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add / Edit Section */}
            <div id="knowledge-base-form" style={{ background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:14, padding:24 }} className="text-left">
              <h3 style={{ fontSize:16, color:C.goldBright, margin:"0 0 6px", fontWeight:"normal" }}>
                {editingLawId ? `✏️ Modify Law Guidelines: ${customLawName}` : "➕ Add Custom Governing Law Framework"}
              </h3>
              <p style={{ fontSize:12, fontFamily:"sans-serif", color:C.muted, margin:"0 0 20px" }}>
                Provide reference text guidelines, acts, or checklists. You can directly import a text file or type custom guidelines.
              </p>

              {customLawError && (
                <div style={{ background:C.other+"18", border:`1px solid ${C.other}44`, color:C.other, borderRadius:8, padding:"10px 14px", fontSize:12, fontFamily:"sans-serif", marginBottom:16 }}>
                  ⚠ {customLawError}
                </div>
              )}

              {customSuccessMsg && (
                <div style={{ background:C.client+"18", border:`1px solid ${C.client}44`, color:C.client, borderRadius:8, padding:"10px 14px", fontSize:12, fontFamily:"sans-serif", marginBottom:16 }}>
                  ✓ {customSuccessMsg}
                </div>
              )}

              {/* Upload file triggers */}
              <div style={{ display:"flex", gap:14, marginBottom:16, flexWrap:"wrap" }} className="justify-start">
                <button onClick={() => customLawFileRef.current?.click()}
                  style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`, color:C.text, borderRadius:8, padding:"8px 16px", fontSize:12, fontFamily:"sans-serif", cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                  📂 Import Law Rules from File (.txt, .md, .json)
                </button>
                <input ref={customLawFileRef} type="file" accept=".txt,.md,.json" onChange={handleLawFileUpload} style={{ display:"none" }} />
              </div>

              {/* Text Fields */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:14, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>Framework / Law Name</label>
                  <input type="text" placeholder="e.g. EU Vendor Privacy Compliance Rules" value={customLawName} onChange={e => setCustomLawName(e.target.value)}
                    style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"sans-serif", outline:"none", boxSizing:"border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>Brief Description</label>
                  <input type="text" placeholder="e.g. Mandatory GDPR and privacy valuation rules for third-party agreements" value={customLawDesc} onChange={e => setCustomLawDesc(e.target.value)}
                    style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"sans-serif", outline:"none", boxSizing:"border-box" }} />
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, fontFamily:"sans-serif", color:C.muted, letterSpacing:0.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>Detailed Guidelines / Specific Rules Text</label>
                <textarea rows={8} placeholder={`Cite core contract acts, chapters, custom corporate bylaws, or focus compliance checks here...\n\nExample:\n- Limitation of liability must be mutual and capped to annual contract value.\n- Automatic extension rules are forbidden under internal corporate policy.\n- Arbitrations must occur under ICC rules in Geneva governed by Swiss law.`} 
                  value={customLawGuidelines} onChange={e => setCustomLawGuidelines(e.target.value)}
                  style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", color:C.text, fontSize:12.5, fontFamily:"'Courier New', monospace", outline:"none", boxSizing:"border-box", resize:"vertical", lineHeight:1.6 }} />
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={saveCustomLaw}
                  style={{ background:C.gold, color:C.bg, border:"none", borderRadius:8, padding:"10px 22px", fontSize:12, fontFamily:"sans-serif", fontWeight:700, cursor:"pointer" }}>
                  {editingLawId ? "💾 Save Changes" : "💾 Save & Activate Framework"}
                </button>
                
                {editingLawId && (
                  <button onClick={() => { setEditingLawId(null); setCustomLawName(""); setCustomLawDesc(""); setCustomLawGuidelines(""); }}
                    style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.muted, borderRadius:8, padding:"10px 18px", fontSize:12, fontFamily:"sans-serif", cursor:"pointer" }}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

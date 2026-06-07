// Caseworker core — the reasoning agent.
//
// Given the text of a bureaucratic document (a benefits denial, an insurance
// EOB, a medical bill, a financial-aid letter), it returns a structured
// analysis plus a ready-to-send appeal/response drafted on the user's behalf.
//
// Design goal: ALWAYS return something useful. Provider priority:
//   ANTHROPIC_API_KEY -> Claude   (best quality)
//   GEMINI_API_KEY    -> Gemini   (free tier, low-cost flash models)
//   neither           -> deterministic demo analysis
// so a live demo never dies because of a missing key or rate limit.

export type Severity = "info" | "action_needed" | "urgent";

export type Deadline = { what: string; date: string; daysLeft?: number | null };
export type Fact = { label: string; value: string };

export interface CaseAnalysis {
  documentType: string;
  domain: string;
  severity: Severity;
  summary: string; // plain-language, 8th-grade reading level
  keyFacts: Fact[];
  yourRights: string[];
  deadlines: Deadline[];
  recommendedActions: string[];
  draftResponse: { title: string; body: string };
  spokenSummary: string; // short, friendly, for text-to-speech
  source: "claude" | "gemini" | "demo";
}

export const DOMAINS = [
  { id: "benefits", label: "Government benefits (SNAP, Medicaid, disability)" },
  { id: "insurance", label: "Insurance appeal (denied claim / prior auth)" },
  { id: "medical", label: "Medical billing dispute" },
  { id: "financial_aid", label: "Financial aid / FAFSA" },
  { id: "small_business", label: "Small-business licensing / permits / grants" },
] as const;

const SYSTEM_PROMPT = `You are Caseworker, an expert patient advocate, benefits counselor, and consumer-rights paralegal rolled into one. You help people who are overwhelmed by bureaucratic paperwork.

You read a document the person received and you:
1. Explain it in plain, calm, 8th-grade-level language. No jargon. No legalese.
2. Surface the facts that matter (amounts, claim/case numbers, reasons given).
3. Tell the person their actual rights in this situation.
4. Extract every deadline, and compute days remaining when a date is present.
5. Give concrete next actions, most important first.
6. Draft a complete, ready-to-send response (appeal letter, dispute letter, or request for reconsideration) in the person's voice — polite, firm, and citing the right grounds. Leave [BRACKETED] placeholders only for things you genuinely cannot infer.

You are an advocate FOR the person. Be specific, be accurate, never invent facts that aren't supported by the document, and never give false legal guarantees. When you are unsure, say what to verify.`;

// The single tool we force Claude to call — gives us clean structured JSON.
const ANALYSIS_TOOL = {
  name: "return_analysis",
  description: "Return the structured analysis of the document.",
  input_schema: {
    type: "object",
    properties: {
      documentType: { type: "string" },
      severity: { type: "string", enum: ["info", "action_needed", "urgent"] },
      summary: { type: "string" },
      keyFacts: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" } },
          required: ["label", "value"],
        },
      },
      yourRights: { type: "array", items: { type: "string" } },
      deadlines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            what: { type: "string" },
            date: { type: "string" },
            daysLeft: { type: ["number", "null"] },
          },
          required: ["what", "date"],
        },
      },
      recommendedActions: { type: "array", items: { type: "string" } },
      draftResponse: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
      spokenSummary: { type: "string" },
    },
    required: [
      "documentType",
      "severity",
      "summary",
      "keyFacts",
      "yourRights",
      "deadlines",
      "recommendedActions",
      "draftResponse",
      "spokenSummary",
    ],
  },
} as const;

// Gemini structured-output schema (OpenAPI subset) — mirrors ANALYSIS_TOOL.
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    documentType: { type: "string" },
    severity: { type: "string", enum: ["info", "action_needed", "urgent"] },
    summary: { type: "string" },
    keyFacts: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, value: { type: "string" } },
        required: ["label", "value"],
      },
    },
    yourRights: { type: "array", items: { type: "string" } },
    deadlines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          what: { type: "string" },
          date: { type: "string" },
          daysLeft: { type: "number", nullable: true },
        },
        required: ["what", "date"],
      },
    },
    recommendedActions: { type: "array", items: { type: "string" } },
    draftResponse: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
      required: ["title", "body"],
    },
    spokenSummary: { type: "string" },
  },
  required: [
    "documentType",
    "severity",
    "summary",
    "keyFacts",
    "yourRights",
    "deadlines",
    "recommendedActions",
    "draftResponse",
    "spokenSummary",
  ],
} as const;

type ModelOutput = Omit<CaseAnalysis, "domain" | "source">;

function userPrompt(documentText: string, domain: string): string {
  return `The person is dealing with: ${domain}.\n\nHere is the document they received:\n\n"""\n${documentText.slice(0, 12000)}\n"""\n\nAnalyze it and return the structured advocacy plan.`;
}

export async function runCaseworker(
  documentText: string,
  domainId: string
): Promise<CaseAnalysis> {
  const domain = DOMAINS.find((d) => d.id === domainId)?.label ?? "General";

  // Provider priority: Claude → Gemini → demo. Each falls through on failure.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const out = await runClaude(documentText, domain);
      return finalize(out, documentText, domain, "claude");
    } catch (err) {
      console.error("[caseworker] Claude failed, trying next provider:", err);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const out = await runGemini(documentText, domain);
      return finalize(out, documentText, domain, "gemini");
    } catch (err) {
      console.error("[caseworker] Gemini failed, using demo mode:", err);
    }
  }

  return demoAnalysis(documentText, domainId, domain);
}

// Recompute daysLeft from each deadline's date string with the server clock —
// models don't reliably know "today", so we never trust their countdown.
function finalize(
  out: ModelOutput,
  _documentText: string,
  domain: string,
  source: "claude" | "gemini"
): CaseAnalysis {
  const deadlines = (out.deadlines || []).map((d) => {
    // Never trust the model's daysLeft — recompute, or null it out.
    const dt = d.date ? parseDate(d.date) : null;
    return { ...d, daysLeft: dt ? daysBetween(dt) : null };
  });
  const soonest = deadlines
    .map((d) => d.daysLeft)
    .filter((n): n is number => typeof n === "number" && n >= 0)
    .sort((a, b) => a - b)[0];
  const severity: Severity =
    typeof soonest === "number" && soonest <= 30 ? "urgent" : out.severity;
  return { ...out, deadlines, severity, domain, source };
}

async function runClaude(documentText: string, domain: string): Promise<ModelOutput> {
  const model = process.env.CASEWORKER_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "return_analysis" },
      messages: [{ role: "user", content: userPrompt(documentText, domain) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUse = (data.content || []).find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use block in Claude response");
  return toolUse.input as ModelOutput;
}

async function runGemini(documentText: string, domain: string): Promise<ModelOutput> {
  const model = process.env.CASEWORKER_GEMINI_MODEL || "gemini-2.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt(documentText, domain) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
        maxOutputTokens: 2400,
        temperature: 0.4,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return JSON.parse(text) as ModelOutput;
}

// ── Deterministic demo fallback ──────────────────────────────────────
// Good enough to demo convincingly with zero API keys. It does light
// extraction (dates, dollar amounts, case numbers) from the real text.

const DATE_RE =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDate(s: string): Date | null {
  if (!s) return null;
  // 1) Month-name form (most common in these letters), parsed locally.
  const m = DATE_RE.exec(s);
  DATE_RE.lastIndex = 0;
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return new Date(Number(m[3]), month, Number(m[2]));
  }
  // 2) ISO (2026-08-30) or numeric (8/30/2026) — handle formats models emit.
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const us = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
  return null;
}

function daysBetween(target: Date): number {
  const now = new Date();
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86_400_000);
}

// Find the most likely deadline: prefer a date that follows a deadline cue.
function findDeadline(text: string): { date: string; daysLeft: number | null } | null {
  const cue =
    /(?:no later than|must be received(?:\s+(?:by|no later than))?|received by|appeal by|respond by|due (?:by|on)|before|by)\s+([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i;
  const cued = text.match(cue)?.[1];
  let chosen = cued ?? null;

  if (!chosen) {
    // Fall back to the latest *future* date mentioned.
    const all = [...text.matchAll(DATE_RE)].map((m) => m[0]);
    const future = all
      .map((d) => ({ d, dt: parseDate(d) }))
      .filter((x): x is { d: string; dt: Date } => !!x.dt && daysBetween(x.dt) >= 0)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());
    chosen = future[0]?.d ?? all[all.length - 1] ?? null;
  }
  if (!chosen) return null;
  const dt = parseDate(chosen);
  return { date: chosen, daysLeft: dt ? daysBetween(dt) : null };
}

function demoAnalysis(
  text: string,
  domainId: string,
  domain: string
): CaseAnalysis {
  const amounts = [...text.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map((m) => m[0]);
  const dates = [...text.matchAll(DATE_RE)].map((m) => m[0]);
  const caseNo =
    text.match(/\b(?:case|claim|reference|policy|account)\s*#?\s*[:]?\s*([A-Z0-9-]{4,})/i)?.[1] ??
    "[on your letter]";

  const deadline = findDeadline(text);
  const deadlineDate = deadline?.date ?? "[see your letter]";
  const daysLeft = deadline?.daysLeft ?? null;

  const templates: Record<
    string,
    Pick<CaseAnalysis, "documentType" | "yourRights" | "draftResponse">
  > = {
    insurance: {
      documentType: "Insurance claim denial",
      yourRights: [
        "You have the right to a written explanation of exactly why the claim was denied.",
        "You can file an internal appeal — usually within 180 days of the denial.",
        "If the internal appeal fails, you have the right to an independent external review.",
        "You can request all documents the insurer used to make the decision, free of charge.",
      ],
      draftResponse: {
        title: "Internal appeal letter",
        body: `To the Appeals Department,\n\nI am writing to formally appeal the denial of claim #${caseNo}. I believe this denial is in error.\n\nThe denial states the service was "not medically necessary." However, the service was ordered by my treating physician as medically necessary, and I am enclosing supporting documentation. Under my plan and applicable law, I am entitled to a full internal review of this decision.\n\nI request that you (1) overturn the denial and process the claim, and (2) provide all clinical criteria used in this determination. Please confirm receipt of this appeal in writing.\n\nSincerely,\n[Your name]\n[Member ID]`,
      },
    },
    benefits: {
      documentType: "Benefits eligibility / denial notice",
      yourRights: [
        "You have the right to a written notice stating the specific reason for the decision.",
        "You have the right to request a fair hearing, usually within 90 days of the notice.",
        "If you appeal before benefits stop, you may be able to keep them during the appeal.",
        "You have the right to see the rules and the file used to decide your case.",
      ],
      draftResponse: {
        title: "Request for a fair hearing",
        body: `To the Hearings Office,\n\nI am requesting a fair hearing regarding case #${caseNo}. I disagree with the decision described in the notice I received.\n\nI believe the decision is based on incorrect or incomplete information about my household and income. I am requesting that my benefits continue unchanged while my appeal is pending, as is my right.\n\nPlease send confirmation of my hearing date and instructions for submitting evidence.\n\nSincerely,\n[Your name]\n[Case number ${caseNo}]`,
      },
    },
    medical: {
      documentType: "Medical bill",
      yourRights: [
        "You have the right to an itemized bill listing every charge.",
        "You can dispute charges and request the billing codes used.",
        "Under the No Surprises Act you may be protected from certain out-of-network 'surprise' bills.",
        "You can request financial assistance or a payment plan; nonprofit hospitals must offer one.",
      ],
      draftResponse: {
        title: "Itemized bill request & dispute",
        body: `To the Billing Department,\n\nRegarding account #${caseNo}: before I can pay, I am requesting a fully itemized bill with all CPT/HCPCS codes and the amounts billed to my insurer.\n\nI am disputing the current balance pending that review, as several charges appear inconsistent with the services I received. Please also send information about your financial-assistance policy and an interest-free payment plan.\n\nPlease pause any collection activity while this dispute is reviewed.\n\nSincerely,\n[Your name]`,
      },
    },
    financial_aid: {
      documentType: "Financial-aid decision",
      yourRights: [
        "You have the right to appeal your aid package if your circumstances changed.",
        "You can submit a 'special circumstances' / professional-judgment request.",
        "You have the right to a clear explanation of how your award was calculated.",
      ],
      draftResponse: {
        title: "Financial-aid appeal (special circumstances)",
        body: `To the Office of Financial Aid,\n\nI am appealing my financial-aid offer (reference ${caseNo}) due to a change in my family's circumstances not reflected in my application.\n\nSince filing, [briefly describe: job loss / medical costs / loss of support]. I am enclosing documentation. I respectfully request a professional-judgment review and a reassessment of my eligibility for need-based aid.\n\nThank you for your consideration.\n\nSincerely,\n[Your name]\n[Student ID]`,
      },
    },
    small_business: {
      documentType: "Licensing / permit decision",
      yourRights: [
        "You have the right to written reasons for any denial.",
        "You can typically appeal or reapply after correcting the cited issues.",
        "You can request a meeting with the reviewing office to clarify requirements.",
      ],
      draftResponse: {
        title: "Request for reconsideration",
        body: `To the Licensing Office,\n\nI am requesting reconsideration of the decision on application ${caseNo}.\n\nI believe I can resolve the cited issues quickly and am requesting a short window to submit the missing items. Please advise on the exact documentation required and any applicable appeal process.\n\nThank you,\n[Your name / business name]`,
      },
    },
  };

  const t = templates[domainId] ?? templates.benefits;

  const severity: Severity =
    daysLeft != null && daysLeft <= 30
      ? "urgent"
      : deadline
      ? "action_needed"
      : "action_needed";

  const urgencyLine =
    daysLeft != null
      ? daysLeft < 0
        ? ` The stated deadline (${deadlineDate}) may have passed, so act immediately — many offices still accept a late appeal with a good-cause explanation.`
        : daysLeft === 0
        ? ` Your deadline is today (${deadlineDate}) — send the response below right now.`
        : ` You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} until your deadline on ${deadlineDate}.`
      : "";

  return {
    documentType: t.documentType,
    domain,
    severity,
    summary: `This is a ${t.documentType.toLowerCase()}. The short version: a decision was made that you have the right to challenge.${urgencyLine} Don't panic — a clear, firm written response often gets these decisions reversed, and Caseworker has already drafted yours below.`,
    keyFacts: [
      { label: "Reference / case number", value: caseNo },
      { label: "Amounts mentioned", value: amounts.length ? amounts.join(", ") : "None found" },
      { label: "Dates mentioned", value: dates.length ? dates.join(", ") : "None found" },
    ],
    yourRights: t.yourRights,
    deadlines: [
      {
        what: "Deadline to file your appeal / response",
        date: deadlineDate,
        daysLeft,
      },
    ],
    recommendedActions: [
      "Send the drafted response below before the deadline (keep a copy).",
      "Send it by a trackable method (certified mail, fax with confirmation, or the official portal).",
      "Gather any supporting documents referenced in the letter.",
      "Write down the case number and the date you responded.",
    ],
    draftResponse: t.draftResponse,
    spokenSummary: `Okay, I read your ${t.documentType.toLowerCase()}. A decision was made that you can challenge.${
      daysLeft != null && daysLeft >= 0
        ? ` You have about ${daysLeft} day${daysLeft === 1 ? "" : "s"} to respond.`
        : ""
    } The good news is you have real rights here, and I've already written your response. Just review it, add the details in brackets, and send it before the deadline.`,
    source: "demo",
  };
}

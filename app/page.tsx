"use client";

import { useState } from "react";
import { DOMAINS } from "@/lib/caseworker";
import { getSamples, type Sample } from "@/lib/samples";
import type { CaseAnalysis } from "@/lib/caseworker";

function Check() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
      <path
        d="M5 10.5l3.2 3.2L15 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [domain, setDomain] = useState<string>("insurance");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CaseAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [samples] = useState<Sample[]>(getSamples);

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentText: text, domain }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e) {
      setError("Something went wrong analyzing that. Please try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function loadSample(s: Sample) {
    setText(s.text);
    setDomain(s.domain);
    setResult(null);
    setError(null);
  }

  async function speak() {
    if (!result) return;
    setSpeaking(true);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: result.spokenSummary }),
      });
      if (res.ok && res.status !== 204) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.onended = () => setSpeaking(false);
        await audio.play();
        return;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(result.spokenSummary);
        u.rate = 1.02;
        u.onend = () => setSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        return;
      }
      setSpeaking(false);
    } catch (e) {
      console.error(e);
      setSpeaking(false);
    }
  }

  async function copyDraft() {
    if (!result) return;
    await navigator.clipboard.writeText(result.draftResponse.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadDraft() {
    if (!result) return;
    const blob = new Blob([result.draftResponse.body], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.draftResponse.title.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
  }

  const deadline = result?.deadlines?.[0];
  const showCountdown =
    deadline && typeof deadline.daysLeft === "number" && deadline.daysLeft >= 0;
  const tagText =
    result?.severity === "urgent"
      ? "Time-sensitive"
      : result?.severity === "action_needed"
      ? "Action needed"
      : "For your records";

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top">
            <span className="mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3v18M5 8h14M7 8l-3 6h6L7 8zm10 0l-3 6h6l-3-6z"
                  stroke="#fff"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Caseworker
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#tool" className="btn primary sm">
              Try it free
            </a>
          </div>
        </div>
      </nav>

      <main id="top">
        {/* HERO */}
        <section className="container hero">
          <span className="eyebrow">
            <span className="dot" /> Your advocate for impossible paperwork
          </span>
          <h1>
            The letter that beats you,
            <br />
            <em>beaten back.</em>
          </h1>
          <p className="sub">
            Paste a denied claim, a benefits cut, or a surprise bill. Caseworker
            explains it in plain English, finds your deadlines and rights, and
            drafts the response that gets it reversed.
          </p>
          <div className="hero-cta">
            <a href="#tool" className="btn primary">
              Analyze a letter
            </a>
            <a href="#how" className="btn outline">
              See how it works
            </a>
          </div>
          <p className="hero-note">
            Works instantly — no login, no setup. It even reads the plan aloud.
          </p>
        </section>

        {/* TOOL */}
        <section id="tool" className="container tool">
          <div className="tool-grid">
            {/* INPUT */}
            <div className="pane left">
              <div className="pane-head">
                <span className="n">01</span>
                <h2>The letter you received</h2>
              </div>

              <label className="field-label">Try a real example</label>
              <div className="chips">
                {samples.map((s) => (
                  <button key={s.label} className="chip" onClick={() => loadSample(s)}>
                    {s.label}
                  </button>
                ))}
              </div>

              <label className="field-label">What is this about?</label>
              <select value={domain} onChange={(e) => setDomain(e.target.value)}>
                {DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>

              <label className="field-label">Paste the document text</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the full text of the letter, bill, or notice here…"
              />

              <div className="actions">
                <button className="btn primary" onClick={analyze} disabled={loading || !text.trim()}>
                  {loading ? (
                    <>
                      <span className="spinner" /> Reading…
                    </>
                  ) : (
                    "Analyze & draft my response"
                  )}
                </button>
                {text && (
                  <button className="btn ghost sm" onClick={() => setText("")}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* OUTPUT */}
            <div className="pane">
              <div className="pane-head">
                <span className="n">02</span>
                <h2>Your advocacy plan</h2>
              </div>

              {!result && !error && (
                <div className="empty">
                  <div className="glyph">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 5h16M4 12h16M4 19h10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <p>
                    Your plain-language breakdown, deadlines, rights, and a
                    ready-to-send response will appear here.
                  </p>
                  <p className="hint">Pick a sample on the left, then “Analyze”.</p>
                </div>
              )}

              {error && (
                <div className="empty">
                  <p style={{ color: "var(--urgent)" }}>{error}</p>
                </div>
              )}

              {result && (
                <div className="result">
                  <div className="result-top">
                    <span className={`tagline ${result.severity}`}>{tagText}</span>
                    <button className="btn outline sm" onClick={speak} disabled={speaking}>
                      {speaking ? "Speaking…" : "▸ Listen"}
                    </button>
                  </div>

                  {showCountdown && (
                    <div className={`countdown ${result.severity === "urgent" ? "is-urgent" : ""}`}>
                      <div className="num">{deadline!.daysLeft}</div>
                      <div>
                        <div className="lab">Days to respond</div>
                        <div className="meta">
                          {deadline!.what} — <b>{deadline!.date}</b>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="block">
                    <p className="doc-type">{result.documentType}</p>
                    <p className="summary">{result.summary}</p>
                  </div>

                  <div className="block">
                    <h3>Key facts</h3>
                    <div className="facts">
                      {result.keyFacts.map((f, i) => (
                        <div className="fact" key={i}>
                          <div className="k">{f.label}</div>
                          <div className="v">{f.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="block">
                    <h3>Your rights</h3>
                    <ul className="rights">
                      {result.yourRights.map((r, i) => (
                        <li key={i}>
                          <Check />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="block">
                    <h3>What to do — in order</h3>
                    <ol className="steps">
                      {result.recommendedActions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="block">
                    <h3>Ready-to-send response</h3>
                    <div className="draftbox">
                      <div className="top">
                        <span className="t">{result.draftResponse.title}</span>
                        <div className="grp">
                          <button className="btn primary sm" onClick={copyDraft}>
                            {copied ? "Copied" : "Copy"}
                          </button>
                          <button className="btn outline sm" onClick={downloadDraft}>
                            Download
                          </button>
                        </div>
                      </div>
                      <pre className="draft">{result.draftResponse.body}</pre>
                    </div>
                    <div className="src">
                      <span className="led" />
                      {result.source === "claude"
                        ? "Generated live by Claude"
                        : result.source === "gemini"
                        ? "Generated live by Gemini"
                        : "Demo mode — add an API key for live reasoning"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="section tinted">
          <div className="container">
            <div className="section-head">
              <h2>One reasoning core, three ways in</h2>
              <p>Caseworker reads, reasons, and writes — so people don’t have to.</p>
            </div>
            <div className="three">
              <div className="feature">
                <div className="ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M4 5h11a2 2 0 012 2v12H6a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M8 9h7M8 13h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </div>
                <h4>It reads the fine print</h4>
                <p>
                  Claude parses adversarial bureaucratic language and pulls out the
                  decision, the reason, the amounts, and every deadline.
                </p>
              </div>
              <div className="feature">
                <div className="ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3v18M5 8h14M7 8l-3 6h6L7 8zm10 0l-3 6h6l-3-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h4>It knows your rights</h4>
                <p>
                  For each case type it surfaces the specific appeal rights and the
                  ordered next steps: what to send, how, and by when.
                </p>
              </div>
              <div className="feature">
                <div className="ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M4 20l4-1L19 8a2 2 0 00-3-3L5 16l-1 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                </div>
                <h4>It writes the response</h4>
                <p>
                  A complete appeal in your voice — copy, sign, and send. Or let an
                  agent call it directly over MCP.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="section">
          <div className="narrow stats">
            <div className="stat">
              <div className="big">1 in 7</div>
              <div className="cap">health insurance claims are denied</div>
            </div>
            <div className="stat">
              <div className="big">&lt;1%</div>
              <div className="cap">of denials are ever appealed</div>
            </div>
            <div className="stat">
              <div className="big">~50%</div>
              <div className="cap">of appeals that are filed succeed</div>
            </div>
          </div>
        </section>

        {/* BUILT WITH */}
        <section className="section tinted">
          <div className="container builtwith">
            <div className="lab">Built on</div>
            <div className="logos">
              <span className="logo">Claude · Anthropic</span>
              <span className="logo">ElevenLabs</span>
              <span className="logo">Model Context Protocol</span>
              <span className="logo">Vercel</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <a className="brand" href="#top">
            <span className="mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v18M5 8h14M7 8l-3 6h6L7 8zm10 0l-3 6h6l-3-6z" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Caseworker
          </a>
          <p className="disc">
            Caseworker provides information and drafting help, not legal advice. It
            never invents facts — always verify deadlines against your own documents.
          </p>
        </div>
      </footer>
    </>
  );
}

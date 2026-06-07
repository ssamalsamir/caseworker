# Caseworker — Devpost submission

## Name
Caseworker

## Tagline
Your AI advocate for impossible paperwork — it reads the denial, finds your deadline and rights, and drafts the appeal that gets it reversed.

## Elevator pitch (one-liner)
Paste a denied claim, a benefits cut, or a surprise bill. Caseworker explains it in plain English, surfaces your rights and deadlines, and writes the response that gets the decision overturned — out loud, in seconds.

---

## 🌟 Inspiration
Every year, millions of people receive a letter that quietly changes their life: a denied insurance claim, a SNAP benefits reduction, an $8,000 "surprise" ER bill, a financial-aid offer that doesn't add up. Studies have found roughly **1 in 7 health insurance claims is denied** — yet **fewer than 1% of denials are ever appealed**, even though a large share of the appeals that *are* filed succeed.

The gap isn't eligibility. It's the paperwork. The letters are deliberately dense, the deadlines are easy to miss, and writing a formal appeal feels impossible when you're already stressed, sick, or broke. People who have a professional advocate win. People who don't, give up.

We wanted to give everyone that advocate.

## 🛠️ What it does
Caseworker turns a wall of bureaucratic text into a clear plan of action. Paste any letter (or pick a built-in sample) and it instantly returns:

- **A plain-English summary** — what the letter actually means, at an 8th-grade reading level.
- **A live deadline countdown** — it finds the date you must act by and shows exactly how many days are left.
- **Your rights** — the specific appeal rights that apply to *this* kind of decision.
- **Ordered next steps** — what to send, how to send it, and what to keep.
- **A ready-to-send response** — a complete appeal/dispute letter in your voice, ready to copy, download, sign, and send.
- **It reads the plan aloud** — voice-first, because our users include the elderly, the visually impaired, and people in crisis who can't face another page of text.

It handles five domains today — insurance appeals, government benefits, medical billing, financial aid, and small-business licensing — and the same engine re-skins to each.

## 🧱 How we built it
One reasoning core, exposed through three surfaces:

- **Frontend** — Next.js 16 (App Router) + React 19, a light, editorial UI (Inter + Newsreader) deployed on **Vercel**.
- **Reasoning core** — a provider-agnostic agent with a priority chain: **Claude (Anthropic) → Gemini → deterministic demo mode**. It forces structured output (Claude tool-calling / Gemini JSON-schema) so every response is a clean, typed advocacy plan. The live demo runs on **Gemini 2.5 Flash Lite** (free tier).
- **Trustworthy deadlines** — we never trust the model's math. The server recomputes every "days left" from the parsed date string (month-name, ISO, and numeric formats), so the countdown is always correct.
- **Voice** — **ElevenLabs** TTS when configured, with a browser speech-synthesis fallback so "Listen" always works.
- **MCP server** — Caseworker is also a **Model Context Protocol** server (`analyze_document`, `draft_appeal`, `list_domains`) over stdio, so any agent or MCP client can call it as a reusable tool.
- **Never-fail demo mode** — with no API key at all, it still does real extraction (amounts, case numbers, deadlines), drafts a response, and speaks — so a live demo never dies on stage.

## 🧗 Challenges we ran into
- **Models can't be trusted with dates.** Gemini once confidently returned "1,145 days left" on a deadline 40 days away. We stopped trusting model arithmetic entirely and recompute every countdown server-side from the raw date string.
- **Structured output across providers.** Claude and Gemini express schemas differently (tool input schema vs. an OpenAPI subset with `nullable`), so we built two schema definitions feeding one shared type.
- **Designing for trust, not "AI vibes."** Our first UI looked like generic AI SaaS. We rebuilt it light and editorial — white, a single emerald accent, a serif headline — to feel like something you'd trust with a legal document.
- **It has to work with zero setup.** Judges and users shouldn't need an API key to see value, so we engineered a genuinely useful keyless demo mode as a first-class path, not an afterthought.

## 🏆 Accomplishments that we're proud of
- A real, deployed product that takes a genuinely painful artifact and returns a filed-ready appeal in seconds.
- A reasoning core that gracefully degrades across three tiers and **never returns nothing**.
- It's both an app *and* an MCP tool — usable by humans and by other agents.
- Accessibility is built in, not bolted on: voice output and plain-language everything.

## 📚 What we learned
- For high-stakes assistants, **deterministic guardrails around the model** (date math, schema validation, fallbacks) matter as much as the model itself.
- A great demo is one that **cannot fail** — designing the keyless path forced a more robust architecture.
- In a trust-sensitive domain, **UI restraint is a feature**.

## 🚀 What's next for Caseworker
- **File on your behalf** — fax/portal submission and certified-mail integration, plus deadline reminders.
- **Document upload + OCR** so people can snap a photo of a letter instead of typing it.
- **More domains** — unemployment, housing/eviction notices, immigration forms, debt collection.
- **A phone line** — call a number, read your letter aloud, get your appeal mailed.
- **Outcome tracking** to learn which arguments actually get decisions reversed.

## 🔗 Try it out
- Live demo: https://caseworker-eta.vercel.app
- Source: https://github.com/ssamalsamir/caseworker

## 🧰 Built With
next.js, react, typescript, google-gemini, anthropic-claude, model-context-protocol, elevenlabs, vercel, node.js

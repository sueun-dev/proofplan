/* =========================================================================
   ProofPlan — glass-box decision engine
   Transparent weighted scoring · Bezos door-test · Klein premortem ·
   Gollwitzer if-then plans. Vanilla JS, no dependencies, local-only.
   ========================================================================= */

"use strict";

const storageKey = "proofplan-decisions-v2";

/* rank colors (1st = indigo, then coral, green, violet, gold) */
const palette = ["#2f2ad8", "#ed4f1c", "#137a4f", "#7b51c9", "#b8721a"];

/* transparent matrix weights — surfaced in the UI so judges can audit them */
const WEIGHTS = { impact: 0.3, confidence: 0.2, feasibility: 0.2, reversible: 0.15, evidence: 0.15 };
const ENERGY_HEADROOM = { low: 0.4, medium: 0.7, high: 1.0 };

/* ---------------------------------------------------------------- scenarios */
const scenarioBank = {
  student: {
    goal: "What should I actually start tonight before the week gets away from me?",
    context:
      "I have 150 minutes after class, patchy focus, and three things that all feel urgent. I need one path that protects my grades without burning me out.",
    deadline: "2026-06-06",
    energy: "medium",
    stakes: "high",
    budget: "150",
    options: [
      { name: "Review the weakest science unit", evidence: "The science test is closest, the weak unit is all over the study guide, and one focused block removes the biggest grade risk.", effort: 3, impact: 5, confidence: 5, reversible: 4 },
      { name: "Polish the group project slides", evidence: "Visible to teammates tomorrow, but the slides already have the required content.", effort: 2, impact: 4, confidence: 4, reversible: 5 },
      { name: "Draft the scholarship essay opening", evidence: "Matters long term, but the deadline is weeks out and I have no outline yet.", effort: 4, impact: 4, confidence: 3, reversible: 4 },
    ],
    obstacles: [
      { blocker: "I keep checking my phone when the work gets hard", fallback: "Put the phone in another room and start a 25-minute timer before reopening notes" },
      { blocker: "I get stuck making perfect notes", fallback: "Write a messy recall sheet first, then clean only the two weakest sections" },
    ],
  },
  team: {
    goal: "What's the safest plan for the team presentation due tomorrow?",
    context:
      "The team has uneven progress, the presentation is tomorrow morning, and I want to reduce the chance of an embarrassing gap without taking over everyone's work.",
    deadline: "2026-06-04",
    energy: "medium",
    stakes: "high",
    budget: "90",
    options: [
      { name: "Build one shared final checklist", evidence: "Nobody is sure who owns what; a single checklist exposes missing slides, speaker order, and demo blockers fast.", effort: 2, impact: 5, confidence: 5, reversible: 5 },
      { name: "Rewrite the whole deck alone", evidence: "Could look polished, but it hides team gaps and is too much work before tomorrow.", effort: 5, impact: 4, confidence: 2, reversible: 2 },
      { name: "Only rehearse my own section", evidence: "Protects my part, but the team's real risk is transitions and missing ownership.", effort: 1, impact: 2, confidence: 4, reversible: 4 },
    ],
    obstacles: [
      { blocker: "A teammate goes quiet and doesn't answer", fallback: "Mark their slide 'unknown', assign a backup speaker, and keep the checklist moving" },
      { blocker: "The live demo breaks during rehearsal", fallback: "Switch to a screenshot walkthrough and keep the live demo as a bonus only" },
    ],
  },
  major: {
    goal: "Should I switch my major from Biology to CS this semester?",
    context:
      "I'm losing motivation in bio, but switching resets some requirements and the add/drop deadline is close. This is hard to walk back, so I want to be honest about the evidence.",
    deadline: "2026-06-09",
    energy: "medium",
    stakes: "high",
    budget: "90",
    options: [
      { name: "Switch to CS now", evidence: "I aced two CS electives this year and was far more engaged than in any bio lab — the pull has been consistent for months, not a one-week mood.", effort: 3, impact: 5, confidence: 5, reversible: 1 },
      { name: "Double-minor in CS instead", evidence: "Keeps the bio degree on track while testing CS further; my advisor confirmed it's feasible in three semesters.", effort: 3, impact: 4, confidence: 4, reversible: 4 },
      { name: "Stay in bio, audit one CS class", evidence: "Lowest disruption, but it dodges the motivation problem and just delays the real decision.", effort: 1, impact: 2, confidence: 3, reversible: 5 },
    ],
    obstacles: [
      { blocker: "I switch on a bad bio week and regret it later", fallback: "Sleep on it 48 hours and confirm with one CS upperclassman before submitting the form" },
      { blocker: "The CS sequence is full this term", fallback: "Take the minor path now and re-evaluate switching at next registration" },
    ],
  },
  habit: {
    goal: "Which single habit reset should I commit to for the next three school days?",
    context:
      "I keep trying to fix sleep, homework, and exercise all at once and nothing sticks. I want one change small enough to survive a busy week.",
    deadline: "2026-06-05",
    energy: "low",
    stakes: "medium",
    budget: "45",
    options: [
      { name: "Set a 10:30 PM shutdown alarm", evidence: "Late nights make everything else harder; one alarm is a clear stop signal without redesigning my whole evening.", effort: 2, impact: 5, confidence: 4, reversible: 5 },
      { name: "Start a full morning workout plan", evidence: "Would help energy, but needs an earlier wake-up during a packed week.", effort: 5, impact: 4, confidence: 2, reversible: 4 },
      { name: "Build a color-coded homework dashboard", evidence: "Feels productive, but the real bottleneck is starting earlier, not a prettier list.", effort: 3, impact: 3, confidence: 3, reversible: 5 },
    ],
    obstacles: [
      { blocker: "I ignore the alarm mid-scroll", fallback: "Move the charger across the room before the alarm goes off" },
      { blocker: "Homework runs past 10:30", fallback: "Stop anyway and write tomorrow's first task on a sticky note" },
    ],
  },
};

const demoDecision = scenarioBank.student;

const emptyOption = () => ({ name: "", evidence: "", effort: 3, impact: 3, confidence: 3, reversible: 3 });
const emptyObstacle = () => ({ blocker: "", fallback: "" });

/* ---------------------------------------------------------------- helpers */
const $ = (sel) => document.querySelector(sel);

function todayIso() { return new Date().toISOString().slice(0, 10); }
function clampNumber(v, min, max) { return Math.max(min, Math.min(max, Number(v) || min)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date(todayIso());
  const deadline = new Date(dateValue);
  if (Number.isNaN(deadline.getTime())) return null;
  return Math.ceil((deadline - today) / 86400000);
}

function escapeText(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function evidenceStrength(text) {
  const len = String(text || "").trim().length;
  if (len >= 55) return 1;
  if (len >= 25) return 0.7;
  if (len > 0) return 0.4;
  return 0;
}

const els = {};
function cacheEls() {
  [
    "decisionForm", "goalInput", "contextInput", "deadlineInput", "energyInput", "stakesInput", "budgetInput",
    "optionsList", "obstacleList", "addOption", "addObstacle", "loadDemo", "resetBoard",
    "saveDecision", "copySummary", "downloadReceipt", "clearSaved",
    "receiptCard", "receiptConfidence", "receiptStamp", "receiptStampText",
    "receiptChoice", "receiptDoor", "receiptWhy", "receiptFirstMove", "receiptFallback", "receiptWatchout",
    "clarityMetric", "clarityBar", "proofMetric", "proofBar", "riskMetric", "riskBar",
    "receiptExportPanel", "receiptDownloadLink", "receiptPreview",
    "scoreCanvas", "rankedOptions", "checkList", "todayPlan", "fallbackPlan",
    "savedDecisions", "summaryOutput", "toast",
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

let current = structuredClone(demoDecision);

/* ---------------------------------------------------------------- templates */
function selectField(label, className, value) {
  const options = [1, 2, 3, 4, 5]
    .map((s) => `<option value="${s}" ${Number(value) === s ? "selected" : ""}>${s}</option>`).join("");
  return `<label class="tiny-field"><span>${label}</span><select class="${className}">${options}</select></label>`;
}

function optionRow(option, index) {
  const ev = evidenceStrength(option.evidence);
  const tag = ev >= 0.7 ? `<span class="evidence-tag ok">PROOF ✓</span>` : option.evidence ? `<span class="evidence-tag weak">THIN</span>` : `<span class="evidence-tag weak">NO PROOF</span>`;
  return `
    <div class="option-row" data-option-index="${index}">
      <div class="option-top">
        <input class="option-name" type="text" value="${escapeText(option.name)}" placeholder="A path you could take" aria-label="Path name" />
        <button class="icon-btn remove-option" type="button" aria-label="Remove path"><svg class="ico" aria-hidden="true"><use href="#i-x" /></svg></button>
      </div>
      <div class="option-evidence-wrap">
        <input class="option-evidence" type="text" value="${escapeText(option.evidence)}" placeholder="The evidence that makes it believable…" aria-label="Evidence" />
        ${tag}
      </div>
      <div class="score-grid">
        ${selectField("Impact", "option-impact", option.impact)}
        ${selectField("Confid.", "option-confidence", option.confidence)}
        ${selectField("Effort", "option-effort", option.effort)}
        ${selectField("Revers.", "option-reversible", option.reversible)}
      </div>
    </div>`;
}

function obstacleRow(obstacle, index) {
  return `
    <div class="obstacle-row" data-obstacle-index="${index}">
      <label class="tiny-field"><span><b>If</b> · likely blocker</span>
        <input class="obstacle-blocker" type="text" value="${escapeText(obstacle.blocker)}" placeholder="What will probably go wrong" /></label>
      <label class="tiny-field"><span><b>Then</b> · pre-decided fix</span>
        <input class="obstacle-fallback" type="text" value="${escapeText(obstacle.fallback)}" placeholder="What you'll do instead" /></label>
      <button class="icon-btn remove-obstacle" type="button" aria-label="Remove blocker"><svg class="ico" aria-hidden="true"><use href="#i-x" /></svg></button>
    </div>`;
}

function renderInputs(decision) {
  els.goalInput.value = decision.goal || "";
  els.contextInput.value = decision.context || "";
  els.deadlineInput.value = decision.deadline || "";
  els.energyInput.value = decision.energy || "medium";
  els.stakesInput.value = decision.stakes || "medium";
  els.budgetInput.value = String(decision.budget || "90");
  const options = decision.options && decision.options.length ? decision.options : [emptyOption(), emptyOption()];
  const obstacles = decision.obstacles && decision.obstacles.length ? decision.obstacles : [emptyObstacle()];
  els.optionsList.innerHTML = options.map(optionRow).join("");
  els.obstacleList.innerHTML = obstacles.map(obstacleRow).join("");
}

function collectDecision() {
  const options = [...els.optionsList.querySelectorAll(".option-row")].map((row) => ({
    name: row.querySelector(".option-name").value.trim(),
    evidence: row.querySelector(".option-evidence").value.trim(),
    effort: clampNumber(row.querySelector(".option-effort").value, 1, 5),
    impact: clampNumber(row.querySelector(".option-impact").value, 1, 5),
    confidence: clampNumber(row.querySelector(".option-confidence").value, 1, 5),
    reversible: clampNumber(row.querySelector(".option-reversible").value, 1, 5),
  })).filter((o) => o.name || o.evidence);

  const obstacles = [...els.obstacleList.querySelectorAll(".obstacle-row")].map((row) => ({
    blocker: row.querySelector(".obstacle-blocker").value.trim(),
    fallback: row.querySelector(".obstacle-fallback").value.trim(),
  })).filter((o) => o.blocker || o.fallback);

  return {
    goal: els.goalInput.value.trim(),
    context: els.contextInput.value.trim(),
    deadline: els.deadlineInput.value || "",
    energy: els.energyInput.value,
    stakes: els.stakesInput.value,
    budget: els.budgetInput.value,
    options,
    obstacles,
  };
}

/* ---------------------------------------------------------------- analysis */
function scoreOption(option, decision, deadlineDays) {
  const impactN = option.impact / 5;
  const confidenceN = option.confidence / 5;
  const reversibleN = option.reversible / 5;
  const effortN = option.effort / 5;
  const evidenceN = evidenceStrength(option.evidence);
  const headroom = ENERGY_HEADROOM[decision.energy] ?? 0.7;
  const feasibility = clamp01((1 - effortN) * 0.6 + headroom * 0.4 - Math.max(0, effortN - headroom) * 0.35);

  let score =
    impactN * WEIGHTS.impact +
    confidenceN * WEIGHTS.confidence +
    feasibility * WEIGHTS.feasibility +
    reversibleN * WEIGHTS.reversible +
    evidenceN * WEIGHTS.evidence;

  // deadline urgency: under pressure, reward fast + sure, penalize heavy
  if (deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 4) {
    score += feasibility * 0.05 + confidenceN * 0.03 - effortN * 0.05;
  }
  score = clamp01(score);

  // contribution breakdown (for the "why")
  const parts = [
    { key: "impact", v: impactN * WEIGHTS.impact },
    { key: "confidence", v: confidenceN * WEIGHTS.confidence },
    { key: "feasibility", v: feasibility * WEIGHTS.feasibility },
    { key: "reversibility", v: reversibleN * WEIGHTS.reversible },
    { key: "evidence", v: evidenceN * WEIGHTS.evidence },
  ].sort((a, b) => b.v - a.v);

  return { feasibility, evidenceN, score, fit: Math.round(score * 100), topFactors: parts.slice(0, 2).map((p) => p.key) };
}

function doorTest(topOption, decision) {
  if (!topOption) return { type: "none", label: "—", advice: "", state: "empty" };
  const r = topOption.reversible;
  const highStakes = decision.stakes === "high";
  if (r <= 2 || (r === 3 && highStakes)) {
    return {
      type: "one-way",
      label: "One-way door · hard to undo",
      advice: "This is expensive to reverse. Slow down: strengthen the evidence and finish the premortem before you commit.",
      state: "caution",
    };
  }
  if (r >= 4) {
    return {
      type: "two-way",
      label: "Two-way door · reversible",
      advice: "You can undo this. Decide fast at ~70% certainty, start the smallest slice, and iterate as you learn.",
      state: "go",
    };
  }
  return {
    type: "mostly",
    label: "Mostly reversible",
    advice: "Low downside to starting. Commit to a small first slice and keep an exit open.",
    state: "go",
  };
}

function analyze(decision) {
  const deadlineDays = daysUntil(decision.deadline);

  const ranked = decision.options
    .map((option, index) => ({ ...option, index, ...scoreOption(option, decision, deadlineDays), note: option.evidence || "No evidence entered yet." }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0] || null;
  const door = doorTest(top, decision);

  const strongEvidence = decision.options.filter((o) => evidenceStrength(o.evidence) >= 0.7).length;
  const completeOptions = decision.options.filter((o) => o.name && o.evidence).length;
  const completeObstacles = decision.obstacles.filter((o) => o.blocker && o.fallback).length;

  const clarity = Math.round(clamp01(
    (decision.goal ? 0.22 : 0) + (decision.context ? 0.14 : 0) + (decision.deadline ? 0.1 : 0) +
    Math.min(0.34, completeOptions * 0.1) + Math.min(0.2, completeObstacles * 0.1)
  ) * 100);

  const proof = Math.round(clamp01(strongEvidence * 0.22 + completeObstacles * 0.14 + Math.min(4, decision.options.length) * 0.06) * 100);

  let risk = 16;
  if (deadlineDays !== null && deadlineDays < 0) risk += 30;
  else if (deadlineDays !== null && deadlineDays <= 2) risk += 16;
  if (decision.stakes === "high") risk += 12;
  if (decision.energy === "low") risk += 12;
  if (!strongEvidence) risk += 16;
  if (top && top.effort >= 5 && decision.energy !== "high") risk += 12;
  if (door.type === "one-way") risk += 10;
  risk = Math.min(100, risk);

  const checks = buildChecks(decision, ranked, deadlineDays, strongEvidence, completeObstacles, door);
  const plan = buildTodayPlan(decision, top, deadlineDays, door);
  const receipt = buildReceipt(decision, ranked, checks, plan, door);
  const summary = buildSummary(decision, ranked, checks, plan, door, { clarity, proof, risk });

  return { ranked, top, door, clarity, proof, risk, checks, plan, receipt, summary, deadlineDays, strongEvidence, completeObstacles };
}

function buildChecks(decision, ranked, deadlineDays, strongEvidence, completeObstacles, door) {
  const checks = [];
  const top = ranked[0];
  if (!decision.goal) checks.push({ level: "blocker", title: "Decision is unnamed", body: "Write one line a judge or future-you could understand in five seconds." });
  if (decision.options.length < 2) checks.push({ level: "warning", title: "Only one option", body: "Add at least one real alternative so the pick looks earned, not guessed." });
  if (!strongEvidence) checks.push({ level: "blocker", title: "Evidence is thin", body: "Give the leading path one concrete reason, source, or observation — not a vibe." });
  if (door.type === "one-way") {
    checks.push(strongEvidence < 1
      ? { level: "blocker", title: "One-way door, thin proof", body: "This is hard to reverse and the evidence is thin. Don't commit until the proof is solid." }
      : { level: "warning", title: "One-way door — confirm first", body: "Hard to reverse. Sleep on it, pressure-test the evidence, and finish the premortem before you lock it in." });
  }
  if (deadlineDays !== null && deadlineDays <= 2 && deadlineDays >= 0) checks.push({ level: "warning", title: "Deadline pressure is high", body: "Prefer a small, finishable slice over a broad, ambitious plan." });
  if (top && top.effort >= 5 && decision.energy !== "high") checks.push({ level: "warning", title: "Scope is heavier than energy", body: "Split the top path into a 90-minute artifact plus a later extension." });
  if (!completeObstacles) checks.push({ level: "warning", title: "Premortem is empty", body: "Name one likely blocker and the if-then fix before you start." });
  if (!checks.length) checks.push({ level: "ready", title: "Ready to execute", body: "Clear pick, real evidence, a time boundary, and a fallback. Go." });
  return checks;
}

function buildTodayPlan(decision, top, deadlineDays, door) {
  if (!top) return [];
  const budget = Number(decision.budget || 90);
  const blocks = Math.max(3, Math.min(5, Math.floor(budget / 45) + 2));
  const first = door.type === "one-way"
    ? `Stress-test "${top.name}" against your premortem for 15 minutes before committing.`
    : `Start the smallest useful slice of "${top.name}" in one 25-minute block — you can adjust later.`;
  const plan = [
    first,
    `Write one proof note: why this beats the runner-up and what evidence backs it.`,
    `Set the next checkpoint — done / not done — and the if-then move if the first blocker shows up.`,
    `Cut one task that doesn't move the decision, the deadline, or your energy.`,
    `Save the decision and copy the summary into your notes.`,
  ];
  return plan.slice(0, blocks);
}

function buildReceipt(decision, ranked, checks, plan, door) {
  const top = ranked[0];
  const firstFallback = decision.obstacles.find((o) => o.blocker && o.fallback);
  const warn = checks.find((c) => c.level === "blocker") || checks.find((c) => c.level === "warning");
  const why = top
    ? (top.note && top.note !== "No evidence entered yet."
        ? top.note
        : `Best mix of ${top.topFactors.join(" and ")} among your paths.`)
    : "Add evidence so the recommendation is inspectable.";
  return {
    choice: top ? top.name || "Unnamed path" : "No path selected yet",
    fit: top ? top.fit : null,
    why,
    door: door.label,
    doorAdvice: door.advice,
    doorState: door.state,
    firstMove: plan[0] || "Add a path to generate a first move.",
    fallback: firstFallback ? `If ${firstFallback.blocker}, then ${firstFallback.fallback}.` : "No fallback yet — run the premortem.",
    watchout: warn ? `${warn.title}: ${warn.body}` : "No major risk flagged. Clear to start.",
  };
}

function buildSummary(decision, ranked, checks, plan, door, metrics) {
  const top = ranked[0];
  const lines = [
    `PROOFPLAN · DECISION RECEIPT`,
    `Decision: ${decision.goal || "Untitled decision"}`,
    ``,
    `→ Start with: ${top ? top.name : "No option selected"} ${top ? `(${top.fit}% fit)` : ""}`,
    `Door type: ${door.label}`,
    `Why it wins: ${top ? top.note : "Add evidence first."}`,
    `Deadline: ${decision.deadline || "not set"} · ${decision.energy} energy · ${decision.stakes} stakes`,
    `Clarity ${metrics.clarity} / Proof ${metrics.proof} / Risk ${metrics.risk}`,
    ``,
    `Do today:`,
    ...plan.map((s, i) => `  ${i + 1}. ${s}`),
    ``,
    `If-then fallbacks:`,
    ...(decision.obstacles.filter((o) => o.blocker && o.fallback).map((o) => `  - If ${o.blocker}, then ${o.fallback}.`)),
    ``,
    `Plan checks:`,
    ...checks.map((c) => `  - [${c.level}] ${c.title}: ${c.body}`),
    ``,
    `Generated locally in ProofPlan — no account, no cloud.`,
  ];
  return lines.join("\n");
}

/* ---------------------------------------------------------------- render */
function setText(el, text) { if (el) el.textContent = text; }

/* single source of truth for the approval stamp shown in the live receipt
   and burned into the exported PNG */
const STAMP_TEXT = { empty: "AWAITING PATHS", go: "RECOMMENDED", caution: "VERIFY FIRST" };
const STAMP_COLOR = { empty: "#a59c8b", go: "#137a4f", caution: "#b8721a" };
function stampState(analysis) {
  return analysis.top ? analysis.receipt.doorState : "empty";
}

function renderOutputs(analysis) {
  const r = analysis.receipt;

  // live evidence tags inside option rows (without re-rendering inputs → keeps focus)
  [...els.optionsList.querySelectorAll(".option-row")].forEach((row) => {
    const val = row.querySelector(".option-evidence").value;
    const tag = row.querySelector(".evidence-tag");
    if (!tag) return;
    const s = evidenceStrength(val);
    tag.className = "evidence-tag " + (s >= 0.7 ? "ok" : "weak");
    tag.textContent = s >= 0.7 ? "PROOF ✓" : val ? "THIN" : "NO PROOF";
  });

  // receipt
  setText(els.receiptConfidence, r.fit != null ? r.fit : "—");
  setText(els.receiptChoice, r.choice);
  setText(els.receiptWhy, r.why);
  setText(els.receiptFirstMove, r.firstMove);
  setText(els.receiptFallback, r.fallback);
  setText(els.receiptWatchout, r.watchout);
  els.receiptDoor.innerHTML = analysis.top
    ? `${escapeText(r.door)}<span class="door-advice">${escapeText(r.doorAdvice)}</span>`
    : "—";
  els.receiptDoor.className = "receipt-door " + (r.doorState === "go" ? "go" : r.doorState === "caution" ? "caution" : "");

  const state = stampState(analysis);
  els.receiptStamp.dataset.state = state;
  setText(els.receiptStampText, STAMP_TEXT[state] || STAMP_TEXT.empty);

  // meters
  setText(els.clarityMetric, analysis.clarity);
  setText(els.proofMetric, analysis.proof);
  setText(els.riskMetric, analysis.risk);
  els.clarityBar.style.width = analysis.clarity + "%";
  els.proofBar.style.width = analysis.proof + "%";
  els.riskBar.style.width = analysis.risk + "%";

  // ranked list
  els.rankedOptions.innerHTML = analysis.ranked.length
    ? analysis.ranked.map((o, i) => {
        const color = palette[i % palette.length];
        return `
          <article class="ranked-item">
            <span class="rank-badge" style="background:${color}">${i + 1}</span>
            <div class="ranked-main">
              <strong>${escapeText(o.name || "Unnamed path")}</strong>
              <div class="ranked-bar"><i style="width:${o.fit}%;background:${color}"></i></div>
              <div class="ranked-tags">
                ${o.topFactors.map((f, idx) => `<span class="mini-tag ${i === 0 && idx === 0 ? "win" : ""}">${f}</span>`).join("")}
                ${evidenceStrength(o.evidence) >= 0.7 && !o.topFactors.includes("evidence") ? `<span class="mini-tag">evidence ✓</span>` : ""}
              </div>
            </div>
            <span class="ranked-score" style="color:${color}">${o.fit}</span>
          </article>`;
      }).join("")
    : `<div class="empty-state">Add two paths and a line of evidence — ProofPlan ranks them here, live.</div>`;

  // checks
  els.checkList.innerHTML = analysis.checks.map((c) => `
    <article class="check-item ${c.level}">
      <strong>${escapeText(c.title)}</strong>
      <p>${escapeText(c.body)}</p>
    </article>`).join("");

  // today plan
  els.todayPlan.innerHTML = analysis.plan.length
    ? analysis.plan.map((s) => `<li>${escapeText(s)}</li>`).join("")
    : `<li class="empty-state" style="display:block">Add a path to generate today's first move.</li>`;

  // fallbacks
  const fbs = current.obstacles.filter((o) => o.blocker || o.fallback);
  els.fallbackPlan.innerHTML = fbs.length
    ? fbs.map((o) => `<article class="fallback-item"><strong>${escapeText(o.blocker || "a blocker appears")}</strong><p>${escapeText(o.fallback || "take a smaller next step.")}</p></article>`).join("")
    : `<div class="empty-state">Name one likely blocker and the smaller action you'll take if it happens.</div>`;

  els.summaryOutput.value = analysis.summary;
  drawMatrix(analysis);
}

/* ---------------------------------------------------------------- canvas matrix */
function drawMatrix(analysis) {
  const canvas = els.scoreCanvas;
  const ctx = canvas.getContext("2d");
  const cssW = canvas.clientWidth || 680;
  const cssH = Math.round(cssW * (440 / 720));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = cssH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 46, r: 22, t: 24, b: 38 };
  const x0 = pad.l, y0 = pad.t, x1 = cssW - pad.r, y1 = cssH - pad.b;
  const w = x1 - x0, h = y1 - y0, midX = x0 + w / 2, midY = y0 + h / 2;

  // plot area
  ctx.fillStyle = "#fbf9f3";
  ctx.fillRect(x0, y0, w, h);

  // quadrant tints (top-left = sweet spot)
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#137a4f"; ctx.fillRect(x0, y0, w / 2, h / 2);
  ctx.fillStyle = "#2f2ad8"; ctx.fillRect(midX, y0, w / 2, h / 2);
  ctx.fillStyle = "#ed4f1c"; ctx.fillRect(midX, midY, w / 2, h / 2);
  ctx.globalAlpha = 1;

  // grid
  ctx.strokeStyle = "rgba(23,21,15,0.08)"; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const gx = x0 + (w * i) / 5; ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.stroke();
    const gy = y0 + (h * i) / 5; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
  }
  // center cross
  ctx.strokeStyle = "rgba(23,21,15,0.22)"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(midX, y0); ctx.lineTo(midX, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, midY); ctx.lineTo(x1, midY); ctx.stroke();
  ctx.setLineDash([]);
  // frame
  ctx.strokeStyle = "rgba(23,21,15,0.5)"; ctx.lineWidth = 1.4; ctx.strokeRect(x0, y0, w, h);

  // quadrant labels
  ctx.font = "600 11px " + "ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(19,122,79,0.85)"; ctx.textAlign = "left"; ctx.fillText("DO FIRST", x0 + 8, y0 + 7);
  ctx.fillStyle = "rgba(47,42,216,0.8)"; ctx.textAlign = "right"; ctx.fillText("BIG BET", x1 - 8, y0 + 7);
  ctx.fillStyle = "rgba(122,114,100,0.85)"; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText("EASY EXTRA", x0 + 8, y1 - 7);
  ctx.fillStyle = "rgba(237,79,28,0.8)"; ctx.textAlign = "right"; ctx.fillText("AVOID", x1 - 8, y1 - 7);

  // axis labels
  ctx.fillStyle = "#7a7264"; ctx.font = "600 11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("LOW EFFORT  →  HIGH EFFORT", midX, y1 + 12);
  ctx.save(); ctx.translate(x0 - 32, midY); ctx.rotate(-Math.PI / 2);
  ctx.fillText("LOW PAYOFF  →  HIGH PAYOFF", 0, 0); ctx.restore();

  if (!analysis.ranked.length) {
    ctx.fillStyle = "#a59c8b"; ctx.font = "500 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Add paths to map the choice", midX, midY);
    return;
  }

  // plot bubbles: x = effort (1..5), y = payoff = (impact+confidence)/2 (1..5)
  const px = (effort) => x0 + ((effort - 1) / 4) * w;
  const py = (payoff) => y1 - ((payoff - 1) / 4) * h;

  analysis.ranked.forEach((o, i) => {
    const payoff = (o.impact + o.confidence) / 2;
    const cx = px(o.effort), cy = py(payoff);
    const radius = 11 + (o.fit / 100) * 15;
    const color = palette[i % palette.length];

    ctx.globalAlpha = 0.16; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#fff"; ctx.font = "700 14px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), cx, cy);
  });
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

/* ---------------------------------------------------------------- export PNG */
function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  words.forEach((word) => {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

function buildReceiptCanvas(analysis) {
  const r = analysis.receipt;
  const W = 1080, P = 70;
  const mono = "ui-monospace, Menlo, monospace";
  const serif = "Georgia, 'Times New Roman', serif";
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");

  // pre-measure dynamic blocks
  const blocks = [
    { label: "START WITH", body: r.choice, font: `600 40px ${serif}`, lh: 46, color: "#17150f" },
    { label: "DOOR TYPE", body: r.doorAdvice ? `${r.door} — ${r.doorAdvice}` : r.door, font: `500 25px ${mono}`, lh: 34, color: r.doorState === "caution" ? "#b8721a" : "#137a4f" },
    { label: "WHY IT WINS", body: r.why, font: `400 26px ${mono}`, lh: 36, color: "#423d33" },
    { label: "FIRST MOVE · TODAY", body: r.firstMove, font: `400 26px ${mono}`, lh: 36, color: "#17150f" },
    { label: "IF-THEN FALLBACK", body: r.fallback, font: `400 26px ${mono}`, lh: 36, color: "#423d33" },
    { label: "WATCH-OUT", body: r.watchout, font: `400 25px ${mono}`, lh: 35, color: "#423d33" },
  ];
  let bodyH = 0;
  blocks.forEach((b) => { measure.font = b.font; b.lines = wrapText(measure, b.body, W - P * 2); bodyH += 30 + b.lines.length * b.lh + 18; });

  const H = 300 + bodyH + 230;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // paper
  ctx.fillStyle = "#fffefb"; ctx.fillRect(0, 0, W, H);
  // dashed side borders
  ctx.strokeStyle = "rgba(23,21,15,0.18)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(28, H); ctx.moveTo(W - 28, 0); ctx.lineTo(W - 28, H); ctx.stroke();
  ctx.setLineDash([]);

  // header
  ctx.fillStyle = "#17150f"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = `600 64px ${serif}`; ctx.fillText("ProofPlan", P, 110);
  ctx.fillStyle = "#7a7264"; ctx.font = `500 22px ${mono}`; ctx.fillText("D E C I S I O N   R E C E I P T", P, 146);
  // fit badge
  if (r.fit != null) {
    ctx.textAlign = "right"; ctx.fillStyle = "#2f2ad8"; ctx.font = `600 72px ${serif}`; ctx.fillText(String(r.fit), W - P, 120);
    ctx.fillStyle = "#7a7264"; ctx.font = `500 20px ${mono}`; ctx.fillText("% FIT", W - P, 150);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#17150f"; ctx.fillRect(P, 168, W - P * 2, 4);

  // stamp
  const state = stampState(analysis);
  const stampText = STAMP_TEXT[state];
  const stampColor = STAMP_COLOR[state];
  ctx.save(); ctx.translate(W - 250, 250); ctx.rotate(-0.06);
  ctx.strokeStyle = stampColor; ctx.lineWidth = 4; ctx.fillStyle = stampColor;
  ctx.font = `700 30px ${mono}`; const sw = ctx.measureText(stampText).width;
  ctx.strokeRect(-sw / 2 - 18, -34, sw + 36, 56);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(stampText, 0, -4);
  ctx.restore();

  // body blocks
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let y = 240;
  blocks.forEach((b) => {
    ctx.fillStyle = "#a59c8b"; ctx.font = `500 17px ${mono}`; ctx.fillText(b.label, P, y);
    y += 30; ctx.fillStyle = b.color; ctx.font = b.font;
    b.lines.forEach((ln) => { ctx.fillText(ln, P, y); y += b.lh; });
    y += 8;
    ctx.strokeStyle = "rgba(23,21,15,0.12)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke(); ctx.setLineDash([]);
    y += 18;
  });

  // meters row
  y += 6;
  const meters = [["CLARITY", analysis.clarity, "#2f2ad8"], ["PROOF", analysis.proof, "#137a4f"], ["RISK", analysis.risk, "#ed4f1c"]];
  const mW = (W - P * 2 - 40) / 3;
  meters.forEach((m, i) => {
    const mx = P + i * (mW + 20);
    ctx.fillStyle = "#a59c8b"; ctx.font = `500 16px ${mono}`; ctx.fillText(m[0], mx, y);
    ctx.fillStyle = "#17150f"; ctx.font = `600 34px ${serif}`; ctx.fillText(String(m[1]), mx, y + 38);
    ctx.fillStyle = "#efe9dd"; ctx.fillRect(mx, y + 52, mW, 7);
    ctx.fillStyle = m[2]; ctx.fillRect(mx, y + 52, (mW * m[1]) / 100, 7);
  });
  y += 96;

  // footer
  ctx.fillStyle = "#17150f"; ctx.fillRect(P, y, W - P * 2, 3); y += 30;
  ctx.fillStyle = "#7a7264"; ctx.font = `500 19px ${mono}`;
  ctx.fillText("Pick the path. Prove it. Start today.", P, y); y += 28;
  ctx.fillStyle = "#a59c8b"; ctx.font = `400 16px ${mono}`;
  ctx.fillText("Generated locally in ProofPlan — no account, no cloud.", P, y);
  // faux barcode
  ctx.fillStyle = "#17150f"; let bx = P;
  for (let i = 0; i < 60 && bx < W - P; i++) { const bw = 2 + (i * 7) % 6; if (i % 2 === 0) ctx.fillRect(bx, H - 60, bw, 34); bx += bw + 3; }

  return canvas;
}

function safeFilename(value) {
  const cleaned = String(value || "decision").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return cleaned || "decision";
}

function exportReceipt() {
  const analysis = updateAll();
  const canvas = buildReceiptCanvas(analysis);
  const dataUrl = canvas.toDataURL("image/png");
  const filename = `proofplan-${safeFilename(analysis.receipt.choice)}.png`;
  els.receiptPreview.src = dataUrl;
  els.receiptDownloadLink.href = dataUrl;
  els.receiptDownloadLink.download = filename;
  els.receiptExportPanel.hidden = false;
  els.receiptExportPanel.scrollIntoView({ block: "center", behavior: "smooth" });
  toast("Receipt PNG ready — download or screenshot it.");
  return { dataUrl, filename };
}

/* ---------------------------------------------------------------- saved */
function loadSaved() { try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; } }
function writeSaved(items) { try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch {} }

function renderSaved() {
  const items = loadSaved();
  els.savedDecisions.innerHTML = items.length
    ? items.map((it, i) => `
        <article class="saved-item">
          <div><strong>${escapeText(it.goal || "Untitled decision")}</strong><p>${escapeText(it.savedAt || "")}</p></div>
          <button class="load-saved" type="button" data-saved-index="${i}">Load</button>
        </article>`).join("")
    : `<div class="empty-state">Saved decisions stay in this browser only.</div>`;
}

/* ---------------------------------------------------------------- toast */
let toastTimer = null;
function toast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg; els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.classList.remove("show"); setTimeout(() => (els.toast.hidden = true), 280); }, 2000);
}

/* ---------------------------------------------------------------- orchestration */
let lastAnalysis = null;
function updateAll() {
  current = collectDecision();
  const analysis = analyze(current);
  lastAnalysis = analysis;
  renderOutputs(analysis);
  return analysis;
}

function setDecision(decision) {
  current = structuredClone(decision);
  renderInputs(current);
  updateAll();
}

function wire() {
  els.decisionForm.addEventListener("input", updateAll);
  els.decisionForm.addEventListener("change", updateAll);

  els.loadDemo.addEventListener("click", () => { setDecision(demoDecision); toast("Loaded a real study-night decision."); });
  els.resetBoard.addEventListener("click", () => {
    setDecision({ goal: "", context: "", deadline: todayIso(), energy: "medium", stakes: "medium", budget: "90", options: [emptyOption(), emptyOption()], obstacles: [emptyObstacle()] });
    toast("Cleared. Fresh decision.");
  });

  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => { const s = scenarioBank[btn.dataset.scenario]; if (s) { setDecision(s); toast(`Loaded: ${btn.textContent}.`); } });
  });

  els.addOption.addEventListener("click", () => { current = collectDecision(); current.options.push(emptyOption()); renderInputs(current); updateAll(); });
  els.addObstacle.addEventListener("click", () => { current = collectDecision(); current.obstacles.push(emptyObstacle()); renderInputs(current); updateAll(); });

  els.optionsList.addEventListener("click", (e) => {
    if (!e.target.closest(".remove-option")) return;
    current = collectDecision();
    const row = e.target.closest(".option-row");
    current.options.splice(Number(row.dataset.optionIndex), 1);
    if (current.options.length < 2) current.options.push(emptyOption());
    renderInputs(current); updateAll();
  });
  els.obstacleList.addEventListener("click", (e) => {
    if (!e.target.closest(".remove-obstacle")) return;
    current = collectDecision();
    const row = e.target.closest(".obstacle-row");
    current.obstacles.splice(Number(row.dataset.obstacleIndex), 1);
    if (!current.obstacles.length) current.obstacles.push(emptyObstacle());
    renderInputs(current); updateAll();
  });

  els.saveDecision.addEventListener("click", () => {
    const analysis = updateAll();
    if (!analysis.top) { toast("Add a path before saving."); return; }
    const items = loadSaved();
    items.unshift({ ...current, summary: analysis.summary, savedAt: new Date().toLocaleString() });
    writeSaved(items.slice(0, 12)); renderSaved(); toast("Decision saved to this browser.");
  });

  els.copySummary.addEventListener("click", async () => {
    const analysis = updateAll();
    try { await navigator.clipboard.writeText(analysis.summary); toast("Summary copied to clipboard."); }
    catch { els.summaryOutput.select(); toast("Press ⌘/Ctrl+C to copy."); }
  });

  els.downloadReceipt.addEventListener("click", exportReceipt);

  els.savedDecisions.addEventListener("click", (e) => {
    const btn = e.target.closest(".load-saved"); if (!btn) return;
    const item = loadSaved()[Number(btn.dataset.savedIndex)];
    if (item) { setDecision(item); toast("Loaded a saved decision."); }
  });
  els.clearSaved.addEventListener("click", () => { writeSaved([]); renderSaved(); toast("Cleared saved decisions."); });

  let resizeTimer = null;
  // a pure resize doesn't change the inputs, so redraw from the cached analysis
  // instead of re-running the full scoring/receipt/summary pipeline
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (lastAnalysis) drawMatrix(lastAnalysis); }, 150);
  });
}

/* expose a tiny API for automated QA / screenshots */
window.ProofPlan = {
  exportReceiptDataUrl() { return exportReceipt().dataUrl; },
  currentAnalysis() { return analyze(collectDecision()); },
  loadScenario(name) { if (scenarioBank[name]) setDecision(scenarioBank[name]); },
};

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  if (!current.deadline) current.deadline = "2026-06-06";
  renderInputs(current);
  wire();
  renderSaved();
  updateAll();
});

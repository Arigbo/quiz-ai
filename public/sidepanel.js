// QuizSolver AI PRO — Side Panel Logic
// Flow: Extract → AI answer → Click answer → Click Next/Submit → repeat

const API_BASE = 'https://quiz-ai-kappa.vercel.app';

// ─── UI refs ──────────────────────────────────────────────────────────────────
const btnFullQuiz    = document.getElementById('btn-full-quiz');
const btnOneQuestion = document.getElementById('btn-one-question');
const btnStop        = document.getElementById('btn-stop');
const quizStatusArea = document.getElementById('quiz-status-area');
const quizStatusBox  = document.getElementById('quiz-status-box');
const logList        = document.getElementById('quiz-log-list');
const progressWrap   = document.getElementById('progress-wrap');
const progressBar    = document.getElementById('progress-bar');

// Project refs
const btnGenerateProject = document.getElementById('btn-generate-project');
const btnReadBrief       = document.getElementById('btn-read-brief');
const projectTopic       = document.getElementById('project-topic');
const projStatusArea     = document.getElementById('project-status-area');
const projStatusBox      = document.getElementById('project-status-box');

let stopRequested = false;
let isRunning     = false;  // global guard — prevents concurrent runs
let lastRequestAt = 0;      // timestamp of last API call (ms)

// Free-tier rate limit: 20 RPM → 1 request per 3 s.
// We use 3.5 s to give a comfortable margin.
const MIN_REQUEST_GAP_MS = 3500;

// ─── Button handlers ──────────────────────────────────────────────────────────
btnFullQuiz.addEventListener('click', () => {
  if (isRunning) return; // ignore if already running
  runQuiz({ autoAdvance: true });
});
btnOneQuestion.addEventListener('click', () => {
  if (isRunning) return;
  runQuiz({ autoAdvance: false });
});
btnStop.addEventListener('click', () => {
  stopRequested = true;
  showStatus('error', '⛔ Stopping after current question…');
});

// ─── Main orchestrator ────────────────────────────────────────────────────────
async function runQuiz({ autoAdvance }) {
  if (isRunning) return;       // safety: block concurrent calls
  isRunning     = true;
  stopRequested = false;
  setRunning(true);
  clearLog();
  showStatus('loading', autoAdvance ? 'Starting auto-complete…' : 'Reading question…');

  let questionNumber = 0;
  let totalQuestions = 0;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get the total question count from the page once
    const countResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // QuizNavigation shows "X of Y answered" — Y is totalQuestions
        // Also the jump buttons grid has one button per question
        const jumpBtns = document.querySelectorAll(
          '[class*="grid"] button[type="button"][class*="rounded-lg"][class*="font-semibold"]'
        );
        return jumpBtns.length || null;
      }
    });
    totalQuestions = countResult[0]?.result || 0;

    while (true) {
      if (stopRequested) break;

      questionNumber++;
      showStatus('loading', `Question ${questionNumber}${totalQuestions ? ' of ' + totalQuestions : ''}…`);
      if (totalQuestions > 0) {
        setProgress(questionNumber, totalQuestions);
      }

      // ── 1. Extract question + options from page ──────────────────────────
      const extractResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractQuestion,
      });

      const extracted = extractResult[0]?.result;

      if (!extracted || !extracted.question) {
        addLog(`Q${questionNumber}: ❌ No question found`, 'error');
        showStatus('error', '❌ No quiz question found on this page.');
        break;
      }

      if (!extracted.options || extracted.options.length === 0) {
        addLog(`Q${questionNumber}: ⚠️ No options (${extracted.debug})`, 'error');
        showStatus('error', `❌ Could not extract answer options.\n\nDebug: ${extracted.debug}`);
        break;
      }

      // ── 2. Rate-limit: enforce minimum gap between requests ─────────────
      // Free tier = 20 RPM → need ≥ 3 s between calls.
      const now  = Date.now();
      const wait = MIN_REQUEST_GAP_MS - (now - lastRequestAt);
      if (wait > 0) {
        showStatus('loading', `⏱ Rate-limiting — waiting ${(wait/1000).toFixed(1)}s before next request…`);
        await sleep(wait);
      }
      if (stopRequested) break;

      // ── 3. Ask AI (with quota-exceeded retry) ────────────────────────────
      lastRequestAt = Date.now();
      const { correctAnswer, correctAnswerIndex } = await callAIWithRetry(
        extracted.question,
        extracted.options,
        questionNumber
      );

      if (correctAnswerIndex < 0 || correctAnswerIndex >= extracted.options.length) {
        addLog(`Q${questionNumber}: ⚠️ Bad AI index ${correctAnswerIndex}`, 'error');
        throw new Error(`AI returned invalid index ${correctAnswerIndex}. Answer: "${correctAnswer}"`);
      }

      const optLetter = String.fromCharCode(65 + correctAnswerIndex);
      addLog(`Q${questionNumber}: ${optLetter}. ${correctAnswer.slice(0, 45)}${correctAnswer.length > 45 ? '…' : ''}`, 'done');

      // ── 3. Click answer on page ──────────────────────────────────────────
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickAnswer,
        args: [correctAnswerIndex, correctAnswer, optLetter],
      });

      // Wait for React to register the selection
      await sleep(600);

      if (!autoAdvance) {
        showStatus('success', `
          <div class="answer-label">✅ Answered:</div>
          <div class="answer-text"><span class="answer-index">${optLetter}</span>${correctAnswer}</div>
        `);
        break;
      }

      if (stopRequested) break;

      // ── 4. Click Next or Submit ──────────────────────────────────────────
      const navResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickNextOrSubmit,
      });

      const navAction = navResult[0]?.result;

      if (navAction === 'submitted') {
        setProgress(totalQuestions || questionNumber, totalQuestions || questionNumber);
        showStatus('success', `🎉 Quiz submitted! Answered ${questionNumber} question${questionNumber !== 1 ? 's' : ''}.`);
        addLog('✅ Submitted!', 'done');
        break;
      }

      if (navAction === 'not_found') {
        showStatus('error', '⚠️ Could not find Next/Submit button.');
        break;
      }

      // navAction === 'next' — wait for React to render the next question
      await waitForQuestionChange(tab.id, extracted.question);
    }

  } catch (err) {
    showStatus('error', `❌ ${err.message}`);
    addLog(`Error: ${err.message}`, 'error');
  } finally {
    isRunning = false;
    setRunning(false);
  }
}

// ─── Wait for the question text to change (next question loaded) ───────────────
async function waitForQuestionChange(tabId, previousQuestion) {
  const maxWait = 6000; // 6 seconds max
  const interval = 250;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await sleep(interval);
    elapsed += interval;

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (prev) => {
        const paras = Array.from(
          document.querySelectorAll('p[class*="font-medium"][class*="leading-snug"]')
        ).filter(p => (p.textContent?.trim().length ?? 0) > 10);
        const current = paras[0]?.textContent?.trim() ?? '';
        return current !== prev && current.length > 5;
      },
      args: [previousQuestion],
    });

    if (result[0]?.result === true) return; // question changed — ready
  }
  // Timed out — continue anyway
}

// ─── Injected: extract current question + options ─────────────────────────────
function extractQuestion() {
  const debug = [];

  // Find question paragraph (font-medium + leading-snug, not uppercase label)
  let questionEl = null;

  const strictMatches = Array.from(
    document.querySelectorAll('p[class*="font-medium"][class*="leading-snug"]')
  ).filter(p => (p.textContent?.trim().length ?? 0) > 10);

  if (strictMatches.length > 0) {
    questionEl = strictMatches[0];
    debug.push(`strict:${strictMatches.length}`);
  } else {
    const loose = Array.from(document.querySelectorAll('p[class*="font-medium"]')).filter(p => {
      const t = p.textContent?.trim() ?? '';
      const cls = p.className ?? '';
      return t.length > 10 && !cls.includes('uppercase') && t !== t.toUpperCase();
    });
    if (loose.length > 0) { questionEl = loose[0]; debug.push(`loose:${loose.length}`); }
  }

  if (!questionEl) return { question: null, options: [], debug: 'no-question-el' };

  const questionText = questionEl.textContent?.trim() ?? '';

  // Walk up to find a container with answer buttons
  let answerContainer = null;
  let node = questionEl;
  for (let d = 0; d < 15; d++) {
    node = node.parentElement;
    if (!node || node === document.body) break;
    const btns = Array.from(node.querySelectorAll('button[type="button"]')).filter(b => {
      const cls = b.className ?? '';
      // Exclude the Next/Submit/Previous/jump buttons which have bg-sb-primary or min-w-32
      return !cls.includes('bg-sb-primary') && !cls.includes('min-w-32') && !cls.includes('min-w-[');
    });
    if (btns.length >= 2) {
      answerContainer = { el: node, btns };
      debug.push(`container@depth=${d},btns=${btns.length}`);
      break;
    }
    // Also try the next sibling of the question header row (space-y-3 answers div)
    if (d === 2 || d === 3) {
      const headerRow = questionEl.closest('[class*="gap-3"]') ?? questionEl.parentElement?.parentElement;
      if (headerRow?.nextElementSibling) {
        const sibBtns = Array.from(headerRow.nextElementSibling.querySelectorAll('button[type="button"]'));
        if (sibBtns.length >= 1) {
          answerContainer = { el: headerRow.nextElementSibling, btns: sibBtns };
          debug.push(`sibling,btns=${sibBtns.length}`);
          break;
        }
      }
    }
  }

  // Last resort: ALL page buttons that are NOT nav/jump buttons
  if (!answerContainer) {
    const NAV = new Set(['next', 'previous', 'prev', 'submit assessment', 'submit', 'back', 'finish', 'save', 'cancel', 'skip', 'continue']);
    const allBtns = Array.from(document.querySelectorAll('button[type="button"]')).filter(btn => {
      const t = (btn.textContent ?? '').trim().toLowerCase();
      const cls = btn.className ?? '';
      return t.length > 1 && !NAV.has(t) && t.length < 300
             && !cls.includes('bg-sb-primary') && !cls.includes('min-w-32')
             && !/^\d+$/.test(t); // exclude jump buttons (numbered)
    });
    answerContainer = { el: document.body, btns: allBtns };
    debug.push(`fallback,btns=${allBtns.length}`);
  }

  const options = [];
  for (const btn of answerContainer.btns) {
    let text = '';

    // Method 1: answer text div (px-3 py-3)
    const answerDiv = btn.querySelector('div[class*="px-3"][class*="py-3"]')
      ?? btn.querySelector('div[class*="text-foreground"]:not([class*="muted"])');
    if (answerDiv) text = answerDiv.textContent?.trim() ?? '';

    // Method 2: True/False font-semibold <p>
    if (!text) {
      const pTag = btn.querySelector('p[class*="font-semibold"]');
      if (pTag) text = pTag.textContent?.trim() ?? '';
    }

    // Method 3: strip option label from innerText ("A:\nAnswer text")
    if (!text) {
      const raw = btn.innerText?.trim() ?? '';
      const stripped = raw.replace(/^[A-Z]:\s*/m, '').trim();
      text = stripped.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
    }

    if (text && text.length > 1) options.push(text);
  }

  debug.push(`opts:${options.length}`);
  return { question: questionText, options, debug: debug.join('|') };
}

// ─── Injected: click the correct answer button ────────────────────────────────
function clickAnswer(correctIndex, correctAnswer, optionLetter) {
  // Inject styles once
  if (!document.getElementById('quiz-ai-styles')) {
    const s = document.createElement('style');
    s.id = 'quiz-ai-styles';
    s.textContent = `
      @keyframes quizAiSlideIn {
        from { opacity:0; transform:translateY(14px) scale(.95); }
        to   { opacity:1; transform:translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(s);
  }

  // Find answer buttons (same logic, excluding nav)
  function findAnswerBtns() {
    const qParas = Array.from(
      document.querySelectorAll('p[class*="font-medium"][class*="leading-snug"]')
    ).filter(p => (p.textContent?.trim().length ?? 0) > 10);

    if (qParas.length > 0) {
      let node = qParas[0];
      for (let d = 0; d < 15; d++) {
        node = node.parentElement;
        if (!node || node === document.body) break;
        const btns = Array.from(node.querySelectorAll('button[type="button"]')).filter(b => {
          const cls = b.className ?? '';
          return !cls.includes('bg-sb-primary') && !cls.includes('min-w-32');
        });
        if (btns.length >= 2) return btns;
      }
      const hr = qParas[0].closest('[class*="gap-3"]') ?? qParas[0].parentElement?.parentElement;
      if (hr?.nextElementSibling) {
        const bs = Array.from(hr.nextElementSibling.querySelectorAll('button[type="button"]'));
        if (bs.length >= 1) return bs;
      }
    }

    const NAV = new Set(['next','previous','prev','submit assessment','submit','back','finish','save','cancel','skip','continue']);
    return Array.from(document.querySelectorAll('button[type="button"]')).filter(b => {
      const t = (b.textContent ?? '').trim().toLowerCase();
      const cls = b.className ?? '';
      return t.length > 1 && !NAV.has(t) && t.length < 300
             && !cls.includes('bg-sb-primary') && !cls.includes('min-w-32')
             && !/^\d+$/.test(t);
    });
  }

  const btns = findAnswerBtns();
  const target = btns[correctIndex] ?? null;

  // Show floating toast
  function showToast(msg, type) {
    const ex = document.getElementById('quiz-ai-toast');
    if (ex) ex.remove();
    const t = document.createElement('div');
    t.id = 'quiz-ai-toast';
    t.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:2147483647;
      max-width:380px;padding:12px 16px;border-radius:10px;
      font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      font-size:12.5px;font-weight:500;line-height:1.5;color:#fff;
      box-shadow:0 6px 24px rgba(0,0,0,.4);
      animation:quizAiSlideIn .28s cubic-bezier(.34,1.56,.64,1);
      cursor:pointer;
      ${type === 'success'
        ? 'background:linear-gradient(135deg,rgba(22,163,74,.97),rgba(5,150,105,.97));border:1px solid rgba(34,197,94,.35);'
        : 'background:linear-gradient(135deg,rgba(217,119,6,.97),rgba(180,83,9,.97));border:1px solid rgba(251,191,36,.35);'}
    `;
    t.textContent = msg;
    t.addEventListener('click', () => t.remove());
    document.body.appendChild(t);
    setTimeout(() => t?.remove(), 5000);
  }

  if (!target) {
    showToast(`⚠️ ${optionLetter}. ${correctAnswer} — click manually`, 'warn');
    return;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    // Re-find fresh in case React re-rendered
    const fresh = findAnswerBtns()[correctIndex] ?? target;
    // React-safe click: dispatch mousedown + mouseup + click with bubbles
    fresh.focus();
    ['mousedown','mouseup','click'].forEach(type => {
      fresh.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
    // Highlight
    fresh.style.outline = '3px solid #6366f1';
    setTimeout(() => { fresh.style.outline = ''; }, 1400);
    showToast(`✅ ${optionLetter}. ${correctAnswer}`, 'success');
  }, 350);
}

// ─── Injected: click Next or Submit Assessment ────────────────────────────────
function clickNextOrSubmit() {
  // QuizNavigation renders:
  //   <Button class="...bg-sb-primary text-white hover:bg-sb-dark min-w-32...">
  //     "Next" (with ChevronRight)  OR  "Submit Assessment"
  //   </Button>

  // Find all buttons that have bg-sb-primary (the Next/Submit button)
  // Exclude numbered jump buttons (they also have bg-sb-primary when current)
  const candidates = Array.from(document.querySelectorAll('button')).filter(btn => {
    const cls = btn.className ?? '';
    const t = (btn.textContent ?? '').trim().toLowerCase();
    return cls.includes('bg-sb-primary') &&
           (cls.includes('min-w-32') || t.includes('next') || t.includes('submit'));
  });

  if (candidates.length === 0) return 'not_found';

  const navBtn = candidates[0];
  const isSubmit = navBtn.textContent?.toLowerCase().includes('submit');

  navBtn.focus();
  ['mousedown','mouseup','click'].forEach(type => {
    navBtn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  });

  return isSubmit ? 'submitted' : 'next';
}

// ─── Helper: sleep ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Helper: call AI with quota-exceeded retry ────────────────────────────────
async function callAIWithRetry(question, options, questionNumber, maxRetries = 8) {
  const FALLBACK_WAIT_SEC = 120; // 2 minutes if no retry hint in error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${API_BASE}/api/auto-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, options }),
    });

    if (res.ok) return res.json();

    const errBody = await res.json().catch(() => ({}));
    const errMsg  = errBody.error ?? '';
    const errLow  = errMsg.toLowerCase();

    const isQuota = res.status === 429 ||
                    errLow.includes('quota') ||
                    errLow.includes('rate limit') ||
                    errLow.includes('resource_exhausted') ||
                    errLow.includes('too many requests');

    if (!isQuota || attempt >= maxRetries) {
      throw new Error(errMsg || `API error ${res.status}`);
    }

    // ── Parse "Please retry in X.XXXs" from the error message ────────────
    // e.g. "Please retry in 19.354892621s"
    const retryMatch = errMsg.match(/retry in\s+([\d.]+)s/i);
    const waitSec    = retryMatch
      ? Math.ceil(parseFloat(retryMatch[1])) + 5   // suggested wait + 5s buffer
      : FALLBACK_WAIT_SEC;

    addLog(`Q${questionNumber}: ⏳ Quota — wait ${waitSec}s (attempt ${attempt}/${maxRetries})`, 'error');

    // ── Live countdown ────────────────────────────────────────────────────
    let remaining = waitSec;
    while (remaining > 0) {
      if (stopRequested) throw new Error('Stopped by user');

      const mins = Math.floor(remaining / 60);
      const secs = String(remaining % 60).padStart(2, '0');
      const pct  = Math.round(((waitSec - remaining) / waitSec) * 100);

      showStatus('loading',
        `⏳ Quota exceeded — retrying in ${mins}:${secs}\n` +
        `Attempt ${attempt + 1} of ${maxRetries} after cooldown.\n\n` +
        `<div style="margin-top:6px;background:rgba(255,255,255,.08);border-radius:4px;height:5px;overflow:hidden">` +
        `<div style="height:100%;width:${pct}%;background:#6366f1;border-radius:4px;transition:width 1s linear"></div></div>`
      );

      await sleep(1000);
      remaining--;
    }

    showStatus('loading', `↩️ Retrying Q${questionNumber}…`);
    await sleep(400);
  }

  throw new Error('Max retries exceeded after quota errors');
}


// ─── Quiz UI helpers ─────────────────────────────────────────────────────────
function showStatus(type, html) {
  quizStatusArea.style.display = 'block';
  quizStatusBox.className = `status-box ${type}`;
  if (type === 'loading') {
    quizStatusBox.innerHTML = `<div class="spinner"></div><span style="white-space:pre-wrap">${html}</span>`;
  } else {
    quizStatusBox.innerHTML = html;
  }
}

function addLog(text, cls) {
  const item = document.createElement('div');
  item.className = `log-item ${cls || ''}`;
  item.textContent = text;
  logList.appendChild(item);
  logList.scrollTop = logList.scrollHeight;
}

function clearLog() {
  logList.innerHTML = '';
}

function setProgress(current, total) {
  if (!total) return;
  progressWrap.style.display = 'block';
  progressBar.style.width = `${Math.min(100, (current / total) * 100)}%`;
}

function setRunning(running) {
  btnFullQuiz.disabled    = running;
  btnOneQuestion.disabled = running;
  btnStop.style.display   = running ? 'flex' : 'none';
  if (!running) {
    progressWrap.style.display = 'none';
    progressBar.style.width    = '0%';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT MODE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Project UI helpers ───────────────────────────────────────────────────────
function showProjStatus(type, html) {
  projStatusArea.style.display = 'block';
  projStatusBox.className = `status-box ${type}`;
  if (type === 'loading') {
    projStatusBox.innerHTML = `<div class="spinner"></div><span style="white-space:pre-wrap">${html}</span>`;
  } else {
    projStatusBox.innerHTML = html;
  }
}
function setProjLoading(loading) {
  btnGenerateProject.disabled = loading;
  btnReadBrief.disabled       = loading;
  btnGenerateProject.innerHTML = loading
    ? '<div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div> Generating…'
    : '<span>✍️</span> Write & Fill Project';
}

// ─── Read brief button ────────────────────────────────────────────────────────
btnReadBrief.addEventListener('click', async () => {
  setProjLoading(true);
  showProjStatus('loading', 'Reading project brief…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProjectBrief,
    });
    const brief = result[0]?.result;
    if (!brief || !brief.title) {
      showProjStatus('error', '❌ No project brief found on this page. Make sure you are on a SkillsBridge project page.');
      return;
    }
    showProjStatus('success',
      `<div class="answer-label">📋 Project Brief Found:</div>` +
      `<div class="answer-text" style="font-size:11px;margin-top:4px">` +
      `<strong>${brief.title}</strong><br>` +
      `<span style="color:#94a3b8;font-weight:400">${brief.description.slice(0, 150)}${brief.description.length > 150 ? '…' : ''}</span>` +
      `</div>`
    );
  } catch(err) {
    showProjStatus('error', `❌ ${err.message}`);
  } finally {
    setProjLoading(false);
  }
});

// ─── Generate & fill project ──────────────────────────────────────────────────
btnGenerateProject.addEventListener('click', async () => {
  if (isRunning) return;
  isRunning = true;
  setProjLoading(true);
  showProjStatus('loading', 'Reading project brief from page…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 1. Extract brief from page
    const extractResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProjectBrief,
    });
    const brief = extractResult[0]?.result;

    if (!brief || !brief.title) {
      showProjStatus('error', '❌ No project brief found. Make sure you are on a SkillsBridge project submission page.');
      return;
    }

    showProjStatus('loading',
      `Found: "${brief.title.slice(0, 50)}${brief.title.length > 50 ? '…' : ''}"

Generating content with AI…`);

    // 2. Rate-limit check
    const now  = Date.now();
    const wait = MIN_REQUEST_GAP_MS - (now - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    // 3. Call AI
    const res = await fetch(`${API_BASE}/api/generate-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectTitle:       brief.title,
        projectDescription: brief.description,
        requirements:       brief.requirements,
        userTopic:          projectTopic.value.trim() || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error ${res.status}`);
    }

    const { content } = await res.json();
    if (!content) throw new Error('AI returned empty content');

    showProjStatus('loading', 'Filling text field on page…');

    // 4. Inject content into the page textarea
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillProjectTextarea,
      args: [content],
    });

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    showProjStatus('success',
      `✅ Done! ${wordCount} words written into the project field.<br>` +
      `<span style="font-size:10px;color:#64748b">Review it, then click Save Draft or Submit Project.</span>`
    );

  } catch(err) {
    showProjStatus('error', `❌ ${err.message}`);
  } finally {
    isRunning = false;
    setProjLoading(false);
  }
});

// ─── Injected: extract project brief from SkillsBridge page ───────────────────
/**
 * ProjectAssessmentSubmission.tsx DOM:
 *
 * Card 1 (Project Brief):
 *   <section>
 *     <h3>Project Title</h3>    <p>{brief.title}</p>
 *   </section>
 *   <section>
 *     <h3>Project Description</h3>  <p>{brief.description}</p>
 *   </section>
 *   <section>
 *     <h3>Submission Requirements</h3>
 *     <div class="...rounded-xl border...">  ← each requirement
 *       <p class="...uppercase...">LABEL</p>
 *       <div class="prose...">{content}</div>
 *     </div>
 *   </section>
 *
 * Card 2 (Project Details):
 *   <textarea placeholder="Write your project response here...">
 */
function extractProjectBrief() {
  let title = '';
  let description = '';
  let requirements = '';

  // Find all <section> elements containing h3 headings
  const sections = document.querySelectorAll('section');

  sections.forEach(section => {
    const h3 = section.querySelector('h3');
    if (!h3) return;
    const heading = h3.textContent?.trim().toLowerCase() ?? '';

    if (heading.includes('project title')) {
      const p = section.querySelector('p');
      title = p?.textContent?.trim() ?? '';
    } else if (heading.includes('description')) {
      const p = section.querySelector('p');
      description = p?.textContent?.trim() ?? '';
    } else if (heading.includes('requirement')) {
      // Collect all requirement blocks
      const blocks = section.querySelectorAll('[class*="rounded-xl"][class*="border"]');
      const parts = [];
      blocks.forEach(block => {
        const label = block.querySelector('p[class*="uppercase"]')?.textContent?.trim();
        const body  = block.querySelector('[class*="prose"], p:not([class*="uppercase"])')?.textContent?.trim();
        if (body) parts.push(label ? `${label}: ${body}` : body);
      });
      requirements = parts.join('\n');
    }
  });

  // Fallback: if no sections found, scrape the whole page text
  if (!title) {
    const mainText = document.querySelector('main')?.innerText ?? document.body.innerText;
    return { title: null, description: mainText.slice(0, 800), requirements: '', raw: true };
  }

  return { title, description, requirements };
}

// ─── Injected: fill the project textarea with AI content ─────────────────────
function fillProjectTextarea(content) {
  // ProjectAssessmentSubmission: <Textarea placeholder="Write your project response here...">
  const textarea =
    document.querySelector('textarea[placeholder*="project response"]') ??
    document.querySelector('textarea[placeholder*="Write your"]') ??
    document.querySelector('textarea[class*="min-h"]');

  if (!textarea) {
    // Show on-page toast if textarea not found
    alert('QuizAI: Could not find the project text field. Make sure you are on the submission page.');
    return;
  }

  // Focus textarea
  textarea.focus();

  // Set the value via React's internal setter so onChange fires
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(textarea, content);
  } else {
    textarea.value = content;
  }

  // Dispatch an input event so React state updates
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  // Scroll to the textarea
  textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Show a brief highlight
  const orig = textarea.style.outline;
  textarea.style.outline = '2px solid #6366f1';
  setTimeout(() => { textarea.style.outline = orig; }, 2000);
}
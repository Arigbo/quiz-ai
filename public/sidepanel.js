// QuizSolver AI PRO — Side Panel Logic
// Flow: Extract question → Call AI API → Click correct button on page → Show toast on page

const API_BASE = 'https://quiz-ai-kappa.vercel.app';

// ─── UI refs ─────────────────────────────────────────────────────────────────
const btnAutoAnswer = document.getElementById('btn-auto-answer');
const btnFullApp    = document.getElementById('btn-full-app');
const statusArea    = document.getElementById('status-area');
const statusBox     = document.getElementById('status-box');

btnFullApp.addEventListener('click', () => {
  chrome.tabs.create({ url: API_BASE });
});

// ─── Main: Answer on page ─────────────────────────────────────────────────────
btnAutoAnswer.addEventListener('click', async () => {
  setLoading(true);
  showStatus('loading', 'Reading question from page…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 1. Extract question + options from the active tab
    const extractResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSkillsBridgeQuestion,
    });

    const extracted = extractResults[0]?.result;
    console.log('[QuizAI] extracted:', JSON.stringify(extracted));

    if (!extracted || !extracted.question) {
      showStatus('error', '❌ No quiz question found on this page. Make sure you\'re on a SkillsBridge quiz question and the question is visible.');
      setLoading(false);
      return;
    }

    if (!extracted.options || extracted.options.length === 0) {
      showStatus('error', `❌ Found question but couldn't extract answer options.\n\nQ: "${extracted.question.slice(0, 80)}"\n\nDebug: ${extracted.debug || 'n/a'}`);
      setLoading(false);
      return;
    }

    showStatus('loading', `Found: "${extracted.question.slice(0, 55)}…"\n\nOptions: ${extracted.options.map((o, i) => `${String.fromCharCode(65+i)}. ${o.slice(0,30)}`).join(' | ')}\n\nAsking AI…`);

    // 2. Call the AI API
    const res = await fetch(`${API_BASE}/api/auto-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: extracted.question,
        options:  extracted.options,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error ${res.status}`);
    }

    const { correctAnswer, correctAnswerIndex } = await res.json();

    if (correctAnswerIndex < 0 || correctAnswerIndex >= extracted.options.length) {
      throw new Error(`AI returned invalid index ${correctAnswerIndex}. Answer: "${correctAnswer}"`);
    }

    const optionLetter = String.fromCharCode(65 + correctAnswerIndex);

    showStatus('success', `
      <div class="answer-label">✅ AI selected answer ${optionLetter}:</div>
      <div class="answer-text"><span class="answer-index">${optionLetter}</span>${correctAnswer}</div>
    `);

    // 3. Click the correct answer button on the page + show toast
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: clickAnswerOnPage,
      args: [correctAnswerIndex, correctAnswer, optionLetter],
    });

  } catch (err) {
    showStatus('error', `❌ ${err.message}`);
  } finally {
    setLoading(false);
  }
});

// ─── Injected into the quiz tab: extract question & options ───────────────────
/**
 * Runs INSIDE the SkillsBridge tab.
 *
 * QuizQuestionCard.tsx DOM structure (Tailwind classes are written verbatim):
 *
 * <Card class="mt-5 gap-0 border-border bg-white py-0 shadow-sm">
 *   <CardContent class="px-4 py-5 sm:px-8 sm:py-8">
 *     <div class="mb-6 flex items-start gap-3 sm:mb-7">
 *       <span class="...bg-sb-primary/10...">1</span>          ← question number
 *       <div class="min-w-0">
 *         <p class="pt-1 text-base font-medium leading-snug text-foreground ...">
 *           QUESTION TEXT                                        ← target
 *         </p>
 *         <p class="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
 *           multiple choice                                      ← type label (skip)
 *         </p>
 *       </div>
 *     </div>
 *     <!-- Multiple-choice answers -->
 *     <div class="space-y-3">
 *       <button type="button" class="w-full overflow-hidden rounded-lg border text-left ...">
 *         <div class="flex items-center">
 *           <div class="flex h-12 w-14 ...">                    ← label col
 *             <span class="...">...</span>                      ← radio dot
 *             <span class="text-sm font-semibold text-muted-foreground">A:</span>
 *           </div>
 *           <div class="px-3 py-3 text-sm text-foreground ...">
 *             ANSWER TEXT                                       ← target
 *           </div>
 *         </div>
 *       </button>
 *       ...
 *     </div>
 *   </CardContent>
 * </Card>
 */
function extractSkillsBridgeQuestion() {
  const debug = [];

  // ── 1. Find the question text ────────────────────────────────────────────────
  // The question <p> has: pt-1 text-base font-medium leading-snug text-foreground
  // The type-label <p> has: mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400
  // → distinguish by: question text is NOT uppercase, is longer, has leading-snug

  let questionText = '';
  let questionEl = null;

  // Prefer paragraphs that have BOTH font-medium AND leading-snug
  const strictMatch = Array.from(
    document.querySelectorAll('p[class*="font-medium"][class*="leading-snug"]')
  ).filter(p => {
    const t = p.textContent?.trim() ?? '';
    return t.length > 10;
  });

  if (strictMatch.length > 0) {
    questionEl = strictMatch[0];
    debug.push(`found via strict selector, count=${strictMatch.length}`);
  } else {
    // Fallback: any font-medium <p> that is not all-uppercase (the type label is uppercase)
    const loose = Array.from(
      document.querySelectorAll('p[class*="font-medium"]')
    ).filter(p => {
      const t = p.textContent?.trim() ?? '';
      const cls = p.className ?? '';
      // Exclude the type-label <p> which has "uppercase" class
      return t.length > 10 && !cls.includes('uppercase') && t !== t.toUpperCase();
    });
    if (loose.length > 0) {
      questionEl = loose[0];
      debug.push(`found via loose selector, count=${loose.length}`);
    }
  }

  if (!questionEl) {
    debug.push('no question <p> found');
    return { question: null, options: [], debug: debug.join(' | ') };
  }

  questionText = questionEl.textContent?.trim() ?? '';
  debug.push(`question="${questionText.slice(0, 40)}"`);

  // ── 2. Find answer buttons ────────────────────────────────────────────────────
  // Strategy A: walk UP from the question <p> until we reach an ancestor that
  //             contains button[type="button"] elements, then collect them.
  //             Stop before <body> to avoid grabbing nav buttons from the whole page.

  let answerButtons = [];
  let node = questionEl;

  for (let depth = 0; depth < 15; depth++) {
    node = node.parentElement;
    if (!node || node === document.body) break;

    const btns = Array.from(node.querySelectorAll('button[type="button"]'));
    if (btns.length >= 2) {
      answerButtons = btns;
      debug.push(`buttons found at depth=${depth}, count=${btns.length}`);
      break;
    }
  }

  // Strategy B: if walk-up failed, look for the nearest sibling <div class="space-y-3">
  // (the answer container in QuizQuestionCard) relative to the question's grandparent
  if (answerButtons.length === 0) {
    const headerRow = questionEl.closest('[class*="gap-3"]') ?? questionEl.parentElement?.parentElement;
    if (headerRow) {
      const sibling = headerRow.nextElementSibling;
      if (sibling) {
        const btns = Array.from(sibling.querySelectorAll('button[type="button"]'));
        if (btns.length >= 1) {
          answerButtons = btns;
          debug.push(`buttons from sibling, count=${btns.length}`);
        }
      }
    }
  }

  // Strategy C: last resort — ALL buttons on page except known nav labels
  if (answerButtons.length === 0) {
    const NAV = new Set(['next', 'previous', 'prev', 'submit', 'back', 'finish', 'save', 'cancel', 'skip', 'continue']);
    answerButtons = Array.from(document.querySelectorAll('button[type="button"]')).filter(btn => {
      const t = (btn.textContent ?? '').trim().toLowerCase();
      return t.length > 1 && !NAV.has(t) && t.length < 300;
    });
    debug.push(`strategy C, all-page buttons filtered, count=${answerButtons.length}`);
  }

  // ── 3. Extract text from each answer button ───────────────────────────────────
  const options = [];

  for (const btn of answerButtons) {
    let text = '';

    // Method 1: The answer text is in <div class="px-3 py-3 ..."> — second div child
    //           inside <div class="flex items-center">
    //           We look for the div that has px-3 AND py-3 in its class list.
    const answerDiv =
      btn.querySelector('div[class*="px-3"][class*="py-3"]') ??
      btn.querySelector('div[class*="text-foreground"]:not([class*="muted"])');

    if (answerDiv) {
      text = answerDiv.textContent?.trim() ?? '';
    }

    // Method 2: For True/False — the button has <p class="...font-semibold...">True</p>
    if (!text) {
      const pTag = btn.querySelector('p[class*="font-semibold"]');
      if (pTag) text = pTag.textContent?.trim() ?? '';
    }

    // Method 3: Strip the "A:" / "B:" label prefix from the full button innerText.
    //           innerText for a typical answer button:  "A:\nAnswer text here"
    if (!text) {
      const raw = btn.innerText?.trim() ?? '';
      // Remove leading option label line (e.g. "A:\n" or "A: ")
      const stripped = raw.replace(/^[A-Z]:\s*/m, '').trim();
      // Take only the first paragraph of text (ignore any nested noise)
      text = stripped.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
    }

    if (text && text.length > 1) {
      options.push(text);
    }
  }

  debug.push(`options extracted: ${options.length}`);

  return {
    question: questionText,
    options,
    debug: debug.join(' | '),
  };
}

// ─── Injected into the quiz tab: click the answer button + show toast ─────────
function clickAnswerOnPage(correctIndex, correctAnswer, optionLetter) {
  // ── Inject styles once ────────────────────────────────────────────────────
  if (!document.getElementById('quiz-ai-styles')) {
    const style = document.createElement('style');
    style.id = 'quiz-ai-styles';
    style.textContent = `
      @keyframes quizAiSlideIn {
        from { opacity: 0; transform: translateY(16px) scale(.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Re-discover answer buttons fresh (avoid stale refs) ───────────────────
  function findAnswerButtons() {
    // Strategy 1: walk up from question paragraph
    const qParas = Array.from(
      document.querySelectorAll('p[class*="font-medium"][class*="leading-snug"]')
    ).filter(p => (p.textContent?.trim().length ?? 0) > 10);

    if (qParas.length > 0) {
      let node = qParas[0];
      for (let d = 0; d < 15; d++) {
        node = node.parentElement;
        if (!node || node === document.body) break;
        const btns = Array.from(node.querySelectorAll('button[type="button"]'));
        if (btns.length >= 2) return btns;
      }
      // Strategy 2: sibling of question header row
      const headerRow = qParas[0].closest('[class*="gap-3"]') ?? qParas[0].parentElement?.parentElement;
      if (headerRow?.nextElementSibling) {
        const btns = Array.from(headerRow.nextElementSibling.querySelectorAll('button[type="button"]'));
        if (btns.length >= 1) return btns;
      }
    }

    // Strategy 3: all page buttons minus nav
    const NAV = new Set(['next','previous','prev','submit','back','finish','save','cancel','skip','continue']);
    return Array.from(document.querySelectorAll('button[type="button"]')).filter(btn => {
      const t = (btn.textContent ?? '').trim().toLowerCase();
      return t.length > 1 && !NAV.has(t) && t.length < 300;
    });
  }

  // ── React-safe click: dispatchEvent bubbles through React's event system ──
  function reactClick(el) {
    el.focus();
    // MouseEvent with bubbles:true is required for React's synthetic event system
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window }));
  }

  // ── Toast helper ──────────────────────────────────────────────────────────
  function showToast(message, type) {
    const existing = document.getElementById('quiz-ai-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'quiz-ai-toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:2147483647;
      max-width:380px; padding:14px 18px; border-radius:12px;
      font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;
      font-size:13px; font-weight:500; line-height:1.5; color:#fff;
      box-shadow:0 8px 32px rgba(0,0,0,.4);
      animation:quizAiSlideIn .3s cubic-bezier(.34,1.56,.64,1);
      cursor:pointer;
      ${type === 'success'
        ? 'background:linear-gradient(135deg,rgba(22,163,74,.97),rgba(5,150,105,.97));border:1px solid rgba(34,197,94,.4);'
        : 'background:linear-gradient(135deg,rgba(217,119,6,.97),rgba(180,83,9,.97));border:1px solid rgba(251,191,36,.4);'}
    `;
    toast.textContent = message;
    toast.title = 'Click to dismiss';
    toast.addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    setTimeout(() => toast?.remove(), 7000);
  }

  // ── Main: find, scroll, click ─────────────────────────────────────────────
  const answerButtons = findAnswerButtons();
  const target = answerButtons[correctIndex] ?? null;

  if (!target) {
    showToast(`⚠️ Button not found. AI says: ${optionLetter}. ${correctAnswer} — click manually`, 'warn');
    return;
  }

  // Scroll into view, wait for scroll to settle, then click
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  setTimeout(() => {
    // Re-find the button right before clicking in case React re-rendered
    const freshButtons = findAnswerButtons();
    const freshTarget = freshButtons[correctIndex] ?? target;

    // Highlight the button so user can see what's being selected
    const origOutline = freshTarget.style.outline;
    const origTransition = freshTarget.style.transition;
    freshTarget.style.transition = 'outline 0.1s';
    freshTarget.style.outline = '3px solid #6366f1';

    // React-safe click
    reactClick(freshTarget);

    // Remove highlight after a moment
    setTimeout(() => {
      freshTarget.style.outline = origOutline;
      freshTarget.style.transition = origTransition;
    }, 1500);

    showToast(`✅ Answered: ${optionLetter}. ${correctAnswer}`, 'success');
  }, 400);
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function showStatus(type, text) {
  statusArea.style.display = 'block';
  statusBox.className = `status-box ${type}`;

  if (type === 'loading') {
    statusBox.innerHTML = `<div class="spinner"></div><span style="white-space:pre-wrap">${text}</span>`;
  } else {
    statusBox.innerHTML = text;
  }
}

function setLoading(loading) {
  btnAutoAnswer.disabled = loading;
  btnAutoAnswer.innerHTML = loading
    ? '<div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div> Working…'
    : '<span>🎯</span> Answer This Question';
}
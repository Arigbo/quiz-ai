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
    // 1. Extract question + options from the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const extractResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractSkillsBridgeQuestion,
    });

    const extracted = extractResults[0]?.result;

    if (!extracted || !extracted.question) {
      showStatus('error', '❌ No quiz question found on this page. Make sure you\'re on a SkillsBridge quiz question.');
      setLoading(false);
      return;
    }

    showStatus('loading', `Found: "${extracted.question.slice(0, 60)}…"\n\nAsking AI…`);

    // 2. Call the AI API
    const res = await fetch(`${API_BASE}/api/auto-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: extracted.question,
        options: extracted.options,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error ${res.status}`);
    }

    const { correctAnswer, correctAnswerIndex } = await res.json();
    const optionLetter = String.fromCharCode(65 + correctAnswerIndex);

    showStatus('success', `
      <div class="answer-label">AI selected answer ${optionLetter}:</div>
      <div class="answer-text"><span class="answer-index">${optionLetter}</span>${correctAnswer}</div>
    `);

    // 3. Click the correct answer on the page + show a toast overlay
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
function extractSkillsBridgeQuestion() {
  // Find question text: the <p> with font-medium leading-snug inside the question card
  // QuizQuestionCard.tsx: <p class="pt-1 text-base font-medium leading-snug text-foreground ...">

  let questionText = '';
  let options = [];

  // Strategy 1: compound Tailwind classes
  const questionParas = Array.from(
    document.querySelectorAll('p[class*="font-medium"]')
  ).filter(p => {
    const t = p.textContent?.trim() ?? '';
    return t.length > 10 && t !== t.toUpperCase();
  });

  if (questionParas.length === 0) return { question: null, options: [] };

  const qPara = questionParas[0];
  questionText = qPara.textContent?.trim() ?? '';

  // Walk up to find the CardContent (contains both question header + answer buttons)
  let cardContent = null;
  let node = qPara;
  for (let i = 0; i < 12; i++) {
    node = node.parentElement;
    if (!node) break;
    const btns = node.querySelectorAll('button[type="button"]');
    if (btns.length >= 1) {
      cardContent = node;
      break;
    }
  }

  if (!cardContent) {
    return { question: questionText, options: [] };
  }

  const answerButtons = cardContent.querySelectorAll('button[type="button"]');

  answerButtons.forEach(btn => {
    // Structure: <button> → <div.flex.items-center> → [labelDiv, answerDiv]
    const flexRow = btn.querySelector('div.flex.items-center') ?? btn.querySelector('div');
    if (flexRow) {
      const children = Array.from(flexRow.children).filter(el => el.tagName === 'DIV');
      if (children.length >= 2) {
        const text = children[children.length - 1].textContent?.trim() ?? '';
        if (text.length > 0) { options.push(text); return; }
      }
    }
    // Fallback for True/False — the <p class="font-semibold"> inside button
    const pTag = btn.querySelector('p[class*="font-semibold"]');
    if (pTag) { options.push(pTag.textContent?.trim() ?? ''); return; }

    // Last resort: strip label prefix from button text
    const raw = btn.innerText?.trim() ?? '';
    const match = raw.match(/^[A-Z]:\s*([\s\S]+)$/m);
    const text = match ? match[1].trim() : raw;
    if (text.length > 1) options.push(text);
  });

  return { question: questionText, options };
}

// ─── Injected into the quiz tab: click the answer button + show toast ─────────
function clickAnswerOnPage(correctIndex, correctAnswer, optionLetter) {
  // Find all answer buttons the same way
  let cardContent = null;

  const questionParas = Array.from(
    document.querySelectorAll('p[class*="font-medium"]')
  ).filter(p => {
    const t = p.textContent?.trim() ?? '';
    return t.length > 10 && t !== t.toUpperCase();
  });

  if (questionParas.length > 0) {
    let node = questionParas[0];
    for (let i = 0; i < 12; i++) {
      node = node.parentElement;
      if (!node) break;
      if (node.querySelectorAll('button[type="button"]').length >= 1) {
        cardContent = node;
        break;
      }
    }
  }

  if (!cardContent) {
    showQuizToast(`⚠️ Couldn't find answer buttons. AI says: ${optionLetter}. ${correctAnswer}`, 'warn');
    return;
  }

  const btns = Array.from(cardContent.querySelectorAll('button[type="button"]'));
  const target = btns[correctIndex];

  if (target) {
    // Scroll it into view, then click
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      target.click();
      showQuizToast(`✅ AI selected: ${optionLetter}. ${correctAnswer}`, 'success');
    }, 300);
  } else {
    showQuizToast(`⚠️ AI answer: ${optionLetter}. ${correctAnswer} (button not found, click manually)`, 'warn');
  }

  // ── Floating toast on the page ──────────────────────────────────────────────
  function showQuizToast(message, type) {
    const existing = document.getElementById('quiz-ai-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'quiz-ai-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      max-width: 360px;
      padding: 14px 18px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.5;
      color: #fff;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0,0,0,.35);
      animation: quizAiSlideIn .3s cubic-bezier(.34,1.56,.64,1);
      cursor: pointer;
      ${type === 'success'
        ? 'background: linear-gradient(135deg, rgba(22,163,74,.95), rgba(5,150,105,.95)); border: 1px solid rgba(34,197,94,.4);'
        : 'background: linear-gradient(135deg, rgba(217,119,6,.95), rgba(180,83,9,.95)); border: 1px solid rgba(251,191,36,.4);'
      }
    `;

    // Add keyframe animation if not already present
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

    toast.textContent = message;
    toast.title = 'Click to dismiss';
    toast.addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);

    // Auto-dismiss after 6 seconds
    setTimeout(() => toast?.remove(), 6000);
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function showStatus(type, html) {
  statusArea.style.display = 'block';
  statusBox.className = `status-box ${type}`;

  if (type === 'loading') {
    statusBox.innerHTML = `<div class="spinner"></div><span style="white-space:pre-wrap">${html}</span>`;
  } else {
    statusBox.innerHTML = html;
  }
}

function setLoading(loading) {
  btnAutoAnswer.disabled = loading;
  btnAutoAnswer.innerHTML = loading
    ? '<div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div> Working…'
    : '<span>🎯</span> Answer This Question';
}
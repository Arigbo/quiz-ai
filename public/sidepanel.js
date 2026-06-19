// Communication bridge between the sidepanel iframe and the browser tab

/**
 * Detects if the current tab is a SkillsBridge quiz page and extracts
 * structured question data directly from the React-rendered DOM.
 * Falls back to generic innerText scraping for other sites.
 */
function extractPageContent() {
  // ─── SkillsBridge Quiz Detection ──────────────────────────────────────────
  // SkillsBridge quiz pages show one question at a time.
  // The question card has a <p class="...font-medium..."> for question text
  // and <button> elements containing option labels (A:, B:, etc.) + answer text.

  const isSkillsBridge =
    window.location.hostname.includes('skillsbridge') ||
    document.querySelector('[class*="QuizAssessmentPlayer"]') !== null ||
    document.querySelector('[class*="QuizQuestionCard"]') !== null;

  if (isSkillsBridge || _looksLikeSkillsBridgeQuiz()) {
    return _extractSkillsBridgeQuiz();
  }

  // ─── Generic Fallback ────────────────────────────────────────────────────
  return {
    text: document.body.innerText,
    url: window.location.href,
    html: document.documentElement.innerHTML,
    source: 'generic'
  };
}

function _looksLikeSkillsBridgeQuiz() {
  // Heuristic: quiz card with numbered badge + option buttons
  const hasBadge = document.querySelector('.bg-sb-primary\\/10, [class*="sb-primary"]');
  const hasOptionButtons = document.querySelectorAll('button[type="button"]').length >= 2;
  const hasProgressBar = document.querySelector('[role="progressbar"], [class*="progress"]');
  return Boolean(hasBadge && hasOptionButtons && hasProgressBar);
}

function _extractSkillsBridgeQuiz() {
  const questions = [];

  // Strategy 1: Find all quiz question cards on the page
  // SkillsBridge QuizQuestionCard renders:
  //   <div class="mb-6 flex items-start gap-3"> ... <p class="pt-1 text-base font-medium ...">QUESTION TEXT</p>
  //   Then answer buttons: <button><div class="flex items-center"><div class="...">A:</div><div>ANSWER TEXT</div></button>

  // Try to find question text elements (they have pt-1, font-medium, and text content)
  const questionCandidates = Array.from(
    document.querySelectorAll('p[class*="font-medium"], p[class*="leading-snug"]')
  ).filter(el => el.textContent && el.textContent.trim().length > 10);

  if (questionCandidates.length > 0) {
    questionCandidates.forEach((qEl, idx) => {
      // Walk up to find the card container, then find sibling button elements
      const card = qEl.closest('[class*="CardContent"], [class*="card"], .flex.items-start.gap-3')?.closest('[class*="Card"], [class*="card"]') 
                   || qEl.closest('div[class*="py-5"], div[class*="py-8"]')
                   || qEl.parentElement?.parentElement?.parentElement;

      const questionText = qEl.textContent?.trim() || '';
      const options = [];

      if (card) {
        // Look for option buttons within the card
        const optionBtns = card.querySelectorAll('button[type="button"]');
        optionBtns.forEach(btn => {
          // Each button has a label div (A:, B:) and a text div
          const divs = btn.querySelectorAll('div');
          let optionText = '';
          divs.forEach(d => {
            const t = d.textContent?.trim() || '';
            // Skip the label div (A:, B:, C:...) and short divs
            if (t.length > 2 && !/^[A-Z]:$/.test(t)) {
              optionText = t;
            }
          });
          if (optionText) options.push(optionText);
        });

        // Also handle True/False buttons
        if (options.length === 0) {
          const tfBtns = card.querySelectorAll('button[type="button"] p[class*="font-semibold"]');
          tfBtns.forEach(el => {
            const t = el.textContent?.trim();
            if (t) options.push(t);
          });
        }
      }

      if (questionText && options.length > 0) {
        questions.push({ questionText, options });
      }
    });
  }

  // Strategy 2: If structured extraction failed, do intelligent text scraping
  // Grab just the main content area and produce clean formatted text
  if (questions.length === 0) {
    const mainContent = document.querySelector('main, [role="main"], .assessment-content, #__next main')
                        || document.body;
    const rawText = mainContent.innerText;
    return {
      text: rawText,
      url: window.location.href,
      html: mainContent.innerHTML,
      source: 'skillsbridge_text'
    };
  }

  // Build structured text that the AI can parse perfectly
  const structuredText = questions.map((q, i) => {
    const optionLines = q.options.map((opt, j) => 
      `  ${String.fromCharCode(65 + j)}. ${opt}`
    ).join('\n');
    return `Question ${i + 1}: ${q.questionText}\n${optionLines}`;
  }).join('\n\n');

  return {
    text: structuredText,
    url: window.location.href,
    html: '',
    source: 'skillsbridge_structured',
    questions: questions // Pass structured data directly
  };
}

// ─── Message Listener ────────────────────────────────────────────────────────
window.addEventListener('message', async (event) => {
  const frame = document.getElementById('solver-frame');

  if (event.data.type === 'REQUEST_TAB_CONTENT') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // ── Inline extraction (runs inside the tab's page context) ──────────

          function looksLikeSkillsBridge() {
            const hasPrimary = document.querySelector('[class*="sb-primary"]');
            const hasOptionBtns = document.querySelectorAll('button[type="button"]').length >= 2;
            const hasProgress = document.querySelector('[role="progressbar"], [class*="Progress"]');
            return Boolean(hasPrimary && hasOptionBtns && hasProgress);
          }

          if (looksLikeSkillsBridge()) {
            const questions = [];

            // Find question text: large font-medium paragraphs
            const qEls = Array.from(
              document.querySelectorAll('p[class*="font-medium"], p[class*="leading-snug"], p[class*="text-base"]')
            ).filter(el => {
              const t = el.textContent?.trim() || '';
              return t.length > 15 && !t.startsWith('Question ') && !/^\d+$/.test(t);
            });

            qEls.forEach(qEl => {
              const questionText = qEl.textContent?.trim() || '';
              const options = [];

              // Walk up to card container
              let container = qEl;
              for (let i = 0; i < 8; i++) {
                container = container.parentElement;
                if (!container) break;
                const btns = container.querySelectorAll('button[type="button"]');
                if (btns.length >= 2) {
                  btns.forEach(btn => {
                    // Get the answer text — it's in a div without the label (A:, B:...)
                    const innerDivs = Array.from(btn.querySelectorAll('div'));
                    let found = '';
                    innerDivs.forEach(d => {
                      const t = (d.childElementCount === 0 ? d.textContent : d.innerText)?.trim() || '';
                      if (t.length > 2 && !/^[A-Z]:$/.test(t) && !found) {
                        found = t;
                      }
                    });
                    // Fallback: get full button text and strip the label
                    if (!found) {
                      const btnText = btn.innerText?.trim() || '';
                      const match = btnText.match(/^[A-Z]:\s*(.+)$/m);
                      found = match ? match[1].trim() : btnText;
                    }
                    if (found && found.length > 1) options.push(found);
                  });
                  break;
                }
              }

              // True/False detection
              if (options.length === 0) {
                const tfBtns = document.querySelectorAll('button[type="button"] p[class*="font-semibold"]');
                tfBtns.forEach(el => {
                  const t = el.textContent?.trim();
                  if (t) options.push(t);
                });
              }

              if (questionText && options.length > 0) {
                questions.push({ questionText, options });
              }
            });

            if (questions.length > 0) {
              const structuredText = questions.map((q, i) => {
                const opts = q.options.map((o, j) => `  ${String.fromCharCode(65 + j)}. ${o}`).join('\n');
                return `Question ${i + 1}: ${q.questionText}\n${opts}`;
              }).join('\n\n');

              return {
                text: structuredText,
                url: window.location.href,
                html: '',
                source: 'skillsbridge_structured',
                questions
              };
            }
          }

          // Generic fallback
          return {
            text: document.body.innerText,
            url: window.location.href,
            html: document.documentElement.innerHTML.substring(0, 40000),
            source: 'generic'
          };
        }
      });

      const pageData = results[0].result;

      frame.contentWindow.postMessage({
        type: 'TAB_CONTENT_RESPONSE',
        payload: pageData
      }, '*');

    } catch (error) {
      console.error('Extraction error:', error);
      frame.contentWindow.postMessage({
        type: 'TAB_CONTENT_ERROR',
        message: error.message
      }, '*');
    }
  }
});
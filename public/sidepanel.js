// Communication bridge between the sidepanel iframe and the browser tab

// ─── Message Listener ────────────────────────────────────────────────────────
window.addEventListener('message', async (event) => {
  const frame = document.getElementById('solver-frame');

  if (event.data.type === 'REQUEST_TAB_CONTENT') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        // ── This function runs INSIDE the quiz tab's page context ──────────
        func: () => {
          const url = window.location.href;

          // ─────────────────────────────────────────────────────────────────
          // SKILLSBRIDGE EXTRACTOR
          // Based on QuizQuestionCard.tsx DOM structure:
          //
          // <Card>                                          ← mt-5 gap-0 border-border
          //   <CardContent>                                 ← px-4 py-5 sm:px-8 sm:py-8
          //     <div class="mb-6 flex items-start gap-3">   ← question header row
          //       <span class="...bg-sb-primary/10...">     ← question number badge
          //       <div class="min-w-0">
          //         <p class="pt-1 text-base font-medium leading-snug ...">
          //           QUESTION TEXT                         ← ← ← target
          //         </p>
          //       </div>
          //     </div>
          //
          //     <!-- Multiple-choice / True-False answers -->
          //     <button type="button" class="...w-full...rounded-lg...border...">
          //       <div class="flex items-center">
          //         <div class="flex h-12 w-14 ...">        ← label column (A:, B:...)
          //           <span>...</span>                      ← radio/checkbox dot
          //           <span class="text-sm font-semibold text-muted-foreground">A:</span>
          //         </div>
          //         <div class="px-3 py-3 text-sm text-foreground ...">
          //           ANSWER TEXT                           ← ← ← target
          //         </div>
          //       </div>
          //     </button>
          // ─────────────────────────────────────────────────────────────────

          function isSkillsBridgePage() {
            // The question number badge always has bg-sb-primary/10 as a class
            // Tailwind writes utility classes as-is into the DOM, so this works.
            return (
              url.includes('skillsbridge') ||
              document.querySelector('[class*="bg-sb-primary"]') !== null
            );
          }

          function extractSkillsBridge() {
            const questions = [];

            // Find question text paragraphs.
            // They have: pt-1, font-medium, leading-snug (from the JSX)
            // They also happen to sit inside a div.min-w-0 inside a div.flex.items-start.gap-3
            const questionParas = Array.from(
              document.querySelectorAll('p.font-medium.leading-snug, p[class*="font-medium"][class*="leading-snug"]')
            ).filter(p => (p.textContent?.trim().length ?? 0) > 10);

            // If the exact compound selector fails, fall back to any font-medium paragraph
            // inside the question header row (div with gap-3 + items-start)
            if (questionParas.length === 0) {
              const allFontMedium = Array.from(
                document.querySelectorAll('p[class*="font-medium"]')
              ).filter(p => {
                const t = p.textContent?.trim() ?? '';
                // must be meaningful text (not the question-type label which is short + uppercase)
                return t.length > 10 && t !== t.toUpperCase();
              });
              questionParas.push(...allFontMedium);
            }

            questionParas.forEach(qPara => {
              const questionText = qPara.textContent?.trim() ?? '';
              if (!questionText) return;

              // Walk up from the <p> to find the card container that holds the answer buttons
              // Structure: <p> → <div.min-w-0> → <div.flex.items-start.gap-3> → <CardContent> → <Card>
              // The answer buttons are siblings of the question header div, inside CardContent.
              let cardContent = null;
              let node = qPara;
              for (let i = 0; i < 10; i++) {
                node = node.parentElement;
                if (!node) break;
                // CardContent has px-4 py-5 (or sm:px-8 sm:py-8)
                if (
                  (node.classList.contains('px-4') && node.classList.contains('py-5')) ||
                  node.querySelectorAll('button[type="button"]').length >= 1
                ) {
                  cardContent = node;
                  break;
                }
              }

              if (!cardContent) {
                // last resort: go up 4 levels
                cardContent = qPara.parentElement?.parentElement?.parentElement?.parentElement ?? null;
              }

              const options = [];

              if (cardContent) {
                const answerButtons = cardContent.querySelectorAll('button[type="button"]');

                answerButtons.forEach(btn => {
                  // The answer text lives in the SECOND direct child div of <div.flex.items-center>
                  // Structure: <button> → <div.flex.items-center> → [<div label>, <div answerText>]
                  const flexRow = btn.querySelector('div.flex.items-center') ?? btn.querySelector('div');
                  if (flexRow) {
                    // The second child div contains the answer text
                    const children = Array.from(flexRow.children).filter(el => el.tagName === 'DIV');
                    if (children.length >= 2) {
                      const answerText = children[children.length - 1].textContent?.trim() ?? '';
                      if (answerText.length > 0) {
                        options.push(answerText);
                        return;
                      }
                    }
                  }

                  // Fallback: grab the whole button text and strip the label prefix (A:, B:, etc.)
                  const raw = btn.innerText?.trim() ?? '';
                  const match = raw.match(/^[A-Z]:\s*([\s\S]+)$/m);
                  const answerText = match ? match[1].trim() : raw;
                  if (answerText.length > 1) options.push(answerText);
                });

                // True / False: buttons have a <p class="...font-semibold..."> with "True" / "False"
                if (options.length === 0) {
                  cardContent.querySelectorAll('button[type="button"] p[class*="font-semibold"]')
                    .forEach(p => {
                      const t = p.textContent?.trim();
                      if (t) options.push(t);
                    });
                }
              }

              if (options.length > 0) {
                questions.push({ questionText, options });
              }
            });

            // Build clean structured text for the AI
            if (questions.length > 0) {
              const structuredText = questions.map((q, i) => {
                const opts = q.options.map((o, j) => `  ${String.fromCharCode(65 + j)}. ${o}`).join('\n');
                return `Question ${i + 1}: ${q.questionText}\n${opts}`;
              }).join('\n\n');

              return {
                text: structuredText,
                url,
                html: '',
                source: 'skillsbridge_structured',
                questions,
              };
            }

            // If structured extraction failed, return the main content text
            const main = document.querySelector('main') ?? document.body;
            return {
              text: main.innerText,
              url,
              html: main.innerHTML.substring(0, 50000),
              source: 'skillsbridge_text',
            };
          }

          // ─────────────────────────────────────────────────────────────────
          // DISPATCH
          // ─────────────────────────────────────────────────────────────────
          if (isSkillsBridgePage()) {
            return extractSkillsBridge();
          }

          // Generic fallback for any other quiz site
          return {
            text: document.body.innerText,
            url,
            html: document.documentElement.innerHTML.substring(0, 50000),
            source: 'generic',
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
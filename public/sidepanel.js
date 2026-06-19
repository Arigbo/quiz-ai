// Bridge between the side panel and the hosted Next.js app
const frame = document.getElementById('solver-frame');

window.addEventListener('message', async (event) => {
  // Only accept messages from our hosted app
  if (event.origin !== 'https://quiz-ai-kappa.vercel.app') return;

  if (event.data.type === 'REQUEST_TAB_CONTENT') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error("No active tab found");
      }

      // Inject script to get page content
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            text: document.body.innerText,
            html: document.documentElement.innerHTML,
            url: window.location.href,
            title: document.title
          };
        }
      });

      const pageData = results[0].result;

      // Send the content back to the app in the iframe
      frame.contentWindow.postMessage({
        type: 'TAB_CONTENT_RESPONSE',
        payload: pageData
      }, 'https://quiz-ai-kappa.vercel.app');

    } catch (error) {
      console.error("Capture Error:", error);
      frame.contentWindow.postMessage({
        type: 'TAB_CONTENT_ERROR',
        message: error.message
      }, 'https://quiz-ai-kappa.vercel.app');
    }
  }
});
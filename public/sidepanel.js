// Bridge between the Extension and the NextJS App
window.addEventListener('message', async (event) => {
  const iframe = document.getElementById('solver-iframe');
  
  if (event.data.type === 'REQUEST_TAB_CONTENT') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        throw new Error("No active tab found.");
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            text: document.body.innerText,
            url: window.location.href,
            title: document.title
          };
        }
      });

      const payload = results[0].result;
      iframe.contentWindow.postMessage({
        type: 'TAB_CONTENT_RESPONSE',
        payload: payload
      }, '*');

    } catch (error) {
      console.error("Capture Error:", error);
      iframe.contentWindow.postMessage({
        type: 'TAB_CONTENT_ERROR',
        message: error.message
      }, '*');
    }
  }
});
// Communication bridge between the sidepanel iframe and the browser tab
window.addEventListener('message', async (event) => {
  const frame = document.getElementById('solver-frame');
  
  if (event.data.type === 'REQUEST_TAB_CONTENT') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            text: document.body.innerText,
            url: window.location.href,
            html: document.documentElement.innerHTML
          };
        }
      });

      const pageData = results[0].result;
      
      // Send the content back to the React app inside the iframe
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
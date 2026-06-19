// This script runs in the context of the extension's sidepanel.html
// It handles communication between the hosted Next.js app and the browser tabs.

const iframe = document.getElementById('solver-iframe');

// Listen for messages from the hosted Next.js app
window.addEventListener('message', async (event) => {
  // Security: You can check event.origin here if needed
  
  if (event.data.type === 'REQUEST_TAB_CONTENT') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error("No active tab found.");
      }

      // Execute script in the active tab to get the content
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Extract text and some basic structure
          return {
            title: document.title,
            url: window.location.href,
            text: document.body.innerText,
            html: document.body.innerHTML.substring(0, 30000) // Truncate to stay safe
          };
        }
      });

      // Send the content back to the Next.js app inside the iframe
      iframe.contentWindow.postMessage({
        type: 'TAB_CONTENT_RESPONSE',
        payload: result
      }, '*');

    } catch (error) {
      console.error("Failed to capture tab:", error);
      iframe.contentWindow.postMessage({
        type: 'TAB_CONTENT_ERROR',
        message: error.message
      }, '*');
    }
  }
});
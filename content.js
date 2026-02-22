const RECEIPT_REGEX = /\b(IOE|EAC|WAC|LIN|SRC|NBC|MSC|YSC|MCT)\d{10}\b/g;

function extractReceiptNumbers() {
  const bodyText = document.body.innerText;
  const matches = bodyText.match(RECEIPT_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}

function waitForContent(maxAttempts = 20, intervalMs = 1000) {
  let attempts = 0;
  return new Promise((resolve) => {
    const check = () => {
      attempts++;
      const receipts = extractReceiptNumbers();
      if (receipts.length > 0 || attempts >= maxAttempts) {
        resolve(receipts);
      } else {
        setTimeout(check, intervalMs);
      }
    };
    check();
  });
}

async function main() {
  const receiptNumbers = await waitForContent();

  if (receiptNumbers.length === 0) {
    console.log('[USCIS Extension] No receipt numbers found on page.');
    return;
  }

  console.log('[USCIS Extension] Found receipt numbers:', receiptNumbers);

  chrome.runtime.sendMessage(
    { type: 'RECEIPT_NUMBERS_FOUND', receiptNumbers },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[USCIS Extension] Error sending message:', chrome.runtime.lastError);
      }
    }
  );
}

// Listen for re-extract requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RE_EXTRACT') {
    main();
    sendResponse({ ok: true });
  }
});

// Observe DOM mutations for SPA content loading
const observer = new MutationObserver(() => {
  if (document.body.innerText.match(RECEIPT_REGEX)) {
    main();
    observer.disconnect();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Also run immediately in case content is already loaded
main();

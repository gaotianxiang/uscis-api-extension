const API_BASE = 'https://my.uscis.gov/account/case-service/api/cases/';

async function fetchCaseData(receiptNumber) {
  try {
    const response = await fetch(`${API_BASE}${receiptNumber}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      return {
        receiptNumber,
        error: true,
        status: response.status,
        statusText: response.statusText,
        data: null
      };
    }

    const data = await response.json();
    return {
      receiptNumber,
      error: false,
      status: response.status,
      data
    };
  } catch (err) {
    return {
      receiptNumber,
      error: true,
      status: 0,
      statusText: err.message,
      data: null
    };
  }
}

async function fetchAllCases(receiptNumbers) {
  const CONCURRENCY = 3;
  const results = [];

  for (let i = 0; i < receiptNumbers.length; i += CONCURRENCY) {
    const batch = receiptNumbers.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(rn => fetchCaseData(rn))
    );
    results.push(...batchResults);
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECEIPT_NUMBERS_FOUND') {
    const { receiptNumbers } = message;

    fetchAllCases(receiptNumbers).then((results) => {
      chrome.storage.local.set({
        caseResults: results,
        lastUpdated: Date.now(),
        receiptNumbers
      });

      chrome.action.setBadgeText({ text: String(results.length) });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    });

    sendResponse({ received: true });
    return true;
  }

  if (message.type === 'FETCH_CASES') {
    const { receiptNumbers } = message;
    fetchAllCases(receiptNumbers).then((results) => {
      chrome.storage.local.set({
        caseResults: results,
        lastUpdated: Date.now(),
        receiptNumbers
      });
      sendResponse({ results });
    });
    return true;
  }

  if (message.type === 'GET_RESULTS') {
    chrome.storage.local.get(['caseResults', 'lastUpdated'], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

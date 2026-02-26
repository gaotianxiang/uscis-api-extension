const API_BASE = 'https://my.uscis.gov/account/case-service/api/cases/';

function getChangedPaths(oldObj, newObj, prefix) {
  if (prefix === undefined) prefix = '';
  const changed = new Set();

  if (oldObj === newObj) return changed;

  if (oldObj === null || oldObj === undefined || newObj === null || newObj === undefined) {
    if (prefix) changed.add(prefix);
    return changed;
  }

  if (typeof oldObj !== 'object' || typeof newObj !== 'object') {
    if (prefix) changed.add(prefix);
    return changed;
  }

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const subChanged = getChangedPaths(oldObj[key], newObj[key], path);
    subChanged.forEach((p) => changed.add(p));
    if (subChanged.size > 0) changed.add(path);
  }

  return changed;
}

function computeAllChanges(previousResults, newResults) {
  const caseChanges = {};
  for (const result of newResults) {
    const prev = previousResults.find((r) => r.receiptNumber === result.receiptNumber);
    if (prev && !result.error && !prev.error && prev.data && result.data) {
      const changed = getChangedPaths(prev.data, result.data);
      if (changed.size > 0) {
        caseChanges[result.receiptNumber] = Array.from(changed);
      }
    }
  }
  return caseChanges;
}

async function fetchCaseData(receiptNumber) {
  try {
    const response = await fetch(`${API_BASE}${receiptNumber}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        receiptNumber,
        error: true,
        status: response.status,
        statusText: response.statusText,
        data: null,
      };
    }

    const data = await response.json();
    return {
      receiptNumber,
      error: false,
      status: response.status,
      data,
    };
  } catch (err) {
    return {
      receiptNumber,
      error: true,
      status: 0,
      statusText: err.message,
      data: null,
    };
  }
}

async function fetchAllCases(receiptNumbers) {
  const CONCURRENCY = 3;
  const results = [];

  for (let i = 0; i < receiptNumbers.length; i += CONCURRENCY) {
    const batch = receiptNumbers.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
        batch.map((rn) => fetchCaseData(rn)),
    );
    results.push(...batchResults);
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECEIPT_NUMBERS_FOUND') {
    const {receiptNumbers} = message;

    fetchAllCases(receiptNumbers).then((results) => {
      chrome.storage.local.get(['caseResults'], (stored) => {
        const previousResults = stored.caseResults || [];
        const caseChanges = computeAllChanges(previousResults, results);
        chrome.storage.local.set({
          caseResults: results,
          lastUpdated: Date.now(),
          receiptNumbers,
          caseChanges,
        });
        chrome.action.setBadgeText({text: String(results.length)});
        chrome.action.setBadgeBackgroundColor({color: '#4CAF50'});
      });
    });

    sendResponse({received: true});
    return true;
  }

  if (message.type === 'FETCH_CASES') {
    const {receiptNumbers} = message;
    fetchAllCases(receiptNumbers).then((results) => {
      chrome.storage.local.get(['caseResults'], (stored) => {
        const previousResults = stored.caseResults || [];
        const caseChanges = computeAllChanges(previousResults, results);
        chrome.storage.local.set({
          caseResults: results,
          lastUpdated: Date.now(),
          receiptNumbers,
          caseChanges,
        });
        sendResponse({results});
      });
    });
    return true;
  }

  if (message.type === 'GET_RESULTS') {
    chrome.storage.local.get(['caseResults', 'lastUpdated', 'caseChanges'], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

if (typeof module !== 'undefined') {
  module.exports = {fetchCaseData, fetchAllCases, getChangedPaths, computeAllChanges};
}

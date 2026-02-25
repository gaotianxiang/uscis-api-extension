document.addEventListener('DOMContentLoaded', () => {
  loadResults();

  document.getElementById('refreshBtn').addEventListener('click', refreshCases);
  document.getElementById('expandAllBtn').addEventListener('click', () => toggleAll(true));
  document.getElementById('collapseAllBtn').addEventListener('click', () => toggleAll(false));
});

function loadResults() {
  chrome.storage.local.get(['caseResults', 'lastUpdated'], (data) => {
    const { caseResults, lastUpdated } = data;

    if (!caseResults || caseResults.length === 0) {
      showEmptyState();
      return;
    }

    document.getElementById('cases-container').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    renderCases(caseResults);
    updateTimestamp(lastUpdated);
    document.getElementById('status').textContent =
      `Found ${caseResults.length} case(s)`;
  });
}

function renderCases(cases) {
  const container = document.getElementById('cases-container');
  container.innerHTML = '';

  cases.forEach((caseResult) => {
    const card = createCaseCard(caseResult);
    container.appendChild(card);
  });
}

function createCaseCard(caseResult) {
  const card = document.createElement('div');
  card.className = `case-card ${caseResult.error ? 'error' : 'success'}`;

  const header = document.createElement('div');
  header.className = 'case-header';
  header.innerHTML = `
    <span class="receipt-number">${escapeHtml(caseResult.receiptNumber)}</span>
    <span class="case-status-badge">
      ${caseResult.error
        ? `Error ${caseResult.status}`
        : escapeHtml(extractStatusSummary(caseResult.data))}
    </span>
    <button class="toggle-btn" aria-label="Toggle details">&#x25B6;</button>
  `;

  const body = document.createElement('div');
  body.className = 'case-body collapsed';

  if (caseResult.error) {
    body.innerHTML = `
      <div class="error-message">
        Failed to fetch: ${escapeHtml(caseResult.statusText || 'Unknown error')}
      </div>
    `;
  } else {
    const jsonTree = document.createElement('div');
    jsonTree.className = 'json-tree';
    renderJsonTree(jsonTree, caseResult.data);
    body.appendChild(jsonTree);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const rawToggle = document.createElement('button');
    rawToggle.className = 'btn btn-small';
    rawToggle.textContent = 'Show Raw JSON';
    rawToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const rawEl = body.querySelector('.raw-json');
      const isHidden = rawEl.classList.toggle('hidden');
      rawToggle.textContent = isHidden ? 'Show Raw JSON' : 'Hide Raw JSON';
    });
    btnRow.appendChild(rawToggle);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-small';
    copyBtn.textContent = 'Copy JSON';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(JSON.stringify(caseResult.data, null, 2));
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
    });
    btnRow.appendChild(copyBtn);

    body.appendChild(btnRow);

    const rawJson = document.createElement('pre');
    rawJson.className = 'raw-json hidden';
    rawJson.textContent = JSON.stringify(caseResult.data, null, 2);
    body.appendChild(rawJson);
  }

  header.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    const btn = header.querySelector('.toggle-btn');
    btn.innerHTML = body.classList.contains('collapsed') ? '&#x25B6;' : '&#x25BC;';
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function extractStatusSummary(data) {
  return data?.caseStatus
    || data?.currentStatus
    || data?.status
    || data?.formType
    || 'View Details';
}

function renderJsonTree(container, obj, depth) {
  if (depth === undefined) depth = 0;

  if (obj === null || obj === undefined) {
    const span = document.createElement('span');
    span.className = 'json-null';
    span.textContent = 'null';
    container.appendChild(span);
    return;
  }

  if (typeof obj !== 'object') {
    const span = document.createElement('span');
    if (typeof obj === 'string') {
      span.className = 'json-string';
      span.textContent = `"${obj}"`;
    } else if (typeof obj === 'number') {
      span.className = 'json-number';
      span.textContent = String(obj);
    } else if (typeof obj === 'boolean') {
      span.className = 'json-boolean';
      span.textContent = String(obj);
    } else {
      span.className = 'json-value';
      span.textContent = String(obj);
    }
    container.appendChild(span);
    return;
  }

  const isArray = Array.isArray(obj);
  const entries = Object.entries(obj);

  if (entries.length === 0) {
    const span = document.createElement('span');
    span.textContent = isArray ? '[]' : '{}';
    container.appendChild(span);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'json-list';

  entries.forEach(([key, value]) => {
    const li = document.createElement('li');

    const keySpan = document.createElement('span');
    keySpan.className = 'json-key';
    keySpan.textContent = isArray ? `[${key}]` : `"${key}"`;
    li.appendChild(keySpan);

    li.appendChild(document.createTextNode(': '));

    const valueContainer = document.createElement('span');
    renderJsonTree(valueContainer, value, depth + 1);
    li.appendChild(valueContainer);

    list.appendChild(li);
  });

  container.appendChild(list);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
}

function toggleAll(expand) {
  document.querySelectorAll('.case-body').forEach((body) => {
    if (expand) {
      body.classList.remove('collapsed');
    } else {
      body.classList.add('collapsed');
    }
  });
  document.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.innerHTML = expand ? '&#x25BC;' : '&#x25B6;';
  });
}

function refreshCases() {
  document.getElementById('status').textContent = 'Refreshing...';
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'RE_EXTRACT' }, () => {
        if (chrome.runtime.lastError) {
          // Content script not available on this tab
          document.getElementById('status').textContent =
            'Navigate to my.uscis.gov/account/applicant first';
        }
      });
    }
  });
  setTimeout(loadResults, 3000);
}

function updateTimestamp(ts) {
  if (!ts) return;
  const el = document.getElementById('last-updated');
  el.textContent = `Last updated: ${new Date(ts).toLocaleString()}`;
}

function showEmptyState() {
  document.getElementById('cases-container').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('status').textContent = 'No cases loaded';
}

if (typeof module !== 'undefined') {
  module.exports = {
    extractStatusSummary,
    escapeHtml,
    renderJsonTree,
    createCaseCard,
    renderCases,
    toggleAll,
    updateTimestamp,
    showEmptyState,
  };
}

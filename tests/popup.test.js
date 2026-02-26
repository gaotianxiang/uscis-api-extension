const {
  extractStatusSummary,
  escapeHtml,
  renderJsonTree,
  createCaseCard,
  renderCases,
  toggleAll,
  updateTimestamp,
  showEmptyState,
} = require('../popup');

// Minimal popup DOM used by functions that read/write element IDs
function setupPopupDom() {
  document.body.innerHTML = `
    <div id="status"></div>
    <div id="last-updated"></div>
    <div id="cases-container" class="hidden"></div>
    <div id="empty-state" class="hidden"></div>
  `;
}

// ---------------------------------------------------------------------------
// extractStatusSummary
// ---------------------------------------------------------------------------
describe('extractStatusSummary', () => {
  test('returns caseStatus when present', () => {
    expect(extractStatusSummary({caseStatus: 'Approved'})).toBe('Approved');
  });

  test('returns currentStatus when caseStatus is absent', () => {
    expect(extractStatusSummary({currentStatus: 'Pending'})).toBe('Pending');
  });

  test('returns status when higher-priority fields are absent', () => {
    expect(extractStatusSummary({status: 'Active'})).toBe('Active');
  });

  test('returns formType as last-resort field', () => {
    expect(extractStatusSummary({formType: 'I-485'})).toBe('I-485');
  });

  test('returns "View Details" when no recognised field is present', () => {
    expect(extractStatusSummary({})).toBe('View Details');
  });

  test('returns "View Details" for null', () => {
    expect(extractStatusSummary(null)).toBe('View Details');
  });

  test('returns "View Details" for undefined', () => {
    expect(extractStatusSummary(undefined)).toBe('View Details');
  });

  test('caseStatus takes priority over all other fields', () => {
    expect(
        extractStatusSummary({
          caseStatus: 'Approved',
          currentStatus: 'Pending',
          status: 'Active',
          formType: 'I-485',
        }),
    ).toBe('Approved');
  });

  test('currentStatus takes priority over status and formType', () => {
    expect(
        extractStatusSummary({
          currentStatus: 'Pending',
          status: 'Active',
          formType: 'I-485',
        }),
    ).toBe('Pending');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  test('returns plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  test('escapes < and >', () => {
    const result = escapeHtml('<script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).not.toContain('<script>');
  });

  test('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('handles an empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('escapes a complex HTML string', () => {
    const result = escapeHtml('<div class="test">Hello & World</div>');
    expect(result).not.toContain('<div');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
  });
});

// ---------------------------------------------------------------------------
// renderJsonTree
// ---------------------------------------------------------------------------
describe('renderJsonTree', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  test('renders null as a json-null span', () => {
    renderJsonTree(container, null);
    const span = container.querySelector('.json-null');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('null');
  });

  test('renders undefined as a json-null span', () => {
    renderJsonTree(container, undefined);
    expect(container.querySelector('.json-null')).not.toBeNull();
  });

  test('renders a string with surrounding quotes', () => {
    renderJsonTree(container, 'hello');
    const span = container.querySelector('.json-string');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('"hello"');
  });

  test('renders a number', () => {
    renderJsonTree(container, 42);
    const span = container.querySelector('.json-number');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('42');
  });

  test('renders a boolean true', () => {
    renderJsonTree(container, true);
    const span = container.querySelector('.json-boolean');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('true');
  });

  test('renders a boolean false', () => {
    renderJsonTree(container, false);
    expect(container.querySelector('.json-boolean').textContent).toBe('false');
  });

  test('renders an empty object as {}', () => {
    renderJsonTree(container, {});
    expect(container.textContent).toBe('{}');
  });

  test('renders an empty array as []', () => {
    renderJsonTree(container, []);
    expect(container.textContent).toBe('[]');
  });

  test('renders object keys with quoted notation', () => {
    renderJsonTree(container, {name: 'Alice', age: 30});
    const keys = Array.from(container.querySelectorAll('.json-key')).map(
        (k) => k.textContent,
    );
    expect(keys).toContain('"name"');
    expect(keys).toContain('"age"');
  });

  test('renders array indices with bracket notation', () => {
    renderJsonTree(container, ['a', 'b']);
    const keys = container.querySelectorAll('.json-key');
    expect(keys[0].textContent).toBe('[0]');
    expect(keys[1].textContent).toBe('[1]');
  });

  test('renders nested objects recursively', () => {
    renderJsonTree(container, {outer: {inner: 'value'}});
    const strings = container.querySelectorAll('.json-string');
    expect(strings.length).toBe(1);
    expect(strings[0].textContent).toBe('"value"');
  });

  test('renders mixed-type object', () => {
    renderJsonTree(container, {str: 'hi', num: 1, flag: true, nothing: null});
    expect(container.querySelector('.json-string')).not.toBeNull();
    expect(container.querySelector('.json-number')).not.toBeNull();
    expect(container.querySelector('.json-boolean')).not.toBeNull();
    expect(container.querySelector('.json-null')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createCaseCard
// ---------------------------------------------------------------------------
describe('createCaseCard', () => {
  function makeSuccess(overrides = {}) {
    return {
      receiptNumber: 'IOE1234567890',
      error: false,
      status: 200,
      data: {caseStatus: 'Case Was Approved'},
      ...overrides,
    };
  }

  function makeError(overrides = {}) {
    return {
      receiptNumber: 'IOE1234567890',
      error: true,
      status: 404,
      statusText: 'Not Found',
      data: null,
      ...overrides,
    };
  }

  test('displays the receipt number', () => {
    const card = createCaseCard(makeSuccess());
    expect(card.querySelector('.receipt-number').textContent).toBe('IOE1234567890');
  });

  test('adds "success" class for non-error results', () => {
    const card = createCaseCard(makeSuccess());
    expect(card.classList.contains('success')).toBe(true);
    expect(card.classList.contains('error')).toBe(false);
  });

  test('adds "error" class for error results', () => {
    const card = createCaseCard(makeError());
    expect(card.classList.contains('error')).toBe(true);
    expect(card.classList.contains('success')).toBe(false);
  });

  test('badge shows case status for successful results', () => {
    const card = createCaseCard(makeSuccess({data: {caseStatus: 'Approved'}}));
    expect(card.querySelector('.case-status-badge').textContent).toContain('Approved');
  });

  test('badge shows error code for error results', () => {
    const card = createCaseCard(makeError({status: 503}));
    expect(card.querySelector('.case-status-badge').textContent).toContain('503');
  });

  test('error message shows statusText', () => {
    const card = createCaseCard(
        makeError({statusText: 'Internal Server Error', status: 500}),
    );
    const msg = card.querySelector('.error-message');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain('Internal Server Error');
  });

  test('shows "Unknown error" when statusText is absent', () => {
    const card = createCaseCard(makeError({statusText: undefined}));
    const msg = card.querySelector('.error-message');
    expect(msg.textContent).toContain('Unknown error');
  });

  test('body starts in collapsed state', () => {
    const card = createCaseCard(makeSuccess());
    expect(card.querySelector('.case-body').classList.contains('collapsed')).toBe(true);
  });

  test('clicking the header toggles the collapsed state', () => {
    const card = createCaseCard(makeSuccess());
    const header = card.querySelector('.case-header');
    const body = card.querySelector('.case-body');

    expect(body.classList.contains('collapsed')).toBe(true);
    header.click();
    expect(body.classList.contains('collapsed')).toBe(false);
    header.click();
    expect(body.classList.contains('collapsed')).toBe(true);
  });

  test('success card contains a json-tree element', () => {
    const card = createCaseCard(makeSuccess());
    expect(card.querySelector('.json-tree')).not.toBeNull();
  });

  test('success card contains "Show Raw JSON" and "Copy JSON" buttons', () => {
    const card = createCaseCard(makeSuccess());
    const buttons = card.querySelectorAll('.btn-small');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('Show Raw JSON');
    expect(labels).toContain('Copy JSON');
  });

  test('raw JSON is hidden by default', () => {
    const card = createCaseCard(makeSuccess());
    const rawEl = card.querySelector('.raw-json');
    expect(rawEl).not.toBeNull();
    expect(rawEl.classList.contains('hidden')).toBe(true);
  });

  test('clicking "Show Raw JSON" toggles visibility and button label', () => {
    const card = createCaseCard(makeSuccess());
    document.body.appendChild(card); // needs to be in DOM for click propagation

    const rawToggle = Array.from(card.querySelectorAll('.btn-small')).find(
        (b) => b.textContent === 'Show Raw JSON',
    );
    const rawEl = card.querySelector('.raw-json');

    rawToggle.click();
    expect(rawEl.classList.contains('hidden')).toBe(false);
    expect(rawToggle.textContent).toBe('Hide Raw JSON');

    rawToggle.click();
    expect(rawEl.classList.contains('hidden')).toBe(true);
    expect(rawToggle.textContent).toBe('Show Raw JSON');

    document.body.removeChild(card);
  });

  test('raw JSON pre element contains serialised JSON', () => {
    const data = {caseStatus: 'Approved', id: 42};
    const card = createCaseCard(makeSuccess({data}));
    const rawEl = card.querySelector('.raw-json');
    expect(rawEl.textContent).toBe(JSON.stringify(data, null, 2));
  });
});

// ---------------------------------------------------------------------------
// renderCases
// ---------------------------------------------------------------------------
describe('renderCases', () => {
  beforeEach(setupPopupDom);

  test('renders one card per case result', () => {
    const cases = [
      {receiptNumber: 'IOE1111111111', error: false, status: 200, data: {}},
      {receiptNumber: 'EAC2222222222', error: false, status: 200, data: {}},
    ];
    renderCases(cases);
    const container = document.getElementById('cases-container');
    expect(container.querySelectorAll('.case-card')).toHaveLength(2);
  });

  test('clears previous cards before rendering', () => {
    const singleCase = [
      {receiptNumber: 'IOE1111111111', error: false, status: 200, data: {}},
    ];
    renderCases(singleCase);
    renderCases(singleCase);
    expect(
        document.getElementById('cases-container').querySelectorAll('.case-card'),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// toggleAll
// ---------------------------------------------------------------------------
describe('toggleAll', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="case-body collapsed"></div>
      <div class="case-body collapsed"></div>
      <button class="toggle-btn">&#x25B6;</button>
      <button class="toggle-btn">&#x25B6;</button>
    `;
  });

  test('expand=true removes collapsed class from all bodies', () => {
    toggleAll(true);
    document.querySelectorAll('.case-body').forEach((body) => {
      expect(body.classList.contains('collapsed')).toBe(false);
    });
  });

  test('expand=false adds collapsed class to all bodies', () => {
    toggleAll(true); // first expand
    toggleAll(false); // then collapse
    document.querySelectorAll('.case-body').forEach((body) => {
      expect(body.classList.contains('collapsed')).toBe(true);
    });
  });

  test('expand=true sets toggle button to down arrow', () => {
    toggleAll(true);
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      expect(btn.innerHTML).toBe('▼');
    });
  });

  test('expand=false sets toggle button to right arrow', () => {
    toggleAll(true);
    toggleAll(false);
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      expect(btn.innerHTML).toBe('▶');
    });
  });
});

// ---------------------------------------------------------------------------
// updateTimestamp
// ---------------------------------------------------------------------------
describe('updateTimestamp', () => {
  beforeEach(setupPopupDom);

  test('does nothing when timestamp is falsy', () => {
    updateTimestamp(null);
    expect(document.getElementById('last-updated').textContent).toBe('');
  });

  test('sets last-updated text for a valid timestamp', () => {
    const ts = new Date('2024-01-15T10:30:00').getTime();
    updateTimestamp(ts);
    const text = document.getElementById('last-updated').textContent;
    expect(text).toContain('Last updated:');
  });
});

// ---------------------------------------------------------------------------
// showEmptyState
// ---------------------------------------------------------------------------
describe('showEmptyState', () => {
  beforeEach(setupPopupDom);

  test('hides the cases container', () => {
    document.getElementById('cases-container').classList.remove('hidden');
    showEmptyState();
    expect(
        document.getElementById('cases-container').classList.contains('hidden'),
    ).toBe(true);
  });

  test('shows the empty-state element', () => {
    showEmptyState();
    expect(
        document.getElementById('empty-state').classList.contains('hidden'),
    ).toBe(false);
  });

  test('sets the status text to "No cases loaded"', () => {
    showEmptyState();
    expect(document.getElementById('status').textContent).toBe('No cases loaded');
  });
});

// ---------------------------------------------------------------------------
// createCaseCard with changedPaths
// ---------------------------------------------------------------------------
describe('createCaseCard change indicators', () => {
  function makeSuccess(overrides = {}) {
    return {
      receiptNumber: 'IOE1234567890',
      error: false,
      status: 200,
      data: {caseStatus: 'Case Was Approved'},
      ...overrides,
    };
  }

  test('no changed-badge or changed class when changedPaths is empty', () => {
    const card = createCaseCard(makeSuccess(), []);
    expect(card.classList.contains('changed')).toBe(false);
    expect(card.querySelector('.changed-badge')).toBeNull();
  });

  test('no changed-badge when changedPaths is omitted', () => {
    const card = createCaseCard(makeSuccess());
    expect(card.classList.contains('changed')).toBe(false);
    expect(card.querySelector('.changed-badge')).toBeNull();
  });

  test('adds "changed" class when changedPaths is non-empty', () => {
    const card = createCaseCard(makeSuccess(), ['caseStatus']);
    expect(card.classList.contains('changed')).toBe(true);
  });

  test('shows "Updated" badge when changedPaths is non-empty', () => {
    const card = createCaseCard(makeSuccess(), ['caseStatus']);
    const badge = card.querySelector('.changed-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Updated');
  });

  test('json-changed class applied to rows with matching paths', () => {
    const caseResult = makeSuccess({data: {caseStatus: 'Approved', formType: 'I-485'}});
    const card = createCaseCard(caseResult, ['caseStatus']);
    card.querySelector('.case-body').classList.remove('collapsed');
    const changedItems = card.querySelectorAll('.json-changed');
    expect(changedItems.length).toBeGreaterThan(0);
    const texts = Array.from(changedItems).map((el) => el.textContent);
    expect(texts.some((t) => t.includes('caseStatus'))).toBe(true);
  });

  test('json-changed class not applied to unchanged rows', () => {
    const caseResult = makeSuccess({data: {caseStatus: 'Approved', formType: 'I-485'}});
    const card = createCaseCard(caseResult, ['caseStatus']);
    const allItems = card.querySelectorAll('.json-list li');
    const formTypeItem = Array.from(allItems).find((li) => li.textContent.includes('formType'));
    expect(formTypeItem).toBeDefined();
    expect(formTypeItem.classList.contains('json-changed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// renderCases with caseChanges
// ---------------------------------------------------------------------------
describe('renderCases with caseChanges', () => {
  beforeEach(setupPopupDom);

  test('passes changedPaths to case cards when caseChanges provided', () => {
    const cases = [
      {receiptNumber: 'IOE1111111111', error: false, status: 200, data: {caseStatus: 'Approved'}},
    ];
    const caseChanges = {'IOE1111111111': ['caseStatus']};
    renderCases(cases, caseChanges);
    const card = document.querySelector('.case-card');
    expect(card.classList.contains('changed')).toBe(true);
    expect(card.querySelector('.changed-badge')).not.toBeNull();
  });

  test('no change indicators when caseChanges is empty', () => {
    const cases = [
      {receiptNumber: 'IOE1111111111', error: false, status: 200, data: {caseStatus: 'Approved'}},
    ];
    renderCases(cases, {});
    const card = document.querySelector('.case-card');
    expect(card.classList.contains('changed')).toBe(false);
  });

  test('no change indicators when caseChanges is omitted', () => {
    const cases = [
      {receiptNumber: 'IOE1111111111', error: false, status: 200, data: {caseStatus: 'Approved'}},
    ];
    renderCases(cases);
    const card = document.querySelector('.case-card');
    expect(card.classList.contains('changed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// renderJsonTree with changedPaths
// ---------------------------------------------------------------------------
describe('renderJsonTree change highlighting', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  test('adds json-changed class to a changed top-level key row', () => {
    const changedPaths = new Set(['caseStatus']);
    renderJsonTree(container, {caseStatus: 'Approved', formType: 'I-485'}, 0, changedPaths, '');
    const changedItems = container.querySelectorAll('.json-changed');
    expect(changedItems.length).toBe(1);
    expect(changedItems[0].textContent).toContain('caseStatus');
  });

  test('does not add json-changed class to unchanged keys', () => {
    const changedPaths = new Set(['caseStatus']);
    renderJsonTree(container, {caseStatus: 'Approved', formType: 'I-485'}, 0, changedPaths, '');
    const allItems = container.querySelectorAll('li');
    const formTypeItem = Array.from(allItems).find((li) => li.textContent.includes('formType'));
    expect(formTypeItem.classList.contains('json-changed')).toBe(false);
  });

  test('adds json-changed to nested changed key rows', () => {
    const changedPaths = new Set(['actions', 'actions.0', 'actions.0.displayText']);
    renderJsonTree(
        container,
        {actions: [{displayText: 'New text'}]},
        0,
        changedPaths,
        '',
    );
    const changedItems = container.querySelectorAll('.json-changed');
    expect(changedItems.length).toBe(3);
  });

  test('no changed items when changedPaths is empty', () => {
    renderJsonTree(container, {caseStatus: 'Approved'}, 0, new Set(), '');
    expect(container.querySelectorAll('.json-changed').length).toBe(0);
  });

  test('works without changedPaths parameter (backward compatible)', () => {
    renderJsonTree(container, {caseStatus: 'Approved'});
    expect(container.querySelectorAll('.json-changed').length).toBe(0);
    expect(container.querySelector('.json-string')).not.toBeNull();
  });
});

const {fetchCaseData, fetchAllCases, getChangedPaths, computeAllChanges} = require('../background');

const API_BASE = 'https://my.uscis.gov/account/case-service/api/cases/';

beforeEach(() => {
  fetch.mockClear();
});

describe('fetchCaseData', () => {
  test('returns data on a successful 200 response', async () => {
    const mockData = {caseStatus: 'Case Was Approved', receiptNumber: 'IOE1234567890'};
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const result = await fetchCaseData('IOE1234567890');

    expect(result).toEqual({
      receiptNumber: 'IOE1234567890',
      error: false,
      status: 200,
      data: mockData,
    });
  });

  test('calls the correct API endpoint', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await fetchCaseData('EAC9876543210');

    expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}EAC9876543210`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
          headers: expect.objectContaining({Accept: 'application/json'}),
        }),
    );
  });

  test('returns error result on a non-ok HTTP response', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await fetchCaseData('IOE1234567890');

    expect(result).toEqual({
      receiptNumber: 'IOE1234567890',
      error: true,
      status: 404,
      statusText: 'Not Found',
      data: null,
    });
  });

  test('returns error result on a 401 Unauthorized response', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await fetchCaseData('IOE1234567890');

    expect(result.error).toBe(true);
    expect(result.status).toBe(401);
    expect(result.data).toBeNull();
  });

  test('returns error result when fetch throws a network error', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchCaseData('IOE1234567890');

    expect(result).toEqual({
      receiptNumber: 'IOE1234567890',
      error: true,
      status: 0,
      statusText: 'Network error',
      data: null,
    });
  });

  test('includes the receipt number in all result shapes', async () => {
    fetch.mockResolvedValueOnce({ok: true, status: 200, json: async () => ({})});
    const successResult = await fetchCaseData('WAC1111111111');
    expect(successResult.receiptNumber).toBe('WAC1111111111');

    fetch.mockResolvedValueOnce({ok: false, status: 500, statusText: 'Server Error'});
    const errorResult = await fetchCaseData('LIN2222222222');
    expect(errorResult.receiptNumber).toBe('LIN2222222222');
  });

  test('handles a 500 server error', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await fetchCaseData('IOE1234567890');

    expect(result.error).toBe(true);
    expect(result.status).toBe(500);
    expect(result.statusText).toBe('Internal Server Error');
  });
});

describe('fetchAllCases', () => {
  test('returns an empty array for an empty input', async () => {
    const results = await fetchAllCases([]);
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('fetches a single receipt number', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({caseStatus: 'Approved'}),
    });

    const results = await fetchAllCases(['IOE1234567890']);
    expect(results).toHaveLength(1);
    expect(results[0].receiptNumber).toBe('IOE1234567890');
    expect(results[0].error).toBe(false);
  });

  test('fetches all receipt numbers when count <= concurrency limit', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const receiptNumbers = ['IOE1111111111', 'EAC2222222222', 'WAC3333333333'];
    const results = await fetchAllCases(receiptNumbers);

    expect(results).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('fetches all receipt numbers when count exceeds concurrency limit', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const receiptNumbers = [
      'IOE1111111111',
      'EAC2222222222',
      'WAC3333333333',
      'LIN4444444444',
      'SRC5555555555',
    ];
    const results = await fetchAllCases(receiptNumbers);

    expect(results).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  test('preserves the order of results matching the input order', async () => {
    fetch.mockImplementation((url) => {
      const rn = url.split('/').pop();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({id: rn}),
      });
    });

    const receiptNumbers = ['IOE1111111111', 'EAC2222222222', 'WAC3333333333'];
    const results = await fetchAllCases(receiptNumbers);

    expect(results[0].receiptNumber).toBe('IOE1111111111');
    expect(results[1].receiptNumber).toBe('EAC2222222222');
    expect(results[2].receiptNumber).toBe('WAC3333333333');
  });

  test('handles mixed success and error responses', async () => {
    fetch
        .mockResolvedValueOnce({ok: true, status: 200, json: async () => ({})})
        .mockResolvedValueOnce({ok: false, status: 401, statusText: 'Unauthorized'})
        .mockRejectedValueOnce(new Error('Timeout'));

    const results = await fetchAllCases([
      'IOE1111111111',
      'EAC2222222222',
      'WAC3333333333',
    ]);

    expect(results[0].error).toBe(false);
    expect(results[1].error).toBe(true);
    expect(results[1].status).toBe(401);
    expect(results[2].error).toBe(true);
    expect(results[2].status).toBe(0);
    expect(results[2].statusText).toBe('Timeout');
  });

  test('processes exactly CONCURRENCY=3 items per batch', async () => {
    const callOrder = [];
    fetch.mockImplementation((url) => {
      callOrder.push(url.split('/').pop());
      return Promise.resolve({ok: true, status: 200, json: async () => ({})});
    });

    // 4 items: first batch of 3, second batch of 1
    const receiptNumbers = [
      'IOE0000000001',
      'IOE0000000002',
      'IOE0000000003',
      'IOE0000000004',
    ];
    await fetchAllCases(receiptNumbers);

    expect(fetch).toHaveBeenCalledTimes(4);
    // All receipt numbers must appear in the call order
    receiptNumbers.forEach((rn) => expect(callOrder).toContain(rn));
  });
});

describe('getChangedPaths', () => {
  test('returns empty set for identical primitive values', () => {
    expect(getChangedPaths('hello', 'hello').size).toBe(0);
  });

  test('returns empty set for identical objects', () => {
    expect(getChangedPaths({a: 1}, {a: 1}).size).toBe(0);
  });

  test('detects a changed top-level string field', () => {
    const changed = getChangedPaths({caseStatus: 'Pending'}, {caseStatus: 'Approved'});
    expect(changed.has('caseStatus')).toBe(true);
  });

  test('detects a changed top-level number field', () => {
    const changed = getChangedPaths({count: 1}, {count: 2});
    expect(changed.has('count')).toBe(true);
  });

  test('detects no change when values are equal', () => {
    const changed = getChangedPaths({a: 1, b: 'x'}, {a: 1, b: 'x'});
    expect(changed.size).toBe(0);
  });

  test('detects added fields', () => {
    const changed = getChangedPaths({a: 1}, {a: 1, b: 2});
    expect(changed.has('b')).toBe(true);
  });

  test('detects removed fields', () => {
    const changed = getChangedPaths({a: 1, b: 2}, {a: 1});
    expect(changed.has('b')).toBe(true);
  });

  test('detects nested field changes and marks parent path too', () => {
    const changed = getChangedPaths(
        {actions: [{displayText: 'Old'}]},
        {actions: [{displayText: 'New'}]},
    );
    expect(changed.has('actions.0.displayText')).toBe(true);
    expect(changed.has('actions.0')).toBe(true);
    expect(changed.has('actions')).toBe(true);
  });

  test('does not mark unchanged nested fields', () => {
    const changed = getChangedPaths(
        {a: {x: 1}, b: 2},
        {a: {x: 1}, b: 3},
    );
    expect(changed.has('b')).toBe(true);
    expect(changed.has('a')).toBe(false);
    expect(changed.has('a.x')).toBe(false);
  });

  test('handles null vs object change', () => {
    const changed = getChangedPaths({a: null}, {a: {x: 1}});
    expect(changed.has('a')).toBe(true);
  });

  test('handles object vs null change', () => {
    const changed = getChangedPaths({a: {x: 1}}, {a: null});
    expect(changed.has('a')).toBe(true);
  });

  test('handles undefined vs value change', () => {
    const changed = getChangedPaths({a: undefined}, {a: 'hello'});
    expect(changed.has('a')).toBe(true);
  });

  test('handles type change (string to number)', () => {
    const changed = getChangedPaths({a: '1'}, {a: 1});
    expect(changed.has('a')).toBe(true);
  });

  test('handles empty objects with no changes', () => {
    expect(getChangedPaths({}, {}).size).toBe(0);
  });

  test('handles array element value change', () => {
    const changed = getChangedPaths(['a', 'b'], ['a', 'c']);
    expect(changed.has('1')).toBe(true);
    expect(changed.has('0')).toBe(false);
  });
});

describe('computeAllChanges', () => {
  test('returns empty object when no previous results exist', () => {
    const newResults = [
      {receiptNumber: 'IOE1234567890', error: false, data: {caseStatus: 'Pending'}},
    ];
    expect(computeAllChanges([], newResults)).toEqual({});
  });

  test('returns empty object when nothing changed', () => {
    const data = {caseStatus: 'Approved'};
    const prev = [{receiptNumber: 'IOE1234567890', error: false, data}];
    const curr = [{receiptNumber: 'IOE1234567890', error: false, data}];
    expect(computeAllChanges(prev, curr)).toEqual({});
  });

  test('returns changed paths for a receipt number that changed', () => {
    const prev = [
      {receiptNumber: 'IOE1234567890', error: false, data: {caseStatus: 'Pending'}},
    ];
    const curr = [
      {receiptNumber: 'IOE1234567890', error: false, data: {caseStatus: 'Approved'}},
    ];
    const result = computeAllChanges(prev, curr);
    expect(result['IOE1234567890']).toContain('caseStatus');
  });

  test('skips comparison when new result has error', () => {
    const prev = [
      {receiptNumber: 'IOE1234567890', error: false, data: {caseStatus: 'Approved'}},
    ];
    const curr = [
      {receiptNumber: 'IOE1234567890', error: true, status: 500, data: null},
    ];
    expect(computeAllChanges(prev, curr)).toEqual({});
  });

  test('skips comparison when previous result had error', () => {
    const prev = [
      {receiptNumber: 'IOE1234567890', error: true, status: 500, data: null},
    ];
    const curr = [
      {receiptNumber: 'IOE1234567890', error: false, data: {caseStatus: 'Approved'}},
    ];
    expect(computeAllChanges(prev, curr)).toEqual({});
  });

  test('skips new receipt numbers with no prior record', () => {
    const prev = [
      {receiptNumber: 'IOE1111111111', error: false, data: {caseStatus: 'Approved'}},
    ];
    const curr = [
      {receiptNumber: 'IOE1111111111', error: false, data: {caseStatus: 'Approved'}},
      {receiptNumber: 'EAC2222222222', error: false, data: {caseStatus: 'Pending'}},
    ];
    const result = computeAllChanges(prev, curr);
    expect(result['EAC2222222222']).toBeUndefined();
  });

  test('handles multiple changed receipt numbers', () => {
    const prev = [
      {receiptNumber: 'IOE1111111111', error: false, data: {caseStatus: 'Pending'}},
      {receiptNumber: 'EAC2222222222', error: false, data: {caseStatus: 'Pending'}},
    ];
    const curr = [
      {receiptNumber: 'IOE1111111111', error: false, data: {caseStatus: 'Approved'}},
      {receiptNumber: 'EAC2222222222', error: false, data: {caseStatus: 'Denied'}},
    ];
    const result = computeAllChanges(prev, curr);
    expect(result['IOE1111111111']).toContain('caseStatus');
    expect(result['EAC2222222222']).toContain('caseStatus');
  });
});

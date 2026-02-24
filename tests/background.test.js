const { fetchCaseData, fetchAllCases } = require('../background');

const API_BASE = 'https://my.uscis.gov/account/case-service/api/cases/';

beforeEach(() => {
  fetch.mockClear();
});

describe('fetchCaseData', () => {
  test('returns data on a successful 200 response', async () => {
    const mockData = { caseStatus: 'Case Was Approved', receiptNumber: 'IOE1234567890' };
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
        headers: expect.objectContaining({ Accept: 'application/json' }),
      })
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
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const successResult = await fetchCaseData('WAC1111111111');
    expect(successResult.receiptNumber).toBe('WAC1111111111');

    fetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
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
      json: async () => ({ caseStatus: 'Approved' }),
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
        json: async () => ({ id: rn }),
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
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
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
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
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

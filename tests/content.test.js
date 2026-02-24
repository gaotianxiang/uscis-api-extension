// Must be called before requiring content.js so that the module-level main()
// call does not spin up real timers.
jest.useFakeTimers();

const { extractReceiptNumbers, waitForContent, RECEIPT_REGEX } = require('../content');

describe('RECEIPT_REGEX', () => {
  test('matches all valid prefixes', () => {
    const prefixes = ['IOE', 'EAC', 'WAC', 'LIN', 'SRC', 'NBC', 'MSC', 'YSC', 'MCT'];
    prefixes.forEach((prefix) => {
      const num = `${prefix}1234567890`;
      expect(num.match(RECEIPT_REGEX)).not.toBeNull();
    });
  });

  test('does not match unknown prefix', () => {
    expect('ABC1234567890'.match(RECEIPT_REGEX)).toBeNull();
  });

  test('requires exactly 10 digits', () => {
    expect('IOE123456789'.match(RECEIPT_REGEX)).toBeNull();   // 9 digits
    expect('IOE1234567890'.match(RECEIPT_REGEX)).not.toBeNull(); // 10 digits
    // 11-digit string: word boundary prevents a match of IOE + first 10 chars
    expect('IOE12345678901'.match(RECEIPT_REGEX)).toBeNull();
  });
});

describe('extractReceiptNumbers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('returns empty array when no receipt numbers are present', () => {
    document.body.innerHTML = '<p>No receipt numbers here</p>';
    expect(extractReceiptNumbers()).toEqual([]);
  });

  test.each([
    ['IOE', 'IOE1234567890'],
    ['EAC', 'EAC1234567890'],
    ['WAC', 'WAC1234567890'],
    ['LIN', 'LIN1234567890'],
    ['SRC', 'SRC1234567890'],
    ['NBC', 'NBC1234567890'],
    ['MSC', 'MSC1234567890'],
    ['YSC', 'YSC1234567890'],
    ['MCT', 'MCT1234567890'],
  ])('recognises %s prefix', (_prefix, receiptNumber) => {
    document.body.innerHTML = `<p>${receiptNumber}</p>`;
    expect(extractReceiptNumbers()).toContain(receiptNumber);
  });

  test('extracts multiple different receipt numbers', () => {
    document.body.innerHTML = '<p>IOE1234567890 and EAC9876543210</p>';
    const result = extractReceiptNumbers();
    expect(result).toHaveLength(2);
    expect(result).toContain('IOE1234567890');
    expect(result).toContain('EAC9876543210');
  });

  test('deduplicates repeated receipt numbers', () => {
    document.body.innerHTML = '<p>IOE1234567890 and IOE1234567890 again</p>';
    const result = extractReceiptNumbers();
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('IOE1234567890');
  });

  test('returns results in sorted (ascending) order', () => {
    document.body.innerHTML = '<p>WAC1234567890 IOE1234567890 EAC1234567890</p>';
    expect(extractReceiptNumbers()).toEqual([
      'EAC1234567890',
      'IOE1234567890',
      'WAC1234567890',
    ]);
  });

  test('does not match unknown prefixes', () => {
    document.body.innerHTML = '<p>ABC1234567890 XYZ9876543210</p>';
    expect(extractReceiptNumbers()).toEqual([]);
  });

  test('does not match fewer than 10 digits', () => {
    document.body.innerHTML = '<p>IOE123456789</p>';
    expect(extractReceiptNumbers()).toEqual([]);
  });

  test('does not match more than 10 digits (word boundary)', () => {
    document.body.innerHTML = '<p>IOE12345678901</p>';
    expect(extractReceiptNumbers()).toEqual([]);
  });

  test('extracts receipt numbers from nested HTML elements', () => {
    document.body.innerHTML =
      '<div><p>Case: <strong>IOE1234567890</strong></p></div>';
    expect(extractReceiptNumbers()).toContain('IOE1234567890');
  });

  test('handles empty page body', () => {
    document.body.innerHTML = '';
    expect(extractReceiptNumbers()).toEqual([]);
  });
});

describe('waitForContent', () => {
  afterEach(() => {
    jest.clearAllTimers();
    document.body.innerHTML = '';
  });

  test('resolves immediately when receipt numbers are already present', async () => {
    document.body.innerHTML = '<p>IOE1234567890</p>';
    const result = await waitForContent(5, 100);
    expect(result).toContain('IOE1234567890');
  });

  test('resolves with empty array after exhausting maxAttempts', async () => {
    document.body.innerHTML = '<p>No receipt numbers</p>';
    const promise = waitForContent(3, 100);
    // Drain all pending timers from this call (3 intervals max)
    jest.runAllTimers();
    const result = await promise;
    expect(result).toEqual([]);
  });

  test('resolves when receipt numbers appear between polling intervals', async () => {
    document.body.innerHTML = '<p>No receipt numbers yet</p>';
    const promise = waitForContent(5, 100);

    // First synchronous check found nothing; advance one interval
    jest.advanceTimersByTime(100);
    // Now add a receipt number before the next check fires
    document.body.innerHTML = '<p>IOE1234567890</p>';
    jest.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toContain('IOE1234567890');
  });

  test('returns multiple receipt numbers found at first check', async () => {
    document.body.innerHTML = '<p>IOE1234567890 EAC9876543210</p>';
    const result = await waitForContent(5, 100);
    expect(result).toHaveLength(2);
  });
});

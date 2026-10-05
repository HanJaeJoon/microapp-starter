import { formatCurrency, resolveTargetCurrency } from '../currency';

describe('resolveTargetCurrency', () => {
  it('기기 통화 코드를 대문자로 반환한다', () => {
    expect(resolveTargetCurrency('KRW')).toBe('KRW');
    expect(resolveTargetCurrency('jpy')).toBe('JPY');
    expect(resolveTargetCurrency('EUR')).toBe('EUR');
  });

  it('USD면 환산이 불필요하므로 null을 반환한다', () => {
    expect(resolveTargetCurrency('USD')).toBeNull();
    expect(resolveTargetCurrency('usd')).toBeNull();
  });

  it('통화 코드가 없거나 형식이 잘못되면 null을 반환한다', () => {
    expect(resolveTargetCurrency(null)).toBeNull();
    expect(resolveTargetCurrency(undefined)).toBeNull();
    expect(resolveTargetCurrency('')).toBeNull();
    expect(resolveTargetCurrency('WON')).toBe('WON'); // 3글자 알파벳이면 그대로 신뢰
    expect(resolveTargetCurrency('12$')).toBeNull();
    expect(resolveTargetCurrency('EURO')).toBeNull();
  });
});

describe('formatCurrency', () => {
  it('locale 표기법으로 USD 통화를 소수 2자리까지 표시한다', () => {
    const ko = formatCurrency(1234.5, 'ko');
    expect(ko).toContain('1,234.50');
    expect(ko).toMatch(/US?\$/);

    expect(formatCurrency(1234.5, 'en')).toBe('$1,234.50');

    const de = formatCurrency(1234.5, 'de');
    expect(de).toContain('1.234,50');
    expect(de).toContain('$');
  });

  it('통화를 지정하면 해당 통화로 표시한다', () => {
    expect(formatCurrency(1234.5, 'en', 'EUR')).toContain('1,234.50');
    expect(formatCurrency(1234.5, 'en', 'EUR')).toContain('€');
  });
});

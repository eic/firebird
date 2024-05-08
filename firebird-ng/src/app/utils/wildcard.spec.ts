import { wildCardCheck } from './wildcard';

describe('wildCardCheck', () => {
  it('should match exactly without wildcards', () => {
    expect(wildCardCheck('hello', 'hello')).toBeTruthy();
  });

  it('should return false when patterns do not match', () => {
    expect(wildCardCheck('world', 'hello')).toBeFalsy();
  });

  it('should match a single character wildcard ?', () => {
    expect(wildCardCheck('hello', 'h?llo')).toBeTruthy();
    expect(wildCardCheck('hallo', 'h?llo')).toBeTruthy();
  });

  it('should match any sequence with *', () => {
    expect(wildCardCheck('hello', 'he*o')).toBeTruthy();
    expect(wildCardCheck('heooo', 'he*o')).toBeTruthy();
  });

  it('should match with multiple wildcards', () => {
    expect(wildCardCheck('hello', '*o')).toBeTruthy();
    expect(wildCardCheck('ho', 'h*o')).toBeTruthy();
    expect(wildCardCheck('abcde', 'a*c*e')).toBeTruthy();
  });

  it('should match with wildcards at both ends', () => {
    expect(wildCardCheck('xxhelloxx', '*hello*')).toBeTruthy();
  });

  it('should handle empty strings and wildcards correctly', () => {
    expect(wildCardCheck('', '*')).toBeTruthy();
    expect(wildCardCheck('', 'a*')).toBeFalsy();
    expect(wildCardCheck('', '')).toBeTruthy();
    expect(wildCardCheck('a', '')).toBeFalsy();
  });

  it('should match with complex patterns', () => {
    expect(wildCardCheck('axxbxxcxxdxe', 'a?*b*c*d*e*')).toBeTruthy();
  });
});

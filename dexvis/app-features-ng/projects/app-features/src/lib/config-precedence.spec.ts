/**
 * ONE config key round-trips all five sources, and the precedence
 * `defaults < server < localStorage < URL < runtime` holds at every step.
 *
 * Layer semantics verified on the way:
 * - URL (session) values are never persisted to localStorage,
 * - a runtime write persists AND clears the session override,
 * - pending layers apply when a key is declared after its source arrived.
 */
import { ConfigService } from './config.service';

const KEY = 'spec.precedence.key';

function freshService(): ConfigService {
  return new ConfigService();
}

describe('Config precedence: defaults < server < localStorage < URL < runtime', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(`${KEY}.time`);
  });

  it('1. code default applies when no other source exists', () => {
    const service = freshService();
    const property = service.declare({ key: KEY, default: 'v-default', label: 'Precedence probe' });
    expect(property.value).toBe('v-default');
    expect(property.valueSignal()).toBe('v-default');
  });

  it('2. server value beats the default', () => {
    const service = freshService();
    const property = service.declare({ key: KEY, default: 'v-default' });
    service.applyServerValue(KEY, 'v-server');
    expect(property.value).toBe('v-server');
  });

  it('2a. server value also applies when it arrives BEFORE declaration (pending layer)', () => {
    const service = freshService();
    service.applyServerValue(KEY, 'v-server');
    const property = service.declare({ key: KEY, default: 'v-default' });
    expect(property.value).toBe('v-server');
  });

  it('3. localStorage (a previous session\'s user choice) beats the server value', () => {
    localStorage.setItem(KEY, 'v-stored');
    const service = freshService();
    const property = service.declare({ key: KEY, default: 'v-default' });
    service.applyServerValue(KEY, 'v-server');
    expect(property.value).toBe('v-stored');
  });

  it('4. URL session value beats localStorage — without being persisted', () => {
    localStorage.setItem(KEY, 'v-stored');
    const service = freshService();
    const property = service.declare({ key: KEY, default: 'v-default' });
    service.applyServerValue(KEY, 'v-server');
    service.applySessionValue(KEY, 'v-url');
    expect(property.value).toBe('v-url');
    // The shared link must not poison saved preferences:
    expect(localStorage.getItem(KEY)).toBe('v-stored');
  });

  it('5. runtime write beats the URL value, persists, and ends the session override', () => {
    localStorage.setItem(KEY, 'v-stored');
    const service = freshService();
    const property = service.declare({ key: KEY, default: 'v-default' });
    service.applyServerValue(KEY, 'v-server');
    service.applySessionValue(KEY, 'v-url');
    property.setValue('v-runtime');
    expect(property.value).toBe('v-runtime');
    expect(localStorage.getItem(KEY)).toBe('v-runtime');
    expect(property.hasSessionOverride).toBe(false);
  });

  it('feature defaults (withConfigDefaults) replace the code default but lose to everything else', () => {
    const service = freshService();
    service.applyFeatureDefaults({ [KEY]: 'v-pack' });
    const property = service.declare({ key: KEY, default: 'v-default' });
    expect(property.value).toBe('v-pack');
    service.applyServerValue(KEY, 'v-server');
    expect(property.value).toBe('v-server');
  });

  it('coerces URL strings to the declared type', () => {
    const numKey = `${KEY}.num`;
    localStorage.removeItem(numKey);
    localStorage.removeItem(`${numKey}.time`);
    const service = freshService();
    const property = service.declare({ key: numKey, default: 42 });
    service.applySessionValue(numKey, '7');
    expect(property.value).toBe(7);
  });

  it('one canonical instance per key: addConfig returns the existing property', () => {
    const service = freshService();
    const first = service.declare({ key: KEY, default: 'a' });
    const second = service.getConfigOrCreate(KEY, 'b');
    expect(second).toBe(first);
  });
});

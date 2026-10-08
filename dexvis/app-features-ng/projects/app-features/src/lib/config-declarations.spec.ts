/**
 * How declarations of one key interact: the first declaration decides the
 * default and validator, a disagreeing later one warns (development builds),
 * a placeholder is upgraded by the first real declaration, and the storage
 * prefix applies to every property the service creates.
 */
import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { ConfigProperty } from './config-property';
import { isPersistableUrl } from './validators';
import { appFeatures, withConfigStorage } from './features';

const KEYS = ['spec.decl.a', 'spec.decl.b', 'spec.decl.url', 'spec.decl.typed', 'spec.decl.pack'];

function clearKeys(prefix = ''): void {
  for (const key of KEYS) {
    localStorage.removeItem(prefix + key);
    localStorage.removeItem(`${prefix}${key}.time`);
  }
}

describe('ConfigService declarations', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearKeys();
    clearKeys('myapp.');
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('repeated declarations', () => {
    it('stay silent when they agree', () => {
      const service = new ConfigService();
      const validator = (value: string) => value.length < 10;
      const first = service.declare({ key: 'spec.decl.a', default: 'x', validator });
      const second = service.declare({ key: 'spec.decl.a', default: 'x', validator, label: 'A' });
      const third = service.getConfigOrCreate('spec.decl.a', 'x');
      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(first.meta?.label).toBe('A');
      expect(warn).not.toHaveBeenCalled();
    });

    it('treat inline validators with the same source as the same', () => {
      const service = new ConfigService();
      service.declare({ key: 'spec.decl.a', default: 'x', validator: (value: string) => value !== 'bad' });
      service.declare({ key: 'spec.decl.a', default: 'x', validator: (value: string) => value !== 'bad' });
      expect(warn).not.toHaveBeenCalled();
    });

    it('warn on a different default and keep the first one', () => {
      const service = new ConfigService();
      const first = service.declare({ key: 'spec.decl.a', default: '0-5' });
      const again = service.getConfigOrCreate('spec.decl.a', '0');
      expect(again).toBe(first);
      expect(again.value).toBe('0-5');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("'spec.decl.a'");
    });

    it('warn when a later declaration brings a validator the first one lacked', () => {
      const service = new ConfigService();
      const first = service.addConfig(new ConfigProperty('spec.decl.url', ''));
      service.declare({ key: 'spec.decl.url', default: '', validator: isPersistableUrl });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('validator');
      expect(first.validator).toBeUndefined();
    });

    it('do not warn for a reader without a validator', () => {
      const service = new ConfigService();
      service.declare({ key: 'spec.decl.url', default: '', validator: isPersistableUrl });
      service.getConfigOrCreate('spec.decl.url', '');
      expect(warn).not.toHaveBeenCalled();
    });

    it('compare object defaults by value', () => {
      const service = new ConfigService();
      service.declare({ key: 'spec.decl.b', default: { a: 1 } });
      service.declare({ key: 'spec.decl.b', default: { a: 1 } });
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('placeholders', () => {
    it('take the declared default, type and validator from the first real declaration', () => {
      const service = new ConfigService();
      // A command writes the key before the code that owns it ran.
      const placeholder = service.getConfigOrPlaceholder<unknown>('spec.decl.typed', '12');
      placeholder.setValue('12');
      expect(service.isDeclared('spec.decl.typed')).toBe(false);

      const declared = service.declare<number>({ key: 'spec.decl.typed', default: 0, validator: v => v >= 0 });
      expect(declared).toBe(placeholder as ConfigProperty<unknown>);
      expect(service.isDeclared('spec.decl.typed')).toBe(true);
      expect(declared.value).toBe(12);
      expect(declared.codeDefault).toBe(0);
      expect(warn).not.toHaveBeenCalled();

      declared.setDefault();
      expect(declared.value).toBe(0);
    });

    it('re-coerce a URL value that arrived as text', () => {
      const service = new ConfigService();
      service.applySessionValue('spec.decl.typed', 'true');
      const placeholder = service.getConfigOrPlaceholder<unknown>('spec.decl.typed', 'text');
      expect(placeholder.value).toBe('true');
      service.declare({ key: 'spec.decl.typed', default: false });
      expect(placeholder.value).toBe(true);
    });

    it('keep a feature default that waited for the key', () => {
      const service = new ConfigService();
      service.applyFeatureDefaults({ 'spec.decl.pack': '25' });
      service.getConfigOrPlaceholder<unknown>('spec.decl.pack', 'text');
      const declared = service.declare({ key: 'spec.decl.pack', default: 10 });
      expect(declared.value).toBe(25);
    });

    it('are returned as is when the key is already declared', () => {
      const service = new ConfigService();
      const declared = service.declare({ key: 'spec.decl.a', default: 'x' });
      expect(service.getConfigOrPlaceholder('spec.decl.a', 'other')).toBe(declared);
      expect(declared.codeDefault).toBe('x');
    });
  });

  describe('URL validators', () => {
    it('isPersistableUrl rejects blob: and data: URLs only', () => {
      expect(isPersistableUrl('')).toBe(true);
      expect(isPersistableUrl('https://host/file.root')).toBe(true);
      expect(isPersistableUrl('epic://epic_craterlake.root')).toBe(true);
      expect(isPersistableUrl('blob:https://host/5b1c')).toBe(false);
      expect(isPersistableUrl(' DATA:application/json;base64,e30=')).toBe(false);
      expect(isPersistableUrl(42)).toBe(false);
    });

    it('ignore a blob: URL that an older build stored', () => {
      localStorage.setItem('spec.decl.url', 'blob:https://host/5b1c');
      const service = new ConfigService();
      service.applyServerValue('spec.decl.url', 'https://host/default.root');
      const property = service.declare({ key: 'spec.decl.url', default: '', validator: isPersistableUrl });
      expect(property.value).toBe('https://host/default.root');
    });
  });

  describe('storage prefix', () => {
    it('stores the properties the service creates under the prefix', () => {
      TestBed.configureTestingModule({ providers: appFeatures(withConfigStorage({ prefix: 'myapp.' })).providers });
      const service = TestBed.inject(ConfigService);
      const property = service.declare({ key: 'spec.decl.a', default: 'x' });
      property.value = 'saved';
      expect(localStorage.getItem('myapp.spec.decl.a')).toBe('saved');
      expect(localStorage.getItem('spec.decl.a')).toBeNull();

      property.setDefault();
      expect(localStorage.getItem('myapp.spec.decl.a')).toBeNull();
      expect(localStorage.getItem('myapp.spec.decl.a.time')).toBeNull();
    });

    it('reads values saved under the prefix', () => {
      localStorage.setItem('myapp.spec.decl.b', '3');
      const service = new ConfigService({ prefix: 'myapp.' });
      expect(service.getConfigOrCreate('spec.decl.b', 1).value).toBe(3);
    });

    it('uses no prefix by default', () => {
      const service = TestBed.inject(ConfigService);
      service.declare({ key: 'spec.decl.a', default: 'x' }).value = 'plain';
      expect(localStorage.getItem('spec.decl.a')).toBe('plain');
    });
  });
});

/**
 * Which built-in loader opens a source: the first registered loader whose
 * `canLoad()` claims it (open-dex, open-geometry, loadFromConfig). Pinned
 * with the real built-ins composed by provideFirebird(), so a change to a
 * loader's extensions, schemes or registration order shows up here.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService } from '@dexvis/app-features';
import type { DataSource } from '@dexvis/firebird-core';
import { provideFirebird } from './provide-firebird';
import { injectEventLoaders, injectGeometryLoaders } from '@dexvis/firebird-ng/api';

/** The id of the event loader that claims the source first, or null when none does. */
function eventLoaderFor(source: DataSource): string | null {
  const loaders = TestBed.runInInjectionContext(() => injectEventLoaders());
  return loaders.find(loader => loader.canLoad(source))?.meta.id ?? null;
}

function geometryLoaderFor(source: DataSource): string | null {
  const loaders = TestBed.runInInjectionContext(() => injectGeometryLoaders());
  return loaders.find(loader => loader.canLoad(source))?.meta.id ?? null;
}

const picked = (name: string) => new File([], name);

describe('built-in loader claims', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideFirebird()],
    });
  });

  describe('events', () => {
    it('opens DEX files with the DEX loader, whatever the scheme', () => {
      expect(eventLoaderFor('asset://data/sample.firebird.zip')).toBe('firebird-dex');
      expect(eventLoaderFor('asset://data/sample.firebird.json')).toBe('firebird-dex');
      expect(eventLoaderFor('https://host/d/sample.v1.firebird.zip')).toBe('firebird-dex');
      expect(eventLoaderFor('http://localhost:5454/api/v1/download?f=events.firebird.zip')).toBe('firebird-dex');
      expect(eventLoaderFor(picked('events.firebird.zip'))).toBe('firebird-dex');
    });

    it('converts ROOT files the browser can byte-range in the browser', () => {
      expect(eventLoaderFor('asset://data/run.edm4eic.root')).toBe('root2dex');
      expect(eventLoaderFor('http://host/run.edm4eic.root')).toBe('root2dex');
      expect(eventLoaderFor('https://host/run.edm4hep.root')).toBe('root2dex');
      expect(eventLoaderFor('http://localhost:5454/api/v1/download?f=run.edm4eic.root')).toBe('root2dex');
      expect(eventLoaderFor(picked('run.edm4eic.root'))).toBe('root2dex');
    });

    it('converts XRootD URLs and server paths through pyrobird', () => {
      expect(eventLoaderFor('root://dtn-eic.jlab.org//work/eic2/run.edm4eic.root')).toBe('edm4eic-root');
      expect(eventLoaderFor('data/run.edm4eic.root')).toBe('edm4eic-root');
    });

    it('claims no other asset:// file', () => {
      expect(eventLoaderFor('asset://data/example.whatever')).toBeNull();
      expect(eventLoaderFor('asset://data/notes.txt')).toBeNull();
    });

    it("sends every ROOT URL through pyrobird with events.rootConverter = 'server', and no picked ROOT file", () => {
      TestBed.inject(ConfigService).applySessionValue('events.rootConverter', 'server');
      expect(eventLoaderFor('https://host/run.edm4eic.root')).toBe('edm4eic-root');
      expect(eventLoaderFor('asset://data/run.edm4eic.root')).toBe('edm4eic-root');
      // The convert endpoint takes a URL or a server path; a picked file has neither
      expect(eventLoaderFor(picked('run.edm4eic.root'))).toBeNull();
      expect(eventLoaderFor('https://host/d/sample.firebird.zip')).toBe('firebird-dex');
    });
  });

  describe('geometry', () => {
    it('opens ROOT geometry by URL, server path or picked file', () => {
      expect(geometryLoaderFor('https://host/tgeo/detector.root')).toBe('root-geometry');
      expect(geometryLoaderFor('asset://geometry/detector.root')).toBe('root-geometry');
      expect(geometryLoaderFor(picked('detector.root'))).toBe('root-geometry');
      expect(geometryLoaderFor('https://host/detector.gdml')).toBeNull();
    });
  });
});

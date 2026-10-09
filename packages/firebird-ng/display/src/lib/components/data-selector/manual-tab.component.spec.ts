/**
 * The manual tab probes every `.root` source to place it in the right field.
 * Probes answer in any order; only the latest value of a field is placed.
 * Its "Optimize geometry" toggle shows only when a pack registered the rule
 * set it selects.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DataSource } from '@dexvis/firebird-core';
import { ConfigService, ServerConfigService } from '@dexvis/app-features';
import {
  DataSelectionService,
  GEOMETRY_ROOT_FILTER_CONFIG,
  ROOT_GEOMETRY_RULES,
  type RootGeometryRulesSource,
} from '@dexvis/firebird-ng/api';
import { FileOpenRouterService, type FileRoute } from '../../services/file-open-router.service';
import { ManualTabComponent } from './manual-tab.component';

describe('ManualTabComponent placement', () => {
  /** Pending probes by source name; the test answers them in any order. */
  let pending: Map<string, (route: FileRoute) => void>;
  let tab: ManualTabComponent;
  let selection: DataSelectionService;

  const answer = async (name: string, kind: 'geometry' | 'events') => {
    pending.get(name)!({ kind, loader: {} } as FileRoute);
    for (let i = 0; i < 3; i++) await Promise.resolve();
  };

  beforeEach(() => {
    localStorage.clear();
    pending = new Map();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        {
          provide: FileOpenRouterService,
          useValue: {
            route: (source: DataSource) => new Promise<FileRoute>(resolve =>
              pending.set(typeof source === 'string' ? source : source.name, resolve)),
          },
        },
      ],
    });
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
    selection = TestBed.inject(DataSelectionService);
    // The class alone: placement logic needs no template
    tab = TestBed.runInInjectionContext(() => new ManualTabComponent());
  });

  it('places the latest value of a field when an older probe answers last', async () => {
    tab.onEventsChange('https://h/old.root');
    tab.onEventsChange('https://h/new.root');
    await answer('https://h/new.root', 'events');
    // The older probe says "geometry"; it must not move or overwrite anything
    await answer('https://h/old.root', 'geometry');

    expect(tab.events()).toBe('https://h/new.root');
    expect(tab.geometry()).not.toBe('https://h/old.root');
    expect(tab.note()).toBeNull();
    expect(selection.draft().events).toBe('https://h/new.root');
    expect(selection.draft().geometry).toBeUndefined();
  });

  it('still moves a source that the latest probe finds in the wrong field', async () => {
    tab.onEventsChange('https://h/detector.root');
    await answer('https://h/detector.root', 'geometry');
    expect(tab.geometry()).toBe('https://h/detector.root');
    expect(tab.note()).toContain('went to the geometry field');
  });
});

describe('ManualTabComponent optimize toggle', () => {
  /** A tab under the given rule contributions, once their (lazy) data resolved. */
  async function createTab(ruleSources: RootGeometryRulesSource[] | null): Promise<ManualTabComponent> {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        ...(ruleSources ? [{ provide: ROOT_GEOMETRY_RULES, useValue: ruleSources }] : []),
      ],
    });
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
    const tab = TestBed.runInInjectionContext(() => new ManualTabComponent());
    for (let i = 0; i < 3; i++) await Promise.resolve();
    return tab;
  }

  it('stays hidden when no pack registered edit rules', async () => {
    expect((await createTab(null)).optimizeRuleSet()).toBeNull();
  });

  it('stays hidden when the registered rules have no rule set for it', async () => {
    const tab = await createTab([{ editRules: { strict: { label: 'Strict', detectors: [] } } }]);
    expect(tab.optimizeRuleSet()).toBeNull();
  });

  it('shows the label of the rule set it selects and switches the config between it and off', async () => {
    const tab = await createTab([async () => ({ editRules: { default: { label: 'Remove fine parts', detectors: [] } } })]);
    expect(tab.optimizeRuleSet()?.label).toBe('Remove fine parts');

    const rootFilter = TestBed.inject(ConfigService).declare(GEOMETRY_ROOT_FILTER_CONFIG);
    expect(tab.optimize()).toBe(false);
    tab.toggleOptimize();
    expect(rootFilter.value).toBe('default');
    tab.toggleOptimize();
    expect(rootFilter.value).toBe('off');
  });
});

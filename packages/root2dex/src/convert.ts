/**
 * The public conversion entry points: open a podio ROOT file and turn selected
 * entries into a Firebird DEX document.
 *
 * `Root2DexConverter` keeps the file open so a UI can convert one event, then
 * another, paying the tree-metadata read only once; `convertRootToDex` is the
 * one-shot form used by scripts and tests.
 */

import { makeDex, type DexDocument, type DexEvent } from './dex';
import { PodioEventFile, type PodioModel, type RootSource } from './podio-file';
import {
  edm4eicEntryToDex,
  EDM4EIC_DEFAULT_COLLECTIONS,
  type Edm4eicCollection,
} from './edm4eic';
import { EDM4HEP_DEFAULT_COLLECTIONS, edm4hepEntryToDex, type Edm4hepOptions } from './edm4hep';
import { parseEntryRanges, selectEntries, type EntryRange } from './entries';

export interface ConvertOptions extends Omit<Edm4hepOptions, 'collections'> {
  /**
   * Collection groups to convert. edm4eic knows 'tracker_hits', 'tracks' and
   * 'mc_particles'; edm4hep knows 'tracker_hits', 'mc_trajectories' and
   * 'mc_particles'. Empty means all.
   */
  collections?: string[];
  /** Overrides model auto-detection. */
  model?: PodioModel;
  /** Overrides the "file" field of the DEX origin block. */
  sourceName?: string;
}

/**
 * Parses entry numbers written as '3', '1-5', or '1,2-5,8' into a list of
 * integers. Arrays of numbers pass through.
 *
 * This expands without bounds; to convert from a file, select with
 * `parseEntryRanges()` and `selectEntries()` first, which reject oversized
 * selections and clamp the ranges to the file before expanding.
 */
export function parseEntryNumbers(value: string | number | Iterable<number>): number[] {
  if (typeof value === 'number') return [Math.trunc(value)];
  if (typeof value !== 'string') return [...value].map(v => Math.trunc(v));
  const entries: number[] = [];
  for (const [start, end] of parseEntryRanges(value)) {
    for (let entry = start; entry <= end; entry++) entries.push(entry);
  }
  return entries;
}

/**
 * The collection groups a model's conversion knows, in conversion order. This
 * is what a UI offers as per-group conversion checkboxes; the names match
 * `pyrobird convert --collections` and the convert endpoint's `collections`
 * query parameter.
 */
export function collectionGroupsFor(model: PodioModel): string[] {
  return model === 'edm4hep'
    ? [...EDM4HEP_DEFAULT_COLLECTIONS]
    : [...EDM4EIC_DEFAULT_COLLECTIONS];
}

/**
 * An open podio ROOT file that converts entries on demand.
 *
 * Only the bytes of the requested entry are read - see PodioEventFile for how
 * that works and which sources are supported.
 */
export class Root2DexConverter {
  private mcCollectionId: number | null | undefined;

  private constructor(
    readonly file: PodioEventFile,
    readonly model: PodioModel,
    private readonly options: ConvertOptions,
  ) {}

  static async open(source: RootSource, options: ConvertOptions = {}): Promise<Root2DexConverter> {
    const file = await PodioEventFile.open(source);
    const model = options.model ?? file.detectModel();
    return new Root2DexConverter(file, model, options);
  }

  get entryCount(): number {
    return this.file.entryCount;
  }

  get sourceName(): string {
    return this.options.sourceName ?? this.file.sourceName;
  }

  /** Converts one entry to a DEX event object (no document wrapper). */
  async convertEntry(entry: number, overrides: ConvertOptions = {}): Promise<DexEvent> {
    const options = { ...this.options, ...overrides };
    if (this.model === 'edm4hep') {
      if (this.mcCollectionId === undefined) {
        this.mcCollectionId = await this.file.readCollectionId(options.mcBranch ?? 'MCParticles');
      }
      return edm4hepEntryToDex(this.file, entry, {
        ...options,
        collections: options.collections as Edm4hepOptions['collections'],
        mcCollectionId: this.mcCollectionId,
      });
    }
    return edm4eicEntryToDex(this.file, entry, {
      ...options,
      collections: options.collections as Edm4eicCollection[] | undefined,
    });
  }

  /** Converts entries to a complete DEX document with an origin block. */
  async convert(entries: number[] | number, overrides: ConvertOptions = {}): Promise<DexDocument> {
    const list = typeof entries === 'number' ? [entries] : entries;
    const events: DexEvent[] = [];
    for (const entry of list) {
      events.push(await this.convertEntry(entry, overrides));
    }
    return makeDex(events, {
      file: overrides.sourceName ?? this.sourceName,
      entries_count: this.entryCount,
      file_type: this.model,
    });
  }
}

/**
 * Opens `source`, converts `entries` and returns the DEX document. Equivalent
 * to `pyrobird convert <file> -e <entries>`: requested entries outside the
 * file are dropped before anything is converted, with one warning through
 * `options.onWarning` (console.warn without it).
 *
 * @throws EntrySelectionError when no requested entry is in the file.
 */
export async function convertRootToDex(
  source: RootSource,
  entries: string | number | number[] = 0,
  options: ConvertOptions = {},
): Promise<DexDocument> {
  const converter = await Root2DexConverter.open(source, options);
  const ranges: EntryRange[] = typeof entries === 'string'
    ? parseEntryRanges(entries)
    : (typeof entries === 'number' ? [entries] : entries).map(entry => [Math.trunc(entry), Math.trunc(entry)] as const);
  const selection = selectEntries(ranges, converter.entryCount);
  if (selection.warning) {
    (options.onWarning ?? console.warn)(selection.warning);
  }
  return converter.convert(selection.entries);
}

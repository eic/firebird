/**
 * The JSROOT access layer: opens a podio ROOT file and reads single entries out
 * of its 'events' TTree.
 *
 * Partial reading is the point of this class. JSROOT never loads a whole file:
 * `openFile` reads the key directory and the streamer info, `readObject('events')`
 * reads the TTree metadata, and a `treeProcess` pass reads only the baskets that
 * cover the requested entries of the requested branches. A multi-GB file costs a
 * handful of byte ranges per event.
 *
 * All branches an event needs are read in ONE pass (`readEntry`) so JSROOT can
 * batch their baskets into as few reads as possible - a pass per field would
 * multiply the round trips by the number of columns.
 *
 * Sources, in order of what JSROOT does with them:
 *   - a browser `File` (drag-and-drop / file picker) - sliced with FileReader
 *   - an http(s) URL - HTTP Range requests
 *   - a `file://` path or plain path under node - positional reads
 *   - any object implementing JSROOT's FileProxy contract (`getFileName`,
 *     `getFileSize`, `readBuffer(pos, len)`) - the seam a future XRootD
 *     byte-range proxy plugs into without touching this package
 */

import { openFile } from 'jsroot';
import { treeProcess, TSelector } from 'jsroot/tree';

/** Anything JSROOT's `openFile` accepts. See the class doc for the list. */
export type RootSource = string | File | Blob | ArrayBuffer | object;

/** One column of values as JSROOT returns it (typed array, or Array for 64-bit ints). */
export type Column = ArrayLike<number> & Iterable<number>;

/** The columns read by one `readEntry` call, keyed by full branch name. */
export type ColumnBag = Record<string, Column>;

/** The podio data model of an 'events' tree. */
export type PodioModel = 'edm4eic' | 'edm4hep';

const EDM4EIC_HIT_TYPE = 'vector<edm4eic::TrackerHitData>';
const EDM4HEP_SIM_HIT_TYPE = 'vector<edm4hep::SimTrackerHitData>';

interface JsrootBranch {
  fName: string;
  fClassName?: string;
  fBranches?: { arr?: JsrootBranch[] };
}

interface JsrootTree {
  fEntries: number;
  fBranches?: { arr?: JsrootBranch[] };
}

interface JsrootFile {
  readObject(name: string): Promise<unknown>;
  getFileName?(): string;
}

/**
 * An opened podio 'events' tree, kept open across conversions so the tree
 * metadata is read once.
 */
export class PodioEventFile {
  /** Full names of every branch and sub-branch, e.g. 'SiBarrelHits.position.x'. */
  private readonly branchNames = new Set<string>();
  /** Top-level collection name -> its podio C++ type. */
  private readonly collectionTypes = new Map<string, string>();

  private constructor(
    private readonly file: JsrootFile,
    private readonly tree: JsrootTree,
    readonly sourceName: string,
  ) {
    for (const branch of tree.fBranches?.arr ?? []) {
      this.collectionTypes.set(branch.fName, branch.fClassName ?? '');
      this.collectBranchNames(branch);
    }
  }

  private collectBranchNames(branch: JsrootBranch): void {
    this.branchNames.add(branch.fName);
    for (const child of branch.fBranches?.arr ?? []) {
      this.collectBranchNames(child);
    }
  }

  /** Opens `source` and reads the 'events' tree metadata (no event data yet). */
  static async open(source: RootSource, treeName = 'events'): Promise<PodioEventFile> {
    const file = (await openFile(source as never)) as JsrootFile;
    // JSROOT rejects a missing key with a bare "Key not found events"; the
    // message goes straight to the user, so say what was actually wrong
    const tree = (await file
      .readObject(treeName)
      .catch(() => null)) as JsrootTree | null;
    if (!tree || typeof tree.fEntries !== 'number') {
      throw new Error(
        `No '${treeName}' TTree found in the ROOT file - this does not look like an ` +
          `EDM4eic/EDM4hep event file (a detector geometry file, for instance, has none)`,
      );
    }
    const name =
      typeof source === 'string'
        ? source
        : ((source as File).name ?? file.getFileName?.() ?? 'unknown.root');
    return new PodioEventFile(file, tree, name);
  }

  /** Number of entries (events) in the tree. */
  get entryCount(): number {
    return this.tree.fEntries;
  }

  /** True when a branch or sub-branch with this exact full name exists. */
  hasBranch(name: string): boolean {
    return this.branchNames.has(name);
  }

  /** Top-level collection names whose podio C++ type is exactly `typeName`. */
  collectionsOfType(typeName: string): string[] {
    const names: string[] = [];
    for (const [name, type] of this.collectionTypes) {
      if (type === typeName) names.push(name);
    }
    return names;
  }

  /**
   * Detects the data model by branch types, the same rule pyrobird uses:
   * reconstructed edm4eic collections win over the sim hits that eicrecon
   * files also carry.
   */
  detectModel(): PodioModel {
    if (this.collectionsOfType(EDM4EIC_HIT_TYPE).length > 0) return 'edm4eic';
    if (this.collectionsOfType(EDM4HEP_SIM_HIT_TYPE).length > 0) return 'edm4hep';
    throw new Error(
      `Cannot detect file type: no '${EDM4EIC_HIT_TYPE}' or '${EDM4HEP_SIM_HIT_TYPE}' ` +
        `branches found in the 'events' tree`,
    );
  }

  /**
   * Reads the given branches for ONE entry in a single pass.
   *
   * Names that do not exist in the tree are dropped silently - callers ask for
   * optional fields (edm4hep renamed 'EDep' to 'eDep', relation branches come
   * and go between podio versions) and check the result. Every returned column
   * holds the values of that one entry, flattened out of the per-event vector.
   */
  async readEntry(names: Iterable<string>, entry: number): Promise<ColumnBag> {
    const wanted = [...new Set(names)].filter(name => this.hasBranch(name));
    const bag: ColumnBag = {};
    if (wanted.length === 0) return bag;

    if (!Number.isInteger(entry) || entry < 0 || entry >= this.entryCount) {
      throw new RangeError(
        `Entry ${entry} is outside of the tree: it holds ${this.entryCount} entries`,
      );
    }

    const selector = new TSelector();
    // Read into slot names ('b0', 'b1', ...): JSROOT would otherwise treat the
    // dots in 'SiBarrelHits.position.x' as a member path in the target object.
    wanted.forEach((name, index) => selector.addBranch(name, `b${index}`));
    selector.Process = function (this: { tgtobj: Record<string, Column> }) {
      wanted.forEach((name, index) => {
        bag[name] = this.tgtobj[`b${index}`];
      });
    };

    await treeProcess(this.tree, selector, { firstentry: entry, numentries: 1 });
    return bag;
  }

  /**
   * Reads the podio collectionID of `collectionName` from the file's
   * 'podio_metadata' tree, or null when the metadata is unavailable (trimmed
   * test files have none).
   */
  async readCollectionId(collectionName: string): Promise<number | null> {
    try {
      const metadata = (await this.file.readObject('podio_metadata')) as JsrootTree | null;
      if (!metadata) return null;
      const base = 'events___CollectionTypeInfo';
      const selector = new TSelector();
      selector.addBranch(`${base}.collectionID`, 'ids');
      selector.addBranch(`${base}.name`, 'names');
      let ids: ArrayLike<number> = [];
      let names: ArrayLike<string> = [];
      selector.Process = function (this: { tgtobj: Record<string, unknown> }) {
        ids = this.tgtobj['ids'] as ArrayLike<number>;
        names = this.tgtobj['names'] as ArrayLike<string>;
      };
      await treeProcess(metadata, selector, { firstentry: 0, numentries: 1 });
      for (let i = 0; i < names.length; i++) {
        if (names[i] === collectionName) return Number(ids[i]);
      }
    } catch {
      // No podio metadata in this file - the caller skips the consistency check
    }
    return null;
  }
}

/** Reads a column out of a bag, or an empty array when the branch was absent. */
export function column(bag: ColumnBag, name: string): Column {
  return bag[name] ?? [];
}

/** Reads a column as a plain number array (JSROOT hands back typed arrays). */
export function numbers(bag: ColumnBag, name: string): number[] {
  const values = bag[name];
  return values ? Array.from(values, Number) : [];
}

import JSZip from 'jszip';

/**
 * True for zip member names that can hold a DEX document: `.json` files that
 * are not directories, not dot-files (`._events.json`, `.DS_Store`), and not
 * inside the `__MACOSX/` folder that the macOS archiver adds.
 */
export function isDexZipMember(name: string): boolean {
  if (name.endsWith('/')) return false;
  const parts = name.split('/');
  if (parts.includes('__MACOSX')) return false;
  const baseName = parts[parts.length - 1];
  if (!baseName || baseName.startsWith('.')) return false;
  return baseName.toLowerCase().endsWith('.json');
}

/**
 * Reads the DEX document of a zip archive: the first `.json` member in archive
 * order that `isDexZipMember()` accepts, the member `pyrobird` reads too. Names
 * are filtered from the central directory first, so only that one member is
 * inflated.
 *
 * @param data The archive bytes, or a picked file.
 * @param sourceName The file name or URL, for error messages.
 * @returns The parsed JSON of the member.
 */
export async function readDexZip(data: Blob | ArrayBuffer, sourceName: string): Promise<unknown> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(data);
  } catch (error) {
    const head = await new Blob([data]).slice(0, 64).text();
    throw new Error(`'${sourceName}' is not a readable zip archive${htmlHint(head)}: ${errorText(error)}`);
  }
  const member = Object.values(archive.files).find(file => !file.dir && isDexZipMember(file.name));
  if (!member) {
    throw new Error(`'${sourceName}' holds no .json member`);
  }
  const timing = `readDexZip: inflating and parsing '${member.name}'`;
  console.time(timing);
  try {
    return JSON.parse(await member.async('string'));
  } finally {
    console.timeEnd(timing);
  }
}

/**
 * Reads a DEX document from a picked or dropped file: a `.json` file, or a
 * `.zip` read with `readDexZip()`. The file is read in place, never uploaded.
 */
export async function readDexFile(file: File): Promise<unknown> {
  if (file.name.toLowerCase().endsWith('.zip')) {
    return readDexZip(file, file.name);
  }
  return JSON.parse(await file.text());
}

/**
 * Builds the error for a failed HTTP response: status, status text and, when
 * the body is a JSON object with an `error` field (pyrobird's convert
 * endpoint answers that way), the server's reason.
 */
export async function httpError(response: Response, url: string): Promise<Error> {
  let reason = '';
  try {
    const body = JSON.parse(await response.text());
    if (body && typeof body.error === 'string') reason = `: ${body.error}`;
  } catch {
    // Not a JSON body (an HTML error page, for example): status only
  }
  const status = `HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`;
  return new Error(`${status}${reason} (${url})`);
}

/** Fetches a text file; rejects with `httpError()` for a failed response. */
export async function fetchTextFile(fileURL: string, signal?: AbortSignal): Promise<string> {
  const timing = `${fetchTextFile.name}: fetching ${fileURL}`;
  console.time(timing);
  try {
    const response = await fetch(fileURL, { signal });
    if (!response.ok) throw await httpError(response, fileURL);
    return await response.text();
  } finally {
    console.timeEnd(timing);
  }
}

/** Fetches a binary file; rejects with `httpError()` for a failed response. */
export async function fetchBinaryFile(fileURL: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const timing = `${fetchBinaryFile.name}: fetching ${fileURL}`;
  console.time(timing);
  try {
    const response = await fetch(fileURL, { signal });
    if (!response.ok) throw await httpError(response, fileURL);
    return await response.arrayBuffer();
  } finally {
    console.timeEnd(timing);
  }
}

/** Fetches a zipped DEX document and reads it with `readDexZip()`. */
export async function loadZipFileEvents(fileURL: string, signal?: AbortSignal): Promise<unknown> {
  const buffer = await fetchBinaryFile(fileURL, signal);
  return readDexZip(buffer, fileURL);
}

/** Fetches a DEX JSON document and parses it. */
export async function loadJSONFileEvents(fileURL: string, signal?: AbortSignal): Promise<unknown> {
  const text = await fetchTextFile(fileURL, signal);
  const timing = `${loadJSONFileEvents.name}: parsing JSON from '${fileURL}'`;
  console.time(timing);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`'${fileURL}' is not JSON${htmlHint(text)}: ${errorText(error)}`);
  } finally {
    console.timeEnd(timing);
  }
}

/**
 * A note for content that is an HTML page: a single-page-app server (pyrobird,
 * a static host with a fallback route) answers a missing file with its index
 * page and status 200.
 */
function htmlHint(text: string): string {
  return /^\s*</.test(text.slice(0, 64))
    ? ' (the server sent an HTML page instead; the file is probably missing)'
    : '';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

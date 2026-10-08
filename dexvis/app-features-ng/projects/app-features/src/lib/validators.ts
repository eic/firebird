/**
 * Validators for config keys. Pass one as the `validator` of a declaration:
 *
 * ```ts
 * config.declare({ key: 'viewer.fileUrl', default: '', validator: isPersistableUrl });
 * ```
 *
 * A validator applies to every source of the key: code, server, stored and
 * URL values, and runtime writes. A stored value that fails is ignored, so a
 * validator also cleans up values that older builds saved.
 */

/**
 * Accepts a URL that stays meaningful after a reload; rejects `blob:` and
 * `data:` URLs. A `blob:` URL dies with the page that created it, and a
 * `data:` URL carries the whole file, which does not belong in storage or in
 * a shareable setting. Empty strings pass, so "no URL" stays expressible.
 */
export function isPersistableUrl(value: unknown): boolean {
  return typeof value === 'string' && !/^\s*(blob|data):/i.test(value);
}

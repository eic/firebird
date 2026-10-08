/**
 * Builds deep links in the URL grammar that `UrlStartupService` parses:
 * shorthand parameters, `config.<key>=<value>` session values and the
 * `cmd=type:arg;type:arg` list.
 *
 * Every value is percent-encoded. A value that carries its own query string,
 * such as a presigned download URL, must be encoded: an unencoded `&` ends
 * the value, and an unencoded `+` turns into a space.
 */

import { CONFIG_PARAM_PREFIX } from './url-startup.service';

/** A value a deep link can carry. Numbers and booleans are written as text. */
export type DeepLinkValue = string | number | boolean;

/** One `cmd=` item: `'type'`, `'type:arg'`, or `{ type, arg }`. */
export type DeepLinkCommand = string | { type: string; arg?: DeepLinkValue };

/** What a deep link carries. See `buildDeepLink()`. */
export interface DeepLinkOptions {
  /**
   * Plain query parameters, in order, typically the application's URL
   * shorthands: `{ file: 'https://host/run1.root' }` adds `file=...`. A
   * value may contain `;`.
   */
  params?: Record<string, DeepLinkValue>;
  /** Session config values: `{ 'viewer.theme': 'light' }` adds `config.viewer.theme=light`. */
  config?: Record<string, DeepLinkValue>;
  /**
   * The `cmd=` list, in order. An argument cannot contain `;`: the list is
   * split on `;` after the browser decoded it, so no encoding can protect
   * one. Pass such a value through a shorthand in `params` instead.
   */
  commands?: DeepLinkCommand[];
}

/**
 * Returns `base` with the deep-link parameters appended, every value
 * percent-encoded. `base` may be absolute (`https://host/viewer`) or
 * relative (`/viewer`), and may already have a query or a fragment.
 *
 * ```ts
 * buildDeepLink('https://host/viewer', {
 *   params: { file: 'https://bucket.example/run1.root?X-Amz-Signature=a+b&X-Amz-Expires=600' },
 *   config: { 'viewer.theme': 'light' },
 *   commands: ['camera-preset:top', { type: 'show-event', arg: 3 }],
 * });
 * // https://host/viewer?file=https://bucket.example/run1.root%3FX-Amz-Signature%3Da%2Bb%26X-Amz-Expires%3D600
 * //   &config.viewer.theme=light&cmd=camera-preset:top;show-event:3
 * ```
 *
 * @throws Error when a command type is empty or contains `:` or `;`, or a
 *   command argument contains `;`.
 */
export function buildDeepLink(base: string, options: DeepLinkOptions): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(options.params ?? {})) {
    parts.push(`${encodeQueryText(name)}=${encodeQueryText(String(value))}`);
  }
  for (const [key, value] of Object.entries(options.config ?? {})) {
    parts.push(`${encodeQueryText(CONFIG_PARAM_PREFIX + key)}=${encodeQueryText(String(value))}`);
  }
  const items = (options.commands ?? []).map(commandItem);
  if (items.length > 0) {
    parts.push(`cmd=${items.join(';')}`);
  }
  if (parts.length === 0) {
    return base;
  }

  const hashAt = base.indexOf('#');
  const head = hashAt < 0 ? base : base.substring(0, hashAt);
  const fragment = hashAt < 0 ? '' : base.substring(hashAt);
  const separator = !head.includes('?') ? '?' : (head.endsWith('?') || head.endsWith('&') ? '' : '&');
  return head + separator + parts.join('&') + fragment;
}

/** Encodes one `cmd=` item; the `:` between type and argument and the `;` between items stay literal. */
function commandItem(command: DeepLinkCommand): string {
  let type: string;
  let arg: string;
  if (typeof command === 'string') {
    const colon = command.indexOf(':');
    type = colon < 0 ? command : command.substring(0, colon);
    arg = colon < 0 ? '' : command.substring(colon + 1);
  } else {
    type = command.type;
    arg = command.arg === undefined ? '' : String(command.arg);
  }
  type = type.trim();
  if (!type || /[:;]/.test(type)) {
    throw new Error(`buildDeepLink: invalid command type '${type}'. A type is non-empty and contains neither ':' nor ';'.`);
  }
  if (arg.includes(';')) {
    throw new Error(`buildDeepLink: the argument of '${type}' contains ';', which the cmd= list cannot carry ` +
      `(the list splits on ';' after decoding). Pass the value through a shorthand parameter instead.`);
  }
  return arg === '' ? encodeQueryText(type) : `${encodeQueryText(type)}:${encodeQueryText(arg)}`;
}

/**
 * Percent-encodes query text. `:`, `/`, `@` and `,` stay literal, which
 * keeps embedded URLs readable; the query parser reads them back unchanged.
 * Everything with a meaning in a query (`&`, `=`, `+`, `#`, `%`, `?`, `;`,
 * spaces) is encoded.
 */
function encodeQueryText(text: string): string {
  return encodeURIComponent(text).replace(/%(?:3A|2F|40|2C)/gi, match => decodeURIComponent(match));
}

/**
 * @firebird/root2dex - converts EDM4eic / EDM4hep podio ROOT files to Firebird
 * DEX in the browser (or node), using the JSROOT API.
 *
 * The conversion mirrors pyrobird's `pyrobird convert`: the same input entry
 * produces the same DEX document from either implementation.
 *
 * Only the bytes of the requested event are read, so multi-GB files work
 * against a local file, an http(s) URL, or any custom byte-range source - see
 * `PodioEventFile`.
 *
 *   const converter = await Root2DexConverter.open(file);
 *   const dex = await converter.convert(eventNumber);
 */

export * from './dex';
export * from './podio-file';
export * from './edm4eic';
export * from './edm4hep';
export * from './mc-particles';
export * from './convert';
export * from './byte-range-source';

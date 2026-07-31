/**
 * Shared style state between the pack initializer (initial bundle) and the
 * lazily-loaded painter chunk. Deliberately three.js-free and tiny: the
 * config wiring must not pull the painter (and three.js) into the initial
 * bundle.
 */
export const ringStyle = {
  color: '#00e5ff',
};

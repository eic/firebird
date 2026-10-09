import {cool2ColorRules} from "./cool2-geometry-ruleset";

export const cool2NoOutlineColorRules = cool2ColorRules.map(config => ({
  // keep everything else the same…
  ...config,
  // but rebuild the rules array, forcing outline:false
  rules: config.rules.map(rule => ({
    ...rule,
    outline: false
  }))
}));

import * as THREE from "three";
import {wildCardCheck} from "../utils/wildcard";
import {CalorimetryGeometryPrettifier} from "./calorimetry.prettifier";
import {editThreeNodeContent, EditThreeNodeRule} from "../utils/three-geometry-editor";
import {Subdetector} from "../model/subdetector";

/**
 * A typed object that associates a name (or multiple names) with an array of edit rules.
 * E.g. { name: "DIRC_14", rules: [ { patterns: [...], ... } ] }
 */
export interface DetectorThreeRuleSet {
  names?: string[];
  name?: string;
  rules: EditThreeNodeRule[];
}

/**
 * Converts a raw JSON/JSONC array into typed DetectorThreeRuleSet objects.
 * If an EditThreeNodeRule has "materialJson", we parse it using THREE.MaterialLoader.
 */
export function ruleSetsFromObj(obj: any): DetectorThreeRuleSet[] {
  // Not an array => return empty
  if (!Array.isArray(obj)) {
    console.warn('ruleSetsFromObj: top-level object is not an array. Returning empty.');
    return [];
  }

  // Create a single MaterialLoader we can reuse for all materialJson objects
  const materialLoader = new THREE.MaterialLoader();

  return obj.map((item: any) => {
    // Ensure we have a rules array
    if (!item.rules || !Array.isArray(item.rules)) {
      console.warn('ruleSetsFromObj: missing or invalid "rules" array in item:', item);
      return { rules: [] };
    }

    // Convert each rule
    const convertedRules: EditThreeNodeRule[] = item.rules.map((r: any) => {
      const rule: EditThreeNodeRule = { ...r };

      // 1) Convert a color from string hex "0xabcdef" => number
      if (typeof rule.color === 'string') {
        rule.color = parseInt(rule.color, 16);
      }

      // 2) If there's "materialJson", parse it using THREE.MaterialLoader
      if (r.materialJson && typeof r.materialJson === 'object') {
        try {
          // Convert raw JSON to real material
          const loadedMaterial = materialLoader.parse(r.materialJson);
          rule.material = loadedMaterial;
        } catch (err) {
          console.error('Failed to parse materialJson:', err, r.materialJson);
        }
      }

      return rule;
    });

    return {
      names: item.names,
      name: item.name,
      rules: convertedRules,
    };
  });
}


/**
 * Matches which set of rules should be applied to which detectors
 *
 * - Detectors are matched based on their `sourceGeometryName` against the names specified in the rulesets.
 * - Rule lists are matched to detectors in the order they appear in the rulesets
 * - Once a rule is applied to a detector, that detector is excluded from further rule matching, ensuring each detector is processed only once.
 * - If both `names` and `name` are provided in a ruleset, the function treats it as a user error in JSON rule editing but processes both without raising an exception.
 * - If a ruleset contains a wildcard name (`"*"`), it will apply its rules to any detectors not already matched by previous rulesets. So it should be placed in
 *
 * @param {Subdetector[]} detectors - The list of detectors to which the rules will be applied.
 * @param {DetectorThreeRuleSet[]} ruleSets - The set of rules to be applied, processed sequentially.
 * @return {Map<Subdetector, EditThreeNodeRule[]>} - A map associating each detector with an array of the rules applied to it.
 */
export function matchRulesToDetectors(ruleSets: DetectorThreeRuleSet[], detectors: Subdetector[]): Map<Subdetector, EditThreeNodeRule[]> {
  const unassignedDetectors = new Set(detectors);
  const detectorRulesMap = new Map<Subdetector, EditThreeNodeRule[]>();

  for(let ruleSet of ruleSets) {
    const targets = new Set<Subdetector>();
    let names = new Set<string>(ruleSet.names || []);

    // Handle possible user error where both 'name' and 'names' are provided.
    if (ruleSet.name) {
      names.add(ruleSet.name);
    }

    for(let name of names) {
      for(let det of unassignedDetectors) {
        if (wildCardCheck(det.sourceGeometryName, name)) {
          targets.add(det);
          detectorRulesMap.set(det, ruleSet.rules || []);
          unassignedDetectors.delete(det);  // Move deletion here to optimize
        }
      }
    }
  }

  return detectorRulesMap;
}

export class ThreeGeometryProcessor {


  constructor() {

  }

  public processRuleSets(ruleSets: DetectorThreeRuleSet[], detectors: Subdetector[]) {
    let detRulesMap = matchRulesToDetectors(ruleSets, detectors);
    for (let [detector, ruleSet] of detRulesMap) {
      const consoleMessage = `[processRuleSet] Applying rules for ${detector.name}`;
      console.time(consoleMessage)
      for(let rule of ruleSet) {
        editThreeNodeContent(detector.geometry, rule);
      }
      console.timeEnd(consoleMessage)
    }
  }
}

import {
  GeoNodeWalkCallback,
  getGeoNodesByLevel,
  walkGeoNodes
} from "./root-geo-navigation";
import {wildCardCheck} from "../app/utils/wildcard";
import {GeoAttBits, setGeoBit, toggleGeoBit} from "./root-geo-attribute-bits";


export enum EditActions {
  Nothing,          /** Do not remove this or other nodes */
  Remove,           /** Removes this node from parent */
  RemoveSiblings,   /** Remove all sibling nodes and leave only this node */
  RemoveChildren,   /** Remove all child nodes */
  RemoveBySubLevel, /** Remove all nodes below N levels */
  SetGeoBit,        /** Set certain Root GeoAtt bit */
  UnsetGeoBit,      /** Unset certain ROOT GeoAtt bit */
  ToggleGeoBit      /** Toggle certain ROOT GeoAtt bit */
}

/**
 * Defines editing rules for geographic nodes based on a pattern.
 */
export class GeoNodeEditRule {
  public pattern: string = '';
  public action?: EditActions = EditActions.Nothing;
  public pruneSubLevel?: number = Infinity;

  /** Used only if action is one of SetGeoBit, UnsetGeoBit or ToggleGeoBit */
  public geoBit?:GeoAttBits;

  public childrenRules?: GeoNodeEditRule[] = [];
  public childrenRulesMaxLevel?: number = Infinity;
}


/**
 * Edits ROOT Geometry nodes based on specified rules. This function walks through each node,
 * applying transformation rules such as removing nodes or modifying node arrays based on provided patterns.
 *
 * @param {any} topNode - The top node of the geometry tree to edit.
 * @param {GeoNodeEditRule[]} rules - An array of rules defining how nodes should be edited.
 * @param {number} [maxLevel=Infinity] - The maximum level of the node tree to traverse.
 * @returns {any[]} An array of objects detailing nodes that were postponed for processing.
 */
export function editGeoNodes(topNode: any, rules: GeoNodeEditRule[], maxLevel:number=Infinity): any[] {
  let postponedProcessing: {node: any, fullPath: string, rule: GeoNodeEditRule}[] = [];

  let tmpRules = [...rules];

  // Define a callback using the GeoNodeWalkCallback type
  const collectNodes: GeoNodeWalkCallback = (node, nodeFullPath, level) => {
    for(const rule of tmpRules) {

      if(nodeFullPath === undefined) {
        console.log(`nodeFullPath == undefined`);
      }

      if(rule?.pattern === undefined) {
        console.log(`rule?.pattern == undefined ${rule}`);
      }

      // Does the node fulfill the rule?
      if(wildCardCheck(nodeFullPath, rule.pattern)) {

        // This rule has subnode rules
        if(rule.childrenRules?.length) {
          // Invoke first children rules
          editGeoNodes(node, rule.childrenRules, rule.childrenRulesMaxLevel ?? Infinity);
        }

        // Remove this geo node
        if(rule.action === EditActions.Remove) {
          removeGeoNode(node);
          return false;  // Don't go through children
        }

        // Remove all daughters
        if(rule.action === EditActions.RemoveChildren) {
          removeChildren(node);
          return false;          // don't process children
        }

        // (!) All next actions may need to process children
        if(rule.action === EditActions.RemoveSiblings || rule.action === EditActions.RemoveBySubLevel) {
          // Add a node to matches to process them after
          postponedProcessing.push({ node: node, fullPath: nodeFullPath, rule: rule });
        }

        if(rule.action === EditActions.SetGeoBit){
          if(rule.geoBit !== undefined) {
            setGeoBit(node.fVolume, rule.geoBit, 1);
          }
        }
        if(rule.action === EditActions.UnsetGeoBit){
          if(rule.geoBit !== undefined) {
            setGeoBit(node.fVolume, rule.geoBit, 0);
          }
        }
        if(rule.action === EditActions.ToggleGeoBit){
          if(rule.geoBit !== undefined) {
            toggleGeoBit(node.fVolume, rule.geoBit);
          }
        }
      }
    }
    return true;  // Just continue
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(topNode, collectNodes, maxLevel);

  // Now we process nodes that we can't process on fly
  for(let item of postponedProcessing) {
    let node = item.node;
    let fullPath = node.fullPath;
    let rule:GeoNodeEditRule = item.rule;
    let motherVolume = item.node.fMother
    let siblings = motherVolume?.fNodes?.arr

    // Remove siblings but keep this one
    if(rule.action == EditActions.RemoveSiblings) {
      if (siblings) {
        motherVolume.fNodes.arr = [node]
      }
      else
      {
        console.log(`Can't get an array for: ${node} at ${fullPath}`);
      }
    }

    // Remove daughters by sublevels
    if(rule.action == EditActions.RemoveBySubLevel) {
      let pruneSubNodes = getGeoNodesByLevel(node, rule.pruneSubLevel);
      for (const pruneSubNodeItem of pruneSubNodes) {
        removeGeoNode(pruneSubNodeItem.geoNode);
      }
    }
  }

  return postponedProcessing;
}


/**
 * Removes a node from its mother volume.
 *
 * @param {any} node - The node to be removed.
 * @return {void} This function does not return a value.
 */
export function removeGeoNode(node: any) {
  let motherVolume = node.fMother
  let siblings = motherVolume?.fNodes?.arr
  if (siblings) {
    const index = siblings.indexOf(node);
    if (index !== -1) { // Check if the item was found
      siblings.splice(index, 1); // Remove the item
    } else {
      console.warn(`Item ${node} not found in array???`);
    }
  } else {
    console.warn(`Can't get siblings of ${node}`);
  }
}

/**
 * Removes all child nodes from the given node.
 *
 * @param {any} node - The node from which to remove the child nodes.
 * @return {void} This function does not return anything.
 */
export function removeChildren(node: any) {
  let daughters = node.fVolume?.fNodes?.arr;

  if (daughters) {
    node.fVolume.fNodes.arr = []
  } else {
    console.log(`Can't get child nodes of ${node}`);
  }
}

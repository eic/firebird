/// Prints geometry structure

import { wildCardCheck } from './wildcard';


export type GeoNodeWalkCallback = (node: any, nodeFullPath: string, level: number) => boolean;

export function walkGeoNodes(node: any, callback: GeoNodeWalkCallback|null, maxLevel = 0, level = 0, path = "", pattern?: string) {
  const nodeName = node.fName;
  const volume = node.fMasterVolume === undefined ? node.fVolume : node.fMasterVolume;
  const subNodes = volume ? volume.fNodes : null;
  const nodeFullPath = path ? `${path}/${nodeName}` : nodeName;
  let processedNodes = 1;

  // Only invoke the callback if no pattern is provided or if the pattern matches the fullPath
  let processChildren = true;
  if (!pattern || wildCardCheck(nodeFullPath, pattern)) {
    if(callback){
      processChildren = callback(node, nodeFullPath, level);
      if(!processChildren) {
        return processedNodes;
      }
    }
  }

  // Continue recursion to child nodes if they exist and the max level is not reached
  if (volume && subNodes && level < maxLevel) {
    for (let i = 0; i < subNodes.arr.length; i++) {
      const childNode = subNodes.arr[i];
      if (childNode) {
        processedNodes += walkGeoNodes(childNode, callback, maxLevel, level + 1, nodeFullPath, pattern);
      }
    }
  }

  return processedNodes;
}

export function findGeoNodes(node: any, pattern: string, maxLevel:number=Infinity): any[] {
  let matchingNodes: {geoNode: any, fullPath: string}[] = [];

  // Define a callback using the GeoNodeWalkCallback type
  const collectNodes: GeoNodeWalkCallback = (geoNode, nodeFullPath, level) => {
    matchingNodes.push({ geoNode, fullPath: nodeFullPath });
    return true; // go through children
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(node, collectNodes, maxLevel, 0, "", pattern);

  return matchingNodes;
}

export function findSingleGeoNode(topNode: any, pattern:string, maxLevel:number=Infinity): any|null {
  let result = findGeoNodes(topNode, pattern, maxLevel);
  if(result === null || result === undefined) {
    return null;
  }
  if(result.length > 1) {
    throw new Error(`findSingleGeoNode of ${topNode} returned more than 1 result (${result.length})`);
  }
  if(result.length == 0) {
    return null;
  }
  return result[0].geoNode;
}

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
  public action: EditActions = EditActions.Nothing;
  public pruneSubLevel?: number = Infinity;

  /** Used only if action is one of SetGeoBit, UnsetGeoBit or ToggleGeoBit */
  public geoBit?:GeoAttBits;
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

        if(rule.action === EditActions.RemoveSiblings) {
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


export function analyzeGeoNodes(node: any, level:number=2) {

  let highLevelNodes = getGeoNodesByLevel(node, 1);

  let totalNodes = 0;

  console.log(`--- Detector subcomponents analysis --- Detectors: ${highLevelNodes.length}`);
  for(let item of highLevelNodes) {
    // Now run walkNodes for each of high level node to get number of subnodes
    let numSubNodes = walkGeoNodes(item.geoNode, null, Infinity);
    totalNodes += numSubNodes;
    console.log(`${numSubNodes}: ${item.fullPath}`);
  }
  console.log(`--- End of analysis --- Total elements: ${totalNodes}`);

}

export function getGeoNodesByLevel(topNode: any, selectLevel:number=1) {
  let selectedNodes: {geoNode: any, fullPath: string}[] = [];

  // First we collect main nodes
  const collectNodes: GeoNodeWalkCallback = (node, fullPath, nodeLevel) => {
    // Add a node to a watch
    if(nodeLevel == selectLevel) {
      selectedNodes.push({ geoNode: node, fullPath: fullPath });
      return false; // don't go deeper, we need this level
    }
    return true;
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkGeoNodes(topNode, collectNodes, selectLevel);

  return selectedNodes;
}

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

export function removeChildren(node: any) {
  let daughters = node.fVolume?.fNodes?.arr;

  if (daughters) {
    node.fVolume.fNodes.arr = []
  } else {
    console.log(`Can't get child nodes of ${node}`);
  }
  return false; // Don't go through children. We deleted them
}

export async function findGeoManager(file: any){
  for (const key of file.fKeys) {
    if(key.fClassName === "TGeoManager") {
      return file.readObject(key.fName);
    }
  }
  return null;
}

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

export enum PruneRuleActions {
  Nothing,          /// Do not remove this or other nodes
  Remove,           /// Removes this node
  RemoveSiblings,   /// Remove all sibling nodes and leave only this node
  RemoveChildren,  /// Remove all doughter nodes
  RemoveBySubLevel  /// Remove all nodes below N levels
}

/**
 * Defines editing rules for geographic nodes based on a pattern.
 */
export class GeoNodeEditRule {
  public pattern: string = '';
  public prune: PruneRuleActions = PruneRuleActions.Nothing;
  public pruneSubLevel?: number = Infinity
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
        if(rule.prune == PruneRuleActions.Remove) {
          removeGeoNode(node);
          return false;  // Don't go through children
        }

        // Remove all daughters
        if(rule.prune == PruneRuleActions.RemoveChildren) {
          removeChildren(node);
          return false;
        }

        // Add a node to matches
        postponedProcessing.push({ node: node, fullPath: nodeFullPath, rule: rule });
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
    if(rule.prune == PruneRuleActions.RemoveSiblings) {
      if (siblings) {
        motherVolume.fNodes.arr = [node]
      }
      else
      {
        console.log(`Can't get an array for: ${node} at ${fullPath}`);
      }
    }

    // Remove daughters by sublevels
    if(rule.prune == PruneRuleActions.RemoveBySubLevel) {
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

//
// /** @summary Test fGeoAtt bits
//  * @private */
// function testGeoBit(volume:any , f) {
//   const att = volume.fGeoAtt;
//   return att === undefined ? false : ((att & f) !== 0);
// }
/** @summary Generate mask for given bit
 * @param {number} n bit number
 * @return {Number} produced mask
 * @private */
function BIT(n:number) { return 1 << n; }

/** @summary TGeo-related bits
 * @private */
export enum geoBITS {
  kVisOverride = BIT(0),  // volume's vis. attributes are overwritten
  kVisNone= BIT(1),  // the volume/node is invisible, as well as daughters
  kVisThis= BIT(2),  // this volume/node is visible
  kVisDaughters= BIT(3),  // all leaves are visible
  kVisOneLevel= BIT(4),  // first level daughters are visible (not used)
  kVisStreamed= BIT(5),  // true if attributes have been streamed
  kVisTouched= BIT(6),  // true if attributes are changed after closing geom
  kVisOnScreen= BIT(7),  // true if volume is visible on screen
  kVisContainers= BIT(12), // all containers visible
  kVisOnly= BIT(13), // just this visible
  kVisBranch= BIT(14), // only a given branch visible
  kVisRaytrace= BIT(15)  // raytracing flag
}

/** @summary Test fGeoAtt bits
 * @private */
export function testGeoBit(volume:any , f: geoBITS) {
  const att = volume.fGeoAtt;
  return att === undefined ? false : ((att & f) !== 0);
}


/** @summary Set fGeoAtt bit
 * @private */
export function setGeoBit(volume:any, f: geoBITS, value: number) {
  if (volume.fGeoAtt === undefined) return;
  volume.fGeoAtt = value ? (volume.fGeoAtt | f) : (volume.fGeoAtt & ~f);
}

/** @summary Toggle fGeoAttBit
 * @private */
export function toggleGeoBit(volume:any, f: geoBITS) {
  if (volume.fGeoAtt !== undefined)
    volume.fGeoAtt = volume.fGeoAtt ^ (f & 0xffffff);
}

/** @summary Prints the status of all geoBITS flags for a given volume
 * @param {Object} volume - The volume object to check
 * @private */
export function printAllGeoBitsStatus(volume:any) {
  const bitDescriptions = [
    { name: 'kVisOverride  ', bit: geoBITS.kVisOverride },
    { name: 'kVisNone      ', bit: geoBITS.kVisNone },
    { name: 'kVisThis      ', bit: geoBITS.kVisThis },
    { name: 'kVisDaughters ', bit: geoBITS.kVisDaughters },
    { name: 'kVisOneLevel  ', bit: geoBITS.kVisOneLevel },
    { name: 'kVisStreamed  ', bit: geoBITS.kVisStreamed },
    { name: 'kVisTouched   ', bit: geoBITS.kVisTouched },
    { name: 'kVisOnScreen  ', bit: geoBITS.kVisOnScreen },
    { name: 'kVisContainers', bit: geoBITS.kVisContainers },
    { name: 'kVisOnly      ', bit: geoBITS.kVisOnly },
    { name: 'kVisBranch    ', bit: geoBITS.kVisBranch },
    { name: 'kVisRaytrace  ', bit: geoBITS.kVisRaytrace }
  ];

  console.log(`fGeoAttr for ${volume._typename}: ${volume.fName}`);
  bitDescriptions.forEach(desc => {
    const isSet = testGeoBit(volume, desc.bit);
    console.log(`  ${desc.name}: ${isSet ? 'Yes' : 'No'}`);
  });
}

// Import necessary modules and functions
import {
  editGeoNodes,
  GeoNodeEditRule,
  EditActions,
} from './root-geo-edit'; // Update with the actual path

import {GeoAttBits, testGeoBit, toggleGeoBit} from "./root-geo-attribute-bits";

describe('editGeoNodes', () => {

  // Mock data setup for a typical geometry node structure
  let topNode: any;
  let childNode: any;
  let childNode2: any;
  let childNode3: any;

  // Create test data
  // Root have fGeoAtt both for nodes and volumes
  // https://root.cern.ch/doc/master/classTGeoAtt.html

  beforeEach(() => {
    childNode = {
      fName: 'ChildNode',
      fVolume: {
        fNodes: { arr: [] },
        fGeoAtt:0
      },
      fMother: undefined,
      fGeoAtt:0
    };

    childNode2 = {
      fName: 'AnotherChildNode1',
      fVolume: {
        fNodes: { arr: [] },
        fGeoAtt:0
      },
      fMother: undefined,
      fGeoAtt:0
    };

    childNode3 = {
      fName: 'AnotherChildNode2',
      fVolume: {
        fNodes: { arr: [] },
        fGeoAtt:0
      },
      fMother: undefined,
      fGeoAtt:0
    };

    topNode = {
      fName: 'TopNode',
      fVolume: {
        fNodes: { arr: [childNode, childNode2, childNode3] },
        fGeoAtt:0
      },
      fMother: undefined,
      fGeoAtt:0
    };

    childNode.fMother = topNode.fVolume;
  });

  it('should remove a specified node', () => {
    const rules: GeoNodeEditRule[] = [{ pattern: '*/ChildNode', action: EditActions.Remove }];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).not.toContain(childNode);
  });

  it('should remove a specified node', () => {
    const rules: GeoNodeEditRule[] = [{ pattern: '*/ChildNode', action: EditActions.Remove }];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).not.toContain(childNode);
  });

  it('should remove siblings of a node', () => {
    const rules: GeoNodeEditRule[] = [{ pattern: '*/ChildNode', action: EditActions.RemoveSiblings }];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).toContain(childNode);
    expect(topNode.fVolume.fNodes.arr).not.toContain(childNode2);
    expect(topNode.fVolume.fNodes.arr).not.toContain(childNode3);
  });

  it('should NOT remove a node with wrong pattern', () => {
    const rules: GeoNodeEditRule[] = [{ pattern: 'ChildNode', action: EditActions.Remove }];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).toContain(childNode);
  });

  it('should remove all children of a node', () => {
    const rules: GeoNodeEditRule[] = [{ pattern: 'TopNode', action: EditActions.RemoveChildren }];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).toEqual([]);
  });

  it('should set a GeoBit on a node', () => {
    const rules: GeoNodeEditRule[] = [{
      pattern: 'TopNode',
      action: EditActions.SetGeoBit,
      geoBit: GeoAttBits.kVisOverride
    }];
    editGeoNodes(topNode, rules);
    expect(testGeoBit(topNode.fVolume, GeoAttBits.kVisOverride)).toBe(true);
    expect(testGeoBit(childNode.fVolume, GeoAttBits.kVisOverride)).toBe(false);
  });

  it('should toggle a GeoBit on a node', () => {
    const rules = [ {
      pattern: 'TopNode',
      action: EditActions.ToggleGeoBit,
      geoBit: GeoAttBits.kVisOverride
    }];
    editGeoNodes(topNode, rules);
    expect(testGeoBit(topNode.fVolume, GeoAttBits.kVisOverride)).toBe(true);
    expect(testGeoBit(childNode.fVolume, GeoAttBits.kVisOverride)).toBe(false);
  });

  // Additional tests for other actions and more complex scenarios...
});


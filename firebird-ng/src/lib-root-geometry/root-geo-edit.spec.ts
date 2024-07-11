// Import necessary modules and functions
import {
  editGeoNodes,
  GeoNodeEditRule,
  EditActions,
} from './root-geo-edit'; // Update with the actual path

import * as RootGeoNavigation from './root-geo-navigation';
import * as RootGeoEdit from './root-geo-edit'

import * as GeoAttBitsModule from "./root-geo-attribute-bits";
import {GeoAttBits} from "./root-geo-attribute-bits";

describe('editGeoNodes', () => {

  // Mock data setup for a typical geometry node structure
  let topNode: any;
  let childNode: any;

  beforeEach(() => {
    childNode = {
      fName: 'ChildNode',
      fVolume: {
        fNodes: { arr: [] }
      },
      fMother: undefined
    };

    topNode = {
      fName: 'TopNode',
      fVolume: {
        fNodes: { arr: [childNode] }
      },
      fMother: undefined
    };

    childNode.fMother = topNode.fVolume;

    // Correct spy setup

    // Correct spy setup
    spyOn(RootGeoEdit, "removeGeoNode").and.callFake((node) => {
      const index = node.fMother.fNodes.arr.indexOf(node);
      if (index > -1) {
        node.fMother.fNodes.arr.splice(index, 1);
      }
    });

    spyOn(RootGeoEdit, "removeChildren").and.callFake((node) => {
      node.fVolume.fNodes.arr = [];
    });

    spyOn(GeoAttBitsModule, "setGeoBit").and.callThrough();
    spyOn(GeoAttBitsModule, "toggleGeoBit").and.callThrough();
    spyOn(RootGeoEdit, "walkGeoNodes").and.callThrough();

  it('should remove a specified node', () => {
    const rules: GeoNodeEditRule[] = [{ pattern: 'ChildNode', action: EditActions.Remove }];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).not.toContain(childNode);
    expect(RootGeoEdit.removeGeoNode).toHaveBeenCalled();
  });

  it('should remove all children of a node', () => {
    const rules = [new GeoNodeEditRule({ pattern: 'TopNode', action: EditActions.RemoveChildren })];
    editGeoNodes(topNode, rules);
    expect(topNode.fVolume.fNodes.arr).toEqual([]);
    expect(RootGeoEdit.removeChildren).toHaveBeenCalledWith(topNode);
  });

  it('should set a GeoBit on a node', () => {
    const rules: GeoNodeEditRule[] = [{
      pattern: 'TopNode',
      action: EditActions.SetGeoBit,
      geoBit: GeoAttBits.kVisOverride
    }];
    editGeoNodes(topNode, rules);
    expect(GeoAttBitsModule.setGeoBit).toHaveBeenCalledWith(topNode.fVolume, GeoAttBits.kVisOverride, 1);
  });

  it('should toggle a GeoBit on a node', () => {
    const rules = [ {
      pattern: 'TopNode',
      action: EditActions.ToggleGeoBit,
      geoBit: GeoAttBits.kVisOverride
    }];
    editGeoNodes(topNode, rules);
    expect(toggleGeoBit).toHaveBeenCalledWith(topNode.fVolume, GeoAttBits.kVisOverride);
  });

  // Additional tests for other actions and more complex scenarios...
});


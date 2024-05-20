import { walkObject3dNodes, NodeWalkCallback } from './three.utils';
import * as THREE from 'three';
import { isColorable, getColorOrDefault } from './three.utils';

describe('walkObject3dNodes', () => {
  let root: THREE.Object3D;
  let callback: jasmine.Spy<NodeWalkCallback>;

  beforeEach(() => {
    // Create a simple scene graph: root -> child -> grandchild
    root = new THREE.Object3D();
    root.name = 'root';

    const child = new THREE.Object3D();
    child.name = 'child';
    root.add(child);

    const grandchild = new THREE.Object3D();
    grandchild.name = 'grandchild';
    child.add(grandchild);

    // Setup callback spy
    callback = jasmine.createSpy('callback');
  });

  it('should invoke callback for each node when no pattern is given', () => {
    walkObject3dNodes(root, callback);
    expect(callback.calls.count()).toBe(3);
    expect(callback.calls.argsFor(0)).toEqual([root, 'root', 0]);
    expect(callback.calls.argsFor(1)).toEqual([root.children[0], 'root/child', 1]);
    expect(callback.calls.argsFor(2)).toEqual([root.children[0].children[0], 'root/child/grandchild', 2]);
  });

  it('should respect the maxLevel parameter', () => {
    walkObject3dNodes(root, callback, {maxLevel:1});
    expect(callback.calls.count()).toBe(2);
  });

  it('should correctly match nodes when a pattern is given', () => {
    const pattern = 'root/child';
    walkObject3dNodes(root, callback, {pattern: pattern});
    expect(callback).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'child' }), 'root/child', 1);
  });

  it('should return the correct number of processed nodes', () => {
    const processed = walkObject3dNodes(root, callback);
    expect(processed).toBe(3);  // Including root, child, grandchild
  });

  it('should not invoke callback for non-matching pattern', () => {
    const pattern = 'nonexistent';
    walkObject3dNodes(root, callback, {pattern: pattern});
    expect(callback).not.toHaveBeenCalled();
  });
});


describe('Material color functions', () => {
  describe('isColorable', () => {
    it('should return true if material has a color property', () => {
      const colorableMaterial = { color: new THREE.Color(255, 0, 0) };
      expect(isColorable(colorableMaterial)).toBeTrue();
    });

    it('should return false if material does not have a color property', () => {
      const nonColorableMaterial = { noColor: true };
      expect(isColorable(nonColorableMaterial)).toBeFalse();
    });
  });

  describe('getColorOrDefault', () => {
    it('should return the material color if material is colorable', () => {
      const colorableMaterial = { color: new THREE.Color(255, 0, 0) };
      const defaultColor = new THREE.Color(0, 0, 0);
      expect(getColorOrDefault(colorableMaterial, defaultColor)).toEqual(colorableMaterial.color);
    });

    it('should return the default color if material is not colorable', () => {
      const nonColorableMaterial = { noColor: true };
      const defaultColor = new THREE.Color(0, 0, 0);
      expect(getColorOrDefault(nonColorableMaterial, defaultColor)).toEqual(defaultColor);
    });
  });
});

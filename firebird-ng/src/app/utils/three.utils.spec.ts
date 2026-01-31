import type { Mock } from "vitest";
import { walkObject3DNodes, NodeWalkCallback, findObject3DNodes } from './three.utils';
import * as THREE from 'three';
import { isColorable, getColorOrDefault } from './three.utils';

describe('walkObject3dNodes', () => {
    let root: THREE.Object3D;
    let callback: Mock;

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
        callback = vi.fn();
    });

    it('should invoke callback for each node when no pattern is given', () => {
        walkObject3DNodes(root, callback);
        expect(vi.mocked(callback).mock.calls.length).toBe(3);
        expect(vi.mocked(callback).mock.calls[0]).toEqual([root, 'root', 0]);
        expect(vi.mocked(callback).mock.calls[1]).toEqual([root.children[0], 'root/child', 1]);
        expect(vi.mocked(callback).mock.calls[2]).toEqual([root.children[0].children[0], 'root/child/grandchild', 2]);
    });

    it('should respect the maxLevel parameter', () => {
        walkObject3DNodes(root, callback, { maxLevel: 1 });
        expect(vi.mocked(callback).mock.calls.length).toBe(2);
    });

    it('should correctly match nodes when a pattern is given', () => {
        const pattern = 'root/child';
        walkObject3DNodes(root, callback, { pattern: pattern });
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ name: 'child' }), 'root/child', 1);
    });

    it('should return the correct number of processed nodes', () => {
        const processed = walkObject3DNodes(root, callback);
        expect(processed).toBe(3); // Including root, child, grandchild
    });

    it('should not invoke callback for non-matching pattern', () => {
        const pattern = 'nonexistent';
        walkObject3DNodes(root, callback, { pattern: pattern });
        expect(callback).not.toHaveBeenCalled();
    });
});


describe('Material color functions', () => {
    describe('isColorable', () => {
        it('should return true if material has a color property', () => {
            const colorableMaterial = { color: new THREE.Color(255, 0, 0) };
            expect(isColorable(colorableMaterial)).toBe(true);
        });

        it('should return false if material does not have a color property', () => {
            const nonColorableMaterial = { noColor: true };
            expect(isColorable(nonColorableMaterial)).toBe(false);
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

describe('findObject3DNodes', () => {
    let root: THREE.Object3D, child1: THREE.Object3D, child2: THREE.Object3D, subchild1: THREE.Object3D, subchild2: THREE.Object3D;

    beforeEach(() => {
        // Setup a mock hierarchy of THREE.Object3D nodes
        root = new THREE.Object3D();
        root.name = 'root';

        child1 = new THREE.Object3D();
        child1.name = 'child1';
        root.add(child1);

        child2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        child2.name = 'child2';
        root.add(child2);

        subchild1 = new THREE.Object3D();
        subchild1.name = 'subchild1';
        child1.add(subchild1);

        subchild2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        subchild2.name = 'match';
        child2.add(subchild2);
    });

    it('should return all nodes when no pattern or type is provided', () => {
        const results = findObject3DNodes(root, '');
        expect(results.nodes.length).toBe(5);
        expect(results.deepestLevel).toBe(2);
        expect(results.totalWalked).toBe(5);
    });

    it('should handle no matches found', () => {
        const results = findObject3DNodes(root, 'nonexistent');
        expect(results.nodes.length).toBe(0);
    });

    it('should match nodes based on a pattern', () => {
        const results = findObject3DNodes(root, '**/match');
        expect(results.nodes.length).toBe(1);
        expect(results.nodes[0]).toBe(subchild2);
        expect(results.fullPaths[0]).toBe('root/child2/match');
    });

    it('should filter nodes based on type', () => {
        const results = findObject3DNodes(root, '', 'Mesh');
        expect(results.nodes.every(node => node instanceof THREE.Mesh)).toBe(true);
        expect(results.nodes.length).toBe(2); // Only child2 and subchild2 are Meshes
    });

    it('should respect the maxLevel parameter', () => {
        const results = findObject3DNodes(root, '', '', 1);
        expect(results.deepestLevel).toBe(1);
        expect(results.totalWalked).toBe(3); // root, child1, child2
    });

    it('should throw an error for invalid parentNode', () => {
        expect(() => {
            findObject3DNodes(null, '');
        }).toThrow();
    });
});

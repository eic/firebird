import * as THREE from 'three';
import { editThreeNodeContent, EditThreeNodeRule, clearGeometryEditingFlags } from './three-geometry-editor';
import { Mesh, BoxGeometry, MeshBasicMaterial, Group, Object3D } from 'three';

/**
 * Helper to create a simple test mesh
 */
function createTestMesh(name: string): Mesh {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: 0xffffff });
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

/**
 * Helper to create a test node structure like BeamPipe
 */
function createBeamPipeStructure(): Group {
  const root = new Group();
  root.name = 'BeamPipe_assembly';

  // Add v_upstream meshes
  const upstream1 = createTestMesh('v_upstream_wall_1');
  const upstream2 = createTestMesh('v_upstream_wall_2');

  // Add other meshes
  const downstream1 = createTestMesh('v_downstream_section_1');
  const downstream2 = createTestMesh('v_downstream_section_2');
  const center = createTestMesh('center_pipe');

  root.add(upstream1, upstream2, downstream1, downstream2, center);

  return root;
}

/**
 * Helper to create a hierarchical test node structure
 * BeamPipe_assembly
 *   └── v_upstream_coating (Group)
 *       ├── Left (Mesh)
 *       └── Right (Mesh)
 *   └── v_downstream_section (Mesh)
 *   └── center_pipe (Mesh)
 */
function createHierarchicalBeamPipe(): Group {
  const root = new Group();
  root.name = 'BeamPipe_assembly';

  // v_upstream_coating group with child meshes
  const upstreamGroup = new Group();
  upstreamGroup.name = 'v_upstream_coating';
  upstreamGroup.add(createTestMesh('Left'));
  upstreamGroup.add(createTestMesh('Right'));

  // Other meshes at root level
  const downstream = createTestMesh('v_downstream_section');
  const center = createTestMesh('center_pipe');

  root.add(upstreamGroup, downstream, center);

  return root;
}

/**
 * Helper to create a structure where parent Group and child Mesh have same name pattern
 * This simulates real detector geometry where naming can be like:
 * BeamPipe_assembly
 *   └── v_upstream_coating (Group)
 *       └── v_upstream_coating (Mesh with same name as parent!)
 *   └── other_pipe (Mesh)
 */
function createSameNameHierarchy(): Group {
  const root = new Group();
  root.name = 'BeamPipe_assembly';

  // Group and its child mesh have the same name - this is valid in Three.js
  const upstreamGroup = new Group();
  upstreamGroup.name = 'v_upstream_coating';
  const upstreamMesh = createTestMesh('v_upstream_coating'); // Same name as parent!
  upstreamGroup.add(upstreamMesh);

  const otherPipe = createTestMesh('other_pipe');

  root.add(upstreamGroup, otherPipe);

  return root;
}

/**
 * Count meshes matching a pattern in the tree
 */
function countMeshesWithPattern(root: Object3D, pattern: RegExp): number {
  let count = 0;
  root.traverse((child) => {
    if (child instanceof Mesh && pattern.test(child.name)) {
      count++;
    }
  });
  return count;
}

/**
 * Count all objects with geometry (meshes and line segments)
 */
function countObjectsWithGeometry(root: Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if ((child as any).geometry) {
      count++;
    }
  });
  return count;
}

/**
 * Get all object names in tree
 */
function getAllNames(root: Object3D): string[] {
  const names: string[] = [];
  root.traverse((child) => {
    if (child.name) {
      names.push(child.name);
    }
  });
  return names;
}

describe('three-geometry-editor', () => {

  describe('clearGeometryEditingFlags', () => {
    it('should clear geometryEditingSkipRules flag on all nodes', () => {
      const root = createBeamPipeStructure();

      // Set flags on some nodes
      root.traverse((child) => {
        child.userData['geometryEditingSkipRules'] = true;
      });

      // Verify flags are set
      let flaggedCount = 0;
      root.traverse((child) => {
        if (child.userData['geometryEditingSkipRules']) flaggedCount++;
      });
      expect(flaggedCount).toBeGreaterThan(0);

      // Clear flags
      clearGeometryEditingFlags(root);

      // Verify all flags are cleared
      root.traverse((child) => {
        expect(child.userData['geometryEditingSkipRules']).toBeUndefined();
      });
    });
  });

  describe('editThreeNodeContent with merge=false', () => {

    it('should process only meshes matching pattern when pattern is provided', () => {
      const root = createBeamPipeStructure();

      const rule: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,
        merge: false,
        outline: false
      };

      editThreeNodeContent(root, rule);

      // Check that v_upstream meshes have the new color
      root.traverse((child) => {
        if (child instanceof Mesh && child.name.includes('v_upstream')) {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
        }
      });
    });

    it('should set geometryEditingSkipRules flag on processed meshes', () => {
      const root = createBeamPipeStructure();
      clearGeometryEditingFlags(root);

      const rule: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,
        merge: false,
        outline: false
      };

      editThreeNodeContent(root, rule);

      // v_upstream meshes should have the flag set
      root.traverse((child) => {
        if (child instanceof Mesh && child.name.includes('v_upstream')) {
          expect(child.userData['geometryEditingSkipRules']).toBe(true);
        }
      });

      // Other meshes should NOT have the flag
      root.traverse((child) => {
        if (child instanceof Mesh && !child.name.includes('v_upstream')) {
          expect(child.userData['geometryEditingSkipRules']).toBeUndefined();
        }
      });
    });

    it('should skip meshes with geometryEditingSkipRules=true when processing without pattern', () => {
      const root = createBeamPipeStructure();
      clearGeometryEditingFlags(root);

      // First rule: process v_upstream meshes
      const rule1: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,  // Red
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule1);

      // Second rule: "the rest" (no pattern)
      const rule2: EditThreeNodeRule = {
        color: 0x00ff00,  // Green
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule2);

      // v_upstream meshes should still be red (not overwritten by rule2)
      root.traverse((child) => {
        if (child instanceof Mesh && child.name.includes('v_upstream')) {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
        }
      });

      // Other meshes should be green
      root.traverse((child) => {
        if (child instanceof Mesh && !child.name.includes('v_upstream') && !child.name.includes('outline')) {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0x00ff00);
        }
      });
    });

    it('should not create outline of outline', () => {
      const root = createBeamPipeStructure();
      clearGeometryEditingFlags(root);

      const initialCount = countObjectsWithGeometry(root);

      // First rule: process v_upstream with outline
      const rule1: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,
        merge: false,
        outline: true
      };
      editThreeNodeContent(root, rule1);

      // Should have created 2 outlines (for 2 v_upstream meshes)
      const afterRule1Count = countObjectsWithGeometry(root);
      expect(afterRule1Count).toBe(initialCount + 2);

      // Second rule: "the rest" with outline
      const rule2: EditThreeNodeRule = {
        color: 0x00ff00,
        merge: false,
        outline: true
      };
      editThreeNodeContent(root, rule2);

      // Should have created outlines only for the 3 remaining original meshes
      // NOT for the outline objects created by rule1
      const afterRule2Count = countObjectsWithGeometry(root);
      expect(afterRule2Count).toBe(initialCount + 2 + 3);  // 5 original + 2 outlines from rule1 + 3 outlines from rule2

      // Verify no "outline_outline" objects exist
      const names = getAllNames(root);
      const doubleOutlines = names.filter(n => n.includes('outline_outline') || n.includes('_outline_outlin'));
      expect(doubleOutlines).toEqual([]);
    });
  });

  describe('editThreeNodeContent with hierarchical structure', () => {

    it('should apply style to descendants when applyToDescendants is true (default)', () => {
      const root = createHierarchicalBeamPipe();
      clearGeometryEditingFlags(root);

      // Rule matching v_upstream_coating (a Group)
      const rule: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,  // Red
        merge: false,
        outline: false
        // applyToDescendants defaults to true
      };

      editThreeNodeContent(root, rule);

      // Children of v_upstream_coating should be red
      root.traverse((child) => {
        if (child instanceof Mesh && (child.name === 'Left' || child.name === 'Right')) {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
        }
      });
    });

    it('should skip descendants in "the rest" rule when parent was processed', () => {
      const root = createHierarchicalBeamPipe();
      clearGeometryEditingFlags(root);

      // First rule: match v_upstream_coating
      const rule1: EditThreeNodeRule = {
        patterns: ['**/v_upstream_coating'],
        color: 0xff0000,  // Red
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule1);

      // Second rule: "the rest" (no pattern)
      const rule2: EditThreeNodeRule = {
        color: 0x00ff00,  // Green
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule2);

      // v_upstream_coating children (Left, Right) should still be red
      // They should not be overwritten by rule2 due to hierarchical skip
      root.traverse((child) => {
        if (child instanceof Mesh && (child.name === 'Left' || child.name === 'Right')) {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
        }
      });

      // Other meshes should be green
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'center_pipe') {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0x00ff00);
        }
      });
    });

    it('should handle parent and child with same name pattern without duplicates', () => {
      const root = createSameNameHierarchy();
      clearGeometryEditingFlags(root);

      const initialCount = countObjectsWithGeometry(root);
      expect(initialCount).toBe(2); // v_upstream_coating mesh + other_pipe mesh

      // Rule matching both the Group and its child Mesh (same name pattern)
      const rule: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,  // Red
        merge: false,
        outline: true
      };

      editThreeNodeContent(root, rule);

      // Should create only ONE outline (for the one mesh)
      const afterCount = countObjectsWithGeometry(root);
      expect(afterCount).toBe(initialCount + 1); // +1 outline for the mesh

      // The mesh should be styled
      let styledMeshCount = 0;
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'v_upstream_coating') {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
          styledMeshCount++;
        }
      });
      expect(styledMeshCount).toBe(1); // Only one mesh with that name
    });

    it('should skip child in "the rest" when parent was matched even with same name', () => {
      const root = createSameNameHierarchy();
      clearGeometryEditingFlags(root);

      // First rule: match v_upstream pattern
      const rule1: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,  // Red
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule1);

      // Second rule: "the rest"
      const rule2: EditThreeNodeRule = {
        color: 0x00ff00,  // Green
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule2);

      // v_upstream_coating mesh should still be red
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'v_upstream_coating') {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
        }
      });

      // other_pipe should be green
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'other_pipe') {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0x00ff00);
        }
      });
    });

    it('should not apply to descendants when applyToDescendants is false', () => {
      const root = createHierarchicalBeamPipe();
      clearGeometryEditingFlags(root);

      // Rule matching v_upstream_coating (a Group) with applyToDescendants=false
      const rule: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        color: 0xff0000,  // Red
        merge: false,
        outline: false,
        applyToDescendants: false
      };

      editThreeNodeContent(root, rule);

      // When applyToDescendants is false and the matched node is a Group (not Mesh),
      // no styling is applied because Groups don't have geometry.
      // Children of v_upstream_coating (Left, Right) should NOT be red
      root.traverse((child) => {
        if (child instanceof Mesh && (child.name === 'Left' || child.name === 'Right')) {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xffffff);  // Original color
        }
      });

      // v_downstream_section also matches the pattern (**/v_upstream* doesn't match it - it's v_DOWNstream)
      // so it should remain original color
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'v_downstream_section') {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xffffff);  // Original color
        }
      });
    });
  });

  describe('editThreeNodeContent with merge=true', () => {

    it('should set geometryEditingSkipRules on merged mesh', () => {
      const root = createBeamPipeStructure();
      clearGeometryEditingFlags(root);

      const rule: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        merge: true,
        outline: false,
        newName: 'merged_upstream'
      };

      editThreeNodeContent(root, rule);

      // Find the merged mesh
      let mergedMesh: Mesh | null = null;
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'merged_upstream') {
          mergedMesh = child;
        }
      });

      expect(mergedMesh).not.toBeNull();
      expect(mergedMesh!.userData['geometryEditingSkipRules']).toBe(true);
    });

    it('should not re-process merged meshes in subsequent rules without pattern', () => {
      const root = createBeamPipeStructure();
      clearGeometryEditingFlags(root);

      // First rule: merge v_upstream meshes
      const rule1: EditThreeNodeRule = {
        patterns: ['**/v_upstream*'],
        merge: true,
        outline: false,
        newName: 'merged_upstream',
        color: 0xff0000
      };
      editThreeNodeContent(root, rule1);

      // Second rule: "the rest"
      const rule2: EditThreeNodeRule = {
        color: 0x00ff00,
        merge: false,
        outline: false
      };
      editThreeNodeContent(root, rule2);

      // Merged mesh should still be red
      root.traverse((child) => {
        if (child instanceof Mesh && child.name === 'merged_upstream') {
          expect((child.material as MeshBasicMaterial).color.getHex()).toBe(0xff0000);
        }
      });
    });
  });
});

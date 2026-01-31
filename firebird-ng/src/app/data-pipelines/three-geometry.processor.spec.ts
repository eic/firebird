import * as THREE from 'three';
import { ruleSetsFromObj, DetectorThreeRuleSet } from './three-geometry.processor';
import { EditThreeNodeRule } from '../utils/three-geometry-editor';

describe('ruleSetsFromObj with materialJson', () => {

    it('should parse "materialJson" into a real THREE.Material', () => {
        const raw = [
            {
                names: ['MyDetector'],
                rules: [
                    {
                        color: '0xff00ff',
                        materialJson: {
                            // The minimal JSON structure for the built-in MaterialLoader
                            type: 'MeshStandardMaterial',
                            color: 16711680, // 0xff0000
                            roughness: 0.5
                        }
                    },
                    {
                        // a second rule with no materialJson => no parse attempt
                        color: '0x00ffff'
                    }
                ]
            }
        ];

        const sets = ruleSetsFromObj(raw);
        expect(sets.length).toBe(1);

        const set = sets[0];
        expect(set.names).toEqual(['MyDetector']);
        expect(set.rules.length).toBe(2);

        // First rule
        const rule1: EditThreeNodeRule = set.rules[0];
        // color: '0xff00ff' => number
        expect(rule1.color).toBe(0xff00ff);

        // Check that a THREE.Material was created from materialJson
        expect(rule1.material).toBeDefined();
        expect(rule1.material).toBeInstanceOf(THREE.MeshStandardMaterial);
        const mat1 = rule1.material as THREE.MeshStandardMaterial;
        // color: 16711680 => 0xff0000
        expect(mat1.color.getHex()).toBe(0xff0000);
        expect(mat1.roughness).toBe(0.5);

        // Second rule => no materialJson, so no .material created
        const rule2: EditThreeNodeRule = set.rules[1];
        expect(rule2.color).toBe(0x00ffff);
        expect(rule2.material).toBeUndefined();
    });

    it('should handle parse errors gracefully', () => {
        const raw = [
            {
                rules: [
                    {
                        materialJson: {
                            type: 'UnknownMaterialType', // invalid
                            color: 0xffffff
                        }
                    }
                ]
            }
        ];

        vi.spyOn(console, 'error');
        const sets = ruleSetsFromObj(raw);
        expect(sets.length).toBe(1);
        expect(sets[0].rules[0].material).toBeUndefined(); // parse failed

        expect(console.error).toHaveBeenCalled(); // logs the parse error
    });

    it('should return an empty list if top-level is not array', () => {
        const result = ruleSetsFromObj({ nonsense: true });
        expect(result).toEqual([]);
    });

    it('should handle missing "rules" arrays by returning an empty "rules"', () => {
        const raw = [
            {
                names: ['NoRulesHere']
            }
        ];
        const sets = ruleSetsFromObj(raw);
        expect(sets[0].rules.length).toBe(0);
    });
});

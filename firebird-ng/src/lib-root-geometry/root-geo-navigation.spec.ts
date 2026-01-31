import type { Mock } from "vitest";
/**
 * @date Created on July 10, 2024
 * @author Dmitry Romanov
 *
 * @license This file is part of Firebird display, which is released under a license agreement
 * available in the LICENSE file located in the root directory of this project source tree. This
 * file is subject to that license and is intended to be used in accordance with it.
 *
 * @summary Unit tests for CERN ROOT geometry navigation functions
 */

import { walkGeoNodes, findGeoNodes } from './root-geo-navigation';

describe('walkGeoNodes', () => {
    let mockCallback: Mock;
    const rootNode = {
        fName: "Root",
        fVolume: {
            fNodes: {
                arr: [
                    { fName: "Child1", fVolume: { fNodes: { arr: [{ fName: "GrandChild1", fVolume: { fNodes: { arr: [] } } }] } } },
                    { fName: "Child2", fVolume: { fNodes: { arr: [] } } }
                ]
            }
        }
    };

    beforeEach(() => {
        mockCallback = vi.fn().mockReturnValue(true);
        ;
    });

    it('should not traverse beyond the specified max level', () => {
        walkGeoNodes(rootNode, mockCallback, 1);
        expect(vi.mocked(mockCallback).mock.calls.length).toEqual(3); // Root, Child1, Child2
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "Root" }), 'Root', 0);
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "Child1" }), 'Root/Child1', 1);
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "Child2" }), 'Root/Child2', 1);
    });

    it('should handle empty node volumes correctly', () => {
        const emptyNode = { fName: "Empty", fVolume: null };
        walkGeoNodes(emptyNode, mockCallback, 1);
        expect(vi.mocked(mockCallback).mock.calls.length).toEqual(1); // Only the empty node should invoke the callback
        expect(mockCallback).toHaveBeenCalledWith(emptyNode, 'Empty', 0);
    });

    it('should invoke callback for each node up to the specified max level', () => {
        walkGeoNodes(rootNode, mockCallback, Infinity); // Using Infinity to check all levels
        expect(vi.mocked(mockCallback).mock.calls.length).toEqual(4); // Root, Child1, GrandChild1, Child2
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "Root" }), 'Root', 0);
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "Child1" }), 'Root/Child1', 1);
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "GrandChild1" }), 'Root/Child1/GrandChild1', 2);
        expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({ fName: "Child2" }), 'Root/Child2', 1);
    });
});


describe('findGeoNodes', () => {
    const rootNode = {
        fName: "Root",
        fVolume: {
            fNodes: {
                arr: [
                    { fName: "Child1", fVolume: { fNodes: { arr: [{ fName: "GrandChild1", fVolume: { fNodes: { arr: [] } } }] } } },
                    { fName: "Child2", fVolume: { fNodes: { arr: [] } } }
                ]
            }
        }
    };

    it('should return only nodes matching the specified pattern', () => {
        const pattern = "*Child2*";
        const results = findGeoNodes(rootNode, pattern);
        expect(results.length).toBe(1);
        expect(results[0].fullPath).toContain('Root/Child2');
    });

    it('should return an empty array if no nodes match the pattern', () => {
        const pattern = "*NotExist*";
        const results = findGeoNodes(rootNode, pattern);
        expect(results.length).toBe(0);
    });

    it('should stop search if maxLevel is reached', () => {
        const pattern = "*Child1";
        const results = findGeoNodes(rootNode, pattern, 1);
        expect(results.length).toBe(1);
    });

    it('should handle patterns that match deeply nested nodes', () => {
        const pattern = "*GrandChild*";
        const results = findGeoNodes(rootNode, pattern);
        expect(results.length).toBe(1);
        expect(results[0].fullPath).toContain('Root/Child1/GrandChild1');
    });
});

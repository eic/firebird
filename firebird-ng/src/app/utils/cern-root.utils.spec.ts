import { walkGeoNodes, GeoNodeWalkCallback, findGeoNodes, GeoAttBits, testGeoBit, setGeoBit, toggleGeoBit} from './cern-root.utils';

describe('walkGeoNodes', () => {
  let mockCallback: jasmine.Spy<GeoNodeWalkCallback>;
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
    mockCallback = jasmine.createSpy('GeoNodeWalkCallback').and.returnValue(true);;
  });

  it('should not traverse beyond the specified max level', () => {
    walkGeoNodes(rootNode, mockCallback, 1);
    expect(mockCallback.calls.count()).toEqual(3); // Root, Child1, Child2
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "Root" }), 'Root', 0);
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "Child1" }), 'Root/Child1', 1);
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "Child2" }), 'Root/Child2', 1);
  });

  it('should handle empty node volumes correctly', () => {
    const emptyNode = { fName: "Empty", fVolume: null };
    walkGeoNodes(emptyNode, mockCallback, 1);
    expect(mockCallback.calls.count()).toEqual(1); // Only the empty node should invoke the callback
    expect(mockCallback).toHaveBeenCalledWith(emptyNode, 'Empty', 0);
  });

  it('should invoke callback for each node up to the specified max level', () => {
    walkGeoNodes(rootNode, mockCallback, Infinity); // Using Infinity to check all levels
    expect(mockCallback.calls.count()).toEqual(4); // Root, Child1, GrandChild1, Child2
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "Root" }), 'Root', 0);
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "Child1" }), 'Root/Child1', 1);
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "GrandChild1" }), 'Root/Child1/GrandChild1', 2);
    expect(mockCallback).toHaveBeenCalledWith(jasmine.objectContaining({ fName: "Child2" }), 'Root/Child2', 1);
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



describe('GeoBits Functions', () => {
  let volume: any;

  beforeEach(() => {
    volume = { fGeoAtt: 0 }; // Initialize volume with fGeoAtt set to 0
  });

  describe('testGeoBit', () => {
    it('should return false if fGeoAtt is undefined', () => {
      volume.fGeoAtt = undefined;
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeFalse();
    });

    it('should return false if the bit is not set', () => {
      volume.fGeoAtt = 0;
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeFalse();
    });

    it('should return true if the bit is set', () => {
      volume.fGeoAtt = GeoAttBits.kVisThis;
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeTrue();
    });
  });

  describe('setGeoBit', () => {
    it('should set the bit if value is 1', () => {
      setGeoBit(volume, GeoAttBits.kVisThis, 1);
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeTrue();
    });

    it('should clear the bit if value is 0', () => {
      volume.fGeoAtt = GeoAttBits.kVisThis;
      setGeoBit(volume, GeoAttBits.kVisThis, 0);
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeFalse();
    });

    it('should not modify fGeoAtt if it is undefined', () => {
      volume.fGeoAtt = undefined;
      setGeoBit(volume, GeoAttBits.kVisThis, 1);
      expect(volume.fGeoAtt).toBeUndefined();
    });
  });

  describe('toggleGeoBit', () => {
    it('should toggle the bit from 0 to 1', () => {
      toggleGeoBit(volume, GeoAttBits.kVisThis);
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeTrue();
    });

    it('should toggle the bit from 1 to 0', () => {
      volume.fGeoAtt = GeoAttBits.kVisThis;
      toggleGeoBit(volume, GeoAttBits.kVisThis);
      expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBeFalse();
    });

    it('should not modify fGeoAtt if it is undefined', () => {
      volume.fGeoAtt = undefined;
      toggleGeoBit(volume, GeoAttBits.kVisThis);
      expect(volume.fGeoAtt).toBeUndefined();
    });
  });
});

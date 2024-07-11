import {GeoAttBits, setGeoBit, testGeoBit, toggleGeoBit} from "./geo-attribute-bits";

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

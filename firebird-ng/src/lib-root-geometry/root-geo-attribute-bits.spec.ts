/**
 * @date Created on July 10, 2024
 * @author Dmitry Romanov
 *
 * @license This file is part of the Firebird display, which is released under a license agreement
 * available in the LICENSE file located in the root directory of this project source tree. This
 * file is subject to that license and is intended to be used in accordance with it.
 *
 * @summary Unit test for GeoAttBits enum and functions for its manipulation.
 */

import { GeoAttBits, setGeoBit, testGeoBit, toggleGeoBit } from "./root-geo-attribute-bits";

describe('GeoBits Functions', () => {
    let volume: any;

    beforeEach(() => {
        volume = { fGeoAtt: 0 }; // Initialize volume with fGeoAtt set to 0
    });

    describe('testGeoBit', () => {
        it('should return false if fGeoAtt is undefined', () => {
            volume.fGeoAtt = undefined;
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(false);
        });

        it('should return false if the bit is not set', () => {
            volume.fGeoAtt = 0;
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(false);
        });

        it('should return true if the bit is set', () => {
            volume.fGeoAtt = GeoAttBits.kVisThis;
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(true);
        });
    });

    describe('setGeoBit', () => {
        it('should set the bit if value is 1', () => {
            setGeoBit(volume, GeoAttBits.kVisThis, 1);
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(true);
        });

        it('should clear the bit if value is 0', () => {
            volume.fGeoAtt = GeoAttBits.kVisThis;
            setGeoBit(volume, GeoAttBits.kVisThis, 0);
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(false);
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
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(true);
        });

        it('should toggle the bit from 1 to 0', () => {
            volume.fGeoAtt = GeoAttBits.kVisThis;
            toggleGeoBit(volume, GeoAttBits.kVisThis);
            expect(testGeoBit(volume, GeoAttBits.kVisThis)).toBe(false);
        });

        it('should not modify fGeoAtt if it is undefined', () => {
            volume.fGeoAtt = undefined;
            toggleGeoBit(volume, GeoAttBits.kVisThis);
            expect(volume.fGeoAtt).toBeUndefined();
        });
    });
});



// /** @summary Test fGeoAtt bits
//  * @private */
// function testGeoBit(volume:any , f) {
//   const att = volume.fGeoAtt;
//   return att === undefined ? false : ((att & f) !== 0);
// }
/** @summary Generate mask for given bit
 * @param {number} n bit number
 * @return {Number} produced mask
 * @private */
function BIT(n:number) { return 1 << n; }

/** @summary TGeo-related bits
 * @private */
export enum GeoAttBits {
  kVisOverride = BIT(0),  // volume's vis. attributes are overwritten
  kVisNone= BIT(1),  // the volume/node is invisible, as well as daughters
  kVisThis= BIT(2),  // this volume/node is visible
  kVisDaughters= BIT(3),  // all leaves are visible
  kVisOneLevel= BIT(4),  // first level daughters are visible (not used)
  kVisStreamed= BIT(5),  // true if attributes have been streamed
  kVisTouched= BIT(6),  // true if attributes are changed after closing geom
  kVisOnScreen= BIT(7),  // true if volume is visible on screen
  kVisContainers= BIT(12), // all containers visible
  kVisOnly= BIT(13), // just this visible
  kVisBranch= BIT(14), // only a given branch visible
  kVisRaytrace= BIT(15)  // raytracing flag
}

/** @summary Test fGeoAtt bits
 * @private */
export function testGeoBit(volume:any , f: GeoAttBits) {
  const att = volume.fGeoAtt;
  return att === undefined ? false : ((att & f) !== 0);
}


/** @summary Set fGeoAtt bit
 * @private */
export function setGeoBit(volume:any, f: GeoAttBits, value: number) {
  if (volume.fGeoAtt === undefined) return;
  volume.fGeoAtt = value ? (volume.fGeoAtt | f) : (volume.fGeoAtt & ~f);
}

/** @summary Toggle fGeoAttBit
 * @private */
export function toggleGeoBit(volume:any, f: GeoAttBits) {
  if (volume.fGeoAtt !== undefined)
    volume.fGeoAtt = volume.fGeoAtt ^ (f & 0xffffff);
}

/** @summary Prints the status of all geoBITS flags for a given volume
 * @param {Object} volume - The volume object to check
 * @private */
export function printAllGeoBitsStatus(volume:any) {
  const bitDescriptions = [
    { name: 'kVisOverride  ', bit: GeoAttBits.kVisOverride },
    { name: 'kVisNone      ', bit: GeoAttBits.kVisNone },
    { name: 'kVisThis      ', bit: GeoAttBits.kVisThis },
    { name: 'kVisDaughters ', bit: GeoAttBits.kVisDaughters },
    { name: 'kVisOneLevel  ', bit: GeoAttBits.kVisOneLevel },
    { name: 'kVisStreamed  ', bit: GeoAttBits.kVisStreamed },
    { name: 'kVisTouched   ', bit: GeoAttBits.kVisTouched },
    { name: 'kVisOnScreen  ', bit: GeoAttBits.kVisOnScreen },
    { name: 'kVisContainers', bit: GeoAttBits.kVisContainers },
    { name: 'kVisOnly      ', bit: GeoAttBits.kVisOnly },
    { name: 'kVisBranch    ', bit: GeoAttBits.kVisBranch },
    { name: 'kVisRaytrace  ', bit: GeoAttBits.kVisRaytrace }
  ];

  console.log(`fGeoAttr for ${volume._typename}: ${volume.fName}`);
  bitDescriptions.forEach(desc => {
    const isSet = testGeoBit(volume, desc.bit);
    console.log(`  ${desc.name}: ${isSet ? 'Yes' : 'No'}`);
  });
}

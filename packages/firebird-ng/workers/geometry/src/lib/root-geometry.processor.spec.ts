/**
 * The worker-side TGeo edits: a detector pattern that matches several
 * top-level nodes (two copies of one detector) edits each of them instead of
 * failing the load, and cut lists remove top-level detectors by name prefix.
 */
import { EditActions } from '@dexvis/root-geo-tree-editor';
import { applyDetectorEditRules, pruneTopLevelDetectors } from './root-geometry.processor';

/** A TGeo node with daughters, wired the way jsroot reads them (daughters know their mother volume). */
function geoNode(name: string, daughters: any[] = []): any {
  const node = { fName: name, fGeoAtt: 0, fVolume: { fNodes: { arr: daughters }, fGeoAtt: 0 } };
  for (const daughter of daughters) daughter.fMother = node.fVolume;
  return node;
}

function geoManager(topNodes: any[]): any {
  const master = { fNodes: { arr: topNodes }, fGeoAtt: 0 };
  for (const node of topNodes) node.fMother = master;
  return { fName: 'Default', fMasterVolume: master };
}

const daughterNames = (node: any) => node.fVolume.fNodes.arr.map((daughter: any) => daughter.fName);

describe('applyDetectorEditRules', () => {
  it('edits every top-level node that matches a pattern', () => {
    const trackerA = geoNode('Tracker_14', [geoNode('Envelope_lens_vol_0'), geoNode('Envelope_box_0')]);
    const trackerB = geoNode('Tracker_15', [geoNode('Envelope_lens_vol_0'), geoNode('Envelope_box_0')]);
    const other = geoNode('Calorimeter_24', [geoNode('Envelope_lens_vol_0')]);
    const manager = geoManager([trackerA, trackerB, other]);

    applyDetectorEditRules(manager, [
      { namePattern: '*/Tracker*', editRules: [{ pattern: '*/Envelope_lens_vol*', action: EditActions.Remove }] },
      { namePattern: '*/NotInThisGeometry*', editRules: [{ pattern: '*', action: EditActions.RemoveChildren }] },
    ]);

    expect(daughterNames(trackerA)).toEqual(['Envelope_box_0']);
    expect(daughterNames(trackerB)).toEqual(['Envelope_box_0']);
    expect(daughterNames(other)).toEqual(['Envelope_lens_vol_0']);
  });
});

describe('pruneTopLevelDetectors', () => {
  it('removes the top-level detectors whose names start with a listed prefix', () => {
    const manager = geoManager([geoNode('BeamMagnet_32'), geoNode('Tracker_14'), geoNode('FarCalorimeter_40')]);
    const result = pruneTopLevelDetectors(manager, ['Beam', 'Far']);
    expect(result.removedNodes.map((node: any) => node.fName)).toEqual(['BeamMagnet_32', 'FarCalorimeter_40']);
    expect(manager.fMasterVolume.fNodes.arr.map((node: any) => node.fName)).toEqual(['Tracker_14']);
  });
});

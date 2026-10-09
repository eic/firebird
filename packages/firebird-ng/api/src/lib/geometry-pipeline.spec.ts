/**
 * The geometry pipeline seams as data: rule contributions merge by name
 * (a later name replaces an earlier one), each load selects one rule set and
 * one cut list, and post-processors run in registration order with their
 * `after` constraints.
 */
import {
  GeometryPostProcessorRegistration,
  RootGeometryRules,
  orderGeometryPostProcessors,
  resolveRootGeometryRules,
  selectRootGeometryLoadRules,
} from './geometry-pipeline';

const removeBeam: RootGeometryRules = { cutLists: { central: { label: 'Central', remove: ['Beam'] } } };

describe('pre-build TGeo rules', () => {
  it('merges contributions in order; a later name replaces an earlier one', async () => {
    const rules = await resolveRootGeometryRules([
      removeBeam,
      { editRules: { default: { detectors: [{ namePattern: '*/A*', editRules: [] }] } } },
      // A dynamic import, the way a pack keeps rule data out of the initial bundle
      () => Promise.resolve<RootGeometryRules>({ cutLists: { central: { remove: ['Beam', 'Far'] }, beamline: { remove: ['Q'] } } }),
    ]);
    expect(rules.cutLists).toEqual({ central: { remove: ['Beam', 'Far'] }, beamline: { remove: ['Q'] } });
    expect(Object.keys(rules.editRules ?? {})).toEqual(['default']);
  });

  it('selects the named rule set and cut list; off and unknown names select nothing', async () => {
    const rules = await resolveRootGeometryRules([removeBeam]);
    expect(selectRootGeometryLoadRules(rules, 'off', 'central')).toEqual({ editRules: [], cutList: ['Beam'] });
    expect(selectRootGeometryLoadRules(rules, 'default', 'unknown')).toEqual({ editRules: [], cutList: [] });
  });

  it('stays structured-cloneable, as the worker message requires', async () => {
    const rules = await resolveRootGeometryRules([removeBeam]);
    const selected = selectRootGeometryLoadRules(rules, 'off', 'central');
    expect(structuredClone(selected)).toEqual(selected);
  });
});

describe('orderGeometryPostProcessors', () => {
  const processor = (id: string, after?: string[]): GeometryPostProcessorRegistration =>
    ({ id, after, load: () => Promise.reject(new Error('not loaded in this spec')) });
  const ids = (list: GeometryPostProcessorRegistration[]) => list.map(registration => registration.id);

  it('keeps registration order without constraints', () => {
    expect(ids(orderGeometryPostProcessors([processor('a'), processor('b'), processor('c')]))).toEqual(['a', 'b', 'c']);
  });

  it('runs a processor after the ids in its `after`, and ignores ids nobody registered', () => {
    const ordered = orderGeometryPostProcessors([processor('arranger', ['mirrors']), processor('other', ['missing']), processor('mirrors')]);
    expect(ids(ordered)).toEqual(['other', 'mirrors', 'arranger']);
  });

  it('a later registration with the same id replaces the earlier one in place', () => {
    const replacement = processor('a', ['b']);
    const ordered = orderGeometryPostProcessors([processor('a'), processor('b'), replacement]);
    expect(ordered).toEqual([expect.objectContaining({ id: 'b' }), replacement]);
  });

  it('names the processors of an `after` cycle', () => {
    expect(() => orderGeometryPostProcessors([processor('a', ['b']), processor('b', ['a'])]))
      .toThrow('Geometry post-processors wait for each other: a, b');
  });
});

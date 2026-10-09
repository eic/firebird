import { runIsolated, shouldRenderFrame } from './render-loop';

describe('shouldRenderFrame', () => {
  const clean = [{ dirty: false }, { dirty: false }];

  it('stays idle on demand when nothing is dirty', () => {
    expect(shouldRenderFrame(false, false, clean)).toBe(false);
    expect(shouldRenderFrame(false, false, [])).toBe(false);
  });

  it('renders on demand after invalidate() or when any one view is dirty', () => {
    expect(shouldRenderFrame(false, true, clean)).toBe(true);
    expect(shouldRenderFrame(false, false, [{ dirty: false }, { dirty: true }])).toBe(true);
  });

  it('renders every frame in continuous mode', () => {
    expect(shouldRenderFrame(true, false, clean)).toBe(true);
  });
});

describe('runIsolated', () => {
  it('keeps calling the remaining targets after one throws, and reports the offenders', () => {
    const called: string[] = [];
    const errors: string[] = [];
    const failed = runIsolated(['a', 'bad', 'c', 'worse'],
      target => {
        called.push(target);
        if (target === 'bad' || target === 'worse') throw new Error(target);
      },
      (target, error) => errors.push(`${target}:${(error as Error).message}`));

    expect(called).toEqual(['a', 'bad', 'c', 'worse']);
    expect(failed).toEqual(['bad', 'worse']);
    expect(errors).toEqual(['bad:bad', 'worse:worse']);
  });

  it('returns no offenders when every target succeeds', () => {
    expect(runIsolated([1, 2, 3], () => undefined, () => { throw new Error('unreachable'); })).toEqual([]);
  });
});

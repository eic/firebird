// point-trajectory.component.spec.ts
import { PointTrajectoryComponent, TrackerLinePointTrajectoryComponentFactory } from './point-trajectory.event-component';
import { getComponentFactory } from './entry-component';
import {initComponentFactories} from "./default-components-init";

/**
 * Example test suite for PointTrajectoryComponent and its factory.
 */
describe('PointTrajectoryComponent', () => {
  beforeEach(()=>{
    initComponentFactories();
  });

  it('should be registered in the component factory registry', () => {
    const factory = getComponentFactory(PointTrajectoryComponent.type);
    expect(factory).toBeDefined();
    expect(factory instanceof TrackerLinePointTrajectoryComponentFactory).toBeTrue();
  });

  it('should create a component from a valid Dex object', () => {
    // Prepare a mock DEX object
    const dexObj = {
      name: 'CentralTrackSegments',
      type: 'TrackerLinePointTrajectory',
      originType: ['edm4eic::TrackPoint','edm4eic::TrackSegmentData'],
      paramColumns: ['theta','phi','qOverP','charge','pdg'],
      pointColumns: ['x','y','z','t','dx','dy','dz','dt'],
      lines: [
        {
          points: [
            [0, 0, 0, 100, 0.1, 0.1, 0.1, 0.0],
            [10, 20, 30, 120, 0.2, 0.2, 0.2, 0.1],
          ],
          params: [1.57, 3.14, -0.0005, -1, 11]
        },
        {
          points: [],
          params: []
        }
      ]
    };

    // Retrieve the factory and create the component
    const factory = getComponentFactory(PointTrajectoryComponent.type);
    expect(factory).toBeTruthy();

    const component = factory?.fromDexObject(dexObj) as PointTrajectoryComponent;
    expect(component).toBeDefined();
    expect(component.name).toBe('CentralTrackSegments');
    expect(component.paramColumns).toEqual(['theta','phi','qOverP','charge','pdg']);
    expect(component.pointColumns).toEqual(['x','y','z','t','dx','dy','dz','dt']);

    // Lines
    expect(component.lines.length).toBe(2);
    // First line
    const line1 = component.lines[0];
    expect(line1.points.length).toBe(2);
    expect(line1.params).toEqual([1.57, 3.14, -0.0005, -1, 11]);
    // Second line
    const line2 = component.lines[1];
    expect(line2.points.length).toBe(0);
    expect(line2.params.length).toBe(0);
  });

  it('should serialize back to Dex format via toDexObject()', () => {
    // Create a component manually
    const component = new PointTrajectoryComponent('MyTrajectory', 'testOrigin');
    component.paramColumns = ['alpha','beta'];
    component.pointColumns = ['x','y','z','t'];
    component.lines = [
      {
        points: [[1,2,3,10],[4,5,6,20]],
        params: [42, 99]
      }
    ];

    // Convert to Dex
    const dex = component.toDexObject();

    // Check top-level
    expect(dex.name).toBe('MyTrajectory');
    expect(dex.type).toBe('TrackerLinePointTrajectory');
    expect(dex.originType).toBe('testOrigin');
    expect(dex.paramColumns).toEqual(['alpha','beta']);
    expect(dex.pointColumns).toEqual(['x','y','z','t']);

    // Check lines
    expect(dex.lines.length).toBe(1);
    expect(dex.lines[0].points.length).toBe(2);
    expect(dex.lines[0].points[0]).toEqual([1,2,3,10]);
    expect(dex.lines[0].params).toEqual([42,99]);
  });

});

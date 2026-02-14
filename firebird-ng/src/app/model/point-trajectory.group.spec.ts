// point-trajectory.component.spec.ts
import { PointTrajectoryGroup, PointTrajectoryGroupFactory } from './point-trajectory.group';
import { getEventGroupFactory } from './event-group';
import { initGroupFactories } from "./default-group-init";


describe('PointTrajectoryGroup', () => {
    beforeEach(() => {
        initGroupFactories();
    });

    it('should be registered in the component factory registry', () => {
        const factory = getEventGroupFactory(PointTrajectoryGroup.type);
        expect(factory).toBeDefined();
        expect(factory instanceof PointTrajectoryGroupFactory).toBe(true);
    });

    it('should create a component from a valid Dex object', () => {
        // Prepare a mock DEX object
        const dexObj = {
            name: 'CentralTrackSegments',
            type: 'PointTrajectory',
            origin: ['edm4eic::TrackPoint', 'edm4eic::TrackSegmentData'],
            paramColumns: ['theta', 'phi', 'qOverP', 'charge', 'pdg'],
            pointColumns: ['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt'],
            trajectories: [
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
        const factory = getEventGroupFactory(PointTrajectoryGroup.type);
        expect(factory).toBeTruthy();

        const component = factory?.fromDexObject(dexObj) as PointTrajectoryGroup;
        expect(component).toBeDefined();
        expect(component.name).toBe('CentralTrackSegments');
        expect(component.paramColumns).toEqual(['theta', 'phi', 'qOverP', 'charge', 'pdg']);
        expect(component.pointColumns).toEqual(['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt']);

        // Lines
        expect(component.trajectories.length).toBe(2);
        // First line
        const trajectory1 = component.trajectories[0];
        expect(trajectory1.points.length).toBe(2);
        expect(trajectory1.params).toEqual([1.57, 3.14, -0.0005, -1, 11]);
        // Second line
        const trajectory2 = component.trajectories[1];
        expect(trajectory2.points.length).toBe(0);
        expect(trajectory2.params.length).toBe(0);
    });

    it('should serialize back to Dex format via toDexObject()', () => {
        // Create a component manually
        const component = new PointTrajectoryGroup('MyTrajectory', 'testOrigin');
        component.paramColumns = ['alpha', 'beta'];
        component.pointColumns = ['x', 'y', 'z', 't'];
        component.trajectories = [
            {
                points: [[1, 2, 3, 10], [4, 5, 6, 20]],
                params: [42, 99]
            }
        ];

        // Convert to Dex
        const dex = component.toDexObject();

        // Check top-level
        expect(dex.name).toBe('MyTrajectory');
        expect(dex.type).toBe('PointTrajectory');
        expect(dex.origin).toBe('testOrigin');
        expect(dex.paramColumns).toEqual(['alpha', 'beta']);
        expect(dex.pointColumns).toEqual(['x', 'y', 'z', 't']);

        // Check lines
        expect(dex.trajectories.length).toBe(1);
        expect(dex.trajectories[0].points.length).toBe(2);
        expect(dex.trajectories[0].points[0]).toEqual([1, 2, 3, 10]);
        expect(dex.trajectories[0].params).toEqual([42, 99]);
    });

});

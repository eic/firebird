// trajectory.painter.spec.ts
import { TrajectoryPainter } from './trajectory.painter';
import { PointTrajectoryPiece } from '../model/point-trajectory.piece';

describe('TrajectoryPainter', () => {
    let mockParentNode: any;
    let trajectoryPiece: PointTrajectoryPiece;

    beforeEach(() => {
        // Create a simple mock parent node
        mockParentNode = {
            add: vi.fn(),
            remove: vi.fn()
        };

        // Create a real PointTrajectoryPiece with columnar test data
        trajectoryPiece = new PointTrajectoryPiece('TestTrajectories');
        trajectoryPiece.pointColumns = ['x', 'y', 'z', 't'];
        trajectoryPiece.count = 3;
        // trajectory id == index in every column
        trajectoryPiece.columns = {
            pdg: [11, 22, 2212],      // electron, gamma, proton
            charge: [-1, 0, 1],
        };
        trajectoryPiece.points = [
            // Track 1: t=10 to t=20
            [[0, 0, 0, 10], [10, 0, 0, 20]],
            // Track 2: t=15 to t=35
            [[0, 10, 0, 15], [10, 10, 0, 25], [20, 10, 0, 35]],
            // Track 3: t=40 to t=50
            [[0, 20, 0, 40], [10, 20, 0, 50]],
        ];
    });

    describe('initLines', () => {
        it('should create the correct number of trajectories', () => {

            // Create a test instance
            const testPainter = new TrajectoryPainter(mockParentNode, trajectoryPiece);

            // Check if trajectories were created correctly
            expect(testPainter.trajectories.length).toBe(3);
            expect(mockParentNode.add).toHaveBeenCalled();
        });

        it('should attach per-trajectory params read from the columns', () => {
            const testPainter = new TrajectoryPainter(mockParentNode, trajectoryPiece);
            expect(testPainter.trajectories[0].params['pdg']).toBe(11);
            expect(testPainter.trajectories[2].params['charge']).toBe(1);
        });
    });

    describe('paintNoTime', () => {
        it('should make all trajectories fully visible', () => {
            // Create a painter instance with real initialization
            const testPainter = new TrajectoryPainter(mockParentNode, trajectoryPiece);

            // Reset visibility and instance count for testing
            testPainter.trajectories.forEach(track => {
                track.lineObj.visible = false;
                track.lineObj.geometry.instanceCount = 0;
            });

            // Call paint with no time
            testPainter.paint(null);

            // Verify all trajectories are visible with instanceCount = points.length - 1
            testPainter.trajectories.forEach(track => {
                expect(track.lineObj.visible).toBe(true);
                expect(track.lineObj.geometry.instanceCount).toBe(track.points.length - 1);
            });
        });
    });


    describe('fastPaint', () => {
        let painter: TrajectoryPainter;

        beforeEach(() => {
            // Create a real painter instance
            painter = new TrajectoryPainter(mockParentNode, trajectoryPiece);

            // Verify we have trajectories initialized
            expect(painter.trajectories.length).toBeGreaterThan(0);
        });

        it('should hide tracks that have not started yet', () => {
            painter.paint(5); // Before any track starts

            painter.trajectories.forEach(track => {
                expect(track.lineObj.visible).toBe(false);
            });
        });

        it('should fully show tracks that have ended', () => {
            painter.paint(30); // After track 1 ends

            // Track 1 should be fully visible
            expect(painter.trajectories[0].lineObj.visible).toBe(true);
            expect(painter.trajectories[0].lineObj.geometry.instanceCount).toBe(painter.trajectories[0].points.length - 1);

            // Track 3 should be hidden (not yet started)
            expect(painter.trajectories[2].lineObj.visible).toBe(false);
        });

        it('should partially show tracks based on time', () => {
            painter.paint(30); // In the middle of track 2

            // Track 2 should be partially visible (2 points)
            expect(painter.trajectories[1].lineObj.visible).toBe(true);
            expect(painter.trajectories[1].lastPaintIndex).toBe(1);
        });

        it('should handle time moving forward correctly', () => {
            // First time point
            painter.paint(20);
            expect(painter.trajectories[1].lastPaintIndex).toBe(0);

            // Move forward
            painter.paint(30);
            expect(painter.trajectories[1].lastPaintIndex).toBe(1);
        });

        it('should handle time moving backward correctly', () => {
            // First at later time
            painter.paint(40);
            expect(painter.trajectories[1].lastPaintIndex).toBe(2);

            // Move backward
            painter.paint(20);
            expect(painter.trajectories[1].lastPaintIndex).toBe(0);
        });

        it('should handle invalid lastPaintIndex', () => {
            // Set invalid index
            painter.trajectories[1].lastPaintIndex = 999;

            // Should recover gracefully
            painter.paint(30);

            // Should have valid index now
            expect(painter.trajectories[1].lastPaintIndex).toBeLessThan(painter.trajectories[1].points.length);
        });
    });
});

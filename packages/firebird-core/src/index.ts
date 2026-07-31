// Event model and DEX io
export * from './model/event';
export * from './model/event-group';
export * from './model/box-hit.group';
export * from './model/point-trajectory.group';
export * from './model/data-exchange';
// Importing this module registers the built-in group factories (import side effect)
export * from './model/default-group-init';

// Painters (time-aware rendering of event data into a three.js scene)
export * from './painters/event-group-painter';
export * from './painters/data-model-painter';
export * from './painters/box-hit.painter';
export * from './painters/box-hit-simple.painter';
// step-track.painter also declares a NeonTrackColors enum; the trajectory
// painter's copy is the exported one.
export { StepTrackComponentPainter, type ProcessTrackInfo } from './painters/step-track.painter';
export * from './painters/trajectory.painter';

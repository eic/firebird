// Event model and DEX io
export * from './model/event';
export * from './model/event-piece';
export * from './model/box-hit.piece';
export * from './model/point-trajectory.piece';
export * from './model/data-exchange';
// Explicit registration entry point for no-DI contexts (workers, scripts).
// There are no import side effects anywhere in core.
export * from './model/default-piece-init';

// Loader contracts (implementations are contributed via DI in the Angular layer)
export * from './loaders';

// Painters (time-aware rendering of event data into a three.js scene)
export * from './painters/event-piece-painter';
export * from './painters/data-model-painter';
export * from './painters/default-painters';
export * from './painters/box-hit.painter';
export * from './painters/box-hit-simple.painter';
// step-track.painter also declares a NeonTrackColors enum; the trajectory
// painter's copy is the exported one.
export { StepTrackComponentPainter, type ProcessTrackInfo } from './painters/step-track.painter';
export * from './painters/trajectory.painter';
export * from './painters/batched-trajectory.painter';

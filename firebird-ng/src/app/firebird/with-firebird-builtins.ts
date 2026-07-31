/**
 * The built-in feature pack: Firebird's own group factories, painters, loaders
 * and command handlers, registered through the public extension API — exactly
 * how an experiment pack registers its own. If a built-in cannot live on this
 * surface, a user's feature cannot either.
 */

// Deep imports on purpose: this file is in the INITIAL bundle, and the
// @firebird/core barrel re-exports painters whose modules pull three.js.
// The model modules here are plain TS with no three dependency.
import { BoxHitGroup, BoxHitGroupFactory } from '@firebird/core/model/box-hit.group';
import { PointTrajectoryGroup, PointTrajectoryGroupFactory } from '@firebird/core/model/point-trajectory.group';
import {
  FirebirdFeature,
  firebirdFeatures,
  withCommandHandler,
  withEventGroup,
  withEventLoader,
  withGeometryLoader,
  withLazyPainter,
} from './firebird-features';
import { DexEventLoader, Edm4eicEventLoader, RootGeometryLoader } from './builtin-loaders';
import {
  CameraPresetCommandHandler,
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  SetConfigCommandHandler,
  ShowEventCommandHandler,
} from './builtin-command-handlers';

export function withFirebirdBuiltins(): FirebirdFeature {
  return firebirdFeatures(
    // Event model: DEX type decoders
    withEventGroup(BoxHitGroupFactory),
    withEventGroup(PointTrajectoryGroupFactory),

    // Painters: data -> visuals. Lazy: painter classes pull three.js material
    // code, which must stay out of the initial bundle (the display route
    // chunk shares the same modules, so nothing loads twice).
    withLazyPainter(BoxHitGroup.type, () => import('@firebird/core').then(m => m.BoxHitSimplePainter)),
    withLazyPainter(PointTrajectoryGroup.type, () => import('@firebird/core').then(m => m.TrajectoryPainter)),

    // IO: file formats and URL schemes
    withGeometryLoader(RootGeometryLoader),
    withEventLoader(DexEventLoader),
    withEventLoader(Edm4eicEventLoader),

    // Command vocabulary (URL deep links, server startup, batch)
    withCommandHandler(OpenGeometryCommandHandler),
    withCommandHandler(OpenDexCommandHandler),
    withCommandHandler(ShowEventCommandHandler),
    withCommandHandler(SetConfigCommandHandler),
    withCommandHandler(CameraPresetCommandHandler),
  );
}

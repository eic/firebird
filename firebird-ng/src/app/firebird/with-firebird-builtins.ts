/**
 * The built-in feature pack: Firebird's own piece factories, painters, loaders
 * and command handlers, registered through the public extension API — exactly
 * how an experiment pack registers its own. If a built-in cannot live on this
 * surface, a user's feature cannot either.
 */

// Deep imports on purpose: this file is in the INITIAL bundle, and the
// @firebird/core barrel re-exports painters whose modules pull three.js.
// The model modules here are plain TS with no three dependency.
import { BoxHitPiece, BoxHitPieceFactory } from '@firebird/core/model/box-hit.piece';
import { PointTrajectoryPiece, PointTrajectoryPieceFactory } from '@firebird/core/model/point-trajectory.piece';
import {
  FirebirdFeature,
  firebirdFeatures,
  withCommandHandler,
  withConfigDefaults,
  withEventPiece,
  withEventLoader,
  withGeometryLoader,
  withLazyPainter,
  withLazyThreeExtension,
} from './firebird-features';
import {
  DexEventLoader,
  Edm4eicEventLoader,
  Root2DexEventLoader,
  RootGeometryLoader,
} from './builtin-loaders';
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
    withEventPiece(BoxHitPieceFactory),
    withEventPiece(PointTrajectoryPieceFactory),

    // Painters: data -> visuals. Lazy: painter classes pull three.js material
    // code, which must stay out of the initial bundle (the display route
    // chunk shares the same modules, so nothing loads twice).
    withLazyPainter(BoxHitPiece.type, () => import('@firebird/core').then(m => m.BoxHitSimplePainter)),
    // Registration order matters: the per-track painter stays the default,
    // the batched one (2 draw calls for the whole piece — for huge pieces
    // like MCParticles background frames) is the selectable alternative:
    // painters.byPiece.<name> = trajectory-lines-batched
    withLazyPainter(PointTrajectoryPiece.type, () => import('@firebird/core').then(m => m.TrajectoryPainter)),
    withLazyPainter(PointTrajectoryPiece.type, () => import('@firebird/core').then(m => m.BatchedTrajectoryPainter)),

    // IO: file formats and URL schemes
    withGeometryLoader(RootGeometryLoader),
    withEventLoader(DexEventLoader),
    // Order matters: the in-browser ROOT converter is asked first and claims
    // only what the browser can byte-range itself (http/asset URLs, picked
    // files). XRootD `root://` sources and pyrobird-served paths fall through
    // to the server-conversion loader below, which keeps that path unchanged.
    withEventLoader(Root2DexEventLoader),
    withEventLoader(Edm4eicEventLoader),

    // Command vocabulary (URL deep links, server startup, batch)
    withCommandHandler(OpenGeometryCommandHandler),
    withCommandHandler(OpenDexCommandHandler),
    withCommandHandler(ShowEventCommandHandler),
    withCommandHandler(SetConfigCommandHandler),
    withCommandHandler(CameraPresetCommandHandler),

    // Camera navigation cube. Lazy: it pulls three.js code through
    // @dexvis/viewport-gizmo, which must stay out of the initial bundle.
    withLazyThreeExtension(() =>
      import('./viewport-gizmo.extension').then(m => m.ViewportGizmoExtension)
    ),

    // MCParticles straight lines convert by default but start hidden: every
    // particle of the event is a lot of lines, so the user opts in per piece
    // through the model tree eye (normal config precedence — a deep link or a
    // saved user toggle overrides this default).
    withConfigDefaults({
      'painters.byPiece.MCParticles.visible': false,
    }),
  );
}

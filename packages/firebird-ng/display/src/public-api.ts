/**
 * `@dexvis/firebird-ng/display`: the event display itself. The display
 * pages, the components they are built from, and the services behind them.
 *
 * This entry pulls three.js and Angular Material: reach it through lazy
 * routes or `import()`, never from code in the initial bundle. Pack code
 * that the application config references (features, loaders, command
 * handlers) loads it inside the method that needs it.
 */

// Pages: the routes of a Firebird application
export { MainDisplayComponent } from './lib/pages/main-display/main-display.component';
export { SplitWindowComponent } from './lib/pages/split-window/split-window.component';
export { InputConfigComponent } from './lib/pages/input-config/input-config.component';

// The event display canvas, for pages of your own
export { FirebirdDisplayComponent } from './lib/components/firebird-display/firebird-display.component';
export type { DisplayAttachOptions } from './lib/services/event-display.service';

// Building blocks of the pages
export { FirebirdShellComponent } from './lib/components/firebird-shell/firebird-shell.component';
export { SceneTreeComponent } from './lib/components/scene-tree/scene-tree.component';
export { PresetsTabComponent } from './lib/components/data-selector/presets-tab.component';
export { PhysicsTabComponent } from './lib/components/data-selector/physics-tab.component';
export { ManualTabComponent } from './lib/components/data-selector/manual-tab.component';

// Services a pack may inject
export { EventDisplayService } from './lib/services/event-display.service';
export { DataModelService } from './lib/services/data-model.service';
export { SelectionService } from './lib/services/selection.service';

// Services the built-in loaders and command handlers of the package root use
export { ThreeService } from './lib/services/three.service';
export { GeometryService } from './lib/services/geometry.service';
export { RootFileService } from './lib/services/root-file.service';

// Built-in parts the package root registers lazily
export { ViewportGizmoExtension } from './lib/extensions/viewport-gizmo.extension';
export { monoColorRules } from './lib/theme/mono-geometry-ruleset';

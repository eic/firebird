import {
  Component,
  OnInit,
  AfterViewInit,
  Input,
  ViewChild, OnDestroy, TemplateRef, ElementRef, effect
} from '@angular/core';

import {ALL_GROUPS } from '../../services/geometry.service';
import { GameControllerService } from '../../services/game-controller.service';
import { UserConfigService } from '../../services/user-config.service';

import { SceneTreeComponent } from '../geometry-tree/scene-tree.component';
import { ShellComponent } from '../../components/shell/shell.component';
import { ToolPanelComponent } from '../../components/tool-panel/tool-panel.component';
import { EventSelectorComponent } from '../../components/event-selector/event-selector.component';
import { AutoRotateComponent } from '../../components/auto-rotate/auto-rotate.component';
import { ObjectClippingComponent } from '../../components/object-clipping/object-clipping.component';
import { PhoenixThreeFacade } from "../../utils/phoenix-three-facade";

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import {EventDisplay} from "phoenix-event-display";

import {PerfStatsComponent} from "../../components/perf-stats/perf-stats.component";
import {EventDisplayService} from "../../services/event-display.service";
import {EventTimeControlComponent} from "../../components/event-time-control/event-time-control.component";
import {ServerConfigService} from "../../services/server-config.service";
import {Object3D} from "three";
import {DisplayMode} from "../../painters/data-model-painter";
import {CubeViewportControlComponent} from "../../components/cube-viewport-control/cube-viewport-control.component";


/**
 * This MainDisplayComponent:
 *  - Initializes and uses ThreeService (which sets up scene, camera, controls, etc.).
 *  - Loads geometry via GeometryService, attaches it to scene.
 *  - Loads event data (Dex or custom) via DataModelService, builds objects in "EventData" group.
 *  - Uses EicAnimationsManager for collisions/expansions.
 *  - Has leftover UI logic for sliders, time stepping, left/right pane toggling, etc.
 *  - Has *no* references to phoenix-event-display or eventDisplay.
 */
@Component({
    selector: 'app-main-display',
    templateUrl: './main-display.component.html',
    styleUrls: ['./main-display.component.scss'],
  imports: [
    MatIcon,
    MatButton,
    MatTooltip,
    MatIconButton,
    SceneTreeComponent,
    ShellComponent,
    ToolPanelComponent,
    EventSelectorComponent,
    AutoRotateComponent,
    ObjectClippingComponent,
    PerfStatsComponent,
    EventTimeControlComponent,
    CubeViewportControlComponent
  ]
})
export class MainDisplayComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input()
  eventDataImportOptions: string[] = []; // example, if you used them in UI

  @ViewChild('displayHeaderControls', { static: true })
  displayHeaderControls!: TemplateRef<any>;

  @ViewChild('eventDisplay')
  eventDisplayDiv!: ElementRef;

  // For referencing child components
  @ViewChild(ShellComponent)
  displayShellComponent!: ShellComponent;

  @ViewChild(SceneTreeComponent)
  geometryTreeComponent: SceneTreeComponent | null | undefined;

  @ViewChild(CubeViewportControlComponent)
  private cubeControl!: CubeViewportControlComponent;

  message = "";

  loaded: boolean = false;

  // The geometry group switching index, used in cycleGeometry()
  private geometryGroupSwitchingIndex = ALL_GROUPS.length;
  currentGeometry: string = 'All';

  // UI toggles
  isLeftPaneOpen: boolean = false;


  // Phoenix API
  private facade: PhoenixThreeFacade = new PhoenixThreeFacade(new EventDisplay());

  constructor(
    private controller: GameControllerService,
    private snackBar: MatSnackBar,
    public eventDisplay: EventDisplayService,
    private userConfig: UserConfigService,
    private serverConfig: ServerConfigService,
  )
  {

  }


  async ngOnInit() {
    // Initialize the ThreeService scene/camera/renderer/controls
    this.eventDisplay.initThree('eventDisplay');

    // The facade will be initialized in three.service
    this.facade.initializeScene()


    this.controller.buttonY.onPress.subscribe((value) => {
      if (value) {
        // TODO this.cycleGeometry();
      }
    });


    this.userConfig.dexJsonEventSource.subject.subscribe(url => {
      if(!url || url.trim().length === 0) {
        console.log("[main-display]: No data source specified. Skip loadDexData ");
        return;
      }

      // Check if we have the same data
      if(this.eventDisplay.lastLoadedDexUrl === url) {
        console.log(`[main-display]: Event data (DEX) url is the same as before: '${url}', skip loading`);
        return;
      }

      // Try to load
      this.eventDisplay.loadDexData(url).catch(error=>{
        const msg = `Error loading events: ${error}`;
        console.error(`[main-display]: ${msg}`);
        this.showError(msg);
      }).then(value=>{
        console.log("[main-display]: Event loaded");
        this.updateSceneTreeComponent();
      });
    });

    this.userConfig.selectedGeometry.subject.subscribe(url =>{
      if(!url || url.trim().length === 0) {
        console.log("[main-display]: No data source specified. Skip loadGeometry ");
        return;
      }

      // Check if we have the same data
      if(this.eventDisplay.lastLoadedGeometryUrl === url) {
        console.log(`[main-display]: Geometry url is the same as before: '${url}', skip loading`);
        return;
      }

      // Load geometry
      this.eventDisplay.loadGeometry(url).catch(error=>{
        const msg = `Error loading geometry: ${error}`;
        console.error(`[main-display]: ${msg}`);
        this.showError(msg);
      }).then(value=>{
        console.log("[main-display]: Geometry loaded");
        console.log(value)
        this.updateSceneTreeComponent();
      });
    });

  }

  // 2) AFTER VIEW INIT => handle resizing with DisplayShell or window
  ngAfterViewInit(): void {
    if (this.displayShellComponent) {
      const resizeInvoker = () => {
        setTimeout(() => {
          this.onRendererElementResize();
        }, 100);
      };
      this.displayShellComponent.onVisibilityChangeLeft.subscribe(resizeInvoker);
      this.displayShellComponent.onVisibilityChangeRight.subscribe(resizeInvoker);
      this.displayShellComponent.onEndResizeLeft.subscribe(() => this.onRendererElementResize());
      this.displayShellComponent.onEndResizeRight.subscribe(() => this.onRendererElementResize());
    }

    this.initCubeViewportControl();

    window.addEventListener('resize', () => {
      this.onRendererElementResize();
    });

    // When sidebar is collapsed/opened, the main container, i.e. #eventDisplay offsetWidth is not yet updated.
    // This leads to a not proper resize  processing. We add 100ms delay before calling a function
    const this_obj = this;
    const resizeInvoker = function(){
      setTimeout(() => {
        this_obj.onRendererElementResize();
      }, 100);  // 100 milliseconds = 0.1 seconds
    };
    resizeInvoker();



    // this.startAnimationLoop();
  }

  // 3) UI - Toggling panes
  toggleLeftPane() {
    this.displayShellComponent?.toggleLeftPane();
    this.isLeftPaneOpen = !this.isLeftPaneOpen;
  }

  toggleRightPane() {
    this.displayShellComponent?.toggleRightPane();
  }

  // 4) Method to initialize CubeViewportControl with the existing Three.js objects
  private initCubeViewportControl(): void {
    const { scene, camera, renderer } = this.eventDisplay.three;
    if (this.cubeControl && scene && camera && renderer) {
      // Pass the external scene, camera, and renderer to the cube control
      this.cubeControl.initWithExternalScene(scene, camera, renderer);
      this.cubeControl.gizmo.attachControls(this.eventDisplay.three.controls);
    }

    const thisPointer = this;
    this.eventDisplay.three.addFrameCallback(()=>{
      if (thisPointer.cubeControl?.gizmo) {
        thisPointer.cubeControl.gizmo.render();
      }
    });
  }



  // Example function to show an error
  showError(message: string) {
    this.snackBar.open(message, 'Dismiss', {
      duration: 1000, // Auto-dismiss after X ms
      verticalPosition: 'top', // Place at the top of the screen
      panelClass: ['mat-mdc-snack-bar-error'] // Optional: Custom styling (MD3)
    });
  }


  ngOnDestroy(): void {
    // Clear the custom controls when leaving the page
  }


  // Called when we want to recalculate the size of the canvas
  private onRendererElementResize() {
    let {width, height} = this.displayShellComponent.getMainAreaVisibleDimensions();
    console.log(`[RendererResize] New size: ${width}x${height} px`);

    // Delegate resizing to ThreeService
    this.eventDisplay.three.setSize(width, height);
    if (this.cubeControl?.gizmo) {
      this.cubeControl.gizmo.update();
    }
  }



  // 8) GEOMETRY TOGGLING
  // showAllGeometries() {
  //   this.geometryGroupSwitchingIndex = ALL_GROUPS.length;
  //   if (!this.geomService.subdetectors) return;
  //   for (let detector of this.geomService.subdetectors) {
  //     detector.geometry.visible = true;
  //   }
  // }
  // showGeometryGroup(groupName: string) {
  //   if (!this.geomService.subdetectors) return;
  //   for (let detector of this.geomService.subdetectors) {
  //     detector.geometry.visible = (detector.groupName === groupName);
  //   }
  // }
  // cycleGeometry() {
  //   this.geometryGroupSwitchingIndex++;
  //   if (this.geometryGroupSwitchingIndex > ALL_GROUPS.length) {
  //     this.geometryGroupSwitchingIndex = 0;
  //   }
  //   if (this.geometryGroupSwitchingIndex === ALL_GROUPS.length) {
  //     this.showAllGeometries();
  //     this.currentGeometry = 'All';
  //   } else {
  //     this.currentGeometry = ALL_GROUPS[this.geometryGroupSwitchingIndex];
  //     this.showGeometryGroup(this.currentGeometry);
  //   }
  // }

  public formatCurrentTime (value: number): string {
    return value.toFixed(1);
  }

  changeCurrentTime(event: Event) {
    if(!event) return;
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    this.eventDisplay.updateEventTime(value);
  }

  // 10) SCENE TREE / UI
  private updateSceneTreeComponent() {
    // Example: rename lights
    const scene = this.eventDisplay.three.scene;
    if (this.geometryTreeComponent) {
      this.geometryTreeComponent.refreshSceneTree();
    }
  }

  onDebugButton() {
    this.showError("Error message works");
  }
}

import {
  Component,
  OnInit,
  AfterViewInit,
  HostListener,
  Input,
  ViewChild, OnDestroy, TemplateRef, ElementRef
} from '@angular/core';
import { DecimalPipe, NgIf, NgForOf, NgClass } from '@angular/common';

import { ThreeService } from '../../services/three.service';
import { GeometryService, ALL_GROUPS } from '../../services/geometry.service';
import { GameControllerService } from '../../services/game-controller.service';
import { UserConfigService } from '../../services/user-config.service';
import { DataModelService } from '../../services/data-model.service';
import { UrlService } from '../../services/url.service';

import { SceneTreeComponent } from '../geometry-tree/scene-tree.component';
import { ShellComponent } from '../../components/shell/shell.component';
import { ToolPanelComponent } from '../../components/tool-panel/tool-panel.component';
import { EventSelectorComponent } from '../../components/event-selector/event-selector.component';
import { AutoRotateComponent } from '../../components/auto-rotate/auto-rotate.component';
import { ThemeSwitcherComponent } from "../../components/theme-switcher/theme-switcher.component";
import { ObjectClippingComponent } from '../../components/object-clipping/object-clipping.component';
import { EicAnimationsManager } from '../../utils/eic-animation-manager';

import { ThreeGeometryProcessor } from '../../data-pipelines/three-geometry.processor';
import { ThreeEventProcessor, ProcessTrackInfo } from '../../data-pipelines/three-event.processor';
import { DataModelPainter } from '../../painters/data-model-painter';
import { PhoenixThreeFacade } from "../../utils/phoenix-three-facade";

import { MatSnackBar } from '@angular/material/snack-bar';
import {
  MatSlider,
  MatSliderThumb
} from '@angular/material/slider';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { AngularSplitModule } from 'angular-split';

import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import {EventDisplay} from "phoenix-event-display";

import Stats from 'three/examples/jsm/libs/stats.module.js';
import {PerfStatsComponent} from "../../components/perf-stats/perf-stats.component";
import {PerfService} from "../../services/perf.service";
import {EventDisplayService} from "../../services/event-display.service";



/**
 * This MainDisplayComponent:
 *  - Initializes and uses ThreeService (which sets up scene, camera, controls, etc.).
 *  - Loads geometry via GeometryService, attaches it to scene.
 *  - Loads event data (Dex or custom) via DataModelService, builds objects in "EventData" group.
 *  - Uses EicAnimationsManager for collisions/expansions.
 *  - Has leftover UI logic for sliders, time stepping, left/right pane toggling, etc.
 *  - Has *no* references to phoenix-event-display or EventDisplayService.
 */
@Component({
    selector: 'app-main-display',
    templateUrl: './main-display.component.html',
    styleUrls: ['./main-display.component.scss'],
  imports: [
    // Angular
    DecimalPipe,
    NgIf,
    NgForOf,
    NgClass,
    // Material
    MatSlider,
    MatSliderThumb,
    MatIcon,
    MatButton,
    MatTooltip,
    MatFormField,
    MatSelect,
    MatOption,
    MatIconButton,
    // 3rd party
    AngularSplitModule,
    // Custom components
    SceneTreeComponent,
    ShellComponent,
    ToolPanelComponent,
    EventSelectorComponent,
    AutoRotateComponent,
    ThemeSwitcherComponent,
    ObjectClippingComponent,
    PerfStatsComponent
  ]
})
export class MainDisplayComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input()
  eventDataImportOptions: string[] = []; // example, if you used them in UI

  @ViewChild('displayHeaderControls', { static: true }) displayHeaderControls!: TemplateRef<any>;

  @ViewChild('eventDisplay')
  eventDisplayDiv!: ElementRef;

  // For referencing child components
  @ViewChild(ShellComponent)
  displayShellComponent!: ShellComponent;

  @ViewChild(SceneTreeComponent)
  geometryTreeComponent: SceneTreeComponent | null | undefined;

  // Some old UI properties
  currentTime = 0;
  maxTime = 200;
  minTime = 0;
  message = '';

  private stats = new Stats();

  loaded: boolean = false;
  loadingProgress: number = 0;

  // The geometry group switching index, used in cycleGeometry()
  private geometryGroupSwitchingIndex = ALL_GROUPS.length;
  currentGeometry: string = 'All';

  // We keep references to big custom classes used in your pipeline
  threeGeometryProcessor = new ThreeGeometryProcessor();
  threeEventProcessor = new ThreeEventProcessor();
  private trackInfos: ProcessTrackInfo[] | null = null;
  private tween: TWEEN.Tween<any> | null = null;
  private animationManager: EicAnimationsManager | null = null;

  // UI toggles
  isLeftPaneOpen: boolean = false;
  isPhoenixMenuOpen: boolean = false; // formerly Phoenix menu, now just a UI toggle
  isSmallScreen: boolean = window.innerWidth < 768;

  // Some services or data
  private painter: DataModelPainter = new DataModelPainter();
  private beamAnimationTime: number = 1000;
  private animateEventAfterLoad: boolean = false;
  private eventsByName = new Map<string, any>();
  private eventsArray: any[] = [];
  selectedEventKey: string | undefined;

  // Phoenix API
  private facade: PhoenixThreeFacade = new PhoenixThreeFacade(new EventDisplay());



  constructor(
    private threeService: ThreeService,
    private geomService: GeometryService,
    private controller: GameControllerService,
    private settings: UserConfigService,
    private dataService: DataModelService,
    private urlService: UrlService,
    private snackBar: MatSnackBar,
    private perfService: PerfService,
    private eventDisplayService: EventDisplayService
  ) {}


  async ngOnInit() {
    // Initialize the ThreeService scene/camera/renderer/controls
    this.threeService.init('eventDisplay');
    this.threeService.startRendering();

    // The facade will be initialized in three.service
    this.facade.initializeScene()

    // Setup the EicAnimationsManager Animations Manager
    this.animationManager = new EicAnimationsManager(
      this.threeService.scene,
      this.threeService.camera,
      this.threeService.renderer
    );

    // Listen to gamepad events from your GameControllerService
    this.controller.buttonB.onPress.subscribe((value) => {
      if (value) {
        this.beamAnimationTime = 1800;
        this.nextRandomEvent('5x41');
      }
    });
    this.controller.buttonRT.onPress.subscribe((value) => {
      if (value) {
        this.beamAnimationTime = 1200;
        this.nextRandomEvent('10x100');
      }
    });
    this.controller.buttonLT.onPress.subscribe((value) => {
      if (value) {
        this.beamAnimationTime = 700;
        this.nextRandomEvent('18x275');
      }
    });
    this.controller.buttonY.onPress.subscribe((value) => {
      if (value) {
        this.cycleGeometry();
      }
    });

    // // 2) LOAD GEOMETRY
    // try {
    //   const { rootGeometry, threeGeometry } = await this.geomService.loadGeometry();
    //   if (threeGeometry) {
    //     // Optionally, attach geometry to a group "Geometries"
    //     let geoGroup = this.threeService.scene.getObjectByName('Geometries') as THREE.Group;
    //     if (!geoGroup) {
    //       geoGroup = new THREE.Group();
    //       geoGroup.name = 'Geometries';
    //       this.threeService.scene.add(geoGroup);
    //     }
    //     geoGroup.add(threeGeometry);
    //
    //     // Process geometry if needed
    //     this.threeGeometryProcessor.process(this.geomService.subdetectors);
    //
    //     this.loaded = true;
    //   }
    // } catch (err) {
    //   console.error('ERROR LOADING GEOMETRY', err);
    // }

    this.eventDisplayService.loadGeometry().catch(error=>{
      const msg = `Error loading geometry: ${error}`;
      console.error(msg);
      this.showError(msg);
    }).then(value=>{
      console.log("[main-display] Geometry loaded");
    })


    // 3) LOAD DEX or other event data
    // example: load Dex data, then attach to an "EventData" group
    const dexData = await this.dataService.loadDexData();
    if (dexData && dexData.entries?.length) {
      let eventGroup = this.threeService.scene.getObjectByName('EventData') as THREE.Group;
      if (!eventGroup) {
        eventGroup = new THREE.Group();
        eventGroup.name = 'EventData';
        this.threeService.scene.add(eventGroup);
      }
      // Paint it
      this.painter.setThreeSceneParent(eventGroup);
      this.painter.setEntry(dexData.entries[0]);
      this.painter.paint(this.currentTime);
      this.updateSceneTreeComponent();
    }

    // If you have other data
    // this.dataService.loadEdm4EicData() ...
    // this.dataService.loadDexData() ...
    // parse them and add to scene

    // Hook up a keyboard for debugging
    document.addEventListener('keydown', (e) => {
      if (e.key === 'q') {
        this.nextRandomEvent();
      }
      if (e.key === 'r') {
        this.logRendererInfo();
      }
      console.log(e.key);
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

    window.addEventListener('resize', () => {
      this.onRendererElementResize();
    });

    // Include performance stats:
    let this_obj = this;
    this.threeService.profileBeginFunc = ()=>this_obj.perfService.updateStats(this_obj.threeService.renderer);
    this.threeService.profileEndFunc = this.stats.end;

    // When sidebar is collapsed/opened, the main container, i.e. #eventDisplay offsetWidth is not yet updated.
    // This leads to a not proper resize  processing. We add 100ms delay before calling a function

    const resizeInvoker = function(){
      setTimeout(() => {
        this_obj.onRendererElementResize();
      }, 100);  // 100 milliseconds = 0.1 seconds
    };
    resizeInvoker();
  }

  // 3) UI - Toggling panes
  toggleLeftPane() {
    this.displayShellComponent?.toggleLeftPane();
    this.isLeftPaneOpen = !this.isLeftPaneOpen;
  }

  toggleRightPane() {
    this.displayShellComponent?.toggleRightPane();
  }

  togglePhoenixMenu() {
    this.isPhoenixMenuOpen = !this.isPhoenixMenuOpen;
  }

  // Example function to show an error
  showError(message: string) {
    this.snackBar.open(message, 'Dismiss', {
      duration: 5000, // Auto-dismiss after 5 seconds
      verticalPosition: 'top', // Place at the top of the screen
      panelClass: ['mat-mdc-snack-bar-error'] // Optional: Custom styling (MD3)
    });
  }

  // 4) UI - window resize detection
  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.isSmallScreen = event.target.innerWidth < 768;
    if (!this.isSmallScreen) {
      this.isPhoenixMenuOpen = true;
    }
  }

  ngOnDestroy(): void {
    // Clear the custom controls when leaving the page
  }



  logRendererInfo() {
    // Access the THREE.WebGLRenderer from threeService
    const renderer = this.threeService.renderer;
    const info = renderer.info;
    console.log('Draw calls:', info.render.calls);
    console.log('Triangles:', info.render.triangles);
    console.log('Points:', info.render.points);
    console.log('Lines:', info.render.lines);
    console.log('Geometries in memory:', info.memory.geometries);
    console.log('Textures in memory:', info.memory.textures);
    console.log('Programs:', info.programs?.length);
    console.log(info.programs);
  }

  // Called when we want to recalculate the size of the canvas
  private onRendererElementResize() {
    let {width, height} = this.displayShellComponent.getMainAreaVisibleDimensions();
    console.log(`[RendererResize] New size: ${width}x${height} px`);

    // Delegate resizing to ThreeService
    this.threeService.setSize(width, height);
  }

  // 6) EVENT DATA + TIME STEPPING
  changeCurrentTime(event: Event) {
    if (!event) return;
    const input = event.target as HTMLInputElement;
    const value: number = parseInt(input.value, 10);
    this.currentTime = value;
    this.processCurrentTimeChange();
  }
  timeStepBack() {
    if (this.currentTime > this.minTime) this.currentTime--;
    if (this.currentTime < this.minTime) this.currentTime = this.minTime;
    this.processCurrentTimeChange();
  }
  timeStep() {
    if (this.currentTime < this.maxTime) this.currentTime++;
    if (this.currentTime > this.maxTime) this.currentTime = this.maxTime;
    this.processCurrentTimeChange();
  }
  formatCurrentTime(value: number): string {
    return value.toFixed(1);
  }

  private processCurrentTimeChange() {
    // Re-paint with new time
    this.painter.paint(this.currentTime);

    // If you have trackInfos from your old event, handle them
    if (this.trackInfos) {
      // e.g. show/hide track lines based on currentTime
      for (let trackInfo of this.trackInfos) {
        if (trackInfo.startTime > this.currentTime) {
          trackInfo.trackNode.visible = false;
        } else {
          trackInfo.trackNode.visible = true;
        }
      }
    }
  }

  // 7) TIME ANIMATION
  animateTime() {
    this.animateCurrentTime(this.maxTime, (this.maxTime - this.currentTime) * 200);
  }
  animateCurrentTime(targetTime: number, duration: number) {
    if (this.tween) {
      this.stopAnimation();
    }
    this.tween = new TWEEN.Tween({ currentTime: this.currentTime })
      .to({ currentTime: targetTime }, duration)
      .onUpdate((obj) => {
        this.currentTime = obj.currentTime;
        this.processCurrentTimeChange();
      })
      .start();
  }
  stopAnimation() {
    if (this.tween) {
      this.tween.stop();
      this.tween = null;
    }
  }

  exitTimedDisplay() {
    this.stopAnimation();
    this.rewindTime();
    this.painter.paint(null);
    this.animateEventAfterLoad = false;
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = true;
      }
    }
  }
  rewindTime() {
    this.currentTime = 0;
  }

  // Example: animate event after collision
  animateWithCollision() {
    this.stopAnimation();
    this.rewindTime();
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }
    }
    this.animationManager?.collideParticles(
      this.beamAnimationTime,
      30,
      5000,
      new THREE.Color(0xaaaaaa),
      () => {
        this.animateTime();
      }
    );
  }

  // 8) GEOMETRY TOGGLING
  showAllGeometries() {
    this.geometryGroupSwitchingIndex = ALL_GROUPS.length;
    if (!this.geomService.subdetectors) return;
    for (let detector of this.geomService.subdetectors) {
      detector.geometry.visible = true;
    }
  }
  showGeometryGroup(groupName: string) {
    if (!this.geomService.subdetectors) return;
    for (let detector of this.geomService.subdetectors) {
      detector.geometry.visible = (detector.groupName === groupName);
    }
  }
  cycleGeometry() {
    this.geometryGroupSwitchingIndex++;
    if (this.geometryGroupSwitchingIndex > ALL_GROUPS.length) {
      this.geometryGroupSwitchingIndex = 0;
    }
    if (this.geometryGroupSwitchingIndex === ALL_GROUPS.length) {
      this.showAllGeometries();
      this.currentGeometry = 'All';
    } else {
      this.currentGeometry = ALL_GROUPS[this.geometryGroupSwitchingIndex];
      this.showGeometryGroup(this.currentGeometry);
    }
  }

  // 9) RANDOM EVENTS
  nextRandomEvent(energyStr = '18x275') {
    let eventNames: string[] = [];
    for (const key of this.eventsByName.keys()) {
      if (key.includes(energyStr)) {
        eventNames.push(key);
      }
    }
    if (eventNames.length === 0) {
      console.warn(`No events found with energy: ${energyStr}`);
      return;
    }
    const eventIndex = Math.floor(Math.random() * eventNames.length);
    const eventName = eventNames[eventIndex];

    this.stopAnimation();
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }
    }
    this.snackBar.open(`Showing event: ${eventName}`, 'Dismiss', {
      duration: 2000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
    this.animateEventAfterLoad = true;

    // Instead of eventDisplay.loadEvent(...), do your custom approach
    const eventData = this.eventsByName.get(eventName);
    if (!eventData) return;
    this.buildEventDataFromJSON(eventData);
  }

  buildEventDataFromJSON(eventData: any) {
    // Clear old stuff from your "EventData" group, or reuse painter
    let eventGroup = this.threeService.scene.getObjectByName('EventData') as THREE.Group;
    if (!eventGroup) {
      eventGroup = new THREE.Group();
      eventGroup.name = 'EventData';
      this.threeService.scene.add(eventGroup);
    }
    // Clear old children
    while (eventGroup.children.length > 0) {
      eventGroup.remove(eventGroup.children[0]);
    }
    // Rebuild from JSON
    // Or call your pipeline's logic, e.g. threeEventProcessor.process(eventData)
    // Then attach to eventGroup

    // Example partial:
    this.painter.setThreeSceneParent(eventGroup);
    //this.painter.buildFromJson(eventData); // hypothetical method

    this.updateSceneTreeComponent();

    if (this.animateEventAfterLoad) {
      // Hide tracks until collision
      if (this.trackInfos) {
        for (let trackInfo of this.trackInfos) {
          trackInfo.trackNode.visible = false;
        }
      }
      this.animateWithCollision();
    }
  }

  onUserSelectedEvent() {
    if (!this.selectedEventKey) return;
    let event = this.eventsByName.get(this.selectedEventKey);
    if (!event) {
      console.warn(`Selected event ${this.selectedEventKey} not found in map.`);
      return;
    }
    this.buildEventDataFromJSON(event);
  }

  // 10) SCENE TREE / UI
  private updateSceneTreeComponent() {
    // Example: rename lights
    const scene = this.threeService.scene;
    if (scene && scene.children.length > 2) {
      if (scene.children[0]) scene.children[0].name = 'Ambient light';
      if (scene.children[1]) scene.children[1].name = 'Direct. light';
    }
    if (this.geometryTreeComponent) {
      this.geometryTreeComponent.refreshSceneTree();
    }
  }
}

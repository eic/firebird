import * as THREE from "three"
import {EventDisplay} from "phoenix-event-display";
import {EventDisplayService} from "phoenix-ui-components";

export class PhoenixThreeFacade {

  public phoenixEventDisplay: EventDisplay;

  public get phoenixThreeManager() {
    return this.phoenixEventDisplay.getThreeManager();
  }

  public get activeOrbitControls() {
    return (this.phoenixThreeManager as any).controlsManager.getActiveControls();
  }


  public get mainCamera() {
      return (this.phoenixThreeManager as any).controlsManager.getMainCamera();
  }

  public get activeCamera() {
    return (this.phoenixThreeManager as any).controlsManager.getActiveCamera();
  }

  public get scene() {
    return this.phoenixThreeManager.getSceneManager().getScene();
  }

  public get sceneGeometries() {
    return this.phoenixThreeManager.getSceneManager().getGeometries();
  }

  public get sceneEvent() {
    return this.phoenixThreeManager.getSceneManager().getEventData();
  }

  constructor(eventDisplay: EventDisplay) {
    this.phoenixEventDisplay = eventDisplay;
  }

}

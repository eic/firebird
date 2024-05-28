import { Injectable } from '@angular/core';
import * as THREE from "three";
import {BehaviorSubject, Observable, Subject} from "rxjs";


export enum ControllerButtonIndexes {
  ButtonA = 0,
  ButtonB = 1,
  ButtonX = 2,
  ButtonY = 3,
  ButtonLB = 4,
  ButtonRB = 5,
  ButtonLT = 6,
  ButtonRT = 7,
  Select = 8,
  Start = 9,
}


@Injectable({
  providedIn: 'root'
})
export class GameControllerService {

  private xAxisSubject = new BehaviorSubject<number>(0);
  public xAxisChanged = this.xAxisSubject.asObservable();
  public xAxis = 0;

  private yAxisSubject = new BehaviorSubject<number>(0);
  private yAxisChanged = this.yAxisSubject.asObservable();
  public yAxis: number = 0;
  public buttons: GamepadButton[] = [];
  public prevButtons: GamepadButton[] = [];

  private buttonASubject = new Subject<boolean>();
  public buttonAPressed = this.buttonASubject.asObservable();
  public buttonA: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonBSubject = new Subject<boolean>();
  public buttonBPressed = this.buttonBSubject.asObservable();
  public buttonB: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonXSubject = new Subject<boolean>();
  public buttonXPressed = this.buttonXSubject.asObservable();
  public buttonX: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonYSubject = new Subject<boolean>();
  public buttonYPressed = this.buttonYSubject.asObservable();
  public buttonY: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonLBSubject = new Subject<boolean>();
  public buttonLBPressed = this.buttonLBSubject.asObservable();
  public buttonLB: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonRBSubject = new Subject<boolean>();
  public buttonRBPressed = this.buttonRBSubject.asObservable();
  public buttonRB: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonLTSubject = new Subject<boolean>();
  public buttonLTPressed = this.buttonLTSubject.asObservable();
  public buttonLT: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonRTSubject = new Subject<boolean>();
  public buttonRTPressed = this.buttonRTSubject.asObservable();
  public buttonRT: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonSelectSubject = new Subject<boolean>();
  public buttonSelectPressed = this.buttonSelectSubject.asObservable();
  public buttonSelect: GamepadButton = {pressed: false, touched: false, value: 0};
  private buttonStartSubject = new Subject<boolean>();
  public buttonStartPressed = this.buttonStartSubject.asObservable();
  public buttonStart: GamepadButton = {pressed: false, touched: false, value: 0};

  public activeGamepad: Gamepad|null = null;

  animationLoopHandler () {

    const epsilon = 0.01;
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad) {

        this.activeGamepad = gamepad;
        // Example: Using left joystick to control OrbitControls
        // Axis 0: Left joystick horizontal (left/right)
        // Axis 1: Left joystick vertical (up/down)
        this.xAxis = gamepad.axes[0];
        this.yAxis = gamepad.axes[1];

        if(Math.abs(this.xAxis - this.xAxisSubject.value) > epsilon) {
          this.xAxisSubject.next(this.xAxis);
        }

        if(Math.abs(this.yAxis - this.yAxisSubject.value) > epsilon) {
          this.yAxisSubject.next(this.yAxis);
        }

        this.buttonA = gamepad.buttons[ControllerButtonIndexes.ButtonA];
        this.buttonB = gamepad.buttons[ControllerButtonIndexes.ButtonB];
        this.buttonX = gamepad.buttons[ControllerButtonIndexes.ButtonX];
        this.buttonY = gamepad.buttons[ControllerButtonIndexes.ButtonY];
        this.buttonLB = gamepad.buttons[ControllerButtonIndexes.ButtonLB];
        this.buttonRB = gamepad.buttons[ControllerButtonIndexes.ButtonRB];
        this.buttonLT = gamepad.buttons[ControllerButtonIndexes.ButtonLT];
        this.buttonRT = gamepad.buttons[ControllerButtonIndexes.ButtonRT];
        this.buttonSelect = gamepad.buttons[ControllerButtonIndexes.Select];
        this.buttonStart = gamepad.buttons[ControllerButtonIndexes.Start];

        if (this.buttonA.pressed      !== this.buttonASubject.observed)      this.buttonASubject.next(this.buttonA.pressed);
        if (this.buttonB.pressed      !== this.buttonBSubject.observed)      this.buttonASubject.next(this.buttonB.pressed);
        if (this.buttonX.pressed      !== this.buttonXSubject.observed)      this.buttonASubject.next(this.buttonX.pressed);
        if (this.buttonY.pressed      !== this.buttonYSubject.observed)      this.buttonASubject.next(this.buttonY.pressed);
        if (this.buttonLB.pressed     !== this.buttonLBSubject.observed)     this.buttonASubject.next(this.buttonLB.pressed);
        if (this.buttonRB.pressed     !== this.buttonRBSubject.observed)     this.buttonASubject.next(this.buttonRB.pressed);
        if (this.buttonLT.pressed     !== this.buttonLTSubject.observed)     this.buttonASubject.next(this.buttonLT.pressed);
        if (this.buttonRT.pressed     !== this.buttonRTSubject.observed)     this.buttonASubject.next(this.buttonRT.pressed);
        if (this.buttonSelect.pressed !== this.buttonSelectSubject.observed) this.buttonASubject.next(this.buttonSelect.pressed);
        if (this.buttonStart.pressed  !== this.buttonStartSubject.observed)  this.buttonASubject.next(this.buttonStart.pressed);

        break; // Only use the first connected gamepad
      }
    }
  };

  constructor() {
    // Run it on contruction so if we have an active controller we set up values
    this.animationLoopHandler();
  }
}

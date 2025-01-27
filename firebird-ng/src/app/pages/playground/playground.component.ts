import {AfterViewInit, Component, OnInit, ViewChild, ElementRef} from '@angular/core';
import * as THREE from "three"
import * as TWEEN from '@tweenjs/tween.js';

@Component({
    selector: 'app-playground',
    imports: [],
    templateUrl: './playground.component.html',
    styleUrl: './playground.component.scss'
})
export class PlaygroundComponent implements OnInit, AfterViewInit {
  @ViewChild('rendererContainer') rendererContainer!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private particle1!: THREE.Mesh;
  private particle2!: THREE.Mesh;
  private lines: THREE.Line[] = [];
  private curves: THREE.CatmullRomCurve3[] = [];
  private trajectories: any[] = [
    [
      { x: 0, y: 0, z: 0, time: 1000 },
      { x: 1, y: 1, z: 0, time: 2000 },
      { x: 2, y: 0, z: 1, time: 3000 },
      { x: 3, y: -1, z: 0, time: 4000 },
      { x: 4, y: 0, z: -1, time: 5000 }
    ],
    [
      { x: 4, y: 0, z: -1, time: 5000 },
      { x: 5, y: 1, z: -1, time: 6000 },
      { x: 6, y: 2, z: 0, time: 7000 },
      { x: 7, y: 1, z: 1, time: 8000 },
      { x: 8, y: 0, z: 1, time: 9000 }
    ],
    [
      { x: 8, y: 0, z: 1, time: 5000 },
      { x: 9, y: -1, z: 1, time: 6000 },
      { x: 10, y: -2, z: 0, time: 7000 },
      { x: 11, y: -1, z: -1, time: 8000 },
      { x: 12, y: 0, z: -1, time: 9000 }
    ]
  ];

  constructor() { }

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    this.initThreeJS();
    this.initCurvesAndLines();
    this.animate();
  }

  initThreeJS(): void {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);

    const geometry = new THREE.SphereGeometry(0.1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.particle1 = new THREE.Mesh(geometry, material);
    this.particle2 = new THREE.Mesh(geometry, material);
    this.particle1.visible = false; // Initially invisible
    this.particle2.visible = false; // Initially invisible
    this.scene.add(this.particle1);
    this.scene.add(this.particle2);
  }

  initCurvesAndLines(): void {
    this.curves = this.trajectories.map(points => {
      return new THREE.CatmullRomCurve3(points.map((p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z)));
    });

    this.curves.forEach(curve => {
      const linePoints = curve.getPoints(100);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.visible = false; // Initially invisible
      this.scene.add(line);
      this.lines.push(line);
    });
  }

  updateParticlePosition(currentTime: number): void {
    const delay = 1000; // Delay before the particles appear
    if (currentTime < delay) {
      this.particle1.visible = false;
      this.particle2.visible = false;
      this.lines.forEach(line => line.visible = false);
      return;
    }

    this.particle1.visible = true;
    this.particle2.visible = currentTime >= 5000;

    let adjustedTime = currentTime - delay;

    // Track 1
    if (adjustedTime <= 4000) {
      this.lines[0].visible = true;
      const t1 = adjustedTime / 4000;
      const position1 = this.curves[0].getPoint(t1);
      this.particle1.position.copy(position1);
      const visiblePoints1 = this.curves[0].getPoints(Math.floor(t1 * 100) + 1);
      this.lines[0].geometry.setFromPoints(visiblePoints1);
    }

    // Track 2
    if (adjustedTime >= 4000 && adjustedTime <= 8000) {
      this.lines[1].visible = true;
      const t2 = (adjustedTime - 4000) / 4000;
      const position2 = this.curves[1].getPoint(t2);
      this.particle1.position.copy(position2);
      const visiblePoints2 = this.curves[1].getPoints(Math.floor(t2 * 100) + 1);
      this.lines[1].geometry.setFromPoints(visiblePoints2);
    }

    // Track 3 (second particle)
    if (adjustedTime >= 4000 && adjustedTime <= 8000) {
      this.lines[2].visible = true;
      const t3 = (adjustedTime - 4000) / 4000;
      const position3 = this.curves[2].getPoint(t3);
      this.particle2.position.copy(position3);
      const visiblePoints3 = this.curves[2].getPoints(Math.floor(t3 * 100) + 1);
      this.lines[2].geometry.setFromPoints(visiblePoints3);
    }
  }

  setAnimationTime(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    this.updateParticlePosition(value);
  }

  animate(): void {
    requestAnimationFrame(() => this.animate());
    TWEEN.update();
    this.renderer.render(this.scene, this.camera);
  }
}

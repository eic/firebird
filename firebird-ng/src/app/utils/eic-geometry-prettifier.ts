import * as THREE from "three";
import { Object3D, Scene, Group, Mesh, MeshPhysicalMaterial, PMREMGenerator, WebGLRenderer } from "three";

/**
 * EIC Geometry Prettifier
 *
 * Applies advanced visual effects to geometry elements when high-quality rendering is enabled.
 * Uses procedural environment with studio-style lighting for reflections.
 */

// Cached environment map
let cachedEnvMap: THREE.Texture | null = null;

/**
 * Creates a procedural environment map with gradient and bright light sources.
 */
function createProceduralEnvironment(renderer: WebGLRenderer): THREE.Texture | null {
  if (!renderer) {
    console.warn('[EicGeometryPrettifier]: No renderer provided');
    return null;
  }

  if (cachedEnvMap) {
    return cachedEnvMap;
  }

  console.log('[EicGeometryPrettifier]: Generating procedural environment...');

  const envScene = new Scene();

  // Create gradient sphere
  const envGeometry = new THREE.SphereGeometry(500, 64, 64);
  const colors: number[] = [];
  const positionAttribute = envGeometry.getAttribute('position');

  for (let i = 0; i < positionAttribute.count; i++) {
    const y = positionAttribute.getY(i);
    const x = positionAttribute.getX(i);
    const z = positionAttribute.getZ(i);
    const t = (y + 500) / 1000;

    // Gradient: dark bottom to bright top
    const bottomColor = new THREE.Color(0x505060);
    const midColor = new THREE.Color(0x8090a0);
    const topColor = new THREE.Color(0xd0e0f0);

    let color: THREE.Color;
    if (t < 0.4) {
      color = bottomColor.clone().lerp(midColor, t / 0.4);
    } else {
      color = midColor.clone().lerp(topColor, (t - 0.4) / 0.6);
    }

    // Add variation
    const angle = Math.atan2(z, x);
    const variation = Math.sin(angle * 3) * 0.1 + Math.sin(angle * 7) * 0.05;
    color.offsetHSL(0, 0, variation);

    colors.push(color.r, color.g, color.b);
  }

  envGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const envMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide
  });

  const envMesh = new Mesh(envGeometry, envMaterial);
  envScene.add(envMesh);

  // Add bright light sources
  const lights: { geom: THREE.BufferGeometry; mat: THREE.Material }[] = [];

  const addLight = (x: number, y: number, z: number, size: number, intensity: number) => {
    const geom = new THREE.SphereGeometry(size, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(intensity, intensity, intensity * 0.98)
    });
    const mesh = new Mesh(geom, mat);
    mesh.position.set(x, y, z);
    envScene.add(mesh);
    lights.push({ geom, mat });
  };

  // Main lights
  addLight(300, 350, 150, 40, 2.0);
  addLight(-250, 200, -200, 25, 1.5);
  addLight(100, -100, 350, 20, 1.2);
  addLight(-150, 400, 250, 30, 1.8);

  // Generate PMREM
  const pmremGenerator = new PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const envMap = pmremGenerator.fromScene(envScene, 0, 0.1, 1000).texture;

  // Cleanup
  pmremGenerator.dispose();
  envGeometry.dispose();
  envMaterial.dispose();
  lights.forEach(l => { l.geom.dispose(); l.mat.dispose(); });

  cachedEnvMap = envMap;
  console.log('[EicGeometryPrettifier]: Procedural environment generated');

  return envMap;
}

/**
 * Find objects by name pattern
 */
function findObjectsByPattern(root: Object3D, pattern: string): Object3D[] {
  const results: Object3D[] = [];
  const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
  root.traverse((child) => {
    if (regex.test(child.name)) {
      results.push(child);
    }
  });
  return results;
}

/**
 * Apply mirror material
 */
function applyMirrorMaterial(
  objects: Object3D[],
  envMap: THREE.Texture | null,
  clippingPlanes?: THREE.Plane[]
): void {
  for (const obj of objects) {
    if (!(obj instanceof Mesh)) continue;

    const mirrorMaterial = new MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 0.0,
      envMap: envMap,
      envMapIntensity: 2.5,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      side: THREE.DoubleSide,
      clippingPlanes: clippingPlanes,
      clipIntersection: true,
    });

    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
    }

    obj.material = mirrorMaterial;
  }

  if (objects.length > 0) {
    console.log(`[EicGeometryPrettifier]: Applied mirror material to ${objects.length} objects`);
  }
}

export interface PrettifyOptions {
  renderer: WebGLRenderer;
  sceneGeometry: Group;
  scene: Scene;
  clippingPlanes?: THREE.Plane[];
}

/**
 * Main prettify function
 */
export async function prettify(geometry: Object3D, options: PrettifyOptions): Promise<void> {
  console.log('[EicGeometryPrettifier]: Starting prettification...');

  const envMap = createProceduralEnvironment(options.renderer);

  if (envMap && options.scene instanceof Scene) {
    options.scene.environment = envMap;
  }

  const drichMirrors = findObjectsByPattern(geometry, 'DRICH_mirror');
  applyMirrorMaterial(drichMirrors, envMap, options.clippingPlanes);

  console.log('[EicGeometryPrettifier]: Prettification complete');
}

/**
 * Cleanup
 */
export function disposePrettifier(): void {
  if (cachedEnvMap) {
    cachedEnvMap.dispose();
    cachedEnvMap = null;
  }
}

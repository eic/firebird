import {
  Object3D,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  Color,
} from 'three';
import { EventPiecePainter } from './event-piece-painter';
import { BoxHitPiece } from '../model/box-hit.piece';
import { EventPiece } from '../model/event-piece';

/**
 * Alternative Painter class for rendering BoxHitPiece using individual Meshes.
 */
export class BoxHitSimplePainter extends EventPiecePainter {
  /** Array of Mesh objects representing hits */
  private hitMeshes: Mesh[] = [];

  private boxPiece: BoxHitPiece;

  /**
   * Constructs a new BoxHitAlternativePainter.
   *
   * @param parentNode - The Object3D node where the hit meshes will be added.
   * @param piece - The BoxHitPiece containing the hit data.
   */
  constructor(parentNode: Object3D, piece: EventPiece) {
    super(parentNode, piece);

    // Runtime type check
    if (piece.type !== BoxHitPiece.type) {
      throw new Error('Invalid piece type for BoxHitAlternativePainter');
    }

    this.boxPiece = piece as BoxHitPiece;

    // Create a bright random color for this piece collection
    const hue = Math.random();
    const randomColor = new Color().setHSL(hue, 1, 0.5); // Bright color

    // Create a material with the random color
    const material = new MeshBasicMaterial({ color: randomColor });

    // Create a mesh for each hit using the same material
    this.createHitMeshes(material);
  }

  /**
   * Creates Mesh instances for each hit and adds them to the parent node.
   * Reads the piece columns directly: hit i lives at pos[3i..3i+2].
   *
   * @param material - The material to use for the hit meshes.
   */
  private createHitMeshes(material: MeshBasicMaterial): void {
    const piece = this.boxPiece;
    for (let i = 0; i < piece.count; i++) {
      // Create geometry for the box
      const geometry = new BoxGeometry(10, 10, 10);

      // Create the mesh
      const mesh = new Mesh(geometry, material);

      // Set position
      mesh.position.set(piece.pos[3 * i], piece.pos[3 * i + 1], piece.pos[3 * i + 2]);

      // Store the hit time (0 = always visible when no time column)
      mesh.userData['appearanceTime'] = piece.time !== null ? piece.time[i] : 0;

      // Initially make the mesh invisible
      mesh.visible = false;

      // Selection mapping: hit id ≡ index. The material is shared by all
      // hits, so the highlight scales the mesh instead of recoloring it.
      this.registerEntityObject(i, mesh);
      mesh.userData['highlightFunction'] = () => mesh.scale.setScalar(2.5);
      mesh.userData['unhighlightFunction'] = () => mesh.scale.setScalar(1);

      // Add the mesh to the parent node and to the array
      this.parentNode.add(mesh);
      this.hitMeshes.push(mesh);
    }
  }

  /**
   * Paint method to update the visibility of the hits based on time.
   *
   * @param time - The current time in nanoseconds or null for static rendering.
   */
  public paint(time: number | null): void {
    for (const mesh of this.hitMeshes) {
      if (time !== null) {
        // Show the mesh if its appearance time is less than or equal to the current time
        mesh.visible = mesh.userData['appearanceTime'] <= time;
      } else {
        // In static mode, make all meshes visible
        mesh.visible = true;
      }
    }
  }

  /**
   * Dispose of resources used by the painter.
   */
  override dispose(): void {
    for (const mesh of this.hitMeshes) {
      // Dispose of geometry and material
      mesh.geometry.dispose();

      // Dispose of the material only if it's not shared with other meshes
      if (mesh.material instanceof MeshBasicMaterial) {
        mesh.material.dispose();
      }

      // Remove the mesh from the parent node
      this.parentNode.remove(mesh);
    }

    // Clear the array
    this.hitMeshes = [];

    super.dispose();
  }
}

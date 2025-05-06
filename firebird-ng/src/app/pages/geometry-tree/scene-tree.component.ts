import {
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';

import { FlatTreeControl } from '@angular/cdk/tree';
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
} from '@angular/material/tree';

import {
  MatTree,
  MatTreeNode,
  MatTreeNodeDef,
  MatTreeNodePadding,
  MatTreeNodeToggle,
} from '@angular/material/tree';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';

import * as THREE from 'three';
import { Mesh, Object3D} from 'three';

import { Line, LineSegments } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { GeometryService } from '../../services/geometry.service';
import { ThreeService } from '../../services/three.service';



interface TreeNodeFlat {
  expandable: boolean;
  name: string;
  level: number;
  type: string;
  object3D: Object3D;
  visible: boolean;
}



@Component({
  selector: 'app-geometry-tree',
  standalone: true,
  imports: [
    MatTree,
    MatTreeNode,
    MatTreeNodeToggle,
    MatTreeNodeDef,
    MatTreeNodePadding,
    MatIcon,
    MatTooltip,
    MatIconButton,
  ],
  templateUrl: './scene-tree.component.html',
  styleUrls: ['./scene-tree.component.scss'],
})
export class SceneTreeComponent implements OnInit {

  @Output() configureItem = new EventEmitter<string>();

  /** Enable/disable generic geometry highlighting. */
  public isHighlightingEnabled = false;

  /** Enable/disable event-track highlighting. */
  public isTrackHighlightingEnabled = false;

  /* ---------------- Track highlight parameters ---------------- */

  private readonly trackColorHighlight = 0xff4081; // vivid pink for highlight
  private readonly baseTrackWidth = 0.003;        // world-unit width in TrajectoryPainter
  private readonly trackWidthFactor = 2;          // how many times thicker when highlighted

  /* ---------------- Highlight materials for regular geometry ---------------- */

  private readonly geometryHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    wireframe: true,
  });

  /* ---------------- Tree helpers ---------------- */

  public treeControl = new FlatTreeControl<TreeNodeFlat>(
    node => node.level,
    node => node.expandable,
  );

  private treeFlattener = new MatTreeFlattener<Object3D, TreeNodeFlat>(
    (node: Object3D, level: number): TreeNodeFlat => ({
      expandable: !!node.children && node.children.length > 0,
      name: node.name || '(untitled)',
      level,
      type: node.type,
      object3D: node,
      visible: node.visible,
    }),
    node => node.level,
    node => node.expandable,
    node => node.children,
  );

  public dataSource = new MatTreeFlatDataSource(
    this.treeControl,
    this.treeFlattener,
  );

  public hasChild = (_: number, node: TreeNodeFlat) => node.expandable;

  /* ---------------- Constructor / init ---------------- */

  constructor(
    private threeService: ThreeService,
  ) {}

  ngOnInit(): void {
    this.refreshSceneTree();
  }

  /* ---------------- UI callbacks ---------------- */

  onConfigClick(type: string) {
    this.configureItem.emit(type);
  }

  public toggleHighlighting(): void {
    this.isHighlightingEnabled = !this.isHighlightingEnabled;
    console.log(
      `Geometry highlighting is now ${
        this.isHighlightingEnabled ? 'enabled' : 'disabled'
      }`,
    );
  }

  public toggleTrackHighlighting(): void {
    this.isTrackHighlightingEnabled = !this.isTrackHighlightingEnabled;
    console.log(
      `Track highlighting is now ${
        this.isTrackHighlightingEnabled ? 'enabled' : 'disabled'
      }`,
    );
  }

  /* ---------------- Tree population ---------------- */

  public refreshSceneTree(): void {
    this.dataSource.data = [];
    const scene = this.threeService.scene;
    if (!scene) {
      console.warn('No scene present in ThreeService.');
      return;
    }
    this.dataSource.data = scene.children;
    this.treeControl.collapseAll();
  }

  /* ---------------- Visibility toggle ---------------- */

  public isEffectivelyVisible(obj: Object3D): boolean {
    let cur: Object3D | null = obj;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent!;
    }
    return true;
  }


  private revealPath(target: Object3D, full = false): void {
    //  enabling each invisible parent and hiding its other children
    let branch: Object3D = target;
    let parent: Object3D | null = branch.parent;
    while (parent) {
      if (!parent.visible) {
        parent.visible = true;
        parent.children.forEach(child => {
          if (child !== branch) child.visible = false;
        });
      }
      branch = parent;
      parent = parent.parent;
    }

    // show every descendant of the original target
    if (full) target.traverse(child => (child.visible = true));
  }


  public toggleVisibility(node: TreeNodeFlat): void {
    const obj = node.object3D;

    if (obj.visible) {
      obj.visible = false;
    } else {
      const hiddenAncestor = (() => {
        for (let p = obj.parent; p; p = p.parent) if (!p.visible) return true;
        return false;
      })();

      if (hiddenAncestor) {
        this.revealPath(obj, /* full = */ false);
        obj.visible = true;
      } else {
        this.revealPath(obj, /* full = */ true);
        obj.visible = true;
      }
    }

    node.visible = this.isEffectivelyVisible(obj);
  }


  /* ---------------- Mouse-over handlers ---------------- */

  public onMouseEnterNode(node: TreeNodeFlat): void {
    if (this.isHighlightingEnabled && !this.isTrackNode(node)) {
      this.highlightNode(node);
    }

    if (this.isTrackHighlightingEnabled && this.isTrackNode(node)) {
      this.highlightTrack(node);
    }
  }

  public onMouseLeaveNode(node: TreeNodeFlat): void {
    if (this.isHighlightingEnabled && !this.isTrackNode(node)) {
      this.unhighlightNode(node);
    }

    if (this.isTrackHighlightingEnabled && this.isTrackNode(node)) {
      this.unhighlightTrack(node);
    }
  }

  /* ---------------- Geometry highlight (meshes) ---------------- */

  public highlightNode(node: TreeNodeFlat): void {

    node.object3D.traverse(child => {
      if (child instanceof Mesh) {
        if (!child.userData['origMaterial']) {
          child.userData['origMaterial'] = child.material;
        }
        child.material = this.geometryHighlightMaterial;
      }
    });
  }

  public unhighlightNode(node: TreeNodeFlat): void {
    node.object3D.traverse(child => {
      if (child instanceof Mesh && child.userData['origMaterial']) {
        child.material = child.userData['origMaterial'];
        delete child.userData['origMaterial'];
      }
    });
  }

  /* ---------------- Track highlight (Line2) ---------------- */

  /** Main helper – apply callback to every line-like object. */
  private applyToLine(
    obj: Object3D,
    action: (line: Line | LineSegments | Mesh | Line2) => void,
  ): number {
    let count = 0;
    obj.traverse(child => {
      if (child instanceof Line2) {
        action(child as any);
        ++count;
      }
    });
    return count;
  }

  /** Returns true if node belongs to the “event track” hierarchy. */
  public isTrackNode(node: TreeNodeFlat): boolean {
    return (
      this.isUnderEventParent(node) &&
      (node.name.toLowerCase().includes('track') ||
        this.hasLineGeometry(node.object3D) ||
        node.object3D.userData?.['isTrack'] === true)
    );
  }

  /** Detect “Event” parent upwards in scene graph. */
  private isUnderEventParent(node: TreeNodeFlat): boolean {
    if (
      node.name.toLowerCase() === 'event' ||
      node.object3D.userData?.['isEvent'] === true
    ) {
      return true;
    }
    let cur: Object3D | null = node.object3D;
    while (cur && cur.parent) {
      if (
        cur.parent.name.toLowerCase() === 'event' ||
        cur.parent.userData?.['isEvent'] === true
      ) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  }

  /** Quick geometry test for lines. */
  private hasLineGeometry(object: Object3D): boolean {
    let found = false;
    object.traverse(o => {
      if (
        o instanceof Line ||
        o instanceof LineSegments ||
        o instanceof Line2 ||
        (o instanceof Mesh &&
          o.geometry &&
          o.geometry.type.includes('Line'))
      ) {
        found = true;
      }
    });
    return found;
  }

  /* ---------- Track highlight helpers ---------- */

  /** Change colour and width of a LineMaterial. */
  private setLineAppearance(
    line: Line2,
    color: number,
    width: number,
  ) {
    const mat = line.material as LineMaterial;
    mat.color.setHex(color);
    mat.linewidth = width;
    mat.needsUpdate = true; // required for material changes
  }

  public highlightTrack(node: TreeNodeFlat): void {

    node.object3D.traverse(obj3d => {
      if (obj3d.userData['highlightFunction']) {
        obj3d.userData['highlightFunction']();
      }
    });


    // console.log(node);
    // this.applyToLine(node.object3D, line => {
    //   if (!(line instanceof Line2)) return;
    //
    //   const origMaterial = line.material as LineMaterial;
    //
    //   if (!line.userData['origMaterial']) {
    //
    //     // Save original material
    //     line.userData['origMaterial'] = origMaterial;
    //     const highMaterial = origMaterial.clone();
    //
    //     // Set highlight material properties
    //     highMaterial.color.setHex(this.trackColorHighlight);
    //     highMaterial.linewidth = origMaterial.linewidth * this.trackWidthFactor;
    //
    //     // Apply highlight material
    //     line.material = highMaterial;
    //     highMaterial.needsUpdate = true;
    //   }
    //
    //
    //
    //   /* Save original parameters once */
    //   // if (!line.userData['origSaved']) {
    //   //   const mat = line.material as LineMaterial;
    //   //   mat.clone();
    //   //
    //   //   line.userData['origColor'] = mat.color.getHex();
    //   //   line.userData['origWidth'] = mat.linewidth;
    //   //   line.userData['origSaved'] = true;
    //   // }
    //   //
    //   // const origWidth =
    //   //   (line.userData['origWidth'] as number) ?? this.baseTrackWidth;
    //   //
    //   // this.setLineAppearance(
    //   //   line,
    //   //   this.trackColorHighlight,
    //   //   ,
    //   // );
    // });
  }

  public unhighlightTrack(node: TreeNodeFlat): void {

    // if (node.object3D.userData['unhighlightFunction']) {
    //     node.object3D.userData['unhighlightFunction']();
    //   }

    node.object3D.traverse(obj3d => {
      if (obj3d.userData['unhighlightFunction']) {
        obj3d.userData['unhighlightFunction']();
      }
    });

    // this.applyToLine(node.object3D, line => {
    //   if (!line.userData['origMaterial']) return;
    //
    //   // restore original material
    //   line.material = line.userData['origMaterial'] as LineMaterial;
    //   line.material.needsUpdate = true;
    //
    //   // delete so highlight works
    //   delete line.userData['origMaterial'];
    // });
  }
}

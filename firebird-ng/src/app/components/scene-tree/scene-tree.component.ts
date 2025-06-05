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
  selector: 'app-scene-tree',
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


  public get isAnyHighlightingEnabled(): boolean {
    return this.isHighlightingEnabled || this.isTrackHighlightingEnabled;
  }


  public toggleHighlighting(): void {
    const newState = !this.isAnyHighlightingEnabled;

    this.isHighlightingEnabled = newState;
    this.isTrackHighlightingEnabled = newState;
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


  /** Returns true if node belongs to the "event track" hierarchy. */
  public isTrackNode(node: TreeNodeFlat): boolean {
    return (
      this.isUnderEventParent(node) &&
      (node.name.toLowerCase().includes('track') ||
        this.hasLineGeometry(node.object3D) ||
        node.object3D.userData?.['isTrack'] === true)
    );
  }

  /** Detect "Event" parent upwards in scene graph. */
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


  public highlightTrack(node: TreeNodeFlat): void {
    // Using the highlight function stored in userData
    node.object3D.traverse(obj3d => {
      if (obj3d.userData['highlightFunction']) {
        obj3d.userData['highlightFunction']();
      }
    });
  }

  public unhighlightTrack(node: TreeNodeFlat): void {
    // Using the unhighlight function stored in userData
    node.object3D.traverse(obj3d => {
      if (obj3d.userData['unhighlightFunction']) {
        obj3d.userData['unhighlightFunction']();
      }
    });
  }
}

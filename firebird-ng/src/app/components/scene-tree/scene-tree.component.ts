import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';

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

  public childrenAccessor = (node: Object3D): Object3D[] => node.children ?? [];

  public isExpandable = (node: Object3D): boolean =>
    !!node.children && node.children.length > 0;

  public dataSource: Object3D[] = [];

  public hasChild = (_: number, node: Object3D) =>
    !!node.children && node.children.length > 0;

  /* ---------------- Constructor / init ---------------- */

  constructor(
    private threeService: ThreeService,
    private cdr: ChangeDetectorRef,
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
    const scene = this.threeService.scene;
    if (!scene) {
      console.warn('No scene present in ThreeService.');
      return;
    }
    // Force tree to disconnect old data source, then reconnect with new data
    this.dataSource = [];
    this.cdr.detectChanges();
    this.dataSource = [...scene.children];
    this.cdr.detectChanges();
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


  public toggleVisibility(node: Object3D): void {
    if (node.visible) {
      node.visible = false;
    } else {
      const hiddenAncestor = (() => {
        for (let p = node.parent; p; p = p.parent) if (!p.visible) return true;
        return false;
      })();

      if (hiddenAncestor) {
        this.revealPath(node, /* full = */ false);
        node.visible = true;
      } else {
        this.revealPath(node, /* full = */ true);
        node.visible = true;
      }
    }
  }


  /* ---------------- Mouse-over handlers ---------------- */

  public onMouseEnterNode(node: Object3D): void {
    if (this.isHighlightingEnabled && !this.isTrackNode(node)) {
      this.highlightNode(node);
    }

    if (this.isTrackHighlightingEnabled && this.isTrackNode(node)) {
      this.highlightTrack(node);
    }
  }

  public onMouseLeaveNode(node: Object3D): void {
    if (this.isHighlightingEnabled && !this.isTrackNode(node)) {
      this.unhighlightNode(node);
    }

    if (this.isTrackHighlightingEnabled && this.isTrackNode(node)) {
      this.unhighlightTrack(node);
    }
  }

  /* ---------------- Geometry highlight (meshes) ---------------- */

  public highlightNode(node: Object3D): void {
    node.traverse(child => {
      if (child instanceof Mesh) {
        if (!child.userData['origMaterial']) {
          child.userData['origMaterial'] = child.material;
        }
        child.material = this.geometryHighlightMaterial;
      }
    });
  }

  public unhighlightNode(node: Object3D): void {
    node.traverse(child => {
      if (child instanceof Mesh && child.userData['origMaterial']) {
        child.material = child.userData['origMaterial'];
        delete child.userData['origMaterial'];
      }
    });
  }


  /** Returns true if node belongs to the "event track" hierarchy. */
  public isTrackNode(node: Object3D): boolean {
    return (
      this.isUnderEventParent(node) &&
      (node.name.toLowerCase().includes('track') ||
        this.hasLineGeometry(node) ||
        node.userData?.['isTrack'] === true)
    );
  }

  /** Detect "Event" parent upwards in scene graph. */
  private isUnderEventParent(node: Object3D): boolean {
    if (
      node.name.toLowerCase() === 'event' ||
      node.userData?.['isEvent'] === true
    ) {
      return true;
    }
    let cur: Object3D | null = node;
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


  public highlightTrack(node: Object3D): void {
    node.traverse(obj3d => {
      if (obj3d.userData['highlightFunction']) {
        obj3d.userData['highlightFunction']();
      }
    });
  }

  public unhighlightTrack(node: Object3D): void {
    node.traverse(obj3d => {
      if (obj3d.userData['unhighlightFunction']) {
        obj3d.userData['unhighlightFunction']();
      }
    });
  }
}

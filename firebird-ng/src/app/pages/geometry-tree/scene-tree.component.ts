import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import { NestedTreeControl, FlatTreeControl } from '@angular/cdk/tree';
import {
  MatTreeFlatDataSource,
  MatTreeFlattener
} from '@angular/material/tree';
import { Mesh, MeshBasicMaterial, Object3D } from 'three';
import { GeometryService } from '../../services/geometry.service';
import { ThreeService } from '../../services/three.service'; // <-- Replace with the actual path
import { MatTree, MatTreeNode, MatNestedTreeNode } from '@angular/material/tree';
import { MatTreeNodeToggle, MatTreeNodeDef, MatTreeNodePadding, MatTreeNodeOutlet } from '@angular/material/tree';
import { MatIcon } from '@angular/material/icon';
import {MatButton, MatIconButton} from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import {TrackPainterConfig} from "../../services/track-painter-config";

/** Representation of a flattened node (for display in the mat-tree). */
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
    imports: [
        // Material tree and node imports
        MatTree,
        MatTreeNode,
        MatNestedTreeNode,
        MatTreeNodeToggle,
        MatTreeNodeDef,
        MatTreeNodeOutlet,
        MatTreeNodePadding,
        // Material UI components
        MatIcon,
        MatButton,
        MatTooltip,
        MatIconButton
    ],
    templateUrl: './scene-tree.component.html',
    styleUrls: ['./scene-tree.component.scss']
})
export class SceneTreeComponent implements OnInit {
  @Output() configureItem = new EventEmitter<string>();
  /** Whether highlighting is enabled or not. */
  public isHighlightingEnabled = false;

  /** Tree Control to manage expand/collapse. */
  public treeControl = new FlatTreeControl<TreeNodeFlat>(
    node => node.level,
    node => node.expandable
  );

  /** Tree flattener to transform hierarchical data into flat data. */
  private treeFlattener = new MatTreeFlattener<Object3D, TreeNodeFlat>(
    (node: Object3D, level: number): TreeNodeFlat => ({
      expandable: node.children && node.children.length > 0,
      name: node.name || '(untitled)',
      level,
      type: node.type,
      object3D: node,
      visible: node.visible
    }),
    node => node.level,
    node => node.expandable,
    node => node.children
  );

  /** Data source for the MatTree. */
  public dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);

  /** Whether a node has children. */
  public hasChild = (_: number, node: TreeNodeFlat) => node.expandable;

  constructor(
    private geometryService: GeometryService,    // if you still want/need it
    private threeService: ThreeService           // your custom Three.js service
  ) {}

  ngOnInit(): void {
    this.refreshSceneTree();
  }

  onConfigClick(type: string) {
    this.configureItem.emit(type);
  }

  /**
   * Refreshes the tree data based on the current Three.js scene objects.
   */
  public refreshSceneTree(): void {
    // Clear data first
    this.dataSource.data = [];

    // Retrieve the top-level scene from your ThreeService
    const scene = this.threeService.scene;
    if (!scene) {
      console.warn('No scene (or null) in ThreeService.');
      return;
    }

    // Assign the top-level scene.children directly to data
    this.dataSource.data = scene.children;
    // Optional: Expand or collapse certain nodes if desired
    this.treeControl.collapseAll();
  }

  /**
   * Toggles the visibility of a node/object in the scene.
   * @param node The flattened node to toggle.
   */
  public toggleVisibility(node: TreeNodeFlat): void {
    // Optionally use geometryService if you want advanced logic
    // this.geometryService.toggleVisibility(node.object3D);

    // Or simply toggle the `visible` property
    node.object3D.visible = !node.object3D.visible;
    node.visible = node.object3D.visible;
  }

  /**
   * Toggles the highlight mode on/off.
   */
  public toggleHighlighting(): void {
    this.isHighlightingEnabled = !this.isHighlightingEnabled;
    console.log(`Highlighting is now ${this.isHighlightingEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Called when hovering over an expandable node (mouse enter).
   * If highlighting is enabled, recursively highlight all child meshes.
   * @param node The node to highlight.
   */
  public highlightNode(node: TreeNodeFlat): void {
    if (!this.isHighlightingEnabled) return;

    // Example highlight logic
    node.object3D.traverse(child => {
      if (child instanceof Mesh) {
        // Save original material if not already saved
        if (!child.userData['originalMaterial']) {
          child.userData['originalMaterial'] = child.material;
        }
        // Create a highlight material
        const highlightMaterial = new MeshBasicMaterial({
          color: 0xffff00,
          wireframe: true
        });
        child.material = highlightMaterial;
      }
    });
    console.log(`Highlighted element: ${node.name}`);
  }

  /**
   * Called when mouse leaves an expandable node.
   * If highlighting is enabled, restore all child meshes to their original material.
   * @param node The node to unhighlight.
   */
  public unhighlightNode(node: TreeNodeFlat): void {
    if (!this.isHighlightingEnabled) return;

    node.object3D.traverse(child => {
      if (child instanceof Mesh) {
        // If there's an original material stored, restore it
        if (child.userData['originalMaterial']) {
          child.material = child.userData['originalMaterial'];
        }
      }
    });
    console.log(`Unhighlighted element: ${node.name}`);
  }

  /**
   * Helper method to handle mouseenter on the node row.
   * @param node The node being hovered.
   */
  public onMouseEnterNode(node: TreeNodeFlat): void {
    this.highlightNode(node);
  }

  /**
   * Helper method to handle mouseleave on the node row.
   * @param node The node being hovered out.
   */
  public onMouseLeaveNode(node: TreeNodeFlat): void {
    this.unhighlightNode(node);
  }

  /**
   * Template check to see if a node is expandable.
   * @param _index The index of the node.
   * @param node The node being queried.
   */
  public hasChildNode(_index: number, node: TreeNodeFlat): boolean {
    return node.expandable;
  }

}

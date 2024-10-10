import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {
  MatNestedTreeNode,
  MatTree,
  MatTreeNode,
  MatTreeNodeDef,
  MatTreeNodeOutlet, MatTreeNodePadding,
  MatTreeNodeToggle
} from "@angular/material/tree";
import {NestedTreeControl, FlatTreeControl, } from '@angular/cdk/tree';
import {MatTreeFlatDataSource, MatTreeFlattener} from '@angular/material/tree';

import {MatIcon, MatIconModule} from '@angular/material/icon';
import {MatButton, MatButtonModule, MatIconButton} from '@angular/material/button';
import {GeometryService} from "../../services/geometry.service";
import {Mesh, MeshBasicMaterial, Object3D} from "three";
import {EventDisplayService} from "phoenix-ui-components";
import {PhoenixThreeFacade} from "../../utils/phoenix-three-facade";
import {MatTooltip} from "@angular/material/tooltip";

/**
 * Food data with nested structure.
 * Each node has a name and an optional list of children.
 */
interface FoodNode {
  name: string;
  children?: FoodNode[];
}

const TREE_DATA: FoodNode[] = [
  {
    name: 'Fruit',
    children: [{name: 'Apple'}, {name: 'Banana'}, {name: 'Fruit loops'}],
  },
  {
    name: 'Vegetables',
    children: [
      {
        name: 'Green',
        children: [{name: 'Broccoli'}, {name: 'Brussels sprouts'}],
      },
      {
        name: 'Orange',
        children: [{name: 'Pumpkins'}, {name: 'Carrots'}],
      },
    ],
  },
];

/** Flat node with expandable and level information */
interface ExampleFlatNode {
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
    MatNestedTreeNode,
    MatIconButton,
    MatTreeNodeToggle,
    MatTreeNodeDef,
    MatIcon,
    MatTreeNodeOutlet,
    MatTreeNodePadding,
    MatButton,
    MatTooltip
  ],
  templateUrl: './geometry-tree.component.html',
  styleUrl: './geometry-tree.component.scss'
})
export class GeometryTreeComponent implements OnInit{

  isHighlightingEnabled: boolean = false;

  private _transformer = (node: Object3D, level: number) => {
    return {
      expandable: !!node.children && node.children.length > 0,
      name: node.name,
      level: level,
      type: node.type,
      object3D: node,
      visible: node.visible
    };
  };

  treeControl = new FlatTreeControl<ExampleFlatNode>(
    node => node.level,
    node => node.expandable,
  );

  treeFlattener = new MatTreeFlattener(
    this._transformer,
    node => node.level,
    node => node.expandable,
    node => node.children,
  );

  dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);


  hasChild = (_: number, node: ExampleFlatNode) => node.expandable;
  private threeFacade: PhoenixThreeFacade;

  constructor(private geomService: GeometryService,
              private eventDisplay: EventDisplayService) {
      //this.dataSource.data = TREE_DATA;
      this.threeFacade = new PhoenixThreeFacade(this.eventDisplay);


  }

  ngOnInit(): void {

    // if (!this.geomService.geometry) {
    //   this.geomService.loadGeometry()
    //     .then(result => {
    //       if (result.threeGeometry) {
    //         this.dataSource.data = result.threeGeometry.children;
    //       } else {
    //         console.error("this.geomService.loadGeometry() ! result.threeGeometry");
    //       }
    //     })
    //     .catch(reason => {
    //       console.error("ERROR LOADING GEOMETRY");
    //       console.log(reason);
    //     });
    // }
      this.dataSource.data = this.threeFacade.scene.children;
  }

  toggleVisibility(node: ExampleFlatNode) {
    this.geomService.toggleVisibility(node.object3D);
    node.visible = !node.visible;
  }

  refreshScheneTree() {
    this.dataSource.data = [];
    this.dataSource.data = this.threeFacade.scene.children;
  }

  toggleHighlighting(): void {
    this.isHighlightingEnabled = !this.isHighlightingEnabled;
    console.log(`Highlighting is now ${this.isHighlightingEnabled ? 'enabled' : 'disabled'}`);
  }

  private isEventDataNode(node: ExampleFlatNode): boolean {
    let currentNode: ExampleFlatNode | null = node;

    while (currentNode) {
      if (currentNode.name.includes('EventData')) {
        return true;
      }
      currentNode = this.getParentNode(currentNode);
    }

    return false;
  }

  private getParentNode(node: ExampleFlatNode): ExampleFlatNode | null {
    for (let i = 0; i < this.treeControl.dataNodes.length; i++) {
      const currentNode = this.treeControl.dataNodes[i];
      if (currentNode.expandable && this.treeControl.getLevel(currentNode) < node.level) {
        const childNodes = this.treeControl.getDescendants(currentNode);
        if (childNodes.includes(node)) {
          return currentNode;
        }
      }
    }
    return null;
  }

  highlightNode(node: ExampleFlatNode): void {
    if (!this.isHighlightingEnabled) {
      return;
    }

    const isEventData = this.isEventDataNode(node);

    node.object3D.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        if (!child.userData['originalMaterial']) {
          child.userData['originalMaterial'] = child.material;
        }

        if (isEventData) {
          const originalMaterial = child.material as any;
          const highlightMaterial = originalMaterial.clone();
          highlightMaterial.color.set(0xffff00);
          highlightMaterial.wireframe = true;

          child.material = highlightMaterial;
        } else {
          child.material = new MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        }
      }
    });
    console.log(`Element highlighted: ${node.name}`);
  }


  unhighlightElement(node: ExampleFlatNode): void {
    if (!this.isHighlightingEnabled) {
      return;
    }
    node.object3D.traverse((child: Object3D) => {
      if (child instanceof Mesh && child.userData['originalMaterial']) {
        child.material = child.userData['originalMaterial'];
      }
    });
    console.log(`Element unhighlighted: ${node.name}`);
  }
}

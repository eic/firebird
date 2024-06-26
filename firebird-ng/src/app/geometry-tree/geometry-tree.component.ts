import {Component, OnInit} from '@angular/core';
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
import {MatButtonModule, MatIconButton} from '@angular/material/button';
import {GeometryService} from "../geometry.service";
import {Object3D} from "three";

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
    MatTreeNodePadding
  ],
  templateUrl: './geometry-tree.component.html',
  styleUrl: './geometry-tree.component.scss'
})
export class GeometryTreeComponent implements OnInit{

  private _transformer = (node: Object3D, level: number) => {
    return {
      expandable: !!node.children && node.children.length > 0,
      name: node.name,
      level: level,
      type: node.type
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

  constructor(private geomService: GeometryService) {
    //this.dataSource.data = TREE_DATA;
  }

  ngOnInit(): void {
      if(!this.geomService.geometry) this.geomService.loadGeometry().then(result => {
        if(result.threeGeometry) {
          this.dataSource.data = result.threeGeometry.children;
        }
        else {
          console.error("this.geomService.loadGeometry() ! result.threeGeometry");
        }
    }).catch(reason=>{
      console.error("ERROR LOADING GEOMETRY");
      console.log(reason);
      });
    }


}

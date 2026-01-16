import {Object3D, Group} from "three";


export const GROUP_CALORIMETRY = "Calorimeters";
export const GROUP_TRACKING = "Tracking";
export const GROUP_PID = "PID";
export const GROUP_MAGNETS = "Magnets";
export const GROUP_SUPPORT = "Beam pipe, support";
export const GROUP_FORWARD = "Forward";
export const GROUP_CENTRAL = "Central";
export const GROUP_BACKWARD = "Backward";

// All groups for central detector
export const ALL_CENTRAL_GROUPS = [
  GROUP_CALORIMETRY,
  GROUP_TRACKING,
  GROUP_PID,
  GROUP_MAGNETS,
  GROUP_SUPPORT,
]



let categoriesByDetName = new Map<string,string> ([
      ["SolenoidBarrel_assembly", GROUP_MAGNETS],
      ["SolenoidEndcapP", GROUP_MAGNETS],
      ["SolenoidEndcapN", GROUP_MAGNETS],
      ["VertexBarrelSubAssembly", GROUP_TRACKING],
      ["InnerSiTrackerSubAssembly", GROUP_TRACKING],
      ["MiddleSiTrackerSubAssembly", GROUP_TRACKING],
      ["OuterSiTrackerSubAssembly", GROUP_TRACKING],
      ["EndcapMPGDSubAssembly", GROUP_TRACKING],
      ["InnerMPGDBarrelSubAssembly", GROUP_TRACKING],
      ["EndcapTOFSubAssembly", GROUP_PID],
      ["BarrelTOFSubAssembly", GROUP_PID],
      ["OuterBarrelMPGDSubAssembly", GROUP_TRACKING],
      ["B0TrackerSubAssembly", GROUP_TRACKING],
      ["InnerTrackerSupport_assembly", GROUP_SUPPORT],
      ["DIRC", GROUP_PID],
      ["RICHEndcapN_Vol", GROUP_PID],
      ["DRICH", GROUP_PID],
      ["EcalEndcapP", GROUP_CALORIMETRY],
      ["EcalEndcapPInsert", GROUP_CALORIMETRY],
      ["EcalBarrelImaging", GROUP_CALORIMETRY],
      ["EcalBarrelScFi", GROUP_CALORIMETRY],
      ["EcalEndcapN", GROUP_CALORIMETRY],
      ["LFHCAL_env", GROUP_CALORIMETRY],
      ["HcalEndcapPInsert", GROUP_CALORIMETRY],
      ["HcalBarrel", GROUP_CALORIMETRY],
      ["FluxBarrel_env", GROUP_SUPPORT],
      ["FluxEndcapP", GROUP_SUPPORT],
      ["HcalEndcapN", GROUP_CALORIMETRY],
      ["FluxEndcapN", GROUP_SUPPORT],
      // ["BeamPipe_assembly", GROUP_SUPPORT],
      // ["B0PF_BeamlineMagnet_assembly", GROUP_MAGNETS],
      // ["B0APF_BeamlineMagnet_assembly", GROUP_MAGNETS],
      // ["Q1APF_BeamlineMagnet_assembly", GROUP_MAGNETS],
      // ["Q1BPF_BeamlineMagnet_assembly", GROUP_MAGNETS],
      // ["BeamPipeB0_assembly", GROUP_SUPPORT],
      // ["Pipe_cen_to_pos_assembly", GROUP_SUPPORT],
      // ["Q0EF_assembly", GROUP_MAGNETS],
      // ["Q0EF_vac", GROUP_MAGNETS],
      // ["Q1EF_assembly", GROUP_MAGNETS],
      // ["Q1EF_vac", GROUP_MAGNETS],
      // ["B0ECal", GROUP_CALORIMETRY],
      // ["Pipe_Q1eR_to_B2BeR_assembly", GROUP_SUPPORT],
      // ["Magnet_Q1eR_assembly", GROUP_MAGNETS],
      // ["Magnet_Q2eR_assembly", GROUP_MAGNETS],
      // ["Magnet_B2AeR_assembly", GROUP_MAGNETS],
      // ["Magnet_B2BeR_assembly", GROUP_MAGNETS],
      // ["Magnets_Q3eR_assembly", GROUP_MAGNETS],
    ])

function findCategoryNodes(geometry: Object3D): Map<string, Object3D> {

  // clear
  const nodesByName = new Map<string, Object3D>();

  for(const node of geometry.children) {
    if(node.name == GROUP_FORWARD) {
      nodesByName.set(GROUP_FORWARD, node);
      continue;
    }

    if(node.name == GROUP_BACKWARD) {
      nodesByName.set(GROUP_BACKWARD, node);
      continue;
    }

    if(node.name == GROUP_CENTRAL) {
      for(const centralDetNode of node.children) {
        for(const groupName of ALL_CENTRAL_GROUPS) {
          if(centralDetNode.name == groupName) {
            nodesByName.set(groupName, centralDetNode);
          }
        }
      }
    }
  }
  return nodesByName;
}

function createCategoryNodes(geometry: Object3D): Map<string, Object3D> {

  const nodesByName = new Map<string, Object3D>();

  // little helper factory to add groups
  function addGroup(name:string): Group {
    const group = new Group();
    group.name = name;
    nodesByName.set(name, group);
    return group;
  }

  // Forward detectors
  const forward = addGroup(GROUP_FORWARD);

  // Backwards
  const backward = addGroup(GROUP_BACKWARD);

  // Central detector
  const central = addGroup(GROUP_CENTRAL);

  // add central detector subgroups
  for(const groupName of ALL_CENTRAL_GROUPS) {
    let group = addGroup(groupName);
    central.add(group);
  }

  // add groups to detector
  geometry.add(backward);
  geometry.add(central);
  geometry.add(forward);

  // We still need categories
  return nodesByName;
}

export function arrangeEpicDetectors(geometry: Object3D) {

  let categoriesByName = findCategoryNodes(geometry);
  if(categoriesByName.size == 0) {
    categoriesByName = createCategoryNodes(geometry);
  }

  // get top detector nodes and iterate over them
  const root = geometry.children[0]?.children[0];
  if (!root) return;

  // Work on a copy so we can safely reparent during iteration
  const topDetectorNodes = [...root.children];

  for(const detNode of topDetectorNodes) {
    for(const [detName, categoryName] of categoriesByDetName) {
      if(detNode.name.startsWith(detName)) {
        // Found a category name for this detector
        const categoryNode = categoriesByName.get(categoryName);
        if(categoryNode) {
          categoryNode.add(detNode);

        }
        break;
      }
    }
  }
}

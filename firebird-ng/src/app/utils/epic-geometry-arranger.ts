import {Object3D, Group} from "three";
import {For} from "three/examples/jsm/transpiler/AST";

// Main detector areas
export const GROUP_FORWARD = "Forward";
export const GROUP_CENTRAL = "Central";
export const GROUP_BACKWARD = "Backward";

// Central detector subgroups
export const GROUP_CALORIMETRY = "Calorimeters";
export const GROUP_TRACKING = "Tracking";
export const GROUP_PID = "PID";
export const GROUP_MAGNETS = "Magnets";
export const GROUP_SUPPORT = "Beam pipe, support";

// All groups for central detector
export const CENTRAL_DETECTOR_GROUPS = [
  GROUP_CALORIMETRY,
  GROUP_TRACKING,
  GROUP_PID,
  GROUP_MAGNETS,
  GROUP_SUPPORT,
]


let categoriesByDetName = new Map<string, string>([

  // Central
  ["SolenoidBarrel_assembly", GROUP_MAGNETS],
  ["SolenoidEndcapP", GROUP_MAGNETS],
  ["SolenoidEndcapN", GROUP_MAGNETS],

  ["VertexBarrelSubAssembly", GROUP_TRACKING],

  ["InnerSiTrackerSubAssembly", GROUP_TRACKING],
  ["MiddleSiBarrelSubAssembly", GROUP_TRACKING],
  ["OuterSiBarrelSubAssembly", GROUP_TRACKING],
  ["MiddleSiEndcapSubAssembly", GROUP_TRACKING],
  ["OuterSiEndcapSubAssembly", GROUP_TRACKING],
  ["EndcapMPGDSubAssembly", GROUP_TRACKING],
  ["InnerMPGDBarrelSubAssembly", GROUP_TRACKING],
  ["EndcapTOFSubAssembly", GROUP_PID],
  ["BarrelTOFSubAssembly", GROUP_PID],
  ["OuterBarrelMPGDSubAssembly", GROUP_TRACKING],

  // Tracking supports
  ["SVT_IB_Support_L2_assembly", GROUP_SUPPORT],
  ["SVT_IB_Support_L1_assembly", GROUP_SUPPORT],
  ["SVT_IB_Support_L0_L1_assembly", GROUP_SUPPORT],
  ["InnerTrackerSupport_assembly", GROUP_SUPPORT],

  // PID
  ["DIRC", GROUP_PID],
  ["RICHEndcapN", GROUP_PID],
  ["DRICH", GROUP_PID],

  // Fluxes
  ["FluxBarrel", GROUP_SUPPORT],
  ["FluxEndcapP", GROUP_SUPPORT],
  ["FluxEndcapN", GROUP_SUPPORT],


  // Calorimeters
  ["EcalEndcapP", GROUP_CALORIMETRY],
  ["EcalBarrelTrackerSubAssembly", GROUP_TRACKING],
  ["EcalBarrelScFi", GROUP_CALORIMETRY],
  ["EcalEndcapN", GROUP_CALORIMETRY],
  ["LFHCAL", GROUP_CALORIMETRY],
  ["HcalEndcapPInsert", GROUP_CALORIMETRY],
  ["HcalBarrel", GROUP_CALORIMETRY],
  ["HcalEndcapN", GROUP_CALORIMETRY],

  // Beam pipe
  ["BeamPipe_assembly", GROUP_SUPPORT],


  // ========= FORWARD =============
  ["Pipe_cen_to_pos_assembly", GROUP_FORWARD],       // Electron beampipe


  // B0
  ["B0Window_vol_ExitWindow", GROUP_FORWARD],
  ["Q0EF_BeamlineMagnet_assembly", GROUP_FORWARD],  // Magnet around Electron beampipe
  ["B0TrackerSubAssembly", GROUP_FORWARD],
  ["B0PF_BeamlineMagnet_assembly", GROUP_FORWARD],
  ["B0ECal", GROUP_FORWARD],

  ["B0APF_BeamlineMagnet_assembly", GROUP_FORWARD],  // After B0
  ["Q1APF_BeamlineMagnet_assembly", GROUP_FORWARD],  // Inner
  ["Q1BPF_BeamlineMagnet_assembly", GROUP_FORWARD],  // Outer
  ["Q1EF_BeamlineMagnet_assembly", GROUP_FORWARD],   // Around Electron Beampipe
  ["Q2PF_BeamlineMagnet_assembly", GROUP_FORWARD],   // Further
  ["B1PF_BeamlineMagnet_assembly", GROUP_FORWARD],   // After Q2PF
  ["B1APF_BeamlineMagnet_assembly", GROUP_FORWARD],  // after B1PF

  // Off momentum + Roman pods
  ["BeamPipeB0_assembly", GROUP_FORWARD],            // after B1APF
  ["ForwardOffMTracker_station_1", GROUP_FORWARD],   // Inside BeamPipeB0_assembly
  ["ForwardOffMTracker_station_2", GROUP_FORWARD],   // Inside BeamPipeB0_assembly
  ["ForwardOffMTracker_station_3", GROUP_FORWARD],   // Inside BeamPipeB0_assembly
  ["ForwardOffMTracker_station_4", GROUP_FORWARD],   // Inside BeamPipeB0_assembly

  ["ForwardRomanPot_Station_1", GROUP_FORWARD],
  ["ForwardRomanPot_Station_2", GROUP_FORWARD],


  // ZDC
  ["ZDC_Crystal_envelope", GROUP_FORWARD],
  ["HcalFarForwardZDC_SiPMonTile", GROUP_FORWARD],

  ["VacuumMagnetElement_assembly", GROUP_FORWARD],  // Tube after ZDC

  // ========== BACKWARD =============
  ["Pipe_Q1eR_to_B2BeR_assembly", GROUP_FORWARD],     // Electron pipe
  ["Q1ER_BeamlineMagnet_assembly", GROUP_BACKWARD],   // Around electron pipeline
  ["Q1APR_BeamlineMagnet_assembly", GROUP_BACKWARD],  // Around this pipe

  ["Q2ER_BeamlineMagnet_assembly", GROUP_BACKWARD],   // Next pipe
  ["Q1BPR_BeamlineMagnet_assembly", GROUP_BACKWARD],  // Around it

  ["Q2PR_BeamlineMagnet_assembly", GROUP_BACKWARD],   // after Q2ER/Q1BPR

  // Tagger
  ["BackwardsTaggerVacuum_assembly", GROUP_BACKWARD],  // Tagger and pipeline
  ["BackwardsTaggerAssembly", GROUP_BACKWARD],         // Tagger

  ["Magnets_Q3eR_assembly", GROUP_BACKWARD],  // Far away magnet

  // LUMI
  ["LumiWindow_vol_ExitWindow", GROUP_BACKWARD],
  ["LumiCollimator_assembly", GROUP_BACKWARD],
  ["SweeperMag_assembly", GROUP_BACKWARD],
  ["AnalyzerMag_assembly", GROUP_BACKWARD],
  ["LumiSpecTracker", GROUP_BACKWARD],
  ["LumiPhotonChamber", GROUP_BACKWARD],
  ["LumiDirectPCAL", GROUP_BACKWARD]

  // ["InnerSiTrackerSubAssembly", GROUP_TRACKING],
  // ["MiddleSiTrackerSubAssembly", GROUP_TRACKING],
  // ["OuterSiTrackerSubAssembly", GROUP_TRACKING],
  // ["EndcapMPGDSubAssembly", GROUP_TRACKING],
  // ["InnerMPGDBarrelSubAssembly", GROUP_TRACKING],
  // ["EndcapTOFSubAssembly", GROUP_PID],
  // ["BarrelTOFSubAssembly", GROUP_PID],
  // ["OuterBarrelMPGDSubAssembly", GROUP_TRACKING],
  // ["B0TrackerSubAssembly", GROUP_TRACKING],
  // ["InnerTrackerSupport_assembly", GROUP_SUPPORT],
  // ["DIRC", GROUP_PID],
  // ["RICHEndcapN_Vol", GROUP_PID],
  // ["DRICH", GROUP_PID],
  // ["EcalEndcapP", GROUP_CALORIMETRY],
  // ["EcalEndcapPInsert", GROUP_CALORIMETRY],
  // ["EcalBarrelImaging", GROUP_CALORIMETRY],
  // ["EcalBarrelScFi", GROUP_CALORIMETRY],
  // ["EcalEndcapN", GROUP_CALORIMETRY],
  // ["LFHCAL_env", GROUP_CALORIMETRY],
  // ["HcalEndcapPInsert", GROUP_CALORIMETRY],
  // ["HcalBarrel", GROUP_CALORIMETRY],
  // ["FluxBarrel_env", GROUP_SUPPORT],
  // ["FluxEndcapP", GROUP_SUPPORT],
  // ["HcalEndcapN", GROUP_CALORIMETRY],
  // ["FluxEndcapN", GROUP_SUPPORT],
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

  for (const node of geometry.children) {
    if (node.name == GROUP_FORWARD) {
      nodesByName.set(GROUP_FORWARD, node);
      continue;
    }

    if (node.name == GROUP_BACKWARD) {
      nodesByName.set(GROUP_BACKWARD, node);
      continue;
    }

    if (node.name == GROUP_CENTRAL) {
      for (const centralDetNode of node.children) {
        for (const groupName of CENTRAL_DETECTOR_GROUPS) {
          if (centralDetNode.name == groupName) {
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
  function addGroup(name: string): Group {
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
  for (const groupName of CENTRAL_DETECTOR_GROUPS) {
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
  if (categoriesByName.size == 0) {
    categoriesByName = createCategoryNodes(geometry);
  }

  // get top detector nodes and iterate over them
  const root = geometry.children[0]?.children[0];
  if (!root) return;

  // Work on a copy so we can safely reparent during iteration
  const topDetectorNodes = [...root.children];

  for (const detNode of topDetectorNodes) {
    for (const [detName, categoryName] of categoriesByDetName) {
      if (detNode.name.startsWith(detName)) {
        // Found a category name for this detector
        const categoryNode = categoriesByName.get(categoryName);
        if (categoryNode) {
          categoryNode.add(detNode);
        }
        break;
      }
    }
  }
}

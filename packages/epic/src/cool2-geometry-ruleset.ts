import * as THREE from "three";
import {DepthModes} from "three";
import {
  AMBER_50, BLUE_50, GRAY_50, INDIGO_80, PINK_50, PURPLE_50, GRAY_100, GREEN_100, ORANGE_100,
  YELLOW_100, BLUE_200, BROWN_100, AMBER_200, INDIGO_200, GREEN_200, ORANGE_200, ORANGE_DEEP_200,
  TEAL_200, YELLOW_200, BLUE_300, GRAY_300, BLUE_GRAY_400, PURPLE_400, AMBER_500, GUNMETAL_BLUE,
  PEWTER, STEEL_BLUE, TITANIUM, CHROME, SILVER,
} from "@dexvis/firebird-ng/geometry-palette";

/**
 * COOL2 Color Rules - Modern palette based on detector categories
 *
 * Color scheme:
 * - Tracking detectors: yellowish-orange (AMBER, ORANGE, YELLOW)
 * - PID detectors: greenish (GREEN, TEAL)
 * - Electron calorimeters (Ecal): pink/violetish (PINK, PURPLE)
 * - HCALs: bluish (BLUE)
 * - Flux return: grey (GRAY)
 * - Electron beampipe: saturated blue metallic (STEEL_BLUE)
 * - Magnets and support: neutral metal or light colors
 */
export const cool2ColorRules = [

  // ============================================================
  // CENTRAL DETECTOR - MAGNETS
  // ============================================================
  {
    names: ["SolenoidBarrel_assembly*", "SolenoidEndcapP*", "SolenoidEndcapN*"],
    rules: [
      {
        //color: CHROME,  // Neutral metal for main solenoid
        material: new THREE.MeshPhongMaterial({
          color: CHROME,  // Metal support
          specular: GRAY_50,
          shininess: 100,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          clipShadows: true,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilRef: 1,
        }),
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - TRACKING (Yellowish-Orange)
  // ============================================================

  // Vertex detectors - warmest orange tone
  {
    name: "VertexBarrelSubAssembly*",
    rules: [
      {
        color: ORANGE_DEEP_200,  // Medium-light orange
        merge: true,
        outline: true
      }
    ]
  },

  // Silicon trackers - amber/orange tones
  {
    names: [
      "InnerSiTrackerSubAssembly*",
      "MiddleSiBarrelSubAssembly*",
      "OuterSiBarrelSubAssembly*",
      "MiddleSiEndcapSubAssembly*",
      "OuterSiEndcapSubAssembly*"
    ],
    rules: [
      {
        color: AMBER_200,  // Medium-light amber
        merge: true,
        outline: true
      }
    ]
  },

  // MPGD Trackers - yellowish
  {
    names: [
      "EndcapMPGDSubAssembly*",
      "InnerMPGDBarrelSubAssembly*",
      "OuterBarrelMPGDSubAssembly*"
    ],
    rules: [
      {
        color: YELLOW_200,  // Medium-light yellow
        merge: true,
        outline: true
      }
    ]
  },

  // Ecal Barrel Tracker (imaging part) - yellowish as it's tracking
  {
    name: "EcalBarrelTrackerSubAssembly*",
    rules: [
      // {
      //   color: YELLOW_100,  // Very light yellow
      //   merge: true,
      //   outline: true
      // }
      {
        material: new THREE.MeshLambertMaterial({
          color: YELLOW_100,  // Metal support
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          clipShadows: true,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilRef: 1,
        }),
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - PID (Greenish)
  // ============================================================

  // TOF components - teal green
  {
    names: ["EndcapTOFSubAssembly*", "BarrelTOFSubAssembly*"],
    rules: [
      {
        color: TEAL_200,  // Medium-light teal
        merge: true,
        outline: true
      }
    ]
  },

  // DIRC - Green with glass effect
  {
    name: "DIRC*",
    rules: [
      {
        patterns: ["**/*box*", "**/*prism*"],
        material: new THREE.MeshPhysicalMaterial({
          color: GREEN_200,  // Medium-light green
          metalness: 0.3,
          roughness: 0.2,
          envMapIntensity: 0.5,
          clearcoat: 0.8,
          transparent: true,
          opacity: 0.5,
          reflectivity: 0.2,
          ior: 0.9,
          side: THREE.DoubleSide,
        }),
        newName: "DIRC_barAndPrisms"
      },
      {
        patterns: ["**/*rail*"],
        newName: "DIRC_rails",
        color: SILVER  // Metal rails
      },
      {
        patterns: ["**/*mcp*"],
        newName: "DIRC_mcps",
        color: GREEN_100  // Light green
      }
    ]
  },

  // DRICH
  {
    name: "DRICH*",
    rules: [
      // Pattern-specific rules FIRST (order matters!)
      {
        patterns: ["**/DRICH_mirror*"],
        color: SILVER,  // Simple silver color for fast mode; prettifier handles reflections
        merge: true,
        outline: false,
        newName: "DRICH_mirror"
      },
      {
        patterns: ["**/DRICH*pdu*"],
        color: TEAL_200,
        merge: true,
        newName: "DRICH_pdu"
      },
      // "The rest" rule LAST - processes remaining unprocessed nodes
      {
        color: GREEN_100,  // Light green
        merge: false,
        outline: true
      }
    ]
  },

  // Modular RICH (Negative endcap)
  {
    name: "RICHEndcapN*",
    rules: [
      {
        color: GREEN_100,  // Medium-light teal
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - ECAL (Pink/Violetish)
  // ============================================================
  {
    name:"EcalBarrelScFi*",
    rules: [
      // {
      //   color: PURPLE_50,
      //   merge: true,
      //   outline: true
      // }
      {
        material: new THREE.MeshLambertMaterial({
          color: PURPLE_50,  // Metal support
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          clipShadows: true,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilRef: 1,
        }),
        merge: true,
        outline: true
      }
    ]

  },

  // Ecal Forward and Barrel
  {
    name: "EcalEndcapP*",
    rules: [
      {
        color: INDIGO_80,  // Very light pink
        merge: true,
        outline: true
      }
    ]
  },
  {
    name: "EcalEndcapPInsert*",
    rules: [
      {
        color: INDIGO_200,  // Very light pink
        merge: true,
        outline: true
      }
    ]
  },

  // Ecal Backward - slightly different pink/violet
  {
    name: "EcalEndcapN*",
    rules: [
      {
        patterns: ["**/crystal_vol_0"],
        color: INDIGO_80,  // Light purple for crystals
        outlineColor: GUNMETAL_BLUE,
        merge: true,
      },
      {
        patterns: ["**/inner_support*", "**/ring*"],
        material: new THREE.MeshStandardMaterial({
          color: SILVER,  // Metal support
          roughness: 0.5,
          metalness: 0.3,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        })
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - HCAL (Bluish)
  // ============================================================
  {
    names: ["LFHCAL*", "HcalEndcapPInsert*", "HcalBarrel*", "HcalEndcapN*"],
    rules: [
      {
        // color: BLUE_200,  // Medium-light blue
        material: new THREE.MeshPhongMaterial({
          color: BLUE_200,  // Metal support
          specular: 0x454545,
          shininess: 62,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          clipShadows: true,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilRef: 1,
        }),
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - FLUX (Grey)
  // ============================================================
  {
    names: ["FluxBarrel*", "FluxEndcapP*", "FluxEndcapN*"],
    rules: [
      {
        //color: BLUE_50,  // Light-medium gray
        material: new THREE.MeshPhongMaterial({
          color: BLUE_50,  // Metal support
          specular: 0x454545,
          shininess: 62,
          transparent: false,
          depthWrite: true,
          depthTest: true,
          opacity: 1,
          side: THREE.DoubleSide,
          clipShadows: true,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilRef: 1,
        }),
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - SUPPORT (Neutral metal/light)
  // ============================================================

  // Tracking supports - light metal
  {
    names: [
      "SVT_IB_Support_L2_assembly*",
      "SVT_IB_Support_L1_assembly*",
      "SVT_IB_Support_L0_L1_assembly*"
    ],
    rules: [
      {
        color: SILVER,  // Silver metal
        merge: true,
        outline: true
      }
    ]
  },

  // Inner tracker support - semi-transparent
  {
    name: "InnerTrackerSupport_assembly*",
    rules: [
      {
        material: new THREE.MeshStandardMaterial({
          color: TITANIUM,  // Chrome metallic
          roughness: 0.4,
          metalness: 0.2,
          transparent: true,
          opacity: 0.7,
          blending: THREE.NormalBlending,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          side: THREE.DoubleSide
        }),
        outline: true,
        outlineColor: CHROME,
        merge: true,
        newName: "InnerTrackerSupport"
      }
    ]
  },

  // Central beam pipe
  {
    name: "BeamPipe_assembly*",
    rules: [
      {
        // Match v_upstream nodes - applyToDescendants (default true) includes all children
        patterns: ["**/v_upstream*"],
        color: BROWN_100,
        merge: false,
        outline: true
      },
      {
        // "The rest" - uses hierarchical skip, so v_upstream descendants are skipped
        color: BROWN_100,
        merge: false,
        outline: true
      }
    ]
  },

  // ============================================================
  // FORWARD DETECTOR
  // ============================================================

  // Electron beampipe (forward) - Saturated blue metallic
  {
    name: "Pipe_cen_to_pos_assembly*",
    rules: [
      {
        color: BROWN_100,
        merge: true,
        outline: true,
        outlineColor: BLUE_GRAY_400
      }
    ]
  },

  // B0 Window
  {
    name: "B0Window_vol_ExitWindow*",
    rules: [
      {
        color: BROWN_100,  // Light-medium blue-gray
        merge: true,
        outline: true
      }
    ]
  },

  // B0 Tracker - yellowish-orange (tracking)
  {
    name: "B0TrackerSubAssembly*",
    rules: [
      {
        color: ORANGE_100,  // Very light warm orange
        merge: true,
        outline: true
      }
    ]
  },

  // B0 ECal - pink/violetish (calorimeter)
  {
    name: "B0ECal*",
    rules: [
      {
        color: BLUE_300,  // Extremely light pink
        merge: true,
        outline: true
      }
    ]
  },

  // Forward magnets - neutral metal/greenish
  {
    names: [
      "B0PF_BeamlineMagnet_assembly*",
      "B0APF_BeamlineMagnet_assembly*",
      "Q0EF_BeamlineMagnet_assembly*",
      "Q1APF_BeamlineMagnet_assembly*",
      "Q1BPF_BeamlineMagnet_assembly*",
      "Q1EF_BeamlineMagnet_assembly*",
      "Q2PF_BeamlineMagnet_assembly*",
      "B1PF_BeamlineMagnet_assembly*",
      "B1APF_BeamlineMagnet_assembly*"
    ],
    rules: [
      {
        //color: BLUE_50,
        material: new THREE.MeshPhongMaterial({
          color: BLUE_50,  // Metal support
          specular: 0x454545,
          shininess: 62,
          transparent: false,
          depthWrite: true,
          depthTest: true,
          opacity: 1,
          side: THREE.DoubleSide,
          clipShadows: true,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilRef: 1,
        }),
        merge: true,
        outline: true
      }
    ]
  },

  // Forward beampipe (hadron side)
  {
    name: "BeamPipeB0_assembly*",
    rules: [
      {
        color: BROWN_100,  // Very light gray
        merge: true,
        outline: true
      }
    ]
  },

  // Off-momentum trackers - yellowish-orange (tracking)
  {
    names: [
      "ForwardOffMTracker_station_1*",
      "ForwardOffMTracker_station_2*",
      "ForwardOffMTracker_station_3*",
      "ForwardOffMTracker_station_4*"
    ],
    rules: [
      {
        color: AMBER_500,  // Extremely light amber
        merge: true,
        outline: true
      }
    ]
  },

  // Roman pots - yellowish-orange (tracking)
  {
    names: ["ForwardRomanPot_Station_1*", "ForwardRomanPot_Station_2*"],
    rules: [
      {
        color: ORANGE_200,  // Very light warm orange
        merge: true,
        outline: true
      }
    ]
  },

  // ZDC Crystal - bluish (calorimeter)
  {
    name: "ZDC_Crystal_envelope*",
    rules: [
      {
        color: PURPLE_400,  // Medium-light cyan-blue
        merge: true,
        outline: true
      }
    ]
  },

  // ZDC HCal - bluish (HCAL)
  {
    name: "HcalFarForwardZDC_SiPMonTile*",
    rules: [
      {
        color: BLUE_200,  // Light blue with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // Vacuum magnet element
  {
    name: "VacuumMagnetElement_assembly*",
    rules: [
      {
        color: GRAY_300,  // Light-medium gray
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // BACKWARD DETECTOR
  // ============================================================

  // Electron pipe (backward) - Saturated blue metallic
  {
    name: "Pipe_Q1eR_to_B2BeR_assembly*",
    rules: [
      {
        color: BROWN_100,
        merge: true,
        outline: true,
        outlineColor: BLUE_GRAY_400
      }
    ]
  },

  // Backward magnets - neutral metal/greenish
  {
    names: [
      "Q1ER_BeamlineMagnet_assembly*",
      "Q1APR_BeamlineMagnet_assembly*",
      "Q2ER_BeamlineMagnet_assembly*",
      "Q1BPR_BeamlineMagnet_assembly*",
      "Q2PR_BeamlineMagnet_assembly*",
      "Magnets_Q3eR_assembly*"
    ],
    rules: [
      {
        color: BLUE_50,  // Light green
        merge: true,
        outline: true
      }
    ]
  },

  // Tagger
  {
    names: ["BackwardsTaggerVacuum_assembly*", "BackwardsTaggerAssembly*"],
    rules: [
      {
        color: AMBER_50,  // Extremely light amber (tracking/tagging)
        merge: true,
        outline: true
      }
    ]
  },

  // Lumi components
  {
    name: "LumiWindow_vol_ExitWindow*",
    rules: [
      {
        color: GRAY_100,  // Very light gray
        merge: true,
        outline: true
      }
    ]
  },

  {
    name: "LumiCollimator_assembly*",
    rules: [
      {
        color: PEWTER,  // Metallic gray
        merge: true,
        outline: true
      }
    ]
  },

  {
    names: ["SweeperMag_assembly*", "AnalyzerMag_assembly*"],
    rules: [
      {
        color: GREEN_100,  // Light green (magnets)
        merge: true,
        outline: true
      }
    ]
  },

  {
    name: "LumiSpecTracker*",
    rules: [
      {
        color: YELLOW_100,  // Very light yellow (tracking)
        merge: true,
        outline: true
      }
    ]
  },

  {
    name: "LumiPhotonChamber*",
    rules: [
      {
        color: GRAY_300,  // Light-medium gray
        merge: true,
        outline: true
      }
    ]
  },

  {
    name: "LumiDirectPCAL*",
    rules: [
      {
        color: PINK_50,  // Extremely light pink (calorimeter)
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // DEFAULT RULE
  // ============================================================
  {
    name: "*",
    rules: [
      {
        color: GRAY_100,  // Very light gray default
        merge: true,
        outline: true
      }
    ]
  }
];

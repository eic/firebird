import * as THREE from "three";

// ============================================================
// COOL COLORS (Light/Pastel)
// ============================================================
const GRAY_50         = 0xFAFAFA;  // Almost white
const GRAY_100        = 0xF5F5F5;  // Very light gray
const BLUE_GRAY_50    = 0xECEFF1;  // Very light blue-gray
const INDIGO_50       = 0xE8EAF6;  // Extremely light indigo
const BLUE_WHITE      = 0xF5F9FF;  // Custom ultra-light blue-white
const LIGHT_BLUE_50   = 0xE1F5FE;  // Extremely light blue
const BLUE_200        = 0x90CAF9;  // Light blue with more saturation
const CYAN_50         = 0xE0F7FA;  // Extremely light cyan
const GREEN_100       = 0xC8E6C9;  // Light green
const YELLOW_100      = 0xFFF9C4;  // Very light yellow
const AMBER_50        = 0xFFF8E1;  // Extremely light amber/peach
const ORANGE_100      = 0xFFE0B2;  // Very light warm orange/peach
const PURPLE_50       = 0xF3E5F5;  // Extremely light purple
const RED_50          = 0xFFEBEE;  // Extremely light red/pink
const PINK_50         = 0xFCE4EC;  // Extremely light pink
const BROWN_50        = 0xEFEBE9;  // Extremely light brown/cream
const TAN_LIGHT       = 0xE6D5C3;  // Light tan/beige

// ============================================================
// MEDIUM COLORS (Moderate Saturation)
// ============================================================
const GRAY_300        = 0xE0E0E0;  // Light-medium gray
const BLUE_GRAY_200   = 0xB0BEC5;  // Light-medium blue-gray
const INDIGO_100      = 0xC5CAE9;  // Light indigo
const BLUE_300        = 0x64B5F6;  // Medium-light blue
const LIGHT_BLUE_200  = 0x81D4FA;  // Medium-light cyan-blue
const CYAN_200        = 0x80DEEA;  // Medium-light cyan
const TEAL_200        = 0x80CBC4;  // Medium-light teal
const GREEN_200       = 0xA5D6A7;  // Medium-light green
const YELLOW_200      = 0xFFF59D;  // Medium-light yellow
const AMBER_200       = 0xFFE082;  // Medium-light amber
const ORANGE_200      = 0xFFCC80;  // Medium-light orange
const DEEP_ORANGE_200 = 0xFFAB91;  // Medium-light deep orange
const PURPLE_100      = 0xE1BEE7;  // Light purple
const RED_100         = 0xFFCDD2;  // Very light red
const PINK_100        = 0xF8BBD0;  // Very light pink
const BROWN_100       = 0xD7CCC8;  // Very light brown/taupe
const TAN_MEDIUM      = 0xC4A77D;  // Medium tan/camel

// ============================================================
// WARM COLORS (Saturated/Heavy)
// ============================================================
const GRAY_500        = 0x9E9E9E;  // Medium gray
const BLUE_GRAY_400   = 0x78909C;  // Medium-dark blue-gray
const INDIGO_400      = 0x5C6BC0;  // Medium indigo
const BLUE_500        = 0x2196F3;  // Strong blue
const CYAN_500        = 0x00BCD4;  // Strong cyan
const TEAL_500        = 0x009688;  // Strong teal
const GREEN_500       = 0x4CAF50;  // Strong green
const YELLOW_500      = 0xFFEB3B;  // Strong yellow
const AMBER_500       = 0xFFC107;  // Strong amber
const ORANGE_500      = 0xFF9800;  // Strong orange
const DEEP_ORANGE_500 = 0xFF5722;  // Strong deep orange
const PURPLE_400      = 0xAB47BC;  // Medium purple
const RED_500         = 0xF44336;  // Strong red
const PINK_400        = 0xEC407A;  // Strong pink
const BROWN_500       = 0x795548;  // Strong brown
const SIENNA          = 0xA0522D;  // Sienna
const TERRACOTTA      = 0xE2725B;  // Terracotta

// ============================================================
// METALLIC COLORS
// ============================================================
// Bluish Metallics
const STEEL_BLUE      = 0x4682B4;  // Steel blue - industrial metal
const TITANIUM        = 0x878F99;  // Titanium - blue-gray metal
const GUNMETAL_BLUE   = 0x5C6274;  // Gunmetal with blue tint
const PEWTER          = 0x8A9A9E;  // Pewter (blue-gray)

// Reddish Metallics
const COPPER          = 0xB87333;  // Classic copper
const ROSE_GOLD       = 0xB76E79;  // Classic rose gold
const COPPER_BRIGHT   = 0xDA8A67;  // Bright/polished copper
const RUST_METAL      = 0x8C4A3D;  // Oxidized rust metal

// Neutral/Gold Metallics
const SILVER          = 0xC0C0C0;  // Classic silver
const CHROME          = 0xDBE4EB;  // Chrome / polished silver
const GUNMETAL        = 0x53565A;  // Neutral gunmetal gray
const GOLD            = 0xD4AF37;  // Classic gold
const CHAMPAGNE       = 0xF5E6A3;  // Champagne gold (light)
const BRASS           = 0xB5A642;  // Brass
const BRONZE          = 0xCD7F32;  // Classic bronze
const ANTIQUE_BRONZE  = 0x8C7853;  // Aged/antique bronze


/**
 * COOL3 Color Rules - Modern palette based on detector categories
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
export const cool3ColorRules = [

  // ============================================================
  // CENTRAL DETECTOR - MAGNETS
  // ============================================================
  {
    names: ["SolenoidBarrel_assembly*", "SolenoidEndcapP*", "SolenoidEndcapN*"],
    rules: [
      {
        color: CHROME,  // Neutral metal for main solenoid
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
        color: ORANGE_200,  // Medium-light orange
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
      {
        color: YELLOW_100,  // Very light yellow
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

  // RICH Endcap - Lighter green
  {
    name: "RICHEndcapN*",
    rules: [
      {
        color: GREEN_100,  // Light green
        merge: true,
        outline: true
      }
    ]
  },

  // DRICH - Different green tone
  {
    name: "DRICH*",
    rules: [
      {
        color: TEAL_200,  // Medium-light teal
        merge: true,
        outline: true
      }
    ]
  },

  // ============================================================
  // CENTRAL DETECTOR - ECAL (Pink/Violetish)
  // ============================================================

  // Ecal Forward and Barrel
  {
    names: ["EcalEndcapP*", "EcalEndcapPInsert*", "EcalBarrelScFi*"],
    rules: [
      {
        color: PINK_100,  // Very light pink
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
        color: PURPLE_100  // Light purple for crystals
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
        color: BLUE_300,  // Medium-light blue
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
        color: GRAY_300,  // Light-medium gray
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
          color: CHROME,  // Chrome metallic
          roughness: 0.4,
          metalness: 0.2,
          transparent: true,
          opacity: 0.5,
          blending: THREE.NormalBlending,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          side: THREE.DoubleSide
        }),
        outline: true,
        outlineColor: GRAY_300,
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
        color: GRAY_100,  // Nearly white
        merge: true,
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
        material: new THREE.MeshStandardMaterial({
          color: STEEL_BLUE,  // Saturated blue metal
          roughness: 0.3,
          metalness: 0.7,
          side: THREE.DoubleSide
        }),
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
        color: BLUE_GRAY_200,  // Light-medium blue-gray
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
        color: PINK_50,  // Extremely light pink
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
        color: GREEN_100,  // Light green (beamline magnets traditionally green)
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
        color: GRAY_100,  // Very light gray
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
        color: AMBER_50,  // Extremely light amber
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
        color: ORANGE_100,  // Very light warm orange
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
        color: LIGHT_BLUE_200,  // Medium-light cyan-blue
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
        material: new THREE.MeshStandardMaterial({
          color: STEEL_BLUE,  // Saturated blue metal
          roughness: 0.3,
          metalness: 0.7,
          side: THREE.DoubleSide
        }),
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
        color: GREEN_100,  // Light green
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

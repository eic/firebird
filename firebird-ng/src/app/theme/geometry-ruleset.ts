
import * as THREE from "three";
import {disposeHierarchy, getColorOrDefault} from "../utils/three.utils";

export const modernRules = [
  // Solenoid components - Light blue-gray with a touch more color
  {
    names: ["SolenoidBarrel_assembly_0", "SolenoidEndcapP_1", "SolenoidEndcapN_2"],
    rules: [
      {
        color: 0xCFD8DC,  // Blue Gray 100 - light blue-gray (slightly more saturated)
        merge: true,
        outline: true
      }
    ]
  },

  // Trackers - Warm light peach with a touch more color
  {
    names: ["InnerSiTrackerSubAssembly_4", "MiddleSiTrackerSubAssembly_5", "OuterSiTrackerSubAssembly_6", "B0TrackerSubAssembly_12"],
    rules: [
      {
        color: 0xFFCC80,  // Orange 200 - slightly more vibrant peach
        merge: true,
        outline: true
      }
    ]
  },

  // MPGD Trackers - Light warm yellow with a touch more color
  {
    names: ["EndcapMPGDSubAssembly_7", "InnerMPGDBarrelSubAssembly_8", "OuterBarrelMPGDSubAssembly_11"],
    rules: [
      {
        color: 0xFFF59D,  // Yellow 200 - light yellow with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // TOF components - Light blue with more color
  {
    names: ["EndcapTOFSubAssembly_9", "BarrelTOFSubAssembly_10"],
    rules: [
      {
        color: 0xB3E5FC,  // Light Blue 100 - light blue with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // Inner tracker support - White with slight blue tint
  {
    name: "InnerTrackerSupport_assembly_13",
    rules: [
      {
        material: new THREE.MeshStandardMaterial({
          color: 0xE1F5FE,  // Light Blue 50 - extremely light blue
          roughness: 0.5,
          metalness: 0.1,
          transparent: true,
          opacity: 0.5,
          blending: THREE.NormalBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          side: THREE.DoubleSide
        }),
        outline: true,
        outlineColor: 0xEEEEEE,  // Light gray outline
        merge: true,
        newName: "InnerTrackerSupport"
      }
    ]
  },

  // DIRC - Light cyan/blue with more color
  {
    name: "DIRC_14",
    rules: [
      {
        patterns: ["**/*box*", "**/*prism*"],
        material: new THREE.MeshPhysicalMaterial({
          color: 0xB2EBF2,  // Cyan 100 - light cyan with more saturation
          metalness: .4,
          roughness: .2,
          envMapIntensity: 0.5,
          clearcoat: 0.8,
          transparent: true,
          opacity: .5,
          reflectivity: 0.2,
          ior: 0.9,
          side: THREE.DoubleSide,
        }),
        newName: "DIRC_barAndPrisms"
      },
      {
        patterns: ["**/*rail*"],
        newName: "DIRC_rails",
        color: 0xF5F5F5  // Gray 100 - almost white
      },
      {
        patterns: ["**/*mcp*"],
        newName: "DIRC_mcps",
        color: 0xB3E5FC  // Light Blue 100 - light blue with more saturation
      }
    ]
  },

  // RICH components - Light indigo with a touch more color
  {
    names: ["RICHEndcapN_Vol_15", "DRICH_16"],
    rules: [
      {
        color: 0xC5CAE9,  // Indigo 100 - light indigo with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // Ecal components - Light lavender with more color
  {
    names: ["EcalEndcapP_17", "EcalEndcapPInsert_18", "EcalBarrelImaging_19", "EcalBarrelScFi_20", "B0ECal_43"],
    rules: [
      {
        color: 0xE1BEE7,  // Purple 100 - light purple with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // EcalEndcapN - Light blue crystal with more color
  {
    name: "EcalEndcapN*",
    rules: [
      {
        patterns: ["**/crystal_vol_0"],
        color: 0xBBDEFB,  // Blue 100 - light blue with more saturation
        material: new THREE.MeshStandardMaterial({
          color: 0xBBDEFB,
          roughness: 0.5,
          metalness: 0.1,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        })
      },
      {
        patterns: ["**/inner_support*", "**/ring*"],
        material: new THREE.MeshStandardMaterial({
          color: 0xF5F5F5,  // Gray 100 - almost white
          roughness: 0.5,
          metalness: 0.1,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        })
      }
    ]
  },

  // Hcal components - Slightly darker blue as requested
  {
    names: ["LFHCAL_env_22", "HcalEndcapPInsert_23", "HcalBarrel_24", "HcalEndcapN_25"],
    rules: [
      {
        color: 0x90CAF9,  // Blue 200 - slightly more saturated/darker blue
        merge: true,
        outline: true
      }
    ]
  },

  // Flux components - Light blue as requested (same as original HCALs)
  {
    names: ["FluxBarrel_env_25", "FluxEndcapP_26", "FluxEndcapN_26", "FluxEndcapN_28"],
    rules: [
      {
        color: 0xE3F2FD,  // Blue 50 - extremely light blue
        merge: true,
        outline: true
      }
    ]
  },

  // Beam Pipe components - Nearly white
  {
    names: [
      "BeamPipe_assembly_27",
      "BeamPipeB0_assembly_36",
      "B0Window_vol_ExitWindow_37",
      "Pipe_cen_to_pos_assembly_38",
      "Pipe_Q1eR_to_B2BeR_assembly_53",
      "Q0EF_vac_40",
      "Q1EF_vac_42"
    ],
    rules: [
      {
        color: 0xFAFAFA,  // Gray 50 - almost white
        merge: true,
        outline: true
      }
    ]
  },

  // Magnet components - Light steel blue with more color
  {
    names: [
      "B0PF_BeamlineMagnet_assembly_28",
      "B0APF_BeamlineMagnet_assembly_29",
      "Q1APF_BeamlineMagnet_assembly_30",
      "Q1BPF_BeamlineMagnet_assembly_31",
      "Q0EF_assembly_39",
      "Q1EF_assembly_41",
      "Magnet_Q1eR_assembly_54",
      "Magnet_Q2eR_assembly_55",
      "Magnet_B2AeR_assembly_56",
      "Magnet_B2BeR_assembly_57",
      "Magnets_Q3eR_assembly_58"
    ],
    rules: [
      {
        color: 0xB0BEC5,  // Blue Gray 200 - slightly more saturated blue-gray
        merge: true,
        outline: true
      }
    ]
  },

  // Vertex Barrel - Warm amber with more color
  {
    name: "VertexBarrelSubAssembly_3",
    rules: [
      {
        color: 0xFFE082,  // Amber 200 - light amber with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // Default rule for anything not matched above
  {
    name: "*",
    rules: [
      {
        color: 0xF5F5F5,  // Gray 100 - very light gray
        merge: true,
        outline: true
      }
    ]
  }
]

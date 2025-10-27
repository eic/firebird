
import * as THREE from "three";


export const cool2ColorRules = [
  // Solenoid components - Very light blue-gray
  {
    names: ["SolenoidBarrel_assembly", "SolenoidEndcapP", "SolenoidEndcapN"],
    rules: [
      {
        color: 0xECEFF1,  // Blue Gray 50 - very light blue-gray
        merge: true,
        outline: true
      }
    ]
  },

  // Trackers - Warm light peach/orange
  {
    names: ["InnerSiTrackerSubAssembly*", "MiddleSiTrackerSubAssembly*", "OuterSiTrackerSubAssembly*", "B0TrackerSubAssembly*"],
    rules: [
      {
        color: 0xFFE0B2,  // Orange 100 - very light warm orange/peach
        merge: true,
        outline: true
      }
    ]
  },

  // MPGD Trackers - Light warm yellow
  {
    names: ["EndcapMPGDSubAssembly*", "InnerMPGDBarrelSubAssembly*", "OuterBarrelMPGDSubAssembly*"],
    rules: [
      {
        color: 0xFFF9C4,  // Yellow 100 - very light yellow
        merge: true,
        outline: true
      }
    ]
  },

  // TOF components - Very light blue
  {
    names: ["EndcapTOFSubAssembly*", "BarrelTOFSubAssembly*"],
    rules: [
      {
        color: 0xE1F5FE,  // Light Blue 50 - extremely light blue
        merge: true,
        outline: true,
        // simplifyMeshes: true
      }
    ]
  },

  // Inner tracker support - White with slight blue tint
  {
    name: "InnerTrackerSupport_assembly*",
    rules: [
      {
        material: new THREE.MeshStandardMaterial({
          color: 0xF5F9FF,  // Custom ultra-light blue-white
          roughness: 0.5,
          metalness: 0.1,
          transparent: true,
          opacity: 0.5,
          blending: THREE.NormalBlending,
          depthWrite: true,
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

  // DIRC - Light cyan/blue
  {
    name: "DIRC*",
    rules: [
      {
        patterns: ["**/*box*", "**/*prism*"],
        material: new THREE.MeshPhysicalMaterial({
          color: 0xE0F7FA,  // Cyan 50 - extremely light cyan
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
        color: 0xE1F5FE  // Light Blue 50 - extremely light blue
      }
    ]
  },
  {
    // This is when DIRC geometry is standalone
    name: "DIRC_0",
    rules: [
      {
        patterns:     ["**/*box*", "**/*prism*"],
        material: new THREE.MeshPhysicalMaterial({
          color: 0xFFF8E1,
          metalness: .2,
          roughness: .05,
          envMapIntensity: 0.3,
          clearcoat: 1,
          transparent: true,
          transmission: .2,
          opacity: .25,
          reflectivity: 0.2,
          //refr: 0.985,
          ior: 0.9,
          side: THREE.DoubleSide,
        }),
        merge: false,
        outline: true,
        newName: "DIRC_barAndPrisms",
      },
      {
        patterns: ["**/*rail*"],
        newName: "DIRC_rails",
        color: 0xAAAACC
      },
      {
        patterns: ["**/*mcp*"],
        newName: "DIRC_mcps"
      }
    ]

  },

  // RICH Endcap - Very light violet-blue
  {
    name: "RICHEndcapN_Vol*",
    rules: [
      {
        color: 0xE8EAF6,  // Indigo 50 - extremely light indigo
        merge: true,
        outline: true
      }
    ]
  },

  // DRICH - Different tone as requested (light peach)
  {
    name: "DRICH*",
    rules: [
      {
        color: 0xFFECB3,  // Amber 100 - light warm amber/peach
        merge: true,
        outline: true
      }
    ]
  },

  // Ecal components - Very light lavender
  {
    names: ["EcalEndcapP_*", "EcalEndcapPInsert_*", "EcalBarrelImaging_*", "EcalBarrelScFi_*", "B0ECal_*"],
    rules: [
      {
        color: 0xF3E5F5,  // Purple 50 - extremely light purple
        merge: true,
        outline: true
      }
    ]
  },

  // EcalEndcapN - Light blue crystal
  {
    name: "EcalEndcapN*",
    rules: [
      {
        patterns: ["**/crystal_vol_0"],
        color: 0xE3F2FD  // Blue 50 - extremely light blue
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

  // Hcal components - Light blue (biggest components)
  {
    names: ["LFHCAL_env_*", "HcalEndcapPInsert_*", "HcalBarrel_*", "HcalEndcapN_*"],
    rules: [
      {
        color: 0x90CAF9,  // Blue 200 - light blue with more saturation
        merge: true,
        outline: true
      }
    ]
  },

  // Flux components - Light blue
  {
    names: ["FluxBarrel_env_*", "FluxEndcapP_*", "FluxEndcapN_*", "FluxEndcapN_*"],
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
      "BeamPipe_assembly_*",
      "BeamPipeB0_assembly_*",
      "B0Window_vol_ExitWindow_*",
      "Pipe_cen_to_pos_assembly_*",
      "Pipe_Q1eR_to_B2BeR_assembly_*",
      "Q0EF_vac_*",
      "Q1EF_vac_*"
    ],
    rules: [
      {
        color: 0xFAFAFA,  // Gray 50 - almost white
        merge: true,
        outline: true
      }
    ]
  },

  // Magnet components - Light green as requested (beamline magnets are typically green)
  {
    names: [
      "B0PF_BeamlineMagnet_assembly_*",
      "B0APF_BeamlineMagnet_assembly_*",
      "Q1APF_BeamlineMagnet_assembly_*",
      "Q1BPF_BeamlineMagnet_assembly_*",
      "Q0EF_assembly_*",
      "Q1EF_assembly_*",
      "Magnet_Q1eR_assembly_*",
      "Magnet_Q2eR_assembly_*",
      "Magnet_B2AeR_assembly_*",
      "Magnet_B2BeR_assembly_*",
      "Magnets_Q3eR_assembly*8"
    ],
    rules: [
      {
        color: 0xC8E6C9,  // Green 100 - light green
        merge: true,
        outline: true
      }
    ]
  },

  // Vertex Barrel - Warm light amber
  {
    name: "VertexBarrelSubAssembly_*",
    rules: [
      {
        color: 0xFFF8E1,  // Amber 50 - extremely light amber/peach
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

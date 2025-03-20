//==========================================================================
//  AIDA Detector description implementation
//--------------------------------------------------------------------------
// Copyright (C) Organisation europeenne pour la Recherche nucleaire (CERN)
// All rights reserved.
//
// For the licensing terms see $DD4hepINSTALL/LICENSE.
// For the list of contributors see $DD4hepINSTALL/doc/CREDITS.
//
//==========================================================================

// Framework include files
#include "DDG4/Geant4SteppingAction.h"

#include <G4Step.hh>
#include <G4RunManager.hh>
#include <G4TrackStatus.hh>
#include <G4Run.hh>
#include <G4Event.hh>
#include <G4UnitsTable.hh>
#include <stack>
#include <CLHEP/Units/SystemOfUnits.h>

#include <fmt/core.h>

/// Namespace for the AIDA detector description toolkit
namespace dd4hep {

    /// Namespace for the Geant4 based simulation part of the AIDA detector description toolkit
    namespace sim {

        /// Class to count steps and suspend tracks every 5 steps
        /** Class to count steps and suspens tracks every 5 steps
         * Count steps and suspend
         *
         *  \version 1.0
         *  \ingroup DD4HEP_SIMULATION
         */
        class TextDumpingSteppingAction : public Geant4SteppingAction {
            std::size_t m_total_steps {0UL };
            std::size_t m_total_tracks {0UL };
            std::size_t m_total_events {0UL };
            std::string  m_file_name {"events_stepping.txt"};
            std::string m_class_name;
            std::ofstream m_output_file;
            std::once_flag m_init_flag;
            double m_vertex_z_min = -4500;
            double m_vertex_z_max = 4500;
            bool m_vertex_cut = true;

            bool m_save_optical = false;                    // When TRUE - If OpticalPhoton - it will be saved. All other cuts don't affect optical photons when this is TRUE. I.e. Optical photon? - SAVE
            bool m_only_primary = true;                     // Keep geant tracks and their steps only if geant track has ParentID=0
            int m_prev_event = -1;
            int m_prev_track_id = -1;
            // std::stack<std::size_t> m_gen_part_ids;
            bool m_skipping_track = false;
            double m_min_momentum = 300 * CLHEP::MeV;      // Minimal momentum for track to be saved
            double m_max_momentum = 10000 * CLHEP::TeV;    // Maximum momentum for track to be saved

        public:
            /// Standard constructor
            TextDumpingSteppingAction(Geant4Context* context, const std::string& nam)
                    : Geant4SteppingAction(context, nam)
            {
                declareProperty("OutputFile",    m_file_name);
                declareProperty("MomentumMin",   m_min_momentum);
                declareProperty("SaveOptical",   m_save_optical);
                declareProperty("OnlyPrimary",   m_only_primary);
                declareProperty("VertexCut",     m_vertex_cut);
                declareProperty("VertexZMin",    m_vertex_z_min);
                declareProperty("VertexZMax",    m_vertex_z_max);
                m_class_name = __func__;        // Must be in constructor to be the easiest way to get demangled name
            }
            /// Default destructor
            ~TextDumpingSteppingAction() override
            {
                info("+++ Total Steps: %ld", m_total_steps);
                info("+++ Total Tracks written: %ld", m_total_tracks);
                info("+++ Total Events written: %ld", m_total_events);
                // info("+++ Per Event steps: %ld, tracks: %ld", (int) m_total_steps/m_total_events, (int) m_total_tracks/m_total_events);

                // Do we need it here? It should be done automatically
                if(m_output_file.is_open() && m_output_file.good()) {
                    m_output_file.close();
                }
            }

            /// Checks m_output_file is open and is ready for write or throws an exception
            void ensure_output_writable() {
                if(!m_output_file.is_open() || !m_output_file.good()) {
                    auto err_msg = fmt::format( "Failed to open the file or file stream is in a bad state. File name: '{}'", m_file_name);
                    error(err_msg.c_str());
                    throw std::runtime_error(err_msg);
                }
            }

            void write_point(G4StepPoint *point){
                auto row = fmt::format("P {} {} {} {}",
                            point->GetPosition().x(),
                            point->GetPosition().y(),
                            point->GetPosition().z(),
                            point->GetGlobalTime()
                            );
                m_output_file<<row<<std::endl;
            }

            /// stepping callback
            void operator()(const G4Step* step, G4SteppingManager*) override
            {

                // Get run and event number
                auto run_num = context()->run().run().GetRunID();
                auto event_num = context()->event().event().GetEventID();


                // First time in this function. Open a file
                std::call_once(m_init_flag, [this](){

                    fmt::print("Plugin {} info: \n", m_class_name);
                    fmt::print("   OutputFile     {}\n", m_file_name);
                    fmt::print("   MomentumMin    {}\n", m_min_momentum);
                    fmt::print("   MomentumMax    {}\n", m_max_momentum);
                    fmt::print("   SaveOptical    {}\n", m_save_optical);
                    fmt::print("   OnlyPrimary    {}\n", m_only_primary);
                    fmt::print("   VertexCut      {}\n", m_vertex_cut);
                    fmt::print("   VertexZMin     {}\n", m_vertex_z_min);
                    fmt::print("   VertexZMax     {}\n", m_vertex_z_max);

                    m_output_file = std::ofstream(m_file_name);

                    ensure_output_writable();
                    m_output_file<<"#Format description" << std::endl;
                    m_output_file<<"#  E - event: run_num event_num" << std::endl;
                    m_output_file<<"#  T - track: id, status, pdg, pdg_name, eta, phi, qOverP, px, py, pz, vx, vy, vz" << std::endl;
                    m_output_file<<"#  P - point: x, y, z, t" << std::endl;
                });

                // Check file is open and writable
                ensure_output_writable();

                if(event_num != m_prev_event) {
                    // We've got a new event
                    m_prev_event = event_num;
                    std::string evt_str = fmt::format("E {} {} ", run_num, event_num);
                    m_prev_track_id = -1;   // Reset track id, so any track is new
                    m_output_file << evt_str << std::endl;
                    m_total_events++;
                    fmt::print("+\n+\n+\n+\n+\n=====================================================\n");
                }

                // Check if this is new track
                auto track = step->GetTrack();
                if(track->GetTrackID() != m_prev_track_id)
                {
                    m_prev_track_id = track->GetTrackID();

                    // New track
                    auto id = track->GetTrackID();
                    auto pdg = track->GetParticleDefinition()->GetPDGEncoding();
                    auto pdg_name = track->GetParticleDefinition()->GetParticleName();
                    auto charge = track->GetParticleDefinition()->GetPDGCharge();
                    auto eta = track->GetMomentum().eta();
                    auto phi = track->GetMomentum().phi();
                    auto qOverP = track->GetParticleDefinition()->GetPDGCharge()/track->GetMomentum().mag();
                    auto px = track->GetMomentum().x();
                    auto py = track->GetMomentum().y();
                    auto pz = track->GetMomentum().z();
                    auto p = track->GetMomentum().mag();
                    auto vx = track->GetVertexPosition().x();
                    auto vy = track->GetVertexPosition().y();
                    auto vz = track->GetVertexPosition().z();

                    bool filter = m_vertex_cut && (vz < m_vertex_z_min || vz > m_vertex_z_max);

                    if(m_prev_track_id < 1000)
                    {
                        fmt::print("track: {:<5}, {:<10} vtx: {:12.5f} {:12.5f} {:12.5f}  {:5} {:12.5f} {:12.5f} {:5}\n",
                            id, pdg_name, vx,vy,vz, filter, m_vertex_z_min, m_vertex_z_max, m_vertex_cut);
                    }


                    //if(track->GetParentID() == 0 || pdg_name == "opticalphoton") {

                    // First we filter by track types
                    bool track_is_ok = true;

                    if(m_only_primary)
                    {
                        // >oO fmt::print("{} ID: {} ParentID: {} CrModelID: {}\n", pdg_name, id, track->GetParentID(), track->GetCreatorModelID());
                        track_is_ok = track->GetParentID() == 0;   // Only tracks without parents are OK
                    }

                    if(track_is_ok && (p < m_min_momentum || p > m_max_momentum))
                    {
                        track_is_ok = false;
                    }


                    if(m_vertex_cut && (vz < m_vertex_z_min || vz > m_vertex_z_max))
                    {
                        track_is_ok = false;
                    }

                    if(m_save_optical && pdg_name == "opticalphoton")
                    {
                        track_is_ok = true;     // Force to save track whatever
                    }

                    m_skipping_track = !track_is_ok;


                    if(m_skipping_track) return;        //  <= nothing to do more here if the track is to be skipped

                    std::string trk_str = fmt::format("T {} {} {} {} {} {} {} {} {} {} {} {} {}",
                                                      id, pdg, pdg_name, charge, eta, phi, qOverP, px, py, pz, vx, vy, vz);
                    m_output_file << trk_str << std::endl;
                    m_total_tracks++;

                    // We always write GetPostStepPoint so the first time we have to write GetPreStepPoint
                    write_point(step->GetPreStepPoint());

                }

                // Maybe we skipping this track and we just return
                if(m_skipping_track) return;

                // Write post point info
                write_point(step->GetPostStepPoint());

                // Statistics
                m_total_steps++;
            }
        };
    }    // End namespace sim
}      // End namespace dd4hep

#include "DDG4/Factories.h"
DECLARE_GEANT4ACTION_NS(dd4hep::sim,TextDumpingSteppingAction)

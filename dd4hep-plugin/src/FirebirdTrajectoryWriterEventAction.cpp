//==========================================================================
//  AIDA Detector description implementation
//--------------------------------------------------------------------------
//  FirebirdTrajectoryWriterEventAction — DD4hep/DDG4 plugin
//
//  Writes Geant4 trajectories as Firebird-format JSON for event display.
//  Supports rich-trajectory time extraction, configurable filtering,
//  and per-point verbose diagnostics.
//==========================================================================

// DD4hep / DDG4
#include "DDG4/Geant4EventAction.h"
#include "DDG4/Geant4Kernel.h"
#include "DD4hep/Printout.h"

// Geant4
#include "G4Event.hh"
#include "G4TrajectoryContainer.hh"
#include "G4VTrajectory.hh"
#include "G4VTrajectoryPoint.hh"
#include "G4RichTrajectory.hh"
#include "G4RichTrajectoryPoint.hh"
#include "G4SystemOfUnits.hh"
#include "G4AttValue.hh"
#include "G4AttDef.hh"

// C++ standard
#include <algorithm>
#include <cmath>
#include <fstream>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

#include <fmt/core.h>
#include <fmt/format.h>

namespace dd4hep::sim {

  // ──────────────────────────────────────────────────────────────────────
  //  FirebirdTrajectoryWriterEventAction
  // ──────────────────────────────────────────────────────────────────────

  /// Writes filtered Geant4 trajectories to a JSON file in the Firebird
  /// event-display format, with robust time extraction from G4RichTrajectoryPoint.
  ///
  /// \version 1.2
  /// \ingroup DD4HEP_SIMULATION
  class FirebirdTrajectoryWriterEventAction : public Geant4EventAction {

    // ── configuration ──────────────────────────────────────────────────

    /// Output path for the JSON file.
    std::string m_outputFile{"trajectories.firebird.json"};

    /// Logical component name written into the JSON.
    std::string m_componentName{"Geant4Trajectories"};

    // Particle / track filters
    bool              m_saveOptical{false};   ///< Always save optical photons
    bool              m_onlyPrimary{false};   ///< Keep only ParentID == 0
    std::vector<int>  m_saveParticles{};      ///< PDG whitelist (empty ⇒ all)
    double            m_minMomentum{150};     ///< Lower momentum cut [MeV/c]
    double            m_maxMomentum{1e12};    ///< Upper momentum cut [MeV/c]
    double            m_minTrackLength{0};    ///< Minimum path length  [mm]

    // Vertex position cut
    bool   m_vertexCut{false};
    double m_vertexZMin{-5000};   ///< [mm]
    double m_vertexZMax{ 5000};   ///< [mm]

    // Step (point) position cut
    bool   m_stepCut{false};
    double m_stepZMin{-5000};     ///< [mm]
    double m_stepZMax{ 5000};     ///< [mm]
    double m_stepRMax{ 5000};     ///< [mm]

    // Time extraction behaviour
    bool m_requireRichTrajectory{true};

    // Diagnostics
    bool m_verboseTimeExtraction{false};  ///< Log time-extraction internals
    bool m_verboseSteps{false};           ///< Log every point with full details

    // ── statistics ─────────────────────────────────────────────────────

    long m_totalTrajectories{0};
    long m_filteredTrajectories{0};
    long m_savedTrajectories{0};
    long m_trajectoryWithoutTime{0};
    long m_stepsFiltered{0};

    // ── per-run buffer ─────────────────────────────────────────────────

    std::vector<std::string> m_entries;   ///< One JSON string per event

    // ── helpers ────────────────────────────────────────────────────────

    /// Return true when `v` is a finite number safe for JSON serialisation.
    static bool isFinite(double v) { return !std::isinf(v) && !std::isnan(v); }

    /// Replace non-finite values with `fallback`.
    static double sanitise(double v, double fallback = 0.0) {
      return isFinite(v) ? v : fallback;
    }

    /// Transverse distance from the beam axis.
    static double rxy(const G4ThreeVector& p) {
      return std::sqrt(p.x() * p.x() + p.y() * p.y());
    }

    // ── time extraction ────────────────────────────────────────────────

    /// Convert a Geant4 time string (value + optional unit) to internal
    /// units.  Handles ns, ps, us/µs, ms, s.  Falls back to ns.
    static G4double parseTimeString(const std::string& raw) {
      std::istringstream iss(raw);
      G4double value{};
      std::string unit;
      iss >> value >> unit;

      if      (unit == "ps")                   return value * CLHEP::picosecond;
      else if (unit == "ns")                   return value * CLHEP::ns;
      else if (unit == "us" || unit == "µs")   return value * CLHEP::microsecond;
      else if (unit == "ms")                   return value * CLHEP::ms;
      else if (unit == "s")                    return value * CLHEP::s;
      else                                     return value * CLHEP::ns;  // default
    }

    /// Try to read PreT (index 0) or PostT (index > 0) from a
    /// G4RichTrajectoryPoint.  Returns the time in internal units or
    /// –1 on failure.
    ///
    /// When `trajectory` is non-null and `m_verboseSteps` is set the
    /// method prints a one-line diagnostic for each point.
    G4double extractTimeFromPoint(G4VTrajectoryPoint* point,
                                  int pointIndex,
                                  G4VTrajectory* trajectory = nullptr)
    {
      auto* richPoint = dynamic_cast<G4RichTrajectoryPoint*>(point);
      if (!richPoint) {
        if (m_requireRichTrajectory) {
          if (m_verboseTimeExtraction) {
            warning("[firebird-writer] Point %d: not a G4RichTrajectoryPoint", pointIndex);
          }
          ++m_trajectoryWithoutTime;
          return -1.0;
        }
        return pointIndex * 0.1 * CLHEP::ns;   // synthetic fallback
      }

      auto* attValues = richPoint->CreateAttValues();
      if (!attValues) {
        if (m_verboseTimeExtraction) {
          warning("[firebird-writer] Point %d: CreateAttValues() returned null", pointIndex);
        }
        return -1.0;
      }

      const std::string targetAttr = (pointIndex == 0) ? "PreT" : "PostT";
      G4double extractedTime = -1.0;

      for (const auto& av : *attValues) {
        if (av.GetName() == targetAttr) {
          extractedTime = parseTimeString(av.GetValue());

          if (m_verboseTimeExtraction) {
            info("[firebird-writer] Point %d: %s raw=\"%s\" → %.6f ns",
                 pointIndex, targetAttr.c_str(),
                 av.GetValue().c_str(), extractedTime / CLHEP::ns);
          }
          break;
        }
      }
      delete attValues;

      // ── verbose per-step dump ──────────────────────────────────────
      if (m_verboseSteps) {
        const auto pos = point->GetPosition();
        if (trajectory) {
          info("[firebird-steps] trk PDG=%d  pt=%d  pos=(%.3f, %.3f, %.3f) mm  "
               "t=%.6f ns  attr=%s",
               trajectory->GetPDGEncoding(), pointIndex,
               pos.x() / CLHEP::mm, pos.y() / CLHEP::mm, pos.z() / CLHEP::mm,
               (extractedTime >= 0 ? extractedTime / CLHEP::ns : -1.0),
               targetAttr.c_str());
        } else {
          info("[firebird-steps] pt=%d  pos=(%.3f, %.3f, %.3f) mm  t=%.6f ns  attr=%s",
               pointIndex,
               pos.x() / CLHEP::mm, pos.y() / CLHEP::mm, pos.z() / CLHEP::mm,
               (extractedTime >= 0 ? extractedTime / CLHEP::ns : -1.0),
               targetAttr.c_str());
        }
      }

      // Handle extraction failure
      if (extractedTime < 0) {
        if (m_requireRichTrajectory) {
          if (m_verboseTimeExtraction) {
            warning("[firebird-writer] Point %d: attribute %s not found", pointIndex, targetAttr.c_str());
          }
          ++m_trajectoryWithoutTime;
          return -1.0;
        }
        return pointIndex * 0.1 * CLHEP::ns;
      }
      return extractedTime;
    }

    // ── filtering ──────────────────────────────────────────────────────

    bool passesFilters(G4VTrajectory* trj) const {
      const int    pdg      = trj->GetPDGEncoding();
      const int    parentID = trj->GetParentID();
      const double p_MeV    = trj->GetInitialMomentum().mag() / CLHEP::MeV;

      // Optical photons bypass everything when requested
      if (m_saveOptical && trj->GetParticleName() == "opticalphoton") return true;

      if (m_onlyPrimary && parentID != 0) return false;

      if (p_MeV < m_minMomentum || p_MeV > m_maxMomentum) return false;

      // PDG whitelist
      if (!m_saveParticles.empty()) {
        if (std::find(m_saveParticles.begin(), m_saveParticles.end(), pdg)
            == m_saveParticles.end())
          return false;
      }

      // Minimum track length
      if (m_minTrackLength > 0) {
        const int npts = trj->GetPointEntries();
        if (npts <= 1) return false;

        double length = 0;
        auto prev = trj->GetPoint(0)->GetPosition();
        for (int i = 1; i < npts; ++i) {
          auto cur = trj->GetPoint(i)->GetPosition();
          length += (cur - prev).mag();
          prev = cur;
        }
        if (length / CLHEP::mm < m_minTrackLength) return false;
      }

      // Vertex Z window
      if (m_vertexCut && trj->GetPointEntries() > 0) {
        const double vz = trj->GetPoint(0)->GetPosition().z() / CLHEP::mm;
        if (vz < m_vertexZMin || vz > m_vertexZMax) return false;
      }

      return true;
    }

    /// Additional check that requires mutable state (time extraction
    /// counters), so it's separate from the const filter above.
    bool passesRichTrajectoryCheck(G4VTrajectory* trj) {
      if (!m_requireRichTrajectory) return true;

      if (!dynamic_cast<G4RichTrajectory*>(trj)) {
        if (m_verboseTimeExtraction)
          warning("[firebird-writer] Trajectory is not G4RichTrajectory — skipped");
        return false;
      }
      if (trj->GetPointEntries() > 0) {
        if (extractTimeFromPoint(trj->GetPoint(0), 0, trj) < 0) {
          if (m_verboseTimeExtraction)
            warning("[firebird-writer] First point has no time — trajectory skipped");
          return false;
        }
      }
      return true;
    }

    // ── JSON builders ──────────────────────────────────────────────────

    /// One trajectory's parameters, collected into per-column vectors below.
    /// DEX v1 stores parameters as parallel column arrays (trajectory id ==
    /// array index), so the writer accumulates columns instead of per-track
    /// parameter tuples.
    struct ParamColumns {
      std::vector<int>         pdg;
      std::vector<std::string> type;      // particle name, string column
      std::vector<double>      charge, px, py, pz, vx, vy, vz, theta, phi, qOverP, locA, locB, time;

      void add(G4VTrajectory* trj, double startTimeNs) {
        const auto mom = trj->GetInitialMomentum();
        const double p = std::max(mom.mag(), 1e-10);  // avoid /0

        pdg.push_back(trj->GetPDGEncoding());
        type.push_back(trj->GetParticleName());
        charge.push_back(sanitise(trj->GetCharge()));
        px.push_back(sanitise(mom.x() / CLHEP::MeV));
        py.push_back(sanitise(mom.y() / CLHEP::MeV));
        pz.push_back(sanitise(mom.z() / CLHEP::MeV));

        double vertexX = 0, vertexY = 0, vertexZ = 0;
        if (trj->GetPointEntries() > 0) {
          const auto pos = trj->GetPoint(0)->GetPosition();
          vertexX = pos.x() / CLHEP::mm;
          vertexY = pos.y() / CLHEP::mm;
          vertexZ = pos.z() / CLHEP::mm;
        }
        vx.push_back(sanitise(vertexX));
        vy.push_back(sanitise(vertexY));
        vz.push_back(sanitise(vertexZ));
        theta.push_back(sanitise(mom.theta()));
        phi.push_back(sanitise(mom.phi()));
        qOverP.push_back(sanitise(trj->GetCharge() / (p / CLHEP::GeV)));
        locA.push_back(0.0);
        locB.push_back(0.0);
        time.push_back(sanitise(startTimeNs));
      }

      size_t count() const { return pdg.size(); }

      static std::string numbersJson(const std::vector<double>& values) {
        std::string out = "[";
        for (size_t i = 0; i < values.size(); ++i) {
          if (i) out += ',';
          out += fmt::format("{}", values[i]);
        }
        return out + "]";
      }

      /// The "columns" object of the DEX piece.
      std::string toJson() const {
        std::string pdgJson = "[";
        std::string typeJson = "[";
        for (size_t i = 0; i < pdg.size(); ++i) {
          if (i) { pdgJson += ','; typeJson += ','; }
          pdgJson += fmt::format("{}", pdg[i]);
          typeJson += fmt::format("\"{}\"", type[i]);
        }
        pdgJson += ']';
        typeJson += ']';

        return fmt::format(
          R"({{"pdg":{},"type":{},"charge":{},"px":{},"py":{},"pz":{},"vx":{},"vy":{},"vz":{},"theta":{},"phi":{},"q_over_p":{},"loc_a":{},"loc_b":{},"time":{}}})",
          pdgJson, typeJson, numbersJson(charge),
          numbersJson(px), numbersJson(py), numbersJson(pz),
          numbersJson(vx), numbersJson(vy), numbersJson(vz),
          numbersJson(theta), numbersJson(phi), numbersJson(qOverP),
          numbersJson(locA), numbersJson(locB), numbersJson(time));
      }
    };

    /// Start time [ns] of a trajectory (first point), 0 when unavailable.
    double trajectoryStartTimeNs(G4VTrajectory* trj) {
      if (trj->GetPointEntries() == 0) return 0.0;
      double t = extractTimeFromPoint(trj->GetPoint(0), 0, trj);
      return (t >= 0 ? t : 0.0) / CLHEP::ns;
    }

    /// Produce the points array (JSON) for one trajectory.
    std::string buildPointsJson(G4VTrajectory* trj) {
      const int npts = trj->GetPointEntries();
      if (npts == 0) return "[]";

      std::string out = "[";
      bool first = true;

      for (int i = 0; i < npts; ++i) {
        auto* pt  = trj->GetPoint(i);
        auto  pos = pt->GetPosition();

        if (m_stepCut) {
          const double z = pos.z() / CLHEP::mm;
          const double r = rxy(pos) / CLHEP::mm;
          if (z < m_stepZMin || z > m_stepZMax || r > m_stepRMax) {
            ++m_stepsFiltered;
            continue;
          }
        }

        double t = extractTimeFromPoint(pt, i, trj);
        if (t < 0) t = i * 0.1 * CLHEP::ns;
        t /= CLHEP::ns;

        if (!first) out += ',';
        first = false;

        out += fmt::format("[{},{},{},{},{}]",
                           sanitise(pos.x() / CLHEP::mm),
                           sanitise(pos.y() / CLHEP::mm),
                           sanitise(pos.z() / CLHEP::mm),
                           sanitise(t), 0);
      }
      out += ']';
      return out;
    }

    // ── file output ────────────────────────────────────────────────────

    void writeJsonFile() const {
      if (m_entries.empty()) {
        warning("[firebird-writer] No events collected — output file not created.");
        return;
      }

      std::ofstream out(m_outputFile);
      if (!out.is_open()) {
        error("[firebird-writer] Cannot open output file: %s", m_outputFile.c_str());
        return;
      }

      out << fmt::format(
        R"({{"type":"firebird-dex-json","version":"1.0",)"
        R"("origin":{{"file":"{}","entries_count":{}}},)"
        R"("events":[)", m_outputFile, m_entries.size());

      for (size_t i = 0; i < m_entries.size(); ++i) {
        if (i) out << ',';
        out << m_entries[i];
      }
      out << "]}";
      out.close();

      info("[firebird-writer] Wrote %zu event(s) to %s",
           m_entries.size(), m_outputFile.c_str());
    }

    void printStatistics() const {
      auto pct = [&](long n) {
        return m_totalTrajectories > 0
                 ? n * 100.0 / m_totalTrajectories : 0.0;
      };
      info("[firebird-writer] ── statistics ──────────────────────");
      info("[firebird-writer]  Total trajectories  : %ld", m_totalTrajectories);
      info("[firebird-writer]  Filtered (skipped)   : %ld (%.1f%%)",
           m_filteredTrajectories, pct(m_filteredTrajectories));
      info("[firebird-writer]  Saved                : %ld (%.1f%%)",
           m_savedTrajectories, pct(m_savedTrajectories));
      if (m_stepCut)
        info("[firebird-writer]  Step points filtered : %ld", m_stepsFiltered);
      if (m_requireRichTrajectory)
        info("[firebird-writer]  Missing time info    : %ld", m_trajectoryWithoutTime);
    }

    void logConfiguration() const {
      info("[firebird-writer] ── configuration ───────────────────");
      info("[firebird-writer]  OutputFile            : %s", m_outputFile.c_str());
      info("[firebird-writer]  ComponentName         : %s", m_componentName.c_str());
      info("[firebird-writer]  SaveOptical           : %s", m_saveOptical ? "true" : "false");
      info("[firebird-writer]  OnlyPrimary           : %s", m_onlyPrimary ? "true" : "false");
      info("[firebird-writer]  VertexCut             : %s (Z: %.2f – %.2f mm)",
           m_vertexCut ? "true" : "false", m_vertexZMin, m_vertexZMax);
      info("[firebird-writer]  StepCut               : %s (Z: %.2f – %.2f mm, R < %.2f mm)",
           m_stepCut ? "true" : "false", m_stepZMin, m_stepZMax, m_stepRMax);
      info("[firebird-writer]  Momentum              : %.3f – %.3g MeV/c", m_minMomentum, m_maxMomentum);
      info("[firebird-writer]  MinTrackLength        : %.2f mm", m_minTrackLength);
      info("[firebird-writer]  RequireRichTrajectory : %s", m_requireRichTrajectory ? "true" : "false");
      info("[firebird-writer]  VerboseTimeExtraction : %s", m_verboseTimeExtraction ? "true" : "false");
      info("[firebird-writer]  VerboseSteps          : %s", m_verboseSteps ? "true" : "false");

      if (m_saveParticles.empty()) {
        info("[firebird-writer]  SaveParticles         : [all]");
      } else {
        std::ostringstream ss;
        for (size_t i = 0; i < m_saveParticles.size(); ++i) {
          if (i) ss << ", ";
          ss << m_saveParticles[i];
        }
        info("[firebird-writer]  SaveParticles         : %s", ss.str().c_str());
      }
    }

  public:

    // ── lifecycle ──────────────────────────────────────────────────────

    FirebirdTrajectoryWriterEventAction(Geant4Context* context,
                                        const std::string& name = "FirebirdTrajectoryWriterEventAction")
      : Geant4EventAction(context, name)
    {
      declareProperty("OutputFile",              m_outputFile);
      declareProperty("ComponentName",           m_componentName);
      declareProperty("SaveOptical",             m_saveOptical);
      declareProperty("OnlyPrimary",             m_onlyPrimary);
      declareProperty("VertexCut",               m_vertexCut);
      declareProperty("VertexZMin",              m_vertexZMin);
      declareProperty("VertexZMax",              m_vertexZMax);
      declareProperty("StepCut",                 m_stepCut);
      declareProperty("StepZMin",                m_stepZMin);
      declareProperty("StepZMax",                m_stepZMax);
      declareProperty("StepRMax",                m_stepRMax);
      declareProperty("MomentumMin",             m_minMomentum);
      declareProperty("MomentumMax",             m_maxMomentum);
      declareProperty("TrackLengthMin",          m_minTrackLength);
      declareProperty("SaveParticles",           m_saveParticles);
      declareProperty("RequireRichTrajectory",   m_requireRichTrajectory);
      declareProperty("VerboseTimeExtraction",   m_verboseTimeExtraction);
      declareProperty("VerboseSteps",            m_verboseSteps);

      logConfiguration();
    }

    ~FirebirdTrajectoryWriterEventAction() override {
      writeJsonFile();
      printStatistics();
    }

    // ── event callbacks ────────────────────────────────────────────────

    void begin(const G4Event* /*event*/) override { /* nothing */ }

    void end(const G4Event* event) override {
      auto* container = event->GetTrajectoryContainer();
      if (!container || container->entries() == 0) {
        warning("[firebird-writer] Event %d: no trajectories", event->GetEventID());
        return;
      }

      const int nTrajectories = container->entries();
      m_totalTrajectories += nTrajectories;

      int nFiltered = 0, nSaved = 0;

      // ── collect columnar piece data ────────────────────────────────
      // DEX v1: parameters are parallel column arrays, the ragged point
      // lists stay nested under "points" — one list per trajectory, same
      // index as the parameter columns.
      ParamColumns columns;
      std::string pointsJson = "[";

      for (int i = 0; i < nTrajectories; ++i) {
        auto* trj = (*container)[i];

        if (!passesFilters(trj) || !passesRichTrajectoryCheck(trj)) {
          ++nFiltered;
          continue;
        }

        auto points = buildPointsJson(trj);
        if (points == "[]") { ++nFiltered; continue; }

        if (nSaved > 0) pointsJson += ',';
        pointsJson += points;
        columns.add(trj, trajectoryStartTimeNs(trj));
        ++nSaved;
      }
      pointsJson += ']';

      if (nSaved > 0) {
        std::string ev = fmt::format(
          R"({{"id":{},"pieces":[{{"name":"{}","type":"PointTrajectory","version":"1.0",)"
          R"("origin":{{"type":["G4VTrajectory","G4VTrajectoryPoint"]}},)"
          R"("count":{},"columns":{},)"
          R"("pointColumns":["x","y","z","t","aux"],)"
          R"("points":{}}}]}})",
          event->GetEventID(), m_componentName, nSaved, columns.toJson(), pointsJson);
        m_entries.push_back(std::move(ev));
      }

      m_filteredTrajectories += nFiltered;
      m_savedTrajectories    += nSaved;

      info("[firebird-writer] Event %d: %d trajectories, %d filtered, %d saved",
           event->GetEventID(), nTrajectories, nFiltered, nSaved);
    }
  };

} // namespace dd4hep::sim

// Plugin registration
#include "DDG4/Factories.h"
DECLARE_GEANT4ACTION(FirebirdTrajectoryWriterEventAction)
/**
 * The ePIC datasets of the data selector: presets, physics facets, and the
 * geometry and event URL lists of the manual pick. An installation without
 * the ePIC pack shows the Manual tab only, or contributes its own
 * `withDataCatalog()`.
 *
 * Event files live under https://seeeic.org/d/ (DEX 1.0, `.v1.firebird.zip`),
 * so the catalog works in any app that installs the pack.
 *
 * Tags come from the file names (`py8dis-nc_10x100_minq2-1000_...`): process,
 * beam energies, the minimum Q2 of the generator cut, and whether the file
 * holds simulated trajectories, reconstructed tracks, or both.
 */

import type { DataCatalog, DataCatalogEntry } from '@dexvis/firebird-core';
import { FirebirdFeature, withDataCatalog } from '@dexvis/firebird-ng';

const TGEO = 'https://seeeic.org/g/epic/artifacts/tgeo';
const DATA = 'https://seeeic.org/d';

const FULL_DETECTOR = `${TGEO}/epic_craterlake.root`;
const TRACKING_ONLY = `${TGEO}/epic_craterlake_tracking_only.root`;

/** Pythia 8 DIS sample with a full-detector geometry. */
function pythiaDis(
  process: 'dis-nc' | 'dis-cc',
  beam: string,
  minQ2: string,
  events: string,
  data: 'sim' | 'reco' | 'sim+reco' = 'sim',
  geometry = FULL_DETECTOR,
): DataCatalogEntry {
  const processLabel = process === 'dis-nc' ? 'DIS NC' : 'DIS CC';
  const dataLabel = { sim: 'trajectories', reco: 'reconstructed tracks', 'sim+reco': 'trajectories + tracks' }[data];
  return {
    name: `${processLabel} ${beam} minQ2=${minQ2} ${dataLabel}`,
    description: `Pythia 8 ${processLabel}, e×p beams ${beam} GeV, Q² > ${minQ2} GeV², 5 events, ${dataLabel}.`,
    geometry,
    events,
    tags: { process, beam, minQ2, data },
  };
}

export const EPIC_DATA_CATALOG: DataCatalog = {
  facets: [
    {
      key: 'process',
      label: 'Process',
      values: {
        'dis-nc': {
          label: 'DIS NC',
          description: 'Deep inelastic scattering, neutral current: the electron exchanges a photon or Z with the proton and stays an electron.',
          link: 'https://en.wikipedia.org/wiki/Deep_inelastic_scattering',
        },
        'dis-cc': {
          label: 'DIS CC',
          description: 'Deep inelastic scattering, charged current: the electron exchanges a W and leaves as a neutrino, so no scattered electron is seen.',
          link: 'https://en.wikipedia.org/wiki/Deep_inelastic_scattering',
        },
        'background': {
          label: 'Beam background',
          description: 'Electron and hadron beam-gas background events overlaid on a physics frame.',
        },
        'dirc-optical': {
          label: 'DIRC optical photons',
          description: 'Cherenkov photons propagated through the DIRC bars, for detector studies.',
        },
      },
    },
    {
      key: 'beam',
      label: 'Beam',
      values: {
        '5x41': { label: '5 × 41', description: 'Electron 5 GeV on proton 41 GeV.' },
        '10x100': { label: '10 × 100', description: 'Electron 10 GeV on proton 100 GeV.' },
        '18x275': { label: '18 × 275', description: 'Electron 18 GeV on proton 275 GeV.' },
      },
    },
    {
      key: 'minQ2',
      label: 'Q² cut',
      values: {
        '1': { label: 'Q² > 1', description: 'Generator cut Q² > 1 GeV²: mostly low-angle scattering.' },
        '100': { label: 'Q² > 100', description: 'Generator cut Q² > 100 GeV².' },
        '1000': { label: 'Q² > 1000', description: 'Generator cut Q² > 1000 GeV²: hard scattering, electron and jet at large angles.' },
      },
    },
    {
      key: 'data',
      label: 'Content',
      values: {
        'sim': { label: 'Trajectories', description: 'Geant4 trajectories of the simulated particles.' },
        'reco': { label: 'Reconstructed tracks', description: 'Tracks from the reconstruction, with the tracking-only geometry.' },
        'sim+reco': { label: 'Trajectories + tracks', description: 'Simulated trajectories and reconstructed tracks in one file.' },
      },
    },
  ],
  entries: [
    {
      name: 'Full ePIC detector geometry (no events)',
      description: 'The complete ePIC detector, nothing loaded as events.',
      geometry: FULL_DETECTOR,
    },
    pythiaDis('dis-nc', '10x100', '1000', `${DATA}/py8dis-nc_10x100_minq2-1000_minp-250mev_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-nc', '10x100', '1', `${DATA}/py8dis-nc_10x100_minq2-1_minp-250mev_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-nc', '18x275', '1', `${DATA}/py8dis-nc_18x275_minq2-1_minp-250mev_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-nc', '18x275', '1000', `${DATA}/py8dis-nc_18x275_minq2-1000_minp-250mev_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-nc', '5x41', '100', `${DATA}/py8dis-nc_5x41_minq2-100_minp-250mev_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-nc', '10x100', '1000', `${DATA}/reco_py8dis-nc_10x100_minq2-1000_minp-250mev_nevt-5.v1.firebird.zip`, 'reco', TRACKING_ONLY),
    pythiaDis('dis-nc', '10x100', '1000', `${DATA}/comb_py8dis-nc_10x100_minq2-1000_minp-250mev_nevt-5.v1.firebird.zip`, 'sim+reco', TRACKING_ONLY),
    pythiaDis('dis-cc', '5x41', '1', `${DATA}/py8_dis-cc_5x41_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '5x41', '100', `${DATA}/py8_dis-cc_5x41_minq2-100_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '10x100', '1', `${DATA}/py8_dis-cc_10x100_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '10x100', '100', `${DATA}/py8_dis-cc_10x100_minq2-100_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '10x100', '1000', `${DATA}/py8_dis-cc_10x100_minq2-1000_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '18x275', '1', `${DATA}/py8_dis-cc_18x275_minq2-1_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '18x275', '100', `${DATA}/py8_dis-cc_18x275_minq2-100_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    pythiaDis('dis-cc', '18x275', '1000', `${DATA}/py8_dis-cc_18x275_minq2-1000_minp-150mev_vtxcut-5m_nevt-5.v1.firebird.zip`),
    {
      name: 'Event + beam background 10x100 (large file)',
      description: 'A DIS event with electron and hadron beam-gas background overlaid. Tens of thousands of particles: expect a long load.',
      geometry: FULL_DETECTOR,
      events: `${DATA}/background_py6_10x100_egas_bgas.v1.firebird.zip`,
      tags: { process: 'background', beam: '10x100', data: 'sim' },
    },
    {
      name: 'DIRC optical photons',
      description: 'Cherenkov photons inside the DIRC bars.',
      geometry: `${TGEO}/epic_dirc_only.root`,
      events: `${DATA}/dirc_optical.v1.firebird.zip`,
      tags: { process: 'dirc-optical', data: 'sim' },
    },
  ],
  geometrySources: [
    'epic_craterlake', 'epic_inner_detector', 'epic_craterlake_tracking_only', 'epic_calorimeters',
    'epic_pid_only', 'epic_forward_detectors', 'epic_ip6', 'epic_ip6_extended', 'epic_craterlake_no_bhcal',
    'epic_full', 'epic_bhcal', 'epic_dirc_only', 'epic_drich_only', 'epic_forward_detectors_with_inserts',
    'epic_imaging_only', 'epic_lfhcal_only', 'epic_lfhcal_with_insert', 'epic_mrich_only', 'epic_pfrich_only',
    'epic_tof_endcap_only', 'epic_tof_only', 'epic_vertex_only', 'epic_zdc_lyso_sipm', 'epic_zdc_sipm_on_tile_only',
  ].map(name => `${TGEO}/${name}.root`),
  eventSources: [
    `${DATA}/rec_dis_18x275_fdex-v0.4.edm4eic.v1.firebird.zip`,
  ],
};

/** Adds the ePIC datasets to the data selector. */
export function withEpicDataCatalog(): FirebirdFeature {
  return withDataCatalog(EPIC_DATA_CATALOG);
}

import {Component, OnInit} from '@angular/core';
import {UserConfigService} from "../user-config.service";

@Component({
  selector: 'app-edm4hep-listing',
  standalone: true,
  imports: [],
  templateUrl: './edm4hep-listing.component.html',
  styleUrl: './edm4hep-listing.component.scss'
})
export class Edm4hepListingComponent implements OnInit {

  message = "";
  fileName = "";

  constructor(private configService: UserConfigService) {
  }

  ngOnInit(): void {
    this.configService.edm4eicEventSource.subject.subscribe((value)=> {
      this.fileName = value;
      this.message = value;
    });

    // /work/eic2/EPIC/RECO/24.06.0/epic_craterlake/DIS/CC/10x100/minQ2=1000/pythia8CCDIS_10x100_minQ2=1000_beamEffects_xAngle=-0.025_hiDiv_5.1086.eicrecon.tree.edm4eic.root
    // root://dtn-eic.jlab.org/work/eic2/EPIC/RECO/24.06.0/epic_craterlake/DIS/CC/10x100/minQ2=1000/pythia8CCDIS_10x100_minQ2=1000_beamEffects_xAngle=-0.025_hiDiv_5.1086.eicrecon.tree.edm4eic.root
  }
}

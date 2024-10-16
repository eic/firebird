import { OnInit, Component, Input } from '@angular/core';
import {
  CMSLoader,
  JiveXMLLoader,
  readZipFile,
  Edm4hepJsonLoader,
} from 'phoenix-event-display';

import { MatDialogRef } from '@angular/material/dialog';
import {EventDataFormat, EventDataImportOption, EventDisplayService, ImportOption} from "phoenix-ui-components";
import {Cache} from "three";
import files = Cache.files;
import {EicEdm4hepJsonLoader} from "../../phoenix-overload/eic-edm4hep-json-loader";

@Component({
  selector: 'app-io-options-dialog',
  templateUrl: './io-options-dialog.component.html',
  styleUrls: ['./io-options-dialog.component.scss'],
  standalone: true,
})
export class IOOptionsDialogComponent implements OnInit {

  constructor(
    private eventDisplay: EventDisplayService,
    public dialogRef: MatDialogRef<IOOptionsDialogComponent>,
  ) {}

  ngOnInit() {

  }


  onClose(): void {
    this.dialogRef.close();
  }

  getFirstFileFromEvent(event: Event): File|null {

    // Check if the target is actually an HTMLInputElement
    if (!(event.target instanceof HTMLInputElement)) {
      console.error("Event target is not an HTML input element.");
      return null;
    }

    const files = event.target.files;
    if (!files || files.length === 0) {
      console.error("No files selected.");
      return null;
    }

    return files[0];

  }

  handleJSONEventDataInput(event: Event) {
    let file = this.getFirstFileFromEvent(event);
    if (!file) return;   // If not file it is already reported

    this.readTextFile(file, (content: string) => {
      this.eventDisplay.parsePhoenixEvents(JSON.parse(content));
    });
  }

  handleEdm4HepJsonEventDataInput(event: Event) {
    let file = this.getFirstFileFromEvent(event);
    if (!file) return;   // If not file it is already reported
    const callback = (content: any) => {
      const json = typeof content === 'string' ? JSON.parse(content) : content;
      const edm4hepJsonLoader = new EicEdm4hepJsonLoader();
      edm4hepJsonLoader.setRawEventData(json);
      edm4hepJsonLoader.processEventData();
      this.eventDisplay.parsePhoenixEvents(edm4hepJsonLoader.getEventData());
    };
    this.readTextFile(file,  callback);
  }

  handleJiveXMLDataInput(element: HTMLInputElement| null) {
    let files = element?.files;
    if(!files) return;

    if(!files) return;
    const callback = (content: any) => {
      const jiveloader = new JiveXMLLoader();
      jiveloader.process(content);
      const eventData = jiveloader.getEventData();
      this.eventDisplay.buildEventDataFromJSON(eventData);
    };
    this.readTextFile(files[0], callback);
  }

  handleOBJInput(element: HTMLInputElement| null) {
    let files = element?.files;
    if(!files) return;

    const callback = (content: any) => {
      this.eventDisplay.parseOBJGeometry(content, files[0].name);
    };
    if(files) {
      this.readTextFile(files[0], callback);
    }
  }

  handleSceneInput(files: FileList) {
    const callback = (content: any) => {
      this.eventDisplay.parsePhoenixDisplay(content);
    };
    this.readTextFile(files[0], callback);
  }

  handleGLTFInput(files: FileList) {
    const callback = (content: any) => {
      this.eventDisplay.parseGLTFGeometry(content, files[0].name);
    };
    this.readTextFile(files[0], callback);
  }

  handlePhoenixInput(files: FileList| null) {
    if(!files) return;
    const callback = (content: any) => {
      this.eventDisplay.parsePhoenixDisplay(content);
    };
    this.readTextFile(files[0], callback);
  }

  async handleROOTInput(files: FileList) {
    const rootObjectName = prompt('Enter object name in ROOT file');

    await this.eventDisplay.loadRootGeometry(
      URL.createObjectURL(files[0]),
      rootObjectName ?? "",
      files[0].name.split('.')[0],
    );

    this.onClose();
  }

  async handleRootJSONInput(files: FileList) {

    const name = files[0].name.split('.')[0];
    await this.eventDisplay.loadRootJSONGeometry(
      URL.createObjectURL(files[0]),
      name,
    );

    this.onClose();
  }

  handleIgEventDataInput(files: FileList) {
    const cmsLoader = new CMSLoader();
    cmsLoader.readIgArchive(files[0], (allEvents: any[]) => {
      const allEventsData = cmsLoader.getAllEventsData(allEvents);
      this.eventDisplay.parsePhoenixEvents(allEventsData);
      this.onClose();
    });
  }

  async handleZipEventDataInput(files: FileList) {

    const allEventsObject = {};
    let filesWithData: { [fileName: string]: string };

    // Using a try catch block to catch any errors in Promises
    try {
      filesWithData = await readZipFile(files[0]);
    } catch (error) {
      console.error('Error while reading zip', error);
      this.eventDisplay.getInfoLogger().add('Could not read zip file', 'Error');
      return;
    }

    // JSON event data
    Object.keys(filesWithData)
      .filter((fileName) => fileName.endsWith('.json'))
      .forEach((fileName) => {
        Object.assign(allEventsObject, JSON.parse(filesWithData[fileName]));
      });

    // JiveXML event data
    const jiveloader = new JiveXMLLoader();
    Object.keys(filesWithData)
      .filter((fileName) => {
        return fileName.endsWith('.xml') || fileName.startsWith('JiveXML');
      })
      .forEach((fileName) => {
        jiveloader.process(filesWithData[fileName]);
        const eventData = jiveloader.getEventData();
        Object.assign(allEventsObject, { [fileName]: eventData });
      });
    // For some reason the above doesn't pick up JiveXML_XXX_YYY.zip

    this.eventDisplay.parsePhoenixEvents(allEventsObject);

    this.onClose();
  }

  readTextFile(file: File, callback: (result: string) => void) {
    const reader = new FileReader();
    reader.onload = () => {
        callback(reader?.result?.toString() ?? "");
      };
    reader.readAsText(file);
    this.onClose();
  }

  saveScene() {
    this.eventDisplay.exportPhoenixDisplay();
  }

  exportOBJ() {
    this.eventDisplay.exportToOBJ();
  }

  protected readonly HTMLInputElement = HTMLInputElement;
}

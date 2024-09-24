/// <reference lib="webworker" />

import {addWarning} from "@angular-devkit/build-angular/src/utils/webpack-diagnostics";
import {loadJSONFileEvents, loadZipFileEvents} from "./utils/data-fetching.utils";

addEventListener('message', ({ data }) => {

  if(data.endsWith('.zip')) {
    loadZipFileEvents(data).then(eventsData=>postMessage(eventsData));
  } else {
    loadJSONFileEvents(data).then(eventsData=>postMessage(eventsData));
  }
});



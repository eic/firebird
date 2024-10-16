/// <reference lib="webworker" />

import {addWarning} from "@angular-devkit/build-angular/src/utils/webpack-diagnostics";
import {loadJSONFileEvents, loadZipFileEvents} from "../utils/data-fetching.utils";

addEventListener('message', ({ data }) => {



  if(data.endsWith('.zip')) {
    loadZipFileEvents(data).then(x=>postMessage(x));
  } else {
    loadJSONFileEvents(data).then(ddd=>postMessage(ddd));
  }
});



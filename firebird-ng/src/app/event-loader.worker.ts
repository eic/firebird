/// <reference lib="webworker" />

import {addWarning} from "@angular-devkit/build-angular/src/utils/webpack-diagnostics";

addEventListener('message', ({ data }) => {

  if(data.endsWith('.zip')) {
    loadZipFileEvents(data).then(eventsData=>postMessage(eventsData));
  } else {
    loadJSONFileEvents(data).then(eventsData=>postMessage(eventsData));
  }
});

import JSZip from 'jszip';
import * as events from "node:events";

/**
 * Read a zip file and return its contents as an object.
 * @param file The file or array buffer to be read.
 * @returns Map with file paths in zip as keys and the files'
 * string contents as values.
 */
export async function readZipFile(file: File | ArrayBuffer) {
  const archive = new JSZip();
  const filesWithData = new Map<string, string>();

  await archive.loadAsync(file);
  for (const filePath in archive.files) {
    const fileData = await archive.file(filePath)?.async('string');
    if(fileData) {
      filesWithData.set(filePath, fileData);
    }
  }

  return filesWithData;
}

export async function fetchTextFile(fileURL: string): Promise<string> {
  // Load file here!
  try{
    const loadingTimeMessage = `${fetchTextFile.name}: fetching ${fileURL}`;
    console.time(loadingTimeMessage);
    const fileText = await (await fetch(fileURL)).text();
    console.timeEnd(loadingTimeMessage);
    return fileText;
  }
  catch (error) {
    console.error(`Error fetching ${fileURL}: ${error}`);
    throw error;
  }
}


export async function fetchBinaryFile(fileURL: string): Promise<ArrayBuffer> {
  // Load file here!
  try{
    const loadingTimeMessage = `${fetchBinaryFile.name}: fetching ${fileURL}`;
    console.time(loadingTimeMessage);
    const fileBuffer = await (await fetch(fileURL)).arrayBuffer();
    console.timeEnd(loadingTimeMessage);
    return fileBuffer;
  }
  catch (error) {
    console.error(`Error fetching ${fileURL}: ${error}`);
    throw error;
  }
}


/**
 * Handle zip containing event data files.
 * @param fileURL URL to the zip file.
 * @returns An empty promise. ;(
 */
export async function loadZipFileEvents(fileURL: string) {

  const fileBuffer = await fetchBinaryFile(fileURL);

  let filesWithData: Map<string, string>;
  // Using a try catch block to catch any errors in Promises
  try {
    console.time('loadZipFileEvents: reading zip contents');
    filesWithData = await readZipFile(fileBuffer);
    console.timeEnd('loadZipFileEvents: reading zip contents');
  } catch (error) {
    console.error('Error while reading zip', fileURL, fileBuffer, error);
    throw error;
  }

  const allEventsObject = {};
  // JSON event data
  for(let [fileName, fileData] of filesWithData) {
    if(!fileName.endsWith('.json')) continue;     // We need only JSon!

    const parsingProfileMessage = `${loadZipFileEvents.name}: parsing JSON from '${fileName}'`
    console.time(parsingProfileMessage);
    console.profile(parsingProfileMessage);
    Object.assign(allEventsObject, JSON.parse(fileData));
    console.timeEnd(parsingProfileMessage);
    console.profileEnd(parsingProfileMessage);
  }

  return allEventsObject;
}



/**
 * Handle zip containing event data files.
 * @param fileURL URL to the zip file.
 * @returns An empty promise. ;(
 */
export async function loadJSONFileEvents(fileURL: string) {

  const fileText = await fetchTextFile(fileURL);

  const allEventsObject = {};
  // JSON event data

  const parsingProfileMessage = `${loadJSONFileEvents.name}: parsing JSON from '${fileURL}'`
  console.time(parsingProfileMessage);
  console.profile(parsingProfileMessage);
  Object.assign(allEventsObject, JSON.parse(fileText));
  console.timeEnd(parsingProfileMessage);
  console.profileEnd(parsingProfileMessage);

  return allEventsObject;
}


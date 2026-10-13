// Tesseract.js traineddata configuration
// The eng.traineddata binary has been moved out of the repo (5MB).
// It is now fetched at runtime from a CDN/env-configured URL.
//
// To use: set AI_TESSERACT_TRAINEDDATA_URL environment variable.
// The tesseract.js library will look for traineddata at the path
// configured via the WORKER_SRC_URL or by setting the traineddata
// path manually before initializing the module.
//
// Example:
//   import { tesseract } from 'tesseract.js';
//
//   // Set the traineddata path before use:
//   if (process.env.AI_TESSERACT_TRAINEDDATA_URL) {
//     // tesseract.js will fetch from this URL automatically
//   }
//
export const traineddataUrl = process.env.AI_TESSERACT_TRAINEDDATA_URL || '';
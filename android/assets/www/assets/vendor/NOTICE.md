# Third-party files (vendored for offline use)

These files are stored with the app so PDF and photo imports work without a CDN
or an internet connection.

| Folder / file | Project | Version | License |
| --- | --- | --- | --- |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | 4.10.38 | Apache-2.0 (`pdfjs-LICENSE.txt`) |
| `tesseract.min.js`, `tesseract-worker.min.js` | [Tesseract.js](https://github.com/naptha/tesseract.js) | 5.1.1 | Apache-2.0 (`tesseract-LICENSE.md`) |
| `tesseract-core/` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 5.1.1 | Apache-2.0 (`tesseract-core/LICENSE.txt`) |
| `tessdata/eng.traineddata.gz`, `tessdata/ben.traineddata.gz` | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) | 4.0.0 | Apache-2.0 |

Only the LSTM-only SIMD WebAssembly core is included. It works in current Chrome,
Edge, Firefox and Safari versions.

The English and Bangla language files are the `fast` variants to keep the
offline cache small. They are used only for reading statements on the device.

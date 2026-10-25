// Текст из PDF-выписки (SPEC 3.31). pdf.js (Mozilla) грузится только в момент загрузки выписки,
// поэтому обычная работа приложения от него не тяжелеет. Файл читается здесь же, на устройстве.
import type { PdfItem } from '../core/bankPdf';

export async function readPdfItems(bytes: ArrayBuffer): Promise<PdfItem[]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const items: PdfItem[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const it of content.items) {
      if (!('str' in it)) continue;
      items.push({ page, x: it.transform[4], y: it.transform[5], str: it.str });
    }
  }
  await doc.destroy();
  return items;
}

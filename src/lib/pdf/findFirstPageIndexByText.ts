import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// pdfjs precisa do worker configurado para extração de texto ser confiável no browser (Vite)
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Retorna o índice (0-based) da primeira página que contém o texto informado.
 * Se não encontrar, retorna null.
 */
export async function findFirstPageIndexByText(
  pdfBytes: ArrayBuffer,
  needle: string
): Promise<number | null> {
  const loadingTask = (pdfjsLib as any).getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const pageText = (textContent.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ");

    if (pageText.includes(needle)) {
      return pageNumber - 1;
    }
  }

  return null;
}

export interface TextQualityResult {
  ok: boolean;
  readableChars: number;
  pagesWithText: number;
}

export function assessTextQuality(
  pages: { pageNumber: number; text: string }[]
): TextQualityResult {
  const pagesWithText = pages.filter((p) => p.text.trim().length > 0).length;
  const readableChars = pages.reduce((sum, p) => {
    return sum + p.text.replace(/\s/g, "").length;
  }, 0);

  const ok = pagesWithText > 0 && readableChars / pages.length >= 30;

  return { ok, readableChars, pagesWithText };
}
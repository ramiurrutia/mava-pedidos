// Infer only known size codes from this image's description, never from order-wide notes.
export function getImageTitle(title: string | undefined, description: string): string {
  if (title?.trim()) return title;
  const matches = description.matchAll(/(?:^|[^\p{L}\p{N}_])(XGM|XG|DNG|SGF|SG|TC)(?=$|[^\p{L}\p{N}_])/giu);
  const sizes = new Set(Array.from(matches, (match) => match[1].toUpperCase()));
  return sizes.size === 1 ? [...sizes][0] : "";
}

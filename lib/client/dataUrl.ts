export function dataUrl(fileName: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${basePath}/data/${fileName}`;
}

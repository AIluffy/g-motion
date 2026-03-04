const rendererNameToCode = new Map<string, number>();
const rendererCodeToName: string[] = [];

export function getRendererCode(name: string): number {
  const existing = rendererNameToCode.get(name);
  if (existing !== undefined) return existing;
  const code = rendererCodeToName.length + 1;
  rendererNameToCode.set(name, code);
  rendererCodeToName[code] = name;
  return code;
}

export function getRendererName(code: number): string | undefined {
  return rendererCodeToName[code];
}

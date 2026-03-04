/* eslint-disable @typescript-eslint/no-explicit-any */
export function applyCodemod(source: string): string {
  return source
    .replace(/([\{,]\s*)easing(\s*:)/g, '$1ease$2')
    .replace(/([\{,]\s*)time(\s*:)/g, '$1at$2');
}

type JscodeshiftApi = {
  jscodeshift: {
    withParser: (name: string) => (code: string) => { toSource: () => string };
  };
};

type FileInfo = { source: string };

export default function transform(file: FileInfo, _api: JscodeshiftApi): string {
  return applyCodemod(file.source);
}

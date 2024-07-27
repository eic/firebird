
let protocolAliases = [
  {"local:": "http://localhost:" }
]


export function resolveProtocolAlias(url: string): string {
  const parsedUrl = new URL(url);
  console.log(parsedUrl);
  return parsedUrl.protocol; // This includes the colon (e.g., 'http:')
}

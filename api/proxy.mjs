import { handleProxyRequest } from "./_lib/proxy.mjs";

const webRequestFromNodeRequest = (request) => {
  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers.host || "localhost";
  return new Request(new URL(request.url, `${protocol}://${host}`).href, {
    method: request.method,
    headers: request.headers,
  });
};

export default async function handler(request, response) {
  const proxyResponse = await handleProxyRequest(webRequestFromNodeRequest(request));
  const body = await proxyResponse.text();

  response.statusCode = proxyResponse.status;
  for (const [key, value] of proxyResponse.headers) {
    response.setHeader(key, value);
  }
  response.end(body);
}

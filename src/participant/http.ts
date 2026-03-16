export default async function executeHttp(participant: any, input?: string): Promise<any> {
  const start = Date.now();
  const method = (participant.method ?? "GET").toUpperCase();
  const url = participant.url;
  const headers = participant.headers ?? {};
  let body: any = participant.body;
  if ((body === undefined || body === null) && input !== undefined) {
    body = input;
  }

  const fetchOptions: any = { method, headers };
  if (body !== undefined) fetchOptions.body = body;

  const res = await fetch(url, fetchOptions as RequestInit);
  const text = await res.text();
  const duration = Date.now() - start;

  if (!res.ok) {
    const err: any = new Error(`http participant request failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const result: any = {
    status: "completed",
    output: text,
    duration,
  };

  try {
    result.parsedOutput = JSON.parse(text);
  } catch (e) {
    // ignore parse errors
  }

  return result;
}

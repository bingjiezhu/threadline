/** Optional Gemini on Vertex transport. Credentials remain on the operator host. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensure, AppError } from './util.js';
const execFileAsync = promisify(execFile);

export async function vertexJson({ project, model, accessToken, tokenProvider, prompt, payload, schema, fetchImpl = fetch }) {
    ensure(typeof project === 'string' && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project), 'Set a valid THREADLINE_VERTEX_PROJECT on the server.', 503, 'ai_not_configured');
    ensure(typeof model === 'string' && /^gemini-[a-z0-9.-]+$/.test(model), 'Set an explicitly available THREADLINE_VERTEX_MODEL on the server.', 503, 'ai_not_configured');
    let token = accessToken;
    try {
        if (!token) token = tokenProvider ? await tokenProvider() : (await execFileAsync('gcloud', ['auth', 'application-default', 'print-access-token'], { timeout: 15000, maxBuffer: 8192 })).stdout.trim();
    } catch {
        throw new AppError('Vertex credentials are unavailable. Configure operator ADC or a short-lived access token.', 503, 'ai_not_configured');
    }
    ensure(typeof token === 'string' && token.trim().length > 0 && !/[\r\n]/.test(token), 'Vertex credentials are unavailable.', 503, 'ai_not_configured');
    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
    let response;
    try {
        response = await fetchImpl(endpoint, {
            method: 'POST', signal: AbortSignal.timeout(45000), redirect: 'error',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-goog-user-project': project },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
                generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 2400, temperature: 0.2 } })
        });
    } catch (error) {
        throw new AppError(error.name === 'TimeoutError' ? 'Vertex timed out. Retry explicitly; your records are unchanged.' : 'Vertex could not be reached.', 502, 'provider_unavailable');
    } finally { token = undefined; }
    if (!response.ok) throw new AppError(`Vertex returned HTTP ${response.status}. Check operator configuration; no fallback plan was fabricated.`, 502, 'provider_error');
    const data = await response.json();
    const candidate = data.candidates?.[0];
    ensure(candidate?.finishReason === 'STOP', 'Vertex did not return a complete plan. No model output was saved.', 502, 'incomplete_output');
    const output = candidate.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
    ensure(output, 'Vertex returned no usable text.', 502, 'provider_refusal');
    let value;
    try { value = JSON.parse(output); } catch { throw new AppError('Vertex returned invalid JSON. No model output was saved.', 502, 'invalid_output'); }
    return { value, usage: { input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, total_tokens: data.usageMetadata?.totalTokenCount || 0 }, responseId: data.responseId || '', model: data.modelVersion || model, provider: 'vertex' };
}

import { graphMailConfig, graphScopes, microsoftAuthority, saveGraphCredential } from '../src/integrations/graph-mail';

// Run interactively in the app container. Never print token responses.
async function authorize() {
  const config = graphMailConfig();
  if (!config) throw Error('Configura GRAPH_CLIENT_ID, GRAPH_TOKEN_FILE, MAIL_FROM y FRONTEND_ORIGIN.');
  const initial = await fetch(`${microsoftAuthority}/devicecode?mkt=es-ES`, { method: 'POST', signal: AbortSignal.timeout(10000), body: new URLSearchParams({ client_id: config.clientId, scope: graphScopes }) });
  if (!initial.ok) throw Error('No se pudo iniciar la autorización de Microsoft.');
  const device = await initial.json() as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };
  if (!device.device_code || !device.user_code || !device.verification_uri || !Number.isFinite(device.expires_in)) throw Error('Respuesta de autorización inválida.');
  console.log(`Abre ${device.verification_uri}\nIntroduce el código: ${device.user_code}\nInicia sesión con ${config.from} y autoriza EnerTrade AI Correo.\nNo compartas este código ni cierres esta terminal.`);
  const deadline = Date.now() + device.expires_in * 1000;
  let interval = Math.max(device.interval || 5, 5);
  while (Date.now() < deadline) {
    await Bun.sleep(interval * 1000);
    const response = await fetch(`${microsoftAuthority}/token`, { method: 'POST', signal: AbortSignal.timeout(10000), body: new URLSearchParams({ client_id: config.clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code }) });
    const result = await response.json() as { error?: string; error_codes?: number[]; access_token?: string; refresh_token?: string };
    if (result.error === 'authorization_pending') continue;
    if (result.error === 'slow_down') { interval += 5; continue; }
    if (!response.ok || !result.access_token || !result.refresh_token) {
      const code = typeof result.error === 'string' && /^[a-z_]{1,60}$/.test(result.error) ? result.error : 'token_response_invalid';
      const ids = Array.isArray(result.error_codes) ? result.error_codes.filter(n => Number.isSafeInteger(n) && n > 0).slice(0, 3).map(n => `AADSTS${n}`).join(', ') : '';
      throw Error(`Autorización no completada: ${code}${ids ? ' (' + ids + ')' : ''}. HTTP ${response.status}. No se guardaron tokens.`);
    }
    const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { Authorization: `Bearer ${result.access_token}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!me.ok) throw Error('No se pudo comprobar la cuenta autorizada.');
    const profile = await me.json() as { mail?: string; userPrincipalName?: string };
    if (![profile.mail, profile.userPrincipalName].some(value => value?.toLowerCase() === config.from)) throw Error('La cuenta autorizada no coincide con MAIL_FROM; no se guardaron tokens.');
    await saveGraphCredential(config, result.refresh_token);
    console.log('Autorización guardada en el volumen privado. No se envió ningún correo.');
    return;
  }
  throw Error('El código venció; vuelve a ejecutar el comando.');
}
authorize().catch(error => { console.error(error instanceof Error && /^(Configura|No se pudo|Respuesta|Autorización|La cuenta|El código)/.test(error.message) ? error.message : 'No se pudo completar o guardar la autorización.'); process.exitCode = 1; });

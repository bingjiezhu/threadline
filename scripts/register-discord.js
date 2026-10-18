/** Explicit operator action. Preview by default; --apply registers only these named commands. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const commands = JSON.parse(readFileSync(new URL('../integrations/discord/commands.json', import.meta.url), 'utf8'));
if (process.argv.includes('--help')) {
    console.log('node --env-file-if-exists=.env scripts/register-discord.js [--apply]\nPreview is offline. Applying uses DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN. Never use a normal user token.');
    process.exit(0);
}
if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'preview_only', commands, next: 'Configure the application as User Install, its HTTPS interaction URL, then run npm run register:discord -- --apply with operator authorization.' }, null, 2));
    process.exit(0);
}
const id = process.env.DISCORD_APPLICATION_ID, token = process.env.DISCORD_BOT_TOKEN;
if (!/^\d{10,25}$/.test(id || '') || !token) {
    console.error('Set a valid DISCORD_APPLICATION_ID and a Discord BOT token. Nothing was registered.');
    process.exit(1);
}
try {
    const out = [];
    for (const command of commands) {
        const response = await fetch(`https://discord.com/api/v10/applications/${id}/commands`, { method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok)
            throw Error(`Discord returned HTTP ${response.status}. Verify application ownership, bot credentials and command limits; retry only after checking the portal.`);
        const record = await response.json();
        out.push({ name: record.name, type: record.type, id: record.id });
    }
    console.log(JSON.stringify({ registered: out, scope: 'Only these command names and types; other application commands were not deleted.', remaining: 'Test an actual User Install, signed interaction, account linking, private reply and source deletion in your intended Discord client.' }, null, 2));
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

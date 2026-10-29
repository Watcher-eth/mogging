import { discordConfig, portalOrigin } from '../../lib/creator/discord/config'
import { registerSupportCommands } from '../../lib/creator/discord/registration'

const config = discordConfig()
const register = process.argv.includes('--register')
if (register) {
  console.log(`Registered ${await registerSupportCommands(config)} in the configured guild.`)
}
const install = new URL('https://discord.com/oauth2/authorize')
install.search = new URLSearchParams({ client_id: config.applicationId, scope: 'bot applications.commands', permissions: '0', guild_id: config.guildId, disable_guild_select: 'true' }).toString()
console.log(`Install in Mogging Creators: ${install}`)
console.log(`Interactions endpoint: ${portalOrigin()}/api/discord/interactions`)
console.log(`OAuth redirect: ${config.redirectUri}`)
console.log('No privileged intents or Administrator permission are required. Command availability is controlled in Server Settings → Integrations.')

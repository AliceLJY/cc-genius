export interface SlashCommand {
  name: string
  description: string
  type: 'client' | 'server'
  args?: string
}

export const COMMANDS: SlashCommand[] = [
  { name: '/help',    description: '显示所有命令',     type: 'client' },
  { name: '/compact', description: '压缩对话上下文',   type: 'server' },
  { name: '/clear',   description: '清空当前对话消息', type: 'client' },
  { name: '/effort',  description: '切换思考深度',     type: 'server', args: 'low | medium | high' },
  { name: '/status',  description: '当前状态速览',     type: 'client' },
]

export type EffortLevel = 'low' | 'medium' | 'high'

export function filterCommands(input: string): SlashCommand[] {
  const q = input.toLowerCase().replace(/^\//, '')
  if (!q) return COMMANDS
  return COMMANDS.filter((cmd) => cmd.name.slice(1).startsWith(q))
}

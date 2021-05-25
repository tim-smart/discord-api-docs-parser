export const list: [string, string[]][] = [
  ["Heartbeat", ["integer"]],
  [
    "ApplicationCommandCreateEvent",
    ["ApplicationCommand", "ApplicationCommandExtra"],
  ],
  [
    "ApplicationCommandUpdateEvent",
    ["ApplicationCommand", "ApplicationCommandExtra"],
  ],
  [
    "ApplicationCommandDeleteEvent",
    ["ApplicationCommand", "ApplicationCommandExtra"],
  ],
  ["GuildMemberAddEvent", ["GuildMember", "GuildMemberAddExtra"]],
  ["InvalidSessionEvent", ["boolean"]],
  ["ResumedEvent", ["null"]],
  ["ReconnectEvent", ["null"]],
];

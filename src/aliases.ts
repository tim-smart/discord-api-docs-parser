export interface Alias {
  identifier: string;
  nullable: boolean;
  types: string[];
  array?: boolean;
}

export const list: Alias[] = [
  { identifier: "Heartbeat", nullable: true, types: ["integer"] },
  {
    identifier: "ApplicationCommandCreateEvent",
    nullable: false,
    types: ["ApplicationCommand", "ApplicationCommandExtra"],
  },
  {
    identifier: "ApplicationCommandUpdateEvent",
    nullable: false,
    types: ["ApplicationCommand", "ApplicationCommandExtra"],
  },
  {
    identifier: "ApplicationCommandDeleteEvent",
    nullable: false,
    types: ["ApplicationCommand", "ApplicationCommandExtra"],
  },
  {
    identifier: "GuildMemberAddEvent",
    nullable: false,
    types: ["GuildMember", "GuildMemberAddExtra"],
  },
  { identifier: "InvalidSessionEvent", nullable: false, types: ["boolean"] },
  { identifier: "ResumedEvent", nullable: false, types: ["null"] },
  { identifier: "ReconnectEvent", nullable: false, types: ["null"] },

  {
    identifier: "MessageComponent",
    nullable: false,
    array: false,
    types: ["Component", "MessageActionRow"],
  },
  {
    identifier: "MessageComponentList",
    nullable: false,
    array: true,
    types: ["MessageComponent"],
  },
];

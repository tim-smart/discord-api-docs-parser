export interface Alias {
  identifier: string;
  nullable: boolean;
  types: string[];
  combinator?: "and" | "or";
  array?: boolean;
}

export const list: Alias[] = [
  {
    identifier: "GuildCreateEvent",
    nullable: false,
    types: ["Guild", "GuildCreateExtra"],
  },
  { identifier: "Heartbeat", nullable: true, types: ["integer"] },
  {
    identifier: "IntegrationCreateEvent",
    nullable: false,
    types: ["Integration", "IntegrationCreateEventAdditional"],
  },
  {
    identifier: "IntegrationUpdateEvent",
    nullable: false,
    types: ["Integration", "IntegrationUpdateEventAdditional"],
  },
  {
    identifier: "InteractionCallbackDatum",
    nullable: false,
    combinator: "or",
    types: [
      "InteractionCallbackAutocomplete",
      "InteractionCallbackMessage",
      "InteractionCallbackModal",
    ],
  },
  {
    identifier: "InteractionDatum",
    nullable: false,
    combinator: "or",
    types: [
      "ApplicationCommandDatum",
      "MessageComponentDatum",
      "ModalSubmitDatum",
    ],
  },
  {
    identifier: "Component",
    nullable: false,
    combinator: "or",
    types: ["ActionRow", "Button", "TextInput", "SelectMenu"],
  },
  {
    identifier: "GuildMemberAddEvent",
    nullable: false,
    types: ["GuildMember", "GuildMemberAddExtra"],
  },
  { identifier: "InvalidSessionEvent", nullable: false, types: ["boolean"] },
  {
    identifier: "MessageCreateEvent",
    nullable: false,
    types: ["Message", "MessageCreateExtra"],
  },
  {
    identifier: "MessageUpdateEvent",
    nullable: false,
    types: ["MessageCreateEvent"],
  },
  { identifier: "ResumedEvent", nullable: false, types: ["null"] },
  { identifier: "ReconnectEvent", nullable: false, types: ["null"] },
  {
    identifier: "MessageInteractionMetadatum",
    nullable: false,
    combinator: "or",
    types: [
      "ApplicationCommandInteractionMetadatum",
      "MessageComponentInteractionMetadatum",
      "ModalSubmitInteractionMetadatum",
    ],
  },
];

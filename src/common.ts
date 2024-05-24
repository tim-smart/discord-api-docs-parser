import * as Cheerio from "cheerio";
import * as Arr from "fp-ts/Array";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import pluralize from "pluralize";
import S from "string";

export const table = ($el: Cheerio.Cheerio<Cheerio.Element>) =>
  $el.nextUntil("h1, h2, h3, h4, h5, h6", "table").first();

export const hasTable = ($el: Cheerio.Cheerio<Cheerio.Element>) =>
  table($el).length > 0;

export const camelify = (input: string) =>
  F.pipe(S(input).underscore().slugify(), (s) => s.camelize().s);

export const typeify = (input: string, caps = true) =>
  F.pipe(
    S(input).underscore().slugify(),
    (s) => (caps ? s.capitalize() : s),
    (s) => s.camelize().s,
    pluralize.singular,
  );

const fileRemaps: Record<string, Record<string, string>> = {
  "resources/Guild.md": {
    listActiveThreads: "listGuildActiveThreads",
  },
};

const fileHeadingRemaps: Record<string, Record<string, string>> = {
  "interactions/Receiving_and_Responding.md": {
    Autocomplete: "InteractionCallbackAutocomplete",
    Message: "InteractionCallbackMessage",
    Modal: "InteractionCallbackModal",
  },
};

const remaps: Record<string, string> = {
  Allowedmention: "AllowedMention",
  Applicationcommand: "ApplicationCommand",
  Applicationcommandoption: "ApplicationCommandOption",
  Applicationcommandoptionchoice: "ApplicationCommandOptionChoice",
  Applicationcommandoptiontype: "ApplicationCommandOptionType",
  Applicationcommandpermission: "ApplicationCommandPermission",
  Applicationcommandpermissiontype: "ApplicationCommandPermissionType",
  Binary: "string",
  BooleanQueryString: "boolean",
  BulkOverwriteGuildApplicationCommandBulkApplicationCommandParams:
    "BulkOverwriteGuildApplicationCommandParams",
  Connecting: "mixed",
  DocsInteractionsMessageComponent: "Component",
  Filecontent: "string",
  GetGateway: "mixed",
  Guildapplicationcommandpermission: "GuildApplicationCommandPermission",
  InteractionRequestType: "InteractionType",
  ImageDatum: "string",
  Oauth2Scope: "OAuth2Scope",
  Object: "mixed",
  Presence: "PresenceUpdateEvent",
  PresenceUpdate: "PresenceUpdateEvent",
  Messageinteraction: "MessageInteraction",
  UpdatePresenceStatusType: "StatusType",
  StartThreadInForumChannelForumThreadMessageParam:
    "StartThreadInForumChannelForumThreadMessageParams",
  StartThreadInForumOrMediaChannelForumAndMediaThreadMessageParam: "Message",
  TeamMemberRolesTeamMemberRoleType: "TeamMemberRoleType",
  TextInputsTextInputStyle: "TextInputStyle",
  MessageComponent: "Component",
  MessageInteractionMetadataStructure: "MessageInteractionMetadatum",

  // Gateway commands
  GuildRequestMember: "RequestGuildMember",
  GatewayPresenceUpdate: "UpdatePresence",
  GatewayVoiceStateUpdate: "UpdateVoiceState",
  MessageReactionRemoveEmoji: "MessageReactionRemoveEmojiEvent",
  WebhookUpdateEvent: "WebhooksUpdateEvent",

  // Gateway events
  Hello: "HelloEvent",

  // Polls
  MessagePollVoteAdd: "MessagePollVoteAddEvent",
  MessagePollVoteRemove: "MessagePollVoteRemoveEvent",

  // Reactions
  GetReactionsReactionType: "ReactionType",
};
export const maybeRename =
  (file: string, heading = false) =>
  (id: string) =>
    F.pipe(
      O.fromNullable(fileRemaps[file]?.[id]),
      O.alt(() => O.fromNullable(remaps[id])),
      O.getOrElse(() => id),
      heading ? maybeRenameHeading(file) : F.identity,
    );
export const maybeRenameHeading = (file: string) => (id: string) =>
  F.pipe(
    O.fromNullable(fileHeadingRemaps[file]?.[id]),
    O.getOrElse(() => id),
  );

export const constantify = (input: string) =>
  S(input.replace(/[^A-z1-9_. ]/g, "").replace(/\./g, "_"))
    .underscore()
    .s.toUpperCase();

export const columnIndex = (labels: string[]) => {
  const labelsR = new RegExp(`\\b(${labels.join("|")})\\b`, "i");

  return ($: Cheerio.CheerioAPI) => ($th: Cheerio.Cheerio<Cheerio.Element>) =>
    F.pipe(
      $th.map((_, el) => $(el).text()).toArray(),
      Arr.findIndex((text) => labelsR.test(text)),
    );
};

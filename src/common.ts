import * as Cheerio from "cheerio";
import * as Arr from "fp-ts/Array";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import pluralize from "pluralize";
import S from "string";

export const table = ($el: Cheerio.Cheerio<Cheerio.Element>) =>
  $el.nextUntil($el[0].tagName, "table").first();

export const hasTable = ($el: Cheerio.Cheerio<Cheerio.Element>) =>
  table($el).length > 0;

export const typeify = (input: string, caps = true) =>
  F.pipe(
    S(input).underscore().slugify(),
    (s) => (caps ? s.capitalize() : s),
    (s) => s.camelize().s,
    pluralize.singular,
  );

const remaps: Record<string, string> = {
  Allowedmention: "AllowedMention",
  Applicationcommandoption: "ApplicationCommandOption",
  Applicationcommandoptionchoice: "ApplicationCommandOptionChoice",
  Applicationcommandoptiontype: "ApplicationCommandOptionType",
  Applicationcommandpermission: "ApplicationCommandPermission",
  Applicationcommandpermissiontype: "ApplicationCommandPermissionType",
  Binary: "string",
  Filecontent: "string",
  ImageDatum: "string",
  Presence: "PresenceUpdateEvent",
  PresenceUpdate: "PresenceUpdateEvent",
  Messageinteraction: "MessageInteraction",
  UpdatePresence: "GatewayPresenceUpdate",
};
export const maybeRename = (id: string) =>
  F.pipe(
    O.fromNullable(remaps[id]),
    O.getOrElse(() => id),
  );

export const constantify = (input: string) =>
  S(input.replace(/[^A-z1-9 ]/, ""))
    .slugify()
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

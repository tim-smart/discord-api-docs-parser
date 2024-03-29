import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import Marked from "marked";
import * as R from "remeda";
import * as Common from "./common";
import { Flags } from "./flags";
import * as Structures from "./structures";

export const fromDocument = ($: Cheerio.CheerioAPI): GatewaySection[] =>
  $("h2")
    .toArray()
    .map((h2) => [$(h2), Common.table($(h2))] as const)
    .filter(([$h2]) => /send events|receive events/i.test($h2.text()))
    .map(([$h2, $table]) => fromHeader($)($h2, $table));

const fromHeader =
  ($: Cheerio.CheerioAPI) =>
  (
    $h2: Cheerio.Cheerio<Cheerio.Element>,
    $table: Cheerio.Cheerio<Cheerio.Element>,
  ) => {
    const identifier = Common.typeify($h2.text().trim());
    return {
      identifier,
      values: values($)($table, /receive/i.test(identifier)),
    };
  };

export type GatewaySection = ReturnType<ReturnType<typeof fromHeader>>;

const values =
  ($: Cheerio.CheerioAPI) =>
  ($table: Cheerio.Cheerio<Cheerio.Element>, isEvents = false) => {
    const headerCount = $table.find("th").length;
    return F.pipe(
      $table
        .find("td")
        .map((_, td) => $(td))
        .toArray(),
      R.chunk(headerCount),
      R.map((columns) => value(columns[0], columns[1], isEvents)),
    );
  };

const value = (
  $name: Cheerio.Cheerio<Cheerio.Element>,
  $description: Cheerio.Cheerio<Cheerio.Element>,
  isEvents: boolean,
) => {
  const name = Common.constantify($name.text().trim());
  const type = Common.typeify($name.text().trim()) + (isEvents ? "Event" : "");
  const description = $description.text().trim();

  return {
    name,
    type,
    description,
  };
};

export interface GatewayEvent {
  identifier: string;
  payload: string;
}

export const events = (markdown: string): GatewayEvent[] =>
  markdown
    .replace(/\r\n/, "\n")
    .split(/(^|\n)#+\s+/)
    .slice(1)
    .filter(isGatewayEventSection)
    .map((section) => event(section))
    .filter(O.isSome)
    .map((event) => event.value);

const eventR = /\b(Inner payload is|The inner payload is)\b/;
const isGatewayEventSection = (section: string) => eventR.test(section);

const event = (markdown: string): O.Option<GatewayEvent> => {
  const heading = markdown.split("\n")[0].trim();
  return F.pipe(
    O.fromNullable(
      /(Inner payload is|The inner payload) .*?[.:\n]/.exec(markdown),
    ),
    O.map((md) => Cheerio.load(Marked.parse(md[0]))),
    O.map(($) => $("a")),
    O.chain(($links) => Structures.referenceFromLinks("")($links)),
    O.map((ref) => ({
      identifier: Common.typeify(`${heading} Event`),
      payload: ref,
    })),
  );
};

export const intents = ($: Cheerio.CheerioAPI): Flags[] =>
  $("h3")
    .toArray()
    .map((h3) => [$(h3), $(h3).nextUntil("h3", "pre").first()] as const)
    .filter(
      ([$h3, $pre]) => /list of intents/i.test($h3.text()) && $pre.length > 0,
    )
    .map(([_$h6, $pre]) => ({
      identifier: "GatewayIntents",
      values: intentValuesFromPre($pre),
    }));

const intentValuesFromPre = (
  $pre: Cheerio.Cheerio<Cheerio.Element>,
): Flags["values"] =>
  F.pipe(
    O.fromNullable($pre.text().matchAll(/\b(\w+)\s+\((\d+) << (\d+)\)/g)),
    O.map((matches) => [...matches]),
    O.fold(
      () => [],
      (matches) =>
        matches.map(([_, name, left, right]) => ({
          name,
          description: O.none,
          bigint: false,
          left,
          right,
        })),
    ),
  );

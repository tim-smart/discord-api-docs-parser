import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as R from "remeda";
import * as Common from "./common";
import * as Structures from "./structures";
import * as Marked from "marked";

export const fromDocument = ($: Cheerio.CheerioAPI): GatewaySection[] =>
  $("h6")
    .toArray()
    .map(
      (h6) =>
        [
          $(h6 as Cheerio.Element),
          Common.table($(h6 as Cheerio.Element)),
        ] as const,
    )
    .filter(([$h6]) => /events|commands/i.test($h6.text()))
    .map(([$h6, $table]) => fromHeader($)($h6, $table));

const fromHeader =
  ($: Cheerio.CheerioAPI) =>
  (
    $h6: Cheerio.Cheerio<Cheerio.Element>,
    $table: Cheerio.Cheerio<Cheerio.Element>,
  ) => {
    const identifier = Common.typeify($h6.text().trim());
    return {
      identifier,
      values: values($)($table, /event/i.test(identifier)),
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
      /(Inner payload is|The inner payload) .*?[.:]/.exec(markdown),
    ),
    O.map((md) => Cheerio.load(Marked.parse(md[0]))),
    O.map(($) => $("a")),
    O.chain(($links) => Structures.referenceFromLinks($links)),
    O.map((ref) => ({
      identifier: Common.typeify(`${heading} Event`),
      payload: ref,
    })),
  );
};

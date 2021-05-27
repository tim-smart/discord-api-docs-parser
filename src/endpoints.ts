import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as Common from "./common";
import * as O from "fp-ts/Option";
import Marked from "marked";
import * as Structures from "./structures";
import * as Arr from "fp-ts/Array";

export const fromDocument = (markdown: string): Endpoint[] =>
  markdown
    .replace(/\r\n/, "\n")
    .split(/(^|\n)##\s+/)
    .map((section) => section.split("\n"))
    .filter(isEndpointSection)
    .map((section) => fromSection(section));

const endpointR = /(.*) % (get|post|put|patch|delete) (.*)$/i;

export const isEndpointSection = (section: string[]) =>
  endpointR.test(section[0]);

export const fromSection = (section: string[]) => {
  const markdown = `## ${section.join("\r\n")}`;
  const $ = Cheerio.load(Marked(markdown));

  const match = section[0].match(endpointR)!;
  const route = identifier(match[1]);

  const response = F.pipe(
    section.join(" ").match(/\breturns .*?\./i),
    O.fromNullable,
    O.map((m) => m[0]),
    O.map(parseResponse),
  );

  return {
    route,
    description: description($),
    method: match[2],
    url: url(match[3]),
    params: params($, markdown, route, !/get|delete/i.test(match[2])),
    response,
  };
};

export type Endpoint = ReturnType<typeof fromSection>;

export const identifier = (heading: string) =>
  F.pipe(heading.trim(), Common.camelify);

export const url = (raw: string) =>
  raw.replace(
    /\{(.*?)\}/g,
    F.flow(
      (_, param: string) => param.split("#")[0].replace(/[^A-z]/g, "_"),
      (param) => `{${param}}`,
    ),
  );

export const parseResponse = (markdown: string) => {
  const $ = Cheerio.load(Marked(markdown));
  const ref = Structures.referenceFromLinks($("a"));
  const array = /array|list/.test(markdown);

  return {
    ref,
    array,
  };
};

export interface EndpointParams {
  identifier: string;
  array: boolean;
  structures: Structures.Structure[];
}

export const params = (
  $: Cheerio.CheerioAPI,
  markdown: string,
  route: string,
  hasBody: boolean,
): O.Option<EndpointParams> => {
  const takes: O.Option<EndpointParams> = F.pipe(
    O.fromNullable(/\bTakes a.*?\./.exec(markdown)),
    O.map((matches) => matches[0]),
    O.map((md) => [Cheerio.load(Marked(md)), /array|list/.test(md)] as const),
    O.chain(([$, array]) =>
      F.pipe(
        Structures.referenceFromLinks($("a")),
        O.map((identifier) => ({
          identifier,
          array,
          structures: [],
        })),
      ),
    ),
  );

  return F.pipe(
    Structures.fromDocument($, /zzz/, /params/i),
    Arr.filter(({ identifier }) =>
      hasBody ? !/querystring/i.test(identifier) : !/json/i.test(identifier),
    ),
    Arr.map((structure) => {
      const identifier = Common.typeify(route);
      const variant = structure.identifier
        .replace(/json/i, "")
        .replace(/form/i, "")
        .replace(/querystring/i, "")
        .replace(/Params?/, "");

      return {
        ...structure,
        identifier: `${identifier}${variant}Params`,
      };
    }),
    O.fromPredicate((s) => s.length > 0),
    O.map((structures) => ({
      identifier: `${Common.typeify(route)}Params`,
      array: false,
      structures,
    })),
    O.alt(() => takes),
  );
};

export const description = ($: Cheerio.CheerioAPI) =>
  F.pipe(
    O.some($("h2").next("p").first()),
    O.filter(($p) => $p.length > 0),
    O.map(($p) => $p.text().trim()),
  );

import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as Common from "./common";
import * as O from "fp-ts/Option";
import Marked from "marked";
import * as Structures from "./structures";
import * as Arr from "fp-ts/Array";

export const fromDocument = (markdown: string, file: string): Endpoint[] =>
  markdown
    .replace(/\r\n/, "\n")
    .split(/(^|\n)##\s+/)
    .map((section) => section.split("\n"))
    .filter(isEndpointSection)
    .map(fromSection(file));

const endpointR = /(.*) % (get|post|put|patch|delete) (.*)$/i;

export const isEndpointSection = (section: string[]) =>
  endpointR.test(section[0]);

export const fromSection = (file: string) => (section: string[]) => {
  const markdown = `## ${section.join("\n")}`;
  const $ = Cheerio.load(Marked(markdown));

  const match = section[0].match(endpointR)!;
  const route = identifier(file)(match[1]);

  return {
    route,
    description: description($),
    method: match[2],
    url: url(match[3]),
    params: params(file, $, markdown, route, !/get|delete/i.test(match[2])),
    response: response($, section.join(" "), route),
  };
};

export type Endpoint = ReturnType<ReturnType<typeof fromSection>>;

export const identifier = (file: string) => (heading: string) =>
  F.pipe(heading.trim(), Common.camelify, Common.maybeRename(file));

export const url = (raw: string) =>
  raw.replace(
    /\{(.*?)\}/g,
    F.flow(
      (_, param: string) => param.split("#")[0].replace(/[^A-z]/g, "_"),
      (param) => `{${param}}`,
    ),
  );

export interface EndpointParams {
  identifier: string;
  array: boolean;
  structures: Structures.Structure[];
  alias?: boolean;
}

export const params = (
  file: string,
  $: Cheerio.CheerioAPI,
  markdown: string,
  route: string,
  hasBody: boolean,
): O.Option<EndpointParams> => {
  const takes: O.Option<EndpointParams> = F.pipe(
    O.fromNullable(/\bTakes a.*?\./.exec(markdown)),
    O.alt(() => O.fromNullable(/\bBody is.*?\./.exec(markdown))),
    O.map((matches) => ({ match: matches[0] })),
    O.bind("$", ({ match }) => O.some(Cheerio.load(Marked(match)))),
    O.bind("array", ({ match }) => O.some(/array|list/.test(match))),
    O.chain(({ $, array }) =>
      F.pipe(
        Structures.referenceFromLinks("")($("a")),
        O.map((identifier) => ({
          identifier,
          array,
          structures: [],
        })),
      ),
    ),
  );

  return F.pipe(
    Structures.fromDocument($, {
      exclude: /zzz/,
      include: /params/i,
    }),
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
        identifier: Common.maybeRename(file)(`${identifier}${variant}Params`),
      };
    }),
    O.fromPredicate((s) => s.length > 0),
    O.map((structures) => ({
      identifier: Common.maybeRename(file)(`${Common.typeify(route)}Params`),
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

export const response = (
  $: Cheerio.CheerioAPI,
  markdown: string,
  route: string,
): O.Option<EndpointParams> => {
  const returns = F.pipe(
    O.fromNullable(
      markdown.match(/\b(returns|responses? includes?|body is an?) .*?\./gi),
    ),
    O.map((m) => m.join(" ")),
    O.chain(parseResponse),
  );

  const alias = F.pipe(
    O.fromNullable(markdown.match(/\bfunctions the same as .*?\./gi)),
    O.map((m) => m[0]),
    O.map((_) => Cheerio.load(Marked(_))),
    O.chain(($) =>
      F.pipe(
        Structures.referenceFromLinks("")($("a")),
        O.map(
          (_): EndpointParams => ({
            identifier: identifier("")(_),
            array: false,
            structures: [],
            alias: true,
          }),
        ),
      ),
    ),
  );

  return F.pipe(
    Structures.fromDocument($, { exclude: /zzz/, include: /response/i }),
    Arr.map((structure) => {
      const identifier = Common.typeify(route);
      return {
        ...structure,
        identifier: `${identifier}Response`,
      };
    }),
    O.fromPredicate((s) => s.length > 0),
    O.map((structures) => ({
      identifier: `${Common.typeify(route)}Response`,
      array: false,
      structures,
    })),
    O.alt(() => returns),
    O.alt(() => alias),
  );
};

export const parseResponse = (markdown: string): O.Option<EndpointParams> => {
  const $ = Cheerio.load(Marked(markdown));
  const identifier = Structures.referenceFromLinks("")($("a"));
  const array = /array|list/.test(markdown);

  return F.pipe(
    identifier,
    O.map((identifier) => ({
      identifier,
      array,
      structures: [],
    })),
  );
};

import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as Arr from "fp-ts/Array";
import * as O from "fp-ts/Option";
import * as R from "remeda";
import * as Common from "./common";
import * as Enums from "./enums";

const isStructureTable =
  ($: Cheerio.CheerioAPI) => ($table: Cheerio.Cheerio<Cheerio.Element>) => {
    const $th = $table.find("th");
    const headers = $th.map((_, th) => $(th).text().trim()).toArray();

    const field = headers.some((text) => /field|name/i.test(text));
    const type = headers.some((text) => /type|value/i.test(text));
    const description = headers.some((text) => /description/i.test(text));

    return field && type && description;
  };

export const excludeR = /(%|example|json|type|change key|flag|modes?$|styles)/i;

const headerSelectors = ["h2", "h4", "h6", "#client-status-object"];

export const fromDocument = (
  $: Cheerio.CheerioAPI,
  {
    file = "",
    exclude = excludeR,
    include = /.*/,
  }: { exclude?: RegExp; include?: RegExp; file?: string },
): Structure[] =>
  $(headerSelectors.join(", "))
    .toArray()
    .map(
      (h6) =>
        [
          $(h6 as Cheerio.Element),
          Common.table($(h6 as Cheerio.Element)),
        ] as const,
    )
    .filter(([_$h6, $table]) => isStructureTable($)($table))
    .filter(([$h6, _]) => !exclude.test($h6.text()))
    .filter(([$h6, _]) => include.test($h6.text()))
    .map(([$h6, $table]) => fromHeader($, file)($h6, $table));

export const fromHeader =
  ($: Cheerio.CheerioAPI, file: string) =>
  (
    $h6: Cheerio.Cheerio<Cheerio.Element>,
    $table: Cheerio.Cheerio<Cheerio.Element>,
  ) => ({
    identifier: identifier(file, true)($h6.text()),
    fields: fields($, file)($table),
  });

export type Structure = ReturnType<ReturnType<typeof fromHeader>>;

export const identifier =
  (file: string, isHeading = false) =>
  (heading: string) =>
    F.pipe(
      heading
        .replace(/(\s+|-)fields/i, "")
        .replace(/(\s+|-)object/i, "")
        .replace(/(\s+|-)structure$/i, "")
        .replace(/optional/i, "")
        .trim(),
      Common.typeify,
      Common.maybeRename(file, isHeading),
    );

export const fields =
  ($: Cheerio.CheerioAPI, file: string) =>
  ($table: Cheerio.Cheerio<Cheerio.Element>) => {
    const headerCount = $table.find("th").length;
    return F.pipe(
      $table
        .find("td")
        .map((_, td) => $(td))
        .toArray(),
      R.chunk(headerCount),
      R.map((fields) => field(file)(fields[0], fields[1], fields[2])),
    );
  };

export const field =
  (file: string) =>
  (
    $name: Cheerio.Cheerio<Cheerio.Element>,
    $type: Cheerio.Cheerio<Cheerio.Element>,
    $description: Cheerio.Cheerio<Cheerio.Element>,
  ) => {
    const name = $name.text().replace(/\*/g, "").trim();
    const identifier = name.replace(/\?/g, "").match(/^[A-Za-z_$]+/)![0];
    const optional = /\?$/.test(name);

    return {
      name: identifier,
      optional,
      type: type(file)($type, $description),
      description: $description.text(),
    };
  };

export const type =
  (file: string) =>
  (
    $type: Cheerio.Cheerio<Cheerio.Element>,
    $description: Cheerio.Cheerio<Cheerio.Element>,
  ) => {
    const text = $type.text();
    const nullable = text.startsWith("?");

    const rawIdentifier = sanitizeIdentifier(file)(text);
    const array = rawIdentifier === "array" || /array|list/i.test(text);
    const relation = referenceFromLinks(file)($type.find("a"));
    const snowflakeMap = /map of snowflakes/i.test(text);

    return {
      identifier: identifierOrReference(file)(
        rawIdentifier,
        relation,
        $description,
      ),
      nullable,
      array,
      snowflakeMap,
    };
  };

const sanitizeIdentifier =
  (file: string) =>
  (text: string): string =>
    F.pipe(
      O.some(text),

      // Snowflake?
      O.filter((text) => /\b(snowflake|object id)/.test(text)),
      O.map(() => "snowflake"),

      // Array of
      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/^(?:array|list) of (\w*)$/)),
          O.map((matches) => matches[1]),
          O.map(sanitizeIdentifier(file)),
        ),
      ),

      // String?
      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/\bstrings?\b/)),
          O.map(() => "string"),
        ),
      ),

      // Timestamp?
      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/timestamp\b/)),
          O.map(() => "timestamp"),
        ),
      ),

      // Normalize ints
      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/\bint/)),
          O.map(() => "integer"),
        ),
      ),

      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/\bfloat/i)),
          O.map(() => "float"),
        ),
      ),

      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/\bdouble/i)),
          O.map(() => "float"),
        ),
      ),

      // Boolean
      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/\bbool(ean)?\b/)),
          O.map(() => "boolean"),
        ),
      ),

      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/array|list|component object/)),
          O.map(() => "array"),
        ),
      ),

      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/dict/)),
          O.map(() => "dict"),
        ),
      ),

      O.alt(() =>
        F.pipe(
          O.fromNullable(text.match(/null/)),
          O.map(() => "null"),
        ),
      ),

      // Mixed
      O.alt(() =>
        F.pipe(
          O.fromNullable(
            text.match(/mixed|\bOptionType\b|application command option type/),
          ),
          O.map(() => "mixed"),
        ),
      ),

      // Normal identifier
      O.getOrElse(() =>
        F.pipe(
          text.replace(/[^A-z]/g, ""),
          Common.typeify,
          Common.maybeRename(file),
        ),
      ),
    );

export const referenceFromLinks =
  (file: string) =>
  ($links: Cheerio.Cheerio<Cheerio.Element>, includeStructures = true) =>
    F.pipe(
      O.some($links),

      // Get the first link's href
      O.filter(($links) => $links.length > 0),
      O.map(($links) => $links.first()),
      O.chain(($link) => referenceFromLink(file)($link, includeStructures)),
    );

export const referencesFromLinks =
  ($: Cheerio.CheerioAPI, file: string) =>
  ($links: Cheerio.Cheerio<Cheerio.Element>, includeStructures = true) =>
    $links
      .toArray()
      .map((link) => $(link))
      .map(($link) => referenceFromLink(file)($link, includeStructures))
      .filter(O.isSome)
      .map((ref) => ref.value);

export const referenceFromLink =
  (file: string) =>
  ($link: Cheerio.Cheerio<Cheerio.Element>, includeStructures = true) =>
    F.pipe(
      O.some($link),
      O.chainNullableK(($link) => $link.attr("href")),
      O.filter((href) => !/wikipedia/.test(href)),
      O.chain(
        F.flow(
          (href) => href.split("/"),
          Arr.last,
          O.filter((s) => s.length > 0),
        ),
      ),
      O.chain(referenceFromSegment(file, includeStructures)),
    );

const referenceFromSegment =
  (file: string, includeStructures: boolean) => (ref: string) =>
    F.pipe(
      // Structures
      O.some(ref),
      O.filter(() => includeStructures),
      O.filter((ref) => !excludeR.test(ref)),
      O.map((ref) => ref.replace(/^poll-results-object-/, "")),
      O.map((ref) => ref.replace(/-object-structure$/, "")),
      O.map((ref) => ref.replace(/^.*-object-/, "")),
      // Misc clean up
      O.map((ref) => ref.replace(/^data-models-/, "")),
      O.map((ref) => ref.replace(/^shared-resources-/, "")),
      O.map((ref) => ref.replace(/identify-identify/, "identify")),
      O.map(identifier(file)),

      // Enum
      O.alt(() =>
        F.pipe(
          O.some(ref),
          O.filter((ref) => Enums.enumSuffixR.test(ref)),
          O.map((ref) => ref.replace(/^.*-object-/, "")),
          O.map((ref) => ref.replace(/^data-models-/, "")),
          O.map((ref) => ref.replace(/^shared-resources-/, "")),
          O.map((ref) => ref.replace(/^update-status-/, "")),
          O.map((ref) => ref.replace(/^buttons-/, "")),
          O.map(Enums.identifier(file)),
        ),
      ),

      // Objects
      O.alt(() =>
        F.pipe(
          O.some(ref),
          O.filter(() => includeStructures),
          O.filter((ref) => /-object$/.test(ref)),
          O.map((ref) => ref.replace(/^data-models-/, "")),
          O.map((ref) => ref.replace(/-object$/, "")),
          O.map(Common.typeify),
          O.map(Common.maybeRename(file)),
        ),
      ),

      // Everything else
      O.alt(() =>
        F.pipe(
          O.some(ref),
          O.filter(() => includeStructures),
          O.map(Common.typeify),
          O.map(Common.maybeRename(file)),
        ),
      ),
    );

export const identifierOrReference =
  (file: string) =>
  (
    identifier: string,
    relation: O.Option<string>,
    $description: Cheerio.Cheerio<Cheerio.Element>,
  ): string =>
    F.pipe(
      // Only use relation if it isn't a snowflake or mixed
      O.some(identifier),
      O.filter((id) => !["snowflake", "mixed"].includes(id)),
      O.chain(() => relation),

      // Maybe use reference for arrays or objects
      O.alt(() =>
        F.pipe(
          O.some(identifier),
          O.filter((id) => /array|mixed/.test(id)),
          O.chain(() => referenceFromLinks(file)($description.find("a"))),
        ),
      ),

      // Maybe use reference for enumerable types
      O.alt(() =>
        F.pipe(
          O.some(identifier),
          O.filter((id) => ["string", "integer"].includes(id)),
          O.chain(() =>
            referenceFromLinks(file)($description.find("a"), false),
          ),
        ),
      ),

      O.getOrElse(() => identifier.replace(/arrayof/, "")),
    );

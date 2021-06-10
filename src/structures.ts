import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
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

export const excludeR = /(%|example|params|json|type|change key)/i;

const headerSelectors = ["h2", "h6", "#client-status-object"];

export const fromDocument = (
  $: Cheerio.CheerioAPI,
  exclude = excludeR,
  include = /.*/,
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
    .map(([$h6, $table]) => fromHeader($)($h6, $table));

export const fromHeader =
  ($: Cheerio.CheerioAPI) =>
  (
    $h6: Cheerio.Cheerio<Cheerio.Element>,
    $table: Cheerio.Cheerio<Cheerio.Element>,
  ) => ({
    identifier: identifier($h6.text()),
    fields: fields($)($table),
  });

export type Structure = ReturnType<ReturnType<typeof fromHeader>>;

export const identifier = (heading: string) =>
  F.pipe(
    heading
      .replace(/(\s+|-)fields/i, "")
      .replace(/(\s+|-)object/i, "")
      .replace(/(\s+|-)structure$/i, "")
      .replace(/optional/i, "")
      .trim(),
    Common.typeify,
    Common.maybeRename,
  );

export const fields =
  ($: Cheerio.CheerioAPI) => ($table: Cheerio.Cheerio<Cheerio.Element>) => {
    const headerCount = $table.find("th").length;
    return F.pipe(
      $table
        .find("td")
        .map((_, td) => $(td))
        .toArray(),
      R.chunk(headerCount),
      R.map((fields) => field(fields[0], fields[1], fields[2])),
    );
  };

export const field = (
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
    type: type($type, $description),
    description: $description.text(),
  };
};

export const type = (
  $type: Cheerio.Cheerio<Cheerio.Element>,
  $description: Cheerio.Cheerio<Cheerio.Element>,
) => {
  const text = $type.text();
  const nullable = text.startsWith("?");

  const rawIdentifier = sanitizeIdentifier(text);
  const array = rawIdentifier === "array" || /array|list/i.test(text);
  const relation = referenceFromLinks($type.find("a"));
  const snowflakeMap = /map of snowflakes/i.test(text);

  return {
    identifier: identifierOrReference(rawIdentifier, relation, $description),
    nullable,
    array,
    snowflakeMap,
  };
};

const sanitizeIdentifier = (text: string): string =>
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
        O.map(sanitizeIdentifier),
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
        O.fromNullable(text.match(/mixed|\bOptionType\b/)),
        O.map(() => "mixed"),
      ),
    ),

    // Normal identifier
    O.getOrElse(() =>
      F.pipe(text.replace(/[^A-z]/g, ""), Common.typeify, Common.maybeRename),
    ),
  );

export const referenceFromLinks = (
  $links: Cheerio.Cheerio<Cheerio.Element>,
  includeStructures = true,
) =>
  F.pipe(
    O.some($links),

    // Get the first link's href
    O.filter(($links) => $links.length > 0),
    O.map(($links) => $links.first()),
    O.chain(($link) => referenceFromLink($link, includeStructures)),
  );

export const referencesFromLinks =
  ($: Cheerio.CheerioAPI) =>
  ($links: Cheerio.Cheerio<Cheerio.Element>, includeStructures = true) =>
    $links
      .toArray()
      .map((link) => $(link))
      .map(($link) => referenceFromLink($link, includeStructures))
      .filter(O.isSome)
      .map((ref) => ref.value);

export const referenceFromLink = (
  $link: Cheerio.Cheerio<Cheerio.Element>,
  includeStructures = true,
) =>
  F.pipe(
    O.some($link),
    O.chainNullableK(($link) => $link.attr("href")),
    O.filter((href) => !/wikipedia/.test(href)),
    O.chainNullableK(F.flow((href) => href.split("/"), R.last)),
    O.chain(referenceFromSegment(includeStructures)),
  );

const referenceFromSegment = (includeStructures: boolean) => (ref: string) =>
  F.pipe(
    // Structures
    O.some(ref),
    O.filter(() => includeStructures),
    O.filter((ref) => !excludeR.test(ref)),
    O.map((ref) => ref.replace(/^.*-object-/, "")),
    // Misc clean up
    O.map((ref) => ref.replace(/^data-models-/, "")),
    O.map((ref) => ref.replace(/identify-identify/, "identify")),
    O.map(identifier),

    // Enum
    O.alt(() =>
      F.pipe(
        O.some(ref),
        O.filter((ref) => Enums.enumSuffixR.test(ref)),
        O.map((ref) => ref.replace(/^.*-object-/, "")),
        O.map((ref) => ref.replace(/^data-models-/, "")),
        O.map((ref) => ref.replace(/^update-status-/, "")),
        O.map((ref) => ref.replace(/^buttons-/, "")),
        O.map(Enums.identifier),
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
        O.map(Common.maybeRename),
      ),
    ),

    // Everything else
    O.alt(() =>
      F.pipe(
        O.some(ref),
        O.filter(() => includeStructures),
        O.map(Common.typeify),
        O.map(Common.maybeRename),
      ),
    ),
  );

export const identifierOrReference = (
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
        O.chain(() => referenceFromLinks($description.find("a"))),
      ),
    ),

    // Maybe use reference for enumerable types
    O.alt(() =>
      F.pipe(
        O.some(identifier),
        O.filter((id) => ["string", "integer"].includes(id)),
        O.chain(() => referenceFromLinks($description.find("a"), false)),
      ),
    ),

    O.getOrElse(() => identifier.replace(/arrayof/, "")),
  );

import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as R from "remeda";
import S from "string";
import * as Common from "./common";
import * as Enums from "./enums";

export const fromDocument = ($: Cheerio.CheerioAPI): Structure[] =>
  $("h6")
    .filter((_, h6) => /\b(structure|properties)$/i.test($(h6).text().trim()))
    .filter((_, el) => Common.hasTable($(el)))
    .map((_, h6) => fromHeader($)($(h6)))
    .toArray();

export const fromHeader =
  ($: Cheerio.CheerioAPI) => ($h6: Cheerio.Cheerio<Cheerio.Element>) => {
    const $table = $h6.next();

    return {
      identifier: identifier($h6.text()),
      fields: fields($)($table),
    };
  };

export type Structure = ReturnType<ReturnType<typeof fromHeader>>;

export const identifier = (heading: string) =>
  F.pipe(
    heading.replace(/\s+structure$/i, "").trim(),
    (title) => S(title).slugify().capitalize().camelize().s,
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
  const identifier = name.replace(/\?/g, "");
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
  const array = /list|array/i.test(text);

  const rawIdentifier = sanitizeIdentifier(text);
  const relation = referenceFromLinks($type.find("a"));

  return {
    identifier: identifierOrReference(rawIdentifier, relation, $description),
    nullable,
    array,
  };
};

const sanitizeIdentifier = (text: string) =>
  F.pipe(
    O.some(text),

    // Snowflake?
    O.filter((text) => /\b(snowflake|object id)/.test(text)),
    O.map(() => "snowflake"),

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

    // Normal identifier
    O.getOrElse(() => text.replace(/[^A-z]/g, "")),
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

export const referenceFromLink = (
  $link: Cheerio.Cheerio<Cheerio.Element>,
  includeStructures = true,
) =>
  F.pipe(
    O.some($link),
    O.chainNullableK(($link) => $link.attr("href")),
    O.chainNullableK(F.flow((href) => href.split("/"), R.last)),

    O.chain((ref) =>
      F.pipe(
        // Structures
        O.some(ref),
        O.filter(() => includeStructures),
        O.filter((ref) => /-(structure|properties)$/.test(ref)),
        O.map((ref) => ref.replace(/^.*-object-/, "")),
        O.map((ref) => ref.replace(/-structure$/, "")),
        // Misc clean up
        O.map((ref) => ref.replace(/identify-identify/, "identify")),
        O.map(Common.typeify),

        // Enum
        O.alt(() =>
          F.pipe(
            O.some(ref),
            O.filter((ref) =>
              /-(behaviors|enum|features|level|modes|tier|types)$/.test(ref),
            ),
            O.map((ref) => ref.replace(/^.*-object-/, "")),
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
          ),
        ),

        // Everything else
        O.alt(() =>
          F.pipe(
            O.some(ref),
            O.filter(() => includeStructures),
            O.map(Common.typeify),
          ),
        ),
      ),
    ),
  );

export const identifierOrReference = (
  identifier: string,
  relation: O.Option<string>,
  $description: Cheerio.Cheerio<Cheerio.Element>,
): string =>
  F.pipe(
    // Only use relation if it isn't a snowflake
    O.some(identifier),
    O.filter((id) => !["snowflake"].includes(id)),
    O.chain(() => relation),

    // Maybe use reference for arrays or objects
    O.alt(() =>
      F.pipe(
        O.some(identifier),
        O.filter((id) => /array|list|object/.test(id)),
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

    O.getOrElse(() => identifier),
  );

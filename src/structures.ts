import * as Cheerio from "cheerio";
import S from "string";
import * as F from "fp-ts/function";
import * as R from "remeda";
import * as O from "fp-ts/Option";

export const fromDocument = ($: Cheerio.CheerioAPI) =>
  $("h6")
    .filter((_, h6) => /\bstructure\b/i.test($(h6).text()))
    .map((_, h6) => {
      const $h6 = $(h6);
      const $table = $h6.next();

      return {
        identifier: identifier($h6.text()),
        fields: fields($)($table),
      };
    })
    .toArray();

export const identifier = (heading: string) =>
  F.pipe(
    heading.replace(/\s+structure\b/i, "").trim(),
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
  const name = $name.text().replace(/\*/g, "");
  const identifier = name.replace(/\?/g, "");
  const optional = /\?$/.test(name);

  return {
    name: identifier,
    optional,
    type: type($type, $description),
    description: $description.text(),
    descriptionHTML: $description.html(),
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
    html: $type.html(),
  };
};

const sanitizeIdentifier = (text: string) =>
  F.pipe(
    O.some(text),

    // Snowflake?
    O.filter((text) => /\bsnowflake/.test(text)),
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
        O.fromNullable(text.match(/^int/)),
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
        O.filter((ref) => /-structure$/.test(ref)),
        O.map((ref) => ref.replace(/^.*-object-/, "")),
        O.map((ref) => ref.replace(/-structure$/, "")),

        // Types
        O.alt(() =>
          F.pipe(
            O.some(ref),
            O.filter((ref) => /-types$/.test(ref)),
            O.map((ref) => ref.replace(/^.*-object-/, "")),
          ),
        ),

        // Enums
        O.alt(() =>
          F.pipe(
            O.some(ref),
            O.filter((ref) => /-enum$/.test(ref)),
            O.map((ref) => ref.replace(/^.*-object-/, "")),
          ),
        ),

        // Flags
        O.alt(() =>
          F.pipe(
            O.some(ref),
            O.filter((ref) => /-flags$/.test(ref)),
            O.map((ref) => ref.replace(/^.*-object-/, "")),
            // Special cases
            O.map((ref) =>
              ref.replace(/^application-application-/, "application"),
            ),
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
          ),
        ),

        // Everything else
        O.alt(() =>
          F.pipe(
            O.some(ref),
            O.filter(() => includeStructures),
          ),
        ),

        // Turn into identifier
        O.map((id) => S(id).capitalize().camelize().s),
      ),
    ),
  );

export const identifierOrReference = (
  identifier: string,
  relation: O.Option<string>,
  $description: Cheerio.Cheerio<Cheerio.Element>,
): string =>
  F.pipe(
    relation,

    // Maybe use reference for arrays
    O.alt(() =>
      F.pipe(
        O.some(identifier),
        O.filter((id) => ["array"].includes(id)),
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

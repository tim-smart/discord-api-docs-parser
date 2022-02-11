import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as R from "remeda";
import * as Common from "./common";

const flagSuffixR = /\bflags$/i;

export const fromDocument = ($: Cheerio.CheerioAPI, file: string): Flags[] =>
  $("h6")
    .filter((_, h6) => flagSuffixR.test($(h6).text()))
    .filter((_, el) => Common.hasTable($(el)))
    .map((_, h6) => fromHeader($, file)($(h6)))
    .toArray();

export const fromHeader =
  ($: Cheerio.CheerioAPI, file: string) =>
  ($h6: Cheerio.Cheerio<Cheerio.Element>) => {
    const $table = Common.table($h6);

    return {
      identifier: identifier(file)($h6.text()),
      values: values($)($table),
    };
  };

export type Flags = ReturnType<ReturnType<typeof fromHeader>>;

export const identifier = (file: string) => (heading: string) =>
  F.pipe(
    heading.trim(),
    (text) => text.replace(/bitwise/i, ""),
    Common.typeify,
    Common.maybeRename(file),
  );

export const values =
  ($: Cheerio.CheerioAPI) => ($table: Cheerio.Cheerio<Cheerio.Element>) => {
    const $th = $table.find("th");
    const headerCount = $table.find("th").length;
    const valueIndex = F.pipe(
      Common.columnIndex(["value", "integer", "id"])($)($th),
      O.getOrElse(() => 0),
    );
    const nameIndex = valueIndex === 0 ? 1 : 0;

    return F.pipe(
      $table
        .find("td")
        .map((_, td) => $(td))
        .toArray(),
      R.chunk(headerCount),
      R.map((values) =>
        value(values[nameIndex], values[valueIndex], values[2]),
      ),
      R.filter(O.isSome),
      R.map((value) => value.value),
    );
  };

export const value = (
  $name: Cheerio.Cheerio<Cheerio.Element>,
  $value: Cheerio.Cheerio<Cheerio.Element>,
  $description?: Cheerio.Cheerio<Cheerio.Element>,
) => {
  const name = Common.constantify($name.text());
  const value = $value.text();
  const bigint = /x/.test(value);

  return F.pipe(
    O.fromNullable(value.match(/(\d+) << (\d+)/)),
    O.map((matches) => ({
      name,
      bigint,
      left: matches[1],
      right: matches[2],
      description: F.pipe(
        O.fromNullable($description),
        O.map(($d) => $d.text()),
      ),
    })),
  );
};

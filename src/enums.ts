import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as R from "remeda";
import * as Common from "./common";

export const enumSuffixR =
  /(behaviors|enum|events|features|level|modes|opcodes|tier|types?)$/i;

export const fromDocument = ($: Cheerio.CheerioAPI): Enum[] =>
  $("h2, h6")
    .filter((_, h6) => enumSuffixR.test($(h6).text()))
    .filter((_, el) => Common.hasTable($(el)))
    .map((_, h6) => fromHeader($)($(h6)))
    .toArray();

export const fromHeader =
  ($: Cheerio.CheerioAPI) => ($h6: Cheerio.Cheerio<Cheerio.Element>) => {
    const $table = Common.table($h6);

    return {
      identifier: identifier($h6.text()),
      values: values($)($table),
    };
  };

export type Enum = ReturnType<ReturnType<typeof fromHeader>>;

export const identifier = (heading: string) =>
  F.pipe(
    heading.trim(),
    (heading) => heading.replace(/enum/i, ""),
    Common.typeify,
    Common.maybeRename,
  );

const findValueIndex = Common.columnIndex(["value", "integer", "id", "code"]);
const findExplainationIndex = Common.columnIndex(["explaination"]);
const findDescriptionIndex = Common.columnIndex(["description"]);

export const values =
  ($: Cheerio.CheerioAPI) => ($table: Cheerio.Cheerio<Cheerio.Element>) => {
    const $th = $table.find("th");
    const headerCount = $table.find("th").length;
    const valueIndex = findValueIndex($)($th);
    const descriptionIndex = F.pipe(
      findExplainationIndex($)($th),
      O.alt(() => findDescriptionIndex($)($th)),
    );

    const nonNameIndexes = [valueIndex, descriptionIndex]
      .filter(O.isSome)
      .map((i) => i.value);
    const nameIndex = [...Array(headerCount).keys()].find(
      (i) => !nonNameIndexes.includes(i),
    )!;

    return F.pipe(
      $table
        .find("td")
        .map((_, td) => $(td))
        .toArray(),
      R.chunk(headerCount),
      R.map((columns) =>
        value(
          columns[nameIndex],
          F.pipe(
            valueIndex,
            O.map((i) => columns[i]),
          ),
          F.pipe(
            descriptionIndex,
            O.map((i) => columns[i]),
          ),
        ),
      ),
    );
  };

export const value = (
  $name: Cheerio.Cheerio<Cheerio.Element>,
  $value: O.Option<Cheerio.Cheerio<Cheerio.Element>>,
  $description: O.Option<Cheerio.Cheerio<Cheerio.Element>>,
) => {
  const name = Common.constantify($name.text());
  const value = F.pipe(
    $value,
    O.map(($el) => $el.text()),
    O.getOrElse(() => `"${$name.text().trim()}"`),
  );

  return {
    name,
    value,
    description: F.pipe(
      $description,
      O.map(($d) => $d.text()),
    ),
  };
};

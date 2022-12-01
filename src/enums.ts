import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as R from "remeda";
import * as Common from "./common";
import * as Arr from "fp-ts/Array";

export const enumSuffixR =
  /(behaviors|enum|events|features|level|modes|opcodes|scopes|status|styles|tier|types?)$/i;

export const enumExcludeR = /(send events|receive events)$/i;

export const fromDocument = ($: Cheerio.CheerioAPI, file: string): Enum[] =>
  $("h2, h6")
    .filter((_, h6) => enumSuffixR.test($(h6).text()))
    .filter((_, h6) => !enumExcludeR.test($(h6).text()))
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

export type Enum = ReturnType<ReturnType<typeof fromHeader>>;

export const identifier = (file: string) => (heading: string) =>
  F.pipe(
    heading.trim(),
    (heading) => heading.replace(/enum/i, ""),
    Common.typeify,
    Common.maybeRename(file),
  );

const findValueIndex = Common.columnIndex(["id", "value", "integer", "code"]);
const findSecondaryValueIndex = Common.columnIndex(["type"]);
const findNameIndex = Common.columnIndex(["name"]);
const findExplainationIndex = Common.columnIndex(["explaination"]);
const findDescriptionIndex = Common.columnIndex(["description"]);

export const values =
  ($: Cheerio.CheerioAPI) => ($table: Cheerio.Cheerio<Cheerio.Element>) => {
    const $th = $table.find("th");
    const headerCount = $table.find("th").length;
    const valueIndex = F.pipe(
      findValueIndex($)($th),
      O.alt(() => findSecondaryValueIndex($)($th)),
    );
    const descriptionIndex = F.pipe(
      findExplainationIndex($)($th),
      O.alt(() => findDescriptionIndex($)($th)),
    );

    const nonNameIndexes = [valueIndex, descriptionIndex]
      .filter(O.isSome)
      .map((i) => i.value);

    const unusedIndex = F.pipe(
      [...Array(headerCount).keys()],
      Arr.findFirst((i) => !nonNameIndexes.includes(i)),
    );
    const nameIndex = F.pipe(
      findNameIndex($)($th),
      O.alt(() => unusedIndex),
      O.getOrElse(() => 0),
    );

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
    O.getOrElse(() => $name.text().trim()),
    (s) => s.replaceAll('"', ""),
    (val) => (/^\d+$/.test(val) ? +val : val),
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

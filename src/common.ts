import * as Cheerio from "cheerio";
import S from "string";
import * as F from "fp-ts/function";
import * as Arr from "fp-ts/Array";

export const hasTable = ($el: Cheerio.Cheerio<Cheerio.Element>) => {
  return $el.next().is("table");
};

export const typeify = (input: string) =>
  S(input).slugify().capitalize().camelize().s;

export const constantify = (input: string) =>
  S(input.replace(/[^A-z1-9 ]/, ""))
    .slugify()
    .underscore()
    .s.toUpperCase();

export const columnIndex = (labels: string[]) => {
  const labelsR = new RegExp(`\\b(${labels.join("|")})\\b`, "i");

  return ($: Cheerio.CheerioAPI) => ($th: Cheerio.Cheerio<Cheerio.Element>) =>
    F.pipe(
      $th.map((_, el) => $(el).text()).toArray(),
      Arr.findIndex((text) => labelsR.test(text)),
    );
};

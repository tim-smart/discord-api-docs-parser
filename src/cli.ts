import Yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as Parser from "./main";
import * as TS from "./langs/typescript";

const LANGS: { [lang: string]: Parser.Generator } = {
  typescript: TS.generate,
};

const argv = Yargs(hideBin(process.argv))
  .option("lang", {
    alias: "l",
    type: "string",
    demandOption: true,
  })
  .option("lang-options", {
    alias: "o",
    type: "array",
    default: [],
  })
  .positional("api-docs-path", {
    type: "string",
    demandOption: true,
  }).argv;

Promise.resolve(argv)
  .then((argv) => {
    const generate = LANGS[argv.lang];
    const langOptions = argv["lang-options"]
      .map((o: string) => o.split("="))
      .filter((o) => o.length === 2)
      .reduce<Record<string, string>>(
        (acc, [key, value]) => ({
          ...acc,
          [key]: value,
        }),
        {},
      );

    if (!generate) {
      throw new Error(
        `${argv.lang} is not a valid language. Options include: ${Object.keys(
          LANGS,
        )}`,
      );
    }

    return generate({
      result: Parser.parse(argv._[0] as string),
      langOptions,
    });
  })
  .then(console.log);

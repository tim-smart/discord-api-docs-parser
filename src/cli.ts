import Yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as Parser from "./main";
import * as TS from "./langs/typescript";

type Generator = (result: Parser.ParseResult) => Promise<string>;

const LANGS: { [lang: string]: Generator } = {
  typescript: TS.generate,
};

const argv = Yargs(hideBin(process.argv))
  .option("lang", {
    alias: "l",
    type: "string",
    demandOption: true,
  })
  .positional("api-docs-path", {
    type: "string",
    demandOption: true,
  }).argv;

Promise.resolve(argv)
  .then((argv) => {
    const generate = LANGS[argv.lang];

    if (!generate) {
      throw new Error(
        `${argv.lang} is not a valid language. Options include: ${Object.keys(
          LANGS,
        )}`,
      );
    }

    return generate(Parser.parse(argv._[0] as string));
  })
  .then(console.log);

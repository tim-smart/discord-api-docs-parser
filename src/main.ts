import * as Cheerio from "cheerio";
import * as FS from "fs/promises";
import marked from "marked";
import * as Path from "path";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import * as Additional from "./additional";
import * as Endpoints from "./endpoints";
import * as Enums from "./enums";
import * as Flags from "./flags";
import { generate } from "./langs/typescript/generate";
import * as Structures from "./structures";
import * as FSU from "./utils/fs";
import * as Maps from "./maps";

const parseMarkdown = (src: string) =>
  Cheerio.load(marked(src, { sanitize: false }));

export const parse = (repoPath: string) => {
  const API_REPO_PATH = Path.resolve(repoPath);
  const API_DOCS_PATH = Path.join(API_REPO_PATH, "docs");

  const docs$ = FSU.files$(API_DOCS_PATH).pipe(
    RxO.filter((file) => Path.extname(file) === ".md"),

    RxO.flatMap((file) =>
      Rx.zip(
        Rx.of(Path.relative(API_DOCS_PATH, file)),
        FS.readFile(file).then((blob) => {
          const markdown = blob.toString();
          return [parseMarkdown(markdown), markdown] as const;
        }),
      ),
    ),

    RxO.share(),
  );

  const structures$ = Rx.merge(
    Rx.from(Additional.structures()),
    docs$.pipe(
      RxO.filter(([file]) =>
        /^(interactions|resources|topics\/(gateway|permissions|teams))/i.test(
          file,
        ),
      ),
      RxO.flatMap(([_file, [$]]) => Structures.fromDocument($)),
    ),
  );

  const flags$ = docs$.pipe(
    RxO.filter(([file]) =>
      /^(interactions|resources|topics\/(gateway|permissions|teams|opcodes))/i.test(
        file,
      ),
    ),
    RxO.flatMap(([_file, [$]]) => Flags.fromDocument($)),
  );

  const enums$ = docs$.pipe(
    RxO.filter(([file]) =>
      /^(interactions|resources|topics\/(gateway|permissions|teams|opcodes))/i.test(
        file,
      ),
    ),
    RxO.flatMap(([_file, [$]]) => Enums.fromDocument($)),
  );

  const endpoints$ = docs$.pipe(
    RxO.filter(([file]) =>
      /^(interactions|resources|topics\/(gateway|permissions|teams|opcodes))/i.test(
        file,
      ),
    ),
    RxO.flatMap(([_file, [_, md]]) => Endpoints.fromDocument(md)),
  );

  const maps$ = Rx.from(Maps.generate());

  return {
    endpoints$,
    enums$,
    flags$,
    maps$,
    structures$,
  };
};

export type ParseResult = ReturnType<typeof parse>;

generate(parse(process.argv[2]));

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
import { generate } from "./langs/typescript";
import * as Structures from "./structures";
import * as FSU from "./utils/fs";
import * as Maps from "./maps";
import * as Blacklist from "./blacklist";
import * as Gateway from "./gateway";
import * as O from "fp-ts/Option";
import * as Aliases from "./aliases";

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

  const filteredDocs$ = docs$.pipe(
    RxO.filter(([file]) =>
      /^(interactions|resources|topics\/(gateway|permissions|teams|opcodes))/i.test(
        file,
      ),
    ),
  );

  const gatewayDocs$ = docs$.pipe(
    RxO.filter(([file]) => /^topics\/gateway/i.test(file)),
  );

  const gateway$ = gatewayDocs$.pipe(
    RxO.flatMap(([_file, [$]]) => Gateway.fromDocument($)),
  );

  const endpoints$ = filteredDocs$.pipe(
    RxO.flatMap(([_file, [_, md]]) => Endpoints.fromDocument(md)),
  );

  const structures$ = Rx.merge(
    Rx.from(Additional.structures()),
    filteredDocs$.pipe(
      RxO.flatMap(([_file, [$]]) => Structures.fromDocument($)),
      RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
    ),
    endpoints$.pipe(
      RxO.map(({ params }) => params),
      RxO.filter(O.isSome),
      RxO.map((params) => params.value),
      RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
    ),
  ).pipe(RxO.distinct(({ identifier }) => identifier));

  const flags$ = filteredDocs$.pipe(
    RxO.flatMap(([_file, [$]]) => Flags.fromDocument($)),
    RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
  );

  const enums$ = filteredDocs$.pipe(
    RxO.flatMap(([_file, [$]]) => Enums.fromDocument($)),
    RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
  );

  const maps$ = Rx.from(Maps.generate());

  const aliases$ = Rx.merge(
    Rx.from(Aliases.list),
    gatewayDocs$.pipe(
      RxO.flatMap(([_file, [_, md]]) => Gateway.events(md)),
      RxO.map(
        ({ identifier, payload }) =>
          [identifier, [payload]] as [string, string[]],
      ),
    ),
  ).pipe(RxO.distinct(([id]) => id));

  return {
    aliases$,
    endpoints$,
    enums$,
    flags$,
    gateway$,
    maps$,
    structures$,
  };
};

export type ParseResult = ReturnType<typeof parse>;

generate(parse(process.argv[2]));

import * as Cheerio from "cheerio";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as FS from "fs/promises";
import marked from "marked";
import * as Path from "path";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import * as Additional from "./additional";
import * as Aliases from "./aliases";
import * as Blacklist from "./blacklist";
import * as Endpoints from "./endpoints";
import * as Enums from "./enums";
import * as Flags from "./flags";
import * as Gateway from "./gateway";
import * as Structures from "./structures";
import * as FSU from "./utils/fs";

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
      /^(interactions|resources|topics\/(gateway|oauth2|permissions|teams|opcodes))/i.test(
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
    RxO.flatMap(([file, [_, md]]) => Endpoints.fromDocument(md, file)),
    RxO.toArray(),
    RxO.flatMap((endpoints) =>
      endpoints.flatMap((endpoint) =>
        F.pipe(
          endpoint.response,
          O.filter((_) => _.alias === true),
          O.fold(
            () => [endpoint],
            (response) => {
              const alias = endpoints.find(
                (_) => _.route === response.identifier,
              );
              return alias ? [{ ...alias, route: endpoint.route }] : [];
            },
          ),
        ),
      ),
    ),
  );

  const structures$ = Rx.merge(
    Rx.from(Additional.structures()),

    filteredDocs$.pipe(
      RxO.flatMap(([file, [$]]) => Structures.fromDocument($, { file })),
      RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
    ),

    endpoints$.pipe(
      RxO.flatMap(({ params, response }) => [
        F.pipe(
          params,
          O.map(({ structures }) => structures),
        ),
        F.pipe(
          response,
          O.map(({ structures }) => structures),
        ),
      ]),
      RxO.filter(O.isSome),
      RxO.flatMap((params) => params.value),
      RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
    ),
  ).pipe(
    RxO.filter(({ fields }) => fields.length > 0),
    RxO.distinct(({ identifier }) => identifier),
  );

  const flags$ = Rx.merge(
    filteredDocs$.pipe(
      RxO.flatMap(([file, [$]]) => Flags.fromDocument($, file)),
      RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
    ),
    gatewayDocs$.pipe(RxO.flatMap(([_file, [$]]) => Gateway.intents($))),
  );

  const enums$ = filteredDocs$.pipe(
    RxO.flatMap(([file, [$]]) => Enums.fromDocument($, file)),
    RxO.filter(({ identifier }) => !Blacklist.list.includes(identifier)),
  );

  const aliases$ = Rx.merge(
    Rx.from(Aliases.list),
    gatewayDocs$.pipe(
      RxO.flatMap(([_file, [_, md]]) => Gateway.events(md)),
      RxO.map(
        ({ identifier, payload }): Aliases.Alias => ({
          identifier,
          nullable: false,
          types: [payload],
        }),
      ),
    ),
    endpoints$.pipe(
      RxO.flatMap(({ params, response }) => [params, response]),
      RxO.filter(O.isSome),
      RxO.map((p) => p.value),
      RxO.filter(({ structures }) => structures.length > 1),
      RxO.map(
        ({ structures, identifier }): Aliases.Alias => ({
          identifier,
          nullable: false,
          array: false,
          combinator: "or",
          types: structures.map((s) => s.identifier),
        }),
      ),
    ),
  ).pipe(
    RxO.filter(
      ({ identifier }) => Blacklist.aliases.includes(identifier) === false,
    ),
    RxO.distinct(({ identifier }) => identifier),
  );

  return {
    aliases$,
    endpoints$,
    enums$,
    flags$,
    gateway$,
    structures$,
  };
};

export type ParseResult = ReturnType<typeof parse>;
export type Generator = (opts: {
  result: ParseResult;
  langOptions: Record<string, string>;
}) => Promise<string>;

import * as Cheerio from "cheerio";
import marked from "marked";
import * as Path from "path";
import * as FSU from "./utils/fs";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import * as FS from "fs/promises";
import * as Structures from "./structures";

const parseMarkdown = (src: string) =>
  Cheerio.load(marked(src, { sanitize: false }));

const API_REPO_PATH = Path.resolve(process.argv[2]);
const API_DOCS_PATH = Path.join(API_REPO_PATH, "docs");

const docs$ = FSU.files$(API_DOCS_PATH).pipe(
  RxO.filter((file) => Path.extname(file) === ".md"),

  RxO.flatMap((file) =>
    Rx.zip(
      Rx.of(Path.relative(API_DOCS_PATH, file)),
      FS.readFile(file).then((blob) => parseMarkdown(blob.toString())),
    ),
  ),

  RxO.share(),
);

docs$
  .pipe(
    RxO.filter(([file]) => file.startsWith("resources")),
    RxO.flatMap(([file, $]) =>
      Structures.fromDocument($).map((s) => ({
        ...s,
        file,
      })),
    ),
    // RxO.filter((s) => s.identifier === "AllowedMentions"),
    // RxO.map((s) => [s.file, s.identifier]),
    RxO.toArray(),
  )
  // .subscribe();
  .subscribe((structure) => console.log(JSON.stringify(structure)));

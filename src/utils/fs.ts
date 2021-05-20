import * as Rx from "rxjs";
import * as RxOp from "rxjs/operators";
import { promises as fs } from "fs";

const glob = require("glob-to-regexp");

export function files$(
  dir: string,
  opts: {
    include?: string;
    exclude?: string;
  } = {},
): Rx.Observable<string> {
  const { include, exclude } = opts;
  const includeRegExp = include ? glob(include, { globstar: true }) : undefined;
  const excludeRegExp = exclude ? glob(exclude, { globstar: true }) : undefined;

  return Rx.from(fs.readdir(dir)).pipe(
    RxOp.flatMap((f) => f),
    RxOp.filter((f) => !f.startsWith(".")),

    RxOp.filter((f) => (include ? includeRegExp.test(f) : true)),
    RxOp.filter((f) => (exclude ? !excludeRegExp.test(f) : true)),

    RxOp.flatMap((file) =>
      Rx.from(fs.stat(`${dir}/${file}`)).pipe(
        RxOp.map((sf) => ({ file, isDir: sf.isDirectory() })),
      ),
    ),
    RxOp.flatMap((f) =>
      f.isDir ? files$(`${dir}/${f.file}`, opts) : Rx.of(`${dir}/${f.file}`),
    ),
  );
}

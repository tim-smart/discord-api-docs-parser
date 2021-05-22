import { ParseResult } from "../../main";
import { Structure } from "../../structures";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import { Enum } from "../../enums";
import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import { Flags } from "../../flags";
import * as Fs from "fs/promises";
import * as Path from "path";

export const generate = ({ structures$, enums$, flags$ }: ParseResult) => {
  Rx.merge(
    Rx.of(snowflake()),
    Rx.from(
      Fs.readFile(Path.join(__dirname, "polyfill.txt"), { encoding: "utf8" }),
    ),
    structures$.pipe(RxO.map(structure)),
    enums$.pipe(RxO.map(enumerable)),
    flags$.pipe(RxO.map(flags)),
  ).subscribe(console.log);
};

const snowflake = () => `export type Snowflake = \`\${bigint}\``;

const structure = (s: Structure) => {
  const fields = s.fields.map(structureField).join("\n");

  return `export interface ${s.identifier} {
    ${fields}
  }`;
};

const structureField = ({
  name,
  optional,
  type,
  description,
}: Structure["fields"][0]) => {
  return `/** ${description} */
    "${name}"${optional ? "?" : ""}: ${typeIdentifier(type.identifier)}${
    type.array ? "[]" : ""
  }${type.nullable ? " | null" : ""};`;
};

const typeIdentifier = (name: string) => {
  switch (name) {
    case "snowflake":
      return "Snowflake";
    case "integer":
    case "float":
      return "number";
    case "object":
    case "mixed":
    case "array":
      return "any";
    case "timestamp":
      return "string";
  }

  return name;
};

const enumerable = (e: Enum) => `export enum ${e.identifier} {
  ${e.values.map(enumerableValue).join("\n")}
};`;

const enumerableValue = ({ name, value, description }: Enum["values"][0]) => {
  const comment = F.pipe(
    description,
    O.map((d) => `/** ${d} */\n`),
    O.getOrElse(() => ""),
  );
  return `${comment}${name} = ${value},`;
};

const flags = (f: Flags) => `export const ${f.identifier} = {
  ${f.values.map(flagsValue).join("\n")}
} as const;`;

const flagsValue = ({
  name,
  bigint,
  left,
  right,
  description,
}: Flags["values"][0]) => {
  const comment = F.pipe(
    description,
    O.map((d) => `/** ${d} */\n`),
    O.getOrElse(() => ""),
  );
  left = bigint ? `BigInt(${left})` : left;
  right = bigint ? `BigInt(${right})` : right;

  return `${comment}${name}: ${left} << ${right},`;
};

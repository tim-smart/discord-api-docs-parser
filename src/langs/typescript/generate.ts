import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import { Enum } from "../../enums";
import { Flags } from "../../flags";
import { ParseResult } from "../../main";
import { IDMap } from "../../maps";
import { Structure } from "../../structures";

export const generate = ({
  endpoints$,
  structures$,
  enums$,
  flags$,
  maps$,
}: ParseResult) => {
  Rx.merge(
    Rx.of(snowflake()),

    structures$.pipe(RxO.map(structure)),
    endpoints$.pipe(
      RxO.map(({ params }) => params),
      RxO.filter(O.isSome),
      RxO.map((p) => structure(p.value)),
    ),

    enums$.pipe(RxO.map(enumerable)),
    flags$.pipe(RxO.map(flags)),
    maps$.pipe(RxO.map(map)),
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
    case "dict":
      return "Record<string, string>";
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

const map = ({ identifier, key, value }: IDMap) =>
  `export type ${identifier} = Record<${typeIdentifier(key)}, ${typeIdentifier(
    value,
  )}>;`;

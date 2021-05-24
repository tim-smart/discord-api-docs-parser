import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import { Endpoint } from "../../endpoints";
import { Enum } from "../../enums";
import { Flags } from "../../flags";
import { ParseResult } from "../../main";
import { IDMap } from "../../maps";
import { Structure } from "../../structures";
import * as Common from "../../common";
import Prettier from "prettier";

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

    // Endpoint params
    endpoints$.pipe(
      RxO.map(({ params }) => params),
      RxO.filter(O.isSome),
      RxO.map((p) => structure(p.value)),
    ),

    // Endpoint routes
    endpoints$.pipe(
      RxO.toArray(),
      RxO.map((routes) => endpoints(routes)),
    ),

    enums$.pipe(RxO.map(enumerable)),
    flags$.pipe(RxO.map(flags)),
    maps$.pipe(RxO.map(map)),
  )
    .pipe(
      RxO.toArray(),
      RxO.map((chunks) => chunks.join("\n")),
      RxO.map((source) => Prettier.format(source, { parser: "typescript" })),
    )
    .subscribe(console.log);
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

const endpoints = (routes: Endpoint[]) => {
  const props = routes.map(endpoint).join("\n");

  return `export type Route<P, O> = {
      method: string;
      url: string;
      params?: P;
      options?: O;
    };

    export function createRoutes<O = any>(fetch: <R, P, O>(route: Route<P, O>) => Promise<R>) {
      return {
        ${props}
      };
    }

    export type Routes = ReturnType<typeof createRoutes>;`;
};

const endpoint = ({
  route,
  url,
  description,
  method,
  params,
  response,
}: Endpoint) => {
  const urlParams = F.pipe(
    O.fromNullable(url.match(/\{.*?\}/g)),
    O.map((params) =>
      params
        .map((param) => param.replace(/[{}]/, ""))
        .map((param) => Common.typeify(param, false)),
    ),
    O.map((params) => params.join(": string, ") + ": string, "),
    O.getOrElse(() => ""),
  );
  const urlTemplate = url.replace(
    /\{(.*?)\}/,
    (_, param) => `\${${Common.typeify(param, false)}}`,
  );
  const paramsType = F.pipe(
    params,
    O.map((p) => p.identifier),
    O.map((p) => `Partial<${p}>`),
    O.getOrElse(() => "any"),
  );
  const responseType = F.pipe(
    response,
    O.map(({ ref, array }) => {
      const refOrAny = F.pipe(
        ref,
        O.map(typeIdentifier),
        O.getOrElse(() => "any"),
      );
      return `${refOrAny}${array ? "[]" : ""}`;
    }),
    O.getOrElse(() => "any"),
  );

  const comment = F.pipe(
    description,
    O.map((d) => `/** ${d} */\n`),
    O.getOrElse(() => ""),
  );

  return `${comment}${route}: (${urlParams}params?: ${paramsType}, options?: O) => fetch<${responseType}, ${paramsType}, O>({
      method: "${method}",
      url: \`${urlTemplate}\`,
      params,
      options,
    }),`;
};

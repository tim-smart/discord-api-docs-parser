import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import { Endpoint } from "../endpoints";
import { Enum } from "../enums";
import { Flags } from "../flags";
import { ParseResult } from "../main";
import { Structure } from "../structures";
import { GatewaySection } from "../gateway";
import * as Common from "../common";
import Prettier from "prettier";
import { Alias } from "../aliases";

interface Chunk {
  identifier: string;
  source: string;
}

export const generate = ({
  endpoints$,
  structures$,
  enums$,
  flags$,
  gateway$,
  aliases$,
}: ParseResult) =>
  F.pipe(
    Rx.merge(
      Rx.of(snowflake()),
      Rx.of(gatewayPayload()),

      structures$.pipe(
        // Ignore GatewayPayload as we have provided our own with generics.
        RxO.filter(
          ({ identifier }) => !["GatewayPayload"].includes(identifier),
        ),
        RxO.map(structure),
      ),

      // Endpoint routes
      endpoints$.pipe(
        RxO.toArray(),
        RxO.flatMap((routes) => endpoints(routes)),
      ),

      enums$.pipe(RxO.map(enumerable)),
      flags$.pipe(RxO.map(flags)),
      gateway$.pipe(RxO.flatMap(gateway)),
      aliases$.pipe(RxO.map(alias)),
    ),
    RxO.toArray(),
    RxO.map((chunks) =>
      chunks
        .sort((a, b) => a.identifier.localeCompare(b.identifier))
        .map((c) => c.source)
        .join("\n"),
    ),
    RxO.map((source) => Prettier.format(source, { parser: "typescript" })),

    (ob) => Rx.lastValueFrom(ob),
  );

const snowflake = (): Chunk => ({
  identifier: "Snowflake",
  source: `export type Snowflake = \`\${bigint}\``,
});

const gatewayPayload = (): Chunk => ({
  identifier: "GatewayPayload",
  source: `export interface GatewayPayload<T = any | null> {
  /** opcode for the payload */
      op: GatewayOpcode;
    /** event data */
    d?: T;
  /** sequence number, used for resuming sessions and heartbeats */
      s?: number | null;
    /** the event name for this payload */
        t?: string | null;
}`,
});

const structure = (s: Structure): Chunk => {
  const fields = s.fields.map(structureField).join("\n");
  return {
    identifier: s.identifier,
    source: `export interface ${s.identifier} {
    ${fields}
  }`,
  };
};

const structureField = ({
  name,
  optional,
  type,
  description,
}: Structure["fields"][0]) => `/** ${description} */
  "${name}"${optional || type.nullable ? "?" : ""}: ${F.pipe(
  typeIdentifier(type.identifier),
  maybeSnowflakeMap(type.snowflakeMap),
)}${type.array ? "[]" : ""}${type.nullable ? " | null" : ""};`;

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

const maybeSnowflakeMap = (isMap: boolean) => (input: string) =>
  isMap ? `Record<Snowflake, ${input}>` : input;

const enumerable = (e: Enum): Chunk => ({
  identifier: e.identifier,
  source: `export enum ${e.identifier} {
  ${e.values.map(enumerableValue).join("\n")}
};`,
});

const enumerableValue = ({ name, value, description }: Enum["values"][0]) => {
  const comment = F.pipe(
    description,
    O.map((d) => `/** ${d} */\n`),
    O.getOrElse(() => ""),
  );
  return `${comment}${name} = ${value},`;
};

const flags = (f: Flags): Chunk => ({
  identifier: f.identifier,
  source: `export const ${f.identifier} = {
  ${f.values.map(flagsValue).join("\n")}
} as const;`,
});

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

const endpoints = (routes: Endpoint[]): Chunk[] => {
  const objects = routes.map(endpoint);
  const methods = objects.map(({ method }) => method).join("\n");
  const types = objects.map(({ type }) => type).join("\n");

  return [
    {
      identifier: "Route",
      source: `export type Route<P, O> = {
      method: string;
      url: string;
      params?: P;
      options?: O;
    };`,
    },
    {
      identifier: "Endpoints",
      source: `export interface Endpoints<O> {
      ${types}
    }`,
    },
    {
      identifier: "createRoutes",
      source: `export function createRoutes<O = any>(fetch: <R, P>(route: Route<P, O>) => Promise<R>): Endpoints<O> {
      return {
        ${methods}
      };
    }`,
    },
  ];
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
  );
  const urlParamsTyped = F.pipe(
    urlParams,
    O.map((params) => params.join(": string, ") + ": string, "),
    O.getOrElse(() => ""),
  );
  const urlParamsPlain = F.pipe(
    urlParams,
    O.map((params) => params.join(", ") + ", "),
    O.getOrElse(() => ""),
  );
  const urlTemplate = url.replace(
    /\{(.*?)\}/g,
    (_, param) => `\${${Common.typeify(param, false)}}`,
  );
  const paramsType = F.pipe(
    params,
    O.map(
      ({ identifier, array }) => `Partial<${identifier}${array ? "[]" : ""}>`,
    ),
  );
  const paramsArg = F.pipe(
    paramsType,
    O.map((type) => `params: ${type}, `),
    O.getOrElse(() => ""),
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

  return {
    method: `${route}: (${urlParamsPlain}${
      paramsArg ? "params, " : ""
    }options) => fetch({
      method: "${method}",
      url: \`${urlTemplate}\`,${paramsArg ? "\nparams," : ""}
      options,
    }),`,
    type: `${comment}${route}: (${urlParamsTyped}${paramsArg}options?: O) => Promise<${responseType}>;`,
  };
};

const gateway = ({ identifier, values }: GatewaySection): Chunk[] => {
  const plural = `${identifier}s`;
  const union = values.map(({ type }) => type).join(" | ");
  const props = values
    .map(({ name, type }) => `"${name}": ${type};`)
    .join("\n");

  return [
    {
      identifier,
      source: `export type ${identifier} = ${union};`,
    },
    {
      identifier: plural,
      source: `export interface ${plural} {
        ${props}
      }`,
    },
  ];
};

const alias = ({
  identifier,
  nullable,
  types,
  array = false,
  combinator = "and",
}: Alias): Chunk => {
  const op = combinator === "or" ? "|" : "&";
  const type = types.map(typeIdentifier).join(` ${op} `);
  return {
    identifier,
    source: `export type ${identifier} = (${type}${nullable ? " | null" : ""})${
      array ? "[]" : ""
    };`,
  };
};

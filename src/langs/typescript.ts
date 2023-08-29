import * as F from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as Rx from "rxjs";
import * as RxO from "rxjs/operators";
import { Alias } from "../aliases";
import * as Common from "../common";
import { Endpoint } from "../endpoints";
import { Enum } from "../enums";
import { Flags } from "../flags";
import { GatewaySection } from "../gateway";
import { Generator } from "../main";
import { Structure } from "../structures";

interface Chunk {
  identifier: string;
  source: string;
}

export const generate: Generator = ({
  result: { endpoints$, structures$, enums$, flags$, gateway$, aliases$ },
  langOptions: { imports = "", endpointReturnType = "Promise" },
}) =>
  F.pipe(
    Rx.merge(
      Rx.from(importChunks(imports)),

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
        RxO.map((routes) =>
          routes.sort((a, b) => a.route.localeCompare(b.route)),
        ),
        RxO.flatMap((routes) => endpoints(routes, endpointReturnType)),
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
    // RxO.map((source) => Prettier.format(source, { parser: "typescript" })),

    (ob) => Rx.lastValueFrom(ob),
  );

const importChunks = (s: string): Chunk[] =>
  s
    .split(",")
    .map((s) => s.split("|"))
    .filter((arr) => arr.length === 2)
    .map(([identifier, module]) => `import { ${identifier} } from "${module}"`)
    .map((source) => ({
      identifier: "__import",
      source,
    }));

const snowflake = (): Chunk => ({
  identifier: "Snowflake",
  source: `export type Snowflake = \`\${bigint}\``,
});

const gatewayPayload = (): Chunk => ({
  identifier: "GatewayPayload",
  source: `export interface GatewayPayload<T = any | null> {
  /** opcode for the payload */
  readonly op: GatewayOpcode;
  /** event data */
  readonly d?: T;
  /** sequence number, used for resuming sessions and heartbeats */
  readonly s?: number | null;
  /** the event name for this payload */
  readonly t?: string | null;
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
  readonly "${name}"${optional || type.nullable ? "?" : ""}: ${F.pipe(
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
  source: `export const ${e.identifier} = {
  ${e.values.map(enumerableValue).join("\n")}
} as const;
export type ${e.identifier} = typeof ${e.identifier}[keyof typeof ${
    e.identifier
  }];`,
});

const enumerableValue = ({ name, value, description }: Enum["values"][0]) => {
  const comment = F.pipe(
    description,
    O.map((d) => `/** ${d} */\n`),
    O.getOrElse(() => ""),
  );
  return `${comment}${name}: ${JSON.stringify(value)},`;
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

const endpoints = (routes: Endpoint[], returnType: string): Chunk[] => {
  const objects = routes.map(endpoint(returnType));
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
      source: `export function createRoutes<O = any>(fetch: <R, P>(route: Route<P, O>) => ${returnType}<R>): Endpoints<O> {
      return {
        ${methods}
      };
    }`,
    },
  ];
};

const endpoint =
  (returnType: string) =>
  ({ route, url, description, method, params, response }: Endpoint) => {
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
      O.map((type) => `params?: ${type}, `),
      O.getOrElse(() => ""),
    );
    const responseType = F.pipe(
      response,
      O.map(
        ({ identifier, array }) =>
          `${typeIdentifier(identifier)}${array ? "[]" : ""}`,
      ),
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
      type: `${comment}${route}: (${urlParamsTyped}${paramsArg}options?: O) => ${returnType}<${responseType}>;`,
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

import { Structure } from "./structures";

export const structures = (): Structure[] => [
  {
    identifier: "UnavailableGuild",
    fields: [
      {
        name: "id",
        optional: false,
        type: {
          identifier: "snowflake",
          nullable: false,
          array: false,
          snowflakeMap: false,
        },
        description: "",
      },
      {
        name: "unavailable",
        optional: false,
        type: {
          identifier: "boolean",
          nullable: false,
          array: false,
          snowflakeMap: false,
        },
        description: "",
      },
    ],
  },
  {
    identifier: "ActionRow",
    fields: [
      {
        name: "type",
        optional: false,
        type: {
          identifier: "ComponentType",
          nullable: false,
          array: false,
          snowflakeMap: false,
        },
        description: "component type",
      },
      {
        name: "components",
        optional: false,
        type: {
          identifier: "Component",
          nullable: false,
          array: true,
          snowflakeMap: false,
        },
        description: "a list of child components",
      },
    ],
  },
];

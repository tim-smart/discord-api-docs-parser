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
        },
        description: "",
      },
    ],
  },
];

import { Structure } from "./structures";

const locales = [
  { code: "da", name: "Danish" },
  { code: "de", name: "German" },
  { code: "en-GB", name: "English," },
  { code: "en-US", name: "English," },
  { code: "es-ES", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "hr", name: "Croatian" },
  { code: "it", name: "Italian" },
  { code: "lt", name: "Lithuanian" },
  { code: "hu", name: "Hungarian" },
  { code: "nl", name: "Dutch" },
  { code: "no", name: "Norwegian" },
  { code: "pl", name: "Polish" },
  { code: "pt-BR", name: "Portuguese, Brazilian" },
  { code: "ro", name: "Romanian, Romania" },
  { code: "fi", name: "Finnish" },
  { code: "sv-SE", name: "Swedish" },
  { code: "vi", name: "Vietnamese" },
  { code: "tr", name: "Turkish" },
  { code: "cs", name: "Czech" },
  { code: "el", name: "Greek" },
  { code: "bg", name: "Bulgarian" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "hi", name: "Hindi" },
  { code: "th", name: "Thai" },
  { code: "zh-CN", name: "Chinese, China" },
  { code: "ja", name: "Japanese" },
  { code: "zh-TW", name: "Chinese, Taiwan" },
  { code: "ko", name: "Korean" },
];

export const structures = (): Structure[] => [
  {
    identifier: "Locale",
    fields: locales.map(({ name, code }) => ({
      name: code,
      optional: true,
      type: {
        identifier: "string",
        nullable: false,
        array: false,
        snowflakeMap: false,
      },
      description: name,
    })),
  },
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

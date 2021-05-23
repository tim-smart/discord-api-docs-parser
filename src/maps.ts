export const generate = (): IDMap[] => [
  map("ChannelMap", "snowflake", "Channel"),
  map("MemberMap", "snowflake", "GuildMember"),
  map("RoleMap", "snowflake", "Role"),
  map("UserMap", "snowflake", "User"),
];

const map = (identifier: string, key: string, value: string) => ({
  identifier,
  key,
  value,
});

export type IDMap = ReturnType<typeof map>;

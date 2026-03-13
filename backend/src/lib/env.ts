type RequiredEnv = {
  DATABASE_URL: string;
};

export const getRequiredEnv = (): RequiredEnv => {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL || DATABASE_URL.trim().length === 0) {
    throw new Error("DATABASE_URL is required but was not provided");
  }

  return {
    DATABASE_URL,
  };
};

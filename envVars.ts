require("dotenv").config();

const { env } = process;

export const { BASE_URL, PORT, ENV, OPENAI_KEY } = env;

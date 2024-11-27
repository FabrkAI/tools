import { createApp } from "./createServer";
import { BASE_URL, PORT } from "./envVars";
import { createServer } from "http";

const app = createApp();

createServer(app).listen(PORT, () => {
  const baseUrl = `${BASE_URL}${PORT}`;
  console.log(`[Server]: Running at ${baseUrl}`);
});

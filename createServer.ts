import { urlencoded } from "body-parser";
import cors from "cors";
import express, { Express, Request, Response } from "express";
import toolRoutes from "./api/tool/tool.route";

export function createApp() {
  const app: Express = express();

  const corsOptions = {
    origin: "*",
  };
  app.use(cors(corsOptions));

  app.use(urlencoded({ extended: false }));

  app.use("/tool", toolRoutes);

  app.use("/", (req: Request, res: Response) => {
    res.send(
      "I'm the Fabrk AI tools server. Check out the docs at <a href='https://docs.fabrk.ai'>https://docs.fabrk.ai</a>"
    );
  });

  return app;
}

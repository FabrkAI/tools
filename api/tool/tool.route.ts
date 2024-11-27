import { Application, Router } from "express";
import { testTool } from "./tool.controller";

const toolRoutes = Router();

// Base route: /tool

toolRoutes.get("/test", testTool as any);

export default toolRoutes;

import { Router } from "express";
import { testChat } from "./chat.controller";

const chatRoutes = Router();

// Base route: /chat

chatRoutes.get("/test", testChat as any);

export default chatRoutes;

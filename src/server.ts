import dotenv from "dotenv";
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env.production" : ".env",
});
import mongoose from "mongoose";
import app from "./app";
import { createServer } from "http";
import { Server } from "socket.io";
import OrderService from "./models/Order.service";
import AuthService from "./models/Auth.service";

const PORT = process.env.PORT ?? 3001;
const orderService = new OrderService();

const SOCKET_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:4009",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:4009",
  "http://38.247.134.248",
  "http://38.247.134.248:3000",
  "http://38.247.134.248:3002",
  "http://38.247.134.248:4009",
  "http://38.247.134.248:3013",
  "http://38.247.134.248:3014",
  "http://38.247.134.248:4013",
  "https://38.247.134.248",
  "https://38.247.134.248:443",
];

let ioInstance: Server;

export function getIo(): Server {
  if (!ioInstance) {
    throw new Error("Socket.io instance not initialized yet!");
  }
  return ioInstance;
}

mongoose
  .connect(process.env.MONGO_URI as string, {})
  .then(() => {
    console.log("MongoDB connection succeed");

    const httpServer = createServer(app);

    ioInstance = new Server(httpServer, {
      cors: {
        origin: SOCKET_ALLOWED_ORIGINS,
        credentials: true,
      },
      transports: ["polling", "websocket"],
    });

    // Admin xonasiga faqat admin tokeni bilan ulaniladi (buyurtma xabarlari ochiq tarqalmasin)
    const socketAuth = new AuthService();
    ioInstance.use(async (socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      const member = await socketAuth.verifyAdminToken(token);
      if (!member) return next(new Error("unauthorized"));
      socket.data.exp = (member as { exp?: number }).exp;
      next();
    });

    ioInstance.on("connection", (socket) => {
      // Token muddati (har kuni ertalab) tugaganda ulanish ham uziladi
      const exp = Number(socket.data.exp);
      if (exp) {
        const ms = exp * 1000 - Date.now();
        const timer = setTimeout(() => socket.disconnect(true), Math.max(0, ms));
        socket.on("disconnect", () => clearTimeout(timer));
      }
      console.log(" Admin connected:", socket.id);
      socket.join("admins");
    });

    httpServer.listen(PORT, () => {
      console.info(`Server running on http://localhost:${PORT}`);
      setInterval(async () => {
        try {
          const data = await orderService.getAllOrdersPanel();
          ioInstance.to("admins").emit("panelOrders", data);
        } catch (e) {
          console.error("panelOrders emit error:", e);
        }
      }, 5000);
    });
  })
  .catch((err) => {
    console.log("ERROR on MongoDB connection:", err);
  });

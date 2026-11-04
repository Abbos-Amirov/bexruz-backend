import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import AuthService from "../models/Auth.service";
import OrderService from "../models/Order.service";
import TableService from "../models/Table.service";
import { getIo } from "../server";

/**
 * Afitsant ilovasi (mijoz sayti afitsantlar uchun):
 * umumiy PIN bilan kiriladi, token Authorization: Bearer orqali yuboriladi.
 */
const authService = new AuthService();
const orderService = new OrderService();
const tableService = new TableService();

const waiterController: T = {};

/** PIN ni taxmin qilishdan himoya: IP bo'yicha 10 daqiqada 5 ta xato */
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const failedLogins = new Map<string, { count: number; first: number }>();

const pinMatches = (input: string, expected: string): boolean => {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sendError = (res: Response, err: unknown) => {
  if (err instanceof Errors) res.status(err.code).json(err);
  else res.status(Errors.standard.code).json(Errors.standard);
};

waiterController.login = async (req: Request, res: Response) => {
  try {
    const expected = process.env.WAITER_PIN;
    if (!expected)
      throw new Errors(HttpCode.INTERNAL_SERVER_ERROR, Message.WAITER_PIN_NOT_SET);

    const ip = req.ip || "unknown";
    const now = Date.now();
    const record = failedLogins.get(ip);
    if (record && now - record.first > FAIL_WINDOW_MS) failedLogins.delete(ip);
    const current = failedLogins.get(ip);
    if (current && current.count >= MAX_FAILS)
      throw new Errors(HttpCode.TOO_MANY_REQUESTS, Message.TOO_MANY_ATTEMPTS);

    if (!pinMatches(req.body?.pin ?? "", expected)) {
      failedLogins.set(ip, {
        count: (current?.count ?? 0) + 1,
        first: current?.first ?? now,
      });
      throw new Errors(HttpCode.UNAUTHORIZED, Message.WRONG_PIN);
    }

    failedLogins.delete(ip);
    const token = await authService.createWaiterToken();
    res.status(HttpCode.OK).json({ token });
  } catch (err) {
    console.log("Error, waiter login:", err);
    sendError(res, err);
  }
};

waiterController.verifyWaiter = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token && authService.checkWaiterToken(token)) return next();
  sendError(res, new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED));
};

/** Stollar ro'yxati + har biridagi faol buyurtmalar soni */
waiterController.getTables = async (req: Request, res: Response) => {
  try {
    const [tables, activeCounts] = await Promise.all([
      tableService.getAllTables({ page: 1, limit: 1000 }),
      orderService.countActiveOrdersByTable(),
    ]);
    const result = tables
      .map((t: any) => ({
        _id: t._id,
        tableNumber: t.tableNumber,
        tableStatus: t.tableStatus,
        activeOrders: activeCounts[String(t._id)] ?? 0,
      }))
      .sort((a: any, b: any) =>
        String(a.tableNumber).localeCompare(String(b.tableNumber), undefined, {
          numeric: true,
        })
      );
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, waiter getTables:", err);
    sendError(res, err);
  }
};

waiterController.getTableOrders = async (req: Request, res: Response) => {
  try {
    const result = await orderService.getActiveTableOrders(req.params.id);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, waiter getTableOrders:", err);
    sendError(res, err);
  }
};

waiterController.createOrder = async (req: Request, res: Response) => {
  try {
    const { tableId, items } = req.body ?? {};
    const { order, table } = await orderService.createWaiterOrder(tableId, items);

    try {
      const io = getIo();
      io.to("admins").emit("newNotification", {
        type: "ORDER",
        message: `Stol ${table.tableNumber}: yangi buyurtma (afitsant)`,
        tableId: table._id,
        tableNumber: table.tableNumber,
        read: false,
      });
      const fullOrder = await orderService.getOrderByIdWithDetails(String(order._id));
      if (fullOrder) io.to("admins").emit("orderCreated", fullOrder);
    } catch (ioErr) {
      console.log("Socket emit failed:", ioErr);
    }

    res.status(HttpCode.CREATED).json(order);
  } catch (err) {
    console.log("Error, waiter createOrder:", err);
    sendError(res, err);
  }
};

export default waiterController;

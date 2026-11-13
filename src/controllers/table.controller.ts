import TableService from "../models/Table.service";
import { getIo } from "../server";
import { T } from "../libs/types/common";
import { NextFunction, Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import {
  TableInput,
  TableInquiry,
  TableUpdateInput,
} from "../libs/types/table";
import AuthService from "../models/Auth.service";
import { AUTH_TIMER_TABLE } from "../libs/config";
import { ExtendedRequest } from "../libs/types/member";
import { TableStatus } from "../libs/enums/table.enum";
import { TableCall } from "../libs/enums/tableCall.enum";



const tableService = new TableService();
const authService = new AuthService();

const tableController: T = {};

tableController.verifyTable = async (
  req: ExtendedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tableToken = req.cookies["tableToken"];
    if (tableToken) req.table = await authService.checkTableAuth(tableToken);
    const activeIdentifier = await tableService.verifyActivite(
      req.table.activeIdentifier
    );
    if (!activeIdentifier)
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    next();
  } catch (err) {
    console.log("Error, verifyTable:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Admin */

tableController.getAllTables = async (req: Request, res: Response) => {
  try {
    console.log("getAllTables");
    const { page, status, search, limit } = req.query;
    const inquiry: TableInquiry = {
      page: Number(page),
      limit: Number(limit),
    };
    if (status) inquiry.status = String(status);
    if (search) inquiry.search = String(search);

    const data = await tableService.getAllTables(inquiry);

    res.status(HttpCode.OK).json(data);
  } catch (err) {
    console.log("Error, getAllTables:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

tableController.createNewTable = async (req: Request, res: Response) => {
  try {
    console.log("createNewTable");

    const input: TableInput = req.body,
      result = await tableService.createNewTable(input);

    res.status(HttpCode.CREATED).json(result);
  } catch (err) {
    console.log("Error, createNewTable:", err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

tableController.updateChosenTable = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenTable");
    const id = req.params.id;
    const input: TableUpdateInput = req.body;
    if (input.tableStatus && input.tableStatus !== TableStatus.OCCUPIED)
      res.cookie("tableToken", null, { maxAge: 0, httpOnly: true });
    const result = await tableService.updateChosenTable(id, input);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, updateChosenTable:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

tableController.deleteChosenTable = async (req: Request, res: Response) => {
  try {
    console.log("deleteChosenTable");
    const id = req.params.id;
    const result = await tableService.deleteChosenTable(id);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, deleteChosenTable:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Clients */
tableController.qrLanding = async (req: Request, res: Response) => {
  try {
    console.log("qrLanding");
    const qrToken = req.params.id;

    const result = await tableService.qrLanding(qrToken),
      token = await authService.createTableToken(result);
    res.cookie("tableToken", token, {
      maxAge: AUTH_TIMER_TABLE * 3600 * 1000,
      httpOnly: false,
    });

    res.status(HttpCode.CREATED).json({ table: result, tableToken: token });
  } catch (err) {
    console.log("Error, qrLanding:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

tableController.clickTableCall = async (req: Request, res: Response) => {
  try {
    const tableId = req.params.id;
    const result = await tableService.clickTableCall(tableId);

    try {
      const io = getIo();
      io.to("admins").emit("newNotification", {
        type: "TABLE_CALL",
        message: `Table: ${result.tableNumber} pressed call button`,
        tableId: result._id,
        tableNumber: result.tableNumber,
        tableCall: TableCall.ACTIVE,
        read: false,
      });
    } catch (ioErr) {
      console.log("Socket emit failed:", ioErr);
    }

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, clickTableCall:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** QR menyu: stol raqamlari ro'yxati ("Afitsantni chaqirish" uchun) */
tableController.getPublicTables = async (req: Request, res: Response) => {
  try {
    const result = await tableService.getPublicTables();
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getPublicTables:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Spamdan himoya: bitta stol 60 soniyada 1 marta, bitta IP 10 daqiqada 30 marta */
const CALL_TABLE_COOLDOWN_MS = 60 * 1000;
const CALL_IP_MAX = 30;
const CALL_IP_WINDOW_MS = 10 * 60 * 1000;
const lastCallByTable = new Map<string, number>();
const callsByIp = new Map<string, { count: number; first: number }>();

/** QR menyu: mijoz "Afitsantni chaqirish" tugmasini bosdi */
tableController.publicCallWaiter = async (req: Request, res: Response) => {
  try {
    const tableId = String(req.body?.tableId ?? "");
    if (!/^[a-f0-9]{24}$/i.test(tableId))
      throw new Errors(HttpCode.BAD_REQUEST, Message.NOT_TABLE);

    const now = Date.now();
    const ip = req.ip || "unknown";
    const rec = callsByIp.get(ip);
    if (rec && now - rec.first > CALL_IP_WINDOW_MS) callsByIp.delete(ip);
    const cur = callsByIp.get(ip);
    if (cur && cur.count >= CALL_IP_MAX)
      throw new Errors(HttpCode.TOO_MANY_REQUESTS, Message.TOO_MANY_ATTEMPTS);

    // Shu stol yaqinda chaqirgan bo'lsa — qayta xabar yubormaymiz, lekin mijozga "yuborildi" deymiz
    const last = lastCallByTable.get(tableId) ?? 0;
    if (now - last < CALL_TABLE_COOLDOWN_MS) {
      res.status(HttpCode.OK).json({ ok: true, repeated: true });
      return;
    }

    const result = await tableService.clickTableCall(tableId);
    lastCallByTable.set(tableId, now);
    callsByIp.set(ip, { count: (cur?.count ?? 0) + 1, first: cur?.first ?? now });

    try {
      const io = getIo();
      io.to("admins").emit("newNotification", {
        type: "CALL",
        message: `Stol ${result.tableNumber}: afitsant chaqirildi`,
        tableId: result._id,
        tableNumber: result.tableNumber,
        tableCall: TableCall.ACTIVE,
        read: false,
      });
      io.to("admins").emit("tableCall", { tableId: result._id, tableNumber: result.tableNumber });
    } catch (ioErr) {
      console.log("Socket emit failed:", ioErr);
    }

    res.status(HttpCode.OK).json({ ok: true, tableNumber: result.tableNumber });
  } catch (err) {
    console.log("Error, publicCallWaiter:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

tableController.TableLogout = (req: ExtendedRequest, res: Response) => {
  try {
    console.log("TableLogout");
    res.cookie("tableToken", null, { maxAge: 0, httpOnly: true });
    res.status(HttpCode.OK).json({ logout: true });
  } catch (err) {
    console.log("Error, TableLogout:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

export default tableController;

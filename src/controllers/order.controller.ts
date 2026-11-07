import OrderService from "../models/Order.service";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import { Request, Response } from "express";
import { getIo } from "../server";
import {
  OrderInquiry,
  OrderStatis,
  OrderUpdateInput,
} from "../libs/types/order";
import {
  OrderStatus,
  OrderType,
  PaymentStatus,
} from "../libs/enums/order.enum";
import { PaymentMethod } from "../libs/enums/order.enum";
import { ExtendedRequest, Member } from "../libs/types/member";
import { Table } from "../libs/types/table";

const orderService = new OrderService();

const orderController: T = {};

/** MEMBER */
orderController.createOrder = async (req: ExtendedRequest, res: Response) => {
  try {
    console.log("createOrder");
    const client: Member | Table = req.member ? req.member : req.table;
    
    if (!client || !client._id) {
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    }
    
    const result = await orderService.createOrder(client, req.body);

    try {
      const io = getIo();
      io.to("admins").emit("newNotification", {
        type: "ORDER",
        message: req.member
          ? `New order from User: ${req.member.memberNick}`
          : `New order from Table: ${req.table.tableNumber}`,
        tableId: req.table?._id ?? null,
        tableNumber: req.table?.tableNumber ?? null,
        read: false,
      });
      const fullOrder = await orderService.getOrderByIdWithDetails(String(result._id));
      if (fullOrder) io.to("admins").emit("orderCreated", fullOrder);
    } catch (ioErr) {
      console.log("Socket emit failed:", ioErr);
    }

    res.status(HttpCode.CREATED).json(result);
  } catch (err) {
    console.log("Error, createOrder:", err);
    console.log("Error details:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      client: req.member ? 'member' : req.table ? 'table' : 'none'
    });
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

orderController.getMyOrders = async (req: ExtendedRequest, res: Response) => {
  try {
    console.log("getMyOrders");
    const { page, limit, orderStatus } = req.query;
    const inquiry: OrderInquiry = {
      page: Number(page),
      limit: Number(limit),
      orderStatus: orderStatus as OrderStatus,
    };

    const result = await orderService.getMyOrders(
      req.member,
      req.table,
      inquiry
    );

    res.status(HttpCode.CREATED).json(result);
  } catch (err) {
    console.log("Error, getMyOrders:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

orderController.updateOrder = async (req: ExtendedRequest, res: Response) => {
  try {
    console.log("updateOrder");
    const input: OrderUpdateInput = req.body;
    const result = await orderService.updateOrder(req.member, req.table, input);

    res.status(HttpCode.CREATED).json(result);
  } catch (err) {
    console.log("Error, updateOrder:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** ADMIN */
orderController.getAllOrders = async (req: Request, res: Response) => {
  try {
    console.log("getAllOrders");
    const { page, limit, status, payStatus, search, type, payMeth } = req.query;
    const inquiry: OrderInquiry = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    };
    if (search) inquiry.search = String(search);
    if (status) inquiry.status = status as OrderStatus;
    if (payStatus) inquiry.payStatus = payStatus as PaymentStatus;
    if (payMeth) inquiry.payMeth = payMeth as PaymentMethod;
    if (type) inquiry.type = type as OrderType;

    const data = await orderService.getAllOrders(inquiry);
    res.status(HttpCode.OK).json(data);
  } catch (err) {
    console.log("Error, getAllOrders:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

orderController.getAllOrdersPanel = async (req: Request, res: Response) => {
  try {
    console.log("getAllOrdersPanel");
    const data = await orderService.getAllOrdersPanel();
    res.status(HttpCode.OK).json(data);
  } catch (err) {
    console.log("Error, getAllOrdersPanel:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

orderController.updateChosenOrder = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenOrder");
    const id = req.params.id;
    console.log("id", id);
    const result = await orderService.updateChosenOrder(id, req.body);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, updateChosenOrder:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

orderController.getOrderStatis = async (req: Request, res: Response) => {
  try {
    console.log("getOrderStatis");
    const result: OrderStatis = await orderService.getStatis();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getOrderStatis:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

orderController.completeTableOrders = async (req: Request, res: Response) => {
  try {
    const tableId = req.params.id;
    if (!tableId) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
    const result = await orderService.completeTableOrders(tableId);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, completeTableOrders:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Taomlar bo'yicha sotuv: ?from=ISO sana (default — oxirgi 30 kun) */
orderController.getProductSales = async (req: Request, res: Response) => {
  try {
    const raw = req.query.from ? new Date(String(req.query.from)) : null;
    const from =
      raw && !isNaN(raw.getTime())
        ? raw
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await orderService.getProductSales(from);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getProductSales:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

export default orderController;

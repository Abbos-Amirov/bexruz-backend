import { Member } from "../libs/types/member";
import { ObjectId } from "mongoose";
import OrderModel from "../schema/Order.model";
import OrderItemModel from "../schema/OrderItem.model";
import {
  Order,
  OrderInput,
  OrderInquiry,
  OrderItemInput,
  OrdersByCategory,
  OrderStatis,
  OrderUpdateInput,
  TodayIncomeAndAOV,
  TopSellingItems,
} from "../libs/types/order";
import { shapeIntoMongooseObjectId } from "../libs/config";
import Errors, { HttpCode, Message } from "../libs/Errors";
import MemberService from "./Member.service";
import { OrderStatus, OrderType, PaymentStatus } from "../libs/enums/order.enum";
import { T } from "../libs/types/common";
import { MemberType } from "../libs/enums/member.enum";
import { Table } from "../libs/types/table";
import { isMember, isTable } from "../libs/utils/validators";
import NotifService from "./Notif.service";
import { NotifStatus, NotifType } from "../libs/enums/notif.enum";
import { MessageNotif, Title } from "../libs/notif";
import TableModel from "../schema/Table.model";
import ProductModel from "../schema/Product.model";
import { ProductStatus } from "../libs/enums/product.enums";
import { TableStatus } from "../libs/enums/table.enum";

class OrderService {
  private readonly orderModel;
  private readonly orderItemModel;
  private readonly memberService;
  private readonly notifService;

  constructor() {
    this.orderModel = OrderModel;
    this.orderItemModel = OrderItemModel;
    this.memberService = new MemberService();
    this.notifService = new NotifService();
  }

  /** MEMBER **/
  public async createOrder(
    client: Member | Table,
    input: OrderItemInput[]
  ): Promise<Order> {
    if (!client || !client._id) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.NO_MEMBER_NICK);
    }
    
    if (!input || !Array.isArray(input) || input.length === 0) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
    
    const amount = input.reduce((accumulator: number, item: OrderItemInput) => {
      if (!item.itemPrice || !item.itemQuantity) {
        throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
      }
      return accumulator + item.itemPrice * item.itemQuantity;
    }, 0);

    let orderType: OrderType;
    if (isMember(client)) {
      orderType =
        client.memberType === MemberType.USER
          ? OrderType.DELIVERY
          : OrderType.TAKEOUT; // restaurant
    } else if (isTable(client)) {
      console.log("alajdsf", client.activeIdentifier);
      orderType = OrderType.TABLE;
    } else {
      throw new Errors(HttpCode.BAD_REQUEST, Message.NO_MEMBER_NICK);
    }

    const orderDelivery =
      orderType === OrderType.DELIVERY ? (amount < 100 ? 5 : 0) : 0;

    const order: OrderInput = {
      orderTotal: amount + orderDelivery,
      orderDelivery,
      orderType,
      memberId: isMember(client) ? shapeIntoMongooseObjectId(client._id) : null,
      tableId: isTable(client) ? shapeIntoMongooseObjectId(client._id) : null,
    };
    try {
      const newOrder: Order = await this.orderModel.create(order);
      const orderId = newOrder._id;
      await this.recordOrderItem(orderId, input);
      /** Create Order Notification */
      await this.notifService.createNotif({
        notifType: NotifType.ORDER,
        orderId: isMember(client) ? orderId : null,
        tableId: isTable(client) ? orderId : null,
        title: isMember(client)
          ? Title.USER_ORDER + `${client.memberNick || ''}`
          : Title.TABLE_ORDER + `${client.tableNumber || ''}`,
        message: isMember(client) ? MessageNotif.USER_ORDER : MessageNotif.TABLE_ORDER,
      });

      return newOrder;
    } catch (err) {
      console.log("Error, model: createOrder: ", err);
      console.log("Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        client: client ? { hasId: !!client._id, type: isMember(client) ? 'member' : isTable(client) ? 'table' : 'unknown' } : 'undefined'
      });
      if (err instanceof Errors) {
        throw err;
      }
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  private async recordOrderItem(
    orderId: ObjectId,
    input: OrderItemInput[]
  ): Promise<void> {
    const promisedList = input.map(async (item: OrderItemInput) => {
      item.orderId = orderId;
      item.productId = shapeIntoMongooseObjectId(item.productId);
      await this.orderItemModel.create(item);
      return "INSERTED";
    });
    const orderItemsState = await Promise.all(promisedList);
    console.log("orderItemsState", orderItemsState);
  }

  public async getMyOrders(
    member: Member | null,
    table: Table | null,
    inquiry: OrderInquiry
  ): Promise<Order[]> {
    const memberId = shapeIntoMongooseObjectId(member?._id);
    const tableId = shapeIntoMongooseObjectId(table?._id);
    const matches = {
      memberId: memberId,
      tableId: tableId,
      orderStatus: inquiry.orderStatus,
    };

    const result = await this.orderModel
      .aggregate([
        { $match: matches },
        { $sort: { updateAt: -1 } },
        { $skip: (inquiry.page - 1) * inquiry.limit },
        { $limit: inquiry.limit },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  public async updateOrder(
    member: Member | null,
    table: Table | null,
    input: OrderUpdateInput
  ): Promise<Order> {
    const memberId = shapeIntoMongooseObjectId(member?._id);
    const tableId = shapeIntoMongooseObjectId(table?._id);
    const orderId = shapeIntoMongooseObjectId(input.orderId);
    const orderStatus = input.orderStatus;

    const result = await this.orderModel
      .findOneAndUpdate(
        {
          tableId: tableId,
          memberId: memberId,
          _id: orderId,
        },
        { orderStatus: orderStatus },
        { new: true }
      )
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    if (member && orderStatus === OrderStatus.PENDING) {
      await this.memberService.addUserPoint(member, 1);
    }
    return result;
  }

  /** ADMIN */
  public async getAllOrders(inquiry: OrderInquiry): Promise<Order[]> {
    const match: T = { orderStatus: { $ne: OrderStatus.PAUSE } };

    if (inquiry.payStatus) match.paymentStatus = inquiry.payStatus;
    if (inquiry.payMeth) match.paymentMethod = inquiry.payMeth;
    if (inquiry.status) match.orderStatus = inquiry.status;
    if (inquiry.type) match.orderType = inquiry.type;
    if (inquiry.search)
      match.orderType = { $regex: new RegExp(inquiry.search, "i") };

    const page = Math.max(1, Number(inquiry.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(inquiry.limit) || 10));

    const result = await this.orderModel
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "tables",
            localField: "tableId",
            foreignField: "_id",
            as: "tableData",
          },
        },
        {
          $lookup: {
            from: "members",
            localField: "memberId",
            foreignField: "_id",
            as: "memberData",
          },
        },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
        {
          $addFields: {
            tableNumber: { $arrayElemAt: ["$tableData.tableNumber", 0] },
            memberNick: { $arrayElemAt: ["$memberData.memberNick", 0] },
          },
        },
        {
          $project: {
            tableData: 0,
            memberData: 0,
          },
        },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  /**
   * "Buyurtmalar holati" paneli: barcha ochiq stol buyurtmalari (sahifalashsiz).
   * Avval oxirgi 10 ta buyurtma olinib brauzerda filtrlangani uchun eski/boshqa
   * buyurtmalar panelga "ko'tarilib" chiqar, ba'zi stollar esa umuman ko'rinmas edi.
   */
  public async getAllOrdersPanel(): Promise<Order[]> {
    const result = await this.orderModel
      .aggregate([
        { $match: this.activeTableOrderMatch() },
        { $sort: { createdAt: -1 } },
        { $limit: 500 },
        {
          $lookup: {
            from: "tables",
            localField: "tableId",
            foreignField: "_id",
            as: "tableData",
          },
        },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
        {
          $addFields: {
            tableNumber: { $arrayElemAt: ["$tableData.tableNumber", 0] },
          },
        },
        { $project: { tableData: 0 } },
      ])
      .exec();
    return result ?? [];
  }

  /** Birta buyurtmani to'liq (orderItems, productData, tableNumber, memberNick) qaytaradi — Socket orderCreated uchun */
  public async getOrderByIdWithDetails(orderId: string): Promise<Order | null> {
    const id = shapeIntoMongooseObjectId(orderId);
    const result = await this.orderModel
      .aggregate([
        { $match: { _id: id } },
        {
          $lookup: {
            from: "tables",
            localField: "tableId",
            foreignField: "_id",
            as: "tableData",
          },
        },
        {
          $lookup: {
            from: "members",
            localField: "memberId",
            foreignField: "_id",
            as: "memberData",
          },
        },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
        {
          $addFields: {
            tableNumber: { $arrayElemAt: ["$tableData.tableNumber", 0] },
            memberNick: { $arrayElemAt: ["$memberData.memberNick", 0] },
          },
        },
        { $project: { tableData: 0, memberData: 0 } },
      ])
      .exec();
    return result?.[0] ?? null;
  }

  public async updateChosenOrder(
    id: string,
    input: OrderUpdateInput
  ): Promise<Order> {
    console.log(id);
    const orderId = shapeIntoMongooseObjectId(id);
    const result = await this.orderModel
      .findByIdAndUpdate({ _id: id }, input, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.UPDATE_FAILED);
    if (result.orderStatus !== OrderStatus.PENDING)
      await this.notifService.updateOrderNotif(orderId, {
        notifStatus: NotifStatus.READ,
      });
    return result;
  }

  /** WAITER **/

  /**
   * Hali yopilmagan stol buyurtmalari sharti — admin "Buyurtmalar holati" paneli bilan bir xil:
   * stol admin'da "To'landi" bosilganda (COMPLETED) yopiladi.
   */
  private activeTableOrderMatch(tableId?: string): T {
    const match: T = {
      orderType: OrderType.TABLE,
      orderStatus: {
        $nin: [OrderStatus.PAUSE, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      },
    };
    if (tableId) match.tableId = shapeIntoMongooseObjectId(tableId);
    return match;
  }

  /**
   * Afitsant buyurtmasi: narxlar bazadan olinadi (brauzerga ishonilmaydi),
   * buyurtma darhol PENDING bo'ladi va admin panelda ko'rinadi, stol band qilinadi.
   */
  public async createWaiterOrder(
    tableId: string,
    items: { productId: string; itemQuantity: number }[]
  ): Promise<{ order: Order; table: Table }> {
    if (!tableId || !Array.isArray(items) || items.length === 0) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }

    const table = (await TableModel.findById(
      shapeIntoMongooseObjectId(tableId)
    )
      .lean()
      .exec()) as Table | null;
    if (!table) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    const quantities = new Map<string, number>();
    for (const item of items) {
      const qty = Math.floor(Number(item?.itemQuantity));
      if (!item?.productId || !Number.isFinite(qty) || qty < 1) {
        throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
      }
      const id = String(item.productId);
      quantities.set(id, (quantities.get(id) ?? 0) + qty);
    }

    const products = await ProductModel.find({
      _id: { $in: Array.from(quantities.keys()).map(shapeIntoMongooseObjectId) },
      productStatus: ProductStatus.PROCESS,
    })
      .lean()
      .exec();
    if (products.length !== quantities.size) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }

    const input: OrderItemInput[] = products.map((p: any) => ({
      productId: p._id,
      itemQuantity: quantities.get(String(p._id)) as number,
      itemPrice: Number(p.productPrice),
    }));

    const created = await this.createOrder(table, input);
    const order = (await this.orderModel
      .findByIdAndUpdate(
        created._id,
        { orderStatus: OrderStatus.PENDING },
        { new: true }
      )
      .exec()) as Order;

    await TableModel.updateOne(
      { _id: table._id },
      { tableStatus: TableStatus.OCCUPIED }
    ).exec();

    return { order, table };
  }

  /** Stol bo'yicha faol buyurtmalar soni (afitsantning stollar ekrani uchun) */
  public async countActiveOrdersByTable(): Promise<Record<string, number>> {
    const rows = await this.orderModel
      .aggregate([
        { $match: this.activeTableOrderMatch() },
        { $group: { _id: "$tableId", count: { $sum: 1 } } },
      ])
      .exec();
    const result: Record<string, number> = {};
    rows.forEach((r: any) => {
      if (r._id) result[String(r._id)] = r.count;
    });
    return result;
  }

  /** Tanlangan stolning hali yopilmagan buyurtmalari (taom nomlari bilan) */
  public async getActiveTableOrders(tableId: string): Promise<T[]> {
    const rows = await this.orderModel
      .aggregate([
        { $match: this.activeTableOrderMatch(tableId) },
        { $sort: { createdAt: -1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
      ])
      .exec();

    return rows.map((o: any) => {
      const names = new Map<string, string>(
        (o.productData ?? []).map((p: any) => [String(p._id), p.productName])
      );
      return {
        _id: o._id,
        createdAt: o.createdAt,
        orderStatus: o.orderStatus,
        orderTotal: o.orderTotal,
        items: (o.orderItems ?? []).map((i: any) => ({
          productName: names.get(String(i.productId)) ?? "—",
          itemQuantity: i.itemQuantity,
          itemPrice: i.itemPrice,
        })),
      };
    });
  }

  /**
   * Har bir taom bo'yicha `from` sanasidan beri nechta sotilgani va summasi.
   * PAUSE (tasdiqlanmagan) va bekor qilingan buyurtmalar hisobga olinmaydi.
   * Hech sotilmagan taomlar ham 0 bilan qaytadi (o'chirilganlari faqat sotilgan bo'lsa).
   */
  public async getProductSales(from: Date): Promise<T[]> {
    return ProductModel.aggregate([
      {
        $lookup: {
          from: "orderItems",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$pid"] } } },
            {
              $lookup: {
                from: "orders",
                localField: "orderId",
                foreignField: "_id",
                as: "order",
              },
            },
            { $unwind: "$order" },
            {
              $match: {
                "order.createdAt": { $gte: from },
                "order.orderStatus": {
                  $nin: [OrderStatus.PAUSE, OrderStatus.CANCELLED, "CANCELED"],
                },
              },
            },
            {
              $group: {
                _id: null,
                soldQty: { $sum: "$itemQuantity" },
                revenue: { $sum: { $multiply: ["$itemQuantity", "$itemPrice"] } },
                orderIds: { $addToSet: "$orderId" },
              },
            },
          ],
          as: "sales",
        },
      },
      {
        $match: {
          $or: [
            { productStatus: { $ne: ProductStatus.DELETE } },
            { "sales.0": { $exists: true } },
          ],
        },
      },
      {
        $project: {
          productName: 1,
          productImages: 1,
          productCollection: 1,
          productPrice: 1,
          productStatus: 1,
          soldQty: { $ifNull: [{ $arrayElemAt: ["$sales.soldQty", 0] }, 0] },
          revenue: { $ifNull: [{ $arrayElemAt: ["$sales.revenue", 0] }, 0] },
          orderCount: {
            $size: { $ifNull: [{ $arrayElemAt: ["$sales.orderIds", 0] }, []] },
          },
        },
      },
      { $sort: { soldQty: -1, revenue: -1, productName: 1 } },
    ]).exec();
  }

  /**
   * Stol bo'yicha barcha ochiq buyurtmalarni yakunlash (PAID + COMPLETED).
   * To'lov holatidan qat'i nazar yopiladi: oldindan to'langan, lekin PENDING
   * qolgan buyurtmalar ham panelda qolib ketmasligi uchun.
   */
  public async completeTableOrders(tableId: string): Promise<{ updatedCount: number; totalSum: number }> {
    const match = this.activeTableOrderMatch(tableId);
    const open = await this.orderModel.find(match).lean().exec();
    if (!open.length) {
      return { updatedCount: 0, totalSum: 0 };
    }
    const totalSum = open.reduce((s, o) => s + (o.orderTotal ?? 0), 0);
    await this.orderModel
      .updateMany(match, {
        $set: { orderStatus: OrderStatus.COMPLETED, paymentStatus: PaymentStatus.PAID },
      })
      .exec();
    return { updatedCount: open.length, totalSum };
  }

  public async getStatis(): Promise<OrderStatis> {
    // Order Status
    const allOrders = await this.orderModel.find().exec();
    const pendingOrder = allOrders.filter((val) => {
      return val.orderStatus === OrderStatus.PENDING;
    }).length;
    const complatedOrder = allOrders.filter((val) => {
      return val.orderStatus === OrderStatus.COMPLETED;
    }).length;

    const ordersByCategory = await this.ordersByCategory();
    const topSellingItems = await this.topSellingItems();
    const todayIncomeAndAOV = await this.todayIncomeAndAOV();

    const data: OrderStatis = {
      totalOrder: allOrders.length,
      pendingOrder: pendingOrder,
      complatedOrder: complatedOrder,
      ordersByCategory: ordersByCategory,
      topSellingItems: topSellingItems,
      todayIncomeAndAOV: todayIncomeAndAOV,
    };
    return data;
  }

  private async ordersByCategory(): Promise<OrdersByCategory[]> {
    const data = await this.orderItemModel.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $match: {
          "order.paymentStatus": "PAID",
          "order.orderStatus": { $ne: "CANCELED" },
          // "order.createdAt": { $gte: ISODate("2025-08-01"), $lt: ISODate("2025-09-01") }
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.productCollection",
          totalQuantity: { $sum: "$itemQuantity" },
          revenue: { $sum: { $multiply: ["$itemQuantity", "$itemPrice"] } },
          orderIds: { $addToSet: "$orderId" },
        },
      },
      { $addFields: { orders: { $size: "$orderIds" } } },
      {
        $project: {
          collection: "$_id",
          totalQuantity: 1,
          revenue: 1,
          orders: 1,
          _id: 0,
        },
      },
      { $sort: { totalQuantity: -1 } },
    ]);
    return data;
  }

  private async topSellingItems(): Promise<TopSellingItems[]> {
    // Top selling Items
    const data = await this.orderItemModel.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $match: {
          "order.paymentStatus": "PAID",
          "order.orderStatus": { $ne: "CANCELED" },
          // "order.createdAt": { $gte: ISODate("2025-08-01"), $lt: ISODate("2025-09-01") }
        },
      },
      {
        $group: {
          _id: "$productId",
          totalQuantity: { $sum: "$itemQuantity" },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          _id: 0,
          productId: "$_id",
          productName: "$product.productName",
          totalQuantity: 1,
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 6 },
    ]);
    return data;
  }

  private async todayIncomeAndAOV(): Promise<TodayIncomeAndAOV[]> {
    // Today's Income and Avarege Order Value
    const data = await this.orderModel.aggregate([
      {
        $match: {
          paymentStatus: "PAID",
          orderStatus: { $ne: "CANCELED" },
          $expr: {
            $and: [
              {
                $gte: [
                  "$createdAt",
                  {
                    $dateSubtract: {
                      startDate: "$$NOW",
                      unit: "day",
                      amount: 23,
                      timezone: "Asia/Seoul",
                    },
                  },
                ],
              },
              { $lte: ["$createdAt", "$$NOW"] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          totalSum: { $sum: "$orderTotal" },
          deliverySum: { $sum: "$orderDelivery" },
        },
      },
      {
        $addFields: {
          aovGross: {
            $cond: [
              { $gt: ["$orders", 0] },
              { $divide: ["$totalSum", "$orders"] },
              0,
            ],
          },
        },
      },
      { $project: { _id: 0, orders: 0 } },
    ]);
    return data;
  }
}

export default OrderService;

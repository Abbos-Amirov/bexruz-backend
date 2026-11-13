import { ObjectId } from "mongoose";
import { T } from "../libs/types/common";
import { shapeIntoMongooseObjectId } from "../libs/config";
import Errors, { HttpCode, Message } from "../libs/Errors";
import {
  Table,
  TableInput,
  TableInquiry,
  TableUpdateInput,
} from "../libs/types/table";
import TableModel from "../schema/Table.model";
import { MemberType } from "../libs/enums/member.enum";
import { TableStatus } from "../libs/enums/table.enum";
import { TableCall } from "../libs/enums/tableCall.enum";
import NotifService from "./Notif.service";
import { NotifStatus, NotifType } from "../libs/enums/notif.enum";
import { MessageNotif, Title } from "../libs/notif";

class TableService {
  private readonly tableModel;
  private readonly notifService;

  constructor() {
    this.tableModel = TableModel;
    this.notifService = new NotifService();
  }

  public async getAllTables(inquiry: TableInquiry): Promise<Table[]> {
    const match: T = {};

    if (inquiry.status) match.tableStatus = inquiry.status;

    if (inquiry.search) {
      match.tableNumber = { $regex: new RegExp(inquiry.search, "i") };
    }

    const result = await this.tableModel
      .aggregate([
        { $match: match },
        { $sort: { createdAt: 1 } },
        { $skip: (inquiry.page - 1) * inquiry.limit },
        { $limit: inquiry.limit },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  public async createNewTable(input: TableInput): Promise<Table> {
    input.qrToken = Math.random().toString(36).substring(2, 10);
    try {
      const result = await this.tableModel.create(input);
      return result;
    } catch (err) {
      console.log("Error, model: createNewTable: ", err);
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  public async updateChosenTable(
    id: string,
    input: TableUpdateInput
  ): Promise<Table> {
    const tableId = shapeIntoMongooseObjectId(id);
    if (input.tableStatus)
      // every new clients new activeIdentifier
      input.activeIdentifier = null;
    if (input.tableCall)
      await this.notifService.updateCallNotif(tableId, {
        message: MessageNotif.TABLE_CALL_UPDATE,
        notifStatus: NotifStatus.READ,
      });
    console.log("input: updateChosenTable:", input);
    const result = await this.tableModel
      .findByIdAndUpdate({ _id: id }, input, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.UPDATE_FAILED);
    return result;
  }

  public async deleteChosenTable(id: string): Promise<boolean> {
    try {
      id = shapeIntoMongooseObjectId(id);
      const result = await this.tableModel.findByIdAndDelete(id);
      return result ? true : false;
    } catch (err) {
      console.log("Error, model: deleteChosenTable: ", err);
      throw new Errors(HttpCode.BAD_REQUEST, Message.SOMETHING_WENT_WRONG);
    }
  }

  public async qrLanding(qrToken: string): Promise<Table> {
    const activeIdentifier = Math.random().toString(36).substring(2, 10);
    const result = await this.tableModel
      .findOneAndUpdate(
        { qrToken: qrToken },
        {
          activeIdentifier: activeIdentifier,
          tableStatus: TableStatus.OCCUPIED,
        },
        { new: true }
      )
      .lean()
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NOT_TABLE);
    return result;
  }

  /** QR menyu uchun: faqat stol raqamlari (boshqa maydonlar ochiq tarqalmaydi) */
  public async getPublicTables(): Promise<{ _id: string; tableNumber: string }[]> {
    const rows = await this.tableModel
      .find({}, { tableNumber: 1 })
      .lean()
      .exec();
    return rows
      .map((t: any) => ({ _id: String(t._id), tableNumber: String(t.tableNumber) }))
      .sort((a, b) =>
        a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })
      );
  }

  /**
   * "Tozalanmoqda" holatida `minutes` daqiqadan ko'p turgan stollarni "Bo'sh"ga o'tkazadi.
   * Server o'zi har 30 soniyada chaqiradi — admin sahifasi ochiq bo'lishi shart emas.
   */
  public async releaseCleaningTables(minutes = 3): Promise<number> {
    const before = new Date(Date.now() - minutes * 60 * 1000);
    const result = await this.tableModel
      .updateMany(
        { tableStatus: TableStatus.CLEANING, updatedAt: { $lte: before } },
        { tableStatus: TableStatus.AVAILABLE }
      )
      .exec();
    return result.modifiedCount ?? 0;
  }

  public async clickTableCall(tableId: string): Promise<Table> {
    const id = shapeIntoMongooseObjectId(tableId);
    const result = await this.tableModel
      .findByIdAndUpdate(
        id,
        {
          tableCall: TableCall.ACTIVE,
        },
        { new: true }
      )
      .exec();
    if (result) {
      await this.notifService.createNotif({
        notifType: NotifType.CALL,
        tableId: id,
        orderId: null,
        title: Title.TABLE_CALL + `${result.tableNumber}`,
        message: MessageNotif.TABLE_CALL,
      });
    } else {
      throw new Errors(HttpCode.NOT_FOUND, Message.NOT_TABLE);
    }
    return result;
  }

  public async verifyActivite(activeIdentifier: string): Promise<Table> {
    const result = this.tableModel
      .findOne({ activeIdentifier: activeIdentifier })
      .exec();
    return result;
  }
}

export default TableService;

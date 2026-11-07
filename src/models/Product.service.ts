import { T } from "../libs/types/common";
import { ObjectId } from "mongoose";
import { shapeIntoMongooseObjectId } from "../libs/config";
import Errors, { HttpCode, Message } from "../libs/Errors";
import {
  Product,
  ProductInput,
  ProductInquiry,
  ProductsStat,
  ProductUpdateInput,
} from "../libs/types/product";
import ProductModel from "../schema/Product.model";
import { ProductStatus } from "../libs/enums/product.enums";
import ViewService from "./View.service";
import { ViewInput } from "../libs/types/view";
import { ViewGroup } from "../libs/enums/view.enum";

class ProductService {
  private readonly productModel;
  public viewService;

  constructor() {
    this.productModel = ProductModel;
    this.viewService = new ViewService();
  }

  /** MEMBER */
  /**
   * Mijozlar uchun ochiq menyu (QR orqali): faqat faol taomlar va faqat
   * menyuga kerakli maydonlar — qoldiq soni, ko'rishlar va h.k. berilmaydi.
   */
  public async getPublicMenu(): Promise<T[]> {
    return this.productModel
      .find(
        { productStatus: ProductStatus.PROCESS },
        {
          productName: 1,
          productPrice: 1,
          productCollection: 1,
          productSize: 1,
          productVolume: 1,
          productDesc: 1,
          productImages: 1,
        }
      )
      .sort({ productCollection: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  public async getProducts(inquiry: ProductInquiry): Promise<Product[]> {
    const match: T = { productStatus: ProductStatus.PROCESS };

    if (inquiry.productCollection)
      match.productCollection = inquiry.productCollection;
    if (inquiry.search)
      match.productName = { $regex: new RegExp(inquiry.search, "i") };

    const page = Math.max(1, Number(inquiry.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(inquiry.limit) || 10));
    const order = inquiry.order || "createdAt";

    const sort: T =
      order === "productPrice"
        ? { [order]: 1 }
        : { [order]: -1 };

    const result = await this.productModel
      .aggregate([
        { $match: match },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async getProduct(
    memberId: ObjectId | null,
    activeIdentifier: string | null,
    id: string
  ): Promise<Product> {
    const productId = shapeIntoMongooseObjectId(id);
    let result = await this.productModel
      .findOne({
        _id: productId,
        productStatus: ProductStatus.PROCESS,
      })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    if (memberId || activeIdentifier) {
      // Check Existence Table&Member
      const input: ViewInput = {
        memberId: memberId,
        activeIdentifier: activeIdentifier,
        viewRefId: productId,
        viewGroup: ViewGroup.PRODUCT,
      };
      const existView = await this.viewService.checkViewExistence(input);
      console.log("exist:", !!existView);
      if (!existView) {
        // Insert View
        await this.viewService.insertMemberView(input);

        // Increase Counts
        result = await this.productModel
          .findByIdAndUpdate(
            productId,
            { $inc: { productViews: +1 } },
            { new: true }
          )
          .exec();
      }
    }

    return result;
  }

  /** ADMIN */

  public async createNewProduct(input: ProductInput): Promise<Product> {
    try {
      return await this.productModel.create(input);
    } catch (err) {
      console.log("Error, model: createNewProduct:", err);
      if (err && typeof err === "object" && "code" in err && err.code === 11000) {
        throw new Errors(HttpCode.BAD_REQUEST, Message.DUPLICATE_PRODUCT);
      }
      throw err;
    }
  }

  public async getAllProducts(inquiry: ProductInquiry): Promise<Product[]> {
    const match: T = { productStatus: { $ne: ProductStatus.DELETE } };

    if (inquiry.productCollection)
      match.productCollection = inquiry.productCollection;
    if (inquiry.search)
      match.productName = { $regex: new RegExp(inquiry.search, "i") };

    const page = Math.max(1, Number(inquiry.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(inquiry.limit) || 10));
    const order = inquiry.order || "createdAt";

    const sort: T =
      order === "productPrice"
        ? { [order]: 1 }
        : { [order]: -1 };
    const result = await this.productModel
      .aggregate([
        { $match: match },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async updateChosenProduct(
    id: string,
    input: ProductUpdateInput
  ): Promise<Product> {
    console.log(id);
    id = shapeIntoMongooseObjectId(id);
    const result = await this.productModel
      .findByIdAndUpdate(id, input, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.UPDATE_FAILED);
    console.log("result>>", result)
    return result;
  }

  /** Admin: mahsulotni bazadan butunlay o'chiradi (hard delete) */
  public async deleteChosenProduct(id: string): Promise<Product | null> {
    const productId = shapeIntoMongooseObjectId(id);
    const result = await this.productModel.findByIdAndDelete(productId).exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  /** Admin: faqat productStatus o'zgaradi; javobda to'liq document (productImages bilan) qaytariladi */
  public async toggleProductStatus(id: string): Promise<Product> {
    const productId = shapeIntoMongooseObjectId(id);
    const product = await this.productModel.findById(productId).exec();
    if (!product) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    const nextStatus =
      product.productStatus === ProductStatus.PROCESS
        ? ProductStatus.PAUSE
        : ProductStatus.PROCESS;
    await this.productModel
      .findByIdAndUpdate(
        productId,
        { $set: { productStatus: nextStatus } },
        { new: false }
      )
      .exec();
    const result = await this.productModel
      .findById(productId)
      .lean()
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.UPDATE_FAILED);
    return result as Product;
  }

  public async getProductsStat(): Promise<ProductsStat[]> {
    const data = await this.productModel
      .aggregate([
        { $match: { productStatus: { $ne: "DELETE" } } },

        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            available: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$productStatus", "PROCESS"] },
                      { $gt: ["$productLeftCount", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $addFields: { unavailable: { $subtract: ["$total", "$available"] } },
        },
        { $project: { _id: 0 } },
      ])
      .exec();
    if (!data) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return data;
  }
}

export default ProductService;

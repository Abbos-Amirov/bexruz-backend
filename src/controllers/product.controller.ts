import {
  ProductInput,
  ProductInquiry,
  ProductUpdateInput,
} from "../libs/types/product";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import ProductService from "../models/Product.service";
import { Request, Response } from "express";
import { ExtendedRequest } from "../libs/types/member";
import { ProductCollection } from "../libs/enums/product.enums";

const productService = new ProductService();

const productController: T = {};

/** MEMBER */
productController.getProducts = async (req: Request, res: Response) => {
  try {
    console.log("getProducts");
    const { page, limit, order, productCollection, search } = req.query;
    console.log(req.query);
    const inquiry: ProductInquiry = {
      order: order ? String(order) : "createdAt",
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    };
    if (productCollection) {
      inquiry.productCollection = productCollection as ProductCollection;
    }
    if (search) inquiry.search = String(search);

    const result = await productService.getProducts(inquiry);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.getProduct = async (req: ExtendedRequest, res: Response) => {
  try {
    console.log("getProduct");
    const { id } = req.params;
    const memberId = req.member?._id ?? null;
    const activeIdentifier = req.table?.activeIdentifier ?? null,
      result = await productService.getProduct(memberId, activeIdentifier, id);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getProduct:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** ADMIN */

productController.createNewProduct = async (
  req: ExtendedRequest,
  res: Response
) => {
  try {
    console.log("createNewProduct");
    const source = { ...req.query, ...req.body } as Record<string, unknown>;
    const productPrice = Number(source.productPrice);
    const productLeftCount = Number(source.productLeftCount);
    if (!source.productCollection || !source.productName || Number.isNaN(productPrice) || Number.isNaN(productLeftCount)) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
    const data: ProductInput = {
      productCollection: String(source.productCollection).trim() as ProductCollection,
      productName: String(source.productName).trim(),
      productPrice,
      productLeftCount,
      productSize: source.productSize != null ? (String(source.productSize).trim() as ProductInput["productSize"]) : undefined,
      productVolume: source.productVolume != null ? Number(source.productVolume) : undefined,
      productDesc: source.productDesc != null ? String(source.productDesc).trim() : undefined,
    };
    data.productImages = req.files?.length
      ? req.files.map((ele) => ele.path.replace(/\\/g, "/"))
      : [];

    const result = await productService.createNewProduct(data);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, createNewProduct:", err);
    if (err instanceof Errors) {
      res.status(err.code).json(err);
    } else {
      const message = err instanceof Error ? err.message : Message.CREATE_FAILED;
      res.status(HttpCode.BAD_REQUEST).json({ code: HttpCode.BAD_REQUEST, message });
    }
  }
};

productController.getAllProducts = async (req: Request, res: Response) => {
  try {
    console.log("getAllProducts");
    const { page, limit, order, productCollection, search } = req.query;
    console.log(req.query);
    const inquiry: ProductInquiry = {
      order: order ? String(order) : "createdAt",
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    };
    if (productCollection) {
      inquiry.productCollection = productCollection as ProductCollection;
    }
    if (search) inquiry.search = String(search);

    const result = await productService.getAllProducts(inquiry);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getAllProducts:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.updateChosenProduct = async (
  req: ExtendedRequest,
  res: Response
) => {
  try {
    console.log("updateChosenProduct");
    const id = req.params.id;
    const input: ProductUpdateInput = req.body;

    // Normalize existing images
    let existingImages: string[] = [];
    if (Array.isArray(req.body.existingImages)) {
      existingImages = req.body.existingImages;
    } else if (req.body.existingImages) {
      existingImages = [req.body.existingImages];
    }

    // Collect new uploads
    const newFiles =
      (req.files as Express.Multer.File[] | undefined)?.map((ele) =>
        ele.path.replace(/\\/g, "/")
      ) || [];

    // Merge arrays
    input.productImages = [...existingImages, ...newFiles];
    const result = await productService.updateChosenProduct(id, input);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, updateChosenProduct:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.getProductsStat = async (req: Request, res: Response) => {
  try {
    console.log("getProductsStat");
    const result = await productService.getProductsStat();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getProductsStat:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.deleteChosenProduct = async (req: Request, res: Response) => {
  try {
    console.log("deleteChosenProduct");
    const id = req.params.id;
    const result = await productService.deleteChosenProduct(id);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, deleteChosenProduct:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

productController.toggleProductStatus = async (req: Request, res: Response) => {
  try {
    console.log("toggleProductStatus");
    const id = req.params.id;
    const result = await productService.toggleProductStatus(id);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, toggleProductStatus:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Mijozlar uchun ochiq, faqat o'qish uchun menyu (stoldagi QR kod) */
productController.getPublicMenu = async (req: Request, res: Response) => {
  try {
    const result = await productService.getPublicMenu();
    res.set("Cache-Control", "public, max-age=60");
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getPublicMenu:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

export default productController;

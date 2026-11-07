import { Router } from "express";
const router = Router();
import memberController from "./controllers/member.controller";
import productController from "./controllers/product.controller";
import waiterController from "./controllers/waiter.controller";

/** MEMBER — faqat admin login/logout va restoran ma'lumoti */
router
  .get("/member/restaurant", memberController.getRestaurant)
  .post("/member/login", memberController.login)
  .post("/member/signup", memberController.signup)
  .post("/member/logout", memberController.logout);

/** Public menu (stoldagi QR → faqat menyuni ko'rish) */
router.get("/menu/products", productController.getPublicMenu);

/** Product (faqat o'qish) */
router
  .get("/product/all", productController.getProducts)
  .get(
    "/product/:id",
    memberController.retrieveAuth,
    productController.getProduct
  );

/**
 * Mijozlar endi buyurtma bermaydi: eski /order/* (mijoz buyurtmasi), /table/*
 * (QR stol sessiyasi), /member/update|detail|top-users route'lari olib tashlandi.
 * Buyurtmani afitsant /waiter/* orqali beradi.
 */

/** Waiter (afitsant ilovasi, umumiy PIN) */
router
  .post("/waiter/login", waiterController.login)
  .get("/waiter/tables", waiterController.verifyWaiter, waiterController.getTables)
  .get(
    "/waiter/table/:id/orders",
    waiterController.verifyWaiter,
    waiterController.getTableOrders
  )
  .post(
    "/waiter/order/create",
    waiterController.verifyWaiter,
    waiterController.createOrder
  );

export default router;

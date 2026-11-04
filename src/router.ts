import { Router } from "express";
const router = Router();
import memberController from "./controllers/member.controller";
import productController from "./controllers/product.controller";
import makeUploader from "./libs/utils/uploader";
import orderController from "./controllers/order.controller";
import tableController from "./controllers/table.controller";
import waiterController from "./controllers/waiter.controller";

/** MEMBER */
router
  .get("/member/restaurant", memberController.getRestaurant)
  .post("/member/login", memberController.login)
  .post("/member/signup", memberController.signup)
  .post("/member/logout", memberController.logout)
  .get(
    "/member/detail",
    // memberController.verifyAuth,
    memberController.getMemberDetail
  )
  .post(
    "/member/update",
    memberController.verifyMember,
    makeUploader("members").single("memberImage"),
    memberController.updateMember
  )
  .get("/member/top-users", memberController.getTopUsers);

/** Product */
router
  .get("/product/all", productController.getProducts)
  .get(
    "/product/:id",
    memberController.retrieveAuth,
    productController.getProduct
  );

/** Order */
router
  .post(
    "/order/create",
    memberController.verifyAuth,
    orderController.createOrder
  )
  .get("/order/all", memberController.verifyAuth, orderController.getMyOrders)
  .post(
    "/order/update",
    memberController.verifyAuth,
    orderController.updateOrder
  );

/** Table (QR orqali mijoz buyurtmasi o'chirilgan — buyurtmani afitsant beradi) */
router
  .get(
    "/table/call/:id",
    tableController.verifyTable,
    tableController.clickTableCall
  )
  .post(
    "/table/logout",
    tableController.verifyTable,
    tableController.TableLogout
  );

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
